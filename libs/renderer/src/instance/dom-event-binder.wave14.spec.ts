// wave14/interaction — DEFECT 1: reconnect shadowed by port hover.
//
// An edge's endpoint handle is DRAWN ON its port: the routed polyline ends at the
// port's world position, so the 6px handle circle and the port glyph are concentric.
// The natural gesture — move the mouse onto the visible handle, press — used to
// ALWAYS start a NEW connection, never a reconnect, because the mousedown ladder
// checked `hoveredPort` (≈11px hit radius: portDefaultRadius 6 × hoverScale 1.5 + 2)
// BEFORE the endpoint-handle branch (8px grab radius, DEFAULT_ENDPOINT_RADIUS).
// The pointermove that carried the mouse onto the handle set `hoveredPort`, and the
// press was swallowed by rung 2.
//
// REPRODUCE-FIRST: the first test below was written against the unfixed ladder and
// asserted the RECONNECT outcome — it was RED (the press started a connection) until
// the endpoint check moved ahead of the port branch.
//
// Driven through the SAME DomEventBinder a real embed uses, with real MouseEvents —
// the dom-event-binder.wave12.spec.ts harness pattern.

import { DiagramEngine } from '@grafloria/engine';
import type { DiagramModel, LinkModel } from '@grafloria/engine';
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

describe('wave14/interaction defect 1 — endpoint handle vs hovered port', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  // a's right port sits at (200,130); b's LEFT port at (400,130). The edge routes
  // a__right → b__left, so its target endpoint handle is CONCENTRIC with b's left
  // port — the exact geometry the defect needs.
  const A_RIGHT = { x: 200, y: 130 };
  const B_LEFT = { x: 400, y: 130 };

  function edgeOnPort(opts: { select?: boolean; reconnection?: boolean } = {}): LinkModel {
    h = harness();
    if (opts.reconnection === false) {
      h.engine.setInteractionConfig({ enableLinkReconnection: false } as never);
    }
    applyNodes(h.model, [
      { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } },
      { id: 'b', position: { x: 400, y: 100 }, size: { width: 100, height: 60 } },
    ]);
    applyEdges(h.model, [{ id: 'e1', source: 'a', target: 'b' }]);
    const link = h.model.getLink('e1')!;
    // The harness never renders, so give the link the routed polyline a renderer
    // would: port to port. The hit-test reads exactly these points.
    link.setPoints([{ ...A_RIGHT }, { ...B_LEFT }]);
    if (opts.select !== false) link.setState('selected');
    return link;
  }

  /** The natural gesture: pointer TRAVELS onto the point (setting hover), then presses. */
  function hoverThenPress(x: number, y: number): void {
    h.container.dispatchEvent(mouse('mousemove', { clientX: x, clientY: y }));
    h.container.dispatchEvent(mouse('mousedown', { clientX: x, clientY: y }));
  }

  it('THE DEFECT: hover the endpoint handle (port hovered too), press → RECONNECT, not a new connection', () => {
    edgeOnPort();

    hoverThenPress(B_LEFT.x, B_LEFT.y);

    // Sanity: the hover DID land on the port — the shadowing precondition is real.
    // (Asserted after the press: mousedown does not clear hover state.)
    expect(h.interaction.getState().hoveredPort?.id).toBe('b__left');

    // The press point is inside the 8px endpoint grab radius of a SELECTED,
    // reconnectable link — the visibly-touched handle must win over the port.
    const state = h.interaction.getState();
    expect(state.isReconnectingLink).toBe(true);
    expect(state.reconnectingEndpoint).toBe('target');
    expect(state.reconnectingLink?.id).toBe('e1');
    expect(state.isConnecting).toBe(false);
  });

  it('the source endpoint reconnects too (both handles are drawn on their ports)', () => {
    edgeOnPort();
    hoverThenPress(A_RIGHT.x, A_RIGHT.y);

    const state = h.interaction.getState();
    expect(state.isReconnectingLink).toBe(true);
    expect(state.reconnectingEndpoint).toBe('source');
  });

  it('the ANNULUS: a press on the port OUTSIDE the 8px handle still starts a fresh connection', () => {
    // Port hit radius = 6 × 1.5 + 2 = 11; endpoint grab radius = 8. The ring
    // 8 < d ≤ 11 belongs to the PORT even while the handle is on it, so a new
    // connection from that port stays reachable. d = 10 here.
    edgeOnPort();
    hoverThenPress(B_LEFT.x, B_LEFT.y + 10);

    expect(h.interaction.getState().hoveredPort?.id).toBe('b__left');
    const state = h.interaction.getState();
    expect(state.isConnecting).toBe(true);
    expect(state.isReconnectingLink).toBe(false);
  });

  it('an UNSELECTED link draws no handle — the port wins and a connection starts', () => {
    edgeOnPort({ select: false });
    hoverThenPress(B_LEFT.x, B_LEFT.y);

    const state = h.interaction.getState();
    expect(state.isConnecting).toBe(true);
    expect(state.isReconnectingLink).toBe(false);
  });

  it('with reconnection disabled, the handle does not exist — the port wins even dead-centre', () => {
    edgeOnPort({ reconnection: false });
    hoverThenPress(B_LEFT.x, B_LEFT.y);

    const state = h.interaction.getState();
    expect(state.isConnecting).toBe(true);
    expect(state.isReconnectingLink).toBe(false);
  });

  it('the workaround path still works: press the handle with NO prior hover → reconnect', () => {
    // No mousemove first — hoveredPort is null, so the press falls through the
    // port rung to the part-aware edge hit (the pre-fix rung 5/6 path).
    edgeOnPort();
    h.container.dispatchEvent(mouse('mousedown', { clientX: B_LEFT.x, clientY: B_LEFT.y }));

    const state = h.interaction.getState();
    expect(state.isReconnectingLink).toBe(true);
    expect(state.reconnectingEndpoint).toBe('target');
  });
});
