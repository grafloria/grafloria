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
// PREVIOUS slices already routed — that turns the mount into a quadratic one, and the
// progressive version ends up slower than the blocking render it replaced.
//
// The renderer's ROUTE MEMO (wave8/routing, Card 6) is what prevents that. A link routed
// by slice k is a memo hit for slice k+1, keyed on the routing INPUTS (endpoints + routing
// LOD) and invalidated when a third party moves into its corridor. This mounter used to
// carry its own replay cache for the job; the memo's key is strictly stronger, so the
// weaker one is gone. Two caches for one job, where one of them cannot see everything that
// invalidates it, is how you get a route that "hasn't changed" and is wrong anyway.

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
  /**
   * Links admitted by the FIRST link slice — the one slice with no measurement to adapt
   * from. Default 4, deliberately timid: link costs are wildly skewed (a typical link
   * routes in 3ms, a long one against 10k obstacles in 850ms), so a big opening chunk is
   * a coin-flip on a multi-second stall. It ramps up fast from here when links are cheap.
   */
  initialChunk?: number;
  /** Hard cap on slices, so a pathological scene still terminates. Default 500. */
  maxSlices?: number;
  onFirstPaint?: (stats: Readonly<MountStats>) => void;
  onSlice?: (stats: Readonly<MountStats>) => void;
}

export class ProgressiveMounter {
  private readonly engine: DiagramEngine;
  private readonly lifecycle: ViewLifecycle;
  private readonly frame: MountFrame;
  private readonly deferred: DeferredQuery;

  private handle: number | null = null;
  private running = false;

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
    let chunk = Math.max(1, options.initialChunk ?? 4);

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

        // Adapt towards `sliceMs`.
        //
        // Shrink as hard as the measurement says (one bad slice should immediately back
        // off), but GROW no more than 4x at a time. Link costs are skewed by two orders
        // of magnitude, so a run of cheap 3ms links would otherwise ramp the chunk into
        // the hundreds and the next expensive link would arrive in a batch of 200.
        //
        // The floor is 1: a router cannot be pre-empted mid-path, so a single 850ms link
        // IS an 850ms slice. Chunking cannot fix that and should not pretend to — what it
        // can do is make sure such a link stalls the mount alone, and never in company.
        const ratio = sliceMs / Math.max(sliceMsActual, 0.1);
        chunk = clamp(Math.round(chunk * Math.min(ratio, 4)), 1, 256);

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
  }

  private mountedNodeCount(): number {
    const diagram = this.engine.getDiagram();
    return diagram ? diagram.getNodes().filter((n) => this.lifecycle.admits('node', n.id)).length : 0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
