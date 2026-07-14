// Touch & mobile gestures harness — wave 9, card 2.
//
// Builds a REAL diagram through the REAL `createDiagram()` (which is what attaches
// the DomEventBinder — the pipeline that actually runs), and exposes just enough
// state for touch-run.mjs to assert against after it dispatches REAL touch events
// through Chromium.
//
// This harness deliberately does NOT synthesize any events itself. Everything is
// driven from the outside by page.touchscreen / CDP Input.dispatchTouchEvent, so
// what we prove is that the browser's own touch delivery reaches our handlers —
// which is the entire question. jsdom cannot answer it: it has no PointerEvent, it
// does not implement touch-action, and it will happily deliver a synthetic touch
// sequence that a real browser would never produce.

import { DiagramEngine, DiagramMode, NodeModel } from '@grafloria/engine';
import { createDiagram } from '@grafloria/renderer';
// The renderer's own port geometry — the SAME function the hit test resolves
// against. Computing port centres any other way in a test would be testing the
// test. (Deep import: not on the public barrel.)
import { portWorldPosition } from '../src/svg/port-positioning';

const stage = document.getElementById('stage')!;

// A canvas with two nodes far enough apart to tap individually, plus an edge.
const engine = new DiagramEngine();
const diagram = engine.createDiagram('touch-e2e');

const mk = (id: string, x: number, y: number) => {
  const n = new NodeModel({
    id,
    type: 'process',
    position: { x, y },
    size: { width: 160, height: 80 },
  });
  n.setMetadata('label', id);
  diagram.addNode(n);
  return n;
};

const a = mk('A', 120, 120);
const b = mk('B', 520, 320);
diagram.connectNodes(a, b);

const instance = createDiagram(stage, {
  engine,
  zoom: 1,
  viewport: { x: 0, y: 0 },
});

// ---------------------------------------------------------------------------
// Probes for the runner. Everything the assertions need, read straight off the
// live model / viewport — never off our own bookkeeping.
// ---------------------------------------------------------------------------
const events: Array<{ type: string; detail?: unknown }> = [];
for (const name of ['node:click', 'edge:click', 'selection:change', 'contextmenu', 'nodes:change'] as const) {
  instance.on(name as never, ((payload: unknown) => {
    // SUMMARIZE, never store the raw payload: it carries live NodeModel/LinkModel
    // objects, which are cyclic (node -> emitter -> handler -> node) and cannot
    // cross the page boundary or JSON.stringify.
    let detail: unknown = undefined;
    if (name === 'contextmenu') {
      const p = payload as {
        node?: { id: string };
        edge?: { id: string };
        source?: string;
        readonly?: boolean;
        world?: { x: number; y: number };
      };
      detail = {
        nodeId: p?.node?.id ?? null,
        edgeId: p?.edge?.id ?? null,
        source: p?.source ?? null,
        readonly: p?.readonly ?? null,
        world: p?.world ? { x: p.world.x, y: p.world.y } : null,
      };
    }
    events.push({ type: name, detail });
  }) as never);
}

(window as never as Record<string, unknown>)['__touch'] = {
  /** The container the binder bound to — the runner needs its box. */
  container: stage,

  state() {
    const model = instance.getModel();
    const vp = instance.viewport;
    const nodeA = model.getNode('A')!;
    const nodeB = model.getNode('B')!;
    return {
      zoom: vp.getZoom(),
      viewport: { ...vp.getViewport() },
      a: { ...nodeA.position },
      b: { ...nodeB.position },
      selected: model.getSelectedNodes().map((n) => n.id),
      selectedLinks: model.getLinks().filter((l) => l.state === 'selected').length,
      links: model.getLinks().length,
      readonly: model.isReadonly(),
      hitSlop: instance.interaction.getHitSlop(),
      events: events.map((e) => e.type),
      lastContextMenu: events.filter((e) => e.type === 'contextmenu').slice(-1)[0]?.detail ?? null,
    };
  },

  /** The computed touch-action on the container — the line without which nothing works. */
  touchAction() {
    return getComputedStyle(stage).touchAction;
  },

  /** Screen position of a node's centre, for aiming a finger at it. */
  nodeCenterClient(id: string) {
    const model = instance.getModel();
    const n = model.getNode(id)!;
    const rect = stage.getBoundingClientRect();
    const p = instance.viewport.worldToClient(
      n.position.x + n.size.width / 2,
      n.position.y + n.size.height / 2,
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    );
    return { x: p.x, y: p.y };
  },

  /**
   * Screen position of the port the connection test aims at. Uses the renderer's
   * OWN portWorldPosition() — the same geometry the hit test resolves against —
   * so "12px from the port centre" means 12px from where the port actually is.
   *
   * Picks the port facing the other node (the RIGHT side of A), because dragging
   * from a port on the far side would start the gesture underneath the node.
   */
  portClient(nodeId: string, side = 'right') {
    const model = instance.getModel();
    const n = model.getNode(nodeId)!;
    const ports = n.getPorts();
    const port = ports.find((p) => (p as { side?: string }).side === side) ?? ports[0];
    const world = portWorldPosition(port, n);
    const rect = stage.getBoundingClientRect();
    const p = instance.viewport.worldToClient(world.x, world.y, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    return { x: p.x, y: p.y, portId: port.id, world };
  },

  /** The engine's REAL screen->world, so the pinch-anchor assertion cannot lie. */
  clientToWorld(clientX: number, clientY: number) {
    const rect = stage.getBoundingClientRect();
    return instance.viewport.clientToWorld(clientX, clientY, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  },

  setReadonly(on: boolean) {
    engine.setMode(on ? DiagramMode.PRESENTATION : DiagramMode.DESIGNER);
  },

  reset() {
    events.length = 0;
    instance.getModel().clearSelection();
    instance.getModel().getNode('A')!.setPosition(120, 120);
    instance.getModel().getNode('B')!.setPosition(520, 320);
    instance.viewport.setZoom(1);
    instance.viewport.setViewport({ x: 0, y: 0, width: 1200, height: 900 });
    instance.renderNow();
  },

  renderNow: () => instance.renderNow(),
};

(window as never as Record<string, unknown>)['__DONE__'] = true;
