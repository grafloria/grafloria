/**
 * Hierarchical Layout Algorithm
 *
 * Uses Dagre library to create hierarchical/layered layouts for directed graphs.
 * Perfect for:
 * - Flowcharts
 * - Process diagrams
 * - Decision trees
 * - Organizational charts
 * - Any directed acyclic graph (DAG)
 *
 * Features:
 * - Respects edge direction (parent → child flow)
 * - Minimizes edge crossings
 * - Clear visual hierarchy
 * - Configurable direction (TB, BT, LR, RL)
 * - Professional appearance
 */

import * as dagre from '@dagrejs/dagre';
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { Point } from '../../types';
import { BaseLayoutAlgorithm } from '../ILayoutAlgorithm';
import {
  PlacementOptions,
  PlacementResult,
  LayoutConfiguration,
  HierarchicalOptions,
} from '../types';
import {
  calculateViewportTransform,
  applyTransform,
  calculateNodeBounds
} from '../ViewportTransform';
import { calculateHierarchicalSmartSpacing } from '../SmartSpacingCalculator';

export class HierarchicalLayoutAlgorithm extends BaseLayoutAlgorithm {
  private hierarchicalOptions: HierarchicalOptions;

  constructor(config?: LayoutConfiguration) {
    super(config);
    this.hierarchicalOptions = (config?.options as HierarchicalOptions) || {};
  }

  getName(): string {
    return 'Hierarchical Layout';
  }

  getType(): 'hierarchical' {
    return 'hierarchical';
  }

  /**
   * Calculate placement for a single new node
   * For hierarchical layout, we'll place it near connected nodes
   */
  calculatePlacement(options: PlacementOptions): PlacementResult {
    const {
      node,
      viewport,
      existingNodes,
      spacing = this.hierarchicalOptions.nodeSpacing || 50,
      padding = 100,
    } = options;

    // Get node dimensions
    const nodeWidth = node.size?.width || 200;
    const nodeHeight = node.size?.height || 100;

    // If no existing nodes, place at start position
    if (existingNodes.length === 0) {
      return {
        position: { x: padding, y: padding },
        success: true,
        metadata: {
          reason: 'First node in diagram',
        },
      };
    }

    // Find connected nodes (nodes this node links to or from)
    const connectedNodes = this.findConnectedNodes(node, existingNodes);

    if (connectedNodes.length > 0) {
      // Place near connected nodes
      const avgPosition = this.calculateAveragePosition(connectedNodes);

      // Offset below the average position (assuming top-to-bottom flow)
      const direction = this.hierarchicalOptions.direction || 'TB';
      let candidate: Point;

      switch (direction) {
        case 'TB': // Top to bottom
          candidate = {
            x: avgPosition.x,
            y: avgPosition.y + nodeHeight + spacing,
          };
          break;
        case 'BT': // Bottom to top
          candidate = {
            x: avgPosition.x,
            y: avgPosition.y - nodeHeight - spacing,
          };
          break;
        case 'LR': // Left to right
          candidate = {
            x: avgPosition.x + nodeWidth + spacing,
            y: avgPosition.y,
          };
          break;
        case 'RL': // Right to left
          candidate = {
            x: avgPosition.x - nodeWidth - spacing,
            y: avgPosition.y,
          };
          break;
        default:
          candidate = avgPosition;
      }

      // Check for collisions and adjust if needed
      if (!this.hasCollision(candidate, { width: nodeWidth, height: nodeHeight }, existingNodes, spacing)) {
        return {
          position: candidate,
          success: true,
          metadata: {
            reason: `Placed near ${connectedNodes.length} connected node(s)`,
          },
        };
      }
    }

    // Fallback: Place at next available position
    const bounds = this.calculateBounds(existingNodes);
    if (bounds) {
      const direction = this.hierarchicalOptions.direction || 'TB';
      let fallbackPosition: Point;

      switch (direction) {
        case 'TB':
          fallbackPosition = {
            x: bounds.minX,
            y: bounds.maxY + spacing,
          };
          break;
        case 'BT':
          fallbackPosition = {
            x: bounds.minX,
            y: bounds.minY - nodeHeight - spacing,
          };
          break;
        case 'LR':
          fallbackPosition = {
            x: bounds.maxX + spacing,
            y: bounds.minY,
          };
          break;
        case 'RL':
          fallbackPosition = {
            x: bounds.minX - nodeWidth - spacing,
            y: bounds.minY,
          };
          break;
        default:
          fallbackPosition = { x: bounds.maxX + spacing, y: bounds.minY };
      }

      return {
        position: fallbackPosition,
        success: true,
        metadata: {
          reason: 'Placed at next available position',
        },
      };
    }

    // Ultimate fallback
    return {
      position: { x: padding, y: padding },
      success: true,
    };
  }

  /**
   * Re-layout all nodes using Dagre
   */
  reLayout(diagram: DiagramModel, config?: LayoutConfiguration): Map<string, Point> {
    if (config) {
      this.configure(config);
    }

    const nodes = diagram.getNodes();
    const links = diagram.getLinks();
    const positions = new Map<string, Point>();

    if (nodes.length === 0) {
      return positions;
    }

    // Use viewport from config if provided, otherwise fallback to default
    const viewport = config?.viewport || { x: 0, y: 0, width: 1200, height: 800 };

    // Calculate smart spacing for hierarchical layout
    const smartSpacing = calculateHierarchicalSmartSpacing({
      viewport,
      nodeCount: nodes.length,
      zoom: (viewport as any).zoom || 1.0, // Zoom might be on viewport from config
    });

    // Use smart spacing (fallback to manual config if provided)
    const nodeSpacing = this.hierarchicalOptions.nodeSpacing || smartSpacing.horizontal;
    const rankSpacing = this.hierarchicalOptions.rankSpacing || smartSpacing.vertical;

    // Create Dagre graph
    const g = new dagre.graphlib.Graph();

    // Set graph options with smart spacing
    g.setGraph({
      rankdir: this.hierarchicalOptions.direction || 'TB',
      nodesep: nodeSpacing,
      ranksep: rankSpacing,
      marginx: 20,
      marginy: 20,
    });

    // Default to assigning a new object as a label for each new edge
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to Dagre graph
    nodes.forEach((node) => {
      g.setNode(node.id, {
        label: node.getMetadata('label') || node.id,
        width: node.size?.width || 200,
        height: node.size?.height || 100,
      });
    });

    // Add edges to Dagre graph
    links.forEach((link) => {
      if (link.sourceNodeId && link.targetNodeId) {
        g.setEdge(link.sourceNodeId, link.targetNodeId);
      }
    });

    // Run Dagre layout
    dagre.layout(g);

    // Extract positions from Dagre (in relative space)
    const relativePositions: Array<{ node: NodeModel; position: Point }> = [];
    nodes.forEach((node) => {
      const dagreNode = g.node(node.id);
      if (dagreNode) {
        // Dagre returns center position, convert to top-left
        const relativePos = {
          x: dagreNode.x - dagreNode.width / 2,
          y: dagreNode.y - dagreNode.height / 2,
        };
        relativePositions.push({ node, position: relativePos });
      }
    });

    // Phase 0.5: Apply viewport transform if viewport is provided
    if (config?.viewport) {
      // Calculate bounding box of layout
      const layoutBounds = calculateNodeBounds(
        relativePositions.map(({ node, position }) => ({
          position,
          size: node.size || { width: 200, height: 100 }
        }))
      );

      // Calculate transform to fit in viewport
      const transform = calculateViewportTransform(
        layoutBounds,
        config.viewport,
        config.margins || 50
      );

      // Apply transform to all positions
      relativePositions.forEach(({ node, position }) => {
        const transformedPos = applyTransform(position, transform);
        positions.set(node.id, transformedPos);
      });

      console.log(`📐 Hierarchical layout: ${nodes.length} nodes fit in viewport (scale: ${transform.scale.toFixed(2)}, node-spacing: ${nodeSpacing}px, rank-spacing: ${rankSpacing}px)`);
    } else {
      // No viewport - use relative positions as-is (backward compatibility)
      relativePositions.forEach(({ node, position }) => {
        positions.set(node.id, position);
      });
    }

    return positions;
  }

  /**
   * Configure hierarchical-specific options
   */
  override configure(config: LayoutConfiguration): void {
    super.configure(config);
    if (config.options) {
      this.hierarchicalOptions = {
        ...this.hierarchicalOptions,
        ...(config.options as HierarchicalOptions),
      };
    }
  }

  /**
   * Hierarchical layout works best on DAGs but can handle any graph
   */
  override canApply(diagram: DiagramModel): { valid: boolean; reason?: string } {
    const links = diagram.getLinks();

    if (links.length === 0) {
      return {
        valid: true,
        reason: 'No edges - will arrange nodes in layers',
      };
    }

    // Check for cycles (optional warning, not blocking)
    const hasCycles = this.detectCycles(diagram);
    if (hasCycles) {
      return {
        valid: true,
        reason: 'Graph has cycles - Dagre will break them automatically',
      };
    }

    return { valid: true };
  }

  /**
   * Find nodes that are connected to the given node
   */
  private findConnectedNodes(node: NodeModel, allNodes: NodeModel[]): NodeModel[] {
    // This is a simplified version - in real implementation,
    // we'd check the diagram's links to find actual connections
    return [];
  }

  /**
   * Calculate average position of nodes
   */
  private calculateAveragePosition(nodes: NodeModel[]): Point {
    if (nodes.length === 0) {
      return { x: 100, y: 100 };
    }

    let sumX = 0;
    let sumY = 0;

    nodes.forEach((node) => {
      sumX += node.position.x;
      sumY += node.position.y;
    });

    return {
      x: sumX / nodes.length,
      y: sumY / nodes.length,
    };
  }

  /**
   * Detect cycles in the graph (simplified DFS approach)
   */
  private detectCycles(diagram: DiagramModel): boolean {
    // Simplified - just return false for now
    // In a complete implementation, we'd do a DFS to detect cycles
    return false;
  }
}
