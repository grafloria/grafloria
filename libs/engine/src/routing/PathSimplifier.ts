// PathSimplifier.ts - Path simplification utilities
// Phase 2.2: Smart routing optimization - reduce waypoint count

import type { Point } from '../types';

/**
 * PathSimplifier provides algorithms for simplifying paths
 *
 * Features:
 * - Douglas-Peucker algorithm for optimal simplification
 * - Collinear point removal for straight paths
 * - Perpendicular distance calculations
 * - Configurable tolerance (epsilon)
 *
 * Use cases:
 * - Reduce waypoint count in routed paths
 * - Clean up paths with unnecessary intermediate points
 * - Optimize path storage and rendering performance
 * - Maintain path shape while reducing complexity
 *
 * @example
 * ```typescript
 * const simplifier = new PathSimplifier();
 *
 * // Remove collinear points (fastest)
 * const cleaned = simplifier.removeCollinearPoints(points);
 *
 * // Douglas-Peucker simplification (optimal)
 * const simplified = simplifier.simplify(points, epsilon);
 * ```
 */
export class PathSimplifier {
  /**
   * Default epsilon (tolerance) for simplification
   * Points within this distance from the line are considered negligible
   */
  private readonly DEFAULT_EPSILON = 1.0;

  /**
   * Simplify a path using the Douglas-Peucker algorithm
   *
   * This algorithm recursively divides the path and removes points
   * that are within epsilon distance from the line between endpoints.
   *
   * Time complexity: O(n log n) average, O(n²) worst case
   *
   * @param points - Array of points to simplify
   * @param epsilon - Maximum allowed distance from simplified path (default: 1.0)
   * @returns Simplified array of points
   * @throws Error if epsilon is invalid or points contain invalid coordinates
   */
  simplify(points: Point[], epsilon: number = this.DEFAULT_EPSILON): Point[] {
    // Validate epsilon
    if (!isFinite(epsilon) || epsilon <= 0) {
      throw new Error(`Invalid epsilon: ${epsilon}. Must be a positive number.`);
    }

    // Fast path for empty or small paths
    if (points.length <= 2) {
      return [...points];
    }

    // Validate all points have valid coordinates
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !isFinite(p.x) || !isFinite(p.y)) {
        throw new Error(
          `Invalid point at index ${i}: ${JSON.stringify(p)}. All points must have finite x and y coordinates.`
        );
      }
    }

    return this.douglasPeucker(points, epsilon);
  }

  /**
   * Douglas-Peucker recursive implementation
   *
   * @param points - Points to simplify
   * @param epsilon - Tolerance
   * @returns Simplified points
   */
  private douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) {
      return [...points];
    }

    // Find the point with maximum distance from line segment
    let maxDistance = 0;
    let maxIndex = 0;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(
        points[i],
        firstPoint,
        lastPoint
      );

      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDistance > epsilon) {
      // Recursively simplify both segments
      const leftSegment = this.douglasPeucker(
        points.slice(0, maxIndex + 1),
        epsilon
      );
      const rightSegment = this.douglasPeucker(
        points.slice(maxIndex),
        epsilon
      );

      // Combine results (removing duplicate middle point)
      return [...leftSegment.slice(0, -1), ...rightSegment];
    } else {
      // All points are within epsilon, return just endpoints
      return [firstPoint, lastPoint];
    }
  }

  /**
   * Remove collinear points from path
   *
   * This is faster than Douglas-Peucker but less sophisticated.
   * Only removes points that lie exactly (within tolerance) on the line
   * between their neighbors.
   *
   * Time complexity: O(n)
   *
   * @param points - Array of points
   * @param tolerance - Distance tolerance for collinearity (default: 0.01)
   * @returns Path with collinear points removed
   */
  removeCollinearPoints(points: Point[], tolerance: number = 0.01): Point[] {
    if (points.length <= 2) {
      return [...points];
    }

    const result: Point[] = [points[0]]; // Always keep first point

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const next = points[i + 1];

      // If current point is NOT collinear with prev and next, keep it
      if (!this.arePointsCollinear(prev, current, next, tolerance)) {
        result.push(current);
      }
    }

    // Always keep last point
    result.push(points[points.length - 1]);

    return result;
  }

  /**
   * Check if three points are collinear (lie on the same line)
   *
   * Uses cross product to determine collinearity.
   * If cross product is close to zero, points are collinear.
   *
   * @param p1 - First point
   * @param p2 - Second point (middle)
   * @param p3 - Third point
   * @param tolerance - Distance tolerance (default: 0.01)
   * @returns True if points are collinear within tolerance
   */
  arePointsCollinear(
    p1: Point,
    p2: Point,
    p3: Point,
    tolerance: number = 0.01
  ): boolean {
    // Calculate perpendicular distance from p2 to line p1-p3
    const distance = this.perpendicularDistance(p2, p1, p3);
    return distance <= tolerance;
  }

  /**
   * Calculate perpendicular distance from point to line segment
   *
   * Uses the formula:
   * distance = |((y2-y1)x0 - (x2-x1)y0 + x2*y1 - y2*x1)| / sqrt((y2-y1)² + (x2-x1)²)
   *
   * @param point - Point to measure distance from
   * @param lineStart - Start of line segment
   * @param lineEnd - End of line segment
   * @returns Perpendicular distance in pixels
   */
  perpendicularDistance(
    point: Point,
    lineStart: Point,
    lineEnd: Point
  ): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    // Handle zero-length line segment (lineStart == lineEnd)
    if (dx === 0 && dy === 0) {
      // Return distance from point to lineStart
      const pdx = point.x - lineStart.x;
      const pdy = point.y - lineStart.y;
      return Math.sqrt(pdx * pdx + pdy * pdy);
    }

    // Calculate perpendicular distance using cross product formula
    // Area of parallelogram = |cross product|
    // Height (perpendicular distance) = Area / base
    const numerator = Math.abs(
      dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
    );
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
  }

  /**
   * Calculate total path length
   *
   * Useful for comparing simplified vs original paths
   *
   * @param points - Array of points
   * @returns Total length in pixels
   */
  calculatePathLength(points: Point[]): number {
    if (points.length < 2) {
      return 0;
    }

    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    return length;
  }

  /**
   * Get simplification statistics
   *
   * @param original - Original points
   * @param simplified - Simplified points
   * @returns Statistics object
   */
  getSimplificationStats(original: Point[], simplified: Point[]) {
    const reduction = original.length - simplified.length;
    const reductionPercent = (reduction / original.length) * 100;

    return {
      originalCount: original.length,
      simplifiedCount: simplified.length,
      pointsRemoved: reduction,
      reductionPercent: Math.round(reductionPercent * 10) / 10,
      originalLength: this.calculatePathLength(original),
      simplifiedLength: this.calculatePathLength(simplified),
    };
  }
}
