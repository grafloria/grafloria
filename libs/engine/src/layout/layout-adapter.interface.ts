/**
 * Layout Adapter Interface
 *
 * Defines the common interface for external layout library adapters.
 * This allows seamless integration of different layout engines (Dagre, ELK, etc.)
 * into the Grafloria diagram engine.
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
// The model's own Point — NOT a local redeclaration. Declaring a rival `Point`
// here compiles fine inside the engine but makes `export * from './layout'`
// ambiguous against `export * from './types'` at the barrel, which breaks every
// downstream consumer (TS2308) while the engine's own suite stays green.
import type { Point } from '../types/geometry.types';
import { LayoutConstraints } from './layout-constraints.interface';
import {
  IncrementalLayoutOptions,
  IncrementalLayoutResult,
  IncrementalLayoutManager,
} from './incremental-layout.interface';
import { LayoutQualityResult } from './layout-quality-metrics';
import { PortAwareLayoutOptions, PortAwareLayoutResult, PortSide } from './port-aware-layout.interface';
import { SubgraphLayoutOptions, SubgraphLayoutResult } from './subgraph-layout.interface';
import { EdgeBundlingOptions, EdgeBundlingResult } from './edge-bundling.interface';
import { PortConstraintMode } from './port-label-bridge';

/**
 * Base options for all layout adapters
 */
export interface LayoutOptions {
  /**
   * Seed for any algorithm that uses randomness (force, spectral, community).
   *
   * Wave 7 Card 3: this was already load-bearing — Card 0 made three adapters
   * read it — but it lived nowhere in the type, so `force-layout-adapter` had to
   * launder it through `(options as { seed?: number }).seed`. A cast is not a
   * contract: it meant `seed` could not survive a typed hop across the worker
   * boundary, where the options bag really is `Partial<LayoutOptions>` and
   * anything not named there is dropped. Named here, it crosses.
   */
  seed?: number;

  /** Whether to animate to new positions */
  animate?: boolean;
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Whether to fit viewport to content after layout */
  fit?: boolean;
  /** Padding around content when fitting */
  padding?: number;
  /** Layout constraints for pinning/fixing nodes */
  constraints?: LayoutConstraints;
  /** Whether to calculate quality metrics after layout */
  calculateQuality?: boolean;
  /** Canvas dimensions for quality assessment */
  canvasDimensions?: { width: number; height: number };
  /** Port-aware layout options (Phase 3) */
  portAware?: PortAwareLayoutOptions;
  /** Subgraph/group layout options (Phase 3) */
  subgraph?: SubgraphLayoutOptions;
  /** Edge bundling options (Phase 4) */
  edgeBundling?: EdgeBundlingOptions;

  // --- Wave 7 (Auto-layout) — Card 7: port- and label-aware layout. ---------
  //
  // Both default to ON, which is only safe because both are NO-OPS on a graph
  // that does not use the feature: `portConstraints: 'auto'` constrains a node
  // only if its author DECLARED ports (the four auto-created default ports do
  // not count — see port-label-bridge.ts), and label reservation reserves
  // nothing when no edge carries a label. A bare graph lays out byte-identically
  // to before.

  /**
   * How much freedom the layout engine has over declared ports.
   * `'auto'` (default): FIXED_SIDE for nodes with author-declared ports, FREE
   * for the rest. So an edge leaving a `right` port will not force the layout to
   * put the target on the left.
   */
  portConstraints?: PortConstraintMode;

  /**
   * Reserve space for edge labels at LAYOUT time (default true).
   *
   * This is a reservation, NOT a placement: the renderer's edge optimizer (wave
   * 4/5) does collision-aware label placement, but it cannot invent space that
   * layout never left. This gives it room to work in.
   */
  labelAware?: boolean;

  /**
   * Ask the layout engine for orthogonal edge routes (default true for ELK).
   * The routes come back as HINTS (see `LayoutResult.routing`) — the wave-5
   * routing engine stays authoritative.
   */
  orthogonalRouting?: boolean;
}

/**
 * Wave 7 — Card 7: what the layout engine worked out about EDGES and PORTS,
 * which until now was computed and then thrown in the bin.
 *
 * ELK does genuine port-aware layered layout with orthogonal edge routing. The
 * old adapter read back `child.x` / `child.y` and NOTHING else — every port
 * position and every edge section ELK produced was discarded. These are those
 * results.
 *
 * They are HINTS, deliberately. The boundary wave 5 established still holds: the
 * renderer computes endpoints and hands them to the routing engine
 * (ManhattanRouter / GlobalRouteSolver), which owns the final path. Layout's job
 * is to place nodes so a good route EXISTS and to say where it thinks that route
 * runs — not to draw it.
 */
export interface LayoutRoutingHints {
  /** Absolute position of each declared port, as the layout engine placed it. */
  portPositions: Map<string, { x: number; y: number; side: PortSide }>;

  /** The route the layout engine found for each link: endpoints + bend points. */
  edgeRoutes: Map<string, { start: Point; end: Point; bends: Point[] }>;

  /** The box reserved for each labelled link (keyed by link id). */
  labelSpace: Map<string, { width: number; height: number }>;

  /** Whether the engine routed orthogonally. */
  orthogonal: boolean;
}

/**
 * Result of applying a layout algorithm
 */
export interface LayoutResult {
  /** Map of node IDs to their new positions */
  nodePositions: Map<string, { x: number; y: number }>;
  /** Bounding box of the laid-out graph */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Additional metadata about the layout execution */
  metadata?: {
    algorithm: string;
    executionTime: number;
    [key: string]: any;
  };
  /** Quality assessment of the layout (if calculateQuality was true) */
  quality?: LayoutQualityResult;
  /** Port-aware layout result (if portAware was enabled) */
  portAware?: PortAwareLayoutResult;
  /** Subgraph layout result (if subgraph was enabled) */
  subgraph?: SubgraphLayoutResult;
  /** Edge bundling result (if edgeBundling was enabled) */
  edgeBundling?: EdgeBundlingResult;
  /**
   * Wave 7 — Card 7: the port positions and edge routes the layout engine
   * computed. Present when the engine produces them (ELK does); previously
   * computed and discarded.
   */
  routing?: LayoutRoutingHints;
}

/**
 * Interface that all layout adapters must implement
 */
export interface LayoutAdapter {
  /** Name of the layout adapter (e.g., 'dagre', 'elk') */
  readonly name: string;

  /**
   * Apply layout to nodes and links
   *
   * @param nodes - Array of nodes to layout
   * @param links - Array of links connecting the nodes
   * @param options - Layout-specific options
   * @returns Layout result with new positions and metadata
   */
  apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options?: Partial<LayoutOptions>
  ): Promise<LayoutResult>;

  /**
   * Apply incremental layout - layout new nodes while preserving existing positions
   *
   * @param nodes - Array of all nodes (existing + new)
   * @param links - Array of all links
   * @param incrementalOptions - Options for incremental layout
   * @param layoutOptions - Base layout options (merged with generated constraints)
   * @returns Layout result with positions and incremental statistics
   */
  applyIncremental(
    nodes: NodeModel[],
    links: LinkModel[],
    incrementalOptions: IncrementalLayoutOptions,
    layoutOptions?: Partial<LayoutOptions>
  ): Promise<LayoutResult & { incremental: IncrementalLayoutResult }>;

  /**
   * Validate that options are valid for this adapter
   *
   * @param options - Options to validate
   * @returns true if valid, false otherwise
   */
  validateOptions(options: Partial<LayoutOptions>): boolean;
}
