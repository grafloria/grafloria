// The `avoid` (a-star) router must route a link whose OWN end nodes are in the
// obstacle set — which is how the renderer always calls it.
//
// The docs review found A* returning null for the plainest case: A and B with a
// wall between them. A link's ports sit on its nodes' edges, so with the 5px
// obstacle margin the start lies inside A's inflated box and the goal inside
// B's: every first step collides and the goal can never be entered. The search
// failed, and the renderer's fallback drew a straight line through the wall.
//
// The contract pinned here: the end nodes never block the search NEAR their
// ports, but stay solid everywhere else (a port on the far side still has to go
// around its own node), and other obstacles are always respected — tight gaps
// included.
import { RoutingEngine } from './RoutingEngine';
import type { Obstacle } from './types';

type Pt = { x: number; y: number };

/** Length of the polyline that runs strictly inside `o` (shrunk by `inset`). */
function insideLength(points: Pt[], o: Obstacle, inset = 1): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(seg));
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (x > o.x + inset && x < o.x + o.width - inset && y > o.y + inset && y < o.y + o.height - inset) {
        len += seg / steps;
      }
    }
  }
  return len;
}

const A: Obstacle = { id: 'a', x: 80, y: 305, width: 120, height: 60 };
const B: Obstacle = { id: 'b', x: 840, y: 305, width: 120, height: 60 };
const WALL: Obstacle = { id: 'o', x: 430, y: 250, width: 140, height: 170 };

function route(start: Pt, end: Pt, obstacles: Obstacle[]) {
  return new RoutingEngine().route({ start, end, obstacles, options: { algorithm: 'a-star' } });
}

describe('a-star with the link\'s own end nodes in the obstacle set', () => {
  it('finds a route around a wall between A and B (the docs-review case)', () => {
    // Ports: A's right edge, B's left edge — exactly what the renderer sends.
    const path = route({ x: 200, y: 335 }, { x: 840, y: 335 }, [A, B, WALL]);

    expect(path).not.toBeNull();
    const pts = path!.points;
    expect(pts[0]).toEqual({ x: 200, y: 335 });
    expect(pts[pts.length - 1]).toEqual({ x: 840, y: 335 });
    expect(insideLength(pts, WALL)).toBe(0);
    // …and it does not cut through its own nodes to get there.
    expect(insideLength(pts, A)).toBe(0);
    expect(insideLength(pts, B)).toBe(0);
  });

  it('still goes AROUND its own node when the port faces away from the target', () => {
    // A's port is on its LEFT edge; B is to the right. Near the port A must not
    // block the search, but the route may not take the shortcut through A.
    const path = route({ x: 80, y: 335 }, { x: 840, y: 335 }, [A, B]);

    expect(path).not.toBeNull();
    expect(insideLength(path!.points, A)).toBe(0);
    expect(insideLength(path!.points, B)).toBe(0);
  });

  it('threads a tight gap between two obstacles when that is the way through', () => {
    // A tall wall split by a 30px gap on the line; going round the ends is far.
    const top: Obstacle = { id: 't', x: 480, y: -400, width: 40, height: 720 };
    const bottom: Obstacle = { id: 'u', x: 480, y: 350, width: 40, height: 720 };
    const path = route({ x: 200, y: 335 }, { x: 840, y: 335 }, [A, B, top, bottom]);

    expect(path).not.toBeNull();
    expect(insideLength(path!.points, top)).toBe(0);
    expect(insideLength(path!.points, bottom)).toBe(0);
    // Through the gap, not round the ends of a 1,470px wall.
    const ys = path!.points.map(p => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(250);
    expect(Math.max(...ys)).toBeLessThan(420);
  });

  it('goes around, never through, when a gap is too tight to pass', () => {
    const top: Obstacle = { id: 't', x: 480, y: 150, width: 40, height: 182 };
    const bottom: Obstacle = { id: 'u', x: 480, y: 336, width: 40, height: 182 }; // 4px gap
    const path = route({ x: 200, y: 335 }, { x: 840, y: 335 }, [A, B, top, bottom]);

    expect(path).not.toBeNull();
    expect(insideLength(path!.points, top)).toBe(0);
    expect(insideLength(path!.points, bottom)).toBe(0);
  });

  it('escapes a port with an obstacle standing just in front of it', () => {
    // The wall is 20px from A's port; the route has to turn almost at once.
    const near: Obstacle = { id: 'n', x: 220, y: 280, width: 40, height: 110 };
    const path = route({ x: 200, y: 335 }, { x: 840, y: 335 }, [A, B, near]);

    expect(path).not.toBeNull();
    expect(insideLength(path!.points, near)).toBe(0);
    expect(insideLength(path!.points, A)).toBe(0);
  });
});
