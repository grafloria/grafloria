// Camera fast path — the RENDERER's half: FrameCoverage.
//
// The contract under test: after a live render(), getFrameCoverage() describes
// exactly what that frame drew — the overscanned cull rect, the zoom it was
// drawn at, and whether the frame was TOTAL (every node and link admitted, no
// optional layer present). The host's camera fast path stakes visual
// correctness on these fields: an over-wide rect or a false `total` would let
// a pan reveal a hole that was never rendered.

import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel, GroupModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };
/** Must mirror SVGRenderer.CAMERA_OVERSCAN — the assertions spell the numbers out. */
const OVERSCAN = 0.25;

function scene(positions: Array<[string, number, number]>): {
  engine: DiagramEngine;
  diagram: DiagramModel;
  renderer: SVGRenderer;
} {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('camera-coverage')!;

  for (const [id, x, y] of positions) {
    const node = new NodeModel({
      type: 'basic',
      position: { x, y },
      size: { width: 120, height: 60 },
    });
    (node as unknown as { id: string }).id = id;
    node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    diagram.addNode(node);
  }

  return { engine, diagram, renderer: new SVGRenderer(engine, {}) };
}

describe('SVGRenderer — frame coverage (camera fast path)', () => {
  it('records the overscanned cull rect and the zoom of the frame', () => {
    const { renderer } = scene([
      ['a', 100, 100],
      ['b', 400, 100],
    ]);
    renderer.render(VIEWPORT, 1);

    const cov = renderer.getFrameCoverage()!;
    expect(cov).toBeTruthy();
    // viewBox at zoom 1 is the viewport itself; the rect adds 25% per side.
    expect(cov.rect).toEqual({
      x: -VIEWPORT.width * OVERSCAN,
      y: -VIEWPORT.height * OVERSCAN,
      width: VIEWPORT.width * (1 + OVERSCAN * 2),
      height: VIEWPORT.height * (1 + OVERSCAN * 2),
    });
    expect(cov.zoom).toBe(1);
    expect(cov.viewBoxWidth).toBe(VIEWPORT.width);
    expect(cov.viewBoxHeight).toBe(VIEWPORT.height);
    renderer.dispose();
  });

  it('coverage follows the zoomed viewBox, not the raw viewport', () => {
    const { renderer } = scene([['a', 300, 250]]);
    renderer.render(VIEWPORT, 2);

    const cov = renderer.getFrameCoverage()!;
    // Centre-preserving zoom: centre (400,300), box 400×300 at (200,150).
    expect(cov.zoom).toBe(2);
    expect(cov.viewBoxWidth).toBe(400);
    expect(cov.viewBoxHeight).toBe(300);
    expect(cov.rect).toEqual({ x: 100, y: 75, width: 600, height: 450 });
    renderer.dispose();
  });

  it('is TOTAL when every node and link was admitted and no optional layer exists', () => {
    const { diagram, renderer } = scene([
      ['a', 100, 100],
      ['b', 400, 100],
    ]);
    const link = new LinkModel('a-out', 'b-in', 'orthogonal');
    (link as unknown as { id: string }).id = 'ab';
    diagram.addLink(link);

    renderer.render(VIEWPORT, 1);
    expect(renderer.getFrameCoverage()!.total).toBe(true);
    renderer.dispose();
  });

  it('is NOT total when culling dropped a far-away node', () => {
    const { renderer } = scene([
      ['a', 100, 100],
      ['far', 50000, 50000],
    ]);
    renderer.render(VIEWPORT, 1);

    const cov = renderer.getFrameCoverage()!;
    expect(cov.total).toBe(false);
    renderer.dispose();
  });

  it('is NOT total when a groups layer exists — optional layers cull by their own bounds', () => {
    const { diagram, renderer } = scene([
      ['a', 100, 100],
      ['b', 400, 100],
    ]);
    const g = new GroupModel({ name: 'G' });
    diagram.addGroup(g);
    g.setFrame({ x: 80, y: 80, width: 500, height: 160 });
    g.addMember('a', diagram);
    g.addMember('b', diagram);

    renderer.render(VIEWPORT, 1);
    expect(renderer.getFrameCoverage()!.total).toBe(false);
    renderer.dispose();
  });

  it('is null when there is no diagram to draw', () => {
    const renderer = new SVGRenderer(new DiagramEngine(), {});
    renderer.render(VIEWPORT, 1);
    expect(renderer.getFrameCoverage()).toBeNull();
    renderer.dispose();
  });

  it('a later render at another viewport OVERWRITES it — hosts must capture per paint', () => {
    const { renderer } = scene([['a', 100, 100]]);
    renderer.render(VIEWPORT, 1);
    const first = renderer.getFrameCoverage()!;

    renderer.render({ x: 3000, y: 3000, width: 800, height: 600 }, 1);
    const second = renderer.getFrameCoverage()!;

    // This is the documented sharp edge of getFrameCoverage(): the field
    // describes whatever rendered LAST (exports run through the same pass), so
    // createDiagram's paint() takes its own copy immediately after render().
    expect(second.rect.x).toBe(3000 - 800 * OVERSCAN);
    expect(second.rect).not.toEqual(first.rect);
    renderer.dispose();
  });
});
