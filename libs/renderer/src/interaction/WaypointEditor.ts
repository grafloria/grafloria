// WaypointEditor.ts - Phase 2.3a: Waypoint editing implementation
// TDD GREEN Phase: Implement to make tests pass

import type { WaypointEditorConfig } from '@grafloria/engine';
import type { VNode } from '../types';

/**
 * Point in 2D space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Represents a waypoint on a link path
 */
export interface Waypoint {
  index: number;  // Index in the points array (excluding endpoints)
  point: Point;
}

/**
 * Waypoint handle for rendering
 */
export interface WaypointHandle extends Waypoint {
  linkId: string;
}

/**
 * Result of hit testing a waypoint
 */
export interface WaypointHitResult {
  waypointIndex: number;
  waypoint: Waypoint;
  distance: number;
}

/**
 * Result of hit testing a path segment
 */
export interface PathHitResult {
  segmentIndex: number;
  insertPosition: Point;
  insertIndex: number;
  distance: number;
}

/**
 * Result of adding a waypoint
 */
export interface AddWaypointResult {
  newPoints: Point[];
  waypointIndex: number;
  segmentIndex: number;
}

/**
 * Phase 2.3a: WaypointEditor
 *
 * Handles interactive waypoint editing on link paths:
 * - Add waypoints by clicking on path
 * - Move waypoints by dragging
 * - Remove waypoints by double-click
 * - Grid snapping
 * - Distance constraints
 *
 * Architecture: Modular tool that can be enabled/disabled via InteractionConfig
 */
export class WaypointEditor {
  private config: WaypointEditorConfig;

  constructor(config: WaypointEditorConfig) {
    this.config = config;
  }

  /**
   * Get waypoint at specific index
   */
  getWaypointAt(index: number, points: Point[]): Waypoint | null {
    if (index < 0 || index >= points.length) {
      return null;
    }

    // Don't return endpoints as waypoints
    if (index === 0 || index === points.length - 1) {
      return null;
    }

    return {
      index,
      point: { ...points[index] },
    };
  }

  /**
   * Check if point at index is a waypoint (not an endpoint)
   */
  isWaypoint(index: number, points: Point[]): boolean {
    if (points.length < 3) return false;
    return index > 0 && index < points.length - 1;
  }

  /**
   * Get all waypoints (excluding endpoints)
   */
  getWaypoints(points: Point[]): Waypoint[] {
    if (points.length < 3) return [];

    const waypoints: Waypoint[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      waypoints.push({
        index: i,
        point: { ...points[i] },
      });
    }

    return waypoints;
  }

  /**
   * Hit test for clicking on a waypoint handle
   * Optimized to avoid allocations on hot path (mousemove)
   */
  hitTestWaypoint(mouseX: number, mouseY: number, points: Point[]): WaypointHitResult | null {
    // Fast path: no waypoints if less than 3 points
    if (points.length < 3) return null;

    const mousePoint = { x: mouseX, y: mouseY };
    const hitRadius = this.config.handleRadius + 5;

    // Direct iteration - no intermediate allocations
    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.distance(mousePoint, points[i]);

      if (distance <= hitRadius) {
        // Only allocate when we find a hit
        return {
          waypointIndex: i,
          waypoint: {
            index: i,
            point: { ...points[i] },
          },
          distance,
        };
      }
    }

    return null;
  }

  /**
   * Hit test for clicking on a path segment (to add waypoint)
   */
  hitTestPath(mouseX: number, mouseY: number, points: Point[]): PathHitResult | null {
    if (points.length < 2) return null;

    const mousePoint = { x: mouseX, y: mouseY };
    let closestHit: PathHitResult | null = null;
    let closestDistance = this.config.clickDetectionRadius;

    // Check each segment
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Calculate closest point on segment
      const closestPoint = this.closestPointOnSegment(mousePoint, p1, p2);
      const distance = this.distance(mousePoint, closestPoint);

      if (distance <= closestDistance) {
        closestDistance = distance;
        closestHit = {
          segmentIndex: i,
          insertPosition: closestPoint,
          insertIndex: i + 1,
          distance,
        };
      }
    }

    return closestHit;
  }

  /**
   * Add waypoint at click position on path
   */
  addWaypointAtPosition(
    clickX: number,
    clickY: number,
    points: Point[]
  ): AddWaypointResult | null {
    // Hit test the path to find insertion point
    const hit = this.hitTestPath(clickX, clickY, points);
    if (!hit) return null;

    // Check minimum distance from endpoints
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const distFromStart = this.distance(hit.insertPosition, startPoint);
    const distFromEnd = this.distance(hit.insertPosition, endPoint);

    if (
      distFromStart < this.config.minDistanceFromEndpoints ||
      distFromEnd < this.config.minDistanceFromEndpoints
    ) {
      return null;
    }

    // Insert the new waypoint
    const newPoints = [...points];
    newPoints.splice(hit.insertIndex, 0, { ...hit.insertPosition });

    return {
      newPoints,
      waypointIndex: hit.insertIndex,
      segmentIndex: hit.segmentIndex,
    };
  }

  /**
   * Move waypoint to new position
   * For orthogonal paths, just move the waypoint - the rendering will use orthogonal routing
   */
  moveWaypoint(
    waypointIndex: number,
    newPosition: Point,
    points: Point[],
    pathType?: 'direct' | 'orthogonal' | 'smooth' | 'bezier'
  ): Point[] | null {
    // Don't move endpoints
    if (!this.isWaypoint(waypointIndex, points)) {
      return null;
    }

    // Apply grid snapping if enabled
    let finalPosition = this.config.snapToGrid
      ? this.snapToGrid(newPosition)
      : { ...newPosition };

    // Simple approach: just move the waypoint
    // For orthogonal paths, the orthogonal router will create proper routing between points
    const newPoints = [...points];
    newPoints[waypointIndex] = finalPosition;
    return newPoints;
  }

  /**
   * Remove waypoint at index
   */
  removeWaypoint(waypointIndex: number, points: Point[]): Point[] | null {
    // Don't remove endpoints
    if (!this.isWaypoint(waypointIndex, points)) {
      return null;
    }

    const newPoints = [...points];
    newPoints.splice(waypointIndex, 1);

    return newPoints;
  }

  /**
   * Snap point to grid
   */
  snapToGrid(point: Point): Point {
    const { gridSize } = this.config;

    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  /**
   * Calculate distance from point to line segment
   */
  distanceToSegment(point: Point, segmentStart: Point, segmentEnd: Point): number {
    const closestPoint = this.closestPointOnSegment(point, segmentStart, segmentEnd);
    return this.distance(point, closestPoint);
  }

  /**
   * Find closest point on line segment to given point
   */
  private closestPointOnSegment(point: Point, segmentStart: Point, segmentEnd: Point): Point {
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;

    // Handle zero-length segment
    if (dx === 0 && dy === 0) {
      return { ...segmentStart };
    }

    // Calculate parameter t (0-1) along the segment
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / (dx * dx + dy * dy)
      )
    );

    // Calculate closest point
    return {
      x: segmentStart.x + t * dx,
      y: segmentStart.y + t * dy,
    };
  }

  /**
   * Calculate Euclidean distance between two points
   */
  distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get current configuration
   */
  getConfig(): WaypointEditorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<WaypointEditorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Render waypoint handle as VNode
   */
  renderWaypointHandle(waypoint: Waypoint, linkId: string): VNode {
    return {
      type: 'circle',
      key: `waypoint-${linkId}-${waypoint.index}`,
      props: {
        cx: waypoint.point.x,
        cy: waypoint.point.y,
        r: this.config.handleRadius,
        fill: this.config.handleColor,
        stroke: this.config.handleStrokeColor,
        strokeWidth: 2,
        className: 'waypoint-handle',
        style: {
          cursor: 'move',
          transition: 'all 0.2s ease',
        },
      },
    };
  }

  /**
   * Render all waypoint handles for a link
   */
  renderWaypointHandles(points: Point[], linkId: string): VNode[] {
    const waypoints = this.getWaypoints(points);
    return waypoints.map(waypoint => this.renderWaypointHandle(waypoint, linkId));
  }
}
