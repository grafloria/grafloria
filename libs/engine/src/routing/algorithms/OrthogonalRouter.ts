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

    // Simple orthogonal routing without obstacles
    if (!options.avoidObstacles || obstacles.length === 0) {
      const bendCost = options.costs?.bends ?? 10;
      return this.simpleOrthogonalRoute(start, end, options.gridSize, bendCost, sourceDirection, targetDirection);
    }

    // Complex routing with obstacle avoidance
    return this.avoidObstaclesRoute(start, end, obstacles, options, sourceDirection, targetDirection);
  }

  /**
   * Simple orthogonal route respecting port directions
   * Based on React Flow's getSmoothStepPath approach (without the curve rendering)
   * Ensures first and last segments are perpendicular to ports
   */
  private simpleOrthogonalRoute(
    start: Point,
    end: Point,
    gridSize?: number,
    bendCost = 10,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom'
  ): RoutedPath {
    // Gap offset - distance to move away from port in its direction
    const gapOffset = 30;

    // Calculate offset points (move away from port in the direction it points)
    let sourceOffset = this.applyGapOffset(start, sourceDirection, gapOffset);
    let targetOffset = this.applyGapOffset(end, targetDirection, gapOffset);

    // React Flow algorithm: determine primary direction and routing strategy
    const dir = this.getRoutingDirection(sourceOffset, sourceDirection, targetOffset);
    const dirAccessor = dir.x !== 0 ? 'x' : 'y';

    // Get handle direction vectors
    const sourceDir = this.getDirectionVector(sourceDirection);
    const targetDir = this.getDirectionVector(targetDirection);

    let intermediatePoints: Point[] = [];
    const sourceGapOffset = { x: 0, y: 0 };
    const targetGapOffset = { x: 0, y: 0 };

    // Check if ports are opposite (React Flow logic line 107)
    const areOpposite = sourceDir[dirAccessor] * targetDir[dirAccessor] === -1;

    if (areOpposite) {
      // Opposite handle positions - use Z-shape routing

      if (dirAccessor === 'x') {
        // Horizontal routing (left/right ports)
        const centerX = (sourceOffset.x + targetOffset.x) / 2;
        intermediatePoints = [
          { x: centerX, y: sourceOffset.y },
          { x: centerX, y: targetOffset.y }
        ];
      } else {
        // Vertical routing (top/bottom ports)
        const centerY = (sourceOffset.y + targetOffset.y) / 2;
        intermediatePoints = [
          { x: sourceOffset.x, y: centerY },
          { x: targetOffset.x, y: centerY }
        ];
      }
    } else {
      // Same or perpendicular handle positions - use L-shape routing

      // CRITICAL: Ensure intermediate point aligns with BOTH gap points to prevent diagonal segments
      // The intermediate point must be perpendicular to both source and target
      const isSourceHorizontal = sourceDirection === 'left' || sourceDirection === 'right';
      const isTargetHorizontal = targetDirection === 'left' || targetDirection === 'right';

      if (isSourceHorizontal && !isTargetHorizontal) {
        // Source horizontal, target vertical: go horizontal first, then vertical
        intermediatePoints = [{ x: targetOffset.x, y: sourceOffset.y }];
      } else if (!isSourceHorizontal && isTargetHorizontal) {
        // Source vertical, target horizontal: go vertical first, then horizontal
        intermediatePoints = [{ x: sourceOffset.x, y: targetOffset.y }];
      } else {
        // Both same orientation - use direction accessor
        if (dirAccessor === 'x') {
          intermediatePoints = [{ x: targetOffset.x, y: sourceOffset.y }];
        } else {
          intermediatePoints = [{ x: sourceOffset.x, y: targetOffset.y }];
        }
      }

      // React Flow: Handle same position ports that are too close (lines 153-165)
      if (sourceDirection === targetDirection) {
        const diff = Math.abs(start[dirAccessor] - end[dirAccessor]);

        if (diff <= gapOffset) {
          const additionalGap = Math.min(gapOffset - 1, gapOffset - diff);
          const currDir = dir[dirAccessor];

          if (sourceDir[dirAccessor] === currDir) {
            const sign = sourceOffset[dirAccessor] > start[dirAccessor] ? -1 : 1;
            sourceGapOffset[dirAccessor] = sign * additionalGap;
          } else {
            const sign = targetOffset[dirAccessor] > end[dirAccessor] ? -1 : 1;
            targetGapOffset[dirAccessor] = sign * additionalGap;
          }

        }
      }
    }

    // Apply gap offsets to source/target offset points
    sourceOffset.x += sourceGapOffset.x;
    sourceOffset.y += sourceGapOffset.y;
    targetOffset.x += targetGapOffset.x;
    targetOffset.y += targetGapOffset.y;

    // Build final path ensuring perpendicular segments
    const points: RoutePoint[] = [
      { x: start.x, y: start.y },
      sourceOffset,
      ...intermediatePoints,
      targetOffset,
      { x: end.x, y: end.y }
    ];

    // Snap to grid if specified
    if (gridSize && gridSize > 1) {
      points.forEach((p) => {
        p.x = Math.round(p.x / gridSize) * gridSize;
        p.y = Math.round(p.y / gridSize) * gridSize;
      });
    }

    // Remove duplicate consecutive points
    const uniquePoints = this.removeDuplicatePoints(points);

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
