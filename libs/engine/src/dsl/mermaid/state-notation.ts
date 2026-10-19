/**
 * State-diagram NOTATION: what each Mermaid state construct LOOKS like.
 *
 * `MermaidState.ts` parses the text and builds the model; this module decides
 * how each element is drawn, so a reader sees what Mermaid draws:
 *
 *   start `[*] -->`     a solid dot in the diagram's INK (`shape.ink` — the
 *                       renderer paints it with the theme's text colour, so it
 *                       stays visible on a dark page; it was a fixed #0f172a)
 *   end `--> [*]`       a BULLSEYE, ring + dot (`final-node`); it was a hollow
 *                       circle — a start dot with its fill forgotten
 *   `<<fork>>/<<join>>` a solid ink BAR across the flow, no text (it was a
 *                       rounded box reading "fork_state")
 *   composite `{ }`     a container: its caption in the top band, its body
 *                       see-through (`labelPlacement: 'header'`) — it was an
 *                       opaque box with the name dead centre, under its own
 *                       children, hiding every line inside it
 *   region `--`         a see-through band with a dashed outline
 *   `note … of X`       a note box joined to X by a dashed line, no arrowhead
 *   `classDef` + `:::`  the class's paint, as for flowcharts
 *
 * PLACEMENT IS NOT DECIDED HERE. Sizes are (a bar is a bar, a note fits its
 * text); positions belong to the layout.
 */
import { NodeModel } from '../../models/NodeModel';
import type { DiagramModel } from '../../models/DiagramModel';
import type { ArrowStyle } from '../../types/model.types';
import type { MermaidStateModel, MermaidStateNode } from './MermaidState';

/** A fork/join bar: its length across the flow and its thickness along it. */
export const STATE_BAR_LENGTH = 70;
export const STATE_BAR_THICKNESS = 8;

/** Mermaid's note: pale yellow paper, olive edge, dark ink (on either theme). */
const NOTE_FILL = '#fff5ad';
const NOTE_STROKE = '#aaaa33';
const NOTE_INK = '#1f2937';
const NOTE_FONT = 14;
/** Widest line of note text before it wraps (Mermaid wraps notes too). */
const NOTE_TEXT_WIDTH = 190;
/** The share of a note shape's box its text may use (its inner rect). */
const NOTE_INNER = 0.84;
/** Rounding room, so an estimate a pixel short never costs a line. */
const NOTE_SLACK = 8;

/** The flow direction a state sits in: its nearest composite's, else the diagram's. */
export function stateFlowDirection(model: MermaidStateModel, state: MermaidStateNode): string {
  const byId = new Map(model.states.map((s) => [s.id, s]));
  let parent = state.parent ? byId.get(state.parent) : undefined;
  while (parent) {
    if (parent.direction) return parent.direction;
    parent = parent.parent ? byId.get(parent.parent) : undefined;
  }
  return model.direction ?? 'TB';
}

/**
 * Give one state's node its LOOK: kind, shape, size where the notation fixes
 * it, and the caption rules. Called once per state, after the node exists.
 */
export function applyStateNodeLook(
  node: NodeModel,
  state: MermaidStateNode,
  options: { direction: string; headerHeight: number }
): void {
  node.setMetadata('stateKind', state.kind);
  switch (state.kind) {
    case 'start':
      node.setMetadata('dslShape', 'circle');
      node.setMetadata('shape', { type: 'circle', cornerRadius: 0, ink: true });
      return;
    case 'end':
      node.setMetadata('dslShape', 'circle');
      // Ring + dot, painted from the fill alone (see the renderer's final-node).
      node.setMetadata('shape', { type: 'final-node', cornerRadius: 0, ink: true });
      return;
    case 'history':
    case 'deep-history':
      node.setMetadata('dslShape', 'circle');
      node.setMetadata('shape', { type: 'circle', cornerRadius: 0 });
      return;
    case 'fork':
    case 'join': {
      // A bar ACROSS the flow: horizontal in a top-down diagram, upright in LR.
      const across = options.direction === 'LR' || options.direction === 'RL';
      node.setSize(across ? STATE_BAR_THICKNESS : STATE_BAR_LENGTH, across ? STATE_BAR_LENGTH : STATE_BAR_THICKNESS);
      // The id is a NAME for the bar, not a caption on it (it still names the
      // node in the model and on export).
      node.setLabel('');
      node.setMetadata('dslShape', 'rectangle');
      node.setMetadata('shape', { type: 'rect', cornerRadius: 2, ink: true });
      return;
    }
    case 'choice':
      node.setMetadata('dslShape', 'rhombus');
      node.setMetadata('shape', { type: 'diamond', cornerRadius: 0 });
      return;
    default:
      break;
  }

  if (state.region) {
    // One orthogonal region of a concurrent composite: a see-through band. An
    // opaque body here covered every line inside the region (links paint under
    // nodes); the dashed outline is what divides the regions.
    node.setMetadata('dslShape', 'rectangle');
    node.setMetadata('shape', { type: 'rect', cornerRadius: 0, fill: 'none' });
    node.style.strokeDasharray = '6 4';
    node.style.shadow = false;
    return;
  }

  node.setMetadata('dslShape', 'rounded-rectangle');
  node.setMetadata('shape', { type: 'rect', cornerRadius: 8 });
  if (state.composite) {
    // A container: the name in a caption band across its top, the body
    // see-through so the transitions inside it stay visible.
    node.setMetadata('labelPlacement', 'header');
    node.setMetadata('headerHeight', options.headerHeight);
  }
}

/**
 * Composite groups are CONTAINMENT only: the composite's node already draws the
 * frame and its caption, so a painted group frame would be a second frame with a
 * second caption.
 */
export function markCompositeGroup(diagram: DiagramModel, groupId: string): void {
  diagram.getGroup(groupId)?.setMetadata('frameChrome', 'none');
}

// ── Notes ───────────────────────────────────────────────────────────────────

/**
 * A note's box: wrap at NOTE_MAX_WIDTH, then grow downwards.
 *
 * The renderer draws a note's text inside the note shape's INNER box — 84% of
 * each side (the folded corner) — at the theme's 14 px, measured at 0.6 em a
 * glyph. The box is sized so that inner box holds the wrapped text whole: a
 * note sized to the bare text width wrapped one word early and lost its last
 * line to an ellipsis.
 */
function noteSize(text: string): { width: number; height: number } {
  const charW = NOTE_FONT * 0.6;
  const words = text.split(/\s+/).filter(Boolean);
  const longest = Math.max(0, ...words.map((w) => w.length)) * charW;
  const natural = text.length * charW;
  const inner = Math.max(longest, Math.min(NOTE_TEXT_WIDTH, Math.max(natural, 60)));
  // Greedy wrap at that width, as the label engine wraps.
  let lines = 1;
  let line = 0;
  for (const word of words) {
    const w = word.length * charW;
    const next = line === 0 ? w : line + charW + w;
    if (next > inner && line > 0) {
      lines++;
      line = w;
    } else {
      line = next;
    }
  }
  return {
    width: Math.ceil(inner / NOTE_INNER) + NOTE_SLACK,
    height: Math.max(30, Math.ceil((lines * NOTE_FONT * 1.2) / NOTE_INNER) + NOTE_SLACK),
  };
}

/**
 * One note node per `note … of X`, joined to X by a dashed, arrowless line.
 *
 * The note node carries `stateNote: true`, `noteTarget` and `notePosition`; the
 * line carries `noteLink: true`. Neither is a state or a transition — export
 * skips them (`stateModelFromDiagram`) and writes the note from
 * `metadata.stateNotes`. Positions are the layout's to decide.
 */
export function addStateNotes(diagram: DiagramModel, model: MermaidStateModel, nodes: Map<string, NodeModel>): void {
  model.notes.forEach((note, i) => {
    const target = nodes.get(note.target);
    if (!target) return;
    const node = new NodeModel({
      id: `__note${i + 1}__`,
      type: 'state:note',
      position: { x: 0, y: 0 },
      size: noteSize(note.text),
    });
    node.setLabel(note.text);
    node.setMetadata('stateNote', true);
    node.setMetadata('noteTarget', note.target);
    node.setMetadata('notePosition', note.position);
    node.setMetadata('dslShape', 'note');
    node.setMetadata('shape', { type: 'note', fill: NOTE_FILL, stroke: NOTE_STROKE });
    // Dark ink on pale paper under EITHER theme — the theme's ink is light on a
    // dark page and would vanish on yellow.
    node.style.color = NOTE_INK;
    node.style.shadow = false;
    diagram.addNode(node);

    const link = diagram.createSmartLink(node, target, 'direct');
    if (!link) return;
    link.setMetadata('noteLink', true);
    link.style.strokeDasharray = '4 4';
    link.style.arrowHead = { type: 'none' } as ArrowStyle;
  });
}

// ── classDef ────────────────────────────────────────────────────────────────

/** `classDef name fill:#f00,stroke-width:2px;` → its declarations. */
const CLASSDEF_RE = /^classDef\s+([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)\s+(.+?);?$/;
/** `class a, b name` → which states take which class. */
const CLASS_RE = /^class\s+(.+?)\s+([A-Za-z0-9_-]+);?$/;

export type StateClassDefs = Record<string, Record<string, string>>;

function parseDeclarations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[,;]/)) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/**
 * Read the `classDef` and `class` statements of a state body. `class a, b name`
 * sets `cssClass` on those states (the `:::name` hook is already read by the
 * parser). Returns `{ classDefs }` when there are any, for the model.
 */
export function readStateClassDefs(
  lines: ReadonlyArray<{ text: string }>,
  states: Map<string, MermaidStateNode>
): { classDefs?: StateClassDefs } {
  const classDefs: StateClassDefs = {};
  for (const { text } of lines) {
    const def = text.match(CLASSDEF_RE);
    if (def) {
      const decls = parseDeclarations(def[2]);
      for (const name of def[1].split(',').map((s) => s.trim())) classDefs[name] = { ...(classDefs[name] ?? {}), ...decls };
      continue;
    }
    const cls = text.match(CLASS_RE);
    if (cls) {
      for (const id of cls[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const state = states.get(id);
        if (state) state.cssClass = cls[2];
      }
    }
  }
  return Object.keys(classDefs).length > 0 ? { classDefs } : {};
}

/**
 * Paint a state with its class — the same properties, onto the same places, as
 * a flowchart `classDef` (node.style for the cascade and the generator, and the
 * shape config's paints).
 */
export function applyStateClass(node: NodeModel, decls: Record<string, string> | undefined): void {
  if (!decls) return;
  const num = (v: string | undefined) => (v === undefined ? undefined : Number.parseFloat(v));
  const fill = decls['fill'];
  const stroke = decls['stroke'];
  const strokeWidth = num(decls['stroke-width']);
  if (fill) node.style.fill = fill;
  if (stroke) node.style.stroke = stroke;
  if (strokeWidth !== undefined && Number.isFinite(strokeWidth)) node.style.strokeWidth = strokeWidth;
  if (decls['color']) node.style.color = decls['color'];
  if (decls['stroke-dasharray']) node.style.strokeDasharray = decls['stroke-dasharray'];
  if (decls['font-weight']) node.style.fontWeight = decls['font-weight'];
  const fontSize = num(decls['font-size']);
  if (fontSize !== undefined && Number.isFinite(fontSize)) node.style.fontSize = fontSize;
  if (decls['font-family']) node.style.fontFamily = decls['font-family'];

  const shape = { ...((node.getMetadata('shape') as Record<string, unknown> | undefined) ?? {}) };
  if (fill) shape['fill'] = fill;
  if (stroke) shape['stroke'] = stroke;
  if (strokeWidth !== undefined && Number.isFinite(strokeWidth)) shape['strokeWidth'] = strokeWidth;
  node.setMetadata('shape', shape);
  node.setMetadata('dslStyled', true);
}
