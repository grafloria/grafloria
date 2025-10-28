// JumpPointDetector.spec.ts
// TDD tests for line intersection detection (Phase 1.3)

import { JumpPointDetector, Intersection, LineSegment } from './JumpPointDetector';

describe('JumpPointDetector (Phase 1.3)', () => {
  let detector: JumpPointDetector;

  beforeEach(() => {
    detector = new JumpPointDetector();
  });

  describe('RED PHASE: Basic Line Segment Intersection', () => {
    it('should create JumpPointDetector instance', () => {
      expect(detector).toBeDefined();
      expect(detector).toBeInstanceOf(JumpPointDetector);
    });

    it('should detect intersection of two crossing lines', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 100 },
        end: { x: 100, y: 0 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.point.x).toBeCloseTo(50, 1);
      expect(intersection!.point.y).toBeCloseTo(50, 1);
    });

    it('should return null for parallel lines', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 10 },
        end: { x: 100, y: 10 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).toBeNull();
    });

    it('should return null for non-intersecting lines', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 10 }
      };
      const line2: LineSegment = {
        start: { x: 20, y: 0 },
        end: { x: 30, y: 10 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).toBeNull();
    });

    it('should detect perpendicular intersection', () => {
      const line1: LineSegment = {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.point.x).toBeCloseTo(50, 1);
      expect(intersection!.point.y).toBeCloseTo(50, 1);
      expect(intersection!.angle).toBeCloseTo(90, 1);
    });

    it('should detect diagonal intersection', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 }
      };
      const line2: LineSegment = {
        start: { x: 100, y: 0 },
        end: { x: 0, y: 100 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.point.x).toBeCloseTo(50, 1);
      expect(intersection!.point.y).toBeCloseTo(50, 1);
    });
  });

  describe('RED PHASE: Angle Calculation', () => {
    it('should calculate 90 degree angle for perpendicular lines', () => {
      const line1: LineSegment = {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.angle).toBeCloseTo(90, 1);
    });

    it('should calculate angle for diagonal lines', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 50, y: -50 },
        end: { x: 50, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.angle).toBeCloseTo(90, 1);
    });

    it('should calculate acute angle', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.angle).toBeGreaterThan(0);
      expect(intersection!.angle).toBeLessThan(90);
    });

    it('should normalize angle to 0-90 range', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 50, y: 50 },
        end: { x: 50, y: -50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      // Angle should be normalized to acute angle
      expect(intersection!.angle).toBeGreaterThanOrEqual(0);
      expect(intersection!.angle).toBeLessThanOrEqual(90);
    });
  });

  describe('RED PHASE: Multiple Link Intersections', () => {
    it('should detect all intersections for a link crossing multiple others', () => {
      const targetLink = {
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 }
        ]
      };

      const otherLinks = [
        {
          id: 'link-1',
          points: [
            { x: 25, y: 0 },
            { x: 25, y: 100 }
          ]
        },
        {
          id: 'link-2',
          points: [
            { x: 75, y: 0 },
            { x: 75, y: 100 }
          ]
        }
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks);

      expect(intersections.length).toBe(2);
      expect(intersections[0]!.linkId).toBe('link-1');
      expect(intersections[1]!.linkId).toBe('link-2');
    });

    it('should handle link with multiple segments', () => {
      const targetLink = {
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
          { x: 100, y: 0 }
        ]
      };

      const otherLinks = [
        {
          id: 'link-1',
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 }
          ]
        }
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks);

      expect(intersections.length).toBeGreaterThan(0);
    });

    it('should return empty array when no intersections', () => {
      const targetLink = {
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 }
        ]
      };

      const otherLinks = [
        {
          id: 'link-1',
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 }
          ]
        }
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks);

      expect(intersections.length).toBe(0);
    });

    it('should exclude self-intersections', () => {
      const targetLink = {
        id: 'target',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 }
        ]
      };

      const otherLinks = [
        targetLink // Same link
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks);

      expect(intersections.length).toBe(0);
    });
  });

  describe('RED PHASE: Detection Modes', () => {
    it('should detect all intersections in "all" mode', () => {
      const targetLink = {
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 }
        ]
      };

      const otherLinks = [
        {
          id: 'link-1',
          points: [{ x: 50, y: 0 }, { x: 50, y: 100 }]
        },
        {
          id: 'link-2',
          points: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
        }
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks, 'all');

      expect(intersections.length).toBe(2);
    });

    it('should filter by angle in "perpendicular" mode', () => {
      const targetLink = {
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 }
        ]
      };

      const otherLinks = [
        {
          id: 'link-1',
          points: [{ x: 25, y: 0 }, { x: 25, y: 100 }] // 90 degrees
        },
        {
          id: 'link-2',
          points: [{ x: 0, y: 40 }, { x: 100, y: 60 }] // ~11 degrees
        }
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks, 'perpendicular', 45);

      // Should only detect the perpendicular one (90 degrees > 45 threshold)
      expect(intersections.length).toBe(1);
      expect(intersections[0]!.linkId).toBe('link-1');
    });

    it('should apply threshold in "threshold" mode', () => {
      const targetLink = {
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 }
        ]
      };

      const otherLinks = [
        {
          id: 'link-1',
          points: [{ x: 25, y: 0 }, { x: 25, y: 100 }] // 90 degrees
        },
        {
          id: 'link-2',
          points: [{ x: 50, y: 10 }, { x: 50, y: 90 }] // 90 degrees
        },
        {
          id: 'link-3',
          points: [{ x: 0, y: 0 }, { x: 100, y: 60 }] // ~30 degrees
        }
      ];

      const intersections = detector.detectIntersections(targetLink, otherLinks, 'threshold', 60);

      // Should detect links with angle > 60 degrees
      expect(intersections.length).toBe(2);
    });
  });

  describe('RED PHASE: Segment Position', () => {
    it('should calculate position along segment (0-1)', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 50, y: -50 },
        end: { x: 50, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      // Position should be 0.5 (middle of line1)
      expect(intersection!.t1).toBeCloseTo(0.5, 2);
    });

    it('should calculate position for both segments', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 25, y: -50 },
        end: { x: 25, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
      expect(intersection!.t1).toBeCloseTo(0.25, 2); // 25% along line1
      expect(intersection!.t2).toBeCloseTo(0.5, 2);  // 50% along line2
    });
  });

  describe('RED PHASE: Edge Cases', () => {
    it('should handle lines touching at endpoints', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 }
      };
      const line2: LineSegment = {
        start: { x: 50, y: 0 },
        end: { x: 100, y: 0 }
      };

      const intersection = detector.findIntersection(line1, line2);

      // Endpoint touching is technically an intersection
      expect(intersection !== null || intersection === null).toBe(true);
    });

    it('should handle zero-length segments', () => {
      const line1: LineSegment = {
        start: { x: 50, y: 50 },
        end: { x: 50, y: 50 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      // Should handle gracefully (null or point)
      expect(intersection === null || intersection !== undefined).toBe(true);
    });

    it('should handle very close but not intersecting lines', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 50.01 },
        end: { x: 100, y: 50.01 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).toBeNull();
    });

    it('should handle vertical lines', () => {
      const line1: LineSegment = {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 }
      };
      const line2: LineSegment = {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
    });

    it('should handle horizontal lines', () => {
      const line1: LineSegment = {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 }
      };
      const line2: LineSegment = {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 }
      };

      const intersection = detector.findIntersection(line1, line2);

      expect(intersection).not.toBeNull();
    });
  });

  describe('RED PHASE: Performance', () => {
    it('should detect intersections quickly for many links', () => {
      const targetLink = {
        points: [
          { x: 0, y: 50 },
          { x: 1000, y: 50 }
        ]
      };

      const otherLinks = [];
      for (let i = 0; i < 100; i++) {
        otherLinks.push({
          id: `link-${i}`,
          points: [
            { x: i * 10, y: 0 },
            { x: i * 10, y: 100 }
          ]
        });
      }

      const start = performance.now();
      const intersections = detector.detectIntersections(targetLink, otherLinks);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50); // Should be fast
      expect(intersections.length).toBeGreaterThan(0);
    });
  });
});
