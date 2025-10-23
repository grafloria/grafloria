/**
 * Interface for layout algorithms
 *
 * All layout algorithms must implement this interface to be used by the LayoutManager.
 * This provides a consistent API for different layout strategies.
 */

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { Point } from '../types';
import { PlacementOptions, PlacementResult, LayoutConfiguration } from './types';

export interface ILayoutAlgorithm {
  /**
   * Get the name of the layout algorithm
   */
  getName(): string;

  /**
   * Get the type of the layout algorithm
   */
  getType(): 'grid' | 'force-directed' | 'hierarchical' | 'hybrid';

  /**
   * Calculate position for a single new node
   *
   * This is called when a node is added to the diagram.
   * The algorithm should return a position that:
   * - Doesn't overlap with existing nodes
   * - Follows the layout strategy
   * - Fits within the viewport (or is close to existing content)
   *
   * @param options - Placement options
   * @returns Placement result with position and metadata
   */
  calculatePlacement(options: PlacementOptions): PlacementResult;

  /**
   * Re-layout all nodes in the diagram
   *
   * This is called when the user explicitly requests a re-layout (e.g., clicks "Re-Arrange" button).
   * The algorithm should calculate new positions for ALL nodes.
   *
   * @param diagram - The diagram to layout
   * @param config - Layout configuration
   * @returns Map of node IDs to new positions
   */
  reLayout(diagram: DiagramModel, config?: LayoutConfiguration): Map<string, Point>;

  /**
   * Configure the layout algorithm
   *
   * @param config - Configuration options
   */
  configure(config: LayoutConfiguration): void;

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfiguration(): LayoutConfiguration;

  /**
   * Validate if this algorithm can be applied to the given diagram
   *
   * For example:
   * - Hierarchical layout requires a DAG (no cycles)
   * - Force-directed works better with connected nodes
   *
   * @param diagram - The diagram to validate
   * @returns true if algorithm can be applied, false with reason if not
   */
  canApply(diagram: DiagramModel): { valid: boolean; reason?: string };

  /**
   * Called when the algorithm is activated
   * Use this to initialize any state or caches
   */
  onActivate?(): void;

  /**
   * Called when the algorithm is deactivated
   * Use this to clean up state or caches
   */
  onDeactivate?(): void;
}

/**
 * Base abstract class for layout algorithms
 *
 * Provides common functionality that all layout algorithms can use.
 * Extend this class when implementing a new layout algorithm.
 */
export abstract class BaseLayoutAlgorithm implements ILayoutAlgorithm {
  protected config: LayoutConfiguration;

  constructor(config?: LayoutConfiguration) {
    this.config = config || {
      type: this.getType(),
      animate: false,
    };
  }

  abstract getName(): string;
  abstract getType(): 'grid' | 'force-directed' | 'hierarchical' | 'hybrid';
  abstract calculatePlacement(options: PlacementOptions): PlacementResult;
  abstract reLayout(diagram: DiagramModel, config?: LayoutConfiguration): Map<string, Point>;

  configure(config: LayoutConfiguration): void {
    this.config = { ...this.config, ...config };
  }

  getConfiguration(): LayoutConfiguration {
    return { ...this.config };
  }

  canApply(diagram: DiagramModel): { valid: boolean; reason?: string } {
    // Default implementation: always valid
    return { valid: true };
  }

  /**
   * Utility: Check if a position would collide with existing nodes
   */
  protected hasCollision(
    position: Point,
    size: { width: number; height: number },
    existingNodes: NodeModel[],
    spacing: number = 20
  ): boolean {
    const testBounds = {
      left: position.x,
      top: position.y,
      right: position.x + size.width,
      bottom: position.y + size.height,
    };

    for (const node of existingNodes) {
      const bounds = node.getBoundingBox();
      const expandedBounds = {
        left: bounds.left - spacing,
        top: bounds.top - spacing,
        right: bounds.right + spacing,
        bottom: bounds.bottom + spacing,
      };

      if (this.boundsIntersect(testBounds, expandedBounds)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Utility: Check if two bounding boxes intersect
   */
  protected boundsIntersect(box1: any, box2: any): boolean {
    return !(
      box1.right < box2.left ||
      box1.left > box2.right ||
      box1.bottom < box2.top ||
      box1.top > box2.bottom
    );
  }

  /**
   * Utility: Calculate bounding box of all nodes
   */
  protected calculateBounds(nodes: NodeModel[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    if (nodes.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    }

    return { minX, minY, maxX, maxY };
  }
}
