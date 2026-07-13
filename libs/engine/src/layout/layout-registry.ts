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
import { DEFAULT_LAYOUT_SEED } from './rng';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';
import { ForceLayoutAdapter } from './force-layout-adapter';
import { SpectralLayoutAdapter } from './spectral-layout-adapter';
import { CommunityLayoutAdapter } from './community-layout-adapter';

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
  direction?: 'TB' | 'BT' | 'LR' | 'RL';

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
}

/** What a registered layout engine must be able to do. */
export interface RegisteredLayout {
  readonly name: string;
  apply(diagram: DiagramModel, options: UnifiedLayoutOptions): Promise<LayoutResult>;

  /**
   * Wave 7 Card 4: the underlying node/link adapter, when the engine has one.
   *
   * Nested layout arranges the contents of ONE container at a time, so it needs
   * an engine it can hand a node/link SUBSET to — `RegisteredLayout.apply()`
   * takes a whole DiagramModel and cannot express "just these nodes". Exposing
   * the adapter is what lets a container be laid out by any registered
   * adapter-backed engine (including one an extension registered), instead of
   * the closed dagre|elk pair the wave-5 service hard-coded.
   */
  readonly adapter?: LayoutAdapter;
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
  return {
    name: adapter.name,
    adapter,
    async apply(diagram: DiagramModel, options: UnifiedLayoutOptions): Promise<LayoutResult> {
      const nodes = [...diagram.getNodes()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const links = [...diagram.getLinks()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      return adapter.apply(nodes, links, translateOptions(adapter.name, options));
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
