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
    it('Delete removes the selected nodes', () => {
      h = harness();
      h.model.selectNode(h.model.getNode('a')!);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

      expect(h.model.getNode('a')).toBeUndefined();
      expect(h.events.some((e) => e.event === 'nodes:change')).toBe(true);
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
});
