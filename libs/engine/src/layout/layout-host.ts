// Wave 7 (Auto-layout) — Card 3: the worker seam for layout.
//
// Direct descendant of routing/global/solver-host.ts (wave 5, card 7), which
// solved the identical shape and shipped. Same three ideas, and they are the
// reason this file is short:
//
//   • the algorithm stays PURE and SYNCHRONOUS, so the same code runs on both
//     sides of the boundary and cannot drift;
//   • `serveLayout(port)` IS the worker body — a message loop, nothing more;
//   • the inline fallback LOOPS THROUGH THE SAME MESSAGE LOOP, so the protocol
//     is exercised even in-process. There is one code path, not two, and a test
//     proves the two produce byte-identical coordinates.
//
// And, as there: this host does NOT construct the Worker. Doing so would bake
// one bundler's URL scheme into the engine — which is precisely the mistake the
// old `LayoutWorkerPool` made (`new Worker('/assets/workers/layout.worker.js')`,
// a path that no build in this repo has ever produced). The caller builds the
// worker however its toolchain likes and hands the port in.
//
// WHAT THIS CARD ADDS OVER THE ROUTING PRECEDENT
// -----------------------------------------------
// Streaming progress, mid-run cancellation, time budgets, and partial results.
//
// The load-bearing one is PARTIAL RESULTS. A force layout cancelled after 200 of
// 300 iterations has a perfectly usable picture. Throwing it away — which is what
// the old `LayoutWorkerPool.cancelRequest()` did, by *rejecting* the promise — is
// the difference between a tool that feels alive and one that feels broken.
//
// THE TRAP THAT MAKES NAIVE WORKER CANCELLATION A LIE
// ---------------------------------------------------
// A worker is single-threaded. While it runs a synchronous 300-iteration loop it
// is NOT reading its message queue, so the `cancel` you posted sits there
// undelivered until the loop it was meant to interrupt has finished. Setting a
// flag from `onmessage` cannot possibly work; the old worker script even admitted
// it in a comment ("we set the flag and hope the algorithm checks it").
//
// The fix is to make the run YIELD TO THE EVENT LOOP periodically, so pending
// messages actually get delivered. Hence `sliceMs`: we compute for a slice, then
// surrender the thread long enough for the queue to drain, then check the flag.
// Cancellation latency is one slice, not one layout. (The alternative — a
// SharedArrayBuffer the loop polls — needs cross-origin isolation headers, so it
// is not a default we can rely on.)

import type { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
import { isSteppable } from './steppable-layout';
import { reviveGraph, type LayoutGraph } from './layout-graph';
import { createBuiltInLayoutFactories } from './layout-registry';
import { LayoutQualityMetrics } from './layout-quality-metrics';

// ---------------------------------------------------------------------------
// Protocol — structured-clone-safe: no functions, no class instances.
// ---------------------------------------------------------------------------

/**
 * Options as they cross the wire: the named ones, plus whatever adapter-specific
 * knobs the caller supplied (`iterations`, `repulsion`, `rankdir`, …). Anything
 * here must be structured-clone-safe — `stripNonClonable` enforces that at the
 * seam rather than trusting callers to.
 */
export type LayoutWireOptions = Partial<LayoutOptions> & Record<string, unknown>;

export interface LayoutRequestRun {
  seq: number;
  kind: 'run';
  algorithm: string;
  graph: LayoutGraph;
  options: LayoutWireOptions;
  /** Stop and return the best-so-far once this many ms have elapsed. */
  timeBudgetMs?: number;
  /** How long to compute before surrendering the thread so `cancel` can land. */
  sliceMs?: number;
  /**
   * Stop after exactly N iterations — a DETERMINISTIC pre-emption.
   *
   * A time budget is by nature a nondeterministic stopping rule (it consults a
   * clock), so a partial result produced by one is not reproducible and cannot
   * be golden-tested. This knob is the deterministic counterpart, and it is how
   * we prove the thing worth proving: that a *partial* result from the worker is
   * byte-identical to a *partial* result from the inline path.
   */
  stopAfterIteration?: number;
}

export interface LayoutRequestCancel {
  seq: number;
  kind: 'cancel';
  /** The seq of the run to cancel. */
  target: number;
}

export type LayoutRequest = LayoutRequestRun | LayoutRequestCancel;

/** Why a run stopped early. Absent when it ran to completion. */
export type LayoutStopReason = 'cancelled' | 'timeout' | 'iteration-cap';

export interface LayoutProgressMessage {
  seq: number;
  kind: 'progress';
  /** 0..1. Monotonic. */
  progress: number;
  phase: string;
  iteration: number;
  totalIterations: number;
}

export interface LayoutResultMessage {
  seq: number;
  kind: 'result';
  algorithm: string;
  positions: Array<[string, { x: number; y: number }]>;
  bounds: { x: number; y: number; width: number; height: number };
  /** True when the run stopped early — the answer is the best-so-far, not the end. */
  partial: boolean;
  reason?: LayoutStopReason;
  iteration: number;
  totalIterations: number;
  /**
   * Everything else the adapter reported, carried verbatim.
   *
   * Not decoration: `quality` only exists when the caller asked for it with
   * `calculateQuality`, and a result message that dropped it would make that
   * option silently do nothing on the worker path while working inline — the
   * single most common bug shape in this codebase, and one this card exists to
   * stop repeating.
   */
  metadata?: LayoutResult['metadata'];
  quality?: LayoutResult['quality'];
  portAware?: LayoutResult['portAware'];
  subgraph?: LayoutResult['subgraph'];
  edgeBundling?: LayoutResult['edgeBundling'];
}

export interface LayoutErrorMessage {
  seq: number;
  kind: 'error';
  message: string;
}

export type LayoutResponse =
  | LayoutProgressMessage
  | LayoutResultMessage
  | LayoutErrorMessage;

/** The message-port surface the host needs — a real Worker satisfies it. */
export interface LayoutPort {
  postMessage(msg: LayoutRequest): void;
  onmessage: ((ev: { data: LayoutResponse }) => void) | null;
}

/** The port surface the SERVER side needs — a worker's `self` satisfies it. */
export interface LayoutServePort {
  onmessage: ((ev: { data: LayoutRequest }) => void) | null;
  postMessage(msg: LayoutResponse): void;
}

// ---------------------------------------------------------------------------
// The worker body.
// ---------------------------------------------------------------------------

/** How long to compute between surrenders of the thread. See the trap, above. */
const DEFAULT_SLICE_MS = 12;

/**
 * Surrender the thread just long enough for queued messages to be delivered.
 *
 * MessageChannel rather than `setTimeout(0)`: nested timeouts get clamped to 4ms
 * by every browser, and paying 4ms per slice would cost more than the layout.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(0);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export interface ServeLayoutDeps {
  /**
   * Name → algorithm. Injected, because the INLINE host resolves against the
   * engine's live registry (so a host-registered custom layout still works),
   * while a real worker resolves against whatever its own bundle registered —
   * a function cannot be posted across a thread boundary, so an extension
   * layout registered at runtime is inline-only, by physics rather than choice.
   */
  resolve?: (name: string) => LayoutAdapter | undefined;
  /** The clock. Injected so tests can stop it lying. */
  now?: () => number;
}

/**
 * The worker's own resolver: build an adapter the first time it is named, and
 * never build one that is not.
 *
 * LAZY ON PURPOSE. Eagerly constructing the built-ins means constructing ELK,
 * and elkjs's constructor spawns its own nested Worker — which inside a Worker
 * throws `_Worker is not a constructor` and kills the layout worker on the very
 * line that starts it. See createBuiltInLayoutFactories().
 *
 * (ELK therefore remains a main-thread algorithm in practice — no great loss:
 * elkjs already offloads itself to a worker of its own, so it never blocked the
 * main thread the way dagre and force do.)
 */
function defaultResolver(): (name: string) => LayoutAdapter | undefined {
  const factories = createBuiltInLayoutFactories();
  const built = new Map<string, LayoutAdapter>();

  return (name) => {
    const existing = built.get(name);
    if (existing) return existing;

    const make = factories.get(name);
    if (!make) return undefined;

    const adapter = make();
    built.set(name, adapter);
    return adapter;
  };
}

/**
 * Serve layout requests on a port. This IS the worker's message loop — call it
 * inside the worker script with `self`, or in a test with a fake port, or (see
 * `LayoutHost`) on the inline side of a loopback pair.
 */
export function serveLayout(port: LayoutServePort, deps: ServeLayoutDeps = {}): void {
  const resolve = deps.resolve ?? defaultResolver();
  const now = deps.now ?? (() => Date.now());

  // Cancels are recorded by seq, NOT applied to "the current run". A cancel can
  // legitimately arrive before its run does (the host sends one up-front when it
  // is handed an already-aborted signal), and message order is preserved across
  // a real port — so remembering it is both correct and simpler than racing.
  const cancelled = new Set<number>();

  port.onmessage = (event) => {
    const request = event.data;

    if (request.kind === 'cancel') {
      cancelled.add(request.target);
      return;
    }

    void run(request);
  };

  async function run(request: LayoutRequestRun): Promise<void> {
    const { seq } = request;

    try {
      // Resolution can THROW, not merely return undefined: an adapter is
      // constructed here, and construction can fail for reasons peculiar to the
      // thread we are on (ELK's does, inside a Worker). A bare rethrow would
      // surface as "_Worker is not a constructor" with no clue which layout or
      // why — so name it.
      let adapter: LayoutAdapter | undefined;
      try {
        adapter = resolve(request.algorithm);
      } catch (constructionError) {
        const detail =
          constructionError instanceof Error
            ? constructionError.message
            : String(constructionError);
        port.postMessage({
          seq,
          kind: 'error',
          message: `Layout '${request.algorithm}' could not be constructed in this context: ${detail}`,
        });
        return;
      }

      if (!adapter) {
        port.postMessage({
          seq,
          kind: 'error',
          message: `Unknown layout '${request.algorithm}'`,
        });
        return;
      }

      const { nodes, links } = reviveGraph(request.graph);
      const sliceMs = request.sliceMs ?? DEFAULT_SLICE_MS;
      const startedAt = now();

      const emit = (
        progress: number,
        phase: string,
        iteration: number,
        totalIterations: number
      ): void => {
        port.postMessage({
          seq,
          kind: 'progress',
          progress,
          phase,
          iteration,
          totalIterations,
        });
      };

      const finish = (
        result: LayoutResult,
        partial: boolean,
        reason: LayoutStopReason | undefined,
        iteration: number,
        totalIterations: number
      ): void => {
        cancelled.delete(seq);
        port.postMessage({
          seq,
          kind: 'result',
          algorithm: request.algorithm,
          positions: [...result.nodePositions],
          bounds: result.bounds,
          partial,
          reason,
          iteration,
          totalIterations,
          metadata: result.metadata,
          quality: result.quality,
          portAware: result.portAware,
          subgraph: result.subgraph,
          edgeBundling: result.edgeBundling,
        });
      };

      // -- The interruptible path -------------------------------------------
      if (isSteppable(adapter)) {
        const layoutRun = adapter.createRun(nodes, links, request.options);
        const total = layoutRun.totalIterations;

        emit(0, 'start', 0, total);

        let stop: LayoutStopReason | undefined;
        let sliceStart = now();

        for (;;) {
          if (cancelled.has(seq)) {
            stop = 'cancelled';
            break;
          }
          if (
            request.stopAfterIteration !== undefined &&
            layoutRun.iteration >= request.stopAfterIteration
          ) {
            stop = 'iteration-cap';
            break;
          }
          if (
            request.timeBudgetMs !== undefined &&
            now() - startedAt >= request.timeBudgetMs
          ) {
            stop = 'timeout';
            break;
          }

          if (!layoutRun.step()) break; // converged, or hit the iteration cap

          // Slice boundary: surrender the thread so a `cancel` can actually be
          // delivered, and stream a progress event while we are here.
          if (now() - sliceStart >= sliceMs) {
            emit(
              total > 0 ? Math.min(layoutRun.iteration / total, 1) : 1,
              'iterating',
              layoutRun.iteration,
              total
            );
            await yieldToEventLoop();
            sliceStart = now();
          }
        }

        // snapshot() is valid after ANY number of steps — including zero. This
        // is the whole point: a cancelled run hands back what it has.
        const result = layoutRun.snapshot();

        // `calculateQuality` must mean the same thing on both paths. The steppable
        // adapters compute it in `apply()`, which we bypass here, so compute it
        // the same way — against the positions we actually ended on, partial or
        // not. (Assessing a best-so-far layout is if anything more useful: it is
        // how a caller decides whether the partial answer is worth keeping.)
        if (request.options.calculateQuality) {
          for (const node of nodes) {
            const position = result.nodePositions.get(node.id);
            if (position) node.setPosition(position.x, position.y);
          }
          result.quality = LayoutQualityMetrics.assess(nodes, links, {
            includeSuggestions: true,
            canvasDimensions: request.options.canvasDimensions,
          });
        }

        emit(stop ? Math.min(layoutRun.iteration / (total || 1), 1) : 1, stop ?? 'done', layoutRun.iteration, total);
        finish(result, stop !== undefined, stop, layoutRun.iteration, total);
        return;
      }

      // -- The opaque path (dagre, ELK, spectral, community) ------------------
      //
      // One shot into third-party code; there is no honest way to interrupt it
      // mid-call. It still runs OFF THE MAIN THREAD, which is the actual win —
      // a 500ms dagre pass no longer freezes input. What we cannot do is stop it
      // half-way, so we check for cancellation at the only boundaries that exist.
      emit(0, 'start', 0, 1);

      if (cancelled.has(seq)) {
        // Never started: the best-so-far is the graph exactly as it came in.
        finish(unchanged(request.graph), true, 'cancelled', 0, 1);
        return;
      }

      const result = await adapter.apply(nodes, links, request.options);
      emit(1, 'done', 1, 1);
      finish(result, false, undefined, 1, 1);
    } catch (error) {
      cancelled.delete(seq);
      port.postMessage({
        seq,
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** The identity layout: every node exactly where it already was. */
function unchanged(graph: LayoutGraph): LayoutResult {
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    nodePositions.set(node.id, { x: node.position.x, y: node.position.y });
  }

  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const rights = graph.nodes.map((n) => n.position.x + n.size.width);
  const bottoms = graph.nodes.map((n) => n.position.y + n.size.height);

  const x = xs.length ? Math.min(...xs) : 0;
  const y = ys.length ? Math.min(...ys) : 0;

  return {
    nodePositions,
    bounds: {
      x,
      y,
      width: rights.length ? Math.max(...rights) - x : 0,
      height: bottoms.length ? Math.max(...bottoms) - y : 0,
    },
    metadata: { algorithm: 'unchanged', executionTime: 0 },
  };
}

// ---------------------------------------------------------------------------
// The caller side.
// ---------------------------------------------------------------------------

export interface LayoutProgress {
  /** 0..1. */
  progress: number;
  phase: string;
  iteration: number;
  totalIterations: number;
}

/** Caller-side options that must NEVER cross the wire (they are not clonable). */
export interface LayoutRunOptions {
  /** Cancel the run. Cooperative: takes effect within one slice. */
  signal?: AbortSignal;
  /** Streaming progress. Called on the caller's thread. */
  onProgress?: (progress: LayoutProgress) => void;
  /** Give up after this long and return the best-so-far, flagged partial. */
  timeBudgetMs?: number;
  /** Compute-between-yields, ms. Lower = promper cancellation, more overhead. */
  sliceMs?: number;
  /** Deterministic pre-emption after N iterations. See LayoutRequestRun. */
  stopAfterIteration?: number;
}

export interface HostLayoutResult extends LayoutResult {
  algorithm: string;
  nodePositions: Map<string, { x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number };
  /** True when this is a best-so-far answer rather than a finished one. */
  partial: boolean;
  reason?: LayoutStopReason;
  iteration: number;
  totalIterations: number;
}

/**
 * The caller-side host.
 *
 * Pass a real Worker (or anything satisfying `LayoutPort`) to run off-thread;
 * pass nothing to run inline on the same thread. Identical behaviour, no protocol
 * drift, because BOTH paths speak through `serveLayout`.
 */
export class LayoutHost {
  private seq = 0;
  private readonly pending = new Map<
    number,
    {
      resolve: (r: HostLayoutResult) => void;
      reject: (e: Error) => void;
      onProgress?: (p: LayoutProgress) => void;
    }
  >();
  private readonly port: LayoutPort;

  constructor(port?: LayoutPort, deps: ServeLayoutDeps = {}) {
    if (port) {
      this.port = port;
    } else {
      // Inline fallback: a loopback "port" pair served by the same loop the
      // worker would run. The protocol is exercised even in-process, which is
      // what stops the two paths from drifting — and is what makes the
      // worker-vs-inline determinism test meaningful rather than tautological.
      const hostSide: LayoutPort = { postMessage: () => void 0, onmessage: null };
      const workerSide: LayoutServePort = {
        onmessage: null,
        postMessage: (msg: LayoutResponse) => hostSide.onmessage?.({ data: msg }),
      };
      serveLayout(workerSide, deps);
      hostSide.postMessage = (msg: LayoutRequest) => workerSide.onmessage?.({ data: msg });
      this.port = hostSide;
    }

    this.port.onmessage = (event) => {
      const message = event.data;
      const entry = this.pending.get(message.seq);
      if (!entry) return;

      if (message.kind === 'progress') {
        entry.onProgress?.({
          progress: message.progress,
          phase: message.phase,
          iteration: message.iteration,
          totalIterations: message.totalIterations,
        });
        return;
      }

      this.pending.delete(message.seq);

      if (message.kind === 'error') {
        entry.reject(new Error(message.message));
        return;
      }

      entry.resolve({
        algorithm: message.algorithm,
        nodePositions: new Map(message.positions),
        bounds: message.bounds,
        partial: message.partial,
        reason: message.reason,
        iteration: message.iteration,
        totalIterations: message.totalIterations,
        metadata: message.metadata,
        quality: message.quality,
        portAware: message.portAware,
        subgraph: message.subgraph,
        edgeBundling: message.edgeBundling,
      });
    };
  }

  run(
    algorithm: string,
    graph: LayoutGraph,
    options: LayoutWireOptions = {},
    runOptions: LayoutRunOptions = {}
  ): Promise<HostLayoutResult> {
    const seq = ++this.seq;
    const { signal, onProgress, timeBudgetMs, sliceMs, stopAfterIteration } = runOptions;

    return new Promise<HostLayoutResult>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject, onProgress });

      // An already-aborted signal cancels the run BEFORE it is posted. Message
      // order is preserved across a real port, so the server sees the cancel
      // first and the run returns a zero-iteration partial rather than burning
      // a slice of work that nobody wants.
      if (signal?.aborted) {
        this.port.postMessage({ seq: 0, kind: 'cancel', target: seq });
      }

      signal?.addEventListener('abort', () => {
        if (this.pending.has(seq)) {
          this.port.postMessage({ seq: 0, kind: 'cancel', target: seq });
        }
      });

      this.port.postMessage({
        seq,
        kind: 'run',
        algorithm,
        graph,
        options: stripNonClonable(options),
        timeBudgetMs,
        sliceMs,
        stopAfterIteration,
      });
    });
  }
}

/**
 * Drop anything that structured clone would choke on.
 *
 * Callers hand `engine.layout()` one options bag, and it is entirely reasonable
 * for that bag to carry a callback. Posting one to a real Worker throws
 * DataCloneError — a crash that only appears once someone actually enables the
 * worker, i.e. exactly the bug that ships. Strip at the seam instead.
 */
function stripNonClonable(options: LayoutWireOptions): LayoutWireOptions {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'function') continue;
    if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) continue;
    out[key] = value;
  }
  return out as LayoutWireOptions;
}
