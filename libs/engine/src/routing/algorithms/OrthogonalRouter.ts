// OrthogonalRouter - Right-angle routing with obstacle avoidance

import type { IRouter, RouteRequest, RoutedPath, RoutePoint, Obstacle } from '../types';
import type { Point } from '../../types';

/**
 * OrthogonalRouter creates paths with only 90-degree angles
 * Supports obstacle avoidance using A* on a grid
 */
export class OrthogonalRouter implements IRouter {
  getName(): string {
    return 'orthogonal';
  }

  route(request: RouteRequest): RoutedPath | null {
    const { start, end, obstacles = [], options = {}, sourceDirection, targetDirection } = request;

    // Handle same start and end point
    if (start.x === end.x && start.y === end.y) {
      return {
        points: [{ x: start.x, y: start.y }],
        totalLength: 0,
        bendCount: 0,
        cost: 0,
        segments: [],
      };
    }

    const bendCost = options.costs?.bends ?? 10;

    // SMART ROUTING: Always calculate a simple orthogonal path first
    const simplePath = this.simpleOrthogonalRoute(start, end, options.gridSize, bendCost, sourceDirection, targetDirection);

    // If no obstacles provided, return the simple path
    if (obstacles.length === 0) {
      return simplePath;
    }

    // Check if the simple path intersects any obstacles
    const hasCollision = this.pathIntersectsObstacles(simplePath.points, obstacles);

    if (!hasCollision) {
      // Path is clear, use the simple routing
      return simplePath;
    }

    // Path has collisions - use A* pathfinding for obstacle avoidance
    if (options.avoidObstacles) {
      const avoidancePath = this.avoidObstaclesRoute(start, end, obstacles, options, sourceDirection, targetDirection);
      if (avoidancePath) {
        return avoidancePath;
      }
    }

    // Fallback: return simple path even with collisions
    // (visual indicator that routing needs manual waypoints)
    return simplePath;
  }

  /**
   * Simple orthogonal route - exact implementation of React Flow's getSmoothStepPath
   * Based on React Flow's smoothstep-edge.ts getPoints() function
   * Handles all edge cases: opposite ports, same ports, mixed ports
   *
   * CRITICAL: The offset determines how far the line moves away from the port
   * before making turns. A larger offset creates more spacing from nodes.
   */
  private simpleOrthogonalRoute(
    start: Point,
    end: Point,
    gridSize?: number,
    bendCost = 10,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom'
  ): RoutedPath {
    // CRITICAL OFFSET: This determines the "breathing room" around nodes
    // Match React Flow's exact offset value for visual consistency
    const offset = 20;

    // Get direction vectors for source and target
    const sourceDir = this.getDirectionVector(sourceDirection);
    const targetDir = this.getDirectionVector(targetDirection);

    // Calculate gapped points (moved away from port in port direction)
    const sourceGapped: Point = {
      x: start.x + sourceDir.x * offset,
      y: start.y + sourceDir.y * offset
    };
    const targetGapped: Point = {
      x: end.x + targetDir.x * offset,
      y: end.y + targetDir.y * offset
    };

    // Determine primary routing direction (React Flow line 86-92)
    const dir = this.getRoutingDirection(sourceGapped, sourceDirection, targetGapped);
    const dirAccessor: 'x' | 'y' = dir.x !== 0 ? 'x' : 'y';
    const currDir = dir[dirAccessor];

    let points: Point[] = [];
    const sourceGapOffset = { x: 0, y: 0 };
    const targetGapOffset = { x: 0, y: 0 };

    // React Flow line 107: Check if handles are opposite
    if (sourceDir[dirAccessor] * targetDir[dirAccessor] === -1) {
      // CASE 1: Opposite handle positions (e.g., Left -> Right, Top -> Bottom)
      // Use Z-shape routing with center point
      //
      // SMART ROUTING: When ports are opposite, we create a "bent" path that routes
      // around potential node collisions. The bend happens at the midpoint, creating
      // a visual "elbow" that clearly shows the connection path.

      let centerX: number, centerY: number;

      if (dirAccessor === 'x') {
        // Horizontal routing (e.g., Left -> Right, Right -> Left)

        // CRITICAL FIX: Detect overshoot scenario
        // When routing right-to-left but sourceGapped is already to the right of targetGapped,
        // using the midpoint would cause the path to overshoot and penetrate the target node.
        // Instead, clamp the bend to the source edge to route around the side.
        const isOvershooting = (sourceDir.x > 0 && sourceGapped.x > targetGapped.x) ||
                               (sourceDir.x < 0 && sourceGapped.x < targetGapped.x);

        if (isOvershooting) {
          // Overshoot detected: Place bend at source edge, not midpoint
          // This makes the path exit the source, turn immediately, and route around the side
          centerX = sourceGapped.x;
        } else {
          // Normal case: Use midpoint
          centerX = (sourceGapped.x + targetGapped.x) / 2;
        }

        // For horizontal routing, we keep Y at source/target levels to create clear steps
        centerY = (sourceGapped.y + targetGapped.y) / 2;
      } else {
        // Vertical routing (e.g., Top -> Bottom, Bottom -> Top)

        // CRITICAL FIX: Detect overshoot scenario for vertical routing
        const isOvershooting = (sourceDir.y > 0 && sourceGapped.y > targetGapped.y) ||
                               (sourceDir.y < 0 && sourceGapped.y < targetGapped.y);

        if (isOvershooting) {
          // Overshoot detected: Place bend at source edge
          centerY = sourceGapped.y;
        } else {
          // Normal case: Use midpoint
          centerY = (sourceGapped.y + targetGapped.y) / 2;
        }

        // For vertical routing, we keep X at source/target levels to create clear steps
        centerX = (sourceGapped.x + targetGapped.x) / 2;
      }

      // React Flow lines 123-140: Choose between vertical and horizontal split
      // This creates the characteristic "step" pattern
      const verticalSplit: Point[] = [
        { x: centerX, y: sourceGapped.y },
        { x: centerX, y: targetGapped.y },
      ];
      const horizontalSplit: Point[] = [
        { x: sourceGapped.x, y: centerY },
        { x: targetGapped.x, y: centerY },
      ];

      if (sourceDir[dirAccessor] === currDir) {
        points = dirAccessor === 'x' ? verticalSplit : horizontalSplit;
      } else {
        points = dirAccessor === 'x' ? horizontalSplit : verticalSplit;
      }
    } else {
      // CASE 2: Same or perpendicular handle positions
      // Use L-shape routing

      // React Flow lines 144-145: Define the two L-shape options
      const sourceTarget: Point[] = [{ x: sourceGapped.x, y: targetGapped.y }];
      const targetSource: Point[] = [{ x: targetGapped.x, y: sourceGapped.y }];

      // React Flow lines 147-151: Choose L-shape direction
      if (dirAccessor === 'x') {
        points = sourceDir.x === currDir ? targetSource : sourceTarget;
      } else {
        points = sourceDir.y === currDir ? sourceTarget : targetSource;
      }

      // React Flow lines 153-165: Handle same position ports that are too close
      if (sourceDirection === targetDirection) {
        const diff = Math.abs(start[dirAccessor] - end[dirAccessor]);

        if (diff <= offset) {
          const gapOffset = Math.min(offset - 1, offset - diff);
          if (sourceDir[dirAccessor] === currDir) {
            sourceGapOffset[dirAccessor] = (sourceGapped[dirAccessor] > start[dirAccessor] ? -1 : 1) * gapOffset;
          } else {
            targetGapOffset[dirAccessor] = (targetGapped[dirAccessor] > end[dirAccessor] ? -1 : 1) * gapOffset;
          }
        }
      }

      // React Flow lines 168-180: Handle mixed handle positions (e.g., Right -> Bottom)
      if (sourceDirection !== targetDirection) {
        const dirAccessorOpposite: 'x' | 'y' = dirAccessor === 'x' ? 'y' : 'x';
        const isSameDir = sourceDir[dirAccessor] === targetDir[dirAccessorOpposite];
        const sourceGtTargetOppo = sourceGapped[dirAccessorOpposite] > targetGapped[dirAccessorOpposite];
        const sourceLtTargetOppo = sourceGapped[dirAccessorOpposite] < targetGapped[dirAccessorOpposite];
        const flipSourceTarget =
          (sourceDir[dirAccessor] === 1 && ((!isSameDir && sourceGtTargetOppo) || (isSameDir && sourceLtTargetOppo))) ||
          (sourceDir[dirAccessor] !== 1 && ((!isSameDir && sourceLtTargetOppo) || (isSameDir && sourceGtTargetOppo)));

        if (flipSourceTarget) {
          points = dirAccessor === 'x' ? sourceTarget : targetSource;
        }
      }
    }

    // Build path points
    const sourceGapPoint = { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y };
    const targetGapPoint = { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y };

    // CRITICAL FIX: Ensure first and last segments are orthogonal
    // Check if start->sourceGapPoint creates a diagonal (non-orthogonal) segment
    const firstSegmentIsOrthogonal = (start.x === sourceGapPoint.x) || (start.y === sourceGapPoint.y);
    const lastSegmentIsOrthogonal = (end.x === targetGapPoint.x) || (end.y === targetGapPoint.y);

    // Build path: only include start/end if they create orthogonal segments
    const pathPoints: RoutePoint[] = [];

    if (firstSegmentIsOrthogonal) {
      pathPoints.push(start);
    }

    pathPoints.push(sourceGapPoint);
    pathPoints.push(...points);
    pathPoints.push(targetGapPoint);

    if (lastSegmentIsOrthogonal) {
      pathPoints.push(end);
    }

    // Snap to grid if specified
    // CRITICAL FIX: Do NOT snap the first and last points (port positions)
    // Only snap intermediate waypoints to prevent mismatch with port positions
    if (gridSize && gridSize > 1) {
      pathPoints.forEach((p, index) => {
        // Skip first and last points - they must stay at exact port positions
        if (index === 0 || index === pathPoints.length - 1) {
          return;
        }

        p.x = Math.round(p.x / gridSize) * gridSize;
        p.y = Math.round(p.y / gridSize) * gridSize;
      });

      // CRITICAL FIX: After grid snapping, ensure first and last segments remain orthogonal
      // Grid snapping intermediate points can create diagonal segments with unsnapped endpoints
      if (pathPoints.length >= 2) {
        // Fix first segment: ensure point[1] is orthogonal to point[0] (start)
        const start = pathPoints[0];
        const firstIntermediate = pathPoints[1];

        const firstIsHorizontal = start.y === firstIntermediate.y;
        const firstIsVertical = start.x === firstIntermediate.x;

        if (!firstIsHorizontal && !firstIsVertical) {
          // Determine which direction to align based on source direction or infer from geometry
          let alignedHorizontally = false;
          let alignedVertically = false;

          if (sourceDirection === 'left' || sourceDirection === 'right') {
            // Horizontal port - make first segment horizontal
            firstIntermediate.y = start.y;
            alignedHorizontally = true;
          } else if (sourceDirection === 'top' || sourceDirection === 'bottom') {
            // Vertical port - make first segment vertical
            firstIntermediate.x = start.x;
            alignedVertically = true;
          } else {
            // Direction unknown - infer from start/end relative positions
            const deltaX = Math.abs(end.x - start.x);
            const deltaY = Math.abs(end.y - start.y);

            if (deltaX > deltaY) {
              firstIntermediate.y = start.y;
              alignedHorizontally = true;
            } else {
              firstIntermediate.x = start.x;
              alignedVertically = true;
            }
          }

          // CRITICAL FIX: Propagate alignment to all intermediate points (not just first one)
          // This fixes the issue where point 2, 3, etc. still have wrong coordinates after grid snap
          if (pathPoints.length > 3) {
            for (let i = 2; i < pathPoints.length - 1; i++) {
              if (alignedHorizontally && pathPoints[i].y !== start.y) {
                pathPoints[i].y = start.y;
              } else if (alignedVertically && pathPoints[i].x !== start.x) {
                pathPoints[i].x = start.x;
              }
            }
          }
        }

        // Fix last segment: ensure point[n-2] is orthogonal to point[n-1] (end)
        if (pathPoints.length >= 3) {
          const end = pathPoints[pathPoints.length - 1];
          const lastIntermediate = pathPoints[pathPoints.length - 2];

          const lastIsHorizontal = lastIntermediate.y === end.y;
          const lastIsVertical = lastIntermediate.x === end.x;

          if (!lastIsHorizontal && !lastIsVertical) {
            // Determine which direction to align based on target direction or infer from geometry
            if (targetDirection === 'left' || targetDirection === 'right') {
              // Horizontal port - make last segment horizontal
              lastIntermediate.y = end.y;
            } else if (targetDirection === 'top' || targetDirection === 'bottom') {
              // Vertical port - make last segment vertical
              lastIntermediate.x = end.x;
            } else {
              // Direction unknown - infer from start/end relative positions
              const deltaX = Math.abs(end.x - start.x);
              const deltaY = Math.abs(end.y - start.y);

              if (deltaX > deltaY) {
                // Endpoints are more horizontally separated - likely horizontal port
                lastIntermediate.y = end.y;
              } else {
                // Endpoints are more vertically separated - likely vertical port
                lastIntermediate.x = end.x;
              }
            }
          }
        }
      }
    }

    // Remove duplicate consecutive points
    const uniquePoints = this.removeDuplicatePoints(pathPoints);

    const totalLength = this.calculatePathLength(uniquePoints);
    const bendCount = uniquePoints.length - 2;

    return {
      points: uniquePoints,
      totalLength,
      bendCount: Math.max(0, bendCount),
      cost: totalLength + bendCount * bendCost,
      segments: this.calculateSegments(uniquePoints),
    };
  }

  /**
   * Check if we can use a direct straight line between ports
   * This happens when ports are aligned and facing each other directly
   */
  private canUseDirectLine(
    start: Point,
    end: Point,
    sourceDirection: 'left' | 'right' | 'top' | 'bottom' | undefined,
    targetDirection: 'left' | 'right' | 'top' | 'bottom' | undefined,
    _sourceOffset: Point,
    _targetOffset: Point
  ): boolean {
    if (!sourceDirection || !targetDirection) return false;

    const tolerance = 2; // pixels

    // Check if horizontally aligned (same Y)
    const horizontallyAligned = Math.abs(start.y - end.y) < tolerance;
    // Check if vertically aligned (same X)
    const verticallyAligned = Math.abs(start.x - end.x) < tolerance;

    // For horizontal alignment, ports should face left/right
    if (horizontallyAligned) {
      const horizontalPorts = (
        (sourceDirection === 'left' || sourceDirection === 'right') &&
        (targetDirection === 'left' || targetDirection === 'right')
      );

      // Check if they face each other
      const facingEachOther = (
        (sourceDirection === 'right' && targetDirection === 'left' && start.x < end.x) ||
        (sourceDirection === 'left' && targetDirection === 'right' && start.x > end.x)
      );

      return horizontalPorts && facingEachOther;
    }

    // For vertical alignment, ports should face top/bottom
    if (verticallyAligned) {
      const verticalPorts = (
        (sourceDirection === 'top' || sourceDirection === 'bottom') &&
        (targetDirection === 'top' || targetDirection === 'bottom')
      );

      // Check if they face each other
      const facingEachOther = (
        (sourceDirection === 'bottom' && targetDirection === 'top' && start.y < end.y) ||
        (sourceDirection === 'top' && targetDirection === 'bottom' && start.y > end.y)
      );

      return verticalPorts && facingEachOther;
    }

    return false;
  }

  /**
   * Simplify orthogonal path by removing redundant collinear points
   * ONLY removes points that are on the same straight line (horizontal or vertical)
   * This preserves proper orthogonal (right-angle) routing
   */
  private simplifyOrthogonalPath(points: RoutePoint[]): RoutePoint[] {
    if (points.length <= 2) return points;

    const simplified: RoutePoint[] = [points[0]];
    const tolerance = 0.1; // Very tight tolerance for orthogonal alignment

    for (let i = 1; i < points.length - 1; i++) {
      const prev = simplified[simplified.length - 1]; // Use last point in simplified array
      const curr = points[i];
      const next = points[i + 1];

      // Check if prev, curr, next are collinear (on same horizontal or vertical line)
      const isHorizontalLine =
        Math.abs(prev.y - curr.y) < tolerance &&
        Math.abs(curr.y - next.y) < tolerance;

      const isVerticalLine =
        Math.abs(prev.x - curr.x) < tolerance &&
        Math.abs(curr.x - next.x) < tolerance;

      // Only skip this point if it's truly collinear (on same straight line)
      // This removes redundant intermediate points but keeps all bends
      if (!isHorizontalLine && !isVerticalLine) {
        simplified.push(curr);
      }
    }

    simplified.push(points[points.length - 1]);

    return simplified;
  }

  /**
   * Apply gap offset in the direction the port points
   */
  private applyGapOffset(
    point: Point,
    direction: 'left' | 'right' | 'top' | 'bottom' | undefined,
    offset: number
  ): Point {
    if (!direction) return point;

    switch (direction) {
      case 'left':
        return { x: point.x - offset, y: point.y };
      case 'right':
        return { x: point.x + offset, y: point.y };
      case 'top':
        return { x: point.x, y: point.y - offset };
      case 'bottom':
        return { x: point.x, y: point.y + offset };
    }
  }

  /**
   * Get direction vector for a port direction (React Flow style)
   */
  private getDirectionVector(direction: 'left' | 'right' | 'top' | 'bottom' | undefined): { x: number; y: number } {
    if (!direction) return { x: 0, y: 0 };

    switch (direction) {
      case 'left':
        return { x: -1, y: 0 };
      case 'right':
        return { x: 1, y: 0 };
      case 'top':
        return { x: 0, y: -1 };
      case 'bottom':
        return { x: 0, y: 1 };
    }
  }

  /**
   * Determine routing direction based on source/target positions (React Flow logic)
   */
  private getRoutingDirection(
    source: Point,
    sourcePosition: 'left' | 'right' | 'top' | 'bottom' | undefined,
    target: Point
  ): { x: number; y: number } {
    if (!sourcePosition) return { x: 1, y: 0 };

    // For horizontal ports (left/right), determine X direction
    if (sourcePosition === 'left' || sourcePosition === 'right') {
      return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
    }

    // For vertical ports (top/bottom), determine Y direction
    return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }

  /**
   * Determine if we need Z-shape routing (vs L-shape)
   * Z-shape is needed when ports point toward each other or in same direction
   */
  private needsZShape(
    sourceDir: 'left' | 'right' | 'top' | 'bottom' | undefined,
    targetDir: 'left' | 'right' | 'top' | 'bottom' | undefined,
    sourceOffset: Point,
    targetOffset: Point
  ): boolean {
    if (!sourceDir || !targetDir) return false;

    // Ports pointing opposite directions (toward each other)
    const oppositeDirections = (
      (sourceDir === 'left' && targetDir === 'right') ||
      (sourceDir === 'right' && targetDir === 'left') ||
      (sourceDir === 'top' && targetDir === 'bottom') ||
      (sourceDir === 'bottom' && targetDir === 'top')
    );

    // Ports pointing same direction
    const sameDirection = sourceDir === targetDir;

    return oppositeDirections || sameDirection;
  }

  /**
   * Calculate L-shape midpoint (one bend)
   */
  private calculateLShapeMidpoint(
    sourceOffset: Point,
    targetOffset: Point,
    sourceDir: 'left' | 'right' | 'top' | 'bottom' | undefined,
    targetDir: 'left' | 'right' | 'top' | 'bottom' | undefined
  ): Point | null {
    // For L-shape, decide whether to go horizontal-then-vertical or vertical-then-horizontal
    // Based on which port direction is dominant

    const isSourceHorizontal = sourceDir === 'left' || sourceDir === 'right';
    const isTargetHorizontal = targetDir === 'left' || targetDir === 'right';

    if (isSourceHorizontal && !isTargetHorizontal) {
      // Source is horizontal, target is vertical: horizontal first
      return { x: targetOffset.x, y: sourceOffset.y };
    } else if (!isSourceHorizontal && isTargetHorizontal) {
      // Source is vertical, target is horizontal: vertical first
      return { x: sourceOffset.x, y: targetOffset.y };
    } else {
      // Both same orientation - choose based on distance
      const dx = Math.abs(targetOffset.x - sourceOffset.x);
      const dy = Math.abs(targetOffset.y - sourceOffset.y);

      if (dx > dy) {
        return { x: targetOffset.x, y: sourceOffset.y };
      } else {
        return { x: sourceOffset.x, y: targetOffset.y };
      }
    }
  }

  /**
   * Calculate Z-shape midpoints (two bends)
   */
  private calculateZShapeMidpoints(
    sourceOffset: Point,
    targetOffset: Point,
    sourceDir: 'left' | 'right' | 'top' | 'bottom' | undefined,
    targetDir: 'left' | 'right' | 'top' | 'bottom' | undefined
  ): Point[] {
    const isSourceHorizontal = sourceDir === 'left' || sourceDir === 'right';

    if (isSourceHorizontal) {
      // Horizontal source: H-V-H routing
      const midX = (sourceOffset.x + targetOffset.x) / 2;
      return [
        { x: midX, y: sourceOffset.y },
        { x: midX, y: targetOffset.y }
      ];
    } else {
      // Vertical source: V-H-V routing
      const midY = (sourceOffset.y + targetOffset.y) / 2;
      return [
        { x: sourceOffset.x, y: midY },
        { x: targetOffset.x, y: midY }
      ];
    }
  }

  /**
   * Orthogonal routing with obstacle avoidance using A*
   */
  private avoidObstaclesRoute(
    start: Point,
    end: Point,
    obstacles: Obstacle[],
    options: any,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom'
  ): RoutedPath | null {
    const gridSize = options.gridSize ?? 10;
    const margin = options.obstacleMargin ?? 20; // Margin around obstacles
    const maxIterations = options.maxIterations ?? 10000;
    const gapOffset = 30; // Distance to move away from port (must be > margin to clear obstacle boundary)

    // Apply gap offset to move away from ports before pathfinding
    // This ensures paths don't start/end directly on node borders
    const sourceOffset = this.applyGapOffset(start, sourceDirection, gapOffset);
    const targetOffset = this.applyGapOffset(end, targetDirection, gapOffset);

    // Snap offset points to grid for A* pathfinding
    let gridStart = this.snapToGrid(sourceOffset, gridSize);
    let gridEnd = this.snapToGrid(targetOffset, gridSize);

    // CRITICAL FIX: Validate start/end points are not inside obstacles
    // If grid snapping moved them into an obstacle, adjust outward
    if (this.collidesWithObstacles(gridStart, obstacles, margin)) {
      console.warn(`⚠️ Grid start point inside obstacle, adjusting...`);
      gridStart = this.findNearestValidPoint(gridStart, sourceDirection, obstacles, margin, gridSize);
    }
    if (this.collidesWithObstacles(gridEnd, obstacles, margin)) {
      console.warn(`⚠️ Grid end point inside obstacle, adjusting...`);
      gridEnd = this.findNearestValidPoint(gridEnd, targetDirection, obstacles, margin, gridSize);
    }

    // Use A* to find path between offset points
    const path = this.aStarPathfinding(
      gridStart,
      gridEnd,
      obstacles,
      gridSize,
      margin,
      maxIterations
    );

    if (!path || path.length === 0) {
      // IMPROVED: Log why pathfinding failed and what we're doing
      console.warn(`⚠️ A* pathfinding failed for link routing:`, {
        start: gridStart,
        end: gridEnd,
        obstacleCount: obstacles.length,
        gridSize,
        margin
      });
      console.warn(`   Falling back to simple orthogonal route (no obstacle avoidance)`);

      // Fallback to simple route if pathfinding fails
      return this.simpleOrthogonalRoute(start, end, gridSize, options.costs?.bends ?? 10, sourceDirection, targetDirection);
    }

    // Prepend actual start point and append actual end point
    // This ensures the path connects to the exact port positions
    const fullPath: RoutePoint[] = [
      { x: start.x, y: start.y },
      ...path,
      { x: end.x, y: end.y }
    ];

    // Remove duplicate consecutive points
    const uniquePath = this.removeDuplicatePoints(fullPath);

    const totalLength = this.calculatePathLength(uniquePath);
    const bendCount = this.countBends(uniquePath);
    const bendCost = options.costs?.bends ?? 10;

    return {
      points: uniquePath,
      totalLength,
      bendCount,
      cost: totalLength + bendCount * bendCost,
      segments: this.calculateSegments(uniquePath),
    };
  }

  /**
   * A* pathfinding on a grid with improved obstacle avoidance
   */
  private aStarPathfinding(
    start: Point,
    end: Point,
    obstacles: Obstacle[],
    gridSize: number,
    margin: number,
    maxIterations: number
  ): RoutePoint[] | null {
    const openSet = new Set<string>();
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, Point>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    const startKey = this.pointToKey(start);
    const endKey = this.pointToKey(end);

    openSet.add(startKey);
    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(start, end));

    let iterations = 0;

    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest fScore
      let currentKey = '';
      let lowestF = Infinity;
      for (const key of openSet) {
        const f = fScore.get(key) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentKey = key;
        }
      }

      if (!currentKey) break;

      const current = this.keyToPoint(currentKey);

      // Reached goal
      if (currentKey === endKey) {
        const path = this.reconstructPath(cameFrom, current);
        // Simplify the A* path to remove unnecessary waypoints
        return this.simplifyOrthogonalPath(path);
      }

      openSet.delete(currentKey);
      closedSet.add(currentKey);

      // Check neighbors (4-directional: up, down, left, right)
      const neighbors = this.getOrthogonalNeighbors(current, gridSize);

      for (const neighbor of neighbors) {
        const neighborKey = this.pointToKey(neighbor);

        if (closedSet.has(neighborKey)) continue;

        // Check if neighbor collides with obstacle
        if (this.collidesWithObstacles(neighbor, obstacles, margin)) {
          closedSet.add(neighborKey);
          continue;
        }

        // Calculate movement cost with penalty for direction changes
        let movementCost = gridSize;

        // Add bend penalty if direction changed from previous segment
        const parent = cameFrom.get(currentKey);
        if (parent) {
          const prevDir = this.getDirection(parent, current);
          const nextDir = this.getDirection(current, neighbor);
          if (prevDir !== nextDir) {
            movementCost += gridSize * 0.5; // Penalty for bends to favor straighter paths
          }
        }

        const tentativeG = (gScore.get(currentKey) ?? Infinity) + movementCost;

        if (!openSet.has(neighborKey)) {
          openSet.add(neighborKey);
        } else if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) {
          continue;
        }

        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + this.heuristic(neighbor, end));
      }
    }

    // No path found
    return null;
  }

  /**
   * Reconstruct path from A* came-from map
   */
  private reconstructPath(cameFrom: Map<string, Point>, current: Point): RoutePoint[] {
    const path: RoutePoint[] = [current];
    let currentKey = this.pointToKey(current);

    while (cameFrom.has(currentKey)) {
      const point = cameFrom.get(currentKey)!;
      path.unshift(point);
      currentKey = this.pointToKey(point);
    }

    return path;
  }

  /**
   * Manhattan distance heuristic
   */
  private heuristic(a: Point, b: Point): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * Get 4-directional orthogonal neighbors
   */
  private getOrthogonalNeighbors(point: Point, gridSize: number): Point[] {
    return [
      { x: point.x + gridSize, y: point.y }, // Right
      { x: point.x - gridSize, y: point.y }, // Left
      { x: point.x, y: point.y + gridSize }, // Down
      { x: point.x, y: point.y - gridSize }, // Up
    ];
  }

  /**
   * Check if point collides with any obstacle
   * FIXED: Use inclusive bounds to prevent paths grazing obstacle edges
   */
  private collidesWithObstacles(
    point: Point,
    obstacles: Obstacle[],
    margin: number
  ): boolean {
    for (const obstacle of obstacles) {
      // Expand obstacle boundaries by margin to create safe zone around obstacles
      const minX = obstacle.x - margin;
      const maxX = obstacle.x + obstacle.width + margin;
      const minY = obstacle.y - margin;
      const maxY = obstacle.y + obstacle.height + margin;

      // FIXED: Use >= and <= (inclusive) instead of > and < (exclusive)
      // This ensures points ON the boundary are also considered colliding
      if (
        point.x >= minX &&
        point.x <= maxX &&
        point.y >= minY &&
        point.y <= maxY
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any segment of the path intersects with obstacles
   * This determines if we need to use A* pathfinding
   */
  private pathIntersectsObstacles(points: Point[], obstacles: Obstacle[]): boolean {
    if (obstacles.length === 0) return false;

    // Check each line segment of the path
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Check if this segment intersects any obstacle
      for (const obstacle of obstacles) {
        const rect = {
          x: obstacle.x,
          y: obstacle.y,
          width: obstacle.width,
          height: obstacle.height
        };
        if (this.lineIntersectsRectangle(p1, p2, rect)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a line segment intersects with a rectangle
   */
  private lineIntersectsRectangle(
    p1: Point,
    p2: Point,
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;

    // Check if either endpoint is inside the rectangle
    if (this.pointInRectangle(p1, rect) || this.pointInRectangle(p2, rect)) {
      return true;
    }

    // Check intersection with each edge of the rectangle
    const edges = [
      { x1: left, y1: top, x2: right, y2: top },     // top edge
      { x1: right, y1: top, x2: right, y2: bottom }, // right edge
      { x1: left, y1: bottom, x2: right, y2: bottom }, // bottom edge
      { x1: left, y1: top, x2: left, y2: bottom },   // left edge
    ];

    for (const edge of edges) {
      if (this.lineSegmentsIntersect(p1, p2, { x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 })) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a point is inside a rectangle
   */
  private pointInRectangle(p: Point, rect: { x: number; y: number; width: number; height: number }): boolean {
    return (
      p.x >= rect.x &&
      p.x <= rect.x + rect.width &&
      p.y >= rect.y &&
      p.y <= rect.y + rect.height
    );
  }

  /**
   * Check if two line segments intersect
   * Using the cross product method
   */
  private lineSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const ccw = (a: Point, b: Point, c: Point) => {
      return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    };

    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  /**
   * Snap point to grid
   */
  private snapToGrid(point: Point, gridSize: number): Point {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  /**
   * Find nearest valid point outside obstacles
   * Searches outward from point in the given direction until finding a valid position
   */
  private findNearestValidPoint(
    point: Point,
    direction: 'left' | 'right' | 'top' | 'bottom' | undefined,
    obstacles: Obstacle[],
    margin: number,
    gridSize: number
  ): Point {
    // Try moving outward in the port direction to find a valid point
    const maxAttempts = 10;
    let current = { ...point };

    for (let i = 1; i <= maxAttempts; i++) {
      // Move one grid step in the port direction
      switch (direction) {
        case 'left':
          current.x -= gridSize;
          break;
        case 'right':
          current.x += gridSize;
          break;
        case 'top':
          current.y -= gridSize;
          break;
        case 'bottom':
          current.y += gridSize;
          break;
        default:
          // No direction specified, try moving in all directions
          const candidates = [
            { x: point.x + i * gridSize, y: point.y },
            { x: point.x - i * gridSize, y: point.y },
            { x: point.x, y: point.y + i * gridSize },
            { x: point.x, y: point.y - i * gridSize },
          ];

          for (const candidate of candidates) {
            if (!this.collidesWithObstacles(candidate, obstacles, margin)) {
              return candidate;
            }
          }
          continue;
      }

      // Check if this position is valid
      if (!this.collidesWithObstacles(current, obstacles, margin)) {
        return current;
      }
    }

    // If all attempts failed, return original point (pathfinding will fail, but at least we tried)
    console.warn(`   ✗ Could not find valid point after ${maxAttempts} attempts, using original`);
    return point;
  }

  /**
   * Convert point to map key
   */
  private pointToKey(point: Point): string {
    return `${point.x},${point.y}`;
  }

  /**
   * Convert map key to point
   */
  private keyToPoint(key: string): Point {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  /**
   * Calculate total path length
   */
  private calculatePathLength(points: Point[]): number {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  /**
   * Count bends in path
   */
  private countBends(points: Point[]): number {
    if (points.length < 3) return 0;

    let bends = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      // Check if direction changed
      const dir1 = this.getDirection(prev, curr);
      const dir2 = this.getDirection(curr, next);

      if (dir1 !== dir2) {
        bends++;
      }
    }

    return bends;
  }

  /**
   * Get direction between two points ('h' or 'v')
   */
  private getDirection(a: Point, b: Point): 'h' | 'v' {
    return Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'h' : 'v';
  }

  /**
   * Remove duplicate consecutive points
   */
  private removeDuplicatePoints(points: Point[]): RoutePoint[] {
    const result: RoutePoint[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i === 0 || points[i].x !== points[i - 1].x || points[i].y !== points[i - 1].y) {
        result.push({ ...points[i] });
      }
    }
    return result;
  }

  /**
   * Calculate segments from points
   */
  private calculateSegments(points: Point[]): any[] {
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      segments.push({
        start: { ...start },
        end: { ...end },
        length,
        angle,
      });
    }
    return segments;
  }
}
