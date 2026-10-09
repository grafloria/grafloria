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
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 100, height: 60 }, label: 'B' },
];
const mouse = (type: string, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, button: 0, ...init });
const A = { clientX: 150, clientY: 130 };

describe('read-only as ONE live switch', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });

  /** Press a, drag 100 px right, release; answer how far it moved. */
  const drag = (diagram: DiagramInstance): number => {
    const node = diagram.getModel().getNode('a')!;
    const x0 = node.position.x;
    const at = { clientX: x0 + 50, clientY: node.position.y + 30 }; // its centre now (world == client here)
    container.dispatchEvent(mouse('mousedown', at)); // selects
    container.dispatchEvent(mouse('mouseup', at));
    container.dispatchEvent(mouse('mousedown', at)); // drags the selected node
    container.dispatchEvent(mouse('mousemove', { clientX: at.clientX + 50, clientY: at.clientY }));
    container.dispatchEvent(mouse('mousemove', { clientX: at.clientX + 100, clientY: at.clientY }));
    container.dispatchEvent(mouse('mouseup', { clientX: at.clientX + 100, clientY: at.clientY }));
    return node.position.x - x0;
  };

  it('readonly: no move, but selection, click and DOUBLE-CLICK still reach the host', () => {
    d = createDiagram(container, { nodes: NODES, readonly: true });
    const dbl: string[] = [];
    d.on('node:doubleclick', ({ node }) => dbl.push(node.id));
    expect(container.hasAttribute('data-readonly')).toBe(true);
    expect(d.isReadonly()).toBe(true);
    expect(drag(d)).toBe(0);
    expect(d.getModel().getNode('a')!.isSelected()).toBe(true);
    container.dispatchEvent(mouse('dblclick', A));
    expect(dbl).toEqual(['a']);
  });

  it('setReadonly flips it live, both ways', () => {
    d = createDiagram(container, { nodes: NODES });
    expect(container.hasAttribute('data-readonly')).toBe(false); // default: no attribute at all
    expect(drag(d)).toBeGreaterThan(0);
    d.setReadonly(true);
    expect(container.hasAttribute('data-readonly')).toBe(true);
    expect(drag(d)).toBe(0);
    d.setReadonly(false);
    expect(d.isReadonly()).toBe(false);
    expect(drag(d)).toBeGreaterThan(0);
  });

  it('read-only draws no resize handles for the selection (they would be dead)', () => {
    d = createDiagram(container, { nodes: NODES });
    d.getModel().selectNode(d.getModel().getNode('a')!);
    d.renderNow();
    const handles = () => container.querySelectorAll('.resize-tool-layer *').length;
    expect(handles()).toBeGreaterThan(0);
    d.setReadonly(true);
    d.renderNow();
    expect(handles()).toBe(0);
  });

  it('a view switch, not the document lock: code can still change the document', () => {
    d = createDiagram(container, { nodes: NODES, readonly: true });
    d.getModel().getNode('a')!.setData('status', 'seen');
    expect(d.getModel().getNode('a')!.getData('status')).toBe('seen');
    expect(d.getModel().isReadonly()).toBe(false);
  });
});
