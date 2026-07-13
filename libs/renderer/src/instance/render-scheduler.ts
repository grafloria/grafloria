import { requestFrame as defaultRequestFrame, cancelFrame as defaultCancelFrame, now } from '../platform';

/**
 * RenderScheduler — framework-agnostic rAF coalescing + idle-skip.
 *
 * Blocker #3 of the headless-instance contract (see ./diagram-instance.ts): the
 * only render loop in the codebase was `DiagramCanvasComponent.scheduleRender()`,
 * a private Angular method. This is that logic, lifted verbatim in behaviour and
 * with no framework or DOM imports, so React / the web component / a plain
 * `<script>` host all inherit the same frame discipline:
 *
 *   - **Coalescing.** Any number of `schedule()` calls in one tick collapse into
 *     exactly ONE painted frame. A burst of engine events (`node:changed` ×N, a
 *     drag's mousemoves, several prop changes in one React commit) paints once.
 *   - **Idle-skip.** A queued frame is DROPPED when `shouldSkip()` says nothing
 *     visible can have changed — cheaper than a no-op render of a big diagram.
 *   - **Synchronous escape.** `flush()` paints right now and cancels the queued
 *     frame; used for the mount paint (so the first frame is not one rAF late)
 *     and by tests.
 *
 * `requestFrame`/`cancelFrame` are injectable: pass fakes in tests, and note the
 * default falls back to `setTimeout` where rAF is missing (Node), so a scheduler
 * constructed during SSR never throws — it simply never gets a chance to fire
 * because nothing calls `schedule()` on the server.
 */
export interface RenderSchedulerOptions {
  /** The paint. Called at most once per frame. */
  onFrame: () => void;
  /**
   * Idle-skip predicate, evaluated INSIDE the frame (not at schedule time, so it
   * sees the final state of the tick). Return true to drop the frame.
   */
  shouldSkip?: () => boolean;
  /** Injectable rAF (defaults to the platform one, with a setTimeout fallback). */
  requestFrame?: (cb: (time: number) => void) => number;
  /** Injectable cancel, must pair with `requestFrame`. */
  cancelFrame?: (handle: number) => void;
}

/** Cheap counters — a steady-state idle canvas should paint 0 frames. */
export interface RenderSchedulerStats {
  /** `schedule()` calls. */
  scheduled: number;
  /** Frames actually painted (`onFrame` ran). */
  painted: number;
  /** Queued frames dropped by `shouldSkip()`. */
  skipped: number;
  /** `schedule()` calls that folded into an already-queued frame. */
  coalesced: number;
  /** Duration (ms) of the most recent paint. */
  lastFrameMs: number;
}

export class RenderScheduler {
  private handle: number | null = null;
  private dirty = false;
  private disposed = false;

  private readonly onFrame: () => void;
  private readonly shouldSkip?: () => boolean;
  private readonly requestFrameFn: (cb: (time: number) => void) => number;
  private readonly cancelFrameFn: (handle: number) => void;

  private _stats: RenderSchedulerStats = {
    scheduled: 0,
    painted: 0,
    skipped: 0,
    coalesced: 0,
    lastFrameMs: 0,
  };

  constructor(options: RenderSchedulerOptions) {
    this.onFrame = options.onFrame;
    this.shouldSkip = options.shouldSkip;
    this.requestFrameFn = options.requestFrame ?? defaultRequestFrame;
    this.cancelFrameFn = options.cancelFrame ?? defaultCancelFrame;
  }

  get stats(): Readonly<RenderSchedulerStats> {
    return this._stats;
  }

  /** True while a frame is queued but has not run yet. */
  get pending(): boolean {
    return this.handle !== null;
  }

  /**
   * Mark dirty and queue a frame. Idempotent within a tick — the second and
   * later calls before the frame runs are counted as `coalesced`, not queued.
   */
  schedule(): void {
    if (this.disposed) return;

    this._stats.scheduled++;
    this.dirty = true;

    if (this.handle !== null) {
      this._stats.coalesced++;
      return;
    }

    this.handle = this.requestFrameFn(() => {
      this.handle = null;
      if (this.disposed) return;
      // A synchronous flush() already painted this tick's work.
      if (!this.dirty) return;

      if (this.shouldSkip?.()) {
        this.dirty = false;
        this._stats.skipped++;
        return;
      }

      this.paint();
    });
  }

  /**
   * Paint NOW, bypassing rAF and the idle-skip check, and cancel any queued
   * frame. This is the mount paint (and the "give me a correct DOM before I
   * measure it" escape hatch).
   */
  flush(): void {
    if (this.disposed) return;
    this.cancelPending();
    this.dirty = false;
    this.paint();
  }

  /** Drop a queued frame without painting. */
  cancel(): void {
    this.cancelPending();
    this.dirty = false;
  }

  dispose(): void {
    this.cancelPending();
    this.disposed = true;
    this.dirty = false;
  }

  private cancelPending(): void {
    if (this.handle !== null) {
      this.cancelFrameFn(this.handle);
      this.handle = null;
    }
  }

  private paint(): void {
    const start = now();
    this.dirty = false;
    this.onFrame();
    this._stats.painted++;
    this._stats.lastFrameMs = now() - start;
  }
}
