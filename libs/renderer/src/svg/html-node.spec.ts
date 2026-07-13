// Card 4 — HTML / foreignObject rich-content nodes.

import {
  buildHtmlForeignObject,
  sanitizeHtmlContent,
  getHtmlContent,
  hasHtmlContent,
  type HtmlContentNode,
} from './html-node';
import { SVGRenderer } from './svg-renderer';
import { exportSvg } from '../export/svg-export';
import { VNodePatcher, SVG_NS } from '../vnode/patch';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

const htmlNode = (html: any, size = { width: 200, height: 120 }): NodeModel => {
  const node = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size });
  node.setMetadata('html', html);
  return node;
};

/** Deep-search a VNode tree for any node satisfying `pred`. */
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

describe('Card 4 — html spec plumbing', () => {
  it('detects + serializes the html body via node metadata', () => {
    const node = htmlNode({ text: 'hello' });
    expect(hasHtmlContent(node)).toBe(true);
    const restored = NodeModel.fromJSON(node.serialize());
    expect(getHtmlContent(restored)?.text).toBe('hello');
  });
});

describe('Card 4 — buildHtmlForeignObject', () => {
  it('builds a foreignObject sized to the node with a wrapper div', () => {
    const fo = buildHtmlForeignObject(htmlNode({ text: 'hi' }), 200, 120)!;
    expect(fo.type).toBe('foreignObject');
    expect(fo.props?.width).toBe(200);
    expect(fo.props?.height).toBe(120);
    const div = fo.children![0] as VNode;
    expect(div.type).toBe('div');
    // plain text goes through textContent (never innerHTML)
    const inner = div.children![0] as VNode;
    expect(inner.props?.textContent).toBe('hi');
  });

  it('defaults the wrapper to pointer-events:none (shape below stays hit-testable)', () => {
    const fo = buildHtmlForeignObject(htmlNode({ text: 'x' }), 100, 50)!;
    const div = fo.children![0] as VNode;
    expect((div.props?.style as any).pointerEvents).toBe('none');
  });

  it('opts into pointer events when interactive:true', () => {
    const fo = buildHtmlForeignObject(htmlNode({ text: 'x', interactive: true }), 100, 50)!;
    const div = fo.children![0] as VNode;
    expect((div.props?.style as any).pointerEvents).toBeUndefined();
  });

  it('keys the FO by content hash — same content = same key, change = new key', () => {
    const node = htmlNode({ text: 'A' });
    const a = buildHtmlForeignObject(node, 100, 50)!;
    const a2 = buildHtmlForeignObject(node, 100, 50)!;
    node.setMetadata('html', { text: 'B' });
    const b = buildHtmlForeignObject(node, 100, 50)!;
    // Same node + same content → stable key (opaque subtree preserved).
    expect(a.key).toBe(a2.key);
    // Same node, changed content → new key (opaque subtree replaced).
    expect(a.key).not.toBe(b.key);
  });
});

describe('Card 4 — sanitizeHtmlContent (no innerHTML, allow-listed)', () => {
  it('keeps allow-listed tags and emits text via textContent', () => {
    const v = sanitizeHtmlContent({ tag: 'h3', text: 'Title' })!;
    expect(v.type).toBe('h3');
    expect(v.props?.textContent).toBe('Title');
    expect('innerHTML' in (v.props ?? {})).toBe(false);
  });

  it('downgrades a <script> tag to a harmless <span> (keeps text, drops identity)', () => {
    const v = sanitizeHtmlContent({ tag: 'script', text: 'alert(1)' })!;
    expect(v.type).toBe('span');
  });

  it('strips event-handler attributes and javascript: image sources', () => {
    const spec: HtmlContentNode = {
      tag: 'img',
      attrs: { src: 'javascript:alert(1)', onerror: 'alert(1)', alt: 'ok' },
    };
    const v = sanitizeHtmlContent(spec)!;
    expect(v.props?.['src']).toBeUndefined(); // dangerous src dropped
    expect((v.props as any).onerror).toBeUndefined();
    expect(v.props?.['alt']).toBe('ok'); // allow-listed attr kept
  });

  it('drops dangerous style declarations (url()/expression/javascript:)', () => {
    const v = sanitizeHtmlContent({
      tag: 'div',
      text: 'x',
      style: { color: 'red', background: 'url(javascript:alert(1))' },
    })!;
    expect((v.props?.style as any).color).toBe('red');
    expect((v.props?.style as any).background).toBeUndefined();
  });

  it('recurses into allow-listed children (ERD-style table)', () => {
    const v = sanitizeHtmlContent({
      tag: 'table',
      children: [
        { tag: 'tr', children: [{ tag: 'td', text: 'id' }, { tag: 'td', text: 'int' }] },
      ],
    })!;
    expect(v.type).toBe('table');
    const tr = v.children![0] as VNode;
    expect(tr.type).toBe('tr');
    expect((tr.children![0] as VNode).props?.textContent).toBe('id');
  });
});

describe('Card 4 — participates like a shape (through the real renderer)', () => {
  const build = (extra?: (n: NodeModel) => void) => {
    const engine = new DiagramEngine();
    engine.createDiagram();
    const node = htmlNode({ content: { tag: 'div', text: 'Card body' } });
    node.setMetadata('shape', { type: 'rect' });
    extra?.(node);
    engine.getDiagram()!.addNode(node);
    const tree = new SVGRenderer(engine).render({ x: -50, y: -50, width: 500, height: 500 }, 1);
    return { node, tree };
  };

  it('renders the shape body AND the html foreignObject inside one node group', () => {
    const { node, tree } = build();
    const group = find(tree, (v) => v.key === `node-${node.id}`)!;
    expect(group).toBeTruthy();
    // shape background present
    expect(find(group, (v) => v.type === 'rect')).toBeTruthy();
    // html body present
    expect(find(group, (v) => v.type === 'foreignObject')).toBeTruthy();
    expect(find(group, (v) => v.props?.textContent === 'Card body')).toBeTruthy();
  });

  it('rotates with the node (rotation lives on the group transform)', () => {
    const { node, tree } = build((n) => n.setRotation(30));
    const group = find(tree, (v) => v.key === `node-${node.id}`)!;
    expect(String(group.props?.transform)).toContain('rotate(30');
  });

  it('shows a shape-aware selection highlight when selected', () => {
    const { node, tree } = build((n) => n.setSelected(true));
    const group = find(tree, (v) => v.key === `node-${node.id}`)!;
    expect(find(group, (v) => v.props?.className === 'selection-highlight')).toBeTruthy();
  });
});

describe('Card 4 — VNode patcher keeps the FO opaque', () => {
  it('never diffs into the foreignObject subtree across renders', () => {
    const patcher = new VNodePatcher();
    const container = document.createElementNS(SVG_NS, 'g');
    document.body.appendChild(container);

    const node = htmlNode({ text: 'stable' });
    const tree = (): VNode => ({
      type: 'g',
      key: 'root',
      props: {},
      children: [buildHtmlForeignObject(node, 100, 50)!],
    });

    patcher.reconcile(container, tree());
    const div = container.querySelector('div')!;
    // A host mutates the FO content (simulating a mounted widget).
    div.setAttribute('data-mounted', 'yes');

    patcher.reconcile(container, tree()); // same content hash → same key
    // The opaque subtree survived (not recreated).
    expect(container.querySelector('div')!.getAttribute('data-mounted')).toBe('yes');
    container.remove();
  });
});

describe('Card 4 — headless export reuses the three foreignObject modes', () => {
  const rootWithHtml = (): VNode => {
    const engine = new DiagramEngine();
    engine.createDiagram();
    const node = htmlNode({ content: { tag: 'strong', text: 'Exported' } });
    engine.getDiagram()!.addNode(node);
    return new SVGRenderer(engine).render({ x: -50, y: -50, width: 500, height: 500 }, 1);
  };

  it("'serialize' (default) emits the sanitized HTML into the file", () => {
    const { svg } = exportSvg(rootWithHtml(), { foreignObject: 'serialize' });
    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('Exported'); // data-driven content IS in the tree
  });

  it("'placeholder' swaps the FO for a dashed rect", () => {
    const { svg, warnings } = exportSvg(rootWithHtml(), { foreignObject: 'placeholder' });
    expect(svg).not.toContain('<foreignObject');
    expect(svg).toContain('grafloria-foreign-placeholder');
    expect(warnings.join(' ')).toMatch(/placeholder/i);
  });

  it("'omit' drops the FO entirely", () => {
    const { svg } = exportSvg(rootWithHtml(), { foreignObject: 'omit' });
    expect(svg).not.toContain('<foreignObject');
    expect(svg).not.toContain('Exported');
  });
});
