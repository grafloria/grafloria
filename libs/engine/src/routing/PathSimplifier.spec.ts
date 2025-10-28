// PathSimplifier.spec.ts - TDD tests for path simplification
// Phase 2.2: Smart routing optimization - path simplification

import { PathSimplifier } from './PathSimplifier';
import type { Point } from '@grafloria/engine';

describe('PathSimplifier', () => {
  let simplifier: PathSimplifier;

  beforeEach(() => {
    simplifier = new PathSimplifier();
  });

  describe('Collinear Point Detection', () => {
    it('should detect three collinear points on horizontal line', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 5, y: 0 };
      const p3 = { x: 10, y: 0 };

      const isCollinear = simplifier.arePointsCollinear(p1, p2, p3);

      expect(isCollinear).toBe(true);
    });

    it('should detect three collinear points on vertical line', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 0, y: 5 };
      const p3 = { x: 0, y: 10 };

      const isCollinear = simplifier.arePointsCollinear(p1, p2, p3);

      expect(isCollinear).toBe(true);
    });

    it('should detect three collinear points on diagonal line', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 5, y: 5 };
      const p3 = { x: 10, y: 10 };

      const isCollinear = simplifier.arePointsCollinear(p1, p2, p3);

      expect(isCollinear).toBe(true);
    });

    it('should detect non-collinear points', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 5, y: 5 };
      const p3 = { x: 10, y: 0 };

      const isCollinear = simplifier.arePointsCollinear(p1, p2, p3);

      expect(isCollinear).toBe(false);
    });

    it('should handle points with small deviation within tolerance', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 5, y: 0.5 };  // Small deviation
      const p3 = { x: 10, y: 0 };

      const isCollinear = simplifier.arePointsCollinear(p1, p2, p3, 1.0);

      expect(isCollinear).toBe(true);
    });

    it('should reject points with deviation beyond tolerance', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 5, y: 2 };  // Large deviation
      const p3 = { x: 10, y: 0 };

      const isCollinear = simplifier.arePointsCollinear(p1, p2, p3, 1.0);

      expect(isCollinear).toBe(false);
    });
  });

  describe('Remove Collinear Points', () => {
    it('should remove intermediate collinear points from straight path', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ];

      const simplified = simplifier.removeCollinearPoints(points);

      expect(simplified).toHaveLength(2);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[1]).toEqual({ x: 30, y: 0 });
    });

    it('should preserve corner points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },   // Collinear
        { x: 30, y: 0 },   // Corner (direction changes)
        { x: 30, y: 10 },
        { x: 30, y: 20 },  // Collinear
      ];

      const simplified = simplifier.removeCollinearPoints(points);

      expect(simplified).toHaveLength(3);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[1]).toEqual({ x: 30, y: 0 });
      expect(simplified[2]).toEqual({ x: 30, y: 20 });
    });

    it('should handle path with no collinear points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
        { x: 30, y: 5 },
      ];

      const simplified = simplifier.removeCollinearPoints(points);

      expect(simplified).toEqual(points);
    });

    it('should handle two-point path', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ];

      const simplified = simplifier.removeCollinearPoints(points);

      expect(simplified).toEqual(points);
    });

    it('should handle single-point path', () => {
      const points: Point[] = [{ x: 0, y: 0 }];

      const simplified = simplifier.removeCollinearPoints(points);

      expect(simplified).toEqual(points);
    });

    it('should handle empty path', () => {
      const points: Point[] = [];

      const simplified = simplifier.removeCollinearPoints(points);

      expect(simplified).toEqual([]);
    });
  });

  describe('Douglas-Peucker Simplification', () => {
    it('should simplify straight line to two endpoints', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified).toHaveLength(2);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[1]).toEqual({ x: 30, y: 0 });
    });

    it('should preserve significant corners', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 10 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified).toHaveLength(3);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[1]).toEqual({ x: 10, y: 10 });
      expect(simplified[2]).toEqual({ x: 20, y: 10 });
    });

    it('should respect epsilon tolerance', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 5, y: 1 },    // Small deviation (distance ~1)
        { x: 10, y: 0 },
      ];

      // With epsilon=2, should simplify to 2 points
      const simplified1 = simplifier.simplify(points, 2.0);
      expect(simplified1).toHaveLength(2);

      // With epsilon=0.5, should keep all 3 points
      const simplified2 = simplifier.simplify(points, 0.5);
      expect(simplified2).toHaveLength(3);
    });

    it('should handle complex zigzag path', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
        { x: 30, y: 5 },
        { x: 40, y: 0 },
        { x: 50, y: 5 },
        { x: 60, y: 0 },
      ];

      const simplified = simplifier.simplify(points, 2.0);

      // Should reduce points while preserving shape
      expect(simplified.length).toBeLessThan(points.length);
      expect(simplified.length).toBeGreaterThanOrEqual(2);
      // First and last points always preserved
      expect(simplified[0]).toEqual(points[0]);
      expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
    });

    it('should handle two-point path', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified).toEqual(points);
    });

    it('should handle single-point path', () => {
      const points: Point[] = [{ x: 0, y: 0 }];

      const simplified = simplifier.simplify(points);

      expect(simplified).toEqual(points);
    });

    it('should handle empty path', () => {
      const points: Point[] = [];

      const simplified = simplifier.simplify(points);

      expect(simplified).toEqual([]);
    });

    it('should preserve orthogonal path corners', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified).toHaveLength(4);
      expect(simplified).toEqual(points);
    });

    it('should use default epsilon when not provided', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0.5 },
        { x: 20, y: 0 },
      ];

      const simplified = simplifier.simplify(points);

      // Default epsilon should be 1.0, which should simplify this
      expect(simplified).toHaveLength(2);
    });
  });

  describe('Perpendicular Distance', () => {
    it('should calculate perpendicular distance from point to horizontal line', () => {
      const point = { x: 5, y: 5 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 0 };

      const distance = simplifier.perpendicularDistance(point, lineStart, lineEnd);

      expect(distance).toBe(5);
    });

    it('should calculate perpendicular distance from point to vertical line', () => {
      const point = { x: 5, y: 5 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 0, y: 10 };

      const distance = simplifier.perpendicularDistance(point, lineStart, lineEnd);

      expect(distance).toBe(5);
    });

    it('should calculate perpendicular distance from point to diagonal line', () => {
      const point = { x: 5, y: 0 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 10 };

      const distance = simplifier.perpendicularDistance(point, lineStart, lineEnd);

      // Distance from (5,0) to line y=x should be 5/sqrt(2) ≈ 3.536
      expect(distance).toBeCloseTo(3.536, 2);
    });

    it('should return zero for point on line', () => {
      const point = { x: 5, y: 5 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 10 };

      const distance = simplifier.perpendicularDistance(point, lineStart, lineEnd);

      expect(distance).toBeCloseTo(0, 5);
    });

    it('should handle zero-length line segment', () => {
      const point = { x: 5, y: 5 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 0, y: 0 };

      const distance = simplifier.perpendicularDistance(point, lineStart, lineEnd);

      // Should return distance from point to lineStart
      expect(distance).toBeCloseTo(Math.sqrt(50), 5);
    });
  });

  describe('Performance', () => {
    it('should handle large paths efficiently', () => {
      // Generate a path with 1000 points
      const points: Point[] = [];
      for (let i = 0; i < 1000; i++) {
        points.push({ x: i, y: Math.sin(i / 10) * 10 });
      }

      const startTime = performance.now();
      const simplified = simplifier.simplify(points, 1.0);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
      expect(simplified.length).toBeLessThan(points.length);
      expect(simplified.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate consecutive points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },  // Duplicate
        { x: 10, y: 0 },
        { x: 10, y: 0 }, // Duplicate
        { x: 20, y: 0 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified).toHaveLength(2);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[1]).toEqual({ x: 20, y: 0 });
    });

    it('should handle very small coordinates', () => {
      const points: Point[] = [
        { x: 0.001, y: 0.001 },
        { x: 0.002, y: 0.001 },
        { x: 0.003, y: 0.001 },
      ];

      const simplified = simplifier.simplify(points, 0.0001);

      expect(simplified).toHaveLength(2);
    });

    it('should handle very large coordinates', () => {
      const points: Point[] = [
        { x: 1000000, y: 1000000 },
        { x: 1000010, y: 1000000 },
        { x: 1000020, y: 1000000 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified).toHaveLength(2);
    });

    it('should handle negative coordinates', () => {
      const points: Point[] = [
        { x: -10, y: -10 },
        { x: -5, y: -10 },
        { x: 0, y: -10 },
        { x: 0, y: -5 },
        { x: 0, y: 0 },
      ];

      const simplified = simplifier.simplify(points, 1.0);

      expect(simplified.length).toBeLessThanOrEqual(points.length);
      expect(simplified[0]).toEqual({ x: -10, y: -10 });
      expect(simplified[simplified.length - 1]).toEqual({ x: 0, y: 0 });
    });
  });
});
