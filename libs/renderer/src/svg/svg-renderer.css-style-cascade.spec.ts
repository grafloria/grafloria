// SVGRenderer — per-element style cascade in CSS (default) mode
//
// Foundation card ("Styling & theming"): in CSS mode (useCSSMode:true, the
// default), per-element inline LinkStyle/NodeStyle overrides used to be dropped,
// so dashed/thick/translucent links and translucent/rounded nodes rendered as
// theme defaults. These specs pin the fix: per-element overrides win over the
// injected theme CSS, while UNSET properties still fall back to theme defaults.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

/** Recursively find a VNode by its `key`. */
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

/** Recursively find the first descendant whose className contains `token`. */
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

describe('SVGRenderer - per-element style cascade (CSS mode)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    // CSS mode is the default — assert nothing is passed to force it.
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function addConnectedLink(style?: Record<string, unknown>): LinkModel {
    const source = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 50 } });
    const target = new NodeModel({ type: 'basic', position: { x: 300, y: 200 }, size: { width: 100, height: 50 } });
    source.addPort(new PortModel({ id: 'port1', type: 'output', side: 'right' }));
    target.addPort(new PortModel({ id: 'port2', type: 'input', side: 'left' }));
    diagram.addNode(source);
    diagram.addNode(target);

    const link = new LinkModel('port1', 'port2');
    if (style) link.updateStyle(style);
    diagram.addLink(link);
    return link;
  }

  function renderLinkPath(link: LinkModel): any {
    const vnode = renderer.render(VIEWPORT, 1.0) as VNode;
    const group = findVNodeByKey(vnode, `link-${link.id}`);
    expect(group).toBeDefined();
    // The themed path carries the `diagram-link` class (the hit-area path is
    // `link-hit-area`), which is exactly the element the theme CSS targets.
    return findByClassToken(group, 'diagram-link');
  }

  function renderNodeShape(node: NodeModel): any {
    const vnode = renderer.render(VIEWPORT, 1.0) as VNode;
    const group = findVNodeByKey(vnode, `node-${node.id}`);
    expect(group).toBeDefined();
    return findByClassToken(group, 'diagram-node');
  }

  describe('links', () => {
    it('emits per-link strokeWidth, strokeDasharray and opacity as INLINE style (beats theme CSS)', () => {
      const link = addConnectedLink({ strokeWidth: 4, strokeDasharray: '6,3', opacity: 0.5 });

      const path = renderLinkPath(link);
      expect(path).toBeDefined();
      // Inline `style` attribute is required: a stroke-width presentation
      // attribute would lose to the `.diagram-link { stroke-width }` rule.
      expect(typeof path.props.style).toBe('string');
      expect(path.props.style).toContain('stroke-width: 4');
      expect(path.props.style).toContain('stroke-dasharray: 6,3');
      expect(path.props.style).toContain('opacity: 0.5');
    });

    it('still forwards per-link stroke colour and keeps the diagram-link class', () => {
      const link = addConnectedLink({ stroke: '#ff0000', strokeWidth: 2 });

      const path = renderLinkPath(link);
      expect(path.props.stroke).toBe('#ff0000');
      expect(path.props.className).toContain('diagram-link');
    });

    it('falls back to theme defaults for UNSET link properties (no inline style emitted)', () => {
      const link = addConnectedLink(); // no per-element style at all

      const path = renderLinkPath(link);
      // Nothing per-element set → no inline style override → the injected
      // `.diagram-link` theme CSS supplies stroke-width/dash/opacity defaults.
      expect(path.props.style).toBeUndefined();
    });

    it('only emits the properties that are explicitly set (partial override)', () => {
      const link = addConnectedLink({ strokeDasharray: '2,2' }); // dash only

      const path = renderLinkPath(link);
      expect(path.props.style).toContain('stroke-dasharray: 2,2');
      // strokeWidth / opacity were NOT set → must not appear (theme default wins).
      expect(path.props.style).not.toContain('stroke-width');
      expect(path.props.style).not.toContain('opacity');
    });
  });

  describe('nodes', () => {
    it('forwards per-node opacity and borderRadius (rx) in CSS mode', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 120, y: 120 }, size: { width: 120, height: 60 } });
      node.setStyle({ opacity: 0.6, borderRadius: 8 });
      diagram.addNode(node);

      const rect = renderNodeShape(node);
      expect(rect).toBeDefined();
      expect(rect.props.opacity).toBe(0.6);
      expect(rect.props.rx).toBe(8);
    });

    it('keeps per-node fill/stroke/strokeWidth working alongside opacity/borderRadius', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 120, y: 120 }, size: { width: 120, height: 60 } });
      node.setStyle({ fill: '#abcdef', stroke: '#123456', strokeWidth: 3, opacity: 0.8, borderRadius: 4 });
      diagram.addNode(node);

      const rect = renderNodeShape(node);
      // fill/stroke/strokeWidth ride the inline style string (pre-existing path)…
      expect(rect.props.style).toContain('fill: #abcdef');
      expect(rect.props.style).toContain('stroke: #123456');
      expect(rect.props.style).toContain('stroke-width: 3');
      // …while opacity + rx are forwarded as presentation attributes.
      expect(rect.props.opacity).toBe(0.8);
      expect(rect.props.rx).toBe(4);
    });

    it('falls back to theme defaults for UNSET node properties (no opacity/rx emitted)', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 120, y: 120 }, size: { width: 120, height: 60 } });
      // no per-element style set
      diagram.addNode(node);

      const rect = renderNodeShape(node);
      expect(rect).toBeDefined();
      expect(rect.props.className).toContain('diagram-node');
      expect(rect.props.opacity).toBeUndefined();
      expect(rect.props.rx).toBeUndefined();
    });
  });
});
