// Wave 7 (Auto-layout) — Card 0: the unified layout API and engine registry.
//
// ---------------------------------------------------------------------------
// WHAT THE AUDIT GOT RIGHT, AND THE ONE THING IT GOT WRONG
// ---------------------------------------------------------------------------
//
// Right: full-graph layout was UNREACHABLE. `DiagramEngine.applyLayout()` throws
// unless you first call `setLayoutService()` — and nothing in the entire codebase
// ever called it (the only mention is a doc comment in layout/index.ts). So dagre,
// ELK, force, spectral and community — thousands of lines, several of them
// untested — could not be run from the engine at all. That is the whole "layout is
// fragmented" finding, and this file is the fix: ONE entry point, `engine.layout()`,
// with the built-ins already registered.
//
// Wrong: the audit called LayoutManager and LayoutService "two parallel layout
// stacks" and asked for them to be collapsed. They are not parallel — they solve
// DIFFERENT problems, and merging them would have been a category error (the same
// one Wave 3 corrected about the two IRenderer interfaces):
//
//   • LayoutManager  → `calculatePlacement(node, viewport)`. Given ONE newly-added
//                      node, where should it go so it doesn't overlap anything?
//                      An incremental PLACEMENT strategy. Runs on node:added.
//   • LayoutAdapter  → `apply(nodes, links)`. Given a WHOLE GRAPH, where does
//                      everything go? A full-graph LAYOUT algorithm.
//
// Collapsing them would have forced a single-node placer to pretend it can lay out
// a graph, or a graph layout engine to pretend a one-node call is meaningful. They
// stay separate, and this file documents the boundary instead of erasing it.
//
// ---------------------------------------------------------------------------
// THE CONTRACT
// ---------------------------------------------------------------------------
//
//   engine.layout('dagre', { direction: 'LR' })   // named algorithm, one schema
//   engine.layout()                                // zero-config default (Card 1)
//
// and it is DETERMINISTIC and IDEMPOTENT:
//
//   same graph + same seed  =>  byte-identical coordinates
//   layout(g); layout(g)    =>  the second run changes nothing
//
// Determinism is not a nicety here. Without it: layouts cannot have golden tests,
// a saved diagram moves every time you reopen it, and the mental-map card (#6) is
// undefinable — you cannot minimise movement against a baseline that itself moves.
// See rng.ts.

import type { DiagramModel } from '../models/DiagramModel';
import type { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
// Type-only: the run controls (signal/onProgress/timeBudgetMs) belong to the
// worker seam, and importing them as types keeps the module graph acyclic at
// runtime even though layout-host imports the built-ins from here.
import type { LayoutRunOptions, LayoutStopReason } from './layout-host';
import { DEFAULT_LAYOUT_SEED, inStableOrder } from './rng';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';
import { ForceLayoutAdapter } from './force-layout-adapter';
import { SpectralLayoutAdapter } from './spectral-layout-adapter';
import { CommunityLayoutAdapter } from './community-layout-adapter';
import {
  autoSelectLayout,
  AUTO_LAYOUT_NAME,
  type LayoutSelectionReport,
} from './layout-auto-select';
// Wave 7 Card 2: the portfolio, and the packing wrapper every layout goes through.
import { layoutWithComponentPacking, type GraphLayoutFn } from './component-packing';
import { circularLayout, forceLayout, gridLayout, radialLayout } from './portfolio-layouts';
import { treeLayout, type FlowDirection } from './tree-layout';
// Wave 7 Cards 1 & 5: our own layered (Sugiyama) engine.
import { createLayeredLayout } from './sugiyama/layered-layout';

/**
 * The one options schema. Adapter-specific knobs still ride in `options`, but
 * everything that is common to all layouts is named here so callers do not have
 * to learn five different vocabularies.
 */
export interface UnifiedLayoutOptions extends Partial<LayoutOptions>, LayoutRunOptions {
  /**
   * Adapter-specific knobs (`iterations`, `repulsion`, `align`, …) ride along here.
   *
   * Card 0's comment PROMISED this — "adapter-specific knobs still ride in
   * `options`" — but the type did not allow it, so `engine.layout('force',
   * { iterations: 500 })` was a compile error and the only way to reach half of
   * force's own options was a cast. A vocabulary that cannot say what its
   * engines can do is not a unified vocabulary; this is the promise made good.
   */
  [key: string]: unknown;

  /**
   * Seed for any algorithm that uses randomness (force, spectral, community).
   * Defaults to a FIXED constant — so an author who never thinks about seeds
   * still gets the same picture every time. Randomness is opt-in.
   */
  seed?: number;

  /**
   * Primary flow direction, normalised across engines: dagre calls it `rankdir`,
   * ELK calls it `elk.direction`, and the two disagree about spelling. Callers
   * say `direction` and the registry translates.
   */
  direction?: FlowDirection;

  /** Space between nodes in the same rank/row. */
  nodeSpacing?: number;

  /** Space between ranks/layers. */
  rankSpacing?: number;

  // -------------------------------------------------------------------------
  // Wave 7 — Card 4: nested container / subgraph layout.
  // -------------------------------------------------------------------------

  /**
   * Lay groups out as CONTAINERS: each group's contents are arranged
   * recursively (deepest first), the container is auto-sized to fit them, and
   * the parent level then arranges containers as COMPOUND NODES — with edges
   * that cross a container boundary induced onto the compound nodes so the
   * containers land next to the things they actually connect to.
   *
   * Defaults to TRUE whenever the diagram has groups, because the flat path is
   * not merely less good on a grouped diagram — it is WRONG: it interleaves
   * members of different groups and never updates a single group frame, so the
   * containers stay behind, pointing at where their members used to be.
   * Pass `nested: false` for the old flat behaviour.
   */
  nested?: boolean;

  /** Fallback inner padding for containers that carry no `padding` of their own. */
  containerPadding?: number;

  /** Gap between compound units when a level falls back to the built-in grid. */
  groupSpacing?: number;
  // --- Card 2: shared across the whole portfolio -----------------------------

  /**
   * Gap between packed disconnected components. Defaults to `nodeSpacing`.
   * See component-packing.ts — this applies to EVERY layout, not just the new
   * ones, because "lay out a forest and the trees land on top of each other" is
   * an adapter-agnostic bug.
   */
  componentSpacing?: number;

  /** Target width/height of the packed result. 1.6 ≈ a landscape screen. */
  aspectRatio?: number;

  /**
   * Push nodes apart if the algorithm left them overlapping. Default true.
   *
   * A no-op for every layout that does not overlap (dagre, ELK, tree, grid,
   * circular, radial) — but force and community lay out DIMENSIONLESS POINTS and
   * genuinely do return intersecting boxes. See overlap-removal.ts. Opt out only
   * if you want the algorithm's raw output.
   */
  removeOverlaps?: boolean;

  /** grid: number of columns. Defaults to ceil(sqrt(n)). */
  columns?: number;

  /** tree/radial: the node to root the tree / centre the rings on. */
  rootId?: string;

  /**
   * tree: per-branch direction. The subtree rooted at each listed node flows its
   * own way instead of the tree's `direction` — a mind map is
   * `{ 'left-branch': 'RL', 'right-branch': 'LR' }`.
   */
  branchDirections?: Record<string, FlowDirection>;
}

/** What a registered layout engine must be able to do. */
export interface RegisteredLayout {
  readonly name: string;
  apply(diagram: DiagramModel, options: UnifiedLayoutOptions): Promise<LayoutResult>;

  /**
   * The underlying node/link algorithm, when the engine has one.
   *
   * TWO cards landed on this one field, for two reasons that turn out to be the
   * same reason — a `LayoutAdapter` is a pure function of (nodes, links), and a
   * `RegisteredLayout` is an opaque closure over a whole DiagramModel:
   *
   *   • Card 4 (nested) arranges the contents of ONE container at a time, so it
   *     needs an engine it can hand a node/link SUBSET to. `apply(diagram)` cannot
   *     express "just these nodes". Exposing the adapter is what lets a container
   *     be laid out by ANY registered engine — including an extension's — instead
   *     of the closed dagre|elk pair the wave-5 service hard-coded.
   *
   *   • Card 3 (worker) needs an algorithm it can SHIP ACROSS A THREAD BOUNDARY.
   *     A closure cannot be posted anywhere, so layouts registered that way run
   *     inline — by physics, not by policy. Exposing the adapter is what lets the
   *     host tell the two apart instead of guessing.
   */
  readonly adapter?: LayoutAdapter;
}

/** How a layout engine reports back. */
export interface UnifiedLayoutResult extends LayoutResult {
  /** The algorithm that actually ran (useful once auto-selection lands, Card 7). */
  algorithm: string;
  /** The seed used — so a pleasing random layout can be reproduced on demand. */
  seed: number;
  /**
   * Wave 7 — Card 7b. Present when the AUTO layout ran: which algorithm it chose,
   * why, and what every other candidate scored. An auto-selector that cannot show
   * its working is a support ticket.
   */
  selection?: LayoutSelectionReport;

  // -- Wave 7 Card 3 -------------------------------------------------------

  /**
   * True when the run was cut short (cancelled, or out of time budget) and this
   * is the BEST-SO-FAR answer rather than a finished one.
   *
   * Flagged rather than thrown away: a force layout stopped at 200 of 300
   * iterations is a perfectly usable picture, and discarding it is the
   * difference between a tool that feels alive and one that feels broken. But
   * the caller has to be able to TELL — silently returning a partial layout as
   * if it were final is how a "finished" diagram ends up half-settled.
   */
  partial: boolean;

  /** Why it stopped early, when it did. */
  reason?: LayoutStopReason;

  /** Iterations actually completed. */
  iteration: number;

  /** Iterations the algorithm would have run, left alone. */
  totalIterations: number;
}

/**
 * The named-algorithm registry.
 *
 * Registration is a plain map, deliberately: extension-registered layouts (via
 * the wave-6 ExtensionHost) and the built-ins are the same kind of thing, and a
 * host must be able to replace a built-in — `register()` returns a disposer that
 * RESTORES what was there before rather than deleting the name, which is the
 * convention wave 6 established for every other registry.
 */
export class LayoutRegistry {
  private readonly engines = new Map<string, RegisteredLayout>();

  register(engine: RegisteredLayout): () => void {
    const previous = this.engines.get(engine.name);
    this.engines.set(engine.name, engine);
    return () => {
      if (previous) this.engines.set(engine.name, previous);
      else this.engines.delete(engine.name);
    };
  }

  get(name: string): RegisteredLayout | undefined {
    return this.engines.get(name);
  }

  has(name: string): boolean {
    return this.engines.has(name);
  }

  /** Registered names, sorted — a stable list is part of being deterministic. */
  names(): string[] {
    return [...this.engines.keys()].sort();
  }

  /**
   * Wave 7 Card 4: name → adapter, for every registered engine that exposes one.
   *
   * This is what nested (compound) layout resolves a container's algorithm
   * against — so `group.subgraphLayout = { algorithm: 'force' }` works, and so
   * does an algorithm an extension registered, rather than only the hard-coded
   * dagre|elk pair.
   */
  adapters(): Record<string, LayoutAdapter> {
    const out: Record<string, LayoutAdapter> = {};
    for (const name of this.names()) {
      const adapter = this.engines.get(name)?.adapter;
      if (adapter) out[name] = adapter;
    }
    return out;
  }
}

/**
 * Wrap a legacy `LayoutAdapter` (dagre/elk/force/spectral/community) as a
 * registry engine.
 *
 * This is the adaptor that finally makes the orphaned stack reachable. It also
 * does the two things the old path never did:
 *
 *   1. CANONICAL INPUT ORDER — nodes and links are sorted by id before they
 *      reach the algorithm. A seeded PRNG alone does not give reproducibility:
 *      map iteration follows insertion order, so an authored diagram and the same
 *      diagram loaded from JSON feed the algorithm in different orders and
 *      diverge even with the same seed. (This is the subtle half of Card 0, and
 *      the half that a naive "just seed the RNG" fix misses.)
 *
 *   2. OPTION NORMALISATION — `direction`/`nodeSpacing`/`rankSpacing` are
 *      translated into whatever the adapter calls them.
 */
export function fromAdapter(adapter: LayoutAdapter): RegisteredLayout {
  // Card 2's createLayout() routes every adapter through COMPONENT PACKING (a
  // provable no-op for a connected graph, so it cannot regress anything) and does
  // the canonical-ordering + option-translation Card 0 established. The `adapter`
  // field is kept because Card 7's auto-selector reads it to tell whether a
  // candidate engine is port-aware.
  // The EXPOSED adapter is packing-wrapped too, and that is load-bearing.
  //
  // Two resolvers hand algorithms to the layout host: the engine's inline one reads
  // `registry.get(name).adapter` (so a runtime-registered layout is honoured), and
  // the worker's builds by name from the factories (functions cannot cross
  // postMessage). If only one of them packs, the SAME layout behaves differently on
  // the two paths — and it did: a disconnected graph laid its components on top of
  // each other whenever the engine resolved through the registry. Card 2's forest
  // tests caught it the moment these branches met.
  //
  // Object.create, not a spread: spreading a class instance copies only its OWN
  // properties, so step()/snapshot() — prototype methods — vanish and a steppable
  // algorithm silently stops being cancellable.
  const packed = packAdapter(adapter);

  return {
    ...createLayout(adapter.name, (nodes, links, options) =>
      adapter.apply(nodes, links, translateOptions(adapter.name, options))
    ),
    adapter: packed,
  };
}

/**
 * Turn a raw graph-layout function into a registered layout.
 *
 * The two things EVERY layout in the engine gets here, whether it is a wrapped
 * third-party adapter or one of Card 2's own:
 *
 *   1. CANONICAL INPUT ORDER (Card 0) — sorted by id, so the same graph laid out
 *      after a save/load round-trip produces the same coordinates.
 *   2. COMPONENT PACKING (Card 2) — a disconnected graph is split, laid out
 *      component by component, and the boxes are packed. Implemented ONCE, here,
 *      rather than five times in five algorithms. It is a no-op for a connected
 *      graph, so it cannot regress an existing layout.
 */
export function createLayout(name: string, fn: GraphLayoutFn): RegisteredLayout {
  return {
    name,
    apply(diagram: DiagramModel, options: UnifiedLayoutOptions): Promise<LayoutResult> {
      return layoutWithComponentPacking(
        name,
        fn,
        inStableOrder(diagram.getNodes()),
        inStableOrder(diagram.getLinks()),
        options
      );
    },
    // Every registered layout also exposes the adapter-shaped (nodes, links) form.
    //
    // MERGE NOTE (Cards 2 + 4): the nested/container path lays out SUBSETS — a
    // container's members — not whole diagrams, so it needs `apply(nodes, links)`
    // rather than `apply(diagram)`. It reached for `registry.adapters()`, which only
    // knew about the five legacy LayoutAdapters; the moment Card 2 promoted `force`
    // (and added tree/grid/circular/radial) to first-class layouts built from a raw
    // graph function, they vanished from that map and a container could no longer be
    // laid out with them. Exposing the graph function here makes Card 4's promise —
    // "a container can use ANY registered engine" — actually true, including for
    // anything an extension host registers.
    adapter: {
      name,
      apply: (nodes, links, options) =>
        layoutWithComponentPacking(name, fn, nodes, links, (options ?? {}) as UnifiedLayoutOptions),
      applyIncremental: () => {
        throw new Error(`Layout '${name}' does not support applyIncremental.`);
      },
      validateOptions: () => true,
    } as LayoutAdapter,
  };
}

/**
 * One vocabulary in, each engine's dialect out.
 *
 * The adapters disagree about names for the same concept — dagre says `rankdir`,
 * `nodesep`, `ranksep`; ELK says `elk.direction` with words instead of letters.
 * Making callers know which engine they are talking to is exactly the "you cannot
 * be best-in-class with inconsistent options" problem Card 0 names.
 *
 * Exported for Card 4: nested layout runs a DIFFERENT engine per container
 * (`group.subgraphLayout.algorithm`), so it has to translate the one vocabulary
 * per level rather than once up front. Reusing this is what stops the nested
 * path from quietly forking the options schema.
 */
export function translateOptions(
  engine: string,
  options: UnifiedLayoutOptions
): Partial<LayoutOptions> {
  const out: Record<string, unknown> = { ...options };
  out['seed'] = options.seed ?? DEFAULT_LAYOUT_SEED;

  // Card 3: the run controls are the HOST's business, not the algorithm's, and
  // `signal`/`onProgress` are not structured-clone-safe — posting one to a real
  // Worker throws DataCloneError. They must not reach the wire.
  delete out['signal'];
  delete out['onProgress'];
  delete out['timeBudgetMs'];
  delete out['sliceMs'];
  delete out['stopAfterIteration'];

  const { direction, nodeSpacing, rankSpacing } = options;

  if (engine === 'dagre') {
    if (direction) out['rankdir'] = direction;
    if (nodeSpacing !== undefined) out['nodesep'] = nodeSpacing;
    if (rankSpacing !== undefined) out['ranksep'] = rankSpacing;
  } else if (engine === 'elk') {
    if (direction) {
      out['elk.direction'] = {
        TB: 'DOWN',
        BT: 'UP',
        LR: 'RIGHT',
        RL: 'LEFT',
      }[direction];
    }
    if (nodeSpacing !== undefined) out['elk.spacing.nodeNode'] = nodeSpacing;
    if (rankSpacing !== undefined) out['elk.layered.spacing.nodeNodeBetweenLayers'] = rankSpacing;
  }

  return out as Partial<LayoutOptions>;
}

/**
 * The layouts that ship in the box.
 *
 * Registered eagerly by `DiagramEngine.getLayoutRegistry()`, so `engine.layout()`
 * works with no setup call — which is the entire point of Card 0. ELK is included
 * even though it resolves asynchronously; the adapter already handles that.
 */
export function createBuiltInLayoutAdapters(): LayoutAdapter[] {
  return [...createBuiltInLayoutFactories().values()].map((make) => make());
}

/**
 * The same built-ins, as FACTORIES — construct one only when it is asked for.
 *
 * Wave 7 Card 3, and this is not a micro-optimisation: it is a crash fix that
 * only a live run could have found. Constructing every adapter up-front means
 * constructing ELK, and `new ELKLayoutAdapter()` calls `new ElkConstructor()`,
 * which tries to spawn elkjs's OWN nested Worker. Inside a Web Worker that
 * throws `_Worker is not a constructor` — so the layout worker died on the line
 * that started it, before it had read a single message, and every request to it
 * hung forever.
 *
 * Nothing caught it because in Node (where the unit tests live) elkjs constructs
 * happily. It reproduced the instant a real Worker ran in a real browser.
 *
 * Laziness makes the worker pay only for the algorithm actually requested, so
 * asking for `force` no longer detonates on ELK's behalf.
 */
export function createBuiltInLayoutFactories(): Map<string, () => LayoutAdapter> {
  return new Map<string, () => LayoutAdapter>([
    ['dagre', () => new DagreLayoutAdapter()],
    ['elk', () => new ELKLayoutAdapter()],
    ['force', () => new ForceLayoutAdapter()],
    ['spectral', () => new SpectralLayoutAdapter()],
    ['community', () => new CommunityLayoutAdapter()],
  ]);
}

/**
 * The layout `engine.layout()` runs when the caller names none.
 *
 * Wave 7 — Card 7b: this is `'auto'`, not a fixed algorithm. A zero-config caller
 * gets a bake-off (see layout-auto-select.ts) rather than whichever algorithm
 * happened to be hard-coded, and can read back WHY it chose what it chose. Naming
 * it here rather than inline in DiagramEngine keeps the decision in one place —
 * a card that wants a different default (a Sugiyama, say) changes this constant
 * and nothing else.
 */
export const DEFAULT_LAYOUT_NAME = AUTO_LAYOUT_NAME;

/**
 * The auto-selecting layout, as a registry engine.
 *
 * It is registered under a name like any other layout — deliberately. Card 0's
 * contract is that `engine.layout(name)` is THE entry point, so auto-selection had
 * to compose with the registry rather than fork a second one. It takes the registry
 * it lives in so its candidate pool is whatever is actually registered, including
 * layouts an extension host added after start-up.
 */
export function createAutoLayout(registry: LayoutRegistry): RegisteredLayout {
  return {
    name: AUTO_LAYOUT_NAME,
    apply: (diagram, options) => autoSelectLayout(diagram, registry, options),
  };
}

/**
 * Card 2's portfolio: the diagram shapes a serious engine has to be able to draw.
 *
 * `force` is in here as well as in the adapter list, and it deliberately WINS —
 * it is registered second. The adapter's physics is reused unchanged (see
 * portfolio-layouts.ts); what the portfolio version adds is component packing and
 * the shared options vocabulary, which is the difference between "we expose a
 * force adapter" and "force is a first-class layout".
 */
/**
 * Component-packing wrapper, preserving the algorithm underneath.
 *
 * Object.create, not a spread: spreading a class instance copies only its OWN
 * properties, so `step()`/`snapshot()` — which live on the prototype — vanish,
 * `isSteppable()` goes false, and a long-running algorithm silently stops being
 * cancellable. Delegating through the prototype keeps it whole and overrides only
 * `apply`, which is the one thing packing needs to intercept.
 */
export function packAdapter(adapter: LayoutAdapter): LayoutAdapter {
  const packed: LayoutAdapter = Object.create(adapter);
  packed.apply = (nodes, links, options) =>
    layoutWithComponentPacking(
      adapter.name,
      (n, l, o) => adapter.apply(n, l, translateOptions(adapter.name, o)),
      nodes,
      links,
      (options ?? {}) as UnifiedLayoutOptions
    );
  return packed;
}

export function createPortfolioLayouts(): RegisteredLayout[] {
  // Card 2's `force` overrides the raw adapter — but it must keep the adapter's
  // STEPPABLE physics reachable, or Card 3 loses progress, cancellation and partial
  // results on the one algorithm that can actually be interrupted mid-run. (The
  // portfolio version delegates to exactly this simulation; what it adds is packing
  // and the shared options vocabulary.)
  const steppableForce = packAdapter(new ForceLayoutAdapter());

  return [
    createLayout('tree', (nodes, links, options) => treeLayout(nodes, links, options)),
    createLayout('grid', (nodes, links, options) => gridLayout(nodes, links, options)),
    createLayout('circular', (nodes, links, options) => circularLayout(nodes, links, options)),
    createLayout('radial', (nodes, links, options) => radialLayout(nodes, links, options)),
    {
      ...createLayout('force', (nodes, links, options) => forceLayout(nodes, links, options)),
      adapter: steppableForce,
    },
  ];
}

/**
 * The registry `engine.layout()` runs against.
 *
 * Registration order is the override order, and it is deliberate:
 *
 *   1. the five legacy ADAPTERS (dagre/elk/force/spectral/community) — Card 0 made
 *      them reachable at all;
 *   2. the PORTFOLIO (tree/grid/circular/radial/force) — Card 2. `force` appears in
 *      both and the portfolio's wins, because it adds component packing and the
 *      shared options vocabulary: the difference between "we expose a force adapter"
 *      and "force is a first-class layout";
 *   3. LAYERED (Cards 1 & 5) — our own Sugiyama. The only engine that honours
 *      semantic constraints DURING ranking and ordering, which is why the
 *      mental-map/incremental path (Card 6) names it explicitly;
 *   4. AUTO (Card 7b) — the scored bake-off. Registered last because it takes the
 *      registry, so its candidate pool is whatever is actually in it — including
 *      `layered`, and including anything an extension host adds after start-up.
 */
export function createDefaultLayoutRegistry(): LayoutRegistry {
  const registry = new LayoutRegistry();
  for (const adapter of createBuiltInLayoutAdapters()) {
    registry.register(fromAdapter(adapter));
  }
  for (const layout of createPortfolioLayouts()) {
    registry.register(layout);
  }
  registry.register(createLayeredLayout('layered'));
  registry.register(createAutoLayout(registry));
  return registry;
}

/**
 * Run a named layout against a diagram and COMMIT the result.
 *
 * The single place positions are written back, shared by `DiagramEngine.layout()`
 * and by the preset applicator. `setPosition()` — never a raw write to
 * `node.position` — because the spatial index, the routing obstacle map and the
 * renderer all hang off the change event it emits. (Wave 5 lost a day to the
 * mirror image of this: the engine subscribed to `node.on('position')` while the
 * model emits `change:position`, so the obstacle map never updated and routes were
 * computed against stale geometry.)
 */
export async function runLayout(
  registry: LayoutRegistry,
  diagram: DiagramModel,
  name: string,
  options: UnifiedLayoutOptions = {}
): Promise<UnifiedLayoutResult> {
  const layout = registry.get(name);
  if (!layout) {
    throw new Error(`Unknown layout '${name}'. Registered layouts: ${registry.names().join(', ')}`);
  }

  const seed = options.seed ?? DEFAULT_LAYOUT_SEED;
  const result = await layout.apply(diagram, { ...options, seed });

  for (const [nodeId, position] of result.nodePositions) {
    diagram.getNode(nodeId)?.setPosition(position.x, position.y);
  }

  // Card 3's run-status fields. runLayout is the SYNCHRONOUS apply-and-commit path
  // (the preset applicator's route); it runs an algorithm to completion on this
  // thread, so it is never partial. The worker/host path reports the real numbers.
  return { ...result, algorithm: name, seed, partial: false, iteration: 1, totalIterations: 1 };
}
