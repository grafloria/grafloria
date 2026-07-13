// Content-tight bounds, export scope, and output-size clamping.
//
// WHY A VNODE WALK AND NOT A MODEL WALK
// -------------------------------------
// The renderer already had a content bbox (`SVGRenderer.contentViewport`), and it
// unioned the MODEL: node position/size + routed link points. That is most of the
// picture — but it is not the picture. What the model does not know:
//
//   • link LABELS, which hang off the path at a midpoint + offset and routinely
//     stick out past every node and every routed point;
//   • node labels placed OUTSIDE the node box;
//   • ports, which sit ON the node border and (with an outward offset) past it;
//   • arrowheads, which extend beyond the last path point;
//   • the node SHADOW's blur radius.
//
// Export with a model-derived bbox and all of those get clipped at the edge of the
// file. So the bbox is taken from the thing that is actually drawn: the VNode tree.
// One walk, every drawable, transforms applied — if the renderer draws it, it is in
// the box.
//
// TEXT is the one estimate. There is no font engine here (that is the whole point
// of a headless exporter), so a `<text>` is measured with the SAME 0.6em-per-char
// approximation `LabelRenderer.estimateTextWidth` already uses to size its own
// label backgrounds. Sharing the estimator means the box we reserve and the box the
// renderer reserved cannot disagree; both are approximations of the same thing.
//
// Everything here is pure: no DOM, no clock, no randomness.

import type { VNode } from '../types/vnode.types';
import type { Rectangle } from '../types/geometry.types';
import { selectionKeys } from './scope';

/** A 2-D affine transform, in SVG's own `matrix(a b c d e f)` order. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `m` then `n` — i.e. apply `n` in the coordinate space `m` establishes. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

const TRANSFORM_FN = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

/**
 * Parse an SVG `transform` attribute into a matrix.
 *
 * Supports the forms the renderer actually emits — `translate`, `rotate` (both the
 * 1-arg and the 3-arg about-a-point form), `scale`, `matrix` — plus `skewX`/`skewY`
 * for completeness. An unknown function is IGNORED rather than throwing: a bbox that
 * is slightly wrong beats an export that dies.
 */
export function parseTransform(transform: string | undefined): Matrix {
  if (!transform) return IDENTITY;

  let out = IDENTITY;
  TRANSFORM_FN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TRANSFORM_FN.exec(transform)) !== null) {
    const fn = match[1];
    const args = match[2]
      .split(/[\s,]+/)
      .map(part => Number(part))
      .filter(n => Number.isFinite(n));

    out = multiply(out, matrixFor(fn, args));
  }
  return out;
}

function matrixFor(fn: string, args: number[]): Matrix {
  switch (fn) {
    case 'translate':
      return { ...IDENTITY, e: args[0] ?? 0, f: args[1] ?? 0 };

    case 'scale': {
      const sx = args[0] ?? 1;
      // `scale(2)` is uniform — the y factor defaults to the x factor, not to 1.
      const sy = args.length > 1 ? args[1] : sx;
      return { ...IDENTITY, a: sx, d: sy };
    }

    case 'rotate': {
      const rad = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotation: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      // The 3-arg form rotates about (cx, cy): translate → rotate → translate back.
      if (args.length >= 3) {
        const cx = args[1];
        const cy = args[2];
        return multiply(
          multiply({ ...IDENTITY, e: cx, f: cy }, rotation),
          { ...IDENTITY, e: -cx, f: -cy }
        );
      }
      return rotation;
    }

    case 'matrix':
      if (args.length < 6) return IDENTITY;
      return { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };

    case 'skewX':
      return { ...IDENTITY, c: Math.tan(((args[0] ?? 0) * Math.PI) / 180) };

    case 'skewY':
      return { ...IDENTITY, b: Math.tan(((args[0] ?? 0) * Math.PI) / 180) };

    default:
      return IDENTITY;
  }
}

/** A growable min/max box. `null`-ish until the first point lands in it. */
class BoxAccumulator {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  addPoint(m: Matrix, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = applyMatrix(m, x, y);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    this.minX = Math.min(this.minX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxX = Math.max(this.maxX, p.x);
    this.maxY = Math.max(this.maxY, p.y);
  }

  /** Add an axis-aligned box by its four CORNERS — under rotation the corners move. */
  addBox(m: Matrix, x: number, y: number, width: number, height: number): void {
    this.addPoint(m, x, y);
    this.addPoint(m, x + width, y);
    this.addPoint(m, x, y + height);
    this.addPoint(m, x + width, y + height);
  }

  get empty(): boolean {
    return !Number.isFinite(this.minX) || !Number.isFinite(this.minY);
  }

  toRect(): Rectangle | null {
    if (this.empty) return null;
    return {
      x: this.minX,
      y: this.minY,
      width: this.maxX - this.minX,
      height: this.maxY - this.minY,
    };
  }
}

/**
 * The average glyph advance, as a fraction of font-size.
 *
 * THE SAME CONSTANT `LabelRenderer.estimateTextWidth` uses. It is a rough mean for
 * proportional Latin text — and it being rough is fine, because the renderer sizes
 * label backgrounds with it too. What matters is that the two AGREE: a bbox derived
 * from a different estimate than the one that placed the text would crop labels the
 * renderer thought it had left room for.
 */
export const AVG_CHAR_WIDTH_EM = 0.6;

const DEFAULT_FONT_SIZE = 12;

/** Elements that paint nothing and whose children are references, not drawings. */
const NON_PAINTING = new Set(['defs', 'title', 'desc', 'metadata', 'linearGradient', 'radialGradient', 'stop', 'filter', 'marker', 'clipPath', 'mask', 'pattern', 'style']);

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** `"10,20 30,40"` / `"10 20 30 40"` → [[10,20],[30,40]] */
function parsePoints(points: unknown): Array<[number, number]> {
  if (typeof points !== 'string') return [];
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(n => Number.isFinite(n));
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

/**
 * The coordinates of a path `d`.
 *
 * DELIBERATELY an over-approximation: every numeric pair in the data is treated as
 * a point, including Bézier CONTROL points. A cubic's control points lie outside the
 * curve they describe, so the box we return can be slightly LARGER than the true
 * ink — never smaller. For an export bbox that is the correct direction to be wrong
 * in: a little extra margin, versus a clipped link. Computing exact Bézier extrema
 * would buy a few pixels of tightness for a lot of code.
 *
 * Arc flags are the one place this bites: in `A rx ry rot large sweep x y` the two
 * flags are 0/1 and would be read as a coordinate pair. Arcs are parsed explicitly
 * so their flags never enter the box.
 */
export function pathPoints(d: unknown): Array<[number, number]> {
  if (typeof d !== 'string') return [];
  const out: Array<[number, number]> = [];

  // Split into commands: a letter followed by its argument run.
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!commands) return out;

  let cx = 0;
  let cy = 0;

  for (const command of commands) {
    const code = command[0];
    const upper = code.toUpperCase();
    const relative = code !== upper;
    const args = command
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter(n => Number.isFinite(n));

    if (upper === 'Z') continue;

    // Arc: consume 7 args at a time and take ONLY the endpoint. The 4th and 5th are
    // boolean flags, not coordinates — reading them as a point is a classic bbox bug.
    if (upper === 'A') {
      for (let i = 0; i + 6 < args.length; i += 7) {
        const ex = args[i + 5];
        const ey = args[i + 6];
        cx = relative ? cx + ex : ex;
        cy = relative ? cy + ey : ey;
        out.push([cx, cy]);
      }
      continue;
    }

    // Single-axis commands carry one coordinate each.
    if (upper === 'H') {
      for (const x of args) {
        cx = relative ? cx + x : x;
        out.push([cx, cy]);
      }
      continue;
    }
    if (upper === 'V') {
      for (const y of args) {
        cy = relative ? cy + y : y;
        out.push([cx, cy]);
      }
      continue;
    }

    // Everything else (M L T C S Q) is a run of x,y pairs. For the curve commands
    // that includes control points — see the over-approximation note above.
    for (let i = 0; i + 1 < args.length; i += 2) {
      const x = relative ? cx + args[i] : args[i];
      const y = relative ? cy + args[i + 1] : args[i + 1];
      out.push([x, y]);
      // The pen ends at the LAST pair of the run; intermediate pairs are controls.
      if (i + 3 >= args.length) {
        cx = x;
        cy = y;
      }
    }
  }

  return out;
}

/**
 * Estimate a `<text>` element's ink box.
 *
 * Honours `text-anchor` (start/middle/end) and treats `y` as the BASELINE, which is
 * what SVG does — so the box runs from roughly one ascent above y to one descent
 * below it. Ascent ≈ 0.8em, descent ≈ 0.2em is the usual rule of thumb and is well
 * within the error of the width estimate it sits next to.
 */
function textBox(vnode: VNode): { x: number; y: number; width: number; height: number } | null {
  const props = vnode.props ?? {};
  const content = textContentOf(vnode);
  if (!content) return null;

  const fontSize = num(props['fontSize'] ?? props['font-size'], DEFAULT_FONT_SIZE);
  // Multi-line labels render as <tspan> children; the widest line sets the width.
  const lines = content.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);

  const width = longest * fontSize * AVG_CHAR_WIDTH_EM;
  const height = fontSize * lines.length;

  const x = num(props['x']);
  const y = num(props['y']);

  const anchor = String(props['textAnchor'] ?? props['text-anchor'] ?? 'start');
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;

  return { x: left, y: y - fontSize * 0.8, width, height };
}

/** The text a `<text>` will actually paint — its own prop, or its tspans'. */
function textContentOf(vnode: VNode): string {
  const own = vnode.props?.['textContent'];
  if (typeof own === 'string' && own !== '') return own;

  const lines: string[] = [];
  for (const child of vnode.children ?? []) {
    if (!child || typeof child !== 'object') {
      if (typeof child === 'string') lines.push(child);
      continue;
    }
    const nested = textContentOf(child);
    if (nested) lines.push(nested);
  }
  return lines.join('\n');
}

export interface BoundsOptions {
  /**
   * Only union elements whose subtree is one of these diagram ids (node ids / link
   * ids). This is what makes a SELECTION export tight around the selection.
   */
  includeIds?: Set<string>;
}

/**
 * The VNode `key` is the diagram's identity in the tree: the renderer stamps every
 * node group with `node-<id>` and every link group with `link-<id>`.
 *
 * We match on the KEY and not on a `data-*` prop because the key is the only
 * identifier that is actually universal. `data-link-id` is present on some link
 * variants and absent on others, and `data-node-id` DOES NOT EXIST — a selection
 * filter written against it would have matched nothing and silently exported an
 * empty box, which is precisely the "config declared but never consumed" failure
 * this codebase keeps producing.
 *
 * ONE definition of the key shapes, shared with the tree prune in `scope.ts`: if the
 * box and the prune ever disagreed about what a selection IS, an export would crop
 * to a different set of elements than it contains.
 */
export { selectionKeys as scopeKeysFor } from './scope';

/**
 * The union box of everything a VNode tree paints, in the tree's own user space.
 *
 * Returns `null` for a tree that paints nothing (an empty diagram) — the caller
 * decides what an empty document should be, because "nothing" is not a rectangle.
 */
export function vnodeBounds(root: VNode, options: BoundsOptions = {}): Rectangle | null {
  const box = new BoxAccumulator();
  const scopeKeys = options.includeIds ? selectionKeys(options.includeIds) : undefined;
  // With no filter every element is in scope from the root down.
  walk(root, IDENTITY, box, scopeKeys, scopeKeys === undefined);
  return box.toRect();
}

/**
 * @param selected has an ancestor already matched `includeIds`? Once a subtree is
 *        in scope, everything under it is in scope — a node's label and ports are
 *        part of the node, and they are not separately id-tagged.
 */
function walk(
  vnode: VNode,
  parent: Matrix,
  box: BoxAccumulator,
  scopeKeys: Set<string> | undefined,
  selected: boolean
): void {
  if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string') return;

  const props = vnode.props ?? {};

  // A hidden element paints nothing, so it must not enlarge the box. (`display:
  // none` on a culled node used to be the sneaky way an off-screen element still
  // widened an export.)
  if (props['display'] === 'none') return;

  // <defs> and friends: their children are REFERENCED, never drawn in place.
  if (NON_PAINTING.has(vnode.type)) return;

  const here = multiply(parent, parseTransform(props['transform'] as string | undefined));

  // Scope gate. Once a subtree is in scope everything under it is too — a node's
  // label and ports are PART of the node and carry no id of their own.
  const inScope = selected || (scopeKeys !== undefined && vnode.key !== undefined && scopeKeys.has(vnode.key));

  if (inScope) {
    addGeometry(vnode, here, box);
  }

  for (const child of vnode.children ?? []) {
    if (child && typeof child === 'object') walk(child, here, box, scopeKeys, inScope);
  }
}

/** `blur(4px)` → 4. The renderer's node shadow declares its blur this way. */
function blurRadius(filter: unknown): number {
  if (typeof filter !== 'string') return 0;
  const match = /blur\(\s*([\d.]+)/.exec(filter);
  return match ? Number(match[1]) : 0;
}

/** Union THIS element's own geometry (not its children's) into the box. */
function addGeometry(vnode: VNode, m: Matrix, box: BoxAccumulator): void {
  const props = vnode.props ?? {};

  // A stroke straddles the path: half of it lies outside the geometry. Ignoring it
  // shaves half a stroke off every edge of the export.
  const strokeWidth = props['stroke'] && props['stroke'] !== 'none' ? num(props['strokeWidth'] ?? props['stroke-width'], 0) : 0;

  // A BLUR paints outside its geometry — that is what a blur is. The node shadow is
  // `filter: blur(4px)` on an offset rect, so a tight crop that ignored the blur
  // would shave the soft edge off the shadow on the right and bottom of the diagram.
  // Expanding by the radius is a slight over-estimate (the visible tail is shorter),
  // which is the safe direction for an export box.
  const pad = strokeWidth / 2 + blurRadius(props['filter']);

  switch (vnode.type) {
    case 'rect': {
      const x = num(props['x']);
      const y = num(props['y']);
      box.addBox(m, x - pad, y - pad, num(props['width']) + pad * 2, num(props['height']) + pad * 2);
      break;
    }

    case 'circle': {
      const cx = num(props['cx']);
      const cy = num(props['cy']);
      const r = num(props['r']) + pad;
      box.addBox(m, cx - r, cy - r, r * 2, r * 2);
      break;
    }

    case 'ellipse': {
      const cx = num(props['cx']);
      const cy = num(props['cy']);
      const rx = num(props['rx']) + pad;
      const ry = num(props['ry']) + pad;
      box.addBox(m, cx - rx, cy - ry, rx * 2, ry * 2);
      break;
    }

    case 'line': {
      box.addBox(m, Math.min(num(props['x1']), num(props['x2'])) - pad, Math.min(num(props['y1']), num(props['y2'])) - pad,
        Math.abs(num(props['x2']) - num(props['x1'])) + pad * 2,
        Math.abs(num(props['y2']) - num(props['y1'])) + pad * 2);
      break;
    }

    case 'polyline':
    case 'polygon': {
      for (const [x, y] of parsePoints(props['points'])) {
        box.addBox(m, x - pad, y - pad, pad * 2, pad * 2);
      }
      break;
    }

    case 'path': {
      for (const [x, y] of pathPoints(props['d'])) {
        box.addBox(m, x - pad, y - pad, pad * 2, pad * 2);
      }
      break;
    }

    case 'text': {
      const t = textBox(vnode);
      if (t) box.addBox(m, t.x, t.y, t.width, t.height);
      break;
    }

    case 'image':
    case 'foreignObject': {
      box.addBox(m, num(props['x']), num(props['y']), num(props['width']), num(props['height']));
      break;
    }

    // 'g', 'svg', 'tspan' and anything else: no geometry of its own. `tspan`
    // positions are already covered by the parent <text>'s multi-line estimate.
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Export scope
// ---------------------------------------------------------------------------

/**
 * WHAT rectangle of the world an export covers.
 *
 *   'content'   the whole diagram, tight around everything drawn (the default —
 *               a thumbnail of "whatever the user happened to be scrolled to" is
 *               almost never what anyone means)
 *   'viewport'  exactly what is on screen right now
 *   'selection' tight around the selected nodes/links alone
 */
export type ExportScope = 'content' | 'viewport' | 'selection';

/** The default cap on an exported raster's pixel size, per side. */
export const DEFAULT_MAX_OUTPUT_SIZE = 4000;

export interface ClampResult {
  /** The scale that actually gets used (≤ the requested one). */
  scale: number;
  width: number;
  height: number;
  /** Set when the requested scale had to be reduced. */
  warning?: string;
}

/**
 * Clamp an export's PIXEL size.
 *
 * A 3x export of a big diagram is how you ask a browser for a 30000 × 20000 canvas
 * and get back a blank image — canvas has a hard area/side limit (~16k on most
 * engines, less on Safari/mobile), and it fails SILENTLY: `toDataURL` hands you a
 * blank or throws deep inside the driver. So we cap the output and REDUCE THE SCALE
 * to fit, rather than emitting a request we know will fail.
 *
 * Reducing scale (not cropping) is the right lever: it keeps the whole picture and
 * only spends fewer pixels on it, which is exactly the trade a caller who asked for
 * "3x, and it must fit" wants.
 *
 * `minSize` floors the result so a tiny diagram still yields a usable image rather
 * than a 12 × 8 sliver.
 */
export function clampOutputSize(
  width: number,
  height: number,
  requestedScale: number,
  maxSize: number = DEFAULT_MAX_OUTPUT_SIZE,
  minSize = 1
): ClampResult {
  const scale = requestedScale > 0 ? requestedScale : 1;
  const safeMax = maxSize > 0 ? maxSize : DEFAULT_MAX_OUTPUT_SIZE;

  let outWidth = width * scale;
  let outHeight = height * scale;

  // Scale UP a sliver to the floor, keeping the aspect ratio.
  let effective = scale;
  const longestMin = Math.max(outWidth, outHeight);
  if (longestMin > 0 && minSize > 1 && longestMin < minSize) {
    const up = minSize / longestMin;
    effective *= up;
    outWidth *= up;
    outHeight *= up;
  }

  const longest = Math.max(outWidth, outHeight);
  if (longest <= safeMax) {
    return { scale: effective, width: outWidth, height: outHeight };
  }

  const shrink = safeMax / longest;
  const clamped = effective * shrink;
  return {
    scale: clamped,
    width: outWidth * shrink,
    height: outHeight * shrink,
    warning:
      `export size ${Math.round(outWidth)}×${Math.round(outHeight)}px exceeds the ${safeMax}px cap — ` +
      `scale reduced ${effective.toFixed(2)} → ${clamped.toFixed(2)}. Raise options.maxSize to override ` +
      `(note: browsers refuse very large canvases, often silently).`,
  };
}

/** Grow a rectangle by `padding` on every side. */
export function padRect(rect: Rectangle, padding: number): Rectangle {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}
