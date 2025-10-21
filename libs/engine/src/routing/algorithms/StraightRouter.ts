// StraightRouter - Simple straight-line routing

import type { IRouter, RouteRequest, RoutedPath, RoutePoint } from '../types';

/**
 * StraightRouter creates a direct straight line from start to end
 */
export class StraightRouter implements IRouter {
  getName(): string {
    return 'straight';
  }

  route(request: RouteRequest): RoutedPath | null {
    const { start, end } = request;

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

    // Create straight line path
    const points: RoutePoint[] = [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ];

    // Calculate distance
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle in degrees
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    return {
      points,
      totalLength: length,
      bendCount: 0,
      cost: length,
      segments: [
        {
          start: points[0],
          end: points[1],
          length,
          angle: angleDeg,
        },
      ],
    };
  }
}
