/**
 * Dragging the EMPTY part of a group frame (or a swimlane) moves the container and
 * everything in it, as one undo step — the JS canvas's `enableGroupDrag` (on by
 * default). The Angular canvas had no frame drag: the press fell through to the
 * marquee and nothing moved.
 */
import { GroupModel, SwimlaneService } from '@grafloria/engine';
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — frame and lane drag', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
  });
  afterEach(() => h.destroy());

  function subflow() {
    h.addNode({ id: 'm1', position: { x: 400, y: 200 }, size: { width: 100, height: 50 } });
    h.addNode({ id: 'm2', position: { x: 560, y: 220 }, size: { width: 100, height: 50 } });
    h.addNode({ id: 'outside', position: { x: 100, y: 500 }, size: { width: 100, height: 50 } });
    const g = new GroupModel({ id: 'g', name: 'Pipeline' });
    h.diagram.addGroup(g);
    g.setFrame({ x: 380, y: 180, width: 300, height: 120 });
    g.addMember('m1', h.diagram);
    g.addMember('m2', h.diagram);
    h.mount();
    return g;
  }

  it('the frame background drags the group, its members follow, one undo puts it back', async () => {
    const g = subflow();
    const m1 = h.diagram.getNode('m1')!, m2 = h.diagram.getNode('m2')!, out = h.diagram.getNode('outside')!;
    const b1 = { ...m1.position }, b2 = { ...m2.position }, bOut = { ...out.position }, bFrame = g.getOuterBounds();

    h.drag(h.client(420, 285), h.client(540, 325)); // empty spot inside the frame
    await settle();

    expect(m1.position.x).toBeCloseTo(b1.x + 120);
    expect(m1.position.y).toBeCloseTo(b1.y + 40);
    expect(m2.position.x).toBeCloseTo(b2.x + 120);
    const f = g.getOuterBounds();
    expect(f.x).toBeCloseTo(bFrame.x + 120);
    expect(f.y).toBeCloseTo(bFrame.y + 40);
    expect(out.position).toEqual(bOut);
    expect(h.canvas.marquee()).toBeNull();

    await h.canvas.undo();
    expect(m1.position).toEqual(b1);
    expect(g.getOuterBounds().x).toBeCloseTo(bFrame.x);
  });

  it('enableGroupDrag: false keeps the old behaviour (nothing moves)', async () => {
    subflow();
    h.engine.setInteractionConfig({ enableGroupDrag: false } as never);
    const before = { ...h.diagram.getNode('m1')!.position };
    h.drag(h.client(420, 285), h.client(540, 285));
    await settle();
    expect(h.diagram.getNode('m1')!.position).toEqual(before);
  });

  it('pressing on a lane drags the whole POOL — lanes stay tiled, tickets ride along', async () => {
    h.addNode({ id: 't', position: { x: 300, y: 260 }, size: { width: 120, height: 50 } });
    const { pool, lanes } = new SwimlaneService(h.diagram).createPool({
      name: 'Delivery', orientation: 'horizontal',
      bounds: { x: 60, y: 60, width: 1000, height: 480 },
      lanes: [{ name: 'Backlog' }, { name: 'In progress', weight: 2 }, { name: 'Done' }],
      headerSize: 40,
    });
    lanes[1]!.addMember('t', h.diagram);
    h.mount();
    const before = pool.getOuterBounds(), t0 = { ...h.diagram.getNode('t')!.position };
    const backlog = lanes[0]!.getOuterBounds();
    const press = { x: backlog.x + 500, y: backlog.y + backlog.height / 2 };

    h.drag(h.client(press.x, press.y), h.client(press.x + 100, press.y + 60));
    await settle();

    const after = pool.getOuterBounds();
    expect(after.x).toBeCloseTo(before.x + 100);
    expect(after.y).toBeCloseTo(before.y + 60);
    const b = lanes.map((l) => l.getOuterBounds());
    expect(b[0]!.y).toBeCloseTo(after.y);
    expect(b[1]!.y).toBeCloseTo(b[0]!.y + b[0]!.height);
    expect(h.diagram.getNode('t')!.position.x).toBeCloseTo(t0.x + 100);
  });
});
