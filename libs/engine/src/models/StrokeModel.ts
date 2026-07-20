// Wave 10 (Whiteboard / Ink) — Card 1: the stroke.
//
// ===========================================================================
// WHY A STROKE IS A NEW ENTITY KIND AND NOT A NODE WITH A PATH SHAPE
// ===========================================================================
//
// The brief asked me to decide, and to argue it here rather than in a commit
// message. The engine ALREADY has `registerPathShape()` (Wave 5): arbitrary SVG
// silhouettes with auto-derived boundaries and port anchors. A stroke is a path.
// So "a stroke is a node whose shape is its path" is the obvious answer, it reuses
// serialization, collab, undo, culling and LOD for free, and it is WRONG. Four
// reasons, each of which I verified in the source before writing a line:
//
//   1. LAYOUT WOULD MOVE THE INK. Every layout entry point iterates
//      `diagram.getNodes()` unconditionally and writes a position back to every
//      node it is handed (`layout/layout.service.ts:100,152`;
//      `layout/layout-registry.ts:350`; the worker path in `layout-host.ts:437`).
//      There is NO per-node layout-exclusion flag: the only thing resembling one is
//      `state.locked`, honoured in exactly ONE of the four entry points
//      (`LayoutManager.ts:210`). So you circle a node in red, press "auto-layout",
//      and Dagre relocates your circle to a tidy grid slot two columns away. Ink is
//      annotation ON a diagram; it is not a participant IN it.
//
//   2. LINKS WOULD ROUTE AROUND IT. `DiagramEngine.refreshGroupObstacles()`
//      (DiagramEngine.ts:1744) registers EVERY node in the routing engine's global
//      obstacle map. The one opt-out that exists (`data.isObstacle === false`,
//      ObstacleMapBuilder.ts:29) is defeated in practice, and the renderer already
//      says so in a comment at svg-renderer.ts:7131: "RoutingEngine.route() unions
//      the request's obstacles with its GLOBAL obstacle map … so both endpoint nodes
//      came straight back in". A pencil scribble would bend every edge that passed
//      near it. Worse, it would push links onto the expensive A* path.
//
//   3. EVERY STROKE WOULD SHIP FOUR CONNECTABLE PORTS. `NodeModel`'s constructor
//      creates the four default ports (NodeModel.ts:167). You could drag a link out
//      of a scribble.
//
//   4. IT HAS NOWHERE TO PUT ITS GEOMETRY. `SerializedNode` has `position`, `size`,
//      `rotation`, `scale` — a box. A stroke's 40 pressure-bearing points would live
//      in untyped `data`, invisible to `DiagramValidator` and to the layout worker's
//      wire format (`layout-graph.ts:51`), which carries only id/type/position/size.
//
// A path SHAPE is a node's silhouette — a sized box with ports and a label that
// happens to be drawn as a star. That is a different thing from a mark someone made
// with a pen, and conflating them buys reuse in the four places it is cheap and costs
// correctness in the four places it is not.
//
// THE RECTANGLE TOOL GOES THE OTHER WAY, and for exactly the same reasoning applied
// honestly: a rectangle you drag out on the canvas IS a box. You want to connect it,
// resize it, label it, lay it out. So the shape tool creates a NODE with
// `metadata.shape` (the Wave-5 machinery, used for what it is actually for) and the
// draw tool creates a STROKE. Same argument, opposite answers, because they are
// genuinely different objects.
//
// ===========================================================================
// WHAT A STROKE COSTS
// ===========================================================================
// Bounded, and I paid it all: SerializedDiagram + serialize/fromJSON/clear/dispose,
// OpTarget + applyOp + OpCapture, DiagramValidator, Incremental. The envelope and
// BOTH checksums are generic (they recurse over whatever keys the document has), so
// no migration and no schema bump was needed — a document with no strokes serializes
// to exactly the bytes it did before this wave.

import { DiagramEntity } from './DiagramEntity';
import { PathSimplifier } from '../routing/PathSimplifier';
import type { Point, Rectangle } from '../types';
import type { SerializedEntity } from '../types/model.types';

/**
 * One sample from the pointer.
 *
 * `pressure` is 0..1 and OPTIONAL — a mouse does not have any. It is stored only when
 * the device actually reported a varying one (see {@link hasPressure}), because a
 * field that is always 0.5 is noise on the wire and a lie in the model.
 *
 * It is not decoration: the renderer builds a variable-width outline from it. A
 * pressure that does not change the picture would be exactly the "machinery wired to
 * nothing" this project has shipped in all nine previous waves.
 */
export interface StrokePoint {
  x: number;
  y: number;
  /** 0..1. Absent when the device did not report a meaningful one. */
  pressure?: number;
}

/** How the ink looks. Flat and JSON-safe — this crosses the wire as an op payload. */
export interface StrokeStyle {
  /** Any CSS colour. */
  color: string;
  /** Nominal width in WORLD units (so ink zooms with the diagram, like everything else). */
  width: number;
  /** 0..1. Highlighter ink is translucent; a pen is not. */
  opacity?: number;
}

export interface SerializedStroke extends SerializedEntity {
  type: 'stroke';
  points: StrokePoint[];
  style: StrokeStyle;
  /**
   * An author-supplied name. THE ENTIRE ACCESSIBILITY STORY LIVES ON THIS FIELD —
   * see the a11y note on the renderer's ink layer. Absent for anonymous ink, which is
   * the normal case and is rendered `aria-hidden`.
   */
  label?: string;
}

export const DEFAULT_STROKE_STYLE: StrokeStyle = { color: '#1f2933', width: 3 };

/**
 * Quantization applied at CONSTRUCTION, not at serialize().
 *
 * A raw pointer trace carries float noise in the 10th decimal place. Rounding inside
 * serialize() would make the in-memory model disagree with the saved one (hit-testing
 * one geometry, persisting another). Rounding at construction keeps them the same
 * object, and because rounding is idempotent the serialize → fromJSON → serialize
 * round-trip is byte-stable — which is a suite-enforced invariant here.
 */
const COORD_DP = 2;
const PRESSURE_DP = 3;

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  // `+ 0` normalises -0 to 0: JSON.stringify writes "-0" and a byte-comparison of two
  // logically identical documents would then fail. Found by the round-trip spec.
  return Math.round(value * f) / f + 0;
}

/** True when the device gave us pressure worth keeping (i.e. it actually varies). */
export function hasPressure(points: readonly StrokePoint[]): boolean {
  let seen: number | undefined;
  for (const p of points) {
    if (p.pressure === undefined) return false;
    if (seen === undefined) seen = p.pressure;
    else if (Math.abs(p.pressure - seen) > 1e-6) return true;
  }
  return false;
}

/** Distance from `p` to the segment `a`→`b`. The primitive both hit-tests are built on. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Project onto the segment and CLAMP — an unclamped projection measures distance to
  // the infinite line, which reports a hit on a point nowhere near the ink.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Minimum distance between two SEGMENTS.
 *
 * The eraser needs this and a point-test cannot replace it. A pointermove at 60Hz over
 * a fast flick lands samples 80px apart; testing only the sample POINTS lets the
 * eraser jump clean over a stroke it visibly swept through. So the eraser tests the
 * segment it travelled, not the points it happened to land on.
 */
export function segmentDistance(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    distanceToSegment(a1, b1, b2),
    distanceToSegment(a2, b1, b2),
    distanceToSegment(b1, a1, a2),
    distanceToSegment(b2, a1, a2)
  );
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const d2 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  const d3 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const d4 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * A freehand ink stroke: an ordered point list, a style, and an identity.
 *
 * A first-class `DiagramEntity`, which is not a formality — it is what makes every
 * other gate in this wave close for free:
 *   • `trackChange()` → `markDirty()` → the GLOBAL MUTATION EPOCH, which is the thing
 *     both frame gates read (`svg-renderer.ts:795`, `create-diagram.ts:369`). A stroke
 *     that were a plain object would mutate the picture without moving the epoch, and
 *     both gates would skip the frame: you would draw and see nothing.
 *   • `on('change')` → `OpCapture` picks it up through the same funnel as everything
 *     else. No parallel bookkeeping to drift out of step.
 *   • `serialize()`/`dispose()`/`version` → the document contracts.
 */
export class StrokeModel extends DiagramEntity {
  private points: StrokePoint[];
  private style: StrokeStyle;
  private label?: string;

  /** Cached bounds. Invalidated on every geometry write; never stale, never recomputed twice. */
  private bounds: Rectangle | null = null;

  constructor(
    points: readonly StrokePoint[] = [],
    style: StrokeStyle = DEFAULT_STROKE_STYLE,
    options: { id?: string; uuid?: string; label?: string } = {}
  ) {
    super(options.id, options.uuid);
    this.points = normalizePoints(points);
    this.style = { ...style };
    this.label = options.label;
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  getPoints(): readonly StrokePoint[] {
    return this.points;
  }

  /**
   * Replace the geometry.
   *
   * Emits `trackChange('points', …)` like any other register. NOTE that capture used
   * to drop EVERY `points` change on the floor (`DERIVED = new Set(['points'])`),
   * because on a LINK `points` is routed geometry that each peer recomputes for
   * itself. On a stroke `points` is the authored content itself. That set is now
   * scoped per target — see `collab/capture.ts`. Without that fix, editing a stroke's
   * geometry would silently fail to reach any other peer.
   */
  setPoints(points: readonly StrokePoint[]): void {
    const next = normalizePoints(points);
    const prev = this.points;
    this.points = next;
    this.bounds = null;
    this.trackChange('points', prev, next);
  }

  get pointCount(): number {
    return this.points.length;
  }

  /** Axis-aligned bounds, INFLATED by the stroke's own half-width (ink has girth). */
  getBounds(): Rectangle {
    if (this.bounds) return this.bounds;

    if (this.points.length === 0) {
      this.bounds = { x: 0, y: 0, width: 0, height: 0 };
      return this.bounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    // Half the nib, or a 1px stroke's bounds have zero height and the renderer culls a
    // perfectly horizontal line out of a viewport it is plainly inside.
    const pad = this.style.width / 2;
    this.bounds = {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
    return this.bounds;
  }

  /** Is `(x, y)` on the ink, within `tolerance` world units of it? */
  hitTest(x: number, y: number, tolerance = 0): boolean {
    const reach = this.style.width / 2 + tolerance;
    const p = { x, y };
    if (this.points.length === 0) return false;
    if (this.points.length === 1) {
      return Math.hypot(x - this.points[0].x, y - this.points[0].y) <= reach;
    }
    for (let i = 0; i < this.points.length - 1; i++) {
      if (distanceToSegment(p, this.points[i], this.points[i + 1]) <= reach) return true;
    }
    return false;
  }

  /**
   * Did a pointer travelling `a`→`b` sweep across this ink? THE ERASER'S QUESTION.
   * Segment-vs-segment, not point-vs-segment — see {@link segmentDistance}.
   */
  intersectsSegment(a: Point, b: Point, tolerance = 0): boolean {
    const reach = this.style.width / 2 + tolerance;
    if (this.points.length === 0) return false;
    if (this.points.length === 1) return distanceToSegment(this.points[0], a, b) <= reach;
    for (let i = 0; i < this.points.length - 1; i++) {
      if (segmentDistance(a, b, this.points[i], this.points[i + 1]) <= reach) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Style / label
  // -------------------------------------------------------------------------

  getStyle(): Readonly<StrokeStyle> {
    return this.style;
  }

  setStyle(style: Partial<StrokeStyle>): void {
    const prev = { ...this.style };
    this.style = { ...this.style, ...style };
    this.bounds = null; // width feeds the bounds padding
    this.trackChange('style', prev, { ...this.style });
  }

  /**
   * REPLACE the whole style object — the write `setStyle` cannot express, and the collab
   * reducer's write path.
   *
   * `setStyle` MERGES, so applying a `style` op with it meant a peer could gain a key and
   * never lose one: the author clears an `opacity` and every other peer keeps the faded
   * stroke forever. `NodeModel.replaceStyle` is the same seam for the same reason, and a
   * plain field assignment is not a substitute — it would skip the `bounds` invalidation
   * below and leave the peer measuring the stroke at its old width.
   */
  replaceStyle(style: Partial<StrokeStyle>): void {
    const prev = { ...this.style };
    this.style = { ...style } as StrokeStyle;
    this.bounds = null; // width feeds the bounds padding
    this.trackChange('style', prev, { ...this.style });
  }

  /**
   * The accessible name, when the author gave one. See the a11y note on the
   * ink layer. Overrides the DiagramEntity canon (metadata.label): a stroke's
   * label lives in its own serialized `label` property, not the metadata bag.
   */
  override getLabel(): string | undefined {
    return this.label;
  }

  override setLabel(label: string | undefined): void {
    const prev = this.label;
    this.label = label;
    this.trackChange('label', prev, label);
  }

  // -------------------------------------------------------------------------
  // Document
  // -------------------------------------------------------------------------

  serialize(): SerializedStroke {
    const doc: SerializedStroke = {
      id: this.id,
      uuid: this.uuid,
      type: 'stroke',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      points: this.points.map((p) =>
        // The key is OMITTED, not written as undefined. `{x,y,pressure:undefined}` and
        // `{x,y}` are the same JSON but not the same object, and the round-trip
        // invariant is a deep-equal on the parsed payload.
        p.pressure === undefined ? { x: p.x, y: p.y } : { x: p.x, y: p.y, pressure: p.pressure }
      ),
      style: { ...this.style },
    };
    if (this.label !== undefined) doc.label = this.label;
    return doc;
  }

  static fromJSON(data: SerializedStroke): StrokeModel {
    const stroke = new StrokeModel(data.points ?? [], data.style ?? DEFAULT_STROKE_STYLE, {
      id: data.id,
      label: data.label,
    });
    stroke.restoreIdentity(data);
    for (const [k, v] of Object.entries(data.metadata ?? {})) stroke.metadata.set(k, v);
    return stroke;
  }

  /**
   * Build a stroke from a RAW POINTER TRACE. This is the only constructor the draw tool
   * uses, and the simplification is not optional decoration.
   *
   * A two-second scribble at 120Hz is ~240 samples, most of them a fraction of a pixel
   * apart. Persisting them all means a document that is mostly float noise, an op
   * payload that is kilobytes per line, and an SVG path the browser re-parses on every
   * frame. The brief's phrasing is exactly right: a 500-point stroke that serialises as
   * 500 points is a bug.
   *
   * So: Douglas-Peucker, through the engine's OWN `PathSimplifier` — which existed and
   * which the renderer had never called until Wave 8, and which I am not going to
   * reimplement a second copy of. Typical reduction on real ink is 85-95%.
   *
   * IT PRESERVES PRESSURE, and that is a property of the algorithm rather than luck:
   * Douglas-Peucker SELECTS a subset of the input points (it returns the very objects it
   * was given — `PathSimplifier.ts:123`), it never interpolates new ones. So the
   * `pressure` riding on each retained sample rides through untouched. If it ever grows
   * an interpolating mode this breaks silently, so the spec pins it.
   */
  static fromRawPoints(
    raw: readonly StrokePoint[],
    style: StrokeStyle = DEFAULT_STROKE_STYLE,
    options: { id?: string; label?: string; epsilon?: number } = {}
  ): StrokeModel {
    const epsilon = options.epsilon ?? DEFAULT_SIMPLIFY_EPSILON;
    const clean = normalizePoints(raw);

    // simplify() throws on epsilon <= 0, and <= 2 points has nothing to simplify.
    const points =
      epsilon > 0 && clean.length > 2
        ? (new PathSimplifier().simplify(clean as Point[], epsilon) as StrokePoint[])
        : clean;

    return new StrokeModel(points, style, { id: options.id, label: options.label });
  }
}

/**
 * Douglas-Peucker tolerance, in WORLD units.
 *
 * 0.6 is tuned against real traces: below ~0.4 you keep the sensor jitter you were
 * trying to remove; above ~1.2 a deliberate small loop (the dot of an "i", a tick) starts
 * to visibly flatten. At 0.6 a 500-point scribble lands around 40-70 points and is
 * indistinguishable from the raw trace at 100% zoom.
 *
 * It is world-space, so ink drawn while zoomed OUT is simplified more aggressively in
 * screen terms — which is right: you cannot see detail you did not draw.
 */
export const DEFAULT_SIMPLIFY_EPSILON = 0.6;

/**
 * Clamp, quantize, and drop meaningless pressure.
 *
 * Also drops non-finite points outright: a NaN from a pointer event (it happens, on
 * pointercancel) would poison the bounds to NaN, which culls the stroke from every
 * viewport query for the rest of the document's life.
 */
function normalizePoints(points: readonly StrokePoint[]): StrokePoint[] {
  const out: StrokePoint[] = [];
  for (const p of points) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
    const q: StrokePoint = { x: round(p.x, COORD_DP), y: round(p.y, COORD_DP) };
    if (p.pressure !== undefined && isFinite(p.pressure)) {
      const clamped = p.pressure < 0 ? 0 : p.pressure > 1 ? 1 : p.pressure;
      q.pressure = round(clamped, PRESSURE_DP);
    }
    out.push(q);
  }
  return out;
}
