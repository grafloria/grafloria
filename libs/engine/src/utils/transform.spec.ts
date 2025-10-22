// transform.spec.ts - Transform Matrix System Tests (Phase 1.6a)

import {
  TransformMatrix,
  IDENTITY_MATRIX,
  composeMatrices,
  multiplyMatrices,
  createTranslateMatrix,
  createRotateMatrix,
  createScaleMatrix,
  createSkewMatrix,
  transformPoint,
  invertMatrix,
  matrixToCSS,
} from './transform';
import type { Point } from '../types';

describe('Transform Matrix System (Phase 1.6a)', () => {
  describe('Identity Matrix', () => {
    it('should have identity values', () => {
      expect(IDENTITY_MATRIX).toEqual({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
      });
    });

    it('should not modify point when applied', () => {
      const point: Point = { x: 10, y: 20 };
      const result = transformPoint(point, IDENTITY_MATRIX);

      expect(result).toEqual({ x: 10, y: 20, z: undefined });
    });
  });

  describe('createTranslateMatrix', () => {
    it('should create translation matrix', () => {
      const matrix = createTranslateMatrix(10, 20);

      expect(matrix).toEqual({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 10,
        f: 20,
      });
    });

    it('should translate point correctly', () => {
      const matrix = createTranslateMatrix(10, 20);
      const point: Point = { x: 5, y: 5 };
      const result = transformPoint(point, matrix);

      expect(result).toEqual({ x: 15, y: 25, z: undefined });
    });

    it('should handle negative translation', () => {
      const matrix = createTranslateMatrix(-10, -20);
      const point: Point = { x: 5, y: 5 };
      const result = transformPoint(point, matrix);

      expect(result).toEqual({ x: -5, y: -15, z: undefined });
    });
  });

  describe('createRotateMatrix', () => {
    it('should create rotation matrix for 90 degrees', () => {
      const matrix = createRotateMatrix(90);

      // cos(90°) = 0, sin(90°) = 1
      expect(matrix.a).toBeCloseTo(0, 5);
      expect(matrix.b).toBeCloseTo(1, 5);
      expect(matrix.c).toBeCloseTo(-1, 5);
      expect(matrix.d).toBeCloseTo(0, 5);
      expect(matrix.e).toBe(0);
      expect(matrix.f).toBe(0);
    });

    it('should rotate point 90 degrees around origin', () => {
      const matrix = createRotateMatrix(90);
      const point: Point = { x: 10, y: 0 };
      const result = transformPoint(point, matrix);

      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(10, 5);
    });

    it('should rotate point 180 degrees', () => {
      const matrix = createRotateMatrix(180);
      const point: Point = { x: 10, y: 5 };
      const result = transformPoint(point, matrix);

      expect(result.x).toBeCloseTo(-10, 5);
      expect(result.y).toBeCloseTo(-5, 5);
    });

    it('should rotate around custom origin', () => {
      const origin: Point = { x: 10, y: 10 };
      const matrix = createRotateMatrix(90, origin);
      const point: Point = { x: 20, y: 10 };
      const result = transformPoint(point, matrix);

      // Rotating (20, 10) by 90° around (10, 10) should give (10, 20)
      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(20, 5);
    });
  });

  describe('createScaleMatrix', () => {
    it('should create scale matrix', () => {
      const matrix = createScaleMatrix(2, 3);

      expect(matrix).toEqual({
        a: 2,
        b: 0,
        c: 0,
        d: 3,
        e: 0,
        f: 0,
      });
    });

    it('should scale point correctly', () => {
      const matrix = createScaleMatrix(2, 3);
      const point: Point = { x: 10, y: 10 };
      const result = transformPoint(point, matrix);

      expect(result).toEqual({ x: 20, y: 30, z: undefined });
    });

    it('should handle negative scale (flip)', () => {
      const matrix = createScaleMatrix(-1, 1);
      const point: Point = { x: 10, y: 5 };
      const result = transformPoint(point, matrix);

      expect(result).toEqual({ x: -10, y: 5, z: undefined });
    });

    it('should scale around custom origin', () => {
      const origin: Point = { x: 10, y: 10 };
      const matrix = createScaleMatrix(2, 2, origin);
      const point: Point = { x: 20, y: 10 };
      const result = transformPoint(point, matrix);

      // Scaling (20, 10) by 2x around (10, 10)
      // Distance from origin: (10, 0)
      // Scaled distance: (20, 0)
      // Final: (10 + 20, 10 + 0) = (30, 10)
      expect(result.x).toBeCloseTo(30, 5);
      expect(result.y).toBeCloseTo(10, 5);
    });
  });

  describe('createSkewMatrix', () => {
    it('should create skew matrix', () => {
      const matrix = createSkewMatrix(45, 0);

      expect(matrix.a).toBe(1);
      expect(matrix.b).toBeCloseTo(0, 5);
      expect(matrix.c).toBeCloseTo(1, 5); // tan(45°) ≈ 1
      expect(matrix.d).toBe(1);
      expect(matrix.e).toBe(0);
      expect(matrix.f).toBe(0);
    });

    it('should skew point on X axis', () => {
      const matrix = createSkewMatrix(45, 0);
      const point: Point = { x: 0, y: 10 };
      const result = transformPoint(point, matrix);

      // Skewed X = original X + tan(45°) * Y ≈ 0 + 1 * 10 = 10
      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(10, 5);
    });

    it('should skew point on Y axis', () => {
      const matrix = createSkewMatrix(0, 45);
      const point: Point = { x: 10, y: 0 };
      const result = transformPoint(point, matrix);

      // Skewed Y = original Y + tan(45°) * X ≈ 0 + 1 * 10 = 10
      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(10, 5);
    });
  });

  describe('multiplyMatrices', () => {
    it('should multiply identity matrices', () => {
      const result = multiplyMatrices(IDENTITY_MATRIX, IDENTITY_MATRIX);
      expect(result).toEqual(IDENTITY_MATRIX);
    });

    it('should multiply translation matrices', () => {
      const m1 = createTranslateMatrix(10, 20);
      const m2 = createTranslateMatrix(5, 10);
      const result = multiplyMatrices(m1, m2);

      // Should combine translations: (10, 20) + (5, 10) = (15, 30)
      expect(result.e).toBeCloseTo(15, 5);
      expect(result.f).toBeCloseTo(30, 5);
    });

    it('should multiply scale matrices', () => {
      const m1 = createScaleMatrix(2, 3);
      const m2 = createScaleMatrix(4, 5);
      const result = multiplyMatrices(m1, m2);

      // Should multiply scales: 2*4=8, 3*5=15
      expect(result.a).toBeCloseTo(8, 5);
      expect(result.d).toBeCloseTo(15, 5);
    });
  });

  describe('composeMatrices', () => {
    it('should return identity for empty array', () => {
      const result = composeMatrices();
      expect(result).toEqual(IDENTITY_MATRIX);
    });

    it('should return single matrix unchanged', () => {
      const matrix = createTranslateMatrix(10, 20);
      const result = composeMatrices(matrix);
      expect(result).toEqual(matrix);
    });

    it('should compose multiple matrices', () => {
      const translate = createTranslateMatrix(10, 20);
      const scale = createScaleMatrix(2, 2);
      const result = composeMatrices(translate, scale);

      const point: Point = { x: 5, y: 5 };
      const transformed = transformPoint(point, result);

      // First scale: (5, 5) -> (10, 10)
      // Then translate: (10, 10) -> (20, 30)
      expect(transformed.x).toBeCloseTo(20, 5);
      expect(transformed.y).toBeCloseTo(30, 5);
    });

    it('should compose translate-rotate-scale in correct order', () => {
      // Standard composition order: translate -> rotate -> scale
      const translate = createTranslateMatrix(100, 100);
      const rotate = createRotateMatrix(90);
      const scale = createScaleMatrix(2, 2);

      const result = composeMatrices(translate, rotate, scale);

      const point: Point = { x: 10, y: 0 };
      const transformed = transformPoint(point, result);

      // Scale: (10, 0) -> (20, 0)
      // Rotate 90°: (20, 0) -> (0, 20)
      // Translate: (0, 20) -> (100, 120)
      expect(transformed.x).toBeCloseTo(100, 5);
      expect(transformed.y).toBeCloseTo(120, 5);
    });
  });

  describe('invertMatrix', () => {
    it('should invert identity matrix to itself', () => {
      const inverted = invertMatrix(IDENTITY_MATRIX);
      // Use toBeCloseTo to handle -0 vs 0
      expect(inverted.a).toBeCloseTo(1, 10);
      expect(inverted.b).toBeCloseTo(0, 10);
      expect(inverted.c).toBeCloseTo(0, 10);
      expect(inverted.d).toBeCloseTo(1, 10);
      expect(inverted.e).toBeCloseTo(0, 10);
      expect(inverted.f).toBeCloseTo(0, 10);
    });

    it('should invert translation matrix', () => {
      const matrix = createTranslateMatrix(10, 20);
      const inverted = invertMatrix(matrix);
      const point: Point = { x: 15, y: 25 };

      // Apply matrix then inverted should return original
      const transformed = transformPoint(point, matrix);
      const restored = transformPoint(transformed, inverted);

      expect(restored.x).toBeCloseTo(point.x, 5);
      expect(restored.y).toBeCloseTo(point.y, 5);
    });

    it('should invert rotation matrix', () => {
      const matrix = createRotateMatrix(45);
      const inverted = invertMatrix(matrix);
      const point: Point = { x: 10, y: 5 };

      const transformed = transformPoint(point, matrix);
      const restored = transformPoint(transformed, inverted);

      expect(restored.x).toBeCloseTo(point.x, 5);
      expect(restored.y).toBeCloseTo(point.y, 5);
    });

    it('should invert scale matrix', () => {
      const matrix = createScaleMatrix(2, 3);
      const inverted = invertMatrix(matrix);
      const point: Point = { x: 10, y: 15 };

      const transformed = transformPoint(point, matrix);
      const restored = transformPoint(transformed, inverted);

      expect(restored.x).toBeCloseTo(point.x, 5);
      expect(restored.y).toBeCloseTo(point.y, 5);
    });

    it('should throw error for non-invertible matrix', () => {
      const nonInvertible: TransformMatrix = {
        a: 0,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 0,
      };

      expect(() => invertMatrix(nonInvertible)).toThrow(
        'Matrix is not invertible'
      );
    });
  });

  describe('transformPoint', () => {
    it('should transform point with identity matrix', () => {
      const point: Point = { x: 10, y: 20, z: 30 };
      const result = transformPoint(point, IDENTITY_MATRIX);

      expect(result).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('should preserve Z coordinate', () => {
      const matrix = createTranslateMatrix(5, 10);
      const point: Point = { x: 0, y: 0, z: 100 };
      const result = transformPoint(point, matrix);

      expect(result).toEqual({ x: 5, y: 10, z: 100 });
    });

    it('should handle undefined Z coordinate', () => {
      const matrix = createTranslateMatrix(5, 10);
      const point: Point = { x: 0, y: 0 };
      const result = transformPoint(point, matrix);

      expect(result).toEqual({ x: 5, y: 10, z: undefined });
    });
  });

  describe('matrixToCSS', () => {
    it('should convert identity matrix to CSS', () => {
      const css = matrixToCSS(IDENTITY_MATRIX);
      expect(css).toBe('matrix(1, 0, 0, 1, 0, 0)');
    });

    it('should convert translation matrix to CSS', () => {
      const matrix = createTranslateMatrix(10, 20);
      const css = matrixToCSS(matrix);
      expect(css).toBe('matrix(1, 0, 0, 1, 10, 20)');
    });

    it('should convert scale matrix to CSS', () => {
      const matrix = createScaleMatrix(2, 3);
      const css = matrixToCSS(matrix);
      expect(css).toBe('matrix(2, 0, 0, 3, 0, 0)');
    });

    it('should convert rotation matrix to CSS', () => {
      const matrix = createRotateMatrix(90);
      const css = matrixToCSS(matrix);

      // cos(90°)=0, sin(90°)=1
      // matrix(a, b, c, d, e, f) = matrix(0, 1, -1, 0, 0, 0)
      expect(css).toContain('matrix(');
      expect(css).toContain('0');
      expect(css).toContain('1');
      expect(css).toContain('-1');
    });
  });

  describe('Complex transformations', () => {
    it('should handle translate-rotate-scale composition', () => {
      // Real-world scenario: position node, rotate around its center, then scale
      const position: Point = { x: 100, y: 100 };
      const center: Point = { x: 50, y: 50 }; // Center of 100x100 node

      const translate = createTranslateMatrix(position.x, position.y);
      const rotate = createRotateMatrix(45, center);
      const scale = createScaleMatrix(2, 2, center);

      const composed = composeMatrices(translate, rotate, scale);

      const corner: Point = { x: 0, y: 0 };
      const result = transformPoint(corner, composed);

      // Corner should be transformed by all operations
      expect(result.x).toBeDefined();
      expect(result.y).toBeDefined();
    });

    it('should be reversible with inverse', () => {
      const translate = createTranslateMatrix(50, 75);
      const rotate = createRotateMatrix(30);
      const scale = createScaleMatrix(1.5, 2);

      const forward = composeMatrices(translate, rotate, scale);
      const backward = invertMatrix(forward);

      const point: Point = { x: 100, y: 200 };
      const transformed = transformPoint(point, forward);
      const restored = transformPoint(transformed, backward);

      expect(restored.x).toBeCloseTo(point.x, 5);
      expect(restored.y).toBeCloseTo(point.y, 5);
    });
  });
});
