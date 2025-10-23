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
