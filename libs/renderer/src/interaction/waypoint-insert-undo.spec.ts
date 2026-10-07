/**
 * Bends and the undo history, through the real canvas: pointer events on the
 * container, the renderer re-routing between steps.
 *
 * A click on a selected wire inserts a bend; dragging that bend later is a
 * separate gesture. Each is its own undo step: the first ⌘Z puts the bend back
 * where it was inserted, the second removes it. A single press that inserts a
 * bend and drags it before release is one step.
 *
 * The old behaviour: the click-insert recorded nothing, and undoing the drag
 * cleared the "manual waypoints" flag, so the next render re-routed the wire
 * and the bend vanished on the first ⌘Z.
 */
import { createDiagram, type DiagramInstance } from '../instance/create-diagram';

const WIDTH = 1000;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: WIDTH });
  Object.defineProperty(el, 'clientHeight', { value: HEIGHT });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('inserting a bend by click is its own undo step', () => {
  let container: HTMLElement;
  let api: DiagramInstance;

  beforeEach(() => {
    container = makeContainer();
    api = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 50 } },
        { id: 'b', position: { x: 600, y: 100 }, size: { width: 100, height: 50 } },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', type: 'direct' }],
    });
    api.getEngine().setInteractionConfig({ enableWaypointEditing: true });
    api.renderNow();
  });

  afterEach(() => {
    api.dispose();
    container.remove();
  });

  const link = () => api.getModel().getLink('ab')!;
  const at = (x: number, y: number) => {
    const c = api.viewport.worldToClient(x, y, container.getBoundingClientRect());
    return { clientX: c.x, clientY: c.y };
  };
  const fire = (type: string, x: number, y: number) =>
    container.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, ...at(x, y) }));
  // jsdom has no PointerEvent; the binder's mouse listeners take these.
  const press = (x: number, y: number) => fire('mousedown', x, y);
  const release = (x: number, y: number) => fire('mouseup', x, y);
  const click = async (x: number, y: number) => {
    press(x, y);
    release(x, y);
    await flush();
    api.renderNow();
  };
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    press(from.x, from.y);
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      fire('mousemove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
    release(to.x, to.y);
    await flush();
    api.renderNow();
  };
  const interior = () => link().points.slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const undo = async () => {
    await api.getEngine().undo();
    api.renderNow();
  };

  /** The wire's midpoint, where a click inserts the bend. */
  function mid(): { x: number; y: number } {
    const p = link().points;
    return { x: (p[0].x + p[p.length - 1].x) / 2, y: (p[0].y + p[p.length - 1].y) / 2 };
  }

  it('click to insert, then drag the bend: ⌘Z undoes the drag, a second ⌘Z removes the bend', async () => {
    const m = mid();
    await click(m.x, m.y); // select the wire
    expect(link().state).toBe('selected');
    await click(m.x, m.y); // insert a bend
    expect(interior()).toEqual([{ x: Math.round(m.x), y: Math.round(m.y) }]);

    await drag(m, { x: m.x + 40, y: m.y + 160 });
    expect(interior()).toEqual([{ x: Math.round(m.x + 40), y: Math.round(m.y + 160) }]);

    await undo();
    expect(interior()).toEqual([{ x: Math.round(m.x), y: Math.round(m.y) }]);

    await undo();
    expect(interior()).toEqual([]);
  });

  it('a press that inserts a bend and drags it before release is one undo step', async () => {
    const m = mid();
    await click(m.x, m.y); // select the wire
    await drag(m, { x: m.x - 60, y: m.y + 120 }); // insert and move in one press
    expect(interior()).toEqual([{ x: Math.round(m.x - 60), y: Math.round(m.y + 120) }]);

    await undo();
    expect(interior()).toEqual([]);

    await api.getEngine().redo();
    api.renderNow();
    expect(interior()).toEqual([{ x: Math.round(m.x - 60), y: Math.round(m.y + 120) }]);
  });

  it('a double-click on a bend does not stack a second bend on it or leave a drag open', async () => {
    const m = mid();
    await click(m.x, m.y); // select
    await click(m.x, m.y); // insert
    fire('dblclick', m.x, m.y);
    api.renderNow();
    expect(interior()).toEqual([{ x: Math.round(m.x), y: Math.round(m.y) }]);
    expect(api.interaction.getState().isDraggingWaypoint).toBe(false);
    // A hover afterwards moves nothing.
    fire('mousemove', m.x + 50, m.y + 50);
    api.renderNow();
    expect(interior()).toEqual([{ x: Math.round(m.x), y: Math.round(m.y) }]);
  });
});
