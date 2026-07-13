// Shape-Aware Hit Detection Tests (Phase 3.3)

import { isPointInShape } from './geometry';
import type { ShapeConfig } from '../templates/NodeTemplate';
import type { BoundingBox } from '../types';

describe('Geometry - Shape-Aware Hit Detection (Phase 3.3)', () => {
  describe('Rectangle Hit Detection', () => {
    it('should detect point inside rectangle', () => {
      const shape: ShapeConfig = { type: 'rect' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Center point
      expect(isPointInShape(50, 30, bounds, shape)).toBe(true);

      // Edge points
      expect(isPointInShape(0, 0, bounds, shape)).toBe(true);
      expect(isPointInShape(100, 60, bounds, shape)).toBe(true);
    });

    it('should detect point outside rectangle', () => {
      const shape: ShapeConfig = { type: 'rect' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      expect(isPointInShape(-1, 30, bounds, shape)).toBe(false);
      expect(isPointInShape(101, 30, bounds, shape)).toBe(false);
      expect(isPointInShape(50, -1, bounds, shape)).toBe(false);
      expect(isPointInShape(50, 61, bounds, shape)).toBe(false);
    });
  });

  describe('Circle Hit Detection', () => {
    it('should detect point inside circle', () => {
      const shape: ShapeConfig = { type: 'circle' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
      };

      // Center point
      expect(isPointInShape(50, 50, bounds, shape)).toBe(true);

      // Points near edge but inside
      expect(isPointInShape(50, 10, bounds, shape)).toBe(true); // Top
      expect(isPointInShape(90, 50, bounds, shape)).toBe(true); // Right
      expect(isPointInShape(50, 90, bounds, shape)).toBe(true); // Bottom
      expect(isPointInShape(10, 50, bounds, shape)).toBe(true); // Left
    });

    it('should detect point outside circle (in bounding box corners)', () => {
      const shape: ShapeConfig = { type: 'circle' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
      };

      // Corners of bounding box should be outside circle
      expect(isPointInShape(5, 5, bounds, shape)).toBe(false);
      expect(isPointInShape(95, 5, bounds, shape)).toBe(false);
      expect(isPointInShape(5, 95, bounds, shape)).toBe(false);
      expect(isPointInShape(95, 95, bounds, shape)).toBe(false);
    });

    it('should handle ellipse-shaped circles (non-square bounds)', () => {
      const shape: ShapeConfig = { type: 'circle' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Circle uses min(width, height) as diameter = 60
      // Center at (50, 30), radius = 30
      const cx = 50;
      const cy = 30;
      const radius = 30;

      // Point on circle edge
      expect(isPointInShape(cx + radius, cy, bounds, shape)).toBe(true);
      expect(isPointInShape(cx, cy + radius, bounds, shape)).toBe(true);

      // Point outside circle but inside bounding box
      expect(isPointInShape(5, 30, bounds, shape)).toBe(false);
      expect(isPointInShape(95, 30, bounds, shape)).toBe(false);
    });
  });

  describe('Ellipse Hit Detection', () => {
    it('should detect point inside ellipse', () => {
      const shape: ShapeConfig = { type: 'ellipse' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Center point
      expect(isPointInShape(50, 30, bounds, shape)).toBe(true);

      // Points on semi-major and semi-minor axes
      expect(isPointInShape(50, 0, bounds, shape)).toBe(true); // Top
      expect(isPointInShape(100, 30, bounds, shape)).toBe(true); // Right
      expect(isPointInShape(50, 60, bounds, shape)).toBe(true); // Bottom
      expect(isPointInShape(0, 30, bounds, shape)).toBe(true); // Left
    });

    it('should detect point outside ellipse', () => {
      const shape: ShapeConfig = { type: 'ellipse' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Corners of bounding box
      expect(isPointInShape(0, 0, bounds, shape)).toBe(false);
      expect(isPointInShape(100, 0, bounds, shape)).toBe(false);
      expect(isPointInShape(0, 60, bounds, shape)).toBe(false);
      expect(isPointInShape(100, 60, bounds, shape)).toBe(false);
    });
  });

  describe('Diamond Hit Detection', () => {
    it('should detect point inside diamond', () => {
      const shape: ShapeConfig = { type: 'diamond' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Center point
      expect(isPointInShape(50, 30, bounds, shape)).toBe(true);

      // Vertices (on diamond boundary)
      expect(isPointInShape(50, 0, bounds, shape)).toBe(true); // Top
      expect(isPointInShape(100, 30, bounds, shape)).toBe(true); // Right
      expect(isPointInShape(50, 60, bounds, shape)).toBe(true); // Bottom
      expect(isPointInShape(0, 30, bounds, shape)).toBe(true); // Left

      // Points on edges
      expect(isPointInShape(75, 15, bounds, shape)).toBe(true); // Top-right edge
      expect(isPointInShape(25, 15, bounds, shape)).toBe(true); // Top-left edge
    });

    it('should detect point outside diamond', () => {
      const shape: ShapeConfig = { type: 'diamond' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Corners of bounding box
      expect(isPointInShape(0, 0, bounds, shape)).toBe(false);
      expect(isPointInShape(100, 0, bounds, shape)).toBe(false);
      expect(isPointInShape(0, 60, bounds, shape)).toBe(false);
      expect(isPointInShape(100, 60, bounds, shape)).toBe(false);

      // Points just outside edges
      expect(isPointInShape(10, 10, bounds, shape)).toBe(false);
      expect(isPointInShape(90, 10, bounds, shape)).toBe(false);
    });
  });

  describe('Hexagon Hit Detection', () => {
    it('should detect point inside hexagon', () => {
      const shape: ShapeConfig = { type: 'hexagon' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Center point
      expect(isPointInShape(50, 30, bounds, shape)).toBe(true);

      // Points clearly inside
      expect(isPointInShape(50, 20, bounds, shape)).toBe(true);
      expect(isPointInShape(50, 40, bounds, shape)).toBe(true);
      expect(isPointInShape(30, 30, bounds, shape)).toBe(true);
      expect(isPointInShape(70, 30, bounds, shape)).toBe(true);
    });

    it('should detect point outside hexagon', () => {
      const shape: ShapeConfig = { type: 'hexagon' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Corners of bounding box (outside hexagon)
      expect(isPointInShape(0, 0, bounds, shape)).toBe(false);
      expect(isPointInShape(100, 0, bounds, shape)).toBe(false);
      expect(isPointInShape(0, 60, bounds, shape)).toBe(false);
      expect(isPointInShape(100, 60, bounds, shape)).toBe(false);
    });

    /**
     * REGRESSION (Wave 4, found by the canvas hit-parity sweep).
     *
     * The hit region used to be a hexagon rotated 90 degrees from the one the
     * renderer draws (points at top/bottom instead of left/right). The tests
     * above could not see it: the centre is inside BOTH hexagons and the bbox
     * corners are outside both. These points are inside exactly ONE of them, so
     * they pin the hit region to the SHAPE ON SCREEN.
     *
     * The rendered hexagon (`hexagonVerts`, renderer/src/svg/shape-registry.ts)
     * for a 100x60 box has vertices:
     *   (25,0) (75,0) (100,30) (75,60) (25,60) (0,30)
     */
    it('hit-tests the hexagon the renderer actually draws (flat top, points L/R)', () => {
      const shape: ShapeConfig = { type: 'hexagon' };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // ON the drawn top edge (y=0 spans x 25..75). The old pointy-top hexagon
      // said "outside" here — you could click the shape and miss it.
      expect(isPointInShape(30, 2, bounds, shape)).toBe(true);
      expect(isPointInShape(70, 2, bounds, shape)).toBe(true);

      // OUTSIDE the drawn shape, near the left point's upper slope. The old
      // hexagon said "inside" — you could click ~16px off the shape and select it.
      expect(isPointInShape(5, 18, bounds, shape)).toBe(false);
      expect(isPointInShape(5, 42, bounds, shape)).toBe(false);

      // The left/right points sit on the outline at mid-height.
      expect(isPointInShape(1, 30, bounds, shape)).toBe(true);
      expect(isPointInShape(99, 30, bounds, shape)).toBe(true);

      // ...and just above/below them is off the shape.
      expect(isPointInShape(1, 5, bounds, shape)).toBe(false);
      expect(isPointInShape(99, 55, bounds, shape)).toBe(false);
    });
  });

  describe('Offset Bounds', () => {
    it('should handle non-zero left,top offset in bounds', () => {
      const shape: ShapeConfig = { type: 'rect' };
      const bounds: BoundingBox = {
        left: 100,
        top: 50,
        right: 200,
        bottom: 110,
        width: 100,
        height: 60,
      };

      // Point inside (using offset coordinates)
      expect(isPointInShape(150, 80, bounds, shape)).toBe(true);

      // Point outside
      expect(isPointInShape(50, 80, bounds, shape)).toBe(false);
      expect(isPointInShape(250, 80, bounds, shape)).toBe(false);
    });

    it('should handle circle with offset bounds', () => {
      const shape: ShapeConfig = { type: 'circle' };
      const bounds: BoundingBox = {
        left: 100,
        top: 50,
        right: 200,
        bottom: 150,
        width: 100,
        height: 100,
      };

      // Center point (150, 100)
      expect(isPointInShape(150, 100, bounds, shape)).toBe(true);

      // Corner of bounding box (outside circle)
      expect(isPointInShape(105, 55, bounds, shape)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should default to rectangle for unknown shape type', () => {
      const shape: ShapeConfig = { type: 'unknown' as any };
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      // Use rectangular detection as fallback
      expect(isPointInShape(50, 30, bounds, shape)).toBe(true);
      expect(isPointInShape(-1, 30, bounds, shape)).toBe(false);
    });

    it('should handle zero-size bounds', () => {
      const shape: ShapeConfig = { type: 'rect' };
      const bounds: BoundingBox = {
        left: 50,
        top: 50,
        right: 50,
        bottom: 50,
        width: 0,
        height: 0,
      };

      expect(isPointInShape(50, 50, bounds, shape)).toBe(true);
      expect(isPointInShape(51, 51, bounds, shape)).toBe(false);
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without shape config (default to rectangle)', () => {
      const bounds: BoundingBox = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 60,
        width: 100,
        height: 60,
      };

      expect(isPointInShape(50, 30, bounds)).toBe(true);
      expect(isPointInShape(-1, 30, bounds)).toBe(false);
    });
  });
});
