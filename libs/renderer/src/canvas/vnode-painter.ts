// vnode-painter.ts — draws a VNode tree onto a 2D context.
//
// This is the OTHER consumer of the VNode tree. `vnode/patch.ts` turns it into
// SVG DOM; this turns it into Canvas 2D draw calls. Neither knows about the
// other, and neither is the "real" one — the VNode tree is the contract, which
// is exactly what makes the backend switchable.
//
// What the painter does, in order, for every element:
//   1. resolve its style through the SVG cascade      (style-resolution.ts,
//      which reuses the export card's class-rule flattener)
//   2. compose its transform onto the parent's        (path-geometry.ts)
//   3. normalise its geometry to path commands        (path-geometry.ts)
//   4. fill / stroke / draw text
//   5. record a HIT REGION for it, in world coordinates
//
// Step 5 is why hit-testing cannot drift from what is drawn: the pick geometry
// and the pixels come from the same command list, produced in the same pass.
//
// NOT PAINTABLE ON CANVAS (deliberate, reported, not silently dropped):
//   - `foreignObject` — it embeds live HTML/components. Canvas cannot rasterise
//     a DOM subtree. The painter records these in `unpaintableNodes` so the host
//     can position an HTML overlay over the canvas (the standard hybrid answer,
//     and what `RendererCapabilities.supportsForeignObject: false` announces).

import type { VNode, VNodeProps } from '../types/vnode.types';
import { DEFAULT_LINK_HIT_TOLERANCE, linkBodyHitTolerance } from '../svg/link-hit-test';
import {
  IDENTITY,
  type Bounds,
  type Matrix,
  type PathCmd,
  boundsUnion,
  circlePath,
  ellipsePath,
  linePath,
  multiply,
  parsePath,
  parseTransform,
  pathBounds,
  polyPath,
  rectPath,
  transformCmds,
} from './path-geometry';
import {
  CanvasStyleResolver,
  type ComputedStyle,
  fontString,
  textAlignFor,
  textBaselineFor,
  toNumber,
} from './style-resolution';
import { type Canvas2DLike, NULL_CONTEXT } from './canvas-context';

/** What a hit region belongs to. */
export type HitKind = 'node' | 'link' | 'port' | 'other';

/** The entity a subtree belongs to. */
export interface EntityScope {
  kind: HitKind;
  id: string;
  /** The VNode key — `node-n1`, and therefore the dirty tracker's entity key. */
  key: string;
}

/**
 * One pickable region, in WORLD coordinates.
 *
 * Produced by the paint pass, consumed by both picking strategies (the colour-
 * keyed hit canvas and the geometric fallback). `zIndex` is paint order, so the
 * last-painted region under the cursor is the topmost one — which is the same
 * rule `DiagramModel.getNodeAtPosition` applies when it iterates nodes in
 * reverse.
 */
export interface HitRecord {
  kind: HitKind;
  /** Entity id (node id / link id / port id). */
  id: string;
  /** World-space geometry — the exact path that was drawn. */
  cmds: PathCmd[];
  /** True when the region is the filled interior; false when it is the stroke. */
  filled: boolean;
  /** Pick tolerance for stroke regions (world units, half-width). */
  tolerance: number;
  /** Paint order. */
  zIndex: number;
  /** The VNode that produced the region (the `IRenderer.hitTest` return value). */
  vnode: VNode;
  /** Colour key for the offscreen picking canvas (`#rrggbb`). */
  colorKey: string;
  bounds: Bounds | null;
}

/**
 * Link pick tolerance, in WORLD units.
 *
 * Not a new number — it IS the floor `InteractionController` applies in SVG
 * mode, imported from the one place that owns it. Hit parity between the two
 * backends is therefore a property of the code, not a coincidence maintained by
 * two constants that happen to agree today. (The full grab distance is per
 * link — `linkBodyHitTolerance(strokeWidth)` — which both backends now use.)
 */
export const CANVAS_LINK_HIT_TOLERANCE = DEFAULT_LINK_HIT_TOLERANCE;

/**
 * Classes whose elements are DECORATION: they are painted, but they must not be
 * pickable, because they extend beyond the entity's real silhouette (the shadow
 * is offset, the selection ring is grown by 3px). Picking them would make the
 * canvas backend select a node from outside the shape — which SVG mode, via
 * `isPointInShape`, does not do.
 */
const NON_PICKABLE_CLASSES = new Set([
  'node-shadow',
  'selection-highlight',
  'connection-target-highlight',
  // The SVG renderer's invisible wide "interaction stroke". Its width is a
  // DOM-hit-area convention (>= 12px), not the tolerance the interaction layer
  // actually applies (5 world units), so consuming it here would make canvas
  // picking looser than SVG picking. The link's real pick region is derived from
  // the VISIBLE path with CANVAS_LINK_HIT_TOLERANCE.
  'link-hit-area',
]);

/** Elements that define, rather than draw. */
const DEFINITION_TYPES = new Set([
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'pattern',
  'filter',
  'feDropShadow',
  'feGaussianBlur',
  'feOffset',
  'feFlood',
  'feComposite',
  'feMerge',
  'feMergeNode',
  'stop',
  'marker',
  'title',
  'desc',
]);

export interface PaintOptions {
  /** World → device matrix (viewBox + zoom + devicePixelRatio, composed). */
  worldToDevice: Matrix;
  /**
   * Only repaint elements intersecting these WORLD rects. Omit for a full
   * repaint. The caller is responsible for having clipped/cleared them.
   */
  dirtyWorld?: Bounds[];
  /** Paint the colour-key silhouettes instead of the real styles (hit canvas). */
  pickingPass?: boolean;
  /**
   * Compute bounds and hit regions, draw nothing. Used to measure a changed
   * entity's extent before deciding what to repaint.
   */
  measureOnly?: boolean;
  /**
   * Colour-key allocator, keyed by a STABLE per-element id.
   *
   * This MUST be stable across frames when the hit canvas is repainted
   * partially: pixels outside the dirty rects survive from earlier frames, so a
   * key that meant "node A" last frame must not mean "node B" now. A per-paint
   * counter (the default) is only safe for a one-shot paint; the renderer
   * injects a persistent allocator.
   */
  allocateColorKey?: (stableId: string) => string;
}

export interface PaintResult {
  /** Every pickable region produced this frame, in paint order. */
  hitRecords: HitRecord[];
  /** colour key → record, for the offscreen picking canvas. */
  colorKeyIndex: Map<string, HitRecord>;
  /** Elements the canvas cannot draw (foreignObject) — the host may overlay them. */
  unpaintableNodes: VNode[];
  /** World bounds of everything painted. */
  bounds: Bounds | null;
  /** Per-entity world bounds (`node-n1` → its extent), for the dirty tracker. */
  entityBounds: Map<string, Bounds | null>;
  /** Elements actually painted (after dirty-rect culling). */
  paintedCount: number;
  /** Elements skipped because they fell outside the dirty region. */
  culledCount: number;
}

interface PaintState {
  ctx: Canvas2DLike;
  defs: Map<string, VNode>;
  options: PaintOptions;
  hitRecords: HitRecord[];
  colorKeyIndex: Map<string, HitRecord>;
  unpaintableNodes: VNode[];
  bounds: Bounds | null;
  entityBounds: Map<string, Bounds | null>;
  paintedCount: number;
  culledCount: number;
  allocateColorKey: (stableId: string) => string;
  /** Pickable-element counter per entity — the stable part of a colour key. */
  entityPickCount: Map<string, number>;
  entity: EntityScope | null;
  /** Enclosing entity keys, outermost first (a port nests inside its node). */
  entityStack: string[];
  gradientCache: Map<string, unknown>;
}

/**
 * Paints VNode trees. Stateless between frames apart from the colour-key
 * allocator the caller injects.
 */
export class VNodePainter {
  constructor(private readonly resolver: CanvasStyleResolver) {}

  paint(ctx: Canvas2DLike, root: VNode, options: PaintOptions): PaintResult {
    const defs = collectDefinitions(root);
    let fallbackCounter = 0;

    const state: PaintState = {
      ctx,
      defs,
      options,
      hitRecords: [],
      colorKeyIndex: new Map(),
      unpaintableNodes: [],
      bounds: null,
      entityBounds: new Map(),
      paintedCount: 0,
      culledCount: 0,
      allocateColorKey: options.allocateColorKey ?? (() => nextColorKey(fallbackCounter++)),
      entityPickCount: new Map(),
      entity: null,
      entityStack: [],
      gradientCache: new Map(),
    };

    this.paintNode(state, root, IDENTITY, this.resolver.rootStyle());

    return {
      hitRecords: state.hitRecords,
      colorKeyIndex: state.colorKeyIndex,
      unpaintableNodes: state.unpaintableNodes,
      bounds: state.bounds,
      entityBounds: state.entityBounds,
      paintedCount: state.paintedCount,
      culledCount: state.culledCount,
    };
  }

  /**
   * World bounds of a subtree, drawing nothing. Used by the dirty tracker to
   * measure the entities that actually changed (and only those).
   */
  measure(vnode: VNode, worldToDevice: Matrix = IDENTITY): Bounds | null {
    return this.paint(NULL_CONTEXT, vnode, { worldToDevice, measureOnly: true }).bounds;
  }

  // -------------------------------------------------------------------------

  private paintNode(
    state: PaintState,
    vnode: VNode,
    parentMatrix: Matrix,
    inherited: ComputedStyle
  ): void {
    if (!vnode || typeof vnode.type !== 'string') return;

    // Definitions are consulted, never drawn.
    if (DEFINITION_TYPES.has(vnode.type)) return;

    // foreignObject: live HTML. Canvas cannot rasterise it — report, don't drop.
    if (vnode.type === 'foreignObject') {
      state.unpaintableNodes.push(vnode);
      return;
    }

    // <image>: raster content (a composite panel's image/icon slot, Card 5). The
    // retained-mode backend has no async image cache, so it REPORTS images as
    // unpaintable — the host may overlay them, exactly like foreignObject —
    // rather than dropping them silently. The rest of the panel (header band,
    // rows, badges) is ordinary rect/text and paints natively, so a composite
    // node still reads correctly in Canvas mode minus the bitmap.
    if (vnode.type === 'image') {
      state.unpaintableNodes.push(vnode);
      return;
    }

    const props = vnode.props ?? {};
    const style = this.resolver.resolve(props, inherited);

    if (!style.visible) return;

    const matrix = props['transform']
      ? multiply(parentMatrix, parseTransform(String(props['transform'])))
      : parentMatrix;

    // Entity scope: a `node-…` / `link-…` group owns every pickable region
    // beneath it, which is how a link's <path> (which carries no key of its own)
    // gets attributed to its link. The scopes NEST (a port lives inside a node),
    // so bounds accumulate onto every enclosing entity — a port that sticks out
    // past the node's edge still grows the node's dirty rect.
    const prevEntity = state.entity;
    const scope = entityOf(vnode);
    if (scope) {
      state.entity = scope;
      state.entityStack.push(scope.key);
    }

    if (vnode.type === 'g' || vnode.type === 'svg') {
      for (const child of vnode.children ?? []) {
        this.paintNode(state, child, matrix, style);
      }
    } else if (vnode.type === 'text') {
      this.paintText(state, vnode, matrix, style);
    } else {
      const cmds = geometryOf(vnode);
      if (cmds.length > 0) {
        this.paintShape(state, vnode, cmds, matrix, style);
      }
      // A shape can still have children (rare, but the tree allows it).
      for (const child of vnode.children ?? []) {
        this.paintNode(state, child, matrix, style);
      }
    }

    if (scope) {
      state.entityStack.pop();
      state.entity = prevEntity;
    }
  }

  private paintShape(
    state: PaintState,
    vnode: VNode,
    localCmds: PathCmd[],
    matrix: Matrix,
    style: ComputedStyle
  ): void {
    const worldCmds = transformCmds(localCmds, matrix);
    const geomBounds = pathBounds(worldCmds);
    const padded = geomBounds ? padForPaint(geomBounds, style) : null;

    accumulateBounds(state, padded);

    // The pick region is registered even when the element is dirty-culled: the
    // hit index describes the whole scene, not just the repainted part of it.
    const record = this.registerHit(state, vnode, worldCmds, style, geomBounds);

    if (state.options.measureOnly) return;

    if (!intersectsDirty(padded, state.options.dirtyWorld)) {
      state.culledCount++;
      return;
    }
    state.paintedCount++;

    const ctx = state.ctx;
    const m = multiply(state.options.worldToDevice, matrix);

    ctx.save();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

    this.applyClip(state, style);

    // --- picking pass: flat colour-key silhouette, no styling at all ---------
    if (state.options.pickingPass) {
      if (record) {
        emitPath(ctx, localCmds);
        ctx.globalAlpha = 1;
        if (record.filled) {
          ctx.fillStyle = record.colorKey;
          ctx.fill();
        } else {
          ctx.strokeStyle = record.colorKey;
          ctx.lineWidth = record.tolerance * 2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.setLineDash([]);
          ctx.stroke();
        }
      }
      ctx.restore();
      return;
    }

    // --- normal pass --------------------------------------------------------
    if (style.filter && 'filter' in ctx) {
      ctx.filter = style.filter;
    }

    emitPath(ctx, localCmds);

    if (style.fill !== undefined) {
      ctx.fillStyle = this.paintValue(state, style.fill, geomBounds);
      ctx.globalAlpha = style.opacity * (style.fillOpacity ?? 1);
      ctx.fill();
    }

    if (style.stroke !== undefined && style.strokeWidth > 0) {
      ctx.strokeStyle = this.paintValue(state, style.stroke, geomBounds);
      ctx.globalAlpha = style.opacity * (style.strokeOpacity ?? 1);
      ctx.lineWidth = style.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      ctx.setLineDash(style.strokeDasharray ?? []);
      ctx.stroke();
    }

    ctx.restore();
  }

  private paintText(
    state: PaintState,
    vnode: VNode,
    matrix: Matrix,
    style: ComputedStyle
  ): void {
    const props = vnode.props ?? {};
    const x = toNumber(props['x']) ?? 0;
    const y = toNumber(props['y']) ?? 0;

    const lines = textLines(vnode, x, y);
    if (lines.length === 0) return;

    // Text bounds are estimated (the same `length * fontSize * 0.6` heuristic the
    // SVG text-block engine uses to wrap), which is enough for dirty rects.
    const geomBounds = textBounds(lines, style);
    const worldBounds = geomBounds ? transformBounds(geomBounds, matrix) : null;
    accumulateBounds(state, worldBounds);

    if (state.options.measureOnly) return;

    if (!intersectsDirty(worldBounds, state.options.dirtyWorld)) {
      state.culledCount++;
      return;
    }

    // Text is never a pick target: every label the renderer emits carries
    // `pointer-events: none`, and picking glyph boxes would make a node's hit
    // region depend on its label's length.
    if (state.options.pickingPass) return;

    state.paintedCount++;

    const ctx = state.ctx;
    const m = multiply(state.options.worldToDevice, matrix);

    ctx.save();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    this.applyClip(state, style);

    ctx.font = fontString(style);
    ctx.textAlign = textAlignFor(style.textAnchor);
    ctx.textBaseline = textBaselineFor(style.dominantBaseline);
    ctx.globalAlpha = style.opacity * (style.fillOpacity ?? 1);
    ctx.fillStyle = this.paintValue(state, style.fill ?? '#000000', null);

    for (const line of lines) {
      ctx.fillText(line.text, line.x, line.y);
    }

    ctx.restore();
  }

  /** `url(#id)` → a real CanvasGradient; anything else passes through. */
  private paintValue(state: PaintState, paint: string, bounds: Bounds | null): unknown {
    if (!paint.startsWith('url(')) return paint;

    const id = /url\(\s*#([^)\s]+)\s*\)/.exec(paint)?.[1];
    if (!id) return '#000000';

    const cached = state.gradientCache.get(id);
    if (cached !== undefined) return cached;

    const def = state.defs.get(id);
    const gradient = def ? buildGradient(state.ctx, def, bounds) : undefined;
    // A pattern / unresolvable ref falls back to a flat mid-grey rather than
    // throwing or painting black: a missing paint server must not blank a node.
    const value = gradient ?? '#999999';
    state.gradientCache.set(id, value);
    return value;
  }

  private applyClip(state: PaintState, style: ComputedStyle): void {
    if (!style.clipPathId) return;
    const clip = state.defs.get(style.clipPathId);
    if (!clip) return;

    const ctx = state.ctx;
    ctx.beginPath();
    for (const child of clip.children ?? []) {
      const cmds = geometryOf(child);
      if (cmds.length === 0) continue;
      // A clipPath child may carry its own transform.
      const childMatrix = child.props?.['transform']
        ? parseTransform(String(child.props['transform']))
        : IDENTITY;
      emitPathInto(ctx, childMatrix === IDENTITY ? cmds : transformCmds(cmds, childMatrix));
    }
    ctx.clip();
  }

  private registerHit(
    state: PaintState,
    vnode: VNode,
    worldCmds: PathCmd[],
    style: ComputedStyle,
    bounds: Bounds | null
  ): HitRecord | null {
    const entity = state.entity;
    if (!entity) return null;
    if (vnode.props?.['pointerEvents'] === 'none') return null;

    const classes = String(vnode.props?.['className'] ?? '').split(/\s+/);
    if (classes.some((c) => NON_PICKABLE_CLASSES.has(c))) return null;

    // Filled shapes pick by their INTERIOR (a node body, an arrowhead polygon);
    // a stroke-only element — the link path itself, which is `fill: none` — picks
    // by PROXIMITY to the line, because a zero-area path has no interior to be
    // inside of. The link's proximity band is the shared interaction tolerance,
    // not its visual stroke width: a 2px line has to be clickable.
    const filled = style.fill !== undefined;
    const isLink = entity.kind === 'link';

    // Stable within the entity, and therefore stable across frames — see
    // PaintOptions.allocateColorKey for why that is load-bearing.
    const ordinal = state.entityPickCount.get(entity.key) ?? 0;
    state.entityPickCount.set(entity.key, ordinal + 1);

    const record: HitRecord = {
      kind: entity.kind,
      id: entity.id,
      cmds: worldCmds,
      filled,
      tolerance:
        !filled && isLink
          ? linkBodyHitTolerance(style.strokeWidth)
          : Math.max(style.strokeWidth / 2, 0.5),
      zIndex: state.hitRecords.length,
      vnode,
      colorKey: state.allocateColorKey(`${entity.key}#${ordinal}`),
      bounds,
    };

    state.hitRecords.push(record);
    state.colorKeyIndex.set(record.colorKey, record);
    return record;
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/** Add a shape's world bounds to the frame total AND to every enclosing entity. */
function accumulateBounds(state: PaintState, bounds: Bounds | null): void {
  if (!bounds) return;
  state.bounds = boundsUnion(state.bounds, bounds);
  for (const key of state.entityStack) {
    state.entityBounds.set(key, boundsUnion(state.entityBounds.get(key) ?? null, bounds));
  }
}

/** `node-n1` / `link-l1` / `port-p3` → the entity that owns the subtree. */
export function entityOf(vnode: VNode): EntityScope | null {
  const key = vnode.key;
  if (!key) return null;
  // The HTML-layer placeholder group is not a paintable node.
  if (key.endsWith('-html-layer')) return null;
  if (key.startsWith('node-')) return { kind: 'node', id: key.slice(5), key };
  if (key.startsWith('link-')) return { kind: 'link', id: key.slice(5), key };
  if (key.startsWith('port-')) return { kind: 'port', id: key.slice(5), key };
  return null;
}

/**
 * Every `id`-bearing definition anywhere in the tree: paint servers and filters
 * from `<defs>`, and the per-node `<clipPath>`s the label engine emits INLINE
 * (as a sibling of the text it clips). A single recursive pre-pass, because
 * `<defs>` is appended LAST by the SVG renderer while the elements referencing
 * it are painted first.
 */
export function collectDefinitions(root: VNode): Map<string, VNode> {
  const out = new Map<string, VNode>();

  const walk = (vnode: VNode): void => {
    const id = vnode.props?.['id'];
    if (typeof id === 'string' && id) out.set(id, vnode);
    for (const child of vnode.children ?? []) {
      if (child) walk(child);
    }
  };

  walk(root);
  return out;
}

/** VNode primitive → path commands, in the element's own local coordinates. */
export function geometryOf(vnode: VNode): PathCmd[] {
  const p: VNodeProps = vnode.props ?? {};
  const n = (key: string, fallback = 0): number => toNumber(p[key]) ?? fallback;

  switch (vnode.type) {
    case 'rect':
      return rectPath(
        n('x'),
        n('y'),
        n('width'),
        n('height'),
        n('rx'),
        toNumber(p['ry']) ?? n('rx')
      );
    case 'circle':
      return circlePath(n('cx'), n('cy'), n('r'));
    case 'ellipse':
      return ellipsePath(n('cx'), n('cy'), n('rx'), n('ry'));
    case 'line':
      return linePath(n('x1'), n('y1'), n('x2'), n('y2'));
    case 'polyline':
      return polyPath(p['points'] as string, false);
    case 'polygon':
      return polyPath(p['points'] as string, true);
    case 'path':
      return parsePath(p['d'] as string);
    default:
      return [];
  }
}

function emitPath(ctx: Canvas2DLike, cmds: PathCmd[]): void {
  ctx.beginPath();
  emitPathInto(ctx, cmds);
}

function emitPathInto(ctx: Canvas2DLike, cmds: PathCmd[]): void {
  for (const cmd of cmds) {
    switch (cmd.op) {
      case 'M':
        ctx.moveTo(cmd.x, cmd.y);
        break;
      case 'L':
        ctx.lineTo(cmd.x, cmd.y);
        break;
      case 'C':
        ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case 'Q':
        ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}

/** One drawn line of text, already positioned in the element's local space. */
export interface TextLine {
  text: string;
  x: number;
  y: number;
}

/**
 * The lines a `<text>` element draws.
 *
 * Two shapes, both emitted by the shared text-block engine:
 *   - single line  → `textContent` on the `<text>` itself,
 *   - multi line   → one `<tspan>` per line, each with `x` and a `dy` offset
 *     from the running baseline (the first `dy` carries the block's vertical
 *     alignment). Canvas has no tspan, so the dy chain is accumulated here.
 */
export function textLines(vnode: VNode, x: number, y: number): TextLine[] {
  const props = vnode.props ?? {};
  const children = (vnode.children ?? []).filter((c) => c && c.type === 'tspan');

  if (children.length === 0) {
    const text = props['textContent'];
    if (text === undefined || text === null || String(text) === '') return [];
    return [{ text: String(text), x, y }];
  }

  const lines: TextLine[] = [];
  let cursorY = y;
  for (const span of children) {
    const sp = span.props ?? {};
    cursorY += toNumber(sp['dy']) ?? 0;
    const text = sp['textContent'];
    if (text === undefined || text === null) continue;
    lines.push({ text: String(text), x: toNumber(sp['x']) ?? x, y: cursorY });
  }
  return lines;
}

/** Estimated local-space bounds of a drawn text block. */
function textBounds(lines: TextLine[], style: ComputedStyle): Bounds | null {
  if (lines.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const line of lines) {
    const width = line.text.length * style.fontSize * 0.6;
    const half = style.textAnchor === 'middle' ? width / 2 : style.textAnchor === 'end' ? width : 0;
    const left = line.x - half;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, left + width);
    minY = Math.min(minY, line.y - style.fontSize);
    maxY = Math.max(maxY, line.y + style.fontSize);
  }

  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function transformBounds(b: Bounds, m: Matrix): Bounds {
  const corners = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ].map((p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }));

  return {
    minX: Math.min(...corners.map((p) => p.x)),
    minY: Math.min(...corners.map((p) => p.y)),
    maxX: Math.max(...corners.map((p) => p.x)),
    maxY: Math.max(...corners.map((p) => p.y)),
  };
}

/**
 * Grow a shape's geometric bounds by everything that paints OUTSIDE it: half the
 * stroke, plus a blur allowance when a CSS filter is in play. Over-padding costs
 * a few extra repainted pixels; under-padding leaves visible crumbs behind a
 * dirty-rect redraw, so this errs generously.
 */
function padForPaint(b: Bounds, style: ComputedStyle): Bounds {
  let pad = style.stroke !== undefined ? style.strokeWidth / 2 + 1 : 1;
  if (style.filter) {
    const blur = toNumber(/blur\(\s*([\d.]+)/.exec(style.filter)?.[1]) ?? 0;
    pad += blur * 3; // a Gaussian's visible extent is ~3σ
  }
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

function intersectsDirty(bounds: Bounds | null, dirty: Bounds[] | undefined): boolean {
  if (!dirty || dirty.length === 0) return true; // full repaint
  if (!bounds) return false;
  return dirty.some(
    (d) =>
      !(
        bounds.maxX < d.minX ||
        bounds.minX > d.maxX ||
        bounds.maxY < d.minY ||
        bounds.minY > d.maxY
      )
  );
}

/**
 * Colour keys for the offscreen picking canvas.
 *
 * The index is spread across the 24-bit colour space with a stride so that
 * adjacent records get FAR-APART colours. That matters: a browser antialiases
 * even the picking pass, and a blended edge pixel between two adjacent keys must
 * not land on a third VALID key. With a large stride, a blend of two keys is
 * overwhelmingly likely to be a colour no record owns — which reads as "miss",
 * not as "wrong entity". Exact-match lookup does the rest.
 */
export function nextColorKey(index: number): string {
  // 2^24 / golden ratio, rounded to an odd number → a full-period generator over
  // the 24-bit space with maximally-spread successive values.
  const value = ((index + 1) * 10368889) % 0xffffff;
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** `#rrggbb` from a picking-canvas pixel. */
export function colorKeyFromPixel(r: number, g: number, b: number, a: number): string | null {
  if (a === 0) return null;
  const value = (r << 16) | (g << 8) | b;
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Build a CanvasGradient from a `<linearGradient>` / `<radialGradient>` VNode. */
function buildGradient(ctx: Canvas2DLike, def: VNode, bounds: Bounds | null): unknown {
  const stops = (def.children ?? []).filter((c) => c && c.type === 'stop');
  if (stops.length === 0) return undefined;

  // objectBoundingBox is the SVG default: coordinates are fractions of the
  // element's bounds. Canvas gradients are always in user space, so the box has
  // to be resolved here.
  const units = String(def.props?.['gradientUnits'] ?? 'objectBoundingBox');
  const box = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;

  const mapX = (v: number): number => (units === 'userSpaceOnUse' ? v : box.minX + v * w);
  const mapY = (v: number): number => (units === 'userSpaceOnUse' ? v : box.minY + v * h);
  const mapR = (v: number): number => (units === 'userSpaceOnUse' ? v : v * Math.max(w, h));

  const frac = (raw: unknown, fallback: number): number => {
    if (raw === undefined || raw === null) return fallback;
    const s = String(raw);
    const n = parseFloat(s);
    if (Number.isNaN(n)) return fallback;
    return s.trim().endsWith('%') ? n / 100 : n;
  };

  let gradient: unknown;
  if (def.type === 'radialGradient') {
    if (!ctx.createRadialGradient) return undefined;
    const cx = mapX(frac(def.props?.['cx'], 0.5));
    const cy = mapY(frac(def.props?.['cy'], 0.5));
    const r = mapR(frac(def.props?.['r'], 0.5));
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r, 0.0001));
  } else {
    if (!ctx.createLinearGradient) return undefined;
    gradient = ctx.createLinearGradient(
      mapX(frac(def.props?.['x1'], 0)),
      mapY(frac(def.props?.['y1'], 0)),
      mapX(frac(def.props?.['x2'], 1)),
      mapY(frac(def.props?.['y2'], 0))
    );
  }

  const g = gradient as { addColorStop?: (offset: number, color: string) => void };
  if (typeof g?.addColorStop !== 'function') return undefined;

  for (const stop of stops) {
    const offset = frac(stop.props?.['offset'], 0);
    const color = String(stop.props?.['stopColor'] ?? stop.props?.['stop-color'] ?? '#000000');
    const opacity = toNumber(stop.props?.['stopOpacity'] ?? stop.props?.['stop-opacity']);
    g.addColorStop(
      Math.max(0, Math.min(1, offset)),
      opacity !== undefined && opacity < 1 ? applyAlpha(color, opacity) : color
    );
  }

  return gradient;
}

/** `#rrggbb` + alpha → `rgba(...)`. Non-hex colours pass through unchanged. */
function applyAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}
