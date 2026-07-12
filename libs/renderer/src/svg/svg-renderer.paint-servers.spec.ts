// SVGRenderer — first-class SVG paint servers (Styling & theming, Card 2)
//
// A node/link style.fill or style.stroke that is a gradient/pattern SPEC OBJECT
// (not a colour string), or a style.shadow that is a Shadow spec, is materialised
// as a `<linearGradient>` / `<radialGradient>` / `<pattern>` / `<filter>` inside a
// single deduped `<defs>` block and referenced via url(#grafloria-def-<hash>). Two
// identical specs share ONE def.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { VNode } from '../types';
import { isPaintSpec, isShadowSpec, paintDefId } from './paint-servers';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function findVNodeByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findVNodeByKey(child, key);
      if (found) return found;
    }
  }
  return undefined;
}

function findByClassToken(vnode: any, token: string): any {
  if (!vnode) return undefined;
  const cls = vnode.props?.className;
  if (typeof cls === 'string' && cls.split(/\s+/).includes(token)) return vnode;
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findByClassToken(child, token);
      if (found) return found;
    }
  }
  return undefined;
}

const LINEAR = {
  type: 'linear' as const,
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 1,
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff', opacity: 0.5 },
  ],
};

const RADIAL = {
  type: 'radial' as const,
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
  stops: [
    { offset: 0, color: '#ffffff' },
    { offset: 1, color: '#000000' },
  ],
};

describe('SVGRenderer - SVG paint servers (deduped defs)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    renderer = new SVGRenderer(engine, {}); // CSS mode + caching (defaults)
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function addNode(x: number, y: number, style?: Record<string, unknown>): NodeModel {
    const node = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    if (style) node.setStyle(style as any);
    diagram.addNode(node);
    return node;
  }

  function addLink(style?: Record<string, unknown>): LinkModel {
    const s = addNode(100, 100);
    const t = addNode(320, 220);
    s.addPort(new PortModel({ id: 'p1', type: 'output', side: 'right' }));
    t.addPort(new PortModel({ id: 'p2', type: 'input', side: 'left' }));
    const link = new LinkModel('p1', 'p2');
    if (style) link.updateStyle(style as any);
    diagram.addLink(link);
    return link;
  }

  function render(): VNode {
    return renderer.render(VIEWPORT, 1.0) as VNode;
  }

  function defsOf(root: VNode): VNode {
    const defs = findVNodeByKey(root, 'defs');
    expect(defs).toBeDefined();
    expect(defs.type).toBe('defs');
    return defs;
  }

  it('the SVG root always carries a <defs> child (empty when nothing needs one)', () => {
    addNode(10, 10, { fill: '#abcdef' });
    const defs = defsOf(render());
    expect(defs.children).toEqual([]);
  });

  it('a gradient fill produces ONE deduped <defs> entry + a url(#) reference', () => {
    const node = addNode(120, 120, { fill: LINEAR });
    const root = render();
    const defs = defsOf(root);

    // Exactly one def, a linearGradient with the hashed id.
    expect(defs.children!.length).toBe(1);
    const grad = defs.children![0];
    expect(grad.type).toBe('linearGradient');
    const id = grad.props['id'] as string;
    expect(id).toMatch(/^grafloria-def-/);
    expect(id).toBe(paintDefId(LINEAR)); // id is a stable hash of the spec
    // Two stops, second carries stop-opacity.
    expect(grad.children!.length).toBe(2);
    expect(grad.children![0].props['stop-color']).toBe('#ff0000');
    expect(grad.children![1].props['stop-opacity']).toBe(0.5);

    // The node's shape references the def via url(#id).
    const shape = findByClassToken(findVNodeByKey(root, `node-${node.id}`), 'diagram-node');
    const fillRef = `url(#${id})`;
    expect(String(shape.props.style ?? shape.props.fill)).toContain(fillRef);
  });

  it('identical fills on two nodes share ONE def', () => {
    addNode(10, 10, { fill: LINEAR });
    addNode(200, 200, { fill: { ...LINEAR } }); // structurally identical
    const defs = defsOf(render());
    expect(defs.children!.length).toBe(1);
  });

  it('different fills produce distinct defs', () => {
    addNode(10, 10, { fill: LINEAR });
    addNode(200, 200, { fill: RADIAL });
    const defs = defsOf(render());
    expect(defs.children!.length).toBe(2);
    const types = defs.children!.map((c) => c.type).sort();
    expect(types).toEqual(['linearGradient', 'radialGradient']);
  });

  it('materialises a radial gradient', () => {
    addNode(10, 10, { fill: RADIAL });
    const defs = defsOf(render());
    const grad = defs.children![0];
    expect(grad.type).toBe('radialGradient');
    expect(grad.props.cx).toBe(0.5);
    expect(grad.props.r).toBe(0.5);
  });

  it('routes a gradient node STROKE (not just fill) through the resolver', () => {
    addNode(10, 10, { stroke: RADIAL });
    const defs = defsOf(render());
    expect(defs.children!.length).toBe(1);
    expect(defs.children![0].type).toBe('radialGradient');
  });

  it('materialises a pattern fill as a <pattern> in userSpaceOnUse', () => {
    addNode(10, 10, { fill: { type: 'dots', color: '#333', size: 2, spacing: 8 } });
    const defs = defsOf(render());
    const pat = defs.children![0];
    expect(pat.type).toBe('pattern');
    expect(pat.props['patternUnits']).toBe('userSpaceOnUse');
    expect(pat.props.width).toBe(8);
    expect(pat.children!.some((c) => c.type === 'circle')).toBe(true);
  });

  it('materialises a Shadow spec as a <filter> with feDropShadow + filter reference', () => {
    const shadow = { offsetX: 2, offsetY: 3, blur: 4, color: '#00000088' };
    const node = addNode(10, 10, { shadow });
    const root = render();
    const defs = defsOf(root);
    const filter = defs.children![0];
    expect(filter.type).toBe('filter');
    const drop = filter.children![0];
    expect(drop.type).toBe('feDropShadow');
    expect(drop.props['dx']).toBe(2);
    expect(drop.props['stdDeviation']).toBe(4);
    expect(drop.props['flood-color']).toBe('#00000088');

    // Node shape carries filter="url(#id)".
    const shape = findByClassToken(findVNodeByKey(root, `node-${node.id}`), 'diagram-node');
    expect(shape.props['filter']).toBe(`url(#${paintDefId(shadow)})`);
  });

  it('routes a gradient link stroke through the resolver', () => {
    const link = addLink({ stroke: LINEAR });
    const root = render();
    const defs = defsOf(root);
    expect(defs.children!.length).toBe(1);
    const id = defs.children![0].props['id'];
    const path = findByClassToken(findVNodeByKey(root, `link-${link.id}`), 'diagram-link');
    expect(path.props.stroke).toBe(`url(#${id})`);
  });

  it('a plain colour string never creates a def (regression)', () => {
    addNode(10, 10, { fill: '#abcdef', stroke: '#123456' });
    const defs = defsOf(render());
    expect(defs.children).toEqual([]);
  });

  it('re-registers defs across frames despite caching (paint-server nodes bypass the cache)', () => {
    addNode(120, 120, { fill: LINEAR });
    // First frame populates the def; second frame (node now clean) must NOT lose it.
    render();
    const defs = defsOf(render());
    expect(defs.children!.length).toBe(1);
    expect(defs.children![0].type).toBe('linearGradient');
  });
});

describe('paint-servers helpers', () => {
  it('isPaintSpec distinguishes spec objects from colour strings', () => {
    expect(isPaintSpec('#fff')).toBe(false);
    expect(isPaintSpec(undefined)).toBe(false);
    expect(isPaintSpec(LINEAR)).toBe(true);
    expect(isPaintSpec({ type: 'dots' })).toBe(true);
    expect(isPaintSpec({ type: 'nope' })).toBe(false);
  });

  it('isShadowSpec distinguishes a Shadow object from the legacy boolean', () => {
    expect(isShadowSpec(true)).toBe(false);
    expect(isShadowSpec(false)).toBe(false);
    expect(isShadowSpec({ offsetX: 1, offsetY: 1, blur: 2, color: '#000' })).toBe(true);
  });

  it('paintDefId is stable across key order and distinct across specs', () => {
    const a = { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [] };
    const b = { stops: [], y1: 0, x1: 0, type: 'linear', y2: 1, x2: 1 };
    expect(paintDefId(a)).toBe(paintDefId(b));
    expect(paintDefId(a)).not.toBe(paintDefId(RADIAL));
  });
});
