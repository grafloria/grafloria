// A smoothed route must not spend the clearance its detour bought.
//
// A multi-point route exists because it was steered AROUND something. Fitting a
// Catmull-Rom spline through its corners pushes the curve OUTSIDE the polyline —
// and the overshoot guard only ever checked the link's OWN two endpoint nodes, so
// the curve was free to bulge straight back into the obstacle the detour was
// avoiding. The sampled curve is written back into `link.points`, so hit-testing
// then agreed with the wrong picture.
//
// The route and the wall below are not invented: they are what the engine
// actually produces for two nodes 3,200 units apart with a stack of boxes
// between them, and the spline through those corners used to reach (1586, 58) —
// squarely inside `w4`.
//
// These call `paintedHitPolyline` DIRECTLY. That is deliberate: it is the
// function the fix changed, and driving it through a full render would not
// reach it — the renderer routes links itself, so a route assigned to
// `link.points` never becomes the one it draws. A test that goes through
// `render()` here passes whether or not the guard is correct, which is worse
// than no test. The end-to-end behaviour is covered by the browser probe that
// found this in the first place.

import { DiagramEngine, DiagramModel, NodeModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';

interface Box { id: string; x: number; y: number; w: number; h: number }

/** The engine's own answer: out along the top, down past the wall, under, and up. */
const ROUTE = [
  { x: 120, y: 30 },
  { x: 1530, y: 30 },
  { x: 1530, y: 360 },
  { x: 3150, y: 360 },
  { x: 3150, y: 30 },
  { x: 3200, y: 30 },
];

function addNode(diagram: DiagramModel, id: string, x: number, y: number, w: number, h: number): NodeModel {
  const node = new NodeModel({ type: 'basic', position: { x, y }, size: { width: w, height: h } });
  (node as unknown as { id: string }).id = id;
  node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  diagram.addNode(node);
  return node;
}

function entersBox(pts: ReadonlyArray<{ x: number; y: number }>, b: Box, inset = 2): boolean {
  return pts.some(
    (p) => p.x > b.x + inset && p.x < b.x + b.w - inset && p.y > b.y + inset && p.y < b.y + b.h - inset
  );
}

describe('SVGRenderer — a smoothed route keeps its clearance', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let walls: Box[];
  let ownNodes: NodeModel[];

  /** `paintedHitPolyline` — private, and the unit actually under test. */
  const smooth = (route: Array<{ x: number; y: number }>) =>
    (
      renderer as unknown as {
        paintedHitPolyline: (
          route: Array<{ x: number; y: number }>,
          pathType: string,
          s: string | undefined,
          t: string | undefined,
          avoid: NodeModel[]
        ) => Array<{ x: number; y: number }>;
      }
    ).paintedHitPolyline(route, 'smooth', 'right', 'left', ownNodes);

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('spline')!;
    renderer = new SVGRenderer(engine, {});

    const a = addNode(diagram, 'a', 0, 0, 120, 60);
    const b = addNode(diagram, 'b', 3200, 0, 120, 60);
    ownNodes = [a, b];

    walls = [];
    for (let i = 0; i < 8; i++) {
      const box: Box = { id: `w${i}`, x: 1560, y: -300 + i * 80, w: 80, h: 60 };
      walls.push(box);
      addNode(diagram, box.id, box.x, box.y, box.w, box.h);
    }
  });

  afterEach(() => renderer.dispose());

  it('does not bulge the curve through a node the route detoured around', () => {
    const painted = smooth(ROUTE.map((p) => ({ ...p })));

    const breached = walls.filter((w) => entersBox(painted, w)).map((w) => w.id);
    expect(breached).toEqual([]);
  });

  it('curves the SAME route once the obstacle is gone', () => {
    // The pair that matters: the fallback must be caused by the wall, not by the
    // guard flattening every bend it sees. A spline is resampled at 8 points per
    // segment; the polyline fallback is returned as-is, so the counts separate.
    const withWall = smooth(ROUTE.map((p) => ({ ...p }))).length;

    for (const w of walls) diagram.removeNode(w.id);
    const withoutWall = smooth(ROUTE.map((p) => ({ ...p }))).length;

    expect(withWall).toBe(ROUTE.length);
    expect(withoutWall).toBeGreaterThan(withWall * 2);
  });
});
