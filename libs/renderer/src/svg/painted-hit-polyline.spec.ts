/**
 * paintedHitPolyline — link.points must describe the PAINTED geometry.
 *
 * Found live (dagre-tree fan-outs, "not always easy to select the line on all
 * its points"): a 2-point smooth link paints a direction-aware cubic that bows
 * up to ~25px away from its chord, but `link.points` — which backs hit-testing,
 * hover, label anchors, toolbar placement and the spatial index — held the raw
 * 2-point route. Everything measured distance to a line nobody could see:
 * mid-curve selectability on the worst edges was 12–20%.
 *
 * The contract locked here: before syncing, the renderer flattens the painted
 * curve into the polyline (mirroring the canvas backend's flattenPath), so the
 * polyline IS the picture. The e2e LINK-SELECT-SPAN check drives the same
 * contract with real clicks at several positions along every gallery page's
 * first link.
 */
import { DiagramEngine } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';

type Pt = { x: number; y: number };

const flatten = (
  renderer: SVGRenderer,
  points: Pt[],
  pathType: string,
  sourceDirection?: string,
  targetDirection?: string
): Pt[] =>
  (renderer as unknown as {
    paintedHitPolyline: (
      p: Pt[],
      t: string,
      s: string | undefined,
      d: string | undefined,
      avoid: unknown[],
      style?: unknown
    ) => Pt[];
  }).paintedHitPolyline(points, pathType, sourceDirection, targetDirection, []);

const maxDeviationFromChord = (poly: Pt[], a: Pt, b: Pt): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.max(...poly.map((p) => Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len));
};

describe('paintedHitPolyline (link.points = painted geometry)', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    engine.createDiagram('painted-hit');
    renderer = new SVGRenderer(engine);
  });

  afterEach(() => {
    engine.destroy();
  });

  it('flattens a 2-point smooth link into a dense polyline ON the painted cubic', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 160, y: 160 };
    // bottom→top is the dagre fan-out shape: control arms leave vertically, the
    // curve bows sideways off the chord.
    const poly = flatten(renderer, [a, b], 'smooth', 'bottom', 'top');

    // Dense — a chord (2 points) here means the flatten was lost again.
    expect(poly.length).toBeGreaterThanOrEqual(10);
    // Endpoints are EXACT: ports, arrows and endpoint handles anchor there.
    expect(poly[0]).toEqual(a);
    expect(poly[poly.length - 1]).toEqual(b);
    // It really is the CURVE: the painted cubic bows well clear of the chord
    // (this is the ~25px the hit-test used to miss by)…
    expect(maxDeviationFromChord(poly, a, b)).toBeGreaterThan(10);
    // …and it is sampled densely enough that segment-distance ≈ curve-distance.
    for (let i = 1; i < poly.length; i++) {
      expect(Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y)).toBeLessThan(30);
    }
  });

  it('degenerate and non-curved inputs pass through untouched', () => {
    const chord: Pt[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    // Orthogonal/direct paths ARE their polyline — nothing to flatten.
    expect(flatten(renderer, chord, 'orthogonal', 'right', 'left')).toBe(chord);
    expect(flatten(renderer, chord, 'direct', 'right', 'left')).toBe(chord);
    // A zero-length smooth link cannot be flattened into anything else.
    const dot: Pt[] = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
    expect(flatten(renderer, dot, 'smooth', 'right', 'left')).toBe(dot);
  });

  it('flattens a multi-point smooth route (curved through waypoints)', () => {
    const route: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 80 },
      { x: 200, y: 0 },
    ];
    const poly = flatten(renderer, route, 'smooth', 'right', 'left');
    // The catmull-rom paint rounds the corner at (100,80); the polyline must
    // carry more than the 3 route points to follow it.
    expect(poly.length).toBeGreaterThan(route.length);
    expect(poly[0]).toEqual(route[0]);
    expect(poly[poly.length - 1]).toEqual(route[route.length - 1]);
  });
});
