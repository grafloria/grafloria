/**
 * edge-optimizer.ts — Wave 4 (Edges & links), Card 7
 *
 * ONE incremental pass that owns every diagram-wide edge constraint:
 *
 *   • JUMP-OVERS  — which links cross which, recomputed only where geometry
 *                   actually moved.
 *   • LABELS      — where each edge label can sit without landing on a node,
 *                   another label, or a link (this is what finally makes
 *                   `LinkLabel.autoOffset` do something; see below).
 *   • BUNDLES     — the parallel-link groups from Card 4, kept in step as links
 *                   are added, removed and re-routed.
 *
 * WHAT IT REPLACES
 * ----------------
 * Jump detection used to run inside `renderLink`, once per link per frame,
 * against EVERY other link in the diagram:
 *
 *     detectIntersections({id, points}, allOtherLinks.map(...))   // per link!
 *
 * That is O(L²·S²) segment-pair tests on every single frame — even when nothing
 * moved at all, and even while the user is merely panning. Here it becomes a
 * uniform-grid broad phase plus a dirty set: a frame in which nothing changed
 * does ZERO segment tests, and dragging one node only re-tests the links whose
 * cells that node's links touch.
 *
 * LATENT BUG THIS FIXES: `LinkLabel.autoOffset` ("Auto-position to avoid
 * overlaps") has been declared on the model since Phase 4 and was read by
 * NOBODY — dead config, the same shape of bug as `LinkStyle.curvature` in
 * Wave 3. It is now the flag that opts a label into the placement search below.
 *
 * EXACTNESS: the intersections this produces are the same set the per-link
 * detector produced (same primitive, same endpoint-touch exclusion, same
 * detect-mode filtering) — the grid is a broad phase, not an approximation. A
 * label with `autoOffset` unset keeps its author-given offset untouched, so no
 * existing diagram moves.
 *
 * Framework-agnostic and model-agnostic: plain data in, plain data out.
 */

import type { Point } from '@grafloria/engine';
import { JumpPointDetector, type Intersection, type DetectionMode } from './JumpPointDetector';

// ===========================================================================
// Frame input
// ===========================================================================

export interface OptimizerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A node, as far as the optimizer cares: an obstacle with an id. */
export interface OptimizerNode {
  id: string;
  rect: OptimizerRect;
}

/** A label awaiting placement. */
export interface OptimizerLabel {
  id: string;
  /** On-path anchor the label hangs off (world). */
  anchor: Point;
  /** The offset the AUTHOR asked for — the preferred placement, and the fallback. */
  offset: Point;
  /** Box size used for collision tests. */
  width: number;
  height: number;
  /** Opt-in to the collision search. Off ⇒ `offset` is returned verbatim. */
  autoOffset: boolean;
  /** Unit normal of the path at `anchor` — the axis the search pushes along. */
  normal: Point;
}

export interface OptimizerLink {
  id: string;
  /** The ROUTED polyline for this frame (post parallel-separation / self-loop). */
  points: Point[];
  /** Jump config, if this link draws jumps at all. */
  jumps?: {
    mode: DetectionMode;
    threshold: number;
  };
  labels: OptimizerLabel[];
}

export interface OptimizerFrame {
  nodes: OptimizerNode[];
  links: OptimizerLink[];
}

export interface EdgeOptimizerOptions {
  /**
   * Wave 5 (Edge routing) — Card 5. Who draws the arc when two jump-drawing
   * links cross:
   *   'both'   — legacy: each link bridges the other (a double bridge).
   *   'single' — exactly ONE deterministic owner per intersection: the link
   *              whose crossing segment is HORIZONTAL arcs over the vertical
   *              (the classic drafting convention); when neither or both are
   *              horizontal, the smaller link id owns. A crossing with a link
   *              that draws no jumps at all is always kept — someone must
   *              bridge it.
   * Default 'both', because wave-4's regression contract pins the optimizer's
   * crossings byte-identical to the legacy detector.
   */
  jumpOwnership?: 'both' | 'single';
  /**
   * Uniform-grid cell size (world px) for the link broad phase. Should be on the
   * order of a typical node — too small and long links occupy hundreds of cells,
   * too large and the broad phase stops filtering.
   */
  cellSize?: number;
  /** How far out the label search pushes, in steps of `labelStep`. */
  labelSearchSteps?: number;
  /** Distance between successive label candidates (px). */
  labelStep?: number;
}

/** Per-frame work counters — the incrementality is only real if these are 0 on a quiet frame. */
export interface OptimizerStats {
  /** Links whose geometry changed this frame. */
  dirtyLinks: number;
  /** Links whose jump set was recomputed (dirty ones + their grid neighbours). */
  jumpsRecomputed: number;
  /** Links that served their jump set from cache. */
  jumpsReused: number;
  /** Labels whose placement was searched. */
  labelsPlaced: number;
  /** Labels served from cache. */
  labelsReused: number;
  /** Segment-pair intersection tests actually performed. */
  segmentTests: number;
}

const DEFAULTS = {
  cellSize: 120,
  labelSearchSteps: 6,
  labelStep: 14,
  jumpOwnership: 'both' as 'both' | 'single',
};

/** Cost weights. Nodes hurt most, then labels, then link bodies. */
const W_NODE = 10;
const W_LABEL = 6;
const W_LINK = 3;
/** Gentle pull back toward the author's preferred offset — a tie-breaker, not a force. */
const W_DRIFT = 0.05;

export class EdgeOptimizer {
  private readonly detector = new JumpPointDetector();
  private readonly options: Required<EdgeOptimizerOptions>;

  // ---- incremental state ---------------------------------------------------
  /** linkId → signature of its polyline + jump config. */
  private linkSig = new Map<string, string>();
  /** linkId → its polyline (kept so a removed link can be pulled out of the grid). */
  private linkPoints = new Map<string, Point[]>();
  /** linkId → does it draw jumps at all (Card 5: ownership needs to know). */
  private linkDrawsJumps = new Map<string, boolean>();
  /** linkId → the grid cells it occupies. */
  private linkCells = new Map<string, string[]>();
  /** cell → link ids in it. */
  private grid = new Map<string, Set<string>>();
  /** linkId → cached jump intersections. */
  private jumpCache = new Map<string, Intersection[]>();
  /** `${linkId}::${labelId}` → resolved offset. */
  private labelCache = new Map<string, Point>();
  /** `${linkId}::${labelId}` → the box that offset produced (an obstacle for others). */
  private labelBoxes = new Map<string, OptimizerRect>();
  /** `${linkId}::${labelId}` → signature of the label's own inputs. */
  private labelSig = new Map<string, string>();
  /** nodeId → rect signature. */
  private nodeSig = new Map<string, string>();
  /** Live node rects (obstacles). */
  private nodes: OptimizerNode[] = [];

  private _stats: OptimizerStats = emptyStats();

  constructor(options: EdgeOptimizerOptions = {}) {
    this.options = {
      cellSize: options.cellSize ?? DEFAULTS.cellSize,
      labelSearchSteps: options.labelSearchSteps ?? DEFAULTS.labelSearchSteps,
      labelStep: options.labelStep ?? DEFAULTS.labelStep,
      jumpOwnership: options.jumpOwnership ?? DEFAULTS.jumpOwnership,
    };
  }

  get stats(): Readonly<OptimizerStats> {
    return this._stats;
  }

  /**
   * Run the pass for a frame. Cheap when little changed: a frame whose links and
   * nodes all carry the same signatures as last time performs zero segment tests
   * and zero label searches.
   */
  update(frame: OptimizerFrame): void {
    this._stats = emptyStats();

    // ---- 1. what moved? ----------------------------------------------------
    const dirty = new Set<string>();
    const seen = new Set<string>();
    /** Cells that are stale because a link entered or left them. */
    const touchedCells = new Set<string>();

    for (const link of frame.links) {
      seen.add(link.id);
      const sig = linkSignature(link);
      if (this.linkSig.get(link.id) === sig) continue;

      dirty.add(link.id);
      // Its OLD cells are stale (it left them) …
      for (const cell of this.linkCells.get(link.id) ?? []) {
        touchedCells.add(cell);
        this.grid.get(cell)?.delete(link.id);
      }
      // … and so are its new ones.
      const cells = this.cellsForPolyline(link.points);
      for (const cell of cells) {
        touchedCells.add(cell);
        let bucket = this.grid.get(cell);
        if (!bucket) {
          bucket = new Set();
          this.grid.set(cell, bucket);
        }
        bucket.add(link.id);
      }

      this.linkSig.set(link.id, sig);
      this.linkPoints.set(link.id, link.points);
      this.linkDrawsJumps.set(link.id, !!link.jumps);
      this.linkCells.set(link.id, cells);
    }

    // Links that disappeared: evict them from the grid and every cache.
    for (const id of Array.from(this.linkSig.keys())) {
      if (seen.has(id)) continue;
      for (const cell of this.linkCells.get(id) ?? []) {
        touchedCells.add(cell);
        this.grid.get(cell)?.delete(id);
      }
      this.linkSig.delete(id);
      this.linkPoints.delete(id);
      this.linkDrawsJumps.delete(id);
      this.linkCells.delete(id);
      this.jumpCache.delete(id);
      for (const key of Array.from(this.labelCache.keys())) {
        if (key.startsWith(`${id}::`)) {
          this.labelCache.delete(key);
          this.labelBoxes.delete(key);
          this.labelSig.delete(key);
        }
      }
    }

    // Nodes are obstacles for labels only — they do not affect jumps.
    const nodesChanged = this.syncNodes(frame.nodes);
    this._stats.dirtyLinks = dirty.size;

    // ---- 2. jumps: recompute the affected links only -----------------------
    // "Affected" = a link that moved, OR a link sharing a cell with one that
    // moved (its crossings may have appeared or vanished even though it sat
    // perfectly still).
    const affected = new Set<string>(dirty);
    if (touchedCells.size > 0) {
      for (const cell of touchedCells) {
        for (const id of this.grid.get(cell) ?? []) affected.add(id);
      }
    }

    for (const link of frame.links) {
      if (!link.jumps) {
        this.jumpCache.delete(link.id);
        continue;
      }
      if (!affected.has(link.id) && this.jumpCache.has(link.id)) {
        this._stats.jumpsReused++;
        continue;
      }
      this.jumpCache.set(link.id, this.computeJumps(link));
      this._stats.jumpsRecomputed++;
    }

    // ---- 3. labels: place the ones that opted in ---------------------------
    this.placeLabels(frame, dirty, nodesChanged);
  }

  /**
   * The crossings on this link, for the jump-point path builder. Empty when the
   * link draws no jumps.
   */
  getJumps(linkId: string): Intersection[] {
    return this.jumpCache.get(linkId) ?? [];
  }

  /**
   * The offset this label should actually be drawn at. For a label that did not
   * opt into `autoOffset` this is exactly the offset the author set.
   */
  getLabelOffset(linkId: string, labelId: string, fallback: Point): Point {
    return this.labelCache.get(`${linkId}::${labelId}`) ?? fallback;
  }

  /** Drop all state (renderer disposal, or a wholesale diagram swap). */
  reset(): void {
    this.linkSig.clear();
    this.linkPoints.clear();
    this.linkDrawsJumps.clear();
    this.linkCells.clear();
    this.grid.clear();
    this.jumpCache.clear();
    this.labelCache.clear();
    this.labelBoxes.clear();
    this.labelSig.clear();
    this.nodeSig.clear();
    this.nodes = [];
    this._stats = emptyStats();
  }

  // =========================================================================
  // jumps
  // =========================================================================

  /**
   * Crossings between `link` and its grid neighbours.
   *
   * Same primitive and same rules as the old per-link path — the difference is
   * only WHICH links are tested: the grid narrows the candidate set from "every
   * link in the diagram" to "links sharing a cell with one of my segments".
   */
  /**
   * Card 5: does `myId` own the crossing between MY segment (a→b) and the
   * other link's segment (c→d)? Horizontal arcs over vertical — the classic
   * drafting convention (an arc on a horizontal line reads as "this line jumps
   * that one"; an arc on a vertical reads as a kink). Neither-or-both
   * horizontal ties break on the smaller link id. Pure and symmetric: for any
   * crossing exactly one of the two links returns true.
   */
  private ownsCrossing(
    myId: string,
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    otherId: string
  ): boolean {
    const EPS = 1e-6;
    const mineHorizontal = Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS;
    const otherHorizontal = Math.abs(c.y - d.y) < EPS && Math.abs(c.x - d.x) > EPS;
    if (mineHorizontal !== otherHorizontal) return mineHorizontal;
    return myId < otherId;
  }

  private computeJumps(link: OptimizerLink): Intersection[] {
    const config = link.jumps;
    if (!config || link.points.length < 2) return [];

    const out: Intersection[] = [];
    const mine = link.points;

    for (let i = 0; i < mine.length - 1; i++) {
      const a = mine[i];
      const b = mine[i + 1];

      // Candidates: everything sharing a cell with THIS segment.
      const candidates = new Set<string>();
      for (const cell of this.cellsForSegment(a, b)) {
        for (const id of this.grid.get(cell) ?? []) {
          if (id !== link.id) candidates.add(id);
        }
      }
      if (candidates.size === 0) continue;

      // Deterministic order → deterministic output, regardless of Set insertion
      // order or how the grid happened to be built.
      for (const otherId of Array.from(candidates).sort()) {
        const other = this.linkPoints.get(otherId);
        if (!other || other.length < 2) continue;

        for (let j = 0; j < other.length - 1; j++) {
          this._stats.segmentTests++;
          const hit = this.detector.findIntersection(
            { start: a, end: b },
            { start: other[j], end: other[j + 1] }
          );
          if (!hit) continue;

          // Two links MEETING at a shared port touch but do not cross — never
          // draw a jump at a connection point. (Identical rule to the detector's.)
          const EPS = 1e-6;
          const touchesOwnEndpoint =
            (i === 0 && hit.t1 < EPS) || (i === mine.length - 2 && hit.t1 > 1 - EPS);
          const touchesOtherEndpoint =
            (j === 0 && hit.t2 < EPS) || (j === other.length - 2 && hit.t2 > 1 - EPS);
          if (touchesOwnEndpoint || touchesOtherEndpoint) continue;

          if (!includeByMode(hit.angle, config.mode, config.threshold)) continue;

          // Card 5: consistent jumpovers. Under 'single' ownership a crossing
          // between two jump-drawing links belongs to exactly one of them.
          if (
            this.options.jumpOwnership === 'single' &&
            this.linkDrawsJumps.get(otherId) &&
            !this.ownsCrossing(link.id, a, b, other[j], other[j + 1], otherId)
          ) {
            continue;
          }

          out.push({ ...hit, linkId: otherId, segmentIndex: i });
        }
      }
    }

    return out;
  }

  // =========================================================================
  // labels
  // =========================================================================

  private syncNodes(nodes: OptimizerNode[]): boolean {
    let changed = nodes.length !== this.nodeSig.size;
    const seen = new Set<string>();
    for (const node of nodes) {
      seen.add(node.id);
      const sig = `${node.rect.x},${node.rect.y},${node.rect.width},${node.rect.height}`;
      if (this.nodeSig.get(node.id) !== sig) {
        this.nodeSig.set(node.id, sig);
        changed = true;
      }
    }
    for (const id of Array.from(this.nodeSig.keys())) {
      if (!seen.has(id)) {
        this.nodeSig.delete(id);
        changed = true;
      }
    }
    this.nodes = nodes;
    return changed;
  }

  /**
   * Place every label that opted into `autoOffset`.
   *
   * Deterministic ORDER (link id, then label id) matters: labels placed earlier
   * become obstacles for the ones placed later, so a stable order is what makes
   * the result stable frame to frame. Labels that did not change and whose
   * neighbourhood did not change keep their cached placement — this is the
   * incremental half.
   */
  private placeLabels(frame: OptimizerFrame, dirtyLinks: Set<string>, nodesChanged: boolean): void {
    const ordered = frame.links
      .filter(l => l.labels.length > 0)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Retire cached boxes for labels that no longer exist, so a deleted label
    // stops shoving its neighbours around.
    const live = new Set<string>();
    for (const link of ordered) {
      for (const label of link.labels) live.add(`${link.id}::${label.id}`);
    }
    for (const key of Array.from(this.labelSig.keys())) {
      if (!live.has(key)) {
        this.labelSig.delete(key);
        this.labelCache.delete(key);
        this.labelBoxes.delete(key);
      }
    }

    for (const link of ordered) {
      for (const label of [...link.labels].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const key = `${link.id}::${label.id}`;

        // Not opted in: the author's offset is the answer, full stop. This is
        // what keeps every pre-Wave-4 diagram's labels exactly where they were.
        if (!label.autoOffset) {
          this.labelCache.set(key, { ...label.offset });
          this.labelBoxes.set(key, boxAt(label.anchor, label.offset, label.width, label.height));
          this.labelSig.set(key, labelSignature(label));
          continue;
        }

        const sig = labelSignature(label);
        const stale =
          this.labelSig.get(key) !== sig ||
          dirtyLinks.has(link.id) ||
          nodesChanged ||
          // A label near a link that moved has to be re-searched even if it did
          // not move itself — the thing it was avoiding may be gone, or a new
          // one may have arrived.
          this.nearDirty(this.labelBoxes.get(key), dirtyLinks);

        if (!stale && this.labelCache.has(key)) {
          this._stats.labelsReused++;
          continue;
        }

        const placed = this.searchLabelOffset(link.id, label, key);
        this.labelCache.set(key, placed);
        this.labelBoxes.set(key, boxAt(label.anchor, placed, label.width, label.height));
        this.labelSig.set(key, sig);
        this._stats.labelsPlaced++;
      }
    }
  }

  /** Does this box sit in a cell touched by a link that moved? */
  private nearDirty(box: OptimizerRect | undefined, dirtyLinks: Set<string>): boolean {
    if (!box || dirtyLinks.size === 0) return false;
    for (const cell of this.cellsForRect(box)) {
      for (const id of this.grid.get(cell) ?? []) {
        if (dirtyLinks.has(id)) return true;
      }
    }
    return false;
  }

  /**
   * Search outward from the author's offset for a placement that collides with
   * as little as possible.
   *
   * Candidates are generated ALONG THE PATH NORMAL — the one axis on which a
   * label can move without ceasing to describe its edge. The author's own offset
   * is candidate zero and wins every tie, so an `autoOffset` label that already
   * sits somewhere clear does not budge.
   */
  private searchLabelOffset(linkId: string, label: OptimizerLabel, key: string): Point {
    const { labelSearchSteps, labelStep } = this.options;

    let best: Point = { ...label.offset };
    let bestCost = this.labelCost(linkId, label, best, key);
    if (bestCost === 0) return best;

    for (let step = 1; step <= labelSearchSteps; step++) {
      // Both directions at each ring, nearest ring first: the label ends up as
      // close to where the author put it as the collisions allow.
      for (const sign of [1, -1] as const) {
        const candidate = {
          x: label.offset.x + label.normal.x * labelStep * step * sign,
          y: label.offset.y + label.normal.y * labelStep * step * sign,
        };
        const cost = this.labelCost(linkId, label, candidate, key);
        if (cost < bestCost) {
          bestCost = cost;
          best = candidate;
          if (bestCost === 0) return best;
        }
      }
    }

    return best;
  }

  /**
   * How bad is this placement? Overlap AREA (not a boolean) so the search
   * degrades gracefully in a crowded diagram: when nothing is free, it still
   * picks the least-covered spot rather than giving up on the first candidate.
   */
  private labelCost(linkId: string, label: OptimizerLabel, offset: Point, key: string): number {
    const box = boxAt(label.anchor, offset, label.width, label.height);
    let cost = 0;

    for (const node of this.nodes) {
      cost += W_NODE * overlapArea(box, node.rect);
    }

    for (const [otherKey, otherBox] of this.labelBoxes) {
      if (otherKey === key) continue;
      cost += W_LABEL * overlapArea(box, otherBox);
    }

    // Link bodies: only the ones sharing a cell with the box — this is the whole
    // point of keeping the grid.
    const near = new Set<string>();
    for (const cell of this.cellsForRect(box)) {
      for (const id of this.grid.get(cell) ?? []) near.add(id);
    }
    for (const id of near) {
      const pts = this.linkPoints.get(id);
      if (!pts) continue;
      // A label is ALLOWED to sit on its own link — that is where labels live.
      if (id === linkId) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        if (segmentIntersectsRect(pts[i], pts[i + 1], box)) {
          cost += W_LINK * label.height; // one link body crossing ≈ one row of text
        }
      }
    }

    cost += W_DRIFT * Math.hypot(offset.x - label.offset.x, offset.y - label.offset.y);
    return cost;
  }

  // =========================================================================
  // uniform grid
  // =========================================================================

  private cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private cellsForPolyline(points: Point[]): string[] {
    if (!points || points.length < 2) return [];
    const cells = new Set<string>();
    for (let i = 0; i < points.length - 1; i++) {
      for (const cell of this.cellsForSegment(points[i], points[i + 1])) {
        cells.add(cell);
      }
    }
    return Array.from(cells);
  }

  /**
   * Cells a segment touches. Uses the segment's bounding box rather than a
   * DDA walk: a diagonal segment over-reports a little, which costs a few extra
   * narrow-phase tests and can never MISS a crossing — the safe direction.
   */
  private cellsForSegment(a: Point, b: Point): string[] {
    return this.cellsForRect({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    });
  }

  private cellsForRect(rect: OptimizerRect): string[] {
    const size = this.options.cellSize;
    const x0 = Math.floor(rect.x / size);
    const y0 = Math.floor(rect.y / size);
    const x1 = Math.floor((rect.x + rect.width) / size);
    const y1 = Math.floor((rect.y + rect.height) / size);

    const cells: string[] = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        cells.push(this.cellKey(cx, cy));
      }
    }
    return cells;
  }
}

// ===========================================================================
// helpers
// ===========================================================================

function emptyStats(): OptimizerStats {
  return {
    dirtyLinks: 0,
    jumpsRecomputed: 0,
    jumpsReused: 0,
    labelsPlaced: 0,
    labelsReused: 0,
    segmentTests: 0,
  };
}

/** Rounded so sub-pixel jitter in a route does not count as "it moved". */
function linkSignature(link: OptimizerLink): string {
  const pts = link.points.map(p => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`).join(';');
  const jumps = link.jumps ? `${link.jumps.mode}:${link.jumps.threshold}` : '-';
  return `${pts}|${jumps}`;
}

function labelSignature(label: OptimizerLabel): string {
  return [
    Math.round(label.anchor.x * 10),
    Math.round(label.anchor.y * 10),
    label.offset.x,
    label.offset.y,
    label.width,
    label.height,
    label.autoOffset ? 1 : 0,
    Math.round(label.normal.x * 100),
    Math.round(label.normal.y * 100),
  ].join(',');
}

/** The label's box, centred on `anchor + offset`. */
function boxAt(anchor: Point, offset: Point, width: number, height: number): OptimizerRect {
  return {
    x: anchor.x + offset.x - width / 2,
    y: anchor.y + offset.y - height / 2,
    width,
    height,
  };
}

export function overlapArea(a: OptimizerRect, b: OptimizerRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Liang-Barsky: does the segment touch the rect at all? */
export function segmentIntersectsRect(a: Point, b: Point, rect: OptimizerRect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minX = rect.x;
  const minY = rect.y;
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;

  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, a.x - minX) &&
    clip(dx, maxX - a.x) &&
    clip(-dy, a.y - minY) &&
    clip(dy, maxY - a.y) &&
    t0 < t1
  );
}

/**
 * The detect-mode filter, lifted verbatim from JumpPointDetector so the two
 * cannot drift: 'perpendicular' is a fixed 75° cutoff, 'threshold' honours the
 * link's own angle, 'all' takes everything.
 */
function includeByMode(angle: number, mode: DetectionMode, threshold: number): boolean {
  switch (mode) {
    case 'perpendicular':
      return angle >= 75;
    case 'threshold':
      return angle >= threshold;
    case 'all':
    default:
      return true;
  }
}
