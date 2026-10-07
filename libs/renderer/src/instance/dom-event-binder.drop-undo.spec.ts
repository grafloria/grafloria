// A drop that changed what contains a node took TWO or THREE Ctrl+Z presses to
// undo: the move was recorded, then the membership service dispatched its own
// leave / join commands as separate history entries. One gesture is one step.
import { DiagramEngine, GroupModel } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyNodes } from './model-input';

const WIDTH = 1200, HEIGHT = 800;

function harness() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);
  const engine = new DiagramEngine();
  const model = engine.createDiagram('t')!;
  const viewport = new ViewportController({ viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const interaction = new InteractionController();
  const host: DomEventBinderHost = {
    getEngine: () => engine, viewport, interaction,
    getRect: () => container.getBoundingClientRect(),
    requestRender: () => {}, emit: () => {},
  };
  const binder = new DomEventBinder(container, host, {});
  binder.attach();
  return { container, engine, model, destroy() { binder.detach(); engine.destroy(); container.remove(); } };
}

const mouse = (type: string, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, button: 0, ...init });
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise<void>((r) => setTimeout(r, 0)); };

function box(h: ReturnType<typeof harness>, id: string, frame: { x: number; y: number; width: number; height: number }) {
  const g = new GroupModel({ id, name: id });
  h.model.addGroup(g);
  g.setFrame(frame);
  return g;
}

async function drag(h: ReturnType<typeof harness>, from: { x: number; y: number }, to: { x: number; y: number }) {
  h.container.dispatchEvent(mouse('mousedown', { clientX: from.x, clientY: from.y }));
  for (let i = 1; i <= 4; i++) {
    h.container.dispatchEvent(mouse('mousemove', { clientX: from.x + ((to.x - from.x) * i) / 4, clientY: from.y + ((to.y - from.y) * i) / 4 }));
  }
  h.container.dispatchEvent(mouse('mouseup', { clientX: to.x, clientY: to.y }));
  await settle();
}

describe('a drop that changes what contains a node is ONE undo step', () => {
  let h: ReturnType<typeof harness>;
  afterEach(() => h?.destroy());

  it('dropped out of its container onto empty canvas: one undo puts it back, inside, where it was', async () => {
    h = harness();
    applyNodes(h.model, [{ id: 'n1', position: { x: 140, y: 140 }, size: { width: 100, height: 50 } }]);
    const billing = box(h, 'billing', { x: 100, y: 100, width: 300, height: 200 });
    billing.addMember('n1', h.model);

    await drag(h, { x: 190, y: 165 }, { x: 790, y: 565 });
    expect(billing.members.has('n1')).toBe(false);

    await h.engine.undo();
    expect(billing.members.has('n1')).toBe(true);
    expect(h.model.getNode('n1')!.position.x).toBeCloseTo(140, 0);
    expect(h.model.getNode('n1')!.position.y).toBeCloseTo(140, 0);

    await h.engine.redo();
    expect(billing.members.has('n1')).toBe(false);
    expect(h.model.getNode('n1')!.position.x).toBeCloseTo(740, 0);
  });

  it('dropped from one container into another: one undo restores the first, at the start', async () => {
    h = harness();
    applyNodes(h.model, [{ id: 'n1', position: { x: 140, y: 140 }, size: { width: 100, height: 50 } }]);
    const billing = box(h, 'billing', { x: 100, y: 100, width: 300, height: 200 });
    const archive = box(h, 'archive', { x: 600, y: 100, width: 300, height: 200 });
    billing.addMember('n1', h.model);

    await drag(h, { x: 190, y: 165 }, { x: 740, y: 215 });
    expect(archive.members.has('n1')).toBe(true);
    expect(billing.members.has('n1')).toBe(false);

    await h.engine.undo();
    expect(billing.members.has('n1')).toBe(true);
    expect(archive.members.has('n1')).toBe(false);
    expect(h.model.getNode('n1')!.position.x).toBeCloseTo(140, 0);
  });

  it('a plain move inside its container is still one step and keeps it a member', async () => {
    h = harness();
    applyNodes(h.model, [{ id: 'n1', position: { x: 140, y: 140 }, size: { width: 100, height: 50 } }]);
    const billing = box(h, 'billing', { x: 100, y: 100, width: 300, height: 200 });
    billing.addMember('n1', h.model);

    await drag(h, { x: 190, y: 165 }, { x: 250, y: 205 });
    expect(billing.members.has('n1')).toBe(true);
    await h.engine.undo();
    expect(h.model.getNode('n1')!.position.x).toBeCloseTo(140, 0);
    expect(billing.members.has('n1')).toBe(true);
  });
});
