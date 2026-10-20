// A smooth link's spline: through every point (Catmull-Rom, the default), or
// Mermaid's basis curve (LinkStyle.spline: 'basis').
//
// The route below is what a Mermaid import produced for a state diagram: a
// short straight lead out of the box (13 units), then a bend 51 units across.
// A curve THROUGH every point must arrive at the lead's end already heading for
// that bend, so it swings out past the lead and back — a hook at the very end
// of the line. Mermaid draws the same route as a basis curve, which passes near
// its points, stays inside their polygon, and runs straight along the first
// and last legs.
//
// These call the private path functions directly, as the spline-clearance spec
// does: they are the units under test.

import { DiagramEngine } from '@grafloria/engine';
import type { LinkStyle } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';

type P = { x: number; y: number };
const HOOKED: P[] = [
  { x: 301, y: 444 },
  { x: 301, y: 457 },
  { x: 250, y: 480 },
  { x: 250, y: 506 },
  { x: 250, y: 516 },
];

/** A drawn `d` (M, L and C commands) as points, each cubic sampled 16 times. */
function drawnLine(d: string): P[] {
  const out: P[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const n = (args.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (cmd !== 'C') {
      for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
      continue;
    }
    const p = out[out.length - 1];
    const [ax, ay, bx, by, x, y] = n;
    for (let s = 1; s <= 16; s++) {
      const t = s / 16;
      const u = 1 - t;
      out.push({ x: u * u * u * p.x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, y: u * u * u * p.y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y });
    }
  }
  return out;
}

/** How far a polyline's heading turns over its first `span` units, in degrees. */
function startTurn(line: P[], span: number): number {
  let total = 0;
  let walked = 0;
  let heading: number | null = null;
  for (let i = 1; i < line.length && walked < span; i++) {
    const dx = line[i].x - line[i - 1].x;
    const dy = line[i].y - line[i - 1].y;
    const step = Math.hypot(dx, dy);
    if (step < 1e-6) continue;
    walked += step;
    const a = Math.atan2(dy, dx);
    if (heading !== null) {
      let turn = Math.abs(a - heading);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      total += turn;
    }
    heading = a;
  }
  return (total * 180) / Math.PI;
}

describe('SVGRenderer — LinkStyle.spline', () => {
  let renderer: SVGRenderer;
  type Private = {
    generatePathData: (points: P[], segments: undefined, pathType: string, style?: Partial<LinkStyle>) => string;
    catmullRomPath: (points: P[]) => string;
    paintedHitPolyline: (route: P[], pathType: string, s: undefined, t: undefined, avoid: never[], style?: Partial<LinkStyle>) => P[];
  };
  const r = () => renderer as unknown as Private;

  beforeEach(() => {
    const engine = new DiagramEngine();
    engine.createDiagram('spline');
    renderer = new SVGRenderer(engine, {});
  });
  afterEach(() => renderer.dispose());

  it('the default is the curve through every point, byte for byte', () => {
    const through = r().catmullRomPath(HOOKED);
    expect(r().generatePathData(HOOKED, undefined, 'smooth', {})).toBe(through);
    expect(r().generatePathData(HOOKED, undefined, 'smooth', { spline: 'catmull-rom' })).toBe(through);
  });

  it("'basis' starts and ends on the route's ends, straight along its first and last legs", () => {
    const d = r().generatePathData(HOOKED, undefined, 'smooth', { spline: 'basis' });
    expect(d.startsWith('M 301 444 L 301 446.17 C')).toBe(true); // a sixth of the way along the first leg
    expect(d.endsWith('L 250 516')).toBe(true);
    // The last curve ends on the last leg, a sixth of the way back from the end.
    expect(d).toMatch(/, 250 514\.33 L 250 516$/);
  });

  it("'basis' never hooks where the curve through every point does", () => {
    const through = drawnLine(r().generatePathData(HOOKED, undefined, 'smooth', {}));
    const basis = drawnLine(r().generatePathData(HOOKED, undefined, 'smooth', { spline: 'basis' }));
    expect(startTurn(through, 20)).toBeGreaterThan(120); // the hook, on the drawn line
    expect(startTurn(basis, 20)).toBeLessThan(90);
    // …and stays inside the route's own extent: no swing out past the lead.
    for (const p of basis) expect(p.x).toBeLessThanOrEqual(301 + 1e-6);
    expect(Math.max(...through.map((p) => p.x))).toBeGreaterThan(304); // swung ~4 units out past the lead
  });

  it("the hit shape follows the 'basis' curve that is drawn", () => {
    const hit = r().paintedHitPolyline(HOOKED.map((p) => ({ ...p })), 'smooth', undefined, undefined, [], { spline: 'basis' });
    expect(hit.length).toBeGreaterThan(HOOKED.length); // sampled, not the bare route
    for (const p of hit) expect(p.x).toBeLessThanOrEqual(301 + 1e-6);
    expect(hit[hit.length - 1]).toEqual(HOOKED[HOOKED.length - 1]);
  });
});
