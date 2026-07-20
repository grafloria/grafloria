/**
 * Mermaid `stateDiagram` / `stateDiagram-v2` — parser, model builder and
 * generator (Phase 3, the third of the graph-family types).
 *
 * There was no parser at all before this: the header fell through to the
 * flowchart path and produced a node literally called `stateDiagram-v2`, which
 * Phase 0 then downgraded to an explicit "unsupported" signal. This is the
 * real thing.
 *
 * The one design decision worth recording is `[*]`. Mermaid writes BOTH the
 * start and the end pseudo-state with the same token, disambiguated only by
 * which side of the arrow it sits on — and it is scoped: a composite state has
 * its OWN start/end. So `[*]` becomes a generated pseudo-node per (scope,
 * role): `__start__` / `__end__` at the root, `Composite.__start__` inside.
 * Collapsing them into one node would silently merge a composite's entry with
 * the diagram's, which is a wrong diagram, not a lossy one.
 *
 * The second is CONCURRENCY. A `--` line inside a composite splits its body
 * into orthogonal regions that run at the same time. Ignoring the separator
 * merged them into one composite, which reads a concurrent machine as a
 * sequential one — and, because `[*]` is scoped, it also fused every region's
 * entry point into a single start node. Each region therefore becomes a
 * SYNTHETIC composite state of its own (`A.region1`, `A.region2`, …) that owns
 * that region's children, transitions and `[*]`. The regions are the composite's
 * children, so they nest as groups and the generator can put the `--` back.
 */
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { GroupModel } from '../../models/GroupModel';
import { significantLines, unquote } from './lines';

export type StateKind =
  | 'state' | 'start' | 'end' | 'choice' | 'fork' | 'join' | 'history' | 'deep-history';

/** Kinds written as a bracket token (`[*]`, `[H]`, `[H*]`), never as an id. */
const PSEUDO_KINDS: ReadonlySet<StateKind> = new Set<StateKind>([
  'start', 'end', 'history', 'deep-history',
]);

export interface MermaidStateNode {
  id: string;
  label: string;
  kind: StateKind;
  /** Composite parent id, when nested. For a region's children, the REGION id. */
  parent?: string;
  /** True when this state has its own `{ … }` body. */
  composite?: boolean;
  /** Composite whose body is split by `--` into concurrent regions. */
  concurrent?: boolean;
  /**
   * A synthetic orthogonal region of a `concurrent` composite. Not a state the
   * author wrote — it exists so each region owns its own children and `[*]`,
   * and it is re-emitted as a `--` separator, never as a nested state.
   */
  region?: boolean;
  /**
   * `direction` declared INSIDE this composite. Mermaid scopes it to the
   * composite; hoisting it onto the diagram re-exported it at top level and
   * silently re-oriented the WHOLE diagram.
   */
  direction?: string;
  /**
   * The `:::cssClass` style hook, captured by NAME. Not applied and not
   * re-emitted (state-level styling is an open gap), but it has to be parsed:
   * `[*] --> A:::hot` used to read as a state `A` LABELLED `::hot`, and export
   * then wrote `[*] --> A : ::hot` — a transition label the author never typed.
   */
  cssClass?: string;
}

export interface MermaidStateTransition {
  from: string;
  to: string;
  label?: string;
}

export interface MermaidStateModel {
  states: MermaidStateNode[];
  transitions: MermaidStateTransition[];
  direction?: string;
  notes: Array<{ position: string; target: string; text: string }>;
}

const ID = '[A-Za-z0-9_\\u00c0-\\uffff][A-Za-z0-9_\\-.\\u00c0-\\uffff]*';
/** Mermaid allows exactly ONE `:::cssClass` suffix on a state reference. */
const CSS = '(?::::[A-Za-z0-9_-]+)?';
const CSS_SPLIT_RE = new RegExp(`^(${ID}):::([A-Za-z0-9_-]+)$`);
const ENDPOINT = `(?:\\[\\*\\]|\\[H\\*?\\]|${ID}${CSS})`;
const TRANSITION_RE = new RegExp(`^(${ENDPOINT})\\s*-{2,}>\\s*(${ENDPOINT})\\s*(?::\\s*(.*))?$`);
// `state "long description" as s2`, optionally opening a composite body.
const STATE_AS_RE = new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})\\s*(\\{?)\\s*$`);
// `state name <<fork>>` / `state name {` / `state name` / `state name:::css`
const STATE_DECL_RE = new RegExp(
  `^state\\s+(${ID}${CSS})\\s*(?:<<(fork|join|choice)>>)?\\s*(\\{?)\\s*$`
);
// `s2 : description`. The `(?!::)` keeps `A:::hot` out — that is a STYLE hook,
// and reading it here made the state's label `::hot`.
const DESCRIPTION_RE = new RegExp(`^(${ID})\\s*:(?!::)\\s*(.*)$`);
/** A bare state reference on its own line, with or without its style hook. */
const BARE_STATE_RE = new RegExp(`^${ID}${CSS}$`);
const NOTE_RE = new RegExp(`^note\\s+(left of|right of|over)\\s+(${ID})\\s*(?::\\s*(.*))?$`);
const DIRECTION_RE = /^direction\s+(TB|BT|LR|RL|TD)$/i;
/**
 * The concurrency separator. Mermaid's lexer reads it as a repeated `--`, so
 * `--` and `----` are separators and `---` / `-----` are lexical ERRORS — hence
 * `(?:--)+` rather than `-{2,}`. (Confirmed against mermaid 11.16 directly.)
 */
const REGION_SEPARATOR_RE = /^(?:--)+$/;
const HISTORY_RE = /^\[H(\*)?\]$/;

/** Does the composite body opening at `lines[open]` contain a `--` at ITS depth? */
function hasConcurrentRegions(lines: { text: string }[], open: number): boolean {
  let depth = 0;
  for (let i = open + 1; i < lines.length; i++) {
    const text = lines[i].text;
    if (text === '}') {
      if (depth === 0) return false; // end of the composite we asked about
      depth--;
      continue;
    }
    if (depth === 0 && REGION_SEPARATOR_RE.test(text)) return true;
    const decl = text.match(STATE_DECL_RE);
    const as = text.match(STATE_AS_RE);
    if (decl?.[3] === '{' || as?.[3] === '{') depth++;
  }
  return false;
}

/**
 * Parse a state-diagram body. `stateDiagram` (v1) and `stateDiagram-v2` share
 * this grammar — v2 is a different LAYOUT engine in Mermaid, not a different
 * syntax, so refusing v1 would be arbitrary.
 */
export function parseMermaidState(text: string): MermaidStateModel {
  const lines = significantLines(text, ['stateDiagram', 'stateDiagram-v2']);
  const states = new Map<string, MermaidStateNode>();
  const transitions: MermaidStateTransition[] = [];
  const notes: MermaidStateModel['notes'] = [];
  let direction: string | undefined;

  const touch = (id: string, scope: string | undefined, kind: StateKind = 'state'): MermaidStateNode => {
    const existing = states.get(id);
    if (existing) {
      if (kind !== 'state' && existing.kind === 'state') existing.kind = kind;
      return existing;
    }
    const node: MermaidStateNode = { id, label: id, kind, ...(scope ? { parent: scope } : {}) };
    states.set(id, node);
    return node;
  };

  /**
   * A bracket token resolves to a pseudo-state scoped to the enclosing body.
   * `[*]`'s ROLE depends on which side of the arrow it sits on; `[H]`/`[H*]`
   * carry their own. Before this, `[H]` matched no endpoint rule, so the whole
   * transition line was dropped in silence.
   */
  const pseudo = (scope: string | undefined, role: StateKind): string => {
    const slug = role === 'deep-history' ? '__deep_history__' : `__${role}__`;
    const id = `${scope ? scope + '.' : ''}${slug}`;
    touch(id, scope, role).label = '';
    return id;
  };

  /** Touch a state written as `id` or `id:::cssClass`, keeping the hook. */
  const touchStyled = (raw: string, kind: StateKind = 'state'): MermaidStateNode => {
    const styled = raw.match(CSS_SPLIT_RE);
    const node = touch(styled ? styled[1] : raw, scope(), kind);
    if (styled) node.cssClass = styled[2];
    return node;
  };

  /** Resolve one side of a transition: bracket token or a real state id. */
  const endpoint = (raw: string, side: 'from' | 'to'): string => {
    if (raw === '[*]') return pseudo(scope(), side === 'from' ? 'start' : 'end');
    const history = raw.match(HISTORY_RE);
    if (history) return pseudo(scope(), history[1] ? 'deep-history' : 'history');
    return touchStyled(raw).id;
  };

  /**
   * Composite states nest, so the scope is a stack, popped on `}`. A frame for
   * a CONCURRENT composite also tracks which region is currently being filled —
   * that region, not the composite, is what its lines belong to.
   */
  interface Frame {
    id: string;
    concurrent: boolean;
    regions: number;
    region?: string;
  }
  const frames: Frame[] = [];
  const frame = (): Frame | undefined => frames[frames.length - 1];
  const scope = (): string | undefined => {
    const f = frame();
    return f ? (f.region ?? f.id) : undefined;
  };

  /** Start the next orthogonal region of a concurrent composite. */
  const openRegion = (f: Frame): void => {
    f.regions += 1;
    const id = `${f.id}.region${f.regions}`;
    const region = touch(id, f.id);
    region.label = '';
    region.composite = true;
    region.region = true;
    f.region = id;
  };

  /** Push a composite scope, pre-scanning its body for the `--` separator. */
  const openComposite = (node: MermaidStateNode, at: number): void => {
    node.composite = true;
    const f: Frame = { id: node.id, concurrent: hasConcurrentRegions(lines, at), regions: 0 };
    frames.push(f);
    if (f.concurrent) {
      node.concurrent = true;
      openRegion(f);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    if (line === '}') {
      frames.pop();
      continue;
    }

    if (REGION_SEPARATOR_RE.test(line)) {
      // Inside a concurrent composite this closes one region and opens the
      // next. At the top level Mermaid rejects it outright, so we skip it —
      // never let a run of dashes become a state.
      const f = frame();
      if (f?.concurrent) openRegion(f);
      continue;
    }

    const dir = line.match(DIRECTION_RE);
    if (dir) {
      // Scoped: `direction` inside a composite is the COMPOSITE's, not the
      // diagram's. Hoisting it re-oriented the whole diagram on export.
      const f = frame();
      const owner = f ? states.get(f.id) : undefined;
      if (owner) owner.direction = dir[1].toUpperCase();
      else direction = dir[1].toUpperCase();
      continue;
    }

    const note = line.match(NOTE_RE);
    if (note) {
      // Two spellings: `note right of A : text` (one line) and the BLOCK form,
      // `note right of A` … `end note`. The block body must be consumed here —
      // left to fall through, its prose lines match the bare-state rule and
      // become STATES (`note right of A / hello / end note` used to mint a
      // state called "hello"). That is precisely the Phase-0 garbage footgun.
      if (note[3] !== undefined) {
        notes.push({ position: note[1], target: note[2], text: note[3] });
        continue;
      }
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length && !/^end note$/.test(lines[j].text); j++) body.push(lines[j].text);
      notes.push({ position: note[1], target: note[2], text: body.join(' ') });
      i = j; // skip the `end note` line too
      continue;
    }
    if (/^end note$/.test(line)) continue;

    const transition = line.match(TRANSITION_RE);
    if (transition) {
      const [, rawFrom, rawTo, label] = transition;
      const from = endpoint(rawFrom, 'from');
      const to = endpoint(rawTo, 'to');
      transitions.push({ from, to, ...(label && label.trim() ? { label: unquote(label.trim()) } : {}) });
      continue;
    }

    const stateAs = line.match(STATE_AS_RE);
    if (stateAs) {
      // `state "desc" as X {` is valid Mermaid and used to match NOTHING: the
      // composite was lost, its children leaked into the enclosing scope, and
      // the orphaned `}` popped a scope it never pushed.
      const node = touch(stateAs[2], scope());
      node.label = stateAs[1];
      if (stateAs[3] === '{') openComposite(node, i);
      continue;
    }

    const decl = line.match(STATE_DECL_RE);
    if (decl) {
      const [, id, pseudoKind, brace] = decl;
      const node = touchStyled(id, (pseudoKind as StateKind) ?? 'state');
      if (brace === '{') openComposite(node, i);
      continue;
    }

    const description = line.match(DESCRIPTION_RE);
    if (description) {
      touch(description[1], scope()).label = description[2].trim();
      continue;
    }

    if (BARE_STATE_RE.test(line)) {
      touchStyled(line);
      continue;
    }
    // classDef / class / style / anything newer: ignored, never nodified.
  }

  return { states: [...states.values()], transitions, notes, ...(direction ? { direction } : {}) };
}

// ── Model building ─────────────────────────────────────────────────────────

const PSEUDO_SIZE = 22;

export function stateModelToDiagram(model: MermaidStateModel): DiagramModel {
  const diagram = new DiagramModel('State Diagram');
  diagram.setMetadata('diagramType', 'stateDiagram-v2');
  if (model.direction) diagram.setMetadata('direction', model.direction);
  if (model.notes.length) diagram.setMetadata('stateNotes', model.notes);

  const nodes = new Map<string, NodeModel>();
  model.states.forEach((state, i) => {
    const isPseudo = PSEUDO_KINDS.has(state.kind);
    const node = new NodeModel({
      id: state.id,
      // A region is not a state the author wrote — give it its own type so a
      // renderer can draw it as a compartment rather than a rounded box.
      type: state.region ? 'state:region' : `state:${state.kind}`,
      position: { x: 80 + (i % 4) * 220, y: 60 + Math.floor(i / 4) * 160 },
      size: isPseudo
        ? { width: PSEUDO_SIZE, height: PSEUDO_SIZE }
        : { width: 140, height: 56 },
    });
    node.setLabel(state.label);
    node.setMetadata('stateNode', state);
    // Start/end/history are circles; a choice is a diamond; the rest are the
    // familiar rounded state boxes.
    const shape =
      isPseudo ? 'circle' : state.kind === 'choice' ? 'rhombus' : 'rounded-rectangle';
    node.setMetadata('dslShape', shape);
    node.setMetadata('shape', {
      type: isPseudo ? 'circle' : state.kind === 'choice' ? 'diamond' : 'rect',
      cornerRadius: isPseudo || state.kind === 'choice' ? 0 : 8,
      ...(state.kind === 'start' ? { fill: '#0f172a' } : {}),
    });
    diagram.addNode(node);
    nodes.set(state.id, node);
  });

  // Composite states become groups whose members are their scoped children.
  // Every group is created BEFORE membership is wired, because a nested
  // composite is added to its parent by GROUP id and must already exist.
  for (const state of model.states) {
    if (!state.composite) continue;
    // A region has no name of its own — Mermaid draws it as an unlabelled
    // compartment divided by a dashed line, not as a titled box.
    diagram.addGroup(
      new GroupModel({ id: `group-${state.id}`, name: state.region ? '' : state.label || state.id })
    );
  }
  for (const state of model.states) {
    if (!state.composite) continue;
    const group = diagram.getGroup(`group-${state.id}`);
    if (!group) continue;
    for (const child of model.states) {
      if (child.parent !== state.id) continue;
      // Nested composite → nest the GROUPS too, so the containment tree is
      // real. Concurrent regions depend on this: `group-A` must own
      // `group-A.region1` and `group-A.region2` or they float free.
      if (child.composite && diagram.getGroup(`group-${child.id}`)) {
        group.addMember(`group-${child.id}`, diagram);
      }
      if (diagram.getNode(child.id)) group.addMember(child.id, diagram);
    }
  }

  for (const transition of model.transitions) {
    const source = nodes.get(transition.from);
    const target = nodes.get(transition.to);
    if (!source || !target) continue;
    const link = diagram.createSmartLink(source, target, 'orthogonal');
    if (!link) continue;
    if (transition.label) link.setLabel(transition.label);
    link.setMetadata('stateTransition', transition);
  }

  return diagram;
}

export function stateModelFromDiagram(diagram: DiagramModel): MermaidStateModel {
  const states: MermaidStateNode[] = [];
  for (const node of diagram.getNodes()) {
    const stored = node.getMetadata('stateNode') as MermaidStateNode | undefined;
    states.push(
      stored
        ? { ...stored, id: node.id, label: (node.getLabel?.() as string) ?? stored.label }
        : { id: node.id, label: (node.getLabel?.() as string) ?? node.id, kind: 'state' }
    );
  }
  const transitions: MermaidStateTransition[] = [];
  for (const link of diagram.getLinks()) {
    const from = link.sourceNodeId;
    const to = link.targetNodeId;
    if (!from || !to) continue;
    const label = link.getMetadata('label') as string | undefined;
    transitions.push({ from, to, ...(label ? { label } : {}) });
  }
  const direction = diagram.getMetadata('direction') as string | undefined;
  const notes = (diagram.getMetadata('stateNotes') as MermaidStateModel['notes']) ?? [];
  return { states, transitions, notes, ...(direction ? { direction } : {}) };
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Emit a valid `stateDiagram-v2` body. The scoped pseudo-states are collapsed
 * back to `[*]`, which is the only spelling Mermaid accepts — writing
 * `__start__` would export a body that renders as a real state called
 * "__start__", i.e. a different diagram.
 */
export function generateMermaidState(model: MermaidStateModel): string {
  const byId = new Map(model.states.map((s) => [s.id, s]));
  /** Bracket tokens are the ONLY spelling Mermaid accepts for these. */
  const ref = (id: string): string => {
    switch (byId.get(id)?.kind) {
      case 'start':
      case 'end': return '[*]';
      case 'history': return '[H]';
      case 'deep-history': return '[H*]';
      default: return id;
    }
  };

  const lines = ['stateDiagram-v2'];
  if (model.direction) lines.push(`    direction ${model.direction}`);

  const children = (parent: string | undefined): MermaidStateNode[] =>
    model.states.filter((s) => (s.parent ?? undefined) === parent);

  // A transition belongs to exactly ONE body: the one that owns BOTH its ends.
  // Matching on EITHER end (the previous rule) put a transition that crosses
  // two composites into both of them — a duplicate edge on re-import — while
  // one that crossed a composite boundary at the root was claimed by the
  // composite and then skipped there, so it was written twice or not at all.
  // Anything spanning two bodies belongs at the root, which Mermaid accepts and
  // which is the only place that does not visually adopt the far state.
  const emitted = new Set<MermaidStateTransition>();
  const emitTransitions = (owner: string, indent: string): void => {
    for (const t of model.transitions) {
      if (emitted.has(t)) continue;
      if (byId.get(t.from)?.parent !== owner || byId.get(t.to)?.parent !== owner) continue;
      emitted.add(t);
      lines.push(`${indent}${ref(t.from)} --> ${ref(t.to)}${t.label ? ` : ${t.label}` : ''}`);
    }
  };

  /** The children + transitions of one body (a composite, or one region of one). */
  const emitBody = (owner: MermaidStateNode, indent: string): void => {
    for (const child of children(owner.id)) emitState(child, indent);
    emitTransitions(owner.id, indent);
  };

  const emitState = (state: MermaidStateNode, indent: string): void => {
    if (PSEUDO_KINDS.has(state.kind)) return; // written as [*] / [H] / [H*]
    if (state.kind !== 'state') {
      lines.push(`${indent}state ${state.id} <<${state.kind}>>`);
      return;
    }
    if (state.composite) {
      const head =
        state.label && state.label !== state.id
          ? `state "${state.label}" as ${state.id}`
          : `state ${state.id}`;
      lines.push(`${indent}${head} {`);
      if (state.direction) lines.push(`${indent}    direction ${state.direction}`);
      if (state.concurrent) {
        // The regions are synthetic: they are NOT emitted as nested states,
        // they are emitted as bodies separated by `--`. Writing them out as
        // `state A.region1 { … }` would export a sequential machine.
        const regions = children(state.id).filter((s) => s.region);
        regions.forEach((region, index) => {
          if (index > 0) lines.push(`${indent}    --`);
          emitBody(region, indent + '    ');
        });
      } else {
        emitBody(state, indent + '    ');
      }
      lines.push(`${indent}}`);
      return;
    }
    if (state.label && state.label !== state.id) {
      lines.push(`${indent}state "${state.label}" as ${state.id}`);
      return;
    }
    // An isolated state has no transition line to declare it — say it outright,
    // or it disappears from the exported body.
    const referenced = model.transitions.some((t) => t.from === state.id || t.to === state.id);
    if (!referenced) lines.push(`${indent}state ${state.id}`);
  };

  for (const state of children(undefined)) emitState(state, '    ');

  for (const t of model.transitions) {
    if (emitted.has(t)) continue;
    emitted.add(t);
    lines.push(`    ${ref(t.from)} --> ${ref(t.to)}${t.label ? ` : ${t.label}` : ''}`);
  }

  for (const note of model.notes) {
    lines.push(`    note ${note.position} ${note.target} : ${note.text}`);
  }
  return lines.join('\n') + '\n';
}

export function generateStateFromDiagram(diagram: DiagramModel): string {
  return generateMermaidState(stateModelFromDiagram(diagram));
}
