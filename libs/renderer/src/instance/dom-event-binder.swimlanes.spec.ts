// Swimlanes under a real hand — the gestures the swimlanes demo promised and
// did not keep (live report: "I don't see it working properly"). Measured on
// grafloria.com before this: a ticket dragged from "In progress" into "Done"
// stayed a member of "In progress"; dragged out of the pool it stayed a member
// too, outside every lane; and a lane could be dragged on its own, on top of its
// neighbour. Driven through the SAME DomEventBinder an embed uses.
import { DiagramEngine, GroupModel, SwimlaneService, GroupCollapseService } from '@grafloria/engine';
import type { DiagramModel } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyNodes } from './model-input';

const WIDTH = 1400;
const HEIGHT = 900;

function harness() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);
  const engine = new DiagramEngine();
  const model = engine.createDiagram('t');
  engine.setInteractionConfig({ enableGroupDrag: true, enableGroupMembershipOnDrop: true } as never);
  const viewport = new ViewportController({ viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const host: DomEventBinderHost = {
    getEngine: () => engine,
    viewport,
    interaction: new InteractionController(),
    getRect: () => container.getBoundingClientRect(),
    requestRender: () => {},
    emit: () => {},
  };
  const binder = new DomEventBinder(container, host, {});
  binder.attach();
  return { container, engine, model, destroy() { binder.detach(); engine.destroy(); container.remove(); } };
}
type H = ReturnType<typeof harness>;

const mouse = (type: string, x: number, y: number) =>
  new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
/** A hand-speed drag: press, a few moves, release (world = client here). */
function drag(h: H, from: { x: number; y: number }, to: { x: number; y: number }) {
  h.container.dispatchEvent(mouse('mousedown', from.x, from.y));
  for (let i = 1; i <= 6; i++) {
    h.container.dispatchEvent(mouse('mousemove', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6));
  }
  h.container.dispatchEvent(mouse('mouseup', to.x, to.y));
}
const centre = (m: DiagramModel, id: string) => {
  const n = m.getNode(id)!;
  return { x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 };
};
const inside = (m: DiagramModel, id: string, r: { x: number; y: number; width: number; height: number }) => {
  const n = m.getNode(id)!;
  return n.position.x >= r.x - 0.5 && n.position.y >= r.y - 0.5 &&
    n.position.x + n.size.width <= r.x + r.width + 0.5 && n.position.y + n.size.height <= r.y + r.height + 0.5;
};

function pool(h: H) {
  applyNodes(h.model, [{ id: 't', position: { x: 300, y: 260 }, size: { width: 120, height: 50 } }]);
  const svc = new SwimlaneService(h.model);
  const made = svc.createPool({
    name: 'Delivery', orientation: 'horizontal',
    bounds: { x: 60, y: 60, width: 1000, height: 480 },
    lanes: [{ name: 'Backlog' }, { name: 'In progress', weight: 2 }, { name: 'Done' }],
    headerSize: 40,
  });
  made.lanes[1]!.addMember('t', h.model);
  return made;
}

describe('swimlanes under a real hand', () => {
  let h: H;
  afterEach(() => h?.destroy());

  it('a ticket dragged far below the pool stays inside the pool — it cannot leave its lanes', async () => {
    h = harness();
    const { lanes } = pool(h);
    drag(h, centre(h.model, 't'), { x: 600, y: 860 });
    await flush();
    const last = lanes[2]!.getInnerBounds();
    const t = h.model.getNode('t')!;
    expect(t.position.y + t.size.height).toBeLessThanOrEqual(last.y + last.height + 0.5);
    expect(lanes.some((l) => l.members.has('t'))).toBe(true);
  });

  it('dragged from "In progress" into "Done" it becomes a member of Done, fully inside it', async () => {
    h = harness();
    const { lanes } = pool(h);
    const done = lanes[2]!.getOuterBounds();
    drag(h, centre(h.model, 't'), { x: 600, y: done.y + 20 }); // centre just inside Done: the box straddles the line
    await flush();
    expect(lanes[2]!.members.has('t')).toBe(true);
    expect(lanes[1]!.members.has('t')).toBe(false);
    expect(inside(h.model, 't', lanes[2]!.getInnerBounds())).toBe(true);
  });

  it('pressing on a lane drags the whole POOL — lanes stay tiled, tickets ride along', async () => {
    h = harness();
    const { pool: p, lanes } = pool(h);
    const before = p.getOuterBounds(), t0 = { ...h.model.getNode('t')!.position };
    const backlog = lanes[0]!.getOuterBounds();
    const press = { x: backlog.x + 500, y: backlog.y + backlog.height / 2 }; // empty Backlog area
    drag(h, press, { x: press.x + 100, y: press.y + 60 });
    await flush();
    const after = p.getOuterBounds();
    expect(after.x).toBeCloseTo(before.x + 100);
    expect(after.y).toBeCloseTo(before.y + 60);
    const b = lanes.map((l) => l.getOuterBounds());
    expect(b[0]!.y).toBeCloseTo(after.y);
    expect(b[1]!.y).toBeCloseTo(b[0]!.y + b[0]!.height);
    expect(b[2]!.y).toBeCloseTo(b[1]!.y + b[1]!.height);
    expect(h.model.getNode('t')!.position.x).toBeCloseTo(t0.x + 100);
  });

  it('a FULL lane refuses the ticket: it goes back where it came from, still in its own lane, and nothing is recorded', async () => {
    // Measured on grafloria.com before this: the refused ticket stayed drawn INSIDE the full lane
    // while it still belonged to the old one (settled into the band first, refused after).
    h = harness();
    const { lanes } = pool(h);
    applyNodes(h.model, [
      { id: 't', position: { x: 300, y: 260 }, size: { width: 120, height: 50 } },
      { id: 'd', position: { x: 700, y: 470 }, size: { width: 120, height: 50 } },
    ]);
    lanes[1]!.addMember('t', h.model);
    lanes[2]!.addMember('d', h.model);
    lanes[2]!.capacity = 1;
    const t0 = { ...h.model.getNode('t')!.position };
    const done = lanes[2]!.getOuterBounds();
    drag(h, centre(h.model, 't'), { x: 500, y: done.y + done.height / 2 });
    await flush();
    expect(lanes[2]!.members.has('t')).toBe(false);
    expect(lanes[1]!.members.has('t')).toBe(true);
    expect(h.model.getNode('t')!.position).toMatchObject({ x: t0.x, y: t0.y });
    expect(inside(h.model, 't', lanes[1]!.getInnerBounds())).toBe(true);
    expect(h.engine.commandManager.canUndo()).toBe(false);
  });

  it('two selected tickets dragged into "Done" BOTH join Done, in one undo step', async () => {
    h = harness();
    const { lanes } = pool(h);
    applyNodes(h.model, [
      { id: 't', position: { x: 300, y: 260 }, size: { width: 120, height: 50 } },
      { id: 'u', position: { x: 480, y: 260 }, size: { width: 120, height: 50 } },
    ]);
    lanes[1]!.addMember('t', h.model);
    lanes[1]!.addMember('u', h.model);
    h.model.getNode('t')!.setSelected(true);
    h.model.getNode('u')!.setSelected(true);
    const done = lanes[2]!.getOuterBounds();
    const from = centre(h.model, 't');
    drag(h, from, { x: from.x + 40, y: done.y + done.height / 2 });
    await flush();
    for (const id of ['t', 'u']) {
      expect(lanes[2]!.members.has(id)).toBe(true);
      expect(lanes[1]!.members.has(id)).toBe(false);
      expect(inside(h.model, id, lanes[2]!.getInnerBounds())).toBe(true);
    }
    await h.engine.commandManager.undo();
    await flush();
    for (const id of ['t', 'u']) expect(lanes[1]!.members.has(id)).toBe(true);
    expect(h.engine.commandManager.canUndo()).toBe(false);
  });

  it("pressing a FOLDED lane's band drags the whole pool — the band rides along, lanes stay tiled", async () => {
    h = harness();
    const { pool: p, lanes } = pool(h);
    new GroupCollapseService(h.model).collapse(lanes[0]!);
    const proxy = h.model.getNode(lanes[0]!.collapsedState!.proxyNodeId)!;
    const before = p.getOuterBounds(), band0 = { ...proxy.position };
    const press = { x: proxy.position.x + 300, y: proxy.position.y + proxy.size.height / 2 };
    drag(h, press, { x: press.x + 80, y: press.y + 50 });
    await flush();
    const after = p.getOuterBounds();
    expect(after.x).toBeCloseTo(before.x + 80);
    expect(after.y).toBeCloseTo(before.y + 50);
    expect(proxy.position.x).toBeCloseTo(band0.x + 80);
    expect(proxy.position.y).toBeCloseTo(band0.y + 50);
    const b = lanes.map((l) => l.getOuterBounds());
    expect(b[1]!.y).toBeCloseTo(b[0]!.y + b[0]!.height);
    expect(proxy.position.y).toBeCloseTo(b[0]!.y);
  });

  // Lanes by hand. pool(): Backlog 60–180, In progress 180–420, Done 420–540 (x 100–1060).
  it('dragging the line under "Backlog" makes Backlog taller; the pool grows, one undo takes it back', async () => {
    h = harness();
    const { pool: p, lanes } = pool(h);
    const t0 = { ...h.model.getNode('t')!.position };
    drag(h, { x: 600, y: 180 }, { x: 600, y: 240 });
    await flush();
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([180, 240, 120]);
    expect(p.getOuterBounds().height).toBe(540);
    expect(h.model.getNode('t')!.position.y).toBeCloseTo(t0.y + 60);
    await h.engine.commandManager.undo();
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([120, 240, 120]);
    expect(h.engine.commandManager.canUndo()).toBe(false);
  });

  it("dragging the pool's right edge makes every lane longer", async () => {
    h = harness();
    const { lanes } = pool(h);
    drag(h, { x: 1060, y: 300 }, { x: 1160, y: 300 });
    await flush();
    expect(lanes.map((l) => l.getOuterBounds().width)).toEqual([1060, 1060, 1060]);
  });

  it('dragging "Done" by its title up past "Backlog" moves the lane there, ticket order intact', async () => {
    h = harness();
    const { pool: p, lanes } = pool(h);
    drag(h, { x: 600, y: 430 }, { x: 600, y: 70 });
    await flush();
    expect(p.laneConfig!.laneOrder).toEqual([lanes[2]!.id, lanes[0]!.id, lanes[1]!.id]);
    expect(lanes[1]!.members.has('t')).toBe(true);
    expect(inside(h.model, 't', lanes[1]!.getInnerBounds())).toBe(true);
  });

  it('the cursor shows a lane handle before the press: row-resize on a border, grab on a title', () => {
    h = harness();
    pool(h);
    h.container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: 181 }));
    expect(h.container.style.cursor).toBe('row-resize');
    h.container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: 195 }));
    expect(h.container.style.cursor).toBe('grab');
    h.container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: 300 }));
    expect(h.container.style.cursor).not.toBe('row-resize');
  });

  it('Escape in the middle of a border drag puts the pool back', async () => {
    h = harness();
    const { pool: p } = pool(h);
    h.container.dispatchEvent(mouse('mousedown', 600, 180));
    for (let i = 1; i <= 4; i++) h.container.dispatchEvent(mouse('mousemove', 600, 180 + i * 15));
    expect(p.getOuterBounds().height).toBeGreaterThan(480);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    h.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    h.container.dispatchEvent(mouse('mouseup', 600, 240));
    await flush();
    expect(p.getOuterBounds().height).toBe(480);
    expect(h.engine.commandManager.canUndo()).toBe(false);
  });

  it('a member of a plain confining group cannot be dragged out of it', async () => {
    h = harness();
    applyNodes(h.model, [{ id: 'n', position: { x: 420, y: 220 }, size: { width: 80, height: 40 } }]);
    const g = new GroupModel({ name: 'box' });
    h.model.addGroup(g);
    g.setFrame({ x: 380, y: 180, width: 300, height: 160 });
    g.constrainChildren = true;
    g.addMember('n', h.model);
    drag(h, centre(h.model, 'n'), { x: 1100, y: 700 });
    await flush();
    expect(inside(h.model, 'n', g.getInnerBounds())).toBe(true);
    expect(g.members.has('n')).toBe(true);
  });

  it('a member of a group that does NOT confine can still be dragged out and released', async () => {
    h = harness();
    applyNodes(h.model, [{ id: 'n', position: { x: 420, y: 220 }, size: { width: 80, height: 40 } }]);
    const g = new GroupModel({ name: 'loose' });
    h.model.addGroup(g);
    g.setFrame({ x: 380, y: 180, width: 300, height: 160 });
    g.addMember('n', h.model);
    drag(h, centre(h.model, 'n'), { x: 1100, y: 700 });
    await flush();
    expect(h.model.getNode('n')!.position.x).toBeGreaterThan(900);
    expect(g.members.has('n')).toBe(false);
  });
});
