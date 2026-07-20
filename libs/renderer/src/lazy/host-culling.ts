// Custom (HTML-layer) node hosts: the one thing on the canvas that was NEVER culled.
//
// The SVG layers have culled against the visible rect since wave 2 — open a 10k-node
// diagram and ~56 nodes get a VNode. The HTML layer did the opposite: `syncCustomNodes`
// walked EVERY `useHTMLLayer` node every frame, created a host for each on first sight,
// and then kept it in the document forever. A 400-widget dashboard with three tiles on
// screen paid for 400 absolutely-positioned divs — style recalc, layout, paint,
// compositing, hit-testing — plus 400 `setAttribute('style', …)` writes PER FRAME, to
// place 397 elements nobody could see.
//
// WHY THIS IS NOT `ViewLifecycle`, having read `ViewLifecycle` first.
//
// The obvious move is to reuse the freeze machinery next door, and it is the wrong one.
// `ViewLifecycle`'s contract is stated in its own header: "a frozen entity is not routed,
// not styled, not turned into a VNode, and holds no cache entry" — freeze means DESTROY
// THE VIEW AND REBUILD IT LATER. That is exactly right for a VNode, which is a pure
// function of the model and costs microseconds to rebuild. It is exactly wrong for a
// custom host, whose whole documented property is that `renderCustomNode` "mounts exactly
// once": the host owns a chart mid-animation, a scroll offset, a `<video>`'s playback
// position, a canvas bitmap, an editor's uncommitted text. Rebuilding that on every scroll
// is worse than never culling at all.
//
// So the POLICY here is new — it has to be. The AUTHORITY is not duplicated: a host that
// installs a `ViewLifecycle` and explicitly freezes a node gets its custom host released
// too (see `FreezeQuery`), so "this entity has no view" stays one idea with one owner
// rather than two systems that can disagree.
//
// Deliberately NOT wired to autoFreeze. autoFreeze's diff is exact-rect and per-frame,
// which is correct for a cache entry and would defeat the hysteresis below — the single
// property that stops a tile at the viewport edge from thrashing. A rebuildable VNode can
// afford to flap; a mounted widget cannot.

import type { Rectangle } from '../types/geometry.types';
import type { EntityKind } from './types';

/**
 * What a cull does to the host element.
 *
 * `'detach'` — remove the element from the document and keep the reference. Re-entry
 * re-appends the SAME element: `renderCustomNode` is NOT called again, `removeCustomNode`
 * is NOT called on the cull, and everything inside the widget survives byte for byte.
 *
 * `'destroy'` — fire `removeCustomNode` and drop the element. Re-entry re-creates the host
 * and re-runs `renderCustomNode`. Frees the widget's memory; costs a full re-init and every
 * piece of state the widget was holding.
 *
 * `'detach'` is the default, and the reasoning is that the cost this feature exists to
 * remove is a cost of being ATTACHED. Layout, style recalc, paint, compositing and hit
 * testing are all charged per element IN THE DOCUMENT; a detached subtree is inert heap.
 * Detaching therefore captures essentially the whole win while keeping the mount-once
 * guarantee that makes custom nodes usable at all. Measured on a 300-widget board with ~16
 * tiles on screen: 2720 DOM nodes under the canvas fall to 164, a 94% reduction, and a pan
 * away and back re-runs the painter exactly zero times.
 *
 * What `'detach'` does NOT bound is the RETAINED set. A host mounted once is kept for the
 * life of the instance, so panning a 10,000-widget board end to end eventually holds 10,000
 * detached elements — the same "cache versus leak" distinction `ViewLifecycle`'s header
 * draws about autoFreeze, and the honest reason `'destroy'` exists. (Same board, after a
 * sweep across and back: 20 attached, 78 retained off-screen.) Choose `'destroy'` when the
 * widgets are individually huge — a WebGL scene, a 50k-row grid — and heap rather than
 * frame time is the binding constraint. It is opt-in inside an opt-in, because a host that
 * asks for it is accepting that its painter re-runs and its widget state is lost.
 */
export type HostCullMode = 'detach' | 'destroy';

export interface HostCullOptions {
  /**
   * How far beyond the viewport edge a host is still kept mounted, in CSS pixels.
   *
   * Screen pixels, not world units, and converted by the current zoom — the question this
   * answers is "how much scrolling until the user sees it", which is a physical distance.
   * A world-unit margin would be 20 screen px at zoom 0.1 (a tile pops in visibly late) and
   * 2000 at zoom 10 (the cull stops culling). Same reasoning the resize handles use.
   */
  margin?: number;

  /**
   * The extra distance, in CSS pixels, a host must travel BEYOND `margin` before it is
   * culled. This is the hysteresis band, and it is the difference between culling and
   * thrashing.
   *
   * With a single threshold, a tile whose edge sits exactly on the boundary flips
   * mounted/unmounted on sub-pixel camera jitter — a trackpad's inertial tail, a spring
   * animation settling, a resize observer firing twice. In `'destroy'` mode that is a
   * widget re-initialising several times a second; in `'detach'` mode it is still a DOM
   * mutation and a style recalc per frame, i.e. the exact cost we came to remove.
   *
   * Two thresholds make a flip require REAL movement: attach at `margin`, detach only past
   * `margin + hysteresis`. Nothing in between can change state.
   */
  hysteresis?: number;

  /** What a cull does to the element. Default `'detach'` — see {@link HostCullMode}. */
  mode?: HostCullMode;
}

/**
 * The sliver of `ViewLifecycle` that host culling honours.
 *
 * `isExplicitlyFrozen`, NOT `admits`, and the distinction is load-bearing. `admits` is also
 * false for anything autoFreeze is holding off-screen, and autoFreeze decides that against
 * the bare viewport with no margin — routing custom hosts through it would silently
 * override the hysteresis band with a zero-width one. `isExplicitlyFrozen` is the signal
 * that a HOST deliberately said "this node has no view", which is a decision custom nodes
 * should obey.
 */
export interface FreezeQuery {
  isExplicitlyFrozen(kind: EntityKind, id: string): boolean;
}

const DEFAULT_MARGIN = 200;
const DEFAULT_HYSTERESIS = 100;

/**
 * The per-frame cull decision for HTML-layer node hosts.
 *
 * Stateless with respect to the hosts themselves: `admits()` is told whether the host is
 * currently attached rather than remembering it. That is on purpose — a culler holding its
 * own attached-set is a second copy of a fact the DOM already owns, and the two desync the
 * first time a node is removed from the model mid-gesture. The DOM is the record; this is
 * only the policy.
 *
 *     culler.beginFrame(viewport.getViewBox(), viewport.getZoom(), heldByGesture);
 *     for (const node of customNodes) {
 *       if (culler.admits(node.id, bounds(node), host?.isConnected ?? false)) …
 *     }
 */
export class HtmlHostCuller {
  private readonly marginPx: number;
  private readonly hysteresisPx: number;
  private readonly mode: HostCullMode;
  private readonly freeze: FreezeQuery | null;

  /** Inflated by `margin` — a detached host inside this gets attached. */
  private attachRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  /** Inflated by `margin + hysteresis` — an attached host outside this gets culled. */
  private detachRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

  private exempt: ReadonlySet<string> = new Set<string>();

  constructor(options: HostCullOptions = {}, freeze: FreezeQuery | null = null) {
    // `?? `, not `||`: `margin: 0` is a legitimate ask ("cull at the exact edge") and must
    // not silently become 200.
    this.marginPx = Math.max(0, options.margin ?? DEFAULT_MARGIN);
    this.hysteresisPx = Math.max(0, options.hysteresis ?? DEFAULT_HYSTERESIS);
    this.mode = options.mode ?? 'detach';
    this.freeze = freeze;
  }

  getMode(): HostCullMode {
    return this.mode;
  }

  /**
   * Fix this frame's two rects and the set of nodes a live gesture owns.
   *
   * `visible` is the WORLD rect actually on screen — the viewBox, not the raw camera rect.
   * They diverge the moment zoom != 1, and culling against the camera rect drops hosts that
   * are on screen whenever the board is zoomed out (which fit-to-content always does). The
   * SVG side learned this the hard way; see `svg-renderer.ts` `visibleRect`.
   */
  beginFrame(visible: Rectangle, zoom: number, exempt: ReadonlySet<string>): void {
    // A zero or negative zoom is not a real camera state, but it IS reachable through a
    // host that drives `setZoom` from a slider mid-animation, and dividing by it would
    // produce an infinite rect (everything mounted) or a NaN one (nothing mounted, and no
    // way to get back — NaN comparisons are false in both directions, so the hysteresis
    // would latch). Fall back to 1 rather than propagate it.
    const z = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
    this.attachRect = inflate(visible, this.marginPx / z);
    this.detachRect = inflate(visible, (this.marginPx + this.hysteresisPx) / z);
    this.exempt = exempt;
  }

  /**
   * Should this node's host be in the document on this frame?
   *
   * @param attached whether the host is in the document RIGHT NOW — this is what selects
   *   which of the two hysteresis rects applies, and it is why a host hovering on the
   *   boundary keeps whatever state it already had.
   */
  admits(id: string, bounds: Rectangle, attached: boolean): boolean {
    // An explicit freeze outranks everything, including a gesture: a host that froze this
    // node did so on purpose, and it is not this culler's place to overrule it. (Same
    // precedence ViewLifecycle.admits gives an explicit freeze over a mount admission.)
    if (this.freeze?.isExplicitlyFrozen('node', id)) return false;

    // A node under a live gesture is never culled. Mostly it is on screen anyway — it is
    // under the user's cursor — but not always: a drag can carry a tile past the edge, an
    // auto-panning canvas can move the viewport out from under it, and a dashboard's
    // placeholder reflow moves tiles the user is not touching. Unmounting the element
    // mid-drag destroys the pointer capture, the ghost, and the gesture with it.
    if (this.exempt.has(id)) return true;

    return intersects(bounds, attached ? this.detachRect : this.attachRect);
  }
}

/** Grow a rect by `pad` on all four sides. */
function inflate(r: Rectangle, pad: number): Rectangle {
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

/**
 * Overlap test, inclusive of touching edges.
 *
 * Inclusive because the alternative is a one-pixel band in which a host that is provably
 * adjacent to the mount region is culled anyway; at the attach threshold that reads as a
 * tile popping in one frame late, every time.
 */
function intersects(a: Rectangle, b: Rectangle): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}
