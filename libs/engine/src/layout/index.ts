/**
 * Layout Module
 *
 * Provides layout algorithms for automatic node placement in diagrams.
 *
 * Usage:
 * ```typescript
 * import { LayoutManager, GridLayoutAlgorithm } from '@grafloria/engine/layout';
 *
 * const layoutManager = new LayoutManager(diagram, 'grid');
 *
 * // Calculate placement for new node
 * const result = layoutManager.calculatePlacement(node, viewport);
 * node.setPosition(result.position.x, result.position.y);
 *
 * // Switch algorithm
 * layoutManager.setAlgorithm('hierarchical');
 *
 * // Re-layout entire diagram
 * await layoutManager.reLayout();
 * ```
 *
 * Phase 2: External Layout Adapters
 * ```typescript
 * import { LayoutService, DagreLayoutAdapter, ELKLayoutAdapter } from '@grafloria/engine/layout';
 *
 * const layoutService = new LayoutService();
 * const engine = new DiagramEngine();
 * engine.setLayoutService(layoutService);
 *
 * // Apply Dagre layout
 * await engine.applyDagreLayout({
 *   rankdir: 'TB',
 *   nodesep: 50,
 *   ranksep: 100
 * });
 *
 * // Apply ELK layout
 * await engine.applyELKLayout({
 *   algorithm: 'layered',
 *   'elk.direction': 'RIGHT'
 * });
 * ```
 */

// Core types and interfaces
export * from './types';
export * from './ILayoutAlgorithm';
export * from './LayoutManager';

// Built-in algorithms
export * from './algorithms/GridLayoutAlgorithm';
export * from './algorithms/HierarchicalLayoutAlgorithm';
export * from './algorithms/ForceDirectedLayoutAlgorithm';
export * from './algorithms/HybridLayoutAlgorithm';

// Phase 2: External layout adapters
export * from './layout-adapter.interface';
export * from './layout-constraints.interface';
export * from './incremental-layout.interface';
export * from './layout-presets';
export * from './layout-quality-metrics';
export * from './layout-history';
export * from './dagre-layout-adapter';
export * from './elk-layout-adapter';
export * from './layout.service';
export * from './layout-registry'; // Wave 7 Card 0
export * from './rng'; // Wave 7 Card 0
export * from './sugiyama/sugiyama'; // Wave 7 Cards 1 & 5
export * from './sugiyama/layered-layout'; // Wave 7 Cards 1 & 5
export * from './incremental/mental-map'; // Wave 7 Card 6

// Wave 7 Card 7: port/label-aware layout + auto-algorithm selection
export * from './port-label-bridge';
export * from './layout-quality-extended';
export * from './layout-auto-select';

// Wave 7 Card 2: the first-class layout portfolio + disconnected-component packing
export * from './component-packing';
export * from './portfolio-layouts';
export * from './tree-layout';
export * from './overlap-removal';

// Phase 3: Advanced layout features
export * from './port-aware-layout.interface';
export * from './subgraph-layout.interface';

// Phase 4: Edge bundling
export * from './edge-bundling.interface';

// Wave 7 Card 3: off-main-thread layout.
//
// This REPLACES the old "Phase 5: Web Workers" exports (`layout-worker.interface`
// / `worker-layout-adapter`), which are deleted. They were scaffolding that had
// never been reachable: nothing in the codebase instantiated `LayoutWorkerPool`,
// it built its Worker from a hardcoded `/assets/workers/layout.worker.js` that no
// build has ever produced, its progress callback was declared but never wired to
// anything, and cancelling REJECTED the promise — discarding a perfectly usable
// part-finished layout. Every test in its spec forced `useWorker: false`, so the
// worker path was never once exercised. It is also now unfixable in place: the
// worker script it depended on speaks this new protocol, so the old pool speaks
// one that nothing implements.
//
// The replacement: `engine.layout(name, { signal, onProgress, timeBudgetMs })`
// runs through LayoutHost — inline by default, off-thread once a port is attached
// with `engine.setLayoutPort()`, and byte-identical either way.
//
// NOTE: layout.worker.ts is deliberately NOT re-exported — it calls
// `serveLayout(self)` at import time, which is right inside a Worker and wrong
// everywhere else.
export * from './layout-host';
export * from './layout-graph';
export * from './steppable-layout';

// Phase 6: Advanced Algorithms
export * from './force-layout-adapter';
export * from './spectral-layout-adapter';
export * from './community-layout-adapter';

// Wave-5 Card 5: per-group recursive (compound) layout orchestrator
export * from './CompoundLayoutService';
