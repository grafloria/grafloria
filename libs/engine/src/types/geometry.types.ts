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

export interface Transform {
  position: Point;
  rotation: number; // Degrees
  scale: Point;    // x, y scale factors
  origin: Point;   // Transform origin
}

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
