// wave12/connect-ergonomics — the three connect-ergonomics gaps, driven through
// the SAME DomEventBinder a real embed uses, with real MouseEvents.
//
//   gap 1  group drag carries members (this file)
//   gap 2  proximity-connect wired to the live node drag
//   gap 3  easy-connect: a node BODY starts a connection
//
// REPRODUCE-FIRST: each block asserts the CONSEQUENCE (members move / an edge
// appears / a body-drag connects), and each is proven to fail with the wiring
// off — see the "off" guards below, which are the same gesture with the config
// flag cleared.

import { DiagramEngine, GroupModel } from '@grafloria/engine';
import type { DiagramModel } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost, DomEventBinderOptions } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyEdges, applyNodes } from './model-input';

const WIDTH = 1200;
const HEIGHT = 800;

interface Harness {
  container: HTMLElement;
  binder: DomEventBinder;
  engine: DiagramEngine;
  model: DiagramModel;
  viewport: ViewportController;
  interaction: InteractionController;
  events: Array<{ event: string; payload: unknown }>;
  destroy(): void;
}

function harness(options: DomEventBinderOptions = {}): Harness {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);

  const engine = new DiagramEngine();
  const model = engine.createDiagram('t');
  const viewport = new ViewportController({ viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const interaction = new InteractionController();
  const events: Array<{ event: string; payload: unknown }> = [];
  const host: DomEventBinderHost = {
    getEngine: () => engine,
    viewport,
    interaction,
    getRect: () => container.getBoundingClientRect(),
    requestRender: () => {},
    emit: (event, payload) => events.push({ event, payload }),
  };
  const binder = new DomEventBinder(container, host, options);
  binder.attach();
  return {
    container, binder, engine, model, viewport, interaction, events,
    destroy() { binder.detach(); engine.destroy(); container.remove(); },
  };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, button: 0, ...init });

/** Let the async commandManager.execute() resolve + land on the history stack. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('wave12 gap 1 — group drag carries members', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  function buildSubflow() {
    h = harness();
    h.engine.setInteractionConfig({ enableGroupDrag: true } as never);
    applyNodes(h.model, [
      { id: 'm1', position: { x: 400, y: 200 }, size: { width: 100, height: 50 } },
      { id: 'm2', position: { x: 560, y: 220 }, size: { width: 100, height: 50 } },
      { id: 'outside', position: { x: 100, y: 500 }, size: { width: 100, height: 50 } },
    ]);
    const g = new GroupModel({ name: 'Pipeline' });
    h.model.addGroup(g);
    g.setFrame({ x: 380, y: 180, width: 300, height: 120 });
    g.addMember('m1', h.model);
    g.addMember('m2', h.model);
    return g;
  }

  // Empty spot INSIDE the frame (below m1): frame is x380-680 y180-300; m1 is
  // x400-500 y200-250, so (420, 285) is inside the frame and on no member.
  const pressPoint = { clientX: 420, clientY: 285 };

  it('drags the container background → every member + the frame follow by the same delta', () => {
    const g = buildSubflow();
    const m1 = h.model.getNode('m1')!, m2 = h.model.getNode('m2')!, outside = h.model.getNode('outside')!;
    const b1 = { ...m1.position }, b2 = { ...m2.position }, bOut = { ...outside.position };
    const bFrame = g.getOuterBounds();

    h.container.dispatchEvent(mouse('mousedown', pressPoint));
    h.container.dispatchEvent(mouse('mousemove', { clientX: pressPoint.clientX + 120, clientY: pressPoint.clientY + 40 }));
    h.container.dispatchEvent(mouse('mouseup', { clientX: pressPoint.clientX + 120, clientY: pressPoint.clientY + 40 }));

    expect(m1.position.x).toBeCloseTo(b1.x + 120);
    expect(m1.position.y).toBeCloseTo(b1.y + 40);
    expect(m2.position.x).toBeCloseTo(b2.x + 120);
    expect(m2.position.y).toBeCloseTo(b2.y + 40);
    // The frame followed too.
    const f = g.getOuterBounds();
    expect(f.x).toBeCloseTo(bFrame.x + 120);
    expect(f.y).toBeCloseTo(bFrame.y + 40);
    // A non-member is untouched.
    expect(outside.position).toEqual(bOut);
    expect(h.events.some((e) => e.event === 'nodes:change')).toBe(true);
  });

  it('OFF (default): the same press-drag inside a frame moves nothing (RED without the flag)', () => {
    h = harness(); // enableGroupDrag defaults false
    applyNodes(h.model, [{ id: 'm1', position: { x: 400, y: 200 }, size: { width: 100, height: 50 } }]);
    const g = new GroupModel({ name: 'P' });
    h.model.addGroup(g);
    g.setFrame({ x: 380, y: 180, width: 300, height: 120 });
    g.addMember('m1', h.model);
    const before = { ...h.model.getNode('m1')!.position };

    h.container.dispatchEvent(mouse('mousedown', pressPoint));
    h.container.dispatchEvent(mouse('mousemove', { clientX: pressPoint.clientX + 120, clientY: pressPoint.clientY }));
    h.container.dispatchEvent(mouse('mouseup', { clientX: pressPoint.clientX + 120, clientY: pressPoint.clientY }));

    expect(h.model.getNode('m1')!.position).toEqual(before);
  });

  it('commits as ONE undoable step — undo restores every member and the frame', async () => {
    const g = buildSubflow();
    const m1 = h.model.getNode('m1')!, m2 = h.model.getNode('m2')!;
    const b1 = { ...m1.position }, b2 = { ...m2.position };
    const bFrame = g.getOuterBounds();

    h.container.dispatchEvent(mouse('mousedown', pressPoint));
    h.container.dispatchEvent(mouse('mousemove', { clientX: pressPoint.clientX + 90, clientY: pressPoint.clientY }));
    h.container.dispatchEvent(mouse('mouseup', { clientX: pressPoint.clientX + 90, clientY: pressPoint.clientY }));
    await flush();

    expect(h.engine.commandManager.canUndo()).toBe(true);
    const historyLen = h.engine.commandManager.getHistory().length;

    await h.engine.commandManager.undo();
    expect(m1.position).toEqual(b1);
    expect(m2.position).toEqual(b2);
    expect(g.getOuterBounds().x).toBeCloseTo(bFrame.x);

    // ONE step: after undo, nothing left to undo from this gesture.
    expect(historyLen).toBe(1);
  });

  it('a member NODE press still drags just that node (the ladder: node wins the frame)', () => {
    const g = buildSubflow();
    const m1 = h.model.getNode('m1')!, m2 = h.model.getNode('m2')!;
    const b2 = { ...m2.position };
    // Press m1's centre (450, 225) and drag.
    h.container.dispatchEvent(mouse('mousedown', { clientX: 450, clientY: 225 }));
    h.container.dispatchEvent(mouse('mousemove', { clientX: 550, clientY: 225 }));
    h.container.dispatchEvent(mouse('mouseup', { clientX: 550, clientY: 225 }));

    expect(m1.position.x).toBeCloseTo(500); // m1 moved
    expect(m2.position).toEqual(b2);        // its sibling did NOT
    void g;
  });
});

describe('wave12 gap 2 — proximity connect on the live node drag', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  function twoNodes(proximity: boolean) {
    h = harness();
    if (proximity) h.engine.setInteractionConfig({ enableProximityConnect: true } as never);
    applyNodes(h.model, [
      { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } },
      { id: 'b', position: { x: 400, y: 100 }, size: { width: 100, height: 60 } },
    ]);
  }

  // Drag A's centre (150,130) by +dx so its right edge approaches B's left edge (400).
  const dragA = (h2: Harness, dx: number) => {
    h2.container.dispatchEvent(mouse('mousedown', { clientX: 150, clientY: 130 }));
    h2.container.dispatchEvent(mouse('mousemove', { clientX: 150 + 8, clientY: 130 }));
    h2.container.dispatchEvent(mouse('mousemove', { clientX: 150 + dx, clientY: 130 }));
    h2.container.dispatchEvent(mouse('mouseup', { clientX: 150 + dx, clientY: 130 }));
  };

  it('dropping A next to B auto-creates a link (the shipped SnapController, on the live drag)', async () => {
    twoNodes(true);
    expect(h.model.getLinks().length).toBe(0);
    dragA(h, 200); // A.x 100→300; A right edge 400 == B left edge 400
    await flush();

    expect(h.model.getLinks().length).toBe(1);
    const link = h.model.getLinks()[0]!;
    const ends = [h.model.getNodeByPortId(link.sourcePortId)!.id, h.model.getNodeByPortId(link.targetPortId)!.id].sort().join(',');
    expect(ends).toBe('a,b');
    expect(h.events.some((e) => e.event === 'edges:change')).toBe(true);
  });

  it('OFF (default): the same drop creates NO link (RED without the flag)', async () => {
    twoNodes(false);
    dragA(h, 200);
    await flush();
    expect(h.model.getLinks().length).toBe(0);
  });

  it('a drop that stays far away proposes nothing', async () => {
    twoNodes(true);
    dragA(h, 40); // A right edge only reaches 240 — well outside the 60px radius of 400
    await flush();
    expect(h.model.getLinks().length).toBe(0);
  });

  it('is ONE undoable step — undo removes exactly the auto-created link', async () => {
    twoNodes(true);
    dragA(h, 200);
    await flush();
    expect(h.model.getLinks().length).toBe(1);
    await h.engine.commandManager.undo();
    expect(h.model.getLinks().length).toBe(0);
  });
});

describe('wave12 gap 3 — easy connect from a node BODY', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  function twoNodes(cfg?: Record<string, unknown>) {
    h = harness();
    if (cfg) h.engine.setInteractionConfig(cfg as never);
    applyNodes(h.model, [
      { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } },
      { id: 'b', position: { x: 400, y: 100 }, size: { width: 100, height: 60 } },
    ]);
  }

  // A's centre (150,130) is well away from every port glyph; B's centre (450,130).
  const A = { clientX: 150, clientY: 130 };
  const B = { clientX: 450, clientY: 130 };
  const bodyDrag = (h2: Harness, from: MouseEventInit, to: MouseEventInit, mods: MouseEventInit = {}) => {
    h2.container.dispatchEvent(mouse('mousedown', { ...from, ...mods }));
    h2.container.dispatchEvent(mouse('mousemove', { clientX: (from.clientX as number) + 8, clientY: from.clientY, ...mods }));
    h2.container.dispatchEvent(mouse('mousemove', { ...to, ...mods }));
    h2.container.dispatchEvent(mouse('mouseup', { ...to, ...mods }));
  };

  it('press A body, release on B body → they connect (no port aiming)', async () => {
    twoNodes({ enableEasyConnect: true });
    expect(h.model.getLinks().length).toBe(0);
    bodyDrag(h, A, B);
    await flush();

    expect(h.model.getLinks().length).toBe(1);
    const link = h.model.getLinks()[0]!;
    const ends = [h.model.getNodeByPortId(link.sourcePortId)!.id, h.model.getNodeByPortId(link.targetPortId)!.id].sort().join(',');
    expect(ends).toBe('a,b');
    // A must NOT have moved — the body press connected, it did not drag.
    expect(h.model.getNode('a')!.position).toEqual({ x: 100, y: 100 });
  });

  it('OFF (default): a body drag MOVES the node and creates no link (RED without the flag)', () => {
    twoNodes(); // easy-connect off
    bodyDrag(h, A, { clientX: 250, clientY: 130 });
    expect(h.model.getLinks().length).toBe(0);
    expect(h.model.getNode('a')!.position.x).toBeCloseTo(200); // moved +100
  });

  it('release on EMPTY canvas connects nothing (a node is a handle, the void is not)', async () => {
    twoNodes({ enableEasyConnect: true });
    bodyDrag(h, A, { clientX: 800, clientY: 500 });
    await flush();
    expect(h.model.getLinks().length).toBe(0);
  });

  it('modifier gate: with easyConnectModifier=shift, a plain drag MOVES, a shift-drag CONNECTS', async () => {
    twoNodes({ enableEasyConnect: true, easyConnectModifier: 'shift' });

    // Plain drag → move (body-drag-to-move preserved).
    bodyDrag(h, A, { clientX: 220, clientY: 130 });
    expect(h.model.getLinks().length).toBe(0);
    expect(h.model.getNode('a')!.position.x).toBeCloseTo(170);

    // Shift-drag from A (now at x=170, centre ~220,130) to B → connect.
    const aCentre = { clientX: h.model.getNode('a')!.position.x + 50, clientY: 130 };
    bodyDrag(h, aCentre, B, { shiftKey: true });
    await flush();
    expect(h.model.getLinks().length).toBe(1);
  });
});
