// transform.ts - Transform Matrix Utilities (Phase 1.6a)

import type { Point } from '../types';
import type { TransformMatrix } from '../types/geometry.types';
import { IDENTITY_MATRIX } from '../types/geometry.types';

// Re-export for convenience
export { IDENTITY_MATRIX };
export type { TransformMatrix };

/**
 * Multiply two transform matrices: A * B
 * Matrix multiplication order matters: A * B ≠ B * A
 *
 * @param a - Left matrix
 * @param b - Right matrix
 * @returns Product matrix
 */
export function multiplyMatrices(
  a: TransformMatrix,
  b: TransformMatrix
): TransformMatrix {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

/**
 * Compose multiple transform matrices
 * Applied right-to-left: compose(A, B, C) = A * B * C
 * Example: compose(translate, rotate, scale) applies scale first, then rotate, then translate
 *
 * @param matrices - Matrices to compose (applied right-to-left)
 * @returns Composed matrix
 */
export function composeMatrices(...matrices: TransformMatrix[]): TransformMatrix {
  if (matrices.length === 0) {
    return { ...IDENTITY_MATRIX };
  }

  if (matrices.length === 1) {
    return { ...matrices[0] };
  }

  // Multiply matrices left to right (applies right to left)
  let result = matrices[0];
  for (let i = 1; i < matrices.length; i++) {
    result = multiplyMatrices(result, matrices[i]);
  }

  return result;
}

/**
 * Create translation matrix
 *
 * @param x - X translation
 * @param y - Y translation
 * @returns Translation matrix
 */
export function createTranslateMatrix(x: number, y: number): TransformMatrix {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: x,
    f: y,
  };
}

/**
 * Create rotation matrix
 * Rotates around origin (0, 0) or specified origin point
 *
 * @param degrees - Rotation angle in degrees (clockwise)
 * @param origin - Optional rotation origin (default: 0, 0)
 * @returns Rotation matrix
 */
export function createRotateMatrix(
  degrees: number,
  origin?: Point
): TransformMatrix {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Rotate around origin (0, 0)
  if (!origin || (origin.x === 0 && origin.y === 0)) {
    return {
      a: cos,
      b: sin,
      c: -sin,
      d: cos,
      e: 0,
      f: 0,
    };
  }

  // Rotate around custom origin:
  // Operations applied right-to-left:
  // 3. Translate back (+origin)
  // 2. Rotate
  // 1. Translate to origin (-origin)
  return composeMatrices(
    createTranslateMatrix(origin.x, origin.y),
    { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 },
    createTranslateMatrix(-origin.x, -origin.y)
  );
}

/**
 * Create scale matrix
 * Scales around origin (0, 0) or specified origin point
 *
 * @param x - X scale factor
 * @param y - Y scale factor
 * @param origin - Optional scale origin (default: 0, 0)
 * @returns Scale matrix
 */
export function createScaleMatrix(
  x: number,
  y: number,
  origin?: Point
): TransformMatrix {
  // Scale around origin (0, 0)
  if (!origin || (origin.x === 0 && origin.y === 0)) {
    return {
      a: x,
      b: 0,
      c: 0,
      d: y,
      e: 0,
      f: 0,
    };
  }

  // Scale around custom origin:
  // Operations applied right-to-left:
  // 3. Translate back (+origin)
  // 2. Scale
  // 1. Translate to origin (-origin)
  return composeMatrices(
    createTranslateMatrix(origin.x, origin.y),
    { a: x, b: 0, c: 0, d: y, e: 0, f: 0 },
    createTranslateMatrix(-origin.x, -origin.y)
  );
}

/**
 * Create skew matrix
 * Skews (shears) along X and Y axes
 *
 * @param x - X skew angle in degrees
 * @param y - Y skew angle in degrees
 * @returns Skew matrix
 */
export function createSkewMatrix(x: number, y: number): TransformMatrix {
  const radX = (x * Math.PI) / 180;
  const radY = (y * Math.PI) / 180;

  return {
    a: 1,
    b: Math.tan(radY),
    c: Math.tan(radX),
    d: 1,
    e: 0,
    f: 0,
  };
}

/**
 * Transform a point using a matrix
 *
 * @param point - Point to transform
 * @param matrix - Transform matrix
 * @returns Transformed point
 */
export function transformPoint(point: Point, matrix: TransformMatrix): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    z: point.z,
  };
}

/**
 * Invert a transform matrix
 * Useful for converting global coordinates to local and vice versa
 *
 * @param m - Matrix to invert
 * @returns Inverted matrix
 * @throws Error if matrix is not invertible (determinant is zero)
 */
export function invertMatrix(m: TransformMatrix): TransformMatrix {
  // Calculate determinant
  const det = m.a * m.d - m.b * m.c;

  // Check if matrix is invertible
  if (Math.abs(det) < 1e-10) {
    throw new Error('Matrix is not invertible (determinant near zero)');
  }

  // Calculate inverse using determinant
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/**
 * Convert transform matrix to CSS matrix() string
 * Format: matrix(a, b, c, d, e, f)
 *
 * @param m - Transform matrix
 * @returns CSS matrix string
 */
export function matrixToCSS(m: TransformMatrix): string {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;
}
