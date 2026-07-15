import { DiagramEngine } from '@grafloria/engine';
import type { DiagramModel } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost, DomEventBinderOptions } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyEdges, applyNodes } from './model-input';

const WIDTH = 800;
const HEIGHT = 600;

interface Harness {
  container: HTMLElement;
  binder: DomEventBinder;
  engine: DiagramEngine;
  model: DiagramModel;
  viewport: ViewportController;
  interaction: InteractionController;
  requestRender: jest.Mock;
  emit: jest.Mock;
  events: Array<{ event: string; payload: unknown }>;
  destroy(): void;
}

/**
 * Real container, real engine, real controllers — only the host's render trigger
 * is a spy. Camera is identity at zoom 1 (rect at 0,0), so world == client.
 */
function harness(options: DomEventBinderOptions = {}): Harness {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);

  const engine = new DiagramEngine();
  const model = engine.createDiagram('t');
  applyNodes(model, [
    { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } },
    { id: 'b', position: { x: 400, y: 100 }, size: { width: 100, height: 60 } },
  ]);
  applyEdges(model, [{ id: 'e', source: 'a', target: 'b' }]);

  const viewport = new ViewportController({
    viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });
  const interaction = new InteractionController();

  const events: Array<{ event: string; payload: unknown }> = [];
  const requestRender = jest.fn();
  const emit = jest.fn((event: string, payload: unknown) => {
    events.push({ event, payload });
  });

  const host: DomEventBinderHost = {
    getEngine: () => engine,
    viewport,
    interaction,
    getRect: () => container.getBoundingClientRect(),
    requestRender,
    emit,
  };

  const binder = new DomEventBinder(container, host, options);
  binder.attach();

  return {
    container,
    binder,
    engine,
    model,
    viewport,
    interaction,
    requestRender,
    emit,
    events,
    destroy() {
      binder.detach();
      engine.destroy();
      container.remove();
    },
  };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, button: 0, ...init });

/** Centre of node `a` (world == client in this harness). */
const A_CENTER = { clientX: 150, clientY: 130 };

describe('DomEventBinder', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  describe('lifecycle', () => {
    it('detach() removes EXACTLY the listeners attach() added (same fn objects)', () => {
      h = harness();
      h.binder.detach(); // start from a clean slate so the spies see one full cycle

      const add = jest.spyOn(h.container, 'addEventListener');
      const remove = jest.spyOn(h.container, 'removeEventListener');

      h.binder.attach();
      h.binder.detach();

      // Same event names AND the same bound function objects — the classic leak is
      // `removeEventListener(this.onX.bind(this))`, which allocates a fresh fn and
      // removes nothing.
      const added = add.mock.calls.map((c) => [c[0], c[1]]);
      const removed = remove.mock.calls.map((c) => [c[0], c[1]]);
      expect(removed).toEqual(added);
      expect(h.binder.isAttached).toBe(false);
    });

    it('a detached binder does nothing on a click', () => {
      h = harness();
      h.binder.detach();
      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      expect(h.requestRender).not.toHaveBeenCalled();
    });
  });

  describe('selection', () => {
    it('mousedown on a node selects it and emits node:click', () => {
      h = harness();
      h.container.dispatchEvent(mouse('mousedown', A_CENTER));

      expect(h.model.getNode('a')!.isSelected()).toBe(true);
      expect(h.events.map((e) => e.event)).toContain('node:click');
      expect(h.events.map((e) => e.event)).toContain('selection:change');
    });

    it('mousedown on empty canvas clears the selection', () => {
      h = harness();
      h.model.selectNode(h.model.getNode('a')!);

      h.container.dispatchEvent(mouse('mousedown', { clientX: 700, clientY: 500 }));

      expect(h.model.getSelectedNodes()).toHaveLength(0);
    });

    it('a modifier click on empty canvas PRESERVES the selection (marquee extend)', () => {
      h = harness();
      h.model.selectNode(h.model.getNode('a')!);

      h.container.dispatchEvent(
        mouse('mousedown', { clientX: 700, clientY: 500, shiftKey: true })
      );

      expect(h.model.getSelectedNodes()).toHaveLength(1);
    });

    it('ctrl+click toggles (multi-select)', () => {
      h = harness();
      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mouseup', A_CENTER));
      h.container.dispatchEvent(
        mouse('mousedown', { clientX: 450, clientY: 130, ctrlKey: true })
      );

      expect(h.model.getSelectedNodes().map((n) => n.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('node drag — the movement threshold', () => {
    it('does NOT move the node below the threshold (a click must not jitter it)', () => {
      h = harness({ dragThreshold: 4 });
      const node = h.model.getNode('a')!;
      const before = { ...node.position };

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 152, clientY: 131 })); // 2.2px
      h.container.dispatchEvent(mouse('mouseup', { clientX: 152, clientY: 131 }));

      expect(node.position).toEqual(before);
    });

    it('moves the node once the pointer crosses the threshold', () => {
      h = harness({ dragThreshold: 4 });
      const node = h.model.getNode('a')!;

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 180 }));
      h.container.dispatchEvent(mouse('mouseup', { clientX: 200, clientY: 180 }));

      expect(node.position.x).toBeCloseTo(150);
      expect(node.position.y).toBeCloseTo(150);
      expect(h.events.some((e) => e.event === 'nodes:change')).toBe(true);
    });

    it('drags every selected node together', () => {
      h = harness();
      h.model.selectNode(h.model.getNode('a')!);
      h.model.addToSelection(h.model.getNode('b')!);

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 180, clientY: 130 }));
      h.container.dispatchEvent(mouse('mouseup', { clientX: 180, clientY: 130 }));

      expect(h.model.getNode('a')!.position.x).toBeCloseTo(130);
      expect(h.model.getNode('b')!.position.x).toBeCloseTo(430);
    });

    it('respects zoom when converting the drag delta to world units', () => {
      h = harness();
      h.viewport.setZoom(2);
      const node = h.model.getNode('a')!;
      const start = h.viewport.worldToClient(150, 130, h.container.getBoundingClientRect());

      h.container.dispatchEvent(mouse('mousedown', { clientX: start.x, clientY: start.y }));
      h.container.dispatchEvent(
        mouse('mousemove', { clientX: start.x + 100, clientY: start.y })
      );

      // 100 screen px at zoom 2 is 50 world px.
      expect(node.position.x).toBeCloseTo(150);
    });

    it('DELIBERATE mode: the first press only selects, a later press-drag moves', () => {
      h = harness();
      h.engine.setInteractionConfig({ mode: 'deliberate' } as never);
      const node = h.model.getNode('a')!;

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 220, clientY: 130 }));
      h.container.dispatchEvent(mouse('mouseup', { clientX: 220, clientY: 130 }));
      expect(node.position.x).toBe(100); // selected, not moved

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 220, clientY: 130 }));
      expect(node.position.x).toBeCloseTo(170);
    });

    it('readonly: no selection mutation, no drag', () => {
      h = harness({ readonly: true });
      const node = h.model.getNode('a')!;

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 250, clientY: 200 }));

      expect(node.position.x).toBe(100);
    });

    it('mouseleave aborts an in-flight drag instead of letting it stick', () => {
      h = harness();
      const node = h.model.getNode('a')!;

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 130 }));
      h.container.dispatchEvent(new MouseEvent('mouseleave'));
      const after = { ...node.position };
      h.container.dispatchEvent(mouse('mousemove', { clientX: 400, clientY: 130 }));

      expect(node.position).toEqual(after);
    });
  });

  describe('camera', () => {
    it('ctrl+wheel zooms at the cursor, keeping that world point pinned', () => {
      h = harness();
      const rect = h.container.getBoundingClientRect();
      const before = h.viewport.clientToWorld(200, 150, rect);

      h.container.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -100, ctrlKey: true, clientX: 200, clientY: 150 })
      );

      expect(h.viewport.getZoom()).toBeGreaterThan(1);
      const after = h.viewport.clientToWorld(200, 150, rect);
      expect(after.x).toBeCloseTo(before.x, 5);
      expect(after.y).toBeCloseTo(before.y, 5);
    });

    it('a plain wheel PANS (it does not zoom)', () => {
      h = harness();
      h.container.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaX: 30, deltaY: 40 })
      );

      expect(h.viewport.getZoom()).toBe(1);
      expect(h.viewport.getViewport()).toMatchObject({ x: 30, y: 40 });
    });

    it('middle-drag pans the camera the opposite way (content follows the cursor)', () => {
      h = harness();
      h.container.dispatchEvent(mouse('mousedown', { button: 1, clientX: 300, clientY: 300 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 280, clientY: 290 }));

      expect(h.viewport.getViewport()).toMatchObject({ x: 20, y: 10 });
    });

    it('space+left-drag pans', () => {
      h = harness();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      h.container.dispatchEvent(mouse('mousedown', { clientX: 300, clientY: 300 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 250, clientY: 300 }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

      expect(h.viewport.getViewport().x).toBe(50);
      expect(h.model.getSelectedNodes()).toHaveLength(0); // space-drag never selects
    });

    it('enablePan:false / enableZoom:false opt out', () => {
      h = harness({ enablePan: false, enableZoom: false });
      h.container.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }));
      h.container.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -50, ctrlKey: true })
      );

      expect(h.viewport.getViewport().y).toBe(0);
      expect(h.viewport.getZoom()).toBe(1);
    });
  });

  describe('the mousedown priority ladder', () => {
    it('a hovered PORT wins over the node underneath it', () => {
      h = harness();
      const port = h.model.getNode('a')!.getPort('a__right')!;
      const startConnection = jest.spyOn(h.interaction, 'startConnection');
      // Prime the hover state the way a real mousemove would.
      jest
        .spyOn(h.interaction, 'getState')
        .mockReturnValue({ ...h.interaction.getState(), hoveredPort: port } as never);

      h.container.dispatchEvent(mouse('mousedown', A_CENTER));

      expect(startConnection).toHaveBeenCalledWith(port, 150, 130, h.engine);
      expect(h.model.getNode('a')!.isSelected()).toBe(false); // node never got the press
    });

    it('a link body click selects the link, not the empty canvas', () => {
      h = harness();
      const link = h.model.getLink('e')!;
      jest.spyOn(h.interaction, 'getLinkAtPosition').mockReturnValue(link);

      h.container.dispatchEvent(mouse('mousedown', { clientX: 300, clientY: 130 }));

      expect(link.state).toBe('selected');
      expect(h.events.map((e) => e.event)).toContain('edge:click');
    });
  });

  describe('connection gesture', () => {
    it('mouseup while connecting completes the connection', () => {
      h = harness();
      const port = h.model.getNode('a')!.getPort('a__right')!;
      h.interaction.startConnection(port, 200, 130, h.engine);
      const complete = jest.spyOn(h.interaction, 'completeConnection');

      h.container.dispatchEvent(mouse('mouseup', { clientX: 400, clientY: 130 }));

      expect(complete).toHaveBeenCalledWith(h.engine);
    });

    it('Escape cancels an in-flight connection', () => {
      h = harness();
      const port = h.model.getNode('a')!.getPort('a__right')!;
      h.interaction.startConnection(port, 200, 130, h.engine);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(h.interaction.getState().isConnecting).toBe(false);
    });
  });

  describe('keyboard', () => {
    it('Delete removes the selected nodes — as ONE undoable command', async () => {
      h = harness();
      h.model.selectNode(h.model.getNode('a')!);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      // The delete now commits through the ASYNC command stack (the old direct
      // mutation could never be undone — and the next undo replayed a stale
      // command aimed at the deleted node, which threw).
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      expect(h.model.getNode('a')).toBeUndefined();
      // The cascade went with it: no link may dangle off a deleted node.
      expect(h.model.getLinks().filter((l) => l.sourceNodeId === 'a' || l.targetNodeId === 'a')).toHaveLength(0);
      expect(h.events.some((e) => e.event === 'nodes:change')).toBe(true);

      // …and it UNDOES: the node and its links come back.
      expect(h.engine.commandManager.canUndo()).toBe(true);
      await h.engine.commandManager.undo();
      expect(h.model.getNode('a')).toBeDefined();
    });

    it('Ctrl+A selects everything', () => {
      h = harness();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
      expect(h.model.getSelectedNodes()).toHaveLength(2);
    });

    it('never steals a key from a focused text input', () => {
      h = harness();
      h.model.selectNode(h.model.getNode('a')!);

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(h.model.getNode('a')).toBeDefined();
      input.remove();
    });
  });

  // ==========================================================================
  // wave12/node-resize — dragging a resize handle must resize the node through
  // the DEFAULT DOM pointer pipeline, not merely through a host-registered tool.
  //
  // Node `a` lives at (100,100) sized 100×60, so its SE corner is the world point
  // (200,160). A resize handle sits there ONLY once the node is selected.
  // ==========================================================================
  describe('resize handle gesture', () => {
    /** Select `a` so the tool layer paints its handles, without arming a drag. */
    const selectA = () => {
      h.container.dispatchEvent(mouse('mousedown', A_CENTER));
      h.container.dispatchEvent(mouse('mouseup', A_CENTER));
    };

    it('a drag on the SE handle GROWS the node (does not drag it)', () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;
      const startPos = { ...node.position };

      // Grab the SE corner handle and haul it +60 right, +40 down.
      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 260, clientY: 200 }));
      h.container.dispatchEvent(mouse('mouseup', { clientX: 260, clientY: 200 }));

      // The node grew; its NW corner (the anchored edge) did NOT move.
      expect(node.size.width).toBeCloseTo(160);
      expect(node.size.height).toBeCloseTo(100);
      expect(node.position.x).toBeCloseTo(startPos.x);
      expect(node.position.y).toBeCloseTo(startPos.y);
    });

    it('clamps to the per-node max DURING the drag (cannot drag past it)', () => {
      h = harness();
      // Declare a 200-wide / 120-tall cap on `a`.
      h.model.getNode('a')!.setMetadata('sizing', { maxWidth: 200, maxHeight: 120 });
      selectA();
      const node = h.model.getNode('a')!;

      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 160 }));
      // Haul 1000px past the cap — still mid-drag (no mouseup yet).
      h.container.dispatchEvent(mouse('mousemove', { clientX: 1200, clientY: 1200 }));

      expect(node.size.width).toBe(200);
      expect(node.size.height).toBe(120);

      h.container.dispatchEvent(mouse('mouseup', { clientX: 1200, clientY: 1200 }));
    });

    it('commits ONE undoable command (undo restores the original size)', async () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;

      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 260, clientY: 200 }));
      h.container.dispatchEvent(mouse('mouseup', { clientX: 260, clientY: 200 }));

      expect(node.size.width).toBeCloseTo(160);
      // CommandManager.execute() is async; let the commit settle before asserting
      // the undo stack, exactly as the Angular canvas's tests do.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(h.engine.commandManager.canUndo()).toBe(true);

      await h.engine.commandManager.undo();
      expect(node.size.width).toBeCloseTo(100);
      expect(node.size.height).toBeCloseTo(60);
      expect(h.events.some((e) => e.event === 'nodes:change')).toBe(true);
    });

    // The four SIDE handles sit at the edge midpoints — exactly where the
    // default side ports live. A user aiming at the PORT GLYPH they can see
    // must get a wire, not a resize (the live audit caught a wire-draw turning
    // into a +40px resize). Corners have no port and stay resize.
    it('a press on the E side handle OVER THE PORT starts a wire, not a resize', () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;
      const E_PORT = { clientX: 200, clientY: 130 }; // right edge midpoint = a__right

      // Hover first (as a real cursor does), then press and pull away.
      h.container.dispatchEvent(mouse('mousemove', E_PORT));
      expect(h.interaction.getState().hoveredPort?.id).toBe(
        h.model.getNode('a')!.getPortBySide('right')!.id
      );
      h.container.dispatchEvent(mouse('mousedown', E_PORT));

      expect(h.interaction.getState().isConnecting).toBe(true);
      h.container.dispatchEvent(mouse('mousemove', { clientX: 260, clientY: 130 }));

      // The node was NOT resized by the pull.
      expect(node.size.width).toBeCloseTo(100);
      expect(node.size.height).toBeCloseTo(60);

      // Release on the void: no link either — the point is only WHICH gesture won.
      h.container.dispatchEvent(mouse('mouseup', { clientX: 260, clientY: 130 }));
      expect(node.size.width).toBeCloseTo(100);
    });

    it('the N side handle yields to the top port the same way', () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;
      const N_PORT = { clientX: 150, clientY: 100 }; // top edge midpoint = a__top

      h.container.dispatchEvent(mouse('mousemove', N_PORT));
      h.container.dispatchEvent(mouse('mousedown', N_PORT));
      expect(h.interaction.getState().isConnecting).toBe(true);

      h.container.dispatchEvent(mouse('mousemove', { clientX: 150, clientY: 40 }));
      expect(node.size.height).toBeCloseTo(60); // a resize would have grown it upward

      h.container.dispatchEvent(mouse('mouseup', { clientX: 150, clientY: 40 }));
    });

    // Drag-handle semantics (live report: "I can drag from everywhere"). A node
    // that declares a handle child is draggable ONLY via that handle: the body
    // press selects without moving; the handle press moves the PARENT.
    describe('drag-handle-only dragging', () => {
      const withHandle = () => {
        h = harness();
        const { NodeModel } = require('@grafloria/engine');
        const grip = new NodeModel({ id: 'grip', type: 'default', position: { x: 100, y: 72 }, size: { width: 100, height: 28 } });
        h.model.addNode(grip);
        grip.setParent('a');           // parent 'a' is at (100,100) 100×60
        grip.setPosition(0, -28);      // title bar just above the body
        grip.setBehavior({ dragHandler: { isDragHandler: true } });
        return { win: h.model.getNode('a')!, grip };
      };

      it('a BODY press selects but does NOT drag', () => {
        const { win } = withHandle();
        const before = { ...win.position };
        h.container.dispatchEvent(mouse('mousedown', { clientX: 150, clientY: 130 })); // body centre
        h.container.dispatchEvent(mouse('mousemove', { clientX: 160, clientY: 130 }));
        h.container.dispatchEvent(mouse('mousemove', { clientX: 260, clientY: 170 }));
        h.container.dispatchEvent(mouse('mouseup',   { clientX: 260, clientY: 170 }));
        expect(win.position).toEqual(before);
        expect(win.isSelected()).toBe(true);
      });

      it('a HANDLE press drags the parent (redirect unaffected by the body rule)', () => {
        const { win, grip } = withHandle();
        const before = { ...win.position };
        h.container.dispatchEvent(mouse('mousedown', { clientX: 150, clientY: 86 })); // grip centre (world 150,86)
        h.container.dispatchEvent(mouse('mousemove', { clientX: 160, clientY: 86 }));
        h.container.dispatchEvent(mouse('mousemove', { clientX: 250, clientY: 86 }));
        h.container.dispatchEvent(mouse('mouseup',   { clientX: 250, clientY: 86 }));
        expect(win.position.x).toBeCloseTo(before.x + 100);
        expect(grip.position.x).toBeCloseTo(0); // the child's LOCAL offset is untouched
      });
    });

    it('an UNSELECTED node has no handle there — the press drags instead', () => {
      h = harness();
      const node = h.model.getNode('a')!;
      // No selection ⇒ no handle at the corner ⇒ the press falls through to a drag.
      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 240, clientY: 160 }));
      h.container.dispatchEvent(mouse('mouseup', { clientX: 240, clientY: 160 }));

      expect(node.size.width).toBeCloseTo(100); // never resized
      expect(node.position.x).toBeCloseTo(140); // it moved instead
    });
  });
});
