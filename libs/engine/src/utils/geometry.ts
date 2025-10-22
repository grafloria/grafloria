// Geometry utility functions

import { Point, Size, BoundingBox } from '../types';

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
