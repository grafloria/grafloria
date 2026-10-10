// Under a sync session the REPLICA owns undo. Its stack is per actor (it never takes back a
// peer's edit), so a canvas gesture has to land on it as ONE step, and the canvas's Ctrl+Z
// (and engine.undo()) has to reach it. Before: every mousemove of a drag was its own replica
// step, so replica.undo() after a drag took back the last pixel and looked like a no-op.
import { DiagramEngine, MemoryHub, MoveNodeCommand, createSyncSession } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyNodes } from './model-input';

const WIDTH = 1200, HEIGHT = 800;

function peer(hub: MemoryHub, actor: string) {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);
  const engine = new DiagramEngine();
  const model = engine.createDiagram('t')!;
  applyNodes(model, [{ id: 'n1', position: { x: 300, y: 200 }, size: { width: 100, height: 50 } }]);
  const viewport = new ViewportController({ viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const host: DomEventBinderHost = {
    getEngine: () => engine, viewport, interaction: new InteractionController(),
    getRect: () => container.getBoundingClientRect(),
    requestRender: () => {}, emit: () => {},
  };
  const binder = new DomEventBinder(container, host, {});
  binder.attach();
  const session = createSyncSession(model, hub.connect(actor), { actor, batch: { intervalMs: 1_000_000 } });
  session.join();
  return {
    container, engine, model, session, replica: session.replica,
    x: () => model.getNode('n1')!.position.x,
    destroy() { session.dispose(); session.replica.dispose(); binder.detach(); engine.destroy(); container.remove(); },
  };
}

const mouse = (type: string, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, button: 0, ...init });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function dragRight(p: ReturnType<typeof peer>) {
  // Press on the node's centre (350,225) and drag +160 in four moves, as a hand does.
  p.container.dispatchEvent(mouse('mousedown', { clientX: 350, clientY: 225 }));
  for (const dx of [40, 80, 120, 160]) p.container.dispatchEvent(mouse('mousemove', { clientX: 350 + dx, clientY: 225 }));
  p.container.dispatchEvent(mouse('mouseup', { clientX: 510, clientY: 225 }));
}

describe('under a sync session the replica owns undo', () => {
  const made: Array<ReturnType<typeof peer>> = [];
  afterEach(() => { for (const p of made.splice(0)) p.destroy(); });
  const pair = () => {
    const hub = new MemoryHub();
    const a = peer(hub, 'ana');
    const b = peer(hub, 'ben');
    made.push(a, b);
    const exchange = () => { a.session.flush(); b.session.flush(); };
    return { a, b, exchange };
  };

  it('a canvas drag is ONE replica step: replica.undo() puts it back, on both peers', async () => {
    const { a, b, exchange } = pair();
    dragRight(a);
    await flush();
    exchange();
    expect(a.x()).toBeCloseTo(460, 0);
    expect(b.x()).toBeCloseTo(460, 0);

    a.replica.undo();
    exchange();
    expect(a.x()).toBeCloseTo(300, 0);
    expect(b.x()).toBeCloseTo(300, 0);
    expect(a.replica.canUndo).toBe(false);

    a.replica.redo();
    exchange();
    expect(b.x()).toBeCloseTo(460, 0);
  });

  it("the canvas's Ctrl+Z and engine.undo() reach the replica's stack", async () => {
    const { a, b, exchange } = pair();
    dragRight(a);
    await flush();
    a.container.dispatchEvent(mouse('mousedown', { clientX: 900, clientY: 700 })); // empty canvas
    a.container.dispatchEvent(mouse('mouseup', { clientX: 900, clientY: 700 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await flush();
    exchange();
    expect(a.x()).toBeCloseTo(300, 0);
    expect(b.x()).toBeCloseTo(300, 0);
    expect(a.replica.canRedo).toBe(true); // it was the replica's step that was taken back
    expect(a.engine.canRedo()).toBe(true);

    await a.engine.redo();
    expect(a.x()).toBeCloseTo(460, 0);
  });

  it("Ctrl+Z never takes back a peer's edit", async () => {
    const { a, b, exchange } = pair();
    dragRight(b);
    await flush();
    exchange();
    expect(a.x()).toBeCloseTo(460, 0);
    expect(a.engine.canUndo()).toBe(false); // nothing of Ana's to undo
    await a.engine.undo();
    expect(a.x()).toBeCloseTo(460, 0);
  });

  it('a command executed through the engine is one replica step', async () => {
    const { a } = pair();
    await a.engine.commandManager.execute(
      new MoveNodeCommand('n1', { x: 500, y: 200 }, { x: 300, y: 200 }, { mergeable: false })
    );
    expect(a.x()).toBe(500);
    await a.engine.undo();
    expect(a.x()).toBe(300);
    expect(a.replica.canUndo).toBe(false);
  });
});
