// resize-ux — what the live audit found missing at the BINDER seam.
//
// Driving nodes/node-resize-gesture.html with a real pointer showed two gaps
// against React Flow's NodeResizer:
//
//   1. NO resize cursors, ever. The idle-move cursor ladder only knew
//      port/link/node — hovering a corner handle of a selected node showed
//      'pointer', so nothing told the user the handle existed.
//   2. Side (edge) resize was unreachable: the side handles were 6px midpoint
//      dots fully inside the port's hover halo, so every aimed press wired.
//      RF's side affordance is the whole border line; the port keeps only its
//      own glyph.
//
// Node `a`: (100,100) 100×60 — SE corner (200,160), bottom edge y=160,
// right-edge midpoint (200,130) = port a__right. World == client here.

import { DiagramEngine } from '@grafloria/engine';
import type { DiagramModel } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyNodes } from './model-input';

const WIDTH = 800;
const HEIGHT = 600;

function harness() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);

  const engine = new DiagramEngine();
  const model: DiagramModel = engine.createDiagram('t')!;
  applyNodes(model, [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } }]);

  const viewport = new ViewportController({ viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const interaction = new InteractionController();
  const host: DomEventBinderHost = {
    getEngine: () => engine,
    viewport,
    interaction,
    getRect: () => container.getBoundingClientRect(),
    requestRender: jest.fn(),
    emit: jest.fn(),
  };
  const binder = new DomEventBinder(container, host);
  binder.attach();
  return {
    container, binder, engine, model, interaction,
    destroy() { binder.detach(); engine.destroy(); container.remove(); },
  };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, button: 0, ...init });

describe('DomEventBinder — resize-ux (cursors + edge bands)', () => {
  let h: ReturnType<typeof harness>;
  afterEach(() => h?.destroy());

  const selectA = () => {
    h.container.dispatchEvent(mouse('mousedown', { clientX: 150, clientY: 130 }));
    h.container.dispatchEvent(mouse('mouseup', { clientX: 150, clientY: 130 }));
  };

  describe('per-handle cursors (RF: nwse/nesw/ns/ew-resize)', () => {
    it('hovering a corner handle of the SELECTED node shows its resize cursor', () => {
      h = harness();
      selectA();
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 160 })); // SE
      expect(h.container.style.cursor).toBe('nwse-resize');
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 100 })); // NE
      expect(h.container.style.cursor).toBe('nesw-resize');
    });

    it('hovering an edge band (away from the port) shows the axis cursor', () => {
      h = harness();
      selectA();
      h.container.dispatchEvent(mouse('mousemove', { clientX: 125, clientY: 160 })); // S band
      expect(h.container.style.cursor).toBe('ns-resize');
      h.container.dispatchEvent(mouse('mousemove', { clientX: 100, clientY: 115 })); // W band
      expect(h.container.style.cursor).toBe('ew-resize');
    });

    it('the PORT keeps its crosshair at the edge midpoint (wire still wins there)', () => {
      h = harness();
      selectA();
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 130 })); // a__right
      expect(h.interaction.getState().hoveredPort?.id).toBeDefined();
      expect(h.container.style.cursor).toBe('crosshair');
    });

    it('an UNSELECTED node has no handles, so no resize cursor at its corner', () => {
      h = harness();
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 160 }));
      expect(h.container.style.cursor).not.toBe('nwse-resize');
    });

    it('the press keeps the handle cursor for the whole drag', () => {
      h = harness();
      selectA();
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 260, clientY: 200 }));
      expect(h.container.style.cursor).toBe('nwse-resize');
      h.container.dispatchEvent(mouse('mouseup', { clientX: 260, clientY: 200 }));
    });
  });

  describe('edge bands are grabbable (the audit’s unreachable side resize)', () => {
    it('pressing the BOTTOM edge away from the port resizes height only', () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;
      h.container.dispatchEvent(mouse('mousemove', { clientX: 125, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousedown', { clientX: 125, clientY: 160 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 125, clientY: 200 }));

      expect(h.interaction.getState().isConnecting).toBe(false);
      expect(node.size.height).toBeCloseTo(100);
      expect(node.size.width).toBeCloseTo(100);
      expect(node.position.y).toBeCloseTo(100); // top edge pinned
      h.container.dispatchEvent(mouse('mouseup', { clientX: 125, clientY: 200 }));
    });

    it('pressing the RIGHT edge off the port glyph resizes width (port keeps its core)', () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;
      // (200,115): on the right edge, 15px above the port — outside its hover halo.
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 115 }));
      expect(h.interaction.getState().hoveredPort).toBeFalsy();
      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 115 }));
      h.container.dispatchEvent(mouse('mousemove', { clientX: 250, clientY: 115 }));

      expect(node.size.width).toBeCloseTo(150);
      expect(node.size.height).toBeCloseTo(60);
      expect(node.position.x).toBeCloseTo(100); // left edge pinned
      h.container.dispatchEvent(mouse('mouseup', { clientX: 250, clientY: 115 }));
    });

    it('the port STILL wins its own glyph on the same edge (PORT-WIRE preserved)', () => {
      h = harness();
      selectA();
      const node = h.model.getNode('a')!;
      h.container.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 130 }));
      h.container.dispatchEvent(mouse('mousedown', { clientX: 200, clientY: 130 }));
      expect(h.interaction.getState().isConnecting).toBe(true);
      h.container.dispatchEvent(mouse('mousemove', { clientX: 260, clientY: 130 }));
      expect(node.size.width).toBeCloseTo(100);
      h.container.dispatchEvent(mouse('mouseup', { clientX: 260, clientY: 130 }));
    });
  });
});
