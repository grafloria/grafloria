/**
 * ============================================================================
 * Card 2 — the three link-pipeline seams that were genuinely MISSING
 * ============================================================================
 *
 * Wave 5 shipped a per-link `router` × `connector` contract, and the ROUTER half
 * is fully pluggable (`RoutingEngine.registerRouter` — a custom router is
 * addressable per link by its registration name). The audit for Wave 6 found
 * that the other three stages had no registry at all:
 *
 *   stage          before Wave 6                         after
 *   ─────────────  ────────────────────────────────────  ──────────────────────
 *   router         ✅ RoutingEngine.registerRouter        (unchanged — wrapped)
 *   anchor         ❌ did not exist                       registerAnchor()
 *   connectionPoint ❌ a single `smartConnectionPoints`    registerConnectionPoint()
 *                     BOOLEAN on the renderer config
 *   connector      ❌ a 4-arm switch; a custom name was    registerConnector()
 *                     SILENTLY dropped back to pathType
 *
 * The connector gap was a live instance of this codebase's #1 bug shape.
 * `LinkConnectorName` is `'straight' | 'rounded' | 'smooth' | 'bezier' | (string
 * & {})` — the `(string & {})` arm ADVERTISES custom connectors, and the
 * renderer's switch quietly fell through to `link.pathType` for any name it did
 * not recognise. You could set `connector: 'my-connector'`, get no error, and
 * see the default line. It is now a real registry, consulted by name.
 *
 * ---------------------------------------------------------------------------
 * The vocabulary (matches JointJS, which is the clearest prior art)
 * ---------------------------------------------------------------------------
 *
 *   ANCHOR            where on a node/port the link attaches.
 *                     Per END. `(node, port, opposite) → point (+ side)`.
 *
 *   CONNECTION POINT  a whole-link strategy that gets to decide BOTH ends
 *                     together — needed because the interesting strategies are
 *                     inherently two-ended (draw.io-style "smart" attachment
 *                     slides both ends to line up with each other).
 *                     `(link, source, target) → { start, end }`.
 *
 *   ROUTER            point A → point B via a polyline (obstacle avoidance).
 *                     Already pluggable on the RoutingEngine.
 *
 *   CONNECTOR         that polyline → an SVG path `d` string.
 *                     `(points, style) → 'M … L … C …'`.
 *
 * All four are consumed end-to-end by the SVG renderer. None of them is a
 * declared-but-unread flag: `link-pipeline.consumption.spec.ts` drives each one
 * THROUGH `SVGRenderer.render()` and asserts on the emitted VNode tree.
 */

import type { LinkModel, LinkStyle, NodeModel, PortModel } from '@grafloria/engine';
import type { Disposer } from './disposable';
import { snapshotRestore } from './disposable';

// ===========================================================================
// Shared geometry vocabulary
// ===========================================================================

export interface ExtPoint {
  x: number;
  y: number;
}

/** A node's world-space box. */
export interface ExtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ExtSide = 'left' | 'right' | 'top' | 'bottom';

/** One end of a link, as the strategies see it. */
export interface LinkEnd {
  node: NodeModel;
  /** The assigned port, when the link has one. */
  port: PortModel | null;
  /** The node's world rect. */
  rect: ExtRect;
}

// ===========================================================================
// 1. ANCHORS — where on ONE end the link attaches
// ===========================================================================

export interface AnchorContext {
  /** The end being anchored. */
  end: LinkEnd;
  /** The OTHER end's node — direction-aware anchors (perimeter) need it. */
  other: LinkEnd;
  /** The link, for reading style/metadata. */
  link: LinkModel;
  /**
   * The point the DEFAULT (port-based) pipeline would have produced. An anchor
   * that only wants to nudge the default does not have to recompute it.
   */
  defaultPoint: ExtPoint;
  /** Free-form args from `link.metadata.sourceAnchorArgs` / `targetAnchorArgs`. */
  args: Record<string, unknown>;
}

export interface AnchorResult {
  point: ExtPoint;
  /** The side the link should LEAVE from. Routers use it to pick the exit stub. */
  side?: ExtSide;
}

export type AnchorFn = (ctx: AnchorContext) => AnchorResult;

const anchors = new Map<string, AnchorFn>();

/**
 * Register a named anchor. Address it per link via
 * `link.metadata.sourceAnchor` / `link.metadata.targetAnchor`.
 *
 * @returns a disposer that RESTORES whatever was registered under this name
 *          before (so overriding a built-in is reversible).
 */
export function registerAnchor(name: string, fn: AnchorFn): Disposer {
  const previous = anchors.get(name);
  anchors.set(name, fn);
  bumpPipeline();
  return snapshotRestore(
    previous,
    (value) => {
      anchors.set(name, value);
      bumpPipeline();
    },
    () => {
      anchors.delete(name);
      bumpPipeline();
    }
  );
}

export function getAnchor(name: string): AnchorFn | undefined {
  return anchors.get(name);
}

export function hasAnchor(name: string): boolean {
  return anchors.has(name);
}

export function listAnchors(): string[] {
  return [...anchors.keys()];
}

// ===========================================================================
// 2. CONNECTION POINTS — a whole-link, two-ended strategy
// ===========================================================================

export interface ConnectionPointContext {
  link: LinkModel;
  source: LinkEnd;
  target: LinkEnd;
  /** What the default port-based pipeline would have produced for both ends. */
  defaults: ConnectionPointResult;
  /**
   * The shape registry's boundary solver, handed in so a strategy can attach to
   * a node's REAL silhouette (a diamond's slanted face, a custom path shape)
   * without importing the shape registry itself.
   */
  boundaryPoint(node: NodeModel, rect: ExtRect, side: ExtSide, cross: number): ExtPoint;
  /**
   * The nearest VISIBLE port on a side, or null. Strategies use it to honour the
   * rule that visible ports win over free-floating attachment.
   */
  nearestVisiblePort(node: NodeModel, side: ExtSide, near: ExtPoint): ExtPoint | null;
  /**
   * The nearest port on a side REGARDLESS of visibility, or null. The
   * 'port-facing' default uses it: a node's ports are its connection anatomy
   * whether or not the glyphs are currently drawn, so attachment must not
   * change when visibility does (an endpoint that jumps when you hover a node
   * is worse than either behaviour it jumps between).
   */
  nearestPort(node: NodeModel, side: ExtSide, near: ExtPoint): ExtPoint | null;
}

export interface ConnectionPointResult {
  start: ExtPoint;
  end: ExtPoint;
  sourceDirection?: ExtSide;
  targetDirection?: ExtSide;
}

/** Return `null` to decline and fall through to the default pipeline. */
export type ConnectionPointFn = (ctx: ConnectionPointContext) => ConnectionPointResult | null;

const connectionPoints = new Map<string, ConnectionPointFn>();

/**
 * Register a named connection-point strategy. Address it per link via
 * `link.metadata.connectionPoint`, or set it as the diagram-wide default with
 * the renderer's `connectionPoint` config.
 *
 * The built-in `'smart'` strategy is the draw.io-style floating attachment that
 * used to be reachable ONLY through the boolean `smartConnectionPoints` config
 * flag. That flag still works (it now selects this strategy by name), so nothing
 * that relied on it changes behaviour.
 */
export function registerConnectionPoint(name: string, fn: ConnectionPointFn): Disposer {
  const previous = connectionPoints.get(name);
  connectionPoints.set(name, fn);
  bumpPipeline();
  return snapshotRestore(
    previous,
    (value) => {
      connectionPoints.set(name, value);
      bumpPipeline();
    },
    () => {
      connectionPoints.delete(name);
      bumpPipeline();
    }
  );
}

export function getConnectionPoint(name: string): ConnectionPointFn | undefined {
  return connectionPoints.get(name);
}

export function hasConnectionPoint(name: string): boolean {
  return connectionPoints.has(name);
}

export function listConnectionPoints(): string[] {
  return [...connectionPoints.keys()];
}

// ===========================================================================
// 3. CONNECTORS — routed polyline → SVG path `d`
// ===========================================================================

export interface ConnectorContext {
  /** The routed polyline in world coordinates. Never empty; never length 1. */
  points: ExtPoint[];
  /**
   * The link being drawn. Optional because a few internal call sites (the
   * connection PREVIEW, which has no LinkModel yet) also build paths.
   */
  link?: LinkModel;
  style?: Partial<LinkStyle>;
  /** The corner radius the renderer resolved for this link. */
  cornerRadius: number;
}

/** Must return a complete SVG path `d`. */
export type ConnectorFn = (ctx: ConnectorContext) => string;

const connectors = new Map<string, ConnectorFn>();

/**
 * Register a named connector. Address it per link via `link.connector`
 * (the field Wave 5 already added and serializes).
 *
 * The four built-in names — `straight` / `rounded` / `smooth` / `bezier` — are
 * NOT in this map: they are the renderer's own internal branches and stay
 * exactly as they were. This registry is consulted only for names the renderer
 * does not recognise, which is precisely the case that used to be dropped.
 */
export function registerConnector(name: string, fn: ConnectorFn): Disposer {
  const previous = connectors.get(name);
  connectors.set(name, fn);
  bumpPipeline();
  return snapshotRestore(
    previous,
    (value) => {
      connectors.set(name, value);
      bumpPipeline();
    },
    () => {
      connectors.delete(name);
      bumpPipeline();
    }
  );
}

export function getConnector(name: string): ConnectorFn | undefined {
  return connectors.get(name);
}

export function hasConnector(name: string): boolean {
  return connectors.has(name);
}

export function listConnectors(): string[] {
  return [...connectors.keys()];
}

// ===========================================================================
// Invalidation — the renderer caches link VNodes, so a (re)definition must
// be able to drop those caches or it would never become visible.
// (Same protocol edge-templates already exposes.)
// ===========================================================================

let pipelineVersion = 0;
const pipelineListeners = new Set<() => void>();

function bumpPipeline(): void {
  pipelineVersion++;
  for (const listener of [...pipelineListeners]) listener();
}

export function getLinkPipelineVersion(): number {
  return pipelineVersion;
}

export function onLinkPipelineChange(listener: () => void): Disposer {
  pipelineListeners.add(listener);
  return () => pipelineListeners.delete(listener);
}

/** Drop every registration (tests, host teardown). Built-ins are re-seeded. */
export function clearLinkPipeline(): void {
  anchors.clear();
  connectionPoints.clear();
  connectors.clear();
  installBuiltinLinkPipeline();
  bumpPipeline();
}

// ===========================================================================
// Built-ins
// ===========================================================================

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const centreOf = (r: ExtRect): ExtPoint => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * The side of `rect` you would leave from to head towards `towards` — the same
 * dominant-axis rule the built-in smart strategy uses.
 */
export function sideTowards(rect: ExtRect, towards: ExtPoint): ExtSide {
  const c = centreOf(rect);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0
      ? 'right'
      : 'left'
    : dy >= 0
      ? 'bottom'
      : 'top';
}

function installBuiltinLinkPipeline(): void {
  // -- anchors --------------------------------------------------------------

  /** The node's centre. Links visually terminate under the node body. */
  anchors.set('center', ({ end }) => ({ point: centreOf(end.rect) }));

  /**
   * The point on the node's REAL outline facing the other end. Uses the shape
   * registry's boundary solver via the default point's owner, so a diamond
   * attaches on its slanted face rather than its bounding box.
   */
  anchors.set('perimeter', ({ end, other }) => {
    const oc = centreOf(other.rect);
    const side = sideTowards(end.rect, oc);
    const r = end.rect;
    // Cross-axis coordinate: aim straight at the other end's centre, clamped to
    // this node's span so the attachment never slides off the edge it is on.
    const cross =
      side === 'left' || side === 'right'
        ? clamp(oc.y, r.y, r.y + r.h)
        : clamp(oc.x, r.x, r.x + r.w);
    const point =
      side === 'left'
        ? { x: r.x, y: cross }
        : side === 'right'
          ? { x: r.x + r.w, y: cross }
          : side === 'top'
            ? { x: cross, y: r.y }
            : { x: cross, y: r.y + r.h };
    return { point, side };
  });

  /** Fixed side midpoints — the "always leave from the top" case. */
  const fixedSide = (side: ExtSide): AnchorFn => ({ end }) => {
    const r = end.rect;
    const point =
      side === 'left'
        ? { x: r.x, y: r.y + r.h / 2 }
        : side === 'right'
          ? { x: r.x + r.w, y: r.y + r.h / 2 }
          : side === 'top'
            ? { x: r.x + r.w / 2, y: r.y }
            : { x: r.x + r.w / 2, y: r.y + r.h };
    return { point, side };
  };
  anchors.set('left', fixedSide('left'));
  anchors.set('right', fixedSide('right'));
  anchors.set('top', fixedSide('top'));
  anchors.set('bottom', fixedSide('bottom'));

  // -- connection points ----------------------------------------------------

  /**
   * `'smart'` — draw.io-style floating attachment, PORTED VERBATIM from the
   * renderer's `smartConnectionPoints` branch (same PAD, same overlap rule, same
   * visible-port snap, same re-aim). It is bit-for-bit the behaviour the boolean
   * flag produced; the flag now simply selects this strategy by name.
   */
  connectionPoints.set('smart', (ctx) => {
    const { source, target, boundaryPoint, nearestVisiblePort } = ctx;
    const s = source.rect;
    const t = target.rect;
    const sc = centreOf(s);
    const tc = centreOf(t);
    const dx = tc.x - sc.x;
    const dy = tc.y - sc.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const srcSide: ExtSide = horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';
    const tgtSide: ExtSide = horizontal ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom';

    const PAD = 10; // keep the attachment off the node corners

    let srcCross: number;
    let tgtCross: number;
    if (horizontal) {
      const lo = Math.max(s.y, t.y) + PAD;
      const hi = Math.min(s.y + s.h, t.y + t.h) - PAD;
      if (lo <= hi) {
        srcCross = tgtCross = clamp((sc.y + tc.y) / 2, lo, hi);
      } else {
        srcCross = clamp(tc.y, s.y + PAD, s.y + s.h - PAD);
        tgtCross = clamp(sc.y, t.y + PAD, t.y + t.h - PAD);
      }
    } else {
      const lo = Math.max(s.x, t.x) + PAD;
      const hi = Math.min(s.x + s.w, t.x + t.w) - PAD;
      if (lo <= hi) {
        srcCross = tgtCross = clamp((sc.x + tc.x) / 2, lo, hi);
      } else {
        srcCross = clamp(tc.x, s.x + PAD, s.x + s.w - PAD);
        tgtCross = clamp(sc.x, t.x + PAD, t.x + t.w - PAD);
      }
    }

    let start = boundaryPoint(source.node, s, srcSide, srcCross);
    let end = boundaryPoint(target.node, t, tgtSide, tgtCross);

    const srcSnap = nearestVisiblePort(source.node, srcSide, start);
    const tgtSnap = nearestVisiblePort(target.node, tgtSide, end);
    if (srcSnap) start = srcSnap;
    if (tgtSnap) end = tgtSnap;
    if (srcSnap && !tgtSnap) {
      end = boundaryPoint(
        target.node,
        t,
        tgtSide,
        horizontal ? clamp(start.y, t.y + PAD, t.y + t.h - PAD) : clamp(start.x, t.x + PAD, t.x + t.w - PAD)
      );
    } else if (tgtSnap && !srcSnap) {
      start = boundaryPoint(
        source.node,
        s,
        srcSide,
        horizontal ? clamp(end.y, s.y + PAD, s.y + s.h - PAD) : clamp(end.x, s.x + PAD, s.x + s.w - PAD)
      );
    }

    return { start, end, sourceDirection: srcSide, targetDirection: tgtSide };
  });

  /**
   * `'port'` — the default. Declines, so the renderer's existing port-based
   * endpoint code runs untouched. Registered by name so that `connectionPoint:
   * 'port'` is expressible and so `listConnectionPoints()` tells the truth.
   */
  connectionPoints.set('port', () => null);

  /**
   * `'port-facing'` — the AUTO default for spec edges that named no handle.
   *
   * Sides are chosen exactly like `'smart'` (whichever face the partner), but
   * the attachment is the nearest PORT on that side — visible or not — never a
   * free perimeter point. Rationale, from a user watching custom-nodes: "lines
   * are normally connected to ports"; a perimeter point that slides along the
   * edge while you drag reads as the line detaching from the node's anatomy.
   * Ports are that anatomy whether or not the glyphs are currently drawn, and
   * keying attachment off VISIBILITY would make endpoints jump the moment a
   * hover reveals them — worse than either behaviour it jumps between. A side
   * with no port falls back to the smart perimeter point for that end, so
   * port-less custom nodes keep floating. True perimeter floating stays one
   * opt-in away: `metadata.connectionPoint = 'smart'`.
   */
  connectionPoints.set('port-facing', (ctx) => {
    const { source, target, boundaryPoint, nearestPort } = ctx;
    const s = source.rect;
    const t = target.rect;
    const sc = centreOf(s);
    const tc = centreOf(t);
    const dx = tc.x - sc.x;
    const dy = tc.y - sc.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const srcSide: ExtSide = horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';
    const tgtSide: ExtSide = horizontal ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom';

    // The smart cross-position — used as the "ideal" a multi-port side picks
    // its nearest port against, and as the fallback perimeter point.
    const PAD = 10;
    let srcCross: number;
    let tgtCross: number;
    if (horizontal) {
      const lo = Math.max(s.y, t.y) + PAD;
      const hi = Math.min(s.y + s.h, t.y + t.h) - PAD;
      if (lo <= hi) srcCross = tgtCross = clamp((sc.y + tc.y) / 2, lo, hi);
      else {
        srcCross = clamp(tc.y, s.y + PAD, s.y + s.h - PAD);
        tgtCross = clamp(sc.y, t.y + PAD, t.y + t.h - PAD);
      }
    } else {
      const lo = Math.max(s.x, t.x) + PAD;
      const hi = Math.min(s.x + s.w, t.x + t.w) - PAD;
      if (lo <= hi) srcCross = tgtCross = clamp((sc.x + tc.x) / 2, lo, hi);
      else {
        srcCross = clamp(tc.x, s.x + PAD, s.x + s.w - PAD);
        tgtCross = clamp(sc.x, t.x + PAD, t.x + t.w - PAD);
      }
    }

    const srcIdeal = boundaryPoint(source.node, s, srcSide, srcCross);
    const tgtIdeal = boundaryPoint(target.node, t, tgtSide, tgtCross);
    const start = nearestPort(source.node, srcSide, srcIdeal) ?? srcIdeal;
    const end = nearestPort(target.node, tgtSide, tgtIdeal) ?? tgtIdeal;

    return { start, end, sourceDirection: srcSide, targetDirection: tgtSide };
  });

  /**
   * `'boundary'` — attach on each node's outline, aimed at the other node's
   * centre. Unlike `'smart'` the two ends are computed independently, which is
   * what you want for straight-line / bezier diagrams (UML, ER).
   */
  connectionPoints.set('boundary', (ctx) => {
    const { source, target, boundaryPoint } = ctx;
    const srcSide = sideTowards(source.rect, centreOf(target.rect));
    const tgtSide = sideTowards(target.rect, centreOf(source.rect));
    const sc = centreOf(source.rect);
    const tc = centreOf(target.rect);
    const srcCross =
      srcSide === 'left' || srcSide === 'right'
        ? clamp(tc.y, source.rect.y, source.rect.y + source.rect.h)
        : clamp(tc.x, source.rect.x, source.rect.x + source.rect.w);
    const tgtCross =
      tgtSide === 'left' || tgtSide === 'right'
        ? clamp(sc.y, target.rect.y, target.rect.y + target.rect.h)
        : clamp(sc.x, target.rect.x, target.rect.x + target.rect.w);
    return {
      start: boundaryPoint(source.node, source.rect, srcSide, srcCross),
      end: boundaryPoint(target.node, target.rect, tgtSide, tgtCross),
      sourceDirection: srcSide,
      targetDirection: tgtSide,
    };
  });
}

installBuiltinLinkPipeline();
