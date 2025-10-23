/**
 * Layout algorithm types and interfaces
 */

import { Point, Size, Rectangle } from '../types';
import { NodeModel } from '../models/NodeModel';
import { DiagramModel } from '../models/DiagramModel';

/**
 * Layout algorithm types
 */
export type LayoutAlgorithmType = 'grid' | 'force-directed' | 'hierarchical' | 'hybrid';

/**
 * Layout mode for automatic vs manual positioning
 */
export type LayoutMode = 'auto' | 'manual';

/**
 * Options for calculating node placement
 */
export interface PlacementOptions {
  /**
   * The node to place
   */
  node: NodeModel;

  /**
   * Current viewport dimensions
   */
  viewport: Rectangle;

  /**
   * Existing nodes in the diagram
   */
  existingNodes: NodeModel[];

  /**
   * Preferred position (optional hint)
   */
  preferredPosition?: Point;

  /**
   * Whether to respect manual positions of existing nodes
   */
  respectManualPositions?: boolean;

  /**
   * Spacing between nodes
   */
  spacing?: number;

  /**
   * Padding from viewport edges
   */
  padding?: number;
}

/**
 * Result of placement calculation
 */
export interface PlacementResult {
  /**
   * Calculated position for the node
   */
  position: Point;

  /**
   * Whether placement was successful
   */
  success: boolean;

  /**
   * Metadata about the placement decision
   */
  metadata?: {
    /**
     * Grid position (for grid layouts)
     */
    gridPosition?: { row: number; column: number };

    /**
     * Pattern detected (for hybrid layouts)
     */
    detectedPattern?: 'grid' | 'tree' | 'freeform';

    /**
     * Reason for placement choice
     */
    reason?: string;

    /**
     * Number of attempts made (for iterative placement)
     */
    attempt?: number;

    /**
     * Allow additional metadata properties
     */
    [key: string]: any;
  };
}

/**
 * Configuration for layout algorithms
 */
export interface LayoutConfiguration {
  /**
   * Algorithm type (optional when passed to reLayout, as it uses current algorithm)
   */
  type?: LayoutAlgorithmType;

  /**
   * Algorithm-specific options
   */
  options?: GridLayoutOptions | ForceDirectedOptions | HierarchicalOptions | HybridOptions;

  /**
   * Whether to animate layout changes
   */
  animate?: boolean;

  /**
   * Animation duration in ms
   */
  animationDuration?: number;

  /**
   * Viewport for viewport-aware layout (Phase 0.5)
   */
  viewport?: Rectangle;

  /**
   * Margins around content (Phase 0.5)
   */
  margins?: number;

  /**
   * Shorthand for hierarchical direction (Phase 0.5)
   */
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
}

/**
 * Grid layout options
 */
export interface GridLayoutOptions {
  /**
   * Number of columns (auto-calculated if not specified)
   */
  columns?: number | 'auto';

  /**
   * Starting position
   */
  startPosition?: Point;

  /**
   * Horizontal spacing between nodes
   */
  horizontalSpacing?: number;

  /**
   * Vertical spacing between nodes
   */
  verticalSpacing?: number;

  /**
   * Node size for calculations (uses actual size if not specified)
   */
  nodeSize?: Size;

  /**
   * Alignment within grid cells
   */
  alignment?: 'start' | 'center' | 'end';

  /**
   * Direction of grid filling
   */
  direction?: 'row' | 'column';
}

/**
 * Force-directed layout options (for future implementation)
 */
export interface ForceDirectedOptions {
  /**
   * Number of simulation iterations (default: 100)
   */
  iterations?: number;

  /**
   * Strength of repulsive force between nodes (default: 5000)
   */
  repulsionStrength?: number;

  /**
   * Strength of attraction between connected nodes (default: 0.01)
   */
  attractionStrength?: number;

  /**
   * Velocity damping factor (0-1, default: 0.9)
   */
  damping?: number;

  /**
   * Initial temperature for simulation (default: 100)
   */
  temperature?: number;

  /**
   * Cooling factor per iteration (default: 0.95)
   */
  coolingFactor?: number;

  /**
   * Minimum distance between nodes (default: 50)
   */
  minDistance?: number;

  /**
   * Maximum distance for force calculation (default: 500)
   */
  maxDistance?: number;

  /**
   * Center gravity strength (pulls towards center, default: 0.1)
   */
  centerGravity?: number;

  /**
   * Pin existing nodes (don't move them)
   */
  pinExistingNodes?: boolean;
}

/**
 * Hierarchical layout options (for future implementation)
 */
export interface HierarchicalOptions {
  /**
   * Direction of hierarchy
   */
  direction?: 'TB' | 'BT' | 'LR' | 'RL'; // Top-Bottom, Bottom-Top, Left-Right, Right-Left

  /**
   * Spacing between nodes in same rank
   */
  nodeSpacing?: number;

  /**
   * Spacing between ranks/levels
   */
  rankSpacing?: number;

  /**
   * Algorithm for rank assignment
   */
  rankAlgorithm?: 'longest-path' | 'coffman-graham';

  /**
   * Whether to minimize edge crossings
   */
  minimizeCrossings?: boolean;

  /**
   * Preserve mental map when re-layouting
   */
  preserveMentalMap?: boolean;
}

/**
 * Hybrid layout options
 */
export interface HybridOptions {
  /**
   * Fallback algorithm if pattern detection fails or confidence is low
   */
  fallbackAlgorithm?: 'grid' | 'force-directed' | 'hierarchical';

  /**
   * Enable automatic algorithm switching based on pattern detection (default: true)
   */
  enableAutoSwitch?: boolean;

  /**
   * Confidence threshold for pattern detection (0-1, default: 0.7)
   * If confidence is below this, fallback algorithm is used
   */
  analysisThreshold?: number;

  /**
   * Options for each sub-algorithm
   */
  gridOptions?: GridLayoutOptions;
  forceDirectedOptions?: ForceDirectedOptions;
  hierarchicalOptions?: HierarchicalOptions;
}

/**
 * Layout event types
 */
export type LayoutEventType =
  | 'layout:started'
  | 'layout:completed'
  | 'layout:failed'
  | 'layout:algorithm-changed'
  | 'layout:node-placed';

/**
 * Layout event data
 */
export interface DiagramLayoutEvent {
  type: LayoutEventType;
  algorithmType: LayoutAlgorithmType;
  data?: any;
}
