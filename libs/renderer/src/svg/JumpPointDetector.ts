// JumpPointDetector.ts
// Detects line-line intersections for jump point rendering (Phase 1.3)

import type { Point } from '@grafloria/engine';

/**
 * Line segment defined by start and end points
 */
export interface LineSegment {
  start: Point;
  end: Point;
}

/**
 * Intersection information
 */
export interface Intersection {
  point: Point;          // Intersection point
  angle: number;         // Angle between lines (0-90 degrees)
  t1: number;           // Position along first segment (0-1)
  t2: number;           // Position along second segment (0-1)
  linkId?: string;      // ID of the intersecting link
  segmentIndex?: number; // Segment index on target link
}

/**
 * Link with points for intersection detection
 */
export interface LinkWithPoints {
  id?: string;
  points: Point[];
}

/**
 * Detection mode type
 */
export type DetectionMode = 'all' | 'perpendicular' | 'threshold';

/**
 * JumpPointDetector detects line-line intersections for jump point rendering.
 *
 * Features:
 * - Line segment intersection detection
 * - Angle calculation between intersecting lines
 * - Multiple detection modes (all, perpendicular, threshold)
 * - Performance optimized for many links
 *
 * Algorithm:
 * Uses parametric line intersection algorithm with bounds checking.
 */
export class JumpPointDetector {
  /**
   * Find intersection between two line segments
   *
   * @param line1 First line segment
   * @param line2 Second line segment
   * @returns Intersection info or null if no intersection
   */
  findIntersection(line1: LineSegment, line2: LineSegment): Intersection | null {
    const { start: p1, end: p2 } = line1;
    const { start: p3, end: p4 } = line2;

    // Line segment vectors
    const d1x = p2.x - p1.x;
    const d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x;
    const d2y = p4.y - p3.y;

    // Calculate denominator (cross product)
    const denominator = d1x * d2y - d1y * d2x;

    // Check if lines are parallel (denominator = 0)
    if (Math.abs(denominator) < 1e-10) {
      return null;
    }

    // Calculate parameters t and u
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denominator;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denominator;

    // Check if intersection is within both segments
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      // Calculate intersection point
      const point: Point = {
        x: p1.x + t * d1x,
        y: p1.y + t * d1y
      };

      // Calculate angle between lines
      const angle = this.calculateAngle(line1, line2);

      return {
        point,
        angle,
        t1: t,
        t2: u
      };
    }

    return null;
  }

  /**
   * Calculate angle between two line segments (0-90 degrees)
   *
   * @param line1 First line segment
   * @param line2 Second line segment
   * @returns Angle in degrees (0-90)
   */
  private calculateAngle(line1: LineSegment, line2: LineSegment): number {
    // Calculate direction vectors
    const dx1 = line1.end.x - line1.start.x;
    const dy1 = line1.end.y - line1.start.y;
    const dx2 = line2.end.x - line2.start.x;
    const dy2 = line2.end.y - line2.start.y;

    // Calculate angles
    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    // Calculate absolute difference
    let diff = Math.abs(angle1 - angle2);

    // Normalize to 0-180 range
    if (diff > Math.PI) {
      diff = 2 * Math.PI - diff;
    }

    // Convert to degrees
    let degrees = (diff * 180) / Math.PI;

    // Normalize to 0-90 range (acute angle)
    if (degrees > 90) {
      degrees = 180 - degrees;
    }

    return degrees;
  }

  /**
   * Detect all intersections for a link with other links
   *
   * @param targetLink Link to check for intersections
   * @param otherLinks Other links to check against
   * @param mode Detection mode (default: 'all')
   * @param threshold Angle threshold for filtering (default: 45)
   * @returns Array of intersections
   */
  detectIntersections(
    targetLink: LinkWithPoints,
    otherLinks: LinkWithPoints[],
    mode: DetectionMode = 'all',
    threshold: number = 45
  ): Intersection[] {
    const intersections: Intersection[] = [];

    // Skip if target has no points
    if (!targetLink.points || targetLink.points.length < 2) {
      return intersections;
    }

    // Iterate through each segment of target link
    for (let i = 0; i < targetLink.points.length - 1; i++) {
      const segment1: LineSegment = {
        start: targetLink.points[i]!,
        end: targetLink.points[i + 1]!
      };

      // Check against all other links
      for (const otherLink of otherLinks) {
        // Skip self-intersections
        if (otherLink.id && targetLink.id && otherLink.id === targetLink.id) {
          continue;
        }

        // Skip if other link has no points
        if (!otherLink.points || otherLink.points.length < 2) {
          continue;
        }

        // Check each segment of other link
        for (let j = 0; j < otherLink.points.length - 1; j++) {
          const segment2: LineSegment = {
            start: otherLink.points[j]!,
            end: otherLink.points[j + 1]!
          };

          const intersection = this.findIntersection(segment1, segment2);

          if (intersection) {
            // Links that merely touch at a path endpoint (e.g. two links
            // meeting at the same port) are not crossings — don't draw a jump
            // at a connection point.
            const EPS = 1e-6;
            const touchesOwnEndpoint =
              (i === 0 && intersection.t1 < EPS) ||
              (i === targetLink.points.length - 2 && intersection.t1 > 1 - EPS);
            const touchesOtherEndpoint =
              (j === 0 && intersection.t2 < EPS) ||
              (j === otherLink.points.length - 2 && intersection.t2 > 1 - EPS);
            if (touchesOwnEndpoint || touchesOtherEndpoint) {
              continue;
            }

            // Apply filtering based on detection mode
            if (this.shouldIncludeIntersection(intersection, mode, threshold)) {
              intersections.push({
                ...intersection,
                linkId: otherLink.id,
                segmentIndex: i
              });
            }
          }
        }
      }
    }

    return intersections;
  }

  /**
   * Check if intersection should be included based on detection mode
   *
   * @param intersection Intersection to check
   * @param mode Detection mode
   * @param threshold Angle threshold
   * @returns True if intersection should be included
   */
  private shouldIncludeIntersection(
    intersection: Intersection,
    mode: DetectionMode,
    threshold: number
  ): boolean {
    switch (mode) {
      case 'all':
        return true;

      case 'perpendicular':
        // Only near-perpendicular crossings (fixed 75° cutoff); the threshold
        // parameter belongs to 'threshold' mode.
        return intersection.angle >= 75;

      case 'threshold':
        // Include if angle is greater than or equal to threshold
        return intersection.angle >= threshold;

      default:
        return true;
    }
  }
}
