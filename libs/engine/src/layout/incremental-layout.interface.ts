/**
 * Incremental Layout System
 *
 * Enables adding nodes to an existing diagram without re-laying out the entire graph.
 * This is essential for interactive editing where users progressively build diagrams.
 */

import { NodeModel } from '../models/NodeModel';
import { LayoutConstraints, NodeConstraint } from './layout-constraints.interface';

/**
 * Strategy for incremental layout
 */
export type IncrementalLayoutStrategy =
  | 'pin-existing'      // Pin all existing nodes, layout only new ones
  | 'fix-anchors'       // Fix anchor nodes, allow controlled movement
  | 'proximity-aware'   // Pin nodes far from new ones, allow nearby adjustment
  | 'minimal-shift';    // Minimize total movement of existing nodes

/**
 * Options for incremental layout
 */
export interface IncrementalLayoutOptions {
  /**
   * Strategy to use for incremental layout
   * @default 'pin-existing'
   */
  strategy?: IncrementalLayoutStrategy;

  /**
   * Nodes that are new (to be laid out)
   * If not provided, nodes without valid positions are considered new
   */
  newNodeIds?: string[];

  /**
   * Anchor nodes that should never move (in addition to strategy constraints)
   * These have highest priority
   */
  anchorNodeIds?: string[];

  /**
   * Maximum distance a non-anchor node can move (pixels)
   * Only applies to 'minimal-shift' strategy
   */
  maxShift?: number;

  /**
   * Radius around new nodes where existing nodes can be adjusted (pixels)
   * Only applies to 'proximity-aware' strategy
   * @default 200
   */
  proximityRadius?: number;

  /**
   * Whether to allow slight adjustments to improve layout quality
   * @default false
   */
  allowMinorAdjustments?: boolean;

  /**
   * Custom constraints to apply in addition to incremental constraints
   */
  customConstraints?: LayoutConstraints;
}

/**
 * Result of incremental layout operation
 */
export interface IncrementalLayoutResult {
  /**
   * IDs of nodes that were moved during layout
   */
  movedNodeIds: string[];

  /**
   * IDs of nodes that were pinned/fixed
   */
  pinnedNodeIds: string[];

  /**
   * IDs of nodes that were newly laid out
   */
  newlyLaidOutNodeIds: string[];

  /**
   * Maximum distance any node moved (pixels)
   */
  maxMovement: number;

  /**
   * Average distance nodes moved (pixels)
   */
  avgMovement: number;

  /**
   * Strategy that was used
   */
  strategy: IncrementalLayoutStrategy;

  /**
   * Number of constraints that were auto-generated
   */
  autoConstraintCount: number;
}

/**
 * Helper class for managing incremental layouts
 */
export class IncrementalLayoutManager {
  /**
   * Identify new nodes that need to be laid out
   *
   * @param nodes - All nodes in the diagram
   * @param options - Incremental layout options
   * @returns Array of node IDs that are considered new
   */
  static identifyNewNodes(
    nodes: NodeModel[],
    options: IncrementalLayoutOptions
  ): string[] {
    // If explicitly provided, use those
    if (options.newNodeIds && options.newNodeIds.length > 0) {
      return options.newNodeIds;
    }

    // Otherwise, identify nodes without valid positions
    const newNodes: string[] = [];
    nodes.forEach(node => {
      const pos = node.position;
      // Consider a node "new" if it's at origin (0,0) or has invalid position
      if (!pos || (pos.x === 0 && pos.y === 0)) {
        newNodes.push(node.id);
      }
    });

    return newNodes;
  }

  /**
   * Identify existing nodes that should be constrained
   *
   * @param nodes - All nodes in the diagram
   * @param newNodeIds - IDs of new nodes
   * @returns Array of node IDs that should be constrained
   */
  static identifyExistingNodes(
    nodes: NodeModel[],
    newNodeIds: string[]
  ): string[] {
    const newNodeSet = new Set(newNodeIds);
    return nodes
      .filter(node => !newNodeSet.has(node.id))
      .map(node => node.id);
  }

  /**
   * Generate constraints for incremental layout based on strategy
   *
   * @param nodes - All nodes in the diagram
   * @param options - Incremental layout options
   * @returns Generated layout constraints
   */
  static generateConstraints(
    nodes: NodeModel[],
    options: IncrementalLayoutOptions
  ): LayoutConstraints {
    const strategy = options.strategy || 'pin-existing';
    const newNodeIds = this.identifyNewNodes(nodes, options);
    const existingNodeIds = this.identifyExistingNodes(nodes, newNodeIds);

    const constraints: NodeConstraint[] = [];

    // Add anchor constraints (highest priority)
    if (options.anchorNodeIds && options.anchorNodeIds.length > 0) {
      options.anchorNodeIds.forEach(nodeId => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          const pos = node.position;
          constraints.push({
            nodeId,
            type: 'pin',
            position: { x: pos.x, y: pos.y },
            priority: 100, // Highest priority
          });
        }
      });
    }

    // Generate constraints based on strategy
    switch (strategy) {
      case 'pin-existing':
        constraints.push(...this.generatePinExistingConstraints(nodes, existingNodeIds));
        break;

      case 'fix-anchors':
        constraints.push(...this.generateFixAnchorsConstraints(nodes, existingNodeIds, newNodeIds));
        break;

      case 'proximity-aware':
        constraints.push(...this.generateProximityAwareConstraints(
          nodes,
          existingNodeIds,
          newNodeIds,
          options.proximityRadius || 200
        ));
        break;

      case 'minimal-shift':
        constraints.push(...this.generateMinimalShiftConstraints(
          nodes,
          existingNodeIds,
          options.maxShift || 50
        ));
        break;
    }

    // Merge with custom constraints if provided
    if (options.customConstraints) {
      constraints.push(...options.customConstraints.constraints);
    }

    return {
      constraints,
      conflictResolution: 'priority',
    };
  }

  /**
   * Pin all existing nodes to their current positions
   */
  private static generatePinExistingConstraints(
    nodes: NodeModel[],
    existingNodeIds: string[]
  ): NodeConstraint[] {
    const constraints: NodeConstraint[] = [];

    existingNodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const pos = node.position;
        constraints.push({
          nodeId,
          type: 'pin',
          position: { x: pos.x, y: pos.y },
          priority: 50,
        });
      }
    });

    return constraints;
  }

  /**
   * Fix anchor nodes (nodes with many connections) strongly,
   * allow other existing nodes to move slightly
   */
  private static generateFixAnchorsConstraints(
    nodes: NodeModel[],
    existingNodeIds: string[],
    newNodeIds: string[]
  ): NodeConstraint[] {
    const constraints: NodeConstraint[] = [];

    // Calculate connection count for each node
    const connectionCounts = new Map<string, number>();
    // Note: Simple heuristic - treat all existing nodes equally
    // TODO: Calculate actual connectivity when link data is available
    nodes.forEach(node => {
      connectionCounts.set(node.id, 1); // Default connectivity
    });
    nodes.forEach(node => {
    });

    // Determine threshold for "anchor" nodes (top 30% by connections)
    const counts = Array.from(connectionCounts.values()).sort((a, b) => b - a);
    const anchorThreshold = counts[Math.floor(counts.length * 0.3)] || 2;

    existingNodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const pos = node.position;
      const connectionCount = connectionCounts.get(nodeId) || 0;

      if (connectionCount >= anchorThreshold) {
        // High-connectivity nodes are pinned
        constraints.push({
          nodeId,
          type: 'pin',
          position: { x: pos.x, y: pos.y },
          priority: 40,
        });
      } else {
        // Low-connectivity nodes can shift within bounds
        constraints.push({
          nodeId,
          type: 'boundary',
          boundary: {
            minX: pos.x - 30,
            maxX: pos.x + 30,
            minY: pos.y - 30,
            maxY: pos.y + 30,
          },
          priority: 10,
        });
      }
    });

    return constraints;
  }

  /**
   * Pin nodes far from new nodes, allow nodes near new nodes to adjust
   */
  private static generateProximityAwareConstraints(
    nodes: NodeModel[],
    existingNodeIds: string[],
    newNodeIds: string[],
    proximityRadius: number
  ): NodeConstraint[] {
    const constraints: NodeConstraint[] = [];

    // Calculate average position of new nodes (or use 0,0 if no positions yet)
    let newNodeCenterX = 0;
    let newNodeCenterY = 0;
    let validNewNodes = 0;

    newNodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const pos = node.position;
        if (pos && !(pos.x === 0 && pos.y === 0)) {
          newNodeCenterX += pos.x;
          newNodeCenterY += pos.y;
          validNewNodes++;
        }
      }
    });

    if (validNewNodes > 0) {
      newNodeCenterX /= validNewNodes;
      newNodeCenterY /= validNewNodes;
    }

    existingNodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const pos = node.position;
      const distance = Math.sqrt(
        Math.pow(pos.x - newNodeCenterX, 2) + Math.pow(pos.y - newNodeCenterY, 2)
      );

      if (distance > proximityRadius) {
        // Far nodes are pinned
        constraints.push({
          nodeId,
          type: 'pin',
          position: { x: pos.x, y: pos.y },
          priority: 45,
        });
      } else {
        // Near nodes can move within a small boundary
        const allowedMovement = 50;
        constraints.push({
          nodeId,
          type: 'boundary',
          boundary: {
            minX: pos.x - allowedMovement,
            maxX: pos.x + allowedMovement,
            minY: pos.y - allowedMovement,
            maxY: pos.y + allowedMovement,
          },
          priority: 20,
        });
      }
    });

    return constraints;
  }

  /**
   * Allow all existing nodes to move, but constrain within maxShift
   */
  private static generateMinimalShiftConstraints(
    nodes: NodeModel[],
    existingNodeIds: string[],
    maxShift: number
  ): NodeConstraint[] {
    const constraints: NodeConstraint[] = [];

    existingNodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const pos = node.position;
      constraints.push({
        nodeId,
        type: 'boundary',
        boundary: {
          minX: pos.x - maxShift,
          maxX: pos.x + maxShift,
          minY: pos.y - maxShift,
          maxY: pos.y + maxShift,
        },
        priority: 30,
      });
    });

    return constraints;
  }

  /**
   * Calculate movement statistics after incremental layout
   *
   * @param nodes - All nodes
   * @param oldPositions - Map of node IDs to their positions before layout
   * @param newNodeIds - IDs of newly laid out nodes
   * @param constraints - Constraints that were applied
   * @param strategy - Strategy that was used
   * @returns Incremental layout result with statistics
   */
  static calculateResult(
    nodes: NodeModel[],
    oldPositions: Map<string, { x: number; y: number }>,
    newNodeIds: string[],
    constraints: LayoutConstraints,
    strategy: IncrementalLayoutStrategy
  ): IncrementalLayoutResult {
    const movedNodeIds: string[] = [];
    const pinnedNodeIds: string[] = [];
    let maxMovement = 0;
    let totalMovement = 0;
    let movedCount = 0;

    // Identify pinned nodes from constraints
    const pinnedSet = new Set<string>();
    constraints.constraints.forEach(constraint => {
      if (constraint.type === 'pin') {
        pinnedSet.add(constraint.nodeId);
      }
    });

    // Calculate movement for each node
    nodes.forEach(node => {
      const oldPos = oldPositions.get(node.id);
      const newPos = node.position;

      if (!oldPos) return; // New node, skip

      const distance = Math.sqrt(
        Math.pow(newPos.x - oldPos.x, 2) + Math.pow(newPos.y - oldPos.y, 2)
      );

      if (distance > 0.1) { // Threshold to avoid floating point errors
        movedNodeIds.push(node.id);
        maxMovement = Math.max(maxMovement, distance);
        totalMovement += distance;
        movedCount++;
      }

      if (pinnedSet.has(node.id)) {
        pinnedNodeIds.push(node.id);
      }
    });

    return {
      movedNodeIds,
      pinnedNodeIds,
      newlyLaidOutNodeIds: newNodeIds,
      maxMovement,
      avgMovement: movedCount > 0 ? totalMovement / movedCount : 0,
      strategy,
      autoConstraintCount: constraints.constraints.length,
    };
  }
}
