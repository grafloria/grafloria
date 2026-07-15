// The `avoid`/a-star router (and dijkstra, and visibility-graph) IGNORED request.obstacles.
// RoutingEngine.route() resolves globals ∪ request into enhancedRequest.obstacles and hands
// it to the adapter — but AStarRouterAdapter.route() calls router.route(start, end) and the
// underlying AStarRouter only ever queries the ObstacleMap it was constructed with. So a link
// routed 'avoid' drew STRAIGHT THROUGH an obstacle that arrived via the request.
import { RoutingEngine } from './RoutingEngine';
import type { RouteRequest, Obstacle } from './types';

/** Does a polyline pass through this rectangle's interior? (segment-vs-rect, sampled) */
function crosses(points: { x: number; y: number }[], o: Obstacle): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = points[i].x + (points[i + 1].x - points[i].x) * t;
      const y = points[i].y + (points[i + 1].y - points[i].y) * t;
      if (x > o.x + 2 && x < o.x + o.width - 2 && y > o.y + 2 && y < o.y + o.height - 2) return true;
    }
  }
  return false;
}

describe('a-star/dijkstra/visibility honor request.obstacles (the avoid-router bug)', () => {
  // A wall dead-centre between start and end, supplied ONLY via request.obstacles.
  const wall: Obstacle = { id: 'wall', x: 90, y: -40, width: 20, height: 200 };
  const request: RouteRequest = {
    start: { x: 0, y: 50 },
    end: { x: 200, y: 50 },
    obstacles: [wall],
  };

  for (const algorithm of ['a-star', 'dijkstra', 'visibility-graph'] as const) {
    it(`${algorithm} routes AROUND a request-supplied obstacle, not through it`, () => {
      const engine = new RoutingEngine();
      const path = engine.route({ ...request, options: { algorithm } });
      expect(path).not.toBeNull();
      expect(crosses(path!.points, wall)).toBe(false);
    });
  }
});
