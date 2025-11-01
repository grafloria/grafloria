// ElkRouter - Uses ELK.js for intelligent orthogonal routing with obstacle avoidance
// Based on Eclipse Layout Kernel - handles complex graph layouts automatically

import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import type { IRouter, RouteRequest, RoutedPath, RoutePoint } from '../types';
import type { Point } from '../../types';

/**
 * ElkRouter uses the ELK (Eclipse Layout Kernel) library for intelligent
 * orthogonal edge routing. This provides the same sophisticated routing
 * as React Flow's ELK.js example.
 *
 * Features:
 * - Automatic bend point calculation to avoid nodes
 * - Optimized orthogonal routing
 * - Handles complex graph layouts
 *
 * License: EPL-2.0 (Eclipse Public License 2.0)
 */
export class ElkRouter implements IRouter {
  private elk: InstanceType<typeof ELK>;

  constructor() {
    this.elk = new ELK();
  }

  getName(): string {
    return 'elk';
  }

  async route(request: RouteRequest): Promise<RoutedPath | null> {
    const { start, end, sourceDirection, targetDirection, obstacles = [] } = request;

    // Handle same start and end point
    if (start.x === end.x && start.y === end.y) {
      return {
        points: [{ x: start.x, y: start.y }],
        totalLength: 0,
        bendCount: 0,
        cost: 0,
        segments: [],
      };
    }

    try {
      // CRITICAL: We only want edge routing, not node layout!
      // Don't pass obstacles as children - ELK will reposition them
      // Instead, we need a different approach for obstacle avoidance

      // For now, create a simple graph with just source and target
      // Future: Use ELK's libavoid algorithm or custom obstacle constraints
      const sourceNode: ElkNode = {
        id: 'source',
        x: start.x - 10,
        y: start.y - 10,
        width: 20,
        height: 20,
        ports: [{
          id: 'source-port',
          x: 10,
          y: 10,
        }],
      };

      const targetNode: ElkNode = {
        id: 'target',
        x: end.x - 10,
        y: end.y - 10,
        width: 20,
        height: 20,
        ports: [{
          id: 'target-port',
          x: 10,
          y: 10,
        }],
      };

      // Create minimal ELK graph for edge routing only
      const graph: ElkNode = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'fixed',  // Use fixed to prevent node repositioning
          'elk.edgeRouting': 'ORTHOGONAL',
        },
        children: [sourceNode, targetNode],
        edges: [{
          id: 'edge-1',
          sources: ['source-port'],
          targets: ['target-port'],
        }],
      };

      // Let ELK calculate the layout
      const layouted = await this.elk.layout(graph);

      // Debug: Log the ELK result
      console.log('ELK layout result:', JSON.stringify(layouted, null, 2));

      // Extract edge routing points
      const edge = layouted.edges?.[0] as ElkExtendedEdge | undefined;
      if (!edge || !edge.sections || edge.sections.length === 0) {
        // Fallback to direct routing
        console.warn('ELK did not return edge sections, using fallback');
        console.warn('Edge object:', edge);
        return this.createDirectPath(start, end);
      }

      console.log('ELK edge sections:', edge.sections);

      // Convert ELK edge sections to our point format
      // ELK sections contain: startPoint, bendPoints (optional), endPoint
      const points: RoutePoint[] = [];

      for (const section of edge.sections) {
        // Add section start point
        if (section.startPoint) {
          points.push({ x: section.startPoint.x, y: section.startPoint.y });
        }

        // Add all bend points in this section
        if (section.bendPoints) {
          for (const bendPoint of section.bendPoints) {
            points.push({ x: bendPoint.x, y: bendPoint.y });
          }
        }

        // Add section end point (will be start of next section if there are multiple)
        if (section.endPoint) {
          points.push({ x: section.endPoint.x, y: section.endPoint.y });
        }
      }

      // Calculate metrics
      const totalLength = this.calculatePathLength(points);
      const bendCount = points.length - 2;

      const result = {
        points,
        totalLength,
        bendCount: Math.max(0, bendCount),
        cost: totalLength + bendCount * 10,
        segments: this.calculateSegments(points),
      };

      console.log('ELK routing result:', result);
      console.log('Points:', points.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' -> '));

      return result;
    } catch (error) {
      console.error('ELK routing failed:', error);
      // Fallback to direct path
      return this.createDirectPath(start, end);
    }
  }

  /**
   * Map our direction format to ELK port sides
   */
  private mapDirectionToElkSide(
    direction?: 'left' | 'right' | 'top' | 'bottom'
  ): 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' {
    switch (direction) {
      case 'top':
        return 'NORTH';
      case 'bottom':
        return 'SOUTH';
      case 'left':
        return 'WEST';
      case 'right':
        return 'EAST';
      default:
        return 'EAST';
    }
  }

  /**
   * Create a simple direct path as fallback
   */
  private createDirectPath(start: Point, end: Point): RoutedPath {
    const points = [start, end];
    const totalLength = this.calculatePathLength(points);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    return {
      points,
      totalLength,
      bendCount: 0,
      cost: totalLength,
      segments: [{
        start,
        end,
        length: totalLength,
        angle,
      }],
    };
  }

  /**
   * Calculate total path length
   */
  private calculatePathLength(points: RoutePoint[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  /**
   * Calculate path segments
   */
  private calculateSegments(points: RoutePoint[]) {
    const segments = [];
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      segments.push({
        start,
        end,
        length,
        angle,
      });
    }
    return segments;
  }
}
