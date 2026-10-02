// Swimlanes under a real hand — the gestures the swimlanes demo promised and
// did not keep (live report: "I don't see it working properly"). Measured on
// grafloria.com before this: a ticket dragged from "In progress" into "Done"
// stayed a member of "In progress"; dragged out of the pool it stayed a member
// too, outside every lane; and a lane could be dragged on its own, on top of its
// neighbour. Driven through the SAME DomEventBinder an embed uses.
import { DiagramEngine, GroupModel, SwimlaneService } from '@grafloria/engine';
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
