// JumpPointRenderer.ts
// Renders jump points (arcs/gaps/bridges) at link intersections (Phase 1.3 Part 2)

import type { JumpPointConfig } from '@grafloria/engine';
import type { Intersection } from './JumpPointDetector';
import type { VNode } from '../types/vnode.types';

/**
 * Point interface
 */
interface Point {
  x: number;
  y: number;
}

/**
 * JumpPointRenderer modifies link paths to show jump points at intersections.
 *
 * Supports three visual styles:
 * - arc: Small arc over intersection
 * - gap: Break in line
 * - bridge: Bridge shape over intersection
 *
 * Algorithm:
 * 1. Parse path to extract points
 * 2. Sort intersections by position
 * 3. Split path at intersections
 * 4. Insert jump point geometry
 * 5. Reconstruct path
 */
export class JumpPointRenderer {
  private readonly defaultSize = 10;

  /**
   * Render path with jump points at intersections
   *
   * @param pathData Original SVG path data
   * @param intersections Array of intersections
   * @param config Jump point configuration
   * @param originalProps Original path properties to preserve
   * @returns VNode with modified path
   */
  renderWithJumpPoints(
    pathData: string,
    intersections: Intersection[],
    config: JumpPointConfig,
    originalProps?: Record<string, any>
  ): VNode {
    // Return unchanged if disabled or no intersections
    if (!config.enabled || !intersections || intersections.length === 0) {
      return {
        type: 'path',
        props: {
          d: pathData,
          ...originalProps
        }
      };
    }

    // Handle empty or invalid path
    if (!pathData || pathData.trim() === '') {
      return {
        type: 'path',
        props: {
          d: pathData,
          ...originalProps
        }
      };
    }

    // Get configuration
    const size = config.size ?? this.defaultSize;
    const style = config.style ?? 'arc';

    // Skip if size is zero
    if (size === 0) {
      return {
        type: 'path',
        props: {
          d: pathData,
          ...originalProps
        }
      };
    }

    // Parse path to points
    const points = this.parsePathToPoints(pathData);
    if (points.length < 2) {
      return {
        type: 'path',
        props: {
          d: pathData,
          ...originalProps
        }
      };
    }

    // Sort intersections by position
    const sortedIntersections = [...intersections].sort((a, b) => {
      const segA = a.segmentIndex ?? 0;
      const segB = b.segmentIndex ?? 0;
      if (segA !== segB) return segA - segB;
      return a.t1 - b.t1;
    });

    // Build modified path
    let modifiedPath = '';
    let currentSegmentIndex = 0;
    let lastPoint = points[0]!;
    let segmentStart = points[0]!;
    let pendingMove = true;

    for (let i = 0; i < points.length - 1; i++) {
      const segmentEnd = points[i + 1]!;

      // Get intersections for this segment
      const segmentIntersections = sortedIntersections.filter(
        inter => (inter.segmentIndex ?? 0) === i && inter.t1 >= 0 && inter.t1 <= 1
      );

      if (segmentIntersections.length === 0) {
        // No intersections, add normal line
        if (pendingMove) {
          modifiedPath += `M ${segmentStart.x} ${segmentStart.y} `;
          pendingMove = false;
        }
        modifiedPath += `L ${segmentEnd.x} ${segmentEnd.y} `;
        lastPoint = segmentEnd;
      } else {
        // Has intersections, split segment
        let segmentT = 0;

        for (const intersection of segmentIntersections) {
          const t = intersection.t1;

          // Calculate points before and after intersection
          const beforePoint = this.interpolatePoint(segmentStart, segmentEnd, Math.max(0, t - size / this.getSegmentLength(segmentStart, segmentEnd)));
          const afterPoint = this.interpolatePoint(segmentStart, segmentEnd, Math.min(1, t + size / this.getSegmentLength(segmentStart, segmentEnd)));

          // Add segment up to jump point
          if (pendingMove) {
            modifiedPath += `M ${segmentStart.x} ${segmentStart.y} `;
            pendingMove = false;
          }
          modifiedPath += `L ${beforePoint.x} ${beforePoint.y} `;

          // Add jump point
          const jumpPath = this.generateJumpPoint(
            beforePoint,
            afterPoint,
            intersection.point,
            size,
            style,
            intersection.angle
          );
          modifiedPath += jumpPath;

          lastPoint = afterPoint;
          segmentT = t;
        }

        // Add remaining segment
        if (segmentT < 1) {
          modifiedPath += `L ${segmentEnd.x} ${segmentEnd.y} `;
          lastPoint = segmentEnd;
        }
      }

      segmentStart = segmentEnd;
    }

    return {
      type: 'path',
      props: {
        d: modifiedPath.trim(),
        ...originalProps
      }
    };
  }

  /**
   * Generate jump point geometry based on style
   */
  private generateJumpPoint(
    start: Point,
    end: Point,
    center: Point,
    size: number,
    style: 'arc' | 'gap' | 'bridge',
    angle: number
  ): string {
    switch (style) {
      case 'arc':
        return this.generateArcPath(start, end, center, size, angle);
      case 'gap':
        return this.generateGapPath(start, end, center, size);
      case 'bridge':
        return this.generateBridgePath(start, end, center, size, angle);
      default:
        return `L ${end.x} ${end.y} `;
    }
  }

  /**
   * Generate arc path over intersection
   */
  private generateArcPath(
    start: Point,
    end: Point,
    center: Point,
    size: number,
    angle: number
  ): string {
    // Calculate perpendicular direction
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 1e-6) {
      return `L ${end.x} ${end.y} `;
    }

    // Normalize
    const nx = dx / length;
    const ny = dy / length;

    // Perpendicular vector (rotate 90 degrees)
    const px = -ny;
    const py = nx;

    // Arc control point (perpendicular offset)
    const arcHeight = size * 0.5;
    const controlX = center.x + px * arcHeight;
    const controlY = center.y + py * arcHeight;

    // Use arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
    // We'll use a circular arc with radius = size/2
    const radius = size / 2;

    // Determine sweep direction based on angle
    const sweep = angle >= 45 ? 1 : 0;

    return `A ${radius} ${radius} 0 0 ${sweep} ${end.x} ${end.y} `;
  }

  /**
   * Generate gap at intersection
   */
  private generateGapPath(
    start: Point,
    end: Point,
    center: Point,
    size: number
  ): string {
    // Gap means we stop drawing and move to after the gap
    return `M ${end.x} ${end.y} `;
  }

  /**
   * Generate bridge path over intersection
   */
  private generateBridgePath(
    start: Point,
    end: Point,
    center: Point,
    size: number,
    angle: number
  ): string {
    // Calculate perpendicular direction
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 1e-6) {
      return `L ${end.x} ${end.y} `;
    }

    // Normalize
    const nx = dx / length;
    const ny = dy / length;

    // Perpendicular vector
    const px = -ny;
    const py = nx;

    // Bridge shape: go up, across, down
    const bridgeHeight = size * 0.4;
    const bridgeWidth = size * 0.3;

    // Calculate bridge points
    const p1x = start.x + nx * bridgeWidth;
    const p1y = start.y + ny * bridgeWidth;
    const p2x = p1x + px * bridgeHeight;
    const p2y = p1y + py * bridgeHeight;

    const p3x = end.x - nx * bridgeWidth;
    const p3y = end.y - ny * bridgeWidth;
    const p4x = p3x + px * bridgeHeight;
    const p4y = p3y + py * bridgeHeight;

    return `L ${p1x} ${p1y} L ${p2x} ${p2y} L ${p4x} ${p4y} L ${p3x} ${p3y} L ${end.x} ${end.y} `;
  }

  /**
   * Parse SVG path data to extract points
   */
  private parsePathToPoints(pathData: string): Point[] {
    const points: Point[] = [];

    try {
      // Simple parser for M and L commands
      // Remove extra whitespace and commas
      const normalized = pathData
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Split by commands
      const commands = normalized.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi);

      if (!commands) {
        return points;
      }

      let currentX = 0;
      let currentY = 0;

      for (const cmd of commands) {
        const type = cmd[0]!.toUpperCase();
        const coords = cmd
          .slice(1)
          .trim()
          .split(/\s+/)
          .map(parseFloat)
          .filter(n => !isNaN(n));

        switch (type) {
          case 'M': // Move to
            if (coords.length >= 2) {
              currentX = coords[0]!;
              currentY = coords[1]!;
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'L': // Line to
            if (coords.length >= 2) {
              currentX = coords[0]!;
              currentY = coords[1]!;
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'H': // Horizontal line
            if (coords.length >= 1) {
              currentX = coords[0]!;
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'V': // Vertical line
            if (coords.length >= 1) {
              currentY = coords[0]!;
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'Q': // Quadratic curve (use endpoint)
            if (coords.length >= 4) {
              currentX = coords[2]!;
              currentY = coords[3]!;
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'C': // Cubic curve (use endpoint)
            if (coords.length >= 6) {
              currentX = coords[4]!;
              currentY = coords[5]!;
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'A': // Arc (use endpoint)
            if (coords.length >= 7) {
              currentX = coords[5]!;
              currentY = coords[6]!;
              points.push({ x: currentX, y: currentY });
            }
            break;
        }
      }
    } catch (error) {
      // Return empty on parse error
      console.warn('Failed to parse path:', error);
    }

    return points;
  }

  /**
   * Interpolate point between two points
   */
  private interpolatePoint(start: Point, end: Point, t: number): Point {
    t = Math.max(0, Math.min(1, t));
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    };
  }

  /**
   * Get segment length
   */
  private getSegmentLength(start: Point, end: Point): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
