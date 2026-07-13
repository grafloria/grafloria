// Wave 7 (Auto-layout) — Card 3: what it takes for a layout to be *interruptible*.
//
// "Cancellable" is the word people use for an algorithm that checks a flag once,
// at the end, and then throws its work away. That is not cancellation, it is a
// late apology. A force layout that has done 200 of its 300 iterations has a
// perfectly usable picture; the difference between a tool that feels alive and
// one that feels broken is whether you hand that picture back.
//
// So an interruptible layout is not one that can be *stopped*. It is one that
// can be stopped AND ASKED WHAT IT HAS. Two obligations, and the second is the
// one that gets forgotten:
//
//   step()      — advance a bounded, cheap slice of work; return false when done.
//   snapshot()  — the best answer SO FAR, valid after *any* number of steps,
//                 including zero.
//
// The host (layout-host.ts) drives step() and consults the cancel flag and the
// time budget between steps, so pre-emption latency is one iteration, not one
// layout. When it stops early it calls snapshot() and flags the result partial.
//
// An adapter that cannot offer this — dagre and ELK are single-shot calls into
// third-party code, and there is no honest way to interrupt them mid-call —
// simply does not implement it. The host detects that and runs them as one
// opaque step. They still go off the main thread (which is the actual win: a
// 500ms dagre pass no longer freezes input); they just cannot be pre-empted
// half-way. Pretending otherwise would be the lie this file exists to avoid.

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';

/**
 * An in-flight, pre-emptible layout computation.
 *
 * Pure and synchronous by construction: no DOM, no clock, no `Math.random()`.
 * That is what lets the identical object run on the main thread and inside a
 * Worker and produce byte-identical coordinates — the property Card 0 bought
 * and this card must not spend.
 */
export interface LayoutRun {
  /** Iterations completed so far. */
  readonly iteration: number;

  /** Iterations this run would do if left alone — the denominator for progress. */
  readonly totalIterations: number;

  /**
   * Advance exactly one iteration.
   *
   * @returns true if there is more work to do, false once converged or done.
   */
  step(): boolean;

  /**
   * The best answer so far. Must be safe to call at ANY point — before the
   * first step (returns the input positions), midway (returns the partial
   * simulation), or after the last (returns the final layout).
   */
  snapshot(): LayoutResult;
}

/**
 * A layout adapter that can be driven a step at a time.
 *
 * Optional: `isSteppable()` is a type guard, and the host degrades gracefully
 * for adapters that are not.
 */
export interface SteppableLayoutAdapter extends LayoutAdapter {
  createRun(
    nodes: NodeModel[],
    links: LinkModel[],
    options?: Partial<LayoutOptions>
  ): LayoutRun;
}

/** Can this adapter be pre-empted mid-run? */
export function isSteppable(
  adapter: LayoutAdapter
): adapter is SteppableLayoutAdapter {
  return typeof (adapter as SteppableLayoutAdapter).createRun === 'function';
}
