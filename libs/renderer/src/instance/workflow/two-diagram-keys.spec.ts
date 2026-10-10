import { MoveNodeCommand } from '@grafloria/engine';
import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';

function makeContainer(left: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left, top: 0, width: 400, height: 300, right: left + 400, bottom: 300 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('two diagrams on one page: a key acts on the diagram you are working in, not on every one', () => {
  const made: Array<{ d: DiagramInstance; el: HTMLElement }> = [];
  afterEach(() => {
    for (const { d, el } of made.splice(0)) {
      d.dispose();
      el.remove();
    }
  });
  const mount = (left: number) => {
    const el = makeContainer(left);
    const d = createDiagram(el, { nodes: [{ id: 'n', position: { x: 50, y: 50 }, size: { width: 80, height: 40 } }] });
    made.push({ d, el });
    return { d, el };
  };
  const moveRight = async (d: DiagramInstance) => {
    await d.getEngine().commandManager.execute(new MoveNodeCommand('n', { x: 150, y: 50 }, { x: 50, y: 50 }, { mergeable: false }));
  };

  it('Ctrl+Z after pressing in diagram A undoes A only', async () => {
    const a = mount(0);
    const b = mount(500);
    await moveRight(a.d);
    await moveRight(b.d);
    a.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 300, clientY: 250 })); // empty canvas in A
    a.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 300, clientY: 250 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await flush();
    expect(a.d.getModel().getNode('n')!.position.x).toBe(50); // undone
    expect(b.d.getModel().getNode('n')!.position.x).toBe(150); // untouched
  });

  it('a page with ONE diagram that was never clicked still takes its keys (unchanged)', async () => {
    const a = mount(0);
    await moveRight(a.d);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await flush();
    expect(a.d.getModel().getNode('n')!.position.x).toBe(50);
  });
});
