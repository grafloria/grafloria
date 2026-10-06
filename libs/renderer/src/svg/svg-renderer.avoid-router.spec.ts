// `router: 'avoid'` end to end through the renderer.
//
// The docs review drew A and B with a wall between them and got the straight
// line [[200,335],[840,335]] straight THROUGH the wall: A* failed (it counted
// the link's own nodes as obstacles) and the renderer's fallback was
// `orthogonal` with obstacle avoidance switched OFF. Whatever the search does,
// the fallback must not cut through an obstacle when a route around it exists.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';

const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };
type Pt = { x: number; y: number };

/** Length of the polyline strictly inside the node's body (shrunk by 1px). */
function insideLength(points: Pt[], n: NodeModel): number {
  const o = { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(seg));
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (x > o.x + 1 && x < o.x + o.w - 1 && y > o.y + 1 && y < o.y + o.h - 1) len += seg / steps;
    }
  }
  return len;
}

describe("SVGRenderer — router 'avoid' never draws through an obstacle", () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let a: NodeModel;
  let b: NodeModel;
  let wall: NodeModel;
  let link: LinkModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('avoid')!;
    renderer = new SVGRenderer(engine, {});
    // The docs-review geometry.
    a = new NodeModel({ id: 'a', type: 'basic', position: { x: 80, y: 305 }, size: { width: 120, height: 60 } });
    a.addPort(new PortModel({ id: 'a-out', type: 'output', side: 'right' }));
    b = new NodeModel({ id: 'b', type: 'basic', position: { x: 840, y: 305 }, size: { width: 120, height: 60 } });
    b.addPort(new PortModel({ id: 'b-in', type: 'input', side: 'left' }));
    wall = new NodeModel({ id: 'o', type: 'basic', position: { x: 430, y: 250 }, size: { width: 140, height: 170 } });
    diagram.addNode(a);
    diagram.addNode(b);
    diagram.addNode(wall);
    link = new LinkModel('a-out', 'b-in');
    link.setRouter('avoid');
    diagram.addLink(link);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    renderer?.dispose();
    engine.destroy();
  });

  const render = () => renderer.render(VIEWPORT, 1.0);
  const route = () => link.points.map(p => ({ x: p.x, y: p.y }));

  it('routes around a wall between the two nodes', () => {
    render();
    const pts = route();
    expect(pts.length).toBeGreaterThan(2);
    expect(insideLength(pts, wall)).toBe(0);
    expect(insideLength(pts, a)).toBe(0);
    expect(insideLength(pts, b)).toBe(0);
  });

  it('when the A* search fails, the fallback still goes around the wall', () => {
    // Force the search to fail the way it did in the review; every other
    // algorithm runs for real.
    const routing = engine.getRoutingEngine();
    const real = routing.route.bind(routing);
    jest.spyOn(routing, 'route').mockImplementation(req =>
      req.options?.algorithm === 'a-star' ? null : real(req));

    render();
    const pts = route();
    expect(pts.length).toBeGreaterThan(2);
    expect(insideLength(pts, wall)).toBe(0);
  });

  it('a wall too big for the search to get round falls back to a detour, not a chord', () => {
    // 1,000px tall: A* exhausts its iteration budget and returns nothing.
    wall.setPosition(300, -200);
    wall.setSize(300, 1000);

    render();
    const pts = route();
    expect(insideLength(pts, wall)).toBe(0);
  });

  it('re-routes when the obstacle moves, and straightens when it leaves', () => {
    render();
    const first = route();
    expect(insideLength(first, wall)).toBe(0);

    // Drop the wall onto the side the first detour took.
    const detourBelow = Math.max(...first.map(p => p.y)) > 365;
    wall.setPosition(430, detourBelow ? 350 : 150);
    render();
    const second = route();
    expect(insideLength(second, wall)).toBe(0);

    // Out of the corridor entirely: the route straightens to the chord.
    wall.setPosition(430, 600);
    render();
    const third = route();
    expect(insideLength(third, wall)).toBe(0);
    for (const p of third) expect(p.y).toBeCloseTo(third[0].y, 0);
  });

  it('threads a tight gap between two obstacles', () => {
    // Split the wall: two tall halves with a 30px gap on the line.
    wall.setPosition(480, -400);
    wall.setSize(40, 720);
    const lower = new NodeModel({ id: 'o2', type: 'basic', position: { x: 480, y: 350 }, size: { width: 40, height: 720 } });
    diagram.addNode(lower);

    render();
    const pts = route();
    expect(insideLength(pts, wall)).toBe(0);
    expect(insideLength(pts, lower)).toBe(0);
    for (const p of pts) {
      expect(p.y).toBeGreaterThan(250);
      expect(p.y).toBeLessThan(420);
    }
  });

  it('rounds its corners ON the route: a slanted corner gets no hook', () => {
    // An A* route has slanted segments. The rounded connector assumed every
    // corner joins a horizontal and a vertical segment, so at a slanted one it
    // stepped off the route with a short axis-aligned stub before the curve —
    // a visible hook at every corner of an `avoid` line.
    const root = render() as any;
    const pts = route();
    expect(pts.length).toBeGreaterThan(2);
    const find = (v: any): any => {
      if (!v || typeof v !== 'object') return undefined;
      if (v.key === `link-${link.id}`) return v;
      for (const c of v.children ?? []) { const f = find(c); if (f) return f; }
      return undefined;
    };
    const group = find(root);
    const path = (group?.children ?? []).find(
      (c: any) => c?.type === 'path' && c.props?.className !== 'link-hit-area');
    const d = String(path?.props?.d ?? '');

    // Each bend is "L p1 Q corner p2": p1 must lie on the incoming segment and
    // p2 on the outgoing one.
    const nums = (t: string) => t.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const bends = [...d.matchAll(/L\s*([-\d.e]+[\s,]+[-\d.e]+)\s*Q\s*([-\d.e]+[\s,]+[-\d.e]+)[\s,]+([-\d.e]+[\s,]+[-\d.e]+)/g)];
    expect(bends.length).toBe(pts.length - 2);
    const onSegment = (p: number[], a: Pt, b: Pt) => {
      const cross = (b.x - a.x) * (p[1] - a.y) - (b.y - a.y) * (p[0] - a.x);
      return Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y);
    };
    bends.forEach((m, i) => {
      const [p1, corner, p2] = [nums(m[1]), nums(m[2]), nums(m[3])];
      const a = pts[i], b = pts[i + 1], c = pts[i + 2];
      expect(corner[0]).toBeCloseTo(b.x, 3);
      expect(corner[1]).toBeCloseTo(b.y, 3);
      expect(onSegment(p1, a, b)).toBeLessThan(0.01);
      expect(onSegment(p2, b, c)).toBeLessThan(0.01);
    });
  });
});
