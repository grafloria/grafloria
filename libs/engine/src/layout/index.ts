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

// Wave 7 Card 2: the first-class layout portfolio + disconnected-component packing
export * from './component-packing';
export * from './portfolio-layouts';
export * from './tree-layout';

// Phase 3: Advanced layout features
export * from './port-aware-layout.interface';
export * from './subgraph-layout.interface';

// Phase 4: Edge bundling
export * from './edge-bundling.interface';

// Phase 5: Web Workers
export * from './layout-worker.interface';
export * from './worker-layout-adapter';

// Phase 6: Advanced Algorithms
export * from './force-layout-adapter';
export * from './spectral-layout-adapter';
export * from './community-layout-adapter';

// Wave-5 Card 5: per-group recursive (compound) layout orchestrator
export * from './CompoundLayoutService';
