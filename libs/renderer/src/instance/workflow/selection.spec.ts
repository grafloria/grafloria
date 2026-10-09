import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } },
  { id: 'b', position: { x: 300, y: 100 }, size: { width: 100, height: 60 } },
  { id: 'c', position: { x: 500, y: 100 }, size: { width: 100, height: 60 } },
];
const click = (el: HTMLElement, x: number, y: number, init: MouseEventInit = {}) => {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y, ...init }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: x, clientY: y, ...init }));
};

describe('one selection rule for every press on a node: Shift extends, Ctrl/⌘ toggles', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });
  const sel = () => d!.getModel().getSelectedNodes().map((n) => n.id).sort();

  it('Shift-click on a node BODY extends the selection (as a press near its port already did)', () => {
    d = createDiagram(container, { nodes: NODES });
    click(container, 150, 130);
    click(container, 350, 130, { shiftKey: true });
    expect(sel()).toEqual(['a', 'b']);
  });

  it('a plain click still replaces; Ctrl still toggles (unchanged)', () => {
    d = createDiagram(container, { nodes: NODES });
    click(container, 150, 130);
    click(container, 350, 130);
    expect(sel()).toEqual(['b']);
    click(container, 550, 130, { ctrlKey: true });
    expect(sel()).toEqual(['b', 'c']);
    click(container, 550, 130, { ctrlKey: true });
    expect(sel()).toEqual(['b']);
  });
});
