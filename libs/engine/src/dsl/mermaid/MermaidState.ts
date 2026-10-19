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
import { LinkModel } from '../../models/LinkModel';
import { GroupModel } from '../../models/GroupModel';
import { significantLines, unquote } from './lines';
import { type RankEdge } from './layout';
import {
  applyImportRoute,
  estimateLabelWidth,
  fitNodeToLabel,
  IMPORT_EDGE_FONT,
  IMPORT_EDGE_PAD,
  layoutForImport,
  repointLinkEnd,
  type ImportRoute,
} from './import-layout';
import { ensureSideAnchorPort } from '../../ports/side-anchor';
import {
  addStateNotes,
  applyStateClass,
  applyStateNodeLook,
  markCompositeGroup,
  readStateClassDefs,
  stateFlowDirection,
  type StateClassDefs,
} from './state-notation';

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
   * The `:::cssClass` style hook (or a `class a, b name` statement), captured by
   * NAME and painted from the model's `classDefs` on import. Not re-emitted on
   * export (state-level styling export is still an open gap). It has to be parsed:
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
  /**
   * The lines the parser could not read and SKIPPED, each naming its line
   * (`Line 2: …`). The parse is still best effort — the readable lines are in the
   * model — but a skipped line must be REPORTED: dropped in silence, a fence of
   * `Draft --> Release for Approval` lines loaded as an empty diagram, no error.
   */
  errors?: string[];
  /** `classDef name decls` — the paint a `:::name` / `class … name` state takes. */
  classDefs?: StateClassDefs;
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
/**
 * Valid Mermaid state statements we read but do not model: styling
 * (`classDef` / `class` / `style` — state styling is an open gap), `click`,
 * `scale … width`, `hide empty description`, and the floating note
 * `note "text" as N1`. Skipping these is not a loss of the diagram's meaning, so
 * they are NOT errors — everything else the parser cannot read is.
 */
const KNOWN_UNMODELLED_RE =
  /^(?:(?:classDef|class|style|click)\s|scale\s+\d+\s+width$|hide empty description$|note\s+"[^"]*"\s+as\s+\S+$)/;

/** `Release for Approval` → `ReleaseForApproval`: an id to suggest for a spaced name. */
function suggestId(name: string): string {
  const id = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9_\u00c0-\uffff]/g, ''))
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
  return /^[A-Za-z_\u00c0-\uffff]/.test(id) ? id : `S${id}`;
}

/**
 * Why a line the grammar did not match was skipped. Mermaid ids cannot contain
 * spaces: Mermaid itself reads `Release for Approval` as three states and draws
 * garbage, so the honest answer is an error that says how to write it.
 */
function skippedLineError(text: string, line: number): string {
  const endpoint = (raw: string): string => raw.replace(/:::[A-Za-z0-9_-]+$/, '').trim();
  let names: string[] = [];
  const arrow = text.indexOf('-->');
  if (arrow > 0) {
    // A transition: `<from> --> <to> [: label]`.
    const from = endpoint(text.slice(0, arrow));
    const rest = text.slice(arrow + 3);
    const colon = rest.indexOf(':');
    const to = endpoint(colon >= 0 ? rest.slice(0, colon) : rest);
    names = [from, to];
  } else if (!/^(?:state|note|direction)\b/.test(text)) {
    // A description (`<id> : text`) or a state on its own line.
    const colon = text.indexOf(':');
    names = [endpoint(colon >= 0 ? text.slice(0, colon) : text)];
  }
  const spaced = names.filter((n) => /\s/.test(n) && !/["\[\]{}<>]/.test(n));
  if (spaced.length > 0) {
    const fixes = spaced.map((n) => `state "${n}" as ${suggestId(n)}`).join(' and ');
    return (
      `Line ${line}: a state id cannot contain spaces — write ${fixes}, ` +
      `then use the short id in the transition`
    );
  }
  return `Line ${line}: "${text}" is not a state, a transition or a directive — the line was skipped`;
}

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
  const lines = significantLines(text, ['stateDiagram', 'stateDiagram-v2'])
    // `;` ends a statement in Mermaid's state grammar (`A --> B;`), and `#` opens
    // a comment there (`# draft states`).
    .map((l) => ({ ...l, text: l.text.replace(/\s*;+$/, '') }))
    .filter((l) => l.text !== '' && !l.text.startsWith('#'));
  const states = new Map<string, MermaidStateNode>();
  const transitions: MermaidStateTransition[] = [];
  const notes: MermaidStateModel['notes'] = [];
  const errors: string[] = [];
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
    // classDef / class / style / … : valid, read, not modelled — never nodified.
    if (KNOWN_UNMODELLED_RE.test(line)) continue;
    // Anything else is skipped too, never nodified — and REPORTED, naming its line.
    errors.push(skippedLineError(line, lines[i].line));
  }

  // `classDef` / `class` statements: read after the body, so a class may be
  // defined after the states that use it (Mermaid allows either order).
  const styling = readStateClassDefs(lines, states);
  return { states: [...states.values()], transitions, notes, ...(direction ? { direction } : {}), ...styling, errors };
}

// ── Model building ─────────────────────────────────────────────────────────

const PSEUDO_SIZE = 22;

// ── Flow layout (gap-analysis §3a "state by flow") ─────────────────────────
//
// Replaces the naive 4-up grid with three type-aware rules:
//   1. FLOW: within every body, states rank by transition flow — the start
//      pseudo-state has no incoming transition, so it leads its scope.
//   2. CONTAINMENT: a composite is SIZED to contain its laid-out children
//      (bottom-up measure, then top-down commit into world coordinates).
//   3. BANDING: a concurrent composite stacks its regions as horizontal
//      bands — each region's children live in their own band, which is what
//      draws the picture Mermaid divides with dashed lines. The un-banded
//      picture is the defect the gap analysis names.

const STATE_PAD = 18; // inner padding of a composite body
const STATE_HEADER = 22; // title strip of a (non-region) composite
const REGION_PAD = 14; // inner padding of one concurrent band
const BAND_GAP = 10; // gap between stacked bands
const RANK_GAP = 50;
const CROSS_GAP = 40;

interface ScopeArrangement {
  /** Local top-left per direct child, relative to the scope's CONTENT origin. */
  positions: Map<string, { x: number; y: number }>;
  /** Routes of the transitions between two direct children, by transition index (local). */
  routes: Map<number, ImportRoute>;
  /** Content extent (children bbox; no padding). */
  width: number;
  height: number;
}

/** Gap between a state and a note beside it. */
const NOTE_GAP = 24;

/**
 * A state with its notes, as one box: `left of` notes to its left, `right of`
 * ones to its right, `over` ones above — each centred on the state. Answers the
 * box's size and where each member sits inside it.
 */
function notedBox(
  state: NodeModel,
  notes: readonly NodeModel[]
): { size: { width: number; height: number }; at: Array<[NodeModel, { x: number; y: number }]> } {
  const side = (n: NodeModel): 'left' | 'right' | 'over' => {
    const where = String(n.getMetadata('notePosition') ?? 'right of');
    return where.startsWith('left') ? 'left' : where === 'over' ? 'over' : 'right';
  };
  const left = notes.filter((n) => side(n) === 'left');
  const right = notes.filter((n) => side(n) === 'right');
  const over = notes.filter((n) => side(n) === 'over');
  const rowW = (ns: readonly NodeModel[]) => ns.reduce((w, n) => w + n.size.width + NOTE_GAP, 0);
  const overH = over.reduce((h, n) => Math.max(h, n.size.height), 0);
  const overW = over.reduce((w, n) => w + n.size.width, 0) + Math.max(0, over.length - 1) * NOTE_GAP;
  const leftW = rowW(left);
  const rowH = Math.max(state.size.height, ...left.map((n) => n.size.height), ...right.map((n) => n.size.height));
  const midW = Math.max(state.size.width, overW);
  const width = leftW + midW + rowW(right);
  const top = over.length ? overH + NOTE_GAP : 0;
  const height = top + rowH;
  const at: Array<[NodeModel, { x: number; y: number }]> = [];
  const stateX = leftW + (midW - state.size.width) / 2;
  at.push([state, { x: stateX, y: top + (rowH - state.size.height) / 2 }]);
  let x = 0;
  for (const n of left) {
    at.push([n, { x, y: top + (rowH - n.size.height) / 2 }]);
    x += n.size.width + NOTE_GAP;
  }
  x = leftW + midW + NOTE_GAP;
  for (const n of right) {
    at.push([n, { x, y: top + (rowH - n.size.height) / 2 }]);
    x += n.size.width + NOTE_GAP;
  }
  x = leftW + (midW - overW) / 2;
  for (const n of over) {
    at.push([n, { x, y: overH - n.size.height }]);
    x += n.size.width + NOTE_GAP;
  }
  return { size: { width, height }, at };
}

/**
 * Lay every state out by flow, sizing composites to contain their children and
 * banding concurrent regions. Mutates the NodeModels' position/size in place.
 */
function layoutStateModel(
  model: MermaidStateModel,
  nodes: Map<string, NodeModel>,
  start: { x: number; y: number },
  notesOf: ReadonlyMap<string, NodeModel[]> = new Map()
): Array<{ index: number; route: ImportRoute; direction: string }> {
  const byId = new Map(model.states.map((s) => [s.id, s]));
  const childrenOf = (scope: string | undefined): MermaidStateNode[] =>
    model.states.filter((s) => (s.parent ?? undefined) === scope);

  /** The ancestor of `id` that is a DIRECT child of `scope` (else undefined). */
  const liftTo = (id: string, scope: string | undefined): string | undefined => {
    let current: string | undefined = id;
    while (current !== undefined) {
      const parent: string | undefined = byId.get(current)?.parent ?? undefined;
      if (parent === scope) return current;
      current = parent;
    }
    return undefined;
  };

  /**
   * Transitions, lifted into `scope` — the edges that place ITS children. One
   * that runs between two direct children carries its label (the layout makes
   * room for it, and it is routed here); one lifted from inside a composite
   * only pulls the composite into place (the renderer routes it).
   */
  const scopeEdges = (scope: string | undefined): Array<RankEdge & { key: string; label?: { w: number; h: number } }> => {
    const edges: Array<RankEdge & { key: string; label?: { w: number; h: number } }> = [];
    model.transitions.forEach((t, index) => {
      const from = liftTo(t.from, scope);
      const to = liftTo(t.to, scope);
      if (from === undefined || to === undefined || (from === to && t.from !== t.to)) return;
      const direct = from === t.from && to === t.to;
      edges.push({
        key: String(index),
        from,
        to,
        ...(direct && t.label
          ? { label: { w: estimateLabelWidth(t.label, IMPORT_EDGE_FONT) + 2 * IMPORT_EDGE_PAD, h: IMPORT_EDGE_FONT + 2 * IMPORT_EDGE_PAD } }
          : {}),
      });
    });
    return edges;
  };
  /** The direction a scope's children flow in. */
  const directionOf = (scope: string | undefined): string =>
    (scope !== undefined ? byId.get(scope)?.direction : undefined) ?? model.direction ?? 'TB';

  // Bottom-up: measured outer size per state (leaves read their NodeModel).
  const measured = new Map<string, { width: number; height: number }>();
  const arrangements = new Map<string, ScopeArrangement>(); // keyed by scope id ('' = root)

  const measure = (state: MermaidStateNode): { width: number; height: number } => {
    const cached = measured.get(state.id);
    if (cached) return cached;
    let size: { width: number; height: number };
    if (!state.composite) {
      // A state and its notes take ONE place in the layout (notedBox), so a
      // note always has room beside its state and never lands on anything else.
      size = notedBox(nodes.get(state.id)!, notesOf.get(state.id) ?? []).size;
    } else if (state.concurrent) {
      // BANDING: measure each region, give every band the width of the widest
      // (so the compartments align, as Mermaid draws them), stack them.
      const regions = childrenOf(state.id).filter((s) => s.region);
      const bands = regions.map((r) => measure(r));
      const bandWidth = Math.max(...bands.map((b) => b.width), 0);
      const stacked =
        bands.reduce((sum, b) => sum + b.height, 0) +
        Math.max(0, bands.length - 1) * BAND_GAP;
      size = {
        width: bandWidth + 2 * STATE_PAD,
        height: stacked + 2 * STATE_PAD + STATE_HEADER,
      };
    } else {
      const inner = arrange(state.id);
      const pad = state.region ? REGION_PAD : STATE_PAD;
      const header = state.region ? 0 : STATE_HEADER;
      size = {
        width: inner.width + 2 * pad,
        height: inner.height + 2 * pad + header,
      };
    }
    measured.set(state.id, size);
    return size;
  };

  /** Rank-place the direct children of `scope` in local coordinates. */
  const arrange = (scope: string | undefined): ScopeArrangement => {
    const key = scope ?? '';
    const cached = arrangements.get(key);
    if (cached) return cached;
    const children = childrenOf(scope);
    const placeable = children.map((child) => ({ id: child.id, size: measure(child) }));
    const edges = scopeEdges(scope);
    // Mermaid's layout (dagre), with each label a box between the ranks: see
    // import-layout.ts. Only transitions between two direct children are
    // routed at this level.
    const laid = layoutForImport(
      placeable.map((p) => ({ id: p.id, width: p.size.width, height: p.size.height })),
      edges,
      { direction: directionOf(scope), nodeSpacing: CROSS_GAP, rankSpacing: RANK_GAP }
    );
    const positions = laid.positions;
    const routes = new Map<number, ImportRoute>();
    for (const edge of edges) {
      const t = model.transitions[Number(edge.key)];
      const route = laid.routes.get(edge.key);
      if (route && t && edge.from === t.from && edge.to === t.to) routes.set(Number(edge.key), route);
    }
    let width = 0;
    let height = 0;
    for (const p of placeable) {
      const at = positions.get(p.id)!;
      width = Math.max(width, at.x + p.size.width);
      height = Math.max(height, at.y + p.size.height);
    }
    // The layout's own extent counts its routes and label boxes too.
    width = Math.max(width, laid.width);
    height = Math.max(height, laid.height);
    const arrangement: ScopeArrangement = { positions, routes, width, height };
    arrangements.set(key, arrangement);
    return arrangement;
  };

  // Where each scope's content origin landed in the world (for its routes).
  const origins = new Map<string, { x: number; y: number }>();

  // Top-down: convert local placements to world coordinates and commit.
  const commit = (state: MermaidStateNode, x: number, y: number): void => {
    const node = nodes.get(state.id)!;
    if (!state.composite) {
      const { at } = notedBox(node, notesOf.get(state.id) ?? []);
      for (const [placed, offset] of at) placed.setPosition(x + offset.x, y + offset.y);
      return;
    }
    node.setPosition(x, y);
    const size = measured.get(state.id)!;
    node.setSize(size.width, size.height);
    if (state.concurrent) {
      const regions = childrenOf(state.id).filter((s) => s.region);
      const bandWidth = size.width - 2 * STATE_PAD;
      let bandY = y + STATE_PAD + STATE_HEADER;
      for (const region of regions) {
        const band = measured.get(region.id)!;
        const regionNode = nodes.get(region.id)!;
        regionNode.setPosition(x + STATE_PAD, bandY);
        // Uniform width: every band spans the composite's content width.
        regionNode.setSize(bandWidth, band.height);
        const inner = arrangements.get(region.id) ?? arrange(region.id);
        origins.set(region.id, { x: x + STATE_PAD + REGION_PAD, y: bandY + REGION_PAD });
        for (const child of childrenOf(region.id)) {
          const local = inner.positions.get(child.id)!;
          commitChild(child, x + STATE_PAD + REGION_PAD + local.x, bandY + REGION_PAD + local.y);
        }
        bandY += band.height + BAND_GAP;
      }
    } else {
      const pad = state.region ? REGION_PAD : STATE_PAD;
      const header = state.region ? 0 : STATE_HEADER;
      const inner = arrangements.get(state.id) ?? arrange(state.id);
      origins.set(state.id, { x: x + pad, y: y + pad + header });
      for (const child of childrenOf(state.id)) {
        const local = inner.positions.get(child.id)!;
        commitChild(child, x + pad + local.x, y + pad + header + local.y);
      }
    }
  };
  const commitChild = commit; // alias for readability above

  // Every state's box holds all of its label (wrap, then taller; a long
  // one-word name widens its box rather than shrinking to a few pixels).
  for (const state of model.states) {
    if (state.composite || PSEUDO_KINDS.has(state.kind)) continue;
    const node = nodes.get(state.id);
    if (node) fitNodeToLabel(node);
  }

  const root = arrange(undefined);
  origins.set('', { x: start.x, y: start.y });
  for (const child of childrenOf(undefined)) {
    const local = root.positions.get(child.id)!;
    commit(child, start.x + local.x, start.y + local.y);
  }

  // The routes, in world coordinates, for the caller to hand to the links.
  const out: Array<{ index: number; route: ImportRoute; direction: string }> = [];
  for (const [key, arrangement] of arrangements) {
    const origin = origins.get(key);
    if (!origin) continue;
    const shift = (p: { x: number; y: number }) => ({ x: p.x + origin.x, y: p.y + origin.y });
    for (const [index, route] of arrangement.routes) {
      out.push({
        index,
        route: { points: route.points.map(shift), ...(route.label ? { label: shift(route.label) } : {}) },
        direction: directionOf(key === '' ? undefined : key),
      });
    }
  }
  return out;
}

export function stateModelToDiagram(model: MermaidStateModel): DiagramModel {
  const diagram = new DiagramModel('State Diagram');
  diagram.setMetadata('diagramType', 'stateDiagram-v2');
  if (model.direction) diagram.setMetadata('direction', model.direction);
  if (model.notes.length) diagram.setMetadata('stateNotes', model.notes);

  const nodes = new Map<string, NodeModel>();
  model.states.forEach((state) => {
    const isPseudo = PSEUDO_KINDS.has(state.kind);
    const node = new NodeModel({
      id: state.id,
      // A region is not a state the author wrote — give it its own type so a
      // renderer can draw it as a compartment rather than a rounded box.
      type: state.region ? 'state:region' : `state:${state.kind}`,
      // Placeholder — layoutStateModel below assigns the real geometry.
      position: { x: 0, y: 0 },
      size: isPseudo
        ? { width: PSEUDO_SIZE, height: PSEUDO_SIZE }
        : { width: 140, height: 56 },
    });
    node.setLabel(state.label);
    node.setMetadata('stateNode', state);
    // How it LOOKS — a start dot and a bullseye in the theme's ink, a fork/join
    // bar, a composite's caption band, a see-through region, the classDef paint.
    // See state-notation.ts.
    applyStateNodeLook(node, state, { direction: stateFlowDirection(model, state), headerHeight: STATE_HEADER });
    applyStateClass(node, state.cssClass ? model.classDefs?.[state.cssClass] : undefined);
    diagram.addNode(node);
    nodes.set(state.id, node);
  });

  // Flow layout BEFORE links exist, so createSmartLink below selects its ports
  // against the real geometry (a link wired to the placeholder grid keeps the
  // wrong sides). Composites are sized to contain their children; concurrent
  // regions band. See layoutStateModel.
  // Notes: a note node beside its state, joined by a dashed, arrowless line.
  // Made BEFORE the layout, which keeps each beside its state (notedBox).
  addStateNotes(diagram, model, nodes);
  const notesOf = new Map<string, NodeModel[]>();
  for (const node of diagram.getNodes()) {
    if (node.getMetadata('stateNote') !== true) continue;
    const target = String(node.getMetadata('noteTarget'));
    notesOf.set(target, [...(notesOf.get(target) ?? []), node]);
  }
  const routes = layoutStateModel(model, nodes, { x: 80, y: 60 }, notesOf);
  // Each note's line joins the two sides that face each other.
  for (const link of diagram.getLinks()) {
    if (link.getMetadata('noteLink') !== true) continue;
    const note = diagram.getNode(link.sourceNodeId ?? '');
    const state = diagram.getNode(link.targetNodeId ?? '');
    if (!note || !state) continue;
    const dx = note.position.x + note.size.width / 2 - (state.position.x + state.size.width / 2);
    const dy = note.position.y + note.size.height / 2 - (state.position.y + state.size.height / 2);
    const [noteSide, stateSide] =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? ['left', 'right'] : ['right', 'left']) : dy > 0 ? ['top', 'bottom'] : ['bottom', 'top'];
    const np = ensureSideAnchorPort(note, `${noteSide}@50%`);
    const sp = ensureSideAnchorPort(state, `${stateSide}@50%`);
    if (np) repointLinkEnd(diagram, link, 'source', note, np);
    if (sp) repointLinkEnd(diagram, link, 'target', state, sp);
    link.setPoints([]);
  }

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
    // Containment only: the composite's own node draws the frame and caption.
    markCompositeGroup(diagram, `group-${state.id}`);
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

  const linkOf = new Map<number, LinkModel>();
  model.transitions.forEach((transition, index) => {
    const source = nodes.get(transition.from);
    const target = nodes.get(transition.to);
    if (!source || !target) return;
    const link = reverseRoute(diagram, source, target) ?? diagram.createSmartLink(source, target, 'orthogonal');
    if (!link) return;
    if (transition.label) link.setLabel(transition.label);
    link.setMetadata('stateTransition', transition);
    linkOf.set(index, link);
  });

  // Each transition the layout routed takes its route — ports where it meets
  // its boxes, waypoints, its label where the layout made room — and draws as
  // Mermaid draws a transition: a curve.
  for (const { index, route, direction } of routes) {
    const link = linkOf.get(index);
    if (!link) continue;
    link.setPathType('smooth');
    applyImportRoute(link, diagram, route, direction);
  }

  return diagram;
}

/**
 * A transition whose REVERSE is already drawn (`Idle --> Running` then
 * `Running --> Idle`) would get the very same two ports from the smart picker —
 * both lines on one track, both labels printed over each other. Route it round
 * the side instead: if the pair runs vertically (bottom→top) the return leaves and
 * enters on the RIGHT; horizontally, underneath. Returns undefined when there is
 * no reverse to avoid (the caller then picks ports as usual).
 */
function reverseRoute(diagram: DiagramModel, source: NodeModel, target: NodeModel): LinkModel | undefined {
  const reverse = diagram
    .getLinks()
    .find((l) => l.sourceNodeId === target.id && l.targetNodeId === source.id);
  if (!reverse) return undefined;
  const sideOf = (portId: string) => diagram.getPortById(portId)?.side;
  const vertical = new Set([sideOf(reverse.sourcePortId), sideOf(reverse.targetPortId)]);
  const around = vertical.has('top') || vertical.has('bottom') ? 'right' : 'bottom';
  const sp = source.getPortBySide(around);
  const tp = target.getPortBySide(around);
  if (!sp || !tp || !sp.canConnectTo(tp)) return undefined;
  const link = new LinkModel(sp.id, tp.id, 'orthogonal');
  link.sourceNodeId = source.id;
  link.targetNodeId = target.id;
  sp.addConnection(link.id, 'source');
  tp.addConnection(link.id, 'target');
  link.generatePath(
    sp.getAbsolutePosition(source.getBoundingBox()),
    tp.getAbsolutePosition(target.getBoundingBox()),
    around,
    around
  );
  diagram.addLink(link);
  return link;
}

export function stateModelFromDiagram(diagram: DiagramModel): MermaidStateModel {
  const states: MermaidStateNode[] = [];
  for (const node of diagram.getNodes()) {
    // A note box is not a state: its text travels in `metadata.stateNotes`.
    if (node.getMetadata('stateNote') === true) continue;
    const stored = node.getMetadata('stateNode') as MermaidStateNode | undefined;
    states.push(
      stored
        ? { ...stored, id: node.id, label: (node.getLabel?.() as string) ?? stored.label }
        : { id: node.id, label: (node.getLabel?.() as string) ?? node.id, kind: 'state' }
    );
  }
  const transitions: MermaidStateTransition[] = [];
  for (const link of diagram.getLinks()) {
    // …and the dashed line to it is not a transition.
    if (link.getMetadata('noteLink') === true) continue;
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
