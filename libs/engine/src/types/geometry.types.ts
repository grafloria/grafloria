// Geometry type definitions for the diagram engine

export interface Point {
  x: number;
  y: number;
  z?: number; // For future 3D support
}

export interface Size {
  width: number;
  height: number;
  depth?: number; // For future 3D support
}

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Rectangle defined by position and size (Phase 5.1)
 * Used for viewport queries and spatial indexing
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  position: Point;
  rotation: number; // Degrees
  scale: Point;    // x, y scale factors
  origin: Point;   // Transform origin
}

/**
 * 2D Affine Transform Matrix (Phase 1.6a)
 * Represents: translate, rotate, scale, skew
 * CSS-compatible format: matrix(a, b, c, d, e, f)
 *
 * Matrix structure:
 * | a  c  e |
 * | b  d  f |
 * | 0  0  1 |
 *
 * Where:
 * - a, d: Scale X and Y (also affected by rotation/skew)
 * - b, c: Rotation and skew components
 * - e, f: Translation X and Y
 */
export interface TransformMatrix {
  a: number; // Scale X / cos(rotation)
  b: number; // sin(rotation) / Skew Y
  c: number; // -sin(rotation) / Skew X
  d: number; // Scale Y / cos(rotation)
  e: number; // Translate X
  f: number; // Translate Y
}

/**
 * Identity matrix (no transformation)
 */
export const IDENTITY_MATRIX: TransformMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  width?: number;
  height?: number;
}

export interface Path {
  points: Point[];
  segments: PathSegment[];
}

export interface PathSegment {
  type: 'move' | 'line' | 'curve' | 'arc';
  from: Point;
  to: Point;
  control1?: Point; // For curves
  control2?: Point; // For curves
  radius?: number;  // For arcs
}

export type Alignment = 'left' | 'right' | 'top' | 'bottom' | 'center';
export type Direction = 'horizontal' | 'vertical' | 'both';
export type RoutingStrategy = 'direct' | 'orthogonal' | 'smooth' | 'smart';
