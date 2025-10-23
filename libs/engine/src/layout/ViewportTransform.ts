/**
 * Viewport Transform Utility (Phase 0.5)
 *
 * Calculates transformations to fit layout results within viewport bounds.
 * Industry-standard approach used by yFiles, Draw.io, and Lucidchart.
 */

import { Point, Rectangle } from '../types';

/**
 * Transform to apply to layout positions
 */
export interface Transform {
  /** Scaling factor (1.0 = no scaling) */
  scale: number;

  /** X offset to add after scaling */
  offsetX: number;

  /** Y offset to add after scaling */
  offsetY: number;
}

/**
 * Calculate transform to fit layout bounds within viewport
 *
 * @param layoutBounds - Bounding box of the calculated layout
 * @param viewport - Target viewport to fit within
 * @param margins - Margins around content (default: 50)
 * @returns Transform to apply to all positions
 */
export function calculateViewportTransform(
  layoutBounds: Rectangle,
  viewport: Rectangle,
  margins: number = 50
): Transform {
  // Available space in viewport (accounting for margins)
  const availableWidth = viewport.width - 2 * margins;
  const availableHeight = viewport.height - 2 * margins;

  // Calculate scale to fit layout in viewport
  const scaleX = availableWidth / layoutBounds.width;
  const scaleY = availableHeight / layoutBounds.height;

  // Use minimum scale to ensure everything fits
  // Never scale UP (max scale = 1.0), only scale down if needed
  const scale = Math.min(scaleX, scaleY, 1.0);

  // Calculate dimensions after scaling
  const scaledWidth = layoutBounds.width * scale;
  const scaledHeight = layoutBounds.height * scale;

  // Calculate offset to center in viewport
  const centerOffsetX = (availableWidth - scaledWidth) / 2;
  const centerOffsetY = (availableHeight - scaledHeight) / 2;

  // Final offset combines:
  // 1. Viewport position
  // 2. Margins
  // 3. Centering offset
  // 4. Negation of scaled layout origin
  const offsetX = viewport.x + margins + centerOffsetX - layoutBounds.x * scale;
  const offsetY = viewport.y + margins + centerOffsetY - layoutBounds.y * scale;

  return {
    scale,
    offsetX,
    offsetY
  };
}

/**
 * Apply transform to a point
 *
 * @param point - Original point from layout
 * @param transform - Transform to apply
 * @returns Transformed point
 */
export function applyTransform(point: Point, transform: Transform): Point {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY
  };
}

/**
 * Calculate bounding box from an array of points
 *
 * @param points - Array of points
 * @returns Bounding box containing all points
 */
export function calculateBounds(points: Point[]): Rectangle {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Calculate bounding box from node positions and sizes
 *
 * @param nodes - Array of objects with position and size
 * @returns Bounding box containing all nodes
 */
export function calculateNodeBounds(
  nodes: Array<{ position: Point; size: { width: number; height: number } }>
): Rectangle {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const { position, size } = node;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
