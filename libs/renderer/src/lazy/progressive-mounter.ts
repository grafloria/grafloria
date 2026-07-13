// Wave 8 — Card 3: TIME-SLICED ASYNC MOUNT.
//
// Opening a 10k-node graph cost 6.8 SECONDS of frozen tab before one pixel
// appeared. Not because 10k nodes are drawn — culling means only ~56 of them are —
// but because the ~72 links that ARE on screen must each be routed around all 10k
// nodes first, and a handful of long ones cost ~850ms EACH. Every one of those
// routes was paid before the first frame reached the screen.
//
// Nothing here makes routing faster (that is the routing card's job, and the
// measurement that says so is in the report). What this does is stop routing from
// standing between the user and their diagram:
//
//   slice 0   nodes only            → PAINT. ~5ms. The graph is on screen.
//   slice 1   + the first k links    → yield to rAF
//   slice 2   + the next k links     → yield to rAF
//   ...       until everything visible is mounted
//
// Between slices the browser paints and handles input, so the tab stays alive and
// the diagram fills in visibly instead of arriving all at once, late.
//
// The one thing that would ruin it: re-routing, on every slice, the links the
// PREVIOUS slices already routed — that turns a 6.8s mount into a quadratic one.
// So a slice that has been through a full render is SEALED, and its links replay
// the route already on the model instead of recomputing it. That is sound only
// while the scene is static, which is exactly what a cold mount is; the moment the
// model's geometry moves underneath us, the seal is dropped and those links are
// routed again from scratch (`invalidateSettledRoutes`). Late, never wrong.

import type { DiagramEngine } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import { cancelFrame, now, requestFrame } from '../platform/platform';
import type { EntityKind, MountStats } from './types';
import type { ViewLifecycle } from './view-lifecycle';

/**
 * Produce and PRESENT one frame. Deliberately not "the SVG renderer": the SVG
 * patcher, the canvas backend and the tier-switching backend all satisfy this, so
 * a progressive mount works on any of them.
 */
export type MountFrame = (viewport: Rectangle, zoom: number) => void;

/** What the renderer deferred on the last frame — culling admitted it, the gate did not. */
export type DeferredQuery = () => ReadonlyArray<readonly [EntityKind, string]>;

export interface ProgressiveMountOptions {
  /** Target ms per slice. The chunk size adapts to hit it. Default 8 (half a 60fps frame). */
  sliceMs?: number;
  /** Links admitted by the first link slice, before there is anything to adapt from. Default 24. */
  initialChunk?: number;
  /** Hard cap on slices, so a pathological scene still terminates. Default 500. */
  maxSlices?: number;
  onFirstPaint?: (stats: Readonly<MountStats>) => void;
  onSlice?: (stats: Readonly<MountStats>) => void;
}

/** The geometry events that invalidate a route. NOT `link:changed` — see below. */
const GEOMETRY_EVENTS = [
  'node:moved',
  'node:resized',
  'node:added',
  'node:removed',
  'link:added',
  'link:removed',
  'nodes:cleared',
  'links:cleared',
  'diagram:cleared',
] as const;

export class ProgressiveMounter {
  private readonly engine: DiagramEngine;
  private readonly lifecycle: ViewLifecycle;
  private readonly frame: MountFrame;
  private readonly deferred: DeferredQuery;

  private handle: number | null = null;
  private running = false;
  private unsubscribers: Array<() => void> = [];

  /**
   * Settles the mount currently in flight.
   *
   * Held because `cancel()` tears down the rAF that would otherwise have settled
   * it — without this, cancelling a mount left the caller's `await mount()` hanging
   * forever. (Found by the spec, which is the only reason it is not still there.)
   */
  private settle: ((aborted: boolean) => void) | null = null;

  constructor(
    engine: DiagramEngine,
    lifecycle: ViewLifecycle,
    frame: MountFrame,
    deferred: DeferredQuery
  ) {
    this.engine = engine;
    this.lifecycle = lifecycle;
    this.frame = frame;
    this.deferred = deferred;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Bring the scene up in rAF-yielded slices. Resolves when everything culling
   * admits has a view (or when the mount is cancelled).
   */
  mount(viewport: Rectangle, zoom: number, options: ProgressiveMountOptions = {}): Promise<MountStats> {
    const sliceMs = options.sliceMs ?? 8;
    const maxSlices = options.maxSlices ?? 500;
    let chunk = Math.max(1, options.initialChunk ?? 24);

    this.cancel();
    this.running = true;

    const stats: MountStats = {
      firstPaintMs: 0,
      completeMs: 0,
      slices: 0,
      nodesMounted: 0,
      linksMounted: 0,
      worstSliceMs: 0,
      aborted: false,
    };

    const t0 = now();

    // A route computed against 10k obstacles is only replayable while those
    // obstacles hold still. If any of them moves, the seal comes off and the
    // affected links are routed again on the next slice.
    //
    // `link:changed` is deliberately NOT in this list: the renderer writes every
    // route it computes back onto the model (`syncLinkPoints`), which emits it. A
    // mounter that listened for it would invalidate its own work, every slice,
    // forever.
    this.subscribeToGeometry();

    // ---- slice 0: the nodes. No routing, no links — this is the frame that
    // decides whether the tool feels like it can hold the graph at all.
    this.lifecycle.beginDeferred();
    this.lifecycle.admitAll('node');
    this.frame(viewport, zoom);

    stats.firstPaintMs = now() - t0;
    stats.slices = 1;
    stats.worstSliceMs = stats.firstPaintMs;
    stats.nodesMounted = this.mountedNodeCount();
    options.onFirstPaint?.(stats);

    return new Promise<MountStats>((resolve) => {
      let settled = false;
      const finish = (aborted: boolean) => {
        if (settled) return;
        settled = true;
        stats.aborted = aborted;
        stats.completeMs = now() - t0;
        this.settle = null;
        this.teardown();
        resolve(stats);
      };
      this.settle = finish;

      const step = () => {
        this.handle = null;
        if (!this.running) return finish(true);

        // Everything the LAST frame wanted but the gate held back.
        const pending = this.deferred();

        if (pending.length === 0) {
          // The last slice drew the last entity: the scene on screen is already
          // whole. Hand the gate back and stop.
          //
          // It is tempting to "finish cleanly" with one more full render here. Do
          // not: an ungated render re-routes every visible link, so that courtesy
          // frame costs a second pass over the entire scene (~200ms at 10k) and
          // routes every link exactly twice. The spec counts routes per link for
          // precisely this reason.
          this.lifecycle.endDeferred();
          return finish(false);
        }

        if (stats.slices >= maxSlices) {
          // Gave up slicing. Hand the gate back and draw the remainder in one go —
          // a bounded mount must still leave a COMPLETE diagram on screen.
          this.lifecycle.endDeferred();
          this.frame(viewport, zoom);
          return finish(false);
        }

        // Everything admitted so far has now survived a full render, so its route
        // is on the model and the next slice can replay rather than recompute it.
        this.lifecycle.sealSlice();

        const take = Math.min(chunk, pending.length);
        for (let i = 0; i < take; i++) {
          const [kind, id] = pending[i];
          this.lifecycle.admit(kind, id);
          if (kind === 'link') stats.linksMounted++;
          else stats.nodesMounted++;
        }

        const t = now();
        this.frame(viewport, zoom);
        const sliceMsActual = now() - t;

        stats.slices++;
        stats.worstSliceMs = Math.max(stats.worstSliceMs, sliceMsActual);
        options.onSlice?.(stats);

        // Adapt: aim at `sliceMs`. A single link can cost 850ms on its own, so the
        // floor is 1 — we cannot pre-empt a router mid-path, and pretending we can
        // would just make the chunking dishonest.
        chunk = clamp(Math.round((chunk * sliceMs) / Math.max(sliceMsActual, 0.1)), 1, 512);

        this.handle = requestFrame(step);
      };

      this.handle = requestFrame(step);
    });
  }

  /**
   * Stop mounting. Whatever is not yet mounted is mounted by the next normal render
   * — the gate is handed back here, so a cancelled mount can never strand half a
   * diagram on screen.
   */
  cancel(): void {
    if (!this.running && this.handle === null) return;
    this.running = false;
    if (this.handle !== null) {
      cancelFrame(this.handle);
      this.handle = null;
    }
    this.lifecycle.endDeferred();
    this.unsubscribeAll();
    // Settle the caller's `await mount()`. Cancelling the rAF killed the only other
    // thing that would have.
    this.settle?.(true);
  }

  dispose(): void {
    this.cancel();
  }

  // -------------------------------------------------------------------------

  private teardown(): void {
    this.running = false;
    this.handle = null;
    this.unsubscribeAll();
  }

  private subscribeToGeometry(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const onGeometry = () => this.lifecycle.invalidateSettledRoutes();
    for (const event of GEOMETRY_EVENTS) {
      // `on()` hands back its own unsubscribe — there is no `off()` on the model.
      this.unsubscribers.push(diagram.on(event, onGeometry));
    }
  }

  private unsubscribeAll(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
  }

  private mountedNodeCount(): number {
    const diagram = this.engine.getDiagram();
    return diagram ? diagram.getNodes().filter((n) => this.lifecycle.admits('node', n.id)).length : 0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
