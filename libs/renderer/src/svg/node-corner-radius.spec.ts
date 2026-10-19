/**
 * A node's ROUNDED CORNERS, everywhere the node is drawn.
 *
 * A rounded card (`shape.cornerRadius` or `style.borderRadius`) drew its body
 * rounded, but the selection outline around it used a fixed 6px corner and the
 * drop shadow read only `style.borderRadius` — so a 12px card wore a squarish
 * selection ring that did not follow its own border (live report on the
 * chatbot demo: "the selection border is not rounded, doesn't look good").
 *
 * And at far zoom, where an HTML node drops its rich body and is "just its
 * silhouette", a card whose HTML painted the box over an INVISIBLE shape had
 * no silhouette at all: the boxes vanished and only the lines stayed.
 */
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import type { VNode } from '../types/vnode.types';

function find(vnode: VNode, pred: (v: VNode) => boolean): VNode | null {
  if (pred(vnode)) return vnode;
  for (const child of vnode.children ?? []) {
    if (child && typeof child === 'object' && 'type' in (child as VNode)) {
      const hit = find(child as VNode, pred);
      if (hit) return hit;
    }
  }
  return null;
}
const hasClass = (v: VNode, c: string) => String(v.props?.className ?? '').split(/\s+/).includes(c);

function render(setup: (n: NodeModel) => void, zoom = 1) {
  const engine = new DiagramEngine();
  engine.createDiagram();
  const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 }, size: { width: 240, height: 140 } });
  setup(node);
  engine.getDiagram()!.addNode(node);
  const tree = new SVGRenderer(engine).render({ x: -100, y: -100, width: 2000, height: 2000 }, zoom);
  const group = find(tree, (v) => v.key === `node-${node.id}`)!;
  return { node, group };
}
const selection = (g: VNode) => find(g, (v) => hasClass(v, 'selection-highlight'));
const shadow = (g: VNode) => find(g, (v) => hasClass(v, 'node-shadow'));
const silhouette = (g: VNode) => find(g, (v) => hasClass(v, 'html-node-silhouette'));
const card = (n: NodeModel, shape: Record<string, unknown>) => {
  n.setMetadata('shape', { type: 'rect', ...shape });
  n.setMetadata('html', { content: { tag: 'div', className: 'card', text: 'Send Message' }, padding: 0 });
};
const invisible = { fill: 'none', stroke: 'none' };

describe('the selection outline follows the node\'s own corners', () => {
  it('shape.cornerRadius 12: the outline, grown 3px, is rounded 15 — concentric with the card', () => {
    const { group } = render((n) => { n.setMetadata('shape', { type: 'rect', cornerRadius: 12 }); n.setSelected(true); });
    const sel = selection(group)!;
    expect(sel).toBeTruthy();
    expect(Number(sel.props!['rx'])).toBe(15);
    expect(Number(sel.props!['ry'])).toBe(15);
  });

  it('style.borderRadius 10 (no shape radius): the outline is rounded 13', () => {
    const { group } = render((n) => { n.style = { ...n.style, borderRadius: 10 }; n.setSelected(true); });
    expect(Number(selection(group)!.props!['rx'])).toBe(13);
  });

  it('shape.cornerRadius wins over style.borderRadius, as it does for the body', () => {
    const { group } = render((n) => {
      n.style = { ...n.style, borderRadius: 2 };
      n.setMetadata('shape', { type: 'rect', cornerRadius: 20 });
      n.setSelected(true);
    });
    expect(Number(selection(group)!.props!['rx'])).toBe(23);
  });

  it('a node that declares no radius keeps the outline it always had (6)', () => {
    const { group } = render((n) => { n.setMetadata('shape', { type: 'rect' }); n.setSelected(true); });
    expect(Number(selection(group)!.props!['rx'])).toBe(6);
  });
});

describe('the drop shadow follows the same corners', () => {
  it('shape.cornerRadius 12 rounds the shadow 12 (it used to read only style.borderRadius → 4)', () => {
    const { group } = render((n) => { n.setMetadata('shape', { type: 'rect', cornerRadius: 12 }); n.style = { ...n.style, shadow: true }; });
    const s = shadow(group);
    expect(s).toBeTruthy();
    expect(Number(s!.props!['rx'])).toBe(12);
  });
});

describe('far zoom: an HTML card keeps a silhouette', () => {
  it('an HTML card over an invisible shape gets a rounded stand-in box when its body is dropped', () => {
    const { group } = render((n) => card(n, { ...invisible, cornerRadius: 12 }), 0.2);
    // precondition: this zoom really is a tier that drops the rich body
    expect(find(group, (v) => v.type === 'foreignObject')).toBeNull();
    const s = silhouette(group);
    expect(s).toBeTruthy();
    expect(s!.props!['width']).toBe(240);
    expect(s!.props!['height']).toBe(140);
    expect(Number(s!.props!['rx'])).toBe(12);
    expect(s!.props!['fill']).not.toBe('none');
  });

  it('…and it is selectable-looking too: a selected far card still shows its rounded outline', () => {
    const { group } = render((n) => { card(n, { ...invisible, cornerRadius: 12 }); n.setSelected(true); }, 0.2);
    expect(Number(selection(group)!.props!['rx'])).toBe(15);
  });

  it('close up, the HTML paints the card: no stand-in box', () => {
    const { group } = render((n) => card(n, { ...invisible, cornerRadius: 12 }), 1);
    expect(find(group, (v) => v.type === 'foreignObject')).toBeTruthy();
    expect(silhouette(group)).toBeNull();
  });

  it('an HTML card whose shape is visible needs no stand-in: the shape IS its silhouette', () => {
    const { group } = render((n) => card(n, { fill: '#ffffff', stroke: '#d0d5dd', cornerRadius: 12 }), 0.2);
    expect(silhouette(group)).toBeNull();
  });

  it('an invisible node with NO html stays invisible — an author\'s hit area or anchor is not a card', () => {
    const { group } = render((n) => n.setMetadata('shape', { type: 'rect', ...invisible }), 0.2);
    expect(silhouette(group)).toBeNull();
  });
});
