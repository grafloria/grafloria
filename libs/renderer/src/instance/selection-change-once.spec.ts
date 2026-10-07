/**
 * One user gesture → exactly ONE `selection:change`, carrying the FINAL selection.
 *
 * The docs review saw `{n:1,e:1}` then `{n:1,e:0}` for a single click on a node
 * while an edge was selected. Two channels emitted: the model's
 * `selection:changed` event (relayed by createDiagram the moment `selectNode` ran,
 * BEFORE the binder deselected the edge — hence stale), and the binder's own
 * emit at the end of the gesture. Framework bindings forward every one, so
 * React/Vue/Qwik selection callbacks fired twice per click.
 *
 * Programmatic selection (no gesture) must still emit, synchronously.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import { registerTool } from '../ext/tools';

const WIDTH = 800;
const HEIGHT = 600;

type Sel = { n: string[]; e: string[] };

describe('selection:change fires once per gesture, with the final selection', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  let seen: Sel[];

  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(container);
    diagram = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
        { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
        { id: 'c', position: { x: 100, y: 400 }, size: { width: 120, height: 60 }, label: 'C' },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    });
    diagram.renderNow();
    seen = [];
    diagram.on('selection:change', (p: any) => {
      seen.push({ n: p.nodes.map((n: any) => n.id).sort(), e: p.edges.map((e: any) => e.id).sort() });
    });
  });

  afterEach(() => {
    diagram.dispose();
    container.remove();
  });

  const at = (x: number, y: number, init: MouseEventInit = {}) => ({ clientX: x, clientY: y, button: 0, bubbles: true, ...init });
  const click = (x: number, y: number, init: MouseEventInit = {}) => {
    container.dispatchEvent(new MouseEvent('mousedown', at(x, y, init)));
    container.dispatchEvent(new MouseEvent('mouseup', at(x, y, init)));
    container.dispatchEvent(new MouseEvent('click', at(x, y, init)));
  };
  const key = (k: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  const selectEdge = () => {
    diagram.getModel().getLink('e1')!.setState('selected');
    seen.length = 0;
  };

  it('a click on a node', () => {
    click(160, 130);
    expect(seen).toEqual([{ n: ['a'], e: [] }]);
  });

  it('a click that switches from an edge to a node (the reported case)', () => {
    selectEdge();
    click(160, 130);
    expect(seen).toEqual([{ n: ['a'], e: [] }]);
  });

  it('a click that switches from one node to another', () => {
    click(160, 130);
    seen.length = 0;
    click(460, 130);
    expect(seen).toEqual([{ n: ['b'], e: [] }]);
  });

  it('a modifier-click that adds a node', () => {
    click(160, 130);
    seen.length = 0;
    click(460, 130, { metaKey: true });
    expect(seen).toEqual([{ n: ['a', 'b'], e: [] }]);
  });

  it('a shift-click', () => {
    click(160, 130);
    seen.length = 0;
    click(460, 130, { shiftKey: true });
    expect(seen).toHaveLength(1);
    expect(seen[0].n).toContain('b');
  });

  it('a click on empty canvas', () => {
    click(160, 130);
    seen.length = 0;
    click(700, 550);
    expect(seen).toEqual([{ n: [], e: [] }]);
  });

  it('Ctrl+A', () => {
    key('a', { ctrlKey: true });
    expect(seen).toHaveLength(1);
    expect(seen[0].n).toEqual(['a', 'b', 'c']);
  });

  it('Escape', () => {
    click(160, 130);
    seen.length = 0;
    key('Escape');
    expect(seen).toEqual([{ n: [], e: [] }]);
  });

  it('a marquee (a registered tool, as in the gallery: clear on press, select while dragging)', () => {
    // The binder leaves marquee to the host; this is the gallery's tool in miniature.
    const model = diagram.getModel();
    let start: { x: number; y: number } | null = null;
    const apply = (to: { x: number; y: number }) => {
      const [x1, x2] = [Math.min(start!.x, to.x), Math.max(start!.x, to.x)];
      const [y1, y2] = [Math.min(start!.y, to.y), Math.max(start!.y, to.y)];
      for (const n of model.getNodes()) {
        const inside = n.position.x >= x1 && n.position.y >= y1 &&
          n.position.x + n.size.width <= x2 && n.position.y + n.size.height <= y2;
        n.setSelected(inside);
      }
    };
    const dispose = registerTool({
      id: 'marquee-spec',
      priority: 1,
      hitTest: (_ev: any, hit: any) => !!hit.empty,
      onPointerDown: (ev: any) => { start = { ...ev.world }; model.clearSelection(); },
      onPointerMove: (ev: any) => { if (start) apply(ev.world); },
      onPointerUp: (ev: any) => { if (start) apply(ev.world); start = null; },
    } as any);
    try {
      click(460, 130); // something selected first, so the press really clears it
      seen.length = 0;
      container.dispatchEvent(new MouseEvent('mousedown', at(60, 60)));
      for (let i = 1; i <= 10; i++) {
        container.dispatchEvent(new MouseEvent('mousemove', at(60 + i * 50, 60 + i * 15, { buttons: 1 })));
      }
      container.dispatchEvent(new MouseEvent('mouseup', at(560, 210)));
      container.dispatchEvent(new MouseEvent('click', at(560, 210)));
      expect(seen).toHaveLength(1);
      expect(seen[0].n).toEqual(['a', 'b']);
    } finally {
      dispose();
    }
  });

  it('programmatic selectNode / clearSelection still emit, synchronously, once each', () => {
    const model = diagram.getModel();
    model.selectNode(model.getNode('b')!);
    expect(seen).toEqual([{ n: ['b'], e: [] }]);
    model.clearSelection();
    expect(seen).toEqual([{ n: ['b'], e: [] }, { n: [], e: [] }]);
  });
});
