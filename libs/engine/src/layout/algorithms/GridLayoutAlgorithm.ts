/**
 * Grid Layout Algorithm
 *
 * Places nodes in a grid pattern with smart column calculation based on viewport width.
 * This is the fastest and most predictable layout algorithm, ideal for:
 * - General-purpose diagrams where structure is unknown
 * - Incremental node addition
 * - When users will manually arrange nodes later
 *
 * Features:
 * - Auto-calculates optimal number of columns based on viewport width
 * - Guarantees collision-free placement
 * - Maintains existing positions when re-layouting
 * - Viewport-aware (keeps nodes visible)
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { Point } from '../../types';
import { BaseLayoutAlgorithm } from '../ILayoutAlgorithm';
import {
  PlacementOptions,
  PlacementResult,
  LayoutConfiguration,
  GridLayoutOptions,
} from '../types';
import {
  calculateViewportTransform,
  applyTransform,
  calculateNodeBounds
} from '../ViewportTransform';
import { calculateGridSmartSpacing } from '../SmartSpacingCalculator';

export class GridLayoutAlgorithm extends BaseLayoutAlgorithm {
  private gridOptions: GridLayoutOptions;

  constructor(config?: LayoutConfiguration) {
    super(config);
    this.gridOptions = (config?.options as GridLayoutOptions) || {};
  }

  getName(): string {
    return 'Grid Layout';
  }

  getType(): 'grid' {
    return 'grid';
  }

  /**
   * Calculate placement for a single new node
   */
  calculatePlacement(options: PlacementOptions): PlacementResult {
    const {
      node,
      viewport,
      existingNodes,
      spacing = this.gridOptions.horizontalSpacing || 20,
      padding = 100,
    } = options;

    // Get node dimensions
    const nodeWidth = node.size?.width || this.gridOptions.nodeSize?.width || 200;
    const nodeHeight = node.size?.height || this.gridOptions.nodeSize?.height || 100;

    // Calculate grid parameters
    const gridParams = this.calculateGridParameters(
      viewport,
      nodeWidth,
      nodeHeight,
      spacing,
      padding
    );

    // Find next available position in grid
    const position = this.findNextGridPosition(
      existingNodes,
      gridParams,
      nodeWidth,
      nodeHeight,
      spacing
    );

    return {
      position,
      success: true,
      metadata: {
        gridPosition: {
          row: Math.floor((position.y - gridParams.startY) / gridParams.rowHeight),
          column: Math.floor((position.x - gridParams.startX) / gridParams.columnWidth),
        },
        detectedPattern: 'grid',
        reason: `Placed in grid at row ${Math.floor(
          (position.y - gridParams.startY) / gridParams.rowHeight
        )}, column ${Math.floor((position.x - gridParams.startX) / gridParams.columnWidth)}`,
      },
    };
  }

  /**
   * Re-layout all nodes in grid pattern (Phase 0.5 - Viewport-aware)
   */
  reLayout(diagram: DiagramModel, config?: LayoutConfiguration): Map<string, Point> {
    if (config) {
      this.configure(config);
    }

    const nodes = diagram.getNodes();
    const positions = new Map<string, Point>();

    if (nodes.length === 0) {
      return positions;
    }

    // Get node dimensions (use first node as reference)
    const referenceNode = nodes[0];
    const nodeWidth = referenceNode.size?.width || this.gridOptions.nodeSize?.width || 200;
    const nodeHeight = referenceNode.size?.height || this.gridOptions.nodeSize?.height || 100;

    // Use viewport from config if provided (Phase 0.5), otherwise fallback to default
    const viewport = config?.viewport || { x: 0, y: 0, width: 1200, height: 800 };

    // Calculate initial columns for smart spacing calculation
    const initialColumns = this.calculateOptimalColumns(viewport, nodeWidth, 20, 100);

    // Calculate smart spacing based on viewport, node count, and zoom
    const smartSpacing = calculateGridSmartSpacing(
      {
        viewport,
        nodeCount: nodes.length,
        zoom: (viewport as any).zoom || 1.0, // Zoom might be on viewport from config
        averageNodeSize: { width: nodeWidth, height: nodeHeight }
      },
      initialColumns
    );

    // Use smart spacing (fallback to manual config if provided)
    const spacing = this.gridOptions.horizontalSpacing || smartSpacing.horizontal;
    const padding = smartSpacing.padding;

    // Calculate grid parameters based on viewport
    const gridParams = this.calculateGridParameters(
      viewport,
      nodeWidth,
      nodeHeight,
      spacing,
      padding
    );

    // Calculate grid positions in relative space (starting from 0,0)
    const relativePositions: Array<{ node: NodeModel; position: Point }> = [];
    nodes.forEach((node, index) => {
      const row = Math.floor(index / gridParams.columns);
      const col = index % gridParams.columns;

      const relativePos = {
        x: col * gridParams.columnWidth,
        y: row * gridParams.rowHeight,
      };

      relativePositions.push({ node, position: relativePos });
    });

    // Phase 0.5: Apply viewport transform if viewport is provided
    if (config?.viewport) {
      // Calculate bounding box of grid layout
      const layoutBounds = calculateNodeBounds(
        relativePositions.map(({ node, position }) => ({
          position,
          size: node.size || { width: nodeWidth, height: nodeHeight }
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

      console.log(`📐 Grid layout: ${nodes.length} nodes in ${gridParams.columns} columns, fit in viewport (scale: ${transform.scale.toFixed(2)}, spacing: ${spacing}px)`);
    } else {
      // No viewport - use relative positions with padding offset (backward compatibility)
      relativePositions.forEach(({ node, position }) => {
        positions.set(node.id, {
          x: position.x + padding,
          y: position.y + padding
        });
      });
    }

    return positions;
  }

  /**
   * Calculate optimal number of columns for grid layout
   */
  private calculateOptimalColumns(
    viewport: { x: number; y: number; width: number; height: number },
    nodeWidth: number,
    spacing: number,
    padding: number
  ): number {
    if (this.gridOptions.columns !== 'auto' && this.gridOptions.columns !== undefined) {
      return this.gridOptions.columns as number;
    }

    const columnWidth = nodeWidth + spacing;
    const availableWidth = viewport.width - padding * 2;
    const maxColumns = Math.floor(availableWidth / columnWidth);

    // Use at least 2 columns, at most what fits in viewport
    let columns = Math.max(2, Math.min(maxColumns, 5)); // Cap at 5 for readability

    // If viewport is very wide, use more columns
    if (viewport.width > 2000) {
      columns = Math.min(maxColumns, 6);
    }

    return columns;
  }

  /**
   * Calculate optimal grid parameters based on viewport and node dimensions
   */
  private calculateGridParameters(
    viewport: { x: number; y: number; width: number; height: number },
    nodeWidth: number,
    nodeHeight: number,
    spacing: number,
    padding: number
  ): {
    columns: number;
    startX: number;
    startY: number;
    columnWidth: number;
    rowHeight: number;
  } {
    // Start position with padding from viewport edges
    const startX = this.gridOptions.startPosition?.x || padding;
    const startY = this.gridOptions.startPosition?.y || padding;

    // Calculate column and row dimensions
    const columnWidth = nodeWidth + spacing;
    const rowHeight = nodeHeight + spacing;

    // Calculate optimal number of columns
    let columns: number;

    if (this.gridOptions.columns === 'auto' || this.gridOptions.columns === undefined) {
      // Smart calculation: fit as many columns as possible in viewport
      const availableWidth = viewport.width - padding * 2;
      const maxColumns = Math.floor(availableWidth / columnWidth);

      // Use at least 2 columns, at most what fits in viewport
      columns = Math.max(2, Math.min(maxColumns, 5)); // Cap at 5 for readability

      // If viewport is very wide, use more columns
      if (viewport.width > 2000) {
        columns = Math.min(maxColumns, 6);
      }
    } else {
      columns = this.gridOptions.columns as number;
    }

    return {
      columns,
      startX,
      startY,
      columnWidth,
      rowHeight,
    };
  }

  /**
   * Find next available grid position that doesn't collide with existing nodes
   */
  private findNextGridPosition(
    existingNodes: NodeModel[],
    gridParams: {
      columns: number;
      startX: number;
      startY: number;
      columnWidth: number;
      rowHeight: number;
    },
    nodeWidth: number,
    nodeHeight: number,
    spacing: number
  ): Point {
    // Try grid positions systematically
    for (let row = 0; row < 1000; row++) {
      // Support up to 1000 rows
      for (let col = 0; col < gridParams.columns; col++) {
        const candidate = {
          x: gridParams.startX + col * gridParams.columnWidth,
          y: gridParams.startY + row * gridParams.rowHeight,
        };

        if (!this.hasCollision(candidate, { width: nodeWidth, height: nodeHeight }, existingNodes, spacing)) {
          return candidate;
        }
      }
    }

    // Fallback (should never reach here with proper grid)
    return {
      x: gridParams.startX,
      y: gridParams.startY + existingNodes.length * gridParams.rowHeight,
    };
  }

  /**
   * Configure grid-specific options
   */
  override configure(config: LayoutConfiguration): void {
    super.configure(config);
    if (config.options) {
      this.gridOptions = { ...this.gridOptions, ...(config.options as GridLayoutOptions) };
    }
  }

  /**
   * Grid layout can always be applied
   */
  override canApply(diagram: DiagramModel): { valid: boolean; reason?: string } {
    return { valid: true };
  }
}
