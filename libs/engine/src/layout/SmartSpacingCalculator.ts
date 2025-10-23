/**
 * Smart Spacing Calculator
 *
 * Dynamically calculates optimal node spacing based on:
 * - Viewport dimensions (larger viewport = more space)
 * - Node count (fewer nodes = more space, many nodes = compact)
 * - Zoom level (zoomed in = more space, zoomed out = compact)
 * - Node sizes (larger nodes = more space)
 *
 * This creates a more natural, adaptive layout that feels appropriate
 * at any zoom level or node count.
 */

import { Rectangle, Size } from '../types';

export interface SmartSpacingOptions {
  /** Viewport for layout calculations */
  viewport: Rectangle;

  /** Number of nodes to layout */
  nodeCount: number;

  /** Current zoom level (1.0 = 100%) */
  zoom?: number;

  /** Average node size (optional, for better calculations) */
  averageNodeSize?: Size;

  /** Minimum spacing (default: 10) */
  minSpacing?: number;

  /** Maximum spacing (default: 200) */
  maxSpacing?: number;

  /** Base spacing factor (default: 0.03 = 3% of viewport dimension) */
  baseSpacingFactor?: number;
}

export interface SmartSpacingResult {
  /** Calculated horizontal spacing */
  horizontal: number;

  /** Calculated vertical spacing */
  vertical: number;

  /** Padding around content */
  padding: number;

  /** Metadata about calculation */
  metadata: {
    densityFactor: number;  // 0.0 to 1.0 (1.0 = very sparse, 0.0 = very dense)
    zoomFactor: number;     // How zoom affected spacing
    viewportSize: number;   // Average viewport dimension used
  };
}

/**
 * Calculate smart spacing for layout algorithms
 */
export function calculateSmartSpacing(options: SmartSpacingOptions): SmartSpacingResult {
  const {
    viewport,
    nodeCount,
    zoom = 1.0,
    averageNodeSize,
    minSpacing = 10,
    maxSpacing = 200,
    baseSpacingFactor = 0.03 // 3% of viewport dimension
  } = options;

  // Calculate viewport size (use average of width and height)
  const viewportSize = (viewport.width + viewport.height) / 2;

  // Calculate base spacing from viewport size
  // Larger viewport = more space available
  const baseSpacing = viewportSize * baseSpacingFactor;

  // Calculate density factor based on node count
  // Fewer nodes = more sparse = larger spacing
  // More nodes = more dense = smaller spacing
  // Uses logarithmic scale to handle wide range of node counts
  const densityFactor = calculateDensityFactor(nodeCount);

  // Calculate zoom factor
  // Zoomed in (zoom > 1.0) = see less area = more space between nodes
  // Zoomed out (zoom < 1.0) = see more area = less space between nodes
  const zoomFactor = Math.sqrt(zoom); // Square root for gradual effect

  // Combine factors
  let spacing = baseSpacing * densityFactor * zoomFactor;

  // Apply bounds
  spacing = Math.max(minSpacing, Math.min(maxSpacing, spacing));

  // Vertical spacing can be slightly larger (aesthetically pleasing)
  const verticalSpacing = spacing * 1.2;

  // Padding is proportional to spacing
  const padding = Math.max(50, spacing * 2);

  return {
    horizontal: Math.round(spacing),
    vertical: Math.round(verticalSpacing),
    padding: Math.round(padding),
    metadata: {
      densityFactor,
      zoomFactor,
      viewportSize
    }
  };
}

/**
 * Calculate density factor based on node count
 * Returns value between 0.3 and 2.0
 * - 1 node: 2.0 (very sparse)
 * - 4 nodes: 1.5 (sparse)
 * - 10 nodes: 1.0 (normal)
 * - 50 nodes: 0.6 (dense)
 * - 100+ nodes: 0.3 (very dense)
 */
function calculateDensityFactor(nodeCount: number): number {
  if (nodeCount <= 0) return 2.0;

  if (nodeCount === 1) return 2.0;
  if (nodeCount <= 3) return 1.8;
  if (nodeCount <= 5) return 1.5;
  if (nodeCount <= 10) return 1.0;
  if (nodeCount <= 20) return 0.8;
  if (nodeCount <= 50) return 0.6;
  if (nodeCount <= 100) return 0.4;

  return 0.3; // Very dense for large diagrams
}

/**
 * Calculate smart spacing specifically for grid layouts
 * Takes into account grid columns to optimize spacing
 */
export function calculateGridSmartSpacing(
  options: SmartSpacingOptions,
  columns: number
): SmartSpacingResult {
  const baseResult = calculateSmartSpacing(options);

  // Adjust horizontal spacing based on columns
  // More columns = can afford less horizontal space
  // Fewer columns = add more horizontal space
  const columnFactor = Math.max(0.7, Math.min(1.3, 1.0 / Math.sqrt(columns / 3)));

  return {
    horizontal: Math.round(baseResult.horizontal * columnFactor),
    vertical: baseResult.vertical,
    padding: baseResult.padding,
    metadata: {
      ...baseResult.metadata,
      densityFactor: baseResult.metadata.densityFactor * columnFactor
    }
  };
}

/**
 * Calculate smart spacing specifically for hierarchical layouts
 * Emphasizes vertical spacing for level separation
 */
export function calculateHierarchicalSmartSpacing(
  options: SmartSpacingOptions
): SmartSpacingResult {
  const baseResult = calculateSmartSpacing(options);

  // Hierarchical needs more vertical space for level clarity
  // But can be more compact horizontally
  return {
    horizontal: Math.round(baseResult.horizontal * 0.8),
    vertical: Math.round(baseResult.vertical * 1.5), // 50% more vertical space
    padding: baseResult.padding,
    metadata: baseResult.metadata
  };
}

/**
 * Calculate smart spacing for force-directed layouts
 * Uses spacing to set ideal spring length
 */
export function calculateForceDirectedSmartSpacing(
  options: SmartSpacingOptions
): SmartSpacingResult {
  const baseResult = calculateSmartSpacing(options);

  // Force-directed should have balanced spacing
  // Use average of horizontal and vertical
  const avgSpacing = (baseResult.horizontal + baseResult.vertical) / 2;

  return {
    horizontal: Math.round(avgSpacing),
    vertical: Math.round(avgSpacing),
    padding: baseResult.padding,
    metadata: baseResult.metadata
  };
}
