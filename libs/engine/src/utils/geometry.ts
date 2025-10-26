// Geometry utility functions

import { Point, Size, BoundingBox } from '../types';
import type { ShapeConfig } from '../templates/NodeTemplate';

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate midpoint between two points
 */
export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Check if point is inside bounding box
 */
export function pointInBox(point: Point, box: BoundingBox): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

/**
 * Create bounding box from position and size
 */
export function createBoundingBox(
  position: Point,
  size: Size
): BoundingBox {
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height,
    width: size.width,
    height: size.height,
  };
}

/**
 * Check if two bounding boxes intersect
 */
export function boxesIntersect(box1: BoundingBox, box2: BoundingBox): boolean {
  return !(
    box1.right < box2.left ||
    box1.left > box2.right ||
    box1.bottom < box2.top ||
    box1.top > box2.bottom
  );
}

/**
 * Expand bounding box by margin
 */
export function expandBox(box: BoundingBox, margin: number): BoundingBox {
  return {
    left: box.left - margin,
    top: box.top - margin,
    right: box.right + margin,
    bottom: box.bottom + margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2,
  };
}

/**
 * Clamp point to bounding box
 */
export function clampToBox(point: Point, box: BoundingBox): Point {
  return {
    x: Math.max(box.left, Math.min(box.right, point.x)),
    y: Math.max(box.top, Math.min(box.bottom, point.y)),
  };
}

/**
 * Rotate point around origin
 */
export function rotatePoint(
  point: Point,
  origin: Point,
  angle: number
): Point {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Scale point from origin
 */
export function scalePoint(
  point: Point,
  origin: Point,
  scale: Point
): Point {
  return {
    x: origin.x + (point.x - origin.x) * scale.x,
    y: origin.y + (point.y - origin.y) * scale.y,
  };
}

// ========================================
// Phase 3.3: Shape-Aware Hit Detection
// ========================================

/**
 * Determine if a point is inside a shape
 * Returns true if point (px, py) is within the shape defined by bounds and shapeConfig
 *
 * Phase 3.3: Shape-aware hit detection for accurate mouse interactions
 */
export function isPointInShape(
  px: number,
  py: number,
  bounds: BoundingBox,
  shapeConfig?: ShapeConfig
): boolean {
  const shape = shapeConfig || { type: 'rect' };

  switch (shape.type) {
    case 'circle':
      return isPointInCircle(px, py, bounds);

    case 'ellipse':
      return isPointInEllipse(px, py, bounds);

    case 'diamond':
      return isPointInDiamond(px, py, bounds);

    case 'hexagon':
      return isPointInHexagon(px, py, bounds);

    case 'rect':
    default:
      return isPointInRectangle(px, py, bounds);
  }
}

/**
 * Rectangle hit detection
 */
function isPointInRectangle(px: number, py: number, bounds: BoundingBox): boolean {
  return (
    px >= bounds.left &&
    px <= bounds.right &&
    py >= bounds.top &&
    py <= bounds.bottom
  );
}

/**
 * Circle hit detection - point within radius
 * Uses min(width, height) as diameter
 */
function isPointInCircle(px: number, py: number, bounds: BoundingBox): boolean {
  const radius = Math.min(bounds.width, bounds.height) / 2;
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;

  const dx = px - cx;
  const dy = py - cy;
  const distanceSquared = dx * dx + dy * dy;

  return distanceSquared <= radius * radius;
}

/**
 * Ellipse hit detection - point within ellipse perimeter
 */
function isPointInEllipse(px: number, py: number, bounds: BoundingBox): boolean {
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const cx = bounds.left + rx;
  const cy = bounds.top + ry;

  const dx = px - cx;
  const dy = py - cy;

  // Ellipse equation: (x/rx)^2 + (y/ry)^2 <= 1
  const normalized = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);

  return normalized <= 1;
}

/**
 * Diamond hit detection - point within diamond (rotated square)
 * Diamond vertices at: (cx, top), (right, cy), (cx, bottom), (left, cy)
 */
function isPointInDiamond(px: number, py: number, bounds: BoundingBox): boolean {
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;

  // Normalize point to center
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);

  // Diamond inequality: |dx| / (width/2) + |dy| / (height/2) <= 1
  const normalized = dx / (bounds.width / 2) + dy / (bounds.height / 2);

  return normalized <= 1;
}

/**
 * Hexagon hit detection - point within flat-top hexagon
 * Flat-top hexagon with vertices at specific positions
 */
function isPointInHexagon(px: number, py: number, bounds: BoundingBox): boolean {
  // Flat-top hexagon vertices (clockwise from top)
  const w = bounds.width;
  const h = bounds.height;
  const vertices: Point[] = [
    { x: bounds.left + w * 0.5, y: bounds.top }, // Top
    { x: bounds.left + w, y: bounds.top + h * 0.25 }, // Top-right
    { x: bounds.left + w, y: bounds.top + h * 0.75 }, // Bottom-right
    { x: bounds.left + w * 0.5, y: bounds.top + h }, // Bottom
    { x: bounds.left, y: bounds.top + h * 0.75 }, // Bottom-left
    { x: bounds.left, y: bounds.top + h * 0.25 }, // Top-left
  ];

  return isPointInPolygon(px, py, vertices);
}

/**
 * Generic polygon hit detection using ray casting algorithm
 * Casts a ray from point to infinity and counts edge crossings
 */
function isPointInPolygon(px: number, py: number, vertices: Point[]): boolean {
  let inside = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    // Ray casting: check if horizontal ray from point crosses edge
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}
