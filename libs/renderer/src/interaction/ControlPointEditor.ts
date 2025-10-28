// ControlPointEditor.ts - Bezier control point editing tool
// Phase 2.3b: Interactive bezier curve editing via control point manipulation

import type { Point, PathSegment } from '@grafloria/engine';
import type { ControlPointEditorConfig } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import { h } from '../vnode/h';

/**
 * Control point information
 */
export interface ControlPoint {
  /** Position of the control point */
  point: Point;
  /** Index of the segment this control point belongs to */
  segmentIndex: number;
  /** Type of control point (control1 or control2) */
  type: 'control1' | 'control2';
  /** Anchor point (from/to) that this control point affects */
  anchor: Point;
}

/**
 * Result of hit testing a control point
 */
export interface ControlPointHitResult {
  /** Index of the segment */
  segmentIndex: number;
  /** Type of control point */
  controlType: 'control1' | 'control2';
  /** Position of the control point */
  point: Point;
  /** Anchor point */
  anchor: Point;
}

/**
 * ControlPointEditor provides functionality for editing bezier curve control points
 *
 * Features:
 * - Detect and track control points from path segments
 * - Hit testing for control point handles
 * - Move control points via drag
 * - Auto-generate smooth bezier curves from points
 * - Grid snapping support
 * - Symmetric control point mirroring
 * - Visual rendering of control handles and lines
 *
 * @example
 * ```typescript
 * const editor = new ControlPointEditor(config);
 *
 * // Detect control points from segments
 * const controlPoints = editor.getControlPoints(link.segments);
 *
 * // Hit test for click
 * const hit = editor.hitTestControlPoint(mouseX, mouseY, link.segments);
 *
 * // Move control point
 * const newSegments = editor.moveControlPoint(hit.segmentIndex, hit.controlType, newPos, link.segments);
 *
 * // Render visual handles
 * const handles = editor.renderControlPointHandles(link.segments, link.id);
 * ```
 */
export class ControlPointEditor {
  private config: ControlPointEditorConfig;

  constructor(config: ControlPointEditorConfig) {
    this.config = { ...config };
  }

  /**
   * Get all control points from path segments
   *
   * @param segments - Path segments to extract control points from
   * @returns Array of control point information
   */
  getControlPoints(segments: PathSegment[]): ControlPoint[] {
    const controlPoints: ControlPoint[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Only curve segments have control points
      if (segment.type === 'curve') {
        // control1 is relative to the 'from' anchor
        if (segment.control1 && isFinite(segment.control1.x) && isFinite(segment.control1.y)) {
          controlPoints.push({
            point: { ...segment.control1 },
            segmentIndex: i,
            type: 'control1',
            anchor: { ...segment.from },
          });
        }

        // control2 is relative to the 'to' anchor
        if (segment.control2 && isFinite(segment.control2.x) && isFinite(segment.control2.y)) {
          controlPoints.push({
            point: { ...segment.control2 },
            segmentIndex: i,
            type: 'control2',
            anchor: { ...segment.to },
          });
        }
      }
    }

    return controlPoints;
  }

  /**
   * Hit test for control point handles
   *
   * @param mouseX - Mouse X coordinate
   * @param mouseY - Mouse Y coordinate
   * @param segments - Path segments
   * @returns Hit result if a control point was clicked, null otherwise
   */
  hitTestControlPoint(
    mouseX: number,
    mouseY: number,
    segments: PathSegment[]
  ): ControlPointHitResult | null {
    const controlPoints = this.getControlPoints(segments);
    let closestPoint: ControlPointHitResult | null = null;
    let closestDistance = this.config.clickDetectionRadius;

    for (const cp of controlPoints) {
      const distance = this.calculateDistance(
        { x: mouseX, y: mouseY },
        cp.point
      );

      if (distance <= closestDistance) {
        closestDistance = distance;
        closestPoint = {
          segmentIndex: cp.segmentIndex,
          controlType: cp.type,
          point: cp.point,
          anchor: cp.anchor,
        };
      }
    }

    return closestPoint;
  }

  /**
   * Move a control point to a new position
   *
   * @param segmentIndex - Index of the segment
   * @param controlType - Type of control point (control1 or control2)
   * @param newPosition - New position for the control point
   * @param segments - Current path segments
   * @returns Updated segments array, or null if invalid
   */
  moveControlPoint(
    segmentIndex: number,
    controlType: 'control1' | 'control2',
    newPosition: Point,
    segments: PathSegment[]
  ): PathSegment[] | null {
    // Validate segment index
    if (segmentIndex < 0 || segmentIndex >= segments.length) {
      return null;
    }

    const segment = segments[segmentIndex];

    // Only curve segments have control points
    if (segment.type !== 'curve') {
      return null;
    }

    // Apply grid snapping if enabled
    const position = this.config.snapToGrid
      ? this.snapToGrid(newPosition)
      : { ...newPosition };

    // Clone segments array
    const newSegments = segments.map((s, i) => {
      if (i !== segmentIndex) {
        return { ...s };
      }

      // Update the specified control point
      const updated = { ...s };
      if (controlType === 'control1') {
        updated.control1 = position;
      } else {
        updated.control2 = position;
      }

      return updated;
    });

    // Handle symmetric controls (mirror to adjacent segment)
    if (this.config.symmetricControls) {
      this.applySymmetricControl(newSegments, segmentIndex, controlType, position);
    }

    return newSegments;
  }

  /**
   * Apply symmetric control point mirroring to adjacent segment
   *
   * @param segments - Segments array (mutated)
   * @param segmentIndex - Index of the segment being edited
   * @param controlType - Type of control point being moved
   * @param newPosition - New position of the control point
   */
  private applySymmetricControl(
    segments: PathSegment[],
    segmentIndex: number,
    controlType: 'control1' | 'control2',
    newPosition: Point
  ): void {
    const segment = segments[segmentIndex];

    // Mirror control2 of current segment to control1 of next segment
    if (controlType === 'control2' && segmentIndex < segments.length - 1) {
      const nextSegment = segments[segmentIndex + 1];
      if (nextSegment.type === 'curve' && segment.to) {
        // Calculate mirror position
        const anchor = segment.to;
        const dx = anchor.x - newPosition.x;
        const dy = anchor.y - newPosition.y;
        const mirrorPos = {
          x: anchor.x + dx,
          y: anchor.y + dy,
        };
        nextSegment.control1 = mirrorPos;
      }
    }

    // Mirror control1 of current segment to control2 of previous segment
    if (controlType === 'control1' && segmentIndex > 0) {
      const prevSegment = segments[segmentIndex - 1];
      if (prevSegment.type === 'curve' && segment.from) {
        // Calculate mirror position
        const anchor = segment.from;
        const dx = anchor.x - newPosition.x;
        const dy = anchor.y - newPosition.y;
        const mirrorPos = {
          x: anchor.x + dx,
          y: anchor.y + dy,
        };
        prevSegment.control2 = mirrorPos;
      }
    }
  }

  /**
   * Auto-generate bezier curve segments from an array of points
   *
   * Uses Catmull-Rom algorithm to generate smooth curves
   *
   * @param points - Array of points to convert to bezier curves
   * @returns Array of curve segments with auto-generated control points
   */
  generateBezierSegments(points: Point[]): PathSegment[] {
    if (points.length < 2) {
      return [];
    }

    const segments: PathSegment[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Calculate control points using Catmull-Rom to Bezier conversion
      // See: https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline
      const control1 = {
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6,
      };

      const control2 = {
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6,
      };

      segments.push({
        type: 'curve',
        from: { ...p1 },
        to: { ...p2 },
        control1,
        control2,
      });
    }

    return segments;
  }

  /**
   * Snap a point to the grid
   *
   * @param point - Point to snap
   * @returns Snapped point
   */
  snapToGrid(point: Point): Point {
    const { gridSize } = this.config;
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  /**
   * Calculate Euclidean distance between two points
   *
   * @param p1 - First point
   * @param p2 - Second point
   * @returns Distance in pixels
   */
  calculateDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Render a control point handle as a VNode
   *
   * @param controlPoint - Control point to render
   * @param linkId - ID of the link (for DOM identification)
   * @returns VNode representing the control point handle
   */
  renderControlPointHandle(controlPoint: ControlPoint, linkId: string): VNode {
    return h('circle', {
      cx: controlPoint.point.x,
      cy: controlPoint.point.y,
      r: this.config.handleRadius,
      fill: this.config.handleColor,
      stroke: this.config.handleStrokeColor,
      'stroke-width': 2,
      class: `control-point-handle control-point-${controlPoint.type}`,
      'data-link-id': linkId,
      'data-segment-index': controlPoint.segmentIndex.toString(),
      'data-control-type': controlPoint.type,
    });
  }

  /**
   * Render a control line (from anchor to control point) as a VNode
   *
   * @param controlPoint - Control point to render line for
   * @param linkId - ID of the link
   * @returns VNode representing the control line
   */
  renderControlLine(controlPoint: ControlPoint, linkId: string): VNode {
    return h('line', {
      x1: controlPoint.anchor.x,
      y1: controlPoint.anchor.y,
      x2: controlPoint.point.x,
      y2: controlPoint.point.y,
      stroke: this.config.controlLineColor,
      'stroke-width': this.config.controlLineWidth,
      'stroke-dasharray': this.config.controlLineDash.join(','),
      class: 'control-line',
      'data-link-id': linkId,
    });
  }

  /**
   * Render all control point handles for a link
   *
   * @param segments - Path segments
   * @param linkId - ID of the link
   * @returns Array of VNodes for rendering
   */
  renderControlPointHandles(segments: PathSegment[], linkId: string): VNode[] {
    const controlPoints = this.getControlPoints(segments);
    const vnodes: VNode[] = [];

    for (const cp of controlPoints) {
      // Render control line first (so it appears behind the handle)
      if (this.config.showControlLines) {
        vnodes.push(this.renderControlLine(cp, linkId));
      }

      // Render control point handle
      vnodes.push(this.renderControlPointHandle(cp, linkId));
    }

    return vnodes;
  }

  /**
   * Update configuration (partial update)
   *
   * @param partialConfig - Partial configuration to merge
   */
  updateConfig(partialConfig: Partial<ControlPointEditorConfig>): void {
    this.config = {
      ...this.config,
      ...partialConfig,
    };
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration (readonly copy)
   */
  getConfig(): Readonly<ControlPointEditorConfig> {
    return { ...this.config };
  }
}
