/**
 * Layout Adapter Interface
 *
 * Defines the common interface for external layout library adapters.
 * This allows seamless integration of different layout engines (Dagre, ELK, etc.)
 * into the Grafloria diagram engine.
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { LayoutConstraints } from './layout-constraints.interface';

/**
 * Base options for all layout adapters
 */
export interface LayoutOptions {
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
   * Validate that options are valid for this adapter
   *
   * @param options - Options to validate
   * @returns true if valid, false otherwise
   */
  validateOptions(options: Partial<LayoutOptions>): boolean;
}
