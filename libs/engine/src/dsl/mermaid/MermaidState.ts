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
 */
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { GroupModel } from '../../models/GroupModel';
import { significantLines, unquote } from './lines';

export type StateKind = 'state' | 'start' | 'end' | 'choice' | 'fork' | 'join';

export interface MermaidStateNode {
  id: string;
  label: string;
  kind: StateKind;
  /** Composite parent id, when nested. */
  parent?: string;
  /** True when this state has its own `{ … }` body. */
  composite?: boolean;
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
const ENDPOINT = `(?:\\[\\*\\]|${ID})`;
const TRANSITION_RE = new RegExp(`^(${ENDPOINT})\\s*-{2,}>\\s*(${ENDPOINT})\\s*(?::\\s*(.*))?$`);
// `state "long description" as s2`
const STATE_AS_RE = new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})\\s*$`);
// `state name <<fork>>` / `state name {` / `state name`
const STATE_DECL_RE = new RegExp(`^state\\s+(${ID})\\s*(?:<<(fork|join|choice)>>)?\\s*(\\{?)\\s*$`);
// `s2 : description`
const DESCRIPTION_RE = new RegExp(`^(${ID})\\s*:\\s*(.*)$`);
const NOTE_RE = new RegExp(`^note\\s+(left of|right of|over)\\s+(${ID})\\s*(?::\\s*(.*))?$`);

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

  /** `[*]` resolves to a scoped pseudo-state whose ROLE depends on the side. */
  const pseudo = (scope: string | undefined, role: 'start' | 'end'): string => {
    const id = `${scope ? scope + '.' : ''}__${role}__`;
    touch(id, scope, role).label = '';
    return id;
  };

  // Composite states nest, so the scope is a stack, popped on `}`.
  const scopes: string[] = [];
  const scope = (): string | undefined => scopes[scopes.length - 1];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    if (line === '}') {
      scopes.pop();
      continue;
    }

    const dir = line.match(/^direction\s+(TB|BT|LR|RL|TD)$/i);
    if (dir) {
      direction = dir[1].toUpperCase();
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
      const from = rawFrom === '[*]' ? pseudo(scope(), 'start') : touch(rawFrom, scope()).id;
      const to = rawTo === '[*]' ? pseudo(scope(), 'end') : touch(rawTo, scope()).id;
      transitions.push({ from, to, ...(label && label.trim() ? { label: unquote(label.trim()) } : {}) });
      continue;
    }

    const stateAs = line.match(STATE_AS_RE);
    if (stateAs) {
      touch(stateAs[2], scope()).label = stateAs[1];
      continue;
    }

    const decl = line.match(STATE_DECL_RE);
    if (decl) {
      const [, id, pseudoKind, brace] = decl;
      const node = touch(id, scope(), (pseudoKind as StateKind) ?? 'state');
      if (brace === '{') {
        node.composite = true;
        scopes.push(id);
      }
      continue;
    }

    const description = line.match(DESCRIPTION_RE);
    if (description) {
      touch(description[1], scope()).label = description[2].trim();
      continue;
    }

    if (new RegExp(`^${ID}$`).test(line)) {
      touch(line, scope());
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
    const isPseudo = state.kind === 'start' || state.kind === 'end';
    const node = new NodeModel({
      id: state.id,
      type: `state:${state.kind}`,
      position: { x: 80 + (i % 4) * 220, y: 60 + Math.floor(i / 4) * 160 },
      size: isPseudo
        ? { width: PSEUDO_SIZE, height: PSEUDO_SIZE }
        : { width: 140, height: 56 },
    });
    node.setLabel(state.label);
    node.setMetadata('stateNode', state);
    // Start/end are filled circles; a choice is a diamond; the rest are the
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
  for (const state of model.states) {
    if (!state.composite) continue;
    const group = new GroupModel({ id: `group-${state.id}`, name: state.label || state.id });
    diagram.addGroup(group);
    for (const child of model.states) {
      if (child.parent === state.id && diagram.getNode(child.id)) group.addMember(child.id, diagram);
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
  const isPseudo = (id: string): boolean => {
    const kind = byId.get(id)?.kind;
    return kind === 'start' || kind === 'end';
  };
  const ref = (id: string): string => (isPseudo(id) ? '[*]' : id);

  const lines = ['stateDiagram-v2'];
  if (model.direction) lines.push(`    direction ${model.direction}`);

  const children = (parent: string | undefined): MermaidStateNode[] =>
    model.states.filter((s) => (s.parent ?? undefined) === parent);

  const emitState = (state: MermaidStateNode, indent: string): void => {
    if (state.kind === 'start' || state.kind === 'end') return; // written as [*]
    if (state.kind !== 'state') {
      lines.push(`${indent}state ${state.id} <<${state.kind}>>`);
      return;
    }
    if (state.composite) {
      lines.push(`${indent}state ${state.id} {`);
      for (const child of children(state.id)) emitState(child, indent + '    ');
      for (const t of model.transitions) {
        if (byId.get(t.from)?.parent === state.id || byId.get(t.to)?.parent === state.id) {
          const label = t.label ? ` : ${t.label}` : '';
          lines.push(`${indent}    ${ref(t.from)} --> ${ref(t.to)}${label}`);
        }
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
    // Transitions already emitted inside a composite body are not repeated.
    const inComposite =
      byId.get(t.from)?.parent !== undefined || byId.get(t.to)?.parent !== undefined;
    if (inComposite) continue;
    const label = t.label ? ` : ${t.label}` : '';
    lines.push(`    ${ref(t.from)} --> ${ref(t.to)}${label}`);
  }

  for (const note of model.notes) {
    lines.push(`    note ${note.position} ${note.target} : ${note.text}`);
  }
  return lines.join('\n') + '\n';
}

export function generateStateFromDiagram(diagram: DiagramModel): string {
  return generateMermaidState(stateModelFromDiagram(diagram));
}
