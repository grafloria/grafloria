// Wave 7 (Auto-layout) — Card 7a: the bridge from the REAL model to the layout layer.
//
// ---------------------------------------------------------------------------
// THE BUG THIS FILE CLOSES
// ---------------------------------------------------------------------------
//
// `PortAwareLayoutManager` (port-aware-layout.interface.ts) is a real implementation
// — it assigns sides, orders ports, computes positions. But it takes `PortInfo[]`
// as an ARGUMENT, and NOTHING in the codebase ever built one. The only caller is
// the ELK/dagre adapters, behind `options.portAware.ports` — a field a caller had
// to hand-author. So "port-aware layout" was reachable only by a caller who
// already knew every port's id, node, side and direction... i.e. never. Wave 6 made
// ports first-class on the model (`node.getPorts()`, `port.side`, `port.type`) and
// the layout layer never learned about it.
//
// Same shape for labels: `LinkModel.labels` carries text + style, and the layout
// engines were told nothing about them, so every layout packed nodes as if edges
// were bare lines. The renderer's edge optimizer then had to place a label into a
// gap that layout never reserved — it does collision-aware PLACEMENT, but it
// cannot create space that does not exist. Reserving that space is a LAYOUT job,
// and this is where the sizes come from.
//
// ---------------------------------------------------------------------------
// THE ONE SUBTLETY THAT MAKES OR BREAKS PORT-AWARE LAYOUT
// ---------------------------------------------------------------------------
//
// Every NodeModel auto-creates FOUR default ports (top/right/bottom/left, type
// 'bi') in `initializeDefaultPorts()` — the draw.io/mxGraph convention. A naive
// bridge hands all four to the layout engine as fixed-side constraints, and now
// EVERY node in the diagram is fully constrained on all four sides. ELK then has
// no freedom left and the layout gets worse, not better — the classic way
// port-aware layout is "added" and then quietly turned off again because it made
// things ugly.
//
// So the rule is: an auto-created default port is NOT a constraint. It means "this
// node has no opinion" — layout is free to pick a side. Only an AUTHOR-DECLARED
// port (one the model did not invent) constrains the layout. `isDefaultPort()`
// below is the whole distinction, and `derivePortInfos` honours it.

import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { PortModel } from '../models/PortModel';
import type { LinkLabel } from '../types/model.types';
import type { PortInfo, PortSide, PortFlowDirection } from './port-aware-layout.interface';

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Was this port invented by `NodeModel.initializeDefaultPorts()` rather than
 * declared by the author?
 *
 * The model marks them (`setMetadata('default', true)`), which is the only
 * trustworthy signal — `explicitSide` is TRUE even for the default ports (they
 * are constructed with `side:`, and the PortModel constructor sets the flag), so
 * `explicitSide` cannot be used to tell an authored port from an invented one.
 * That trap is exactly why this helper exists instead of an inline check.
 */
export function isDefaultPort(port: PortModel): boolean {
  return port.getMetadata('default') === true;
}

/** Ports the author actually declared — the ones that may constrain a layout. */
export function declaredPorts(node: NodeModel): PortModel[] {
  return node.getPorts().filter((p) => !isDefaultPort(p));
}

/**
 * Does this node carry author-declared ports? If not, layout may place it freely
 * and route through whichever of the four default sides suits the router.
 */
export function hasDeclaredPorts(node: NodeModel): boolean {
  return declaredPorts(node).length > 0;
}

/** `PortModel.type` ('input' | 'output' | 'bi') → the layout vocabulary. */
function flowDirection(port: PortModel): PortFlowDirection {
  if (port.type === 'input') return 'input';
  if (port.type === 'output') return 'output';
  return 'bidirectional';
}

/**
 * Build the `PortInfo[]` that `PortAwareLayoutManager` and the ELK adapter have
 * been waiting for, from the real wave-6 port model.
 *
 * Only DECLARED ports are emitted (see the file header). Ordering is canonical —
 * sorted by (nodeId, side, index, id) — because layout determinism is a Card 0
 * invariant and a Map-iteration-ordered port list would break it exactly the way
 * an insertion-ordered node list did.
 */
export function derivePortInfos(nodes: NodeModel[]): PortInfo[] {
  const infos: PortInfo[] = [];

  for (const node of nodes) {
    for (const port of declaredPorts(node)) {
      infos.push({
        id: port.id,
        nodeId: node.id,
        preferredSide: port.side as PortSide,
        direction: flowDirection(port),
        // `position` is a 0-1 fraction on the node; along the port's side that
        // fraction IS the offset the layout engine wants.
        offset: port.side === 'left' || port.side === 'right' ? port.position.y : port.position.x,
        fixed: port.explicitSide === true,
        priority: port.index,
        group: port.group,
      });
    }
  }

  return infos.sort(
    (a, b) =>
      cmp(a.nodeId, b.nodeId) ||
      cmp(a.preferredSide ?? '', b.preferredSide ?? '') ||
      (a.priority ?? 0) - (b.priority ?? 0) ||
      cmp(a.id, b.id)
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ELK's compass vocabulary for a port side. */
export type ElkPortSide = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

const SIDE_TO_ELK: Record<PortSide, ElkPortSide> = {
  top: 'NORTH',
  right: 'EAST',
  bottom: 'SOUTH',
  left: 'WEST',
};

export function toElkPortSide(side: PortSide): ElkPortSide {
  return SIDE_TO_ELK[side];
}

/**
 * How much freedom does the layout engine have over this node's ports?
 *
 *   FREE        — no declared ports: put the edge wherever it routes best.
 *   FIXED_SIDE  — the author said which side; the engine may still reorder
 *                 within that side to reduce crossings.
 *   FIXED_ORDER — side AND order are the author's.
 *   FIXED_POS   — the exact coordinates are the author's.
 *
 * `'auto'` (the default) resolves per node: FIXED_SIDE when the node declares
 * ports, FREE when it does not. That is what makes port-awareness safe to leave
 * ON — it constrains only the nodes whose author asked for it.
 */
export type PortConstraintMode = 'auto' | 'free' | 'fixed-side' | 'fixed-order' | 'fixed-pos';

export type ElkPortConstraint = 'FREE' | 'FIXED_SIDE' | 'FIXED_ORDER' | 'FIXED_POS';

export function resolvePortConstraint(
  node: NodeModel,
  mode: PortConstraintMode = 'auto'
): ElkPortConstraint {
  switch (mode) {
    case 'free':
      return 'FREE';
    case 'fixed-side':
      return 'FIXED_SIDE';
    case 'fixed-order':
      return 'FIXED_ORDER';
    case 'fixed-pos':
      return 'FIXED_POS';
    case 'auto':
    default:
      return hasDeclaredPorts(node) ? 'FIXED_SIDE' : 'FREE';
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** The box an edge label needs. Layout's job is to reserve it; not to place it. */
export interface LabelBox {
  /** The label this box belongs to. */
  id: string;
  /** The link the label rides on. */
  linkId: string;
  text: string;
  width: number;
  height: number;
}

// These mirror `renderer/src/svg/text-block.ts` (estimateTextWidth: length ×
// fontSize × 0.6) and `auto-size.ts` (line-height 1.2, default font 14) ON
// PURPOSE. The engine cannot import from the renderer — the dependency runs the
// other way — and a DOM-free layer has no `measureText`. If the two estimates
// drifted, layout would reserve a box of one size and the renderer would draw a
// label of another, which is worse than not reserving at all. `port-label-bridge.spec.ts`
// pins them together so the drift cannot happen silently.
const DEFAULT_LABEL_FONT_SIZE = 14;
const LABEL_LINE_HEIGHT = 1.2;
const CHAR_WIDTH_RATIO = 0.6;

/** The estimated content box of a single edge label, including its padding. */
export function estimateLabelBox(label: LinkLabel, linkId = ''): LabelBox {
  const fontSize = label.style?.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  const padding = label.style?.padding ?? 0;
  const text = label.text ?? '';

  const lines = wrapForMeasurement(text, label.textWrap ? label.maxWidth : undefined, fontSize);
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, line.length * fontSize * CHAR_WIDTH_RATIO);

  return {
    id: label.id,
    linkId,
    text,
    width: widest + padding * 2,
    height: lines.length * fontSize * LABEL_LINE_HEIGHT + padding * 2,
  };
}

/**
 * Greedy word-wrap, matching `renderer/src/svg/text-block.ts#wrapText`: hard '\n'
 * first, then wrap to width; a single over-long word is kept whole (it is clipped
 * at render time, not broken).
 */
function wrapForMeasurement(text: string, maxWidth: number | undefined, fontSize: number): string[] {
  const wrap = typeof maxWidth === 'number' && isFinite(maxWidth) && maxWidth > 0;
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (!wrap) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && candidate.length * fontSize * CHAR_WIDTH_RATIO > maxWidth!) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

/** Every label on a link, sized. Empty for the common unlabelled link. */
export function deriveLabelBoxes(link: LinkModel): LabelBox[] {
  return (link.labels ?? [])
    .filter((l) => (l.text ?? '').length > 0)
    .map((l) => estimateLabelBox(l, link.id));
}

/** The single box that must fit on a link: the union of its labels' boxes. */
export function linkLabelBox(link: LinkModel): LabelBox | undefined {
  const boxes = deriveLabelBoxes(link);
  if (boxes.length === 0) return undefined;

  // Labels sit at different slots along the path, so they do not stack — the
  // reservation is the WIDEST and the TALLEST, not the sum. (Summing would blow
  // the ranks apart on any link with a source/centre/target label triple.)
  return {
    id: boxes[0].id,
    linkId: link.id,
    text: boxes.map((b) => b.text).join(' / '),
    width: Math.max(...boxes.map((b) => b.width)),
    height: Math.max(...boxes.map((b) => b.height)),
  };
}

/**
 * The space every labelled edge needs, as one summary — what a layout engine that
 * cannot take per-edge label boxes (force, spectral, …) uses to inflate its
 * spacing so labels have somewhere to live.
 */
export function reservedLabelSpace(links: LinkModel[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const link of links) {
    const box = linkLabelBox(link);
    if (!box) continue;
    width = Math.max(width, box.width);
    height = Math.max(height, box.height);
  }
  return { width, height };
}
