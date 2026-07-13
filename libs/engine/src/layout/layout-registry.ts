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
import {
  autoSelectLayout,
  AUTO_LAYOUT_NAME,
  type LayoutSelectionReport,
} from './layout-auto-select';

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
  /**
   * Wave 7 — Card 7b. Present when the AUTO layout ran: which algorithm it chose,
   * why, and what every other candidate scored. An auto-selector that cannot show
   * its working is a support ticket.
   */
  selection?: LayoutSelectionReport;
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
  return {
    name: adapter.name,
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
