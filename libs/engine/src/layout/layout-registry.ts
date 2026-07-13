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
import { DEFAULT_LAYOUT_SEED, inStableOrder } from './rng';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';
import { ForceLayoutAdapter } from './force-layout-adapter';
import { SpectralLayoutAdapter } from './spectral-layout-adapter';
import { CommunityLayoutAdapter } from './community-layout-adapter';
// Wave 7 Card 2: the portfolio, and the packing wrapper every layout goes through.
import { layoutWithComponentPacking, type GraphLayoutFn } from './component-packing';
import { circularLayout, forceLayout, gridLayout, radialLayout } from './portfolio-layouts';
import { treeLayout, type FlowDirection } from './tree-layout';

/**
 * The one options schema. Adapter-specific knobs still ride in `options`, but
 * everything that is common to all layouts is named here so callers do not have
 * to learn five different vocabularies.
 */
export interface UnifiedLayoutOptions extends Partial<LayoutOptions> {
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
}

/** How a layout engine reports back. */
export interface UnifiedLayoutResult extends LayoutResult {
  /** The algorithm that actually ran (useful once auto-selection lands, Card 7). */
  algorithm: string;
  /** The seed used — so a pleasing random layout can be reproduced on demand. */
  seed: number;
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
  return createLayout(adapter.name, (nodes, links, options) =>
    adapter.apply(nodes, links, translateOptions(adapter.name, options))
  );
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
  };
}

/**
 * One vocabulary in, each engine's dialect out.
 *
 * The adapters disagree about names for the same concept — dagre says `rankdir`,
 * `nodesep`, `ranksep`; ELK says `elk.direction` with words instead of letters.
 * Making callers know which engine they are talking to is exactly the "you cannot
 * be best-in-class with inconsistent options" problem Card 0 names.
 */
function translateOptions(engine: string, options: UnifiedLayoutOptions): Partial<LayoutOptions> {
  const out: Record<string, unknown> = { ...options };
  out['seed'] = options.seed ?? DEFAULT_LAYOUT_SEED;

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
  return [
    new DagreLayoutAdapter(),
    new ELKLayoutAdapter(),
    new ForceLayoutAdapter(),
    new SpectralLayoutAdapter(),
    new CommunityLayoutAdapter(),
  ];
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
export function createPortfolioLayouts(): RegisteredLayout[] {
  return [
    createLayout('tree', (nodes, links, options) => treeLayout(nodes, links, options)),
    createLayout('grid', (nodes, links, options) => gridLayout(nodes, links, options)),
    createLayout('circular', (nodes, links, options) => circularLayout(nodes, links, options)),
    createLayout('radial', (nodes, links, options) => radialLayout(nodes, links, options)),
    createLayout('force', (nodes, links, options) => forceLayout(nodes, links, options)),
  ];
}

/** The registry `engine.layout()` runs against: adapters, then the portfolio. */
export function createDefaultLayoutRegistry(): LayoutRegistry {
  const registry = new LayoutRegistry();
  for (const adapter of createBuiltInLayoutAdapters()) {
    registry.register(fromAdapter(adapter));
  }
  for (const layout of createPortfolioLayouts()) {
    registry.register(layout);
  }
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

  return { ...result, algorithm: name, seed };
}
