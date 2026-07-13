// SVGRenderer — named style classes (classDef / linkStyle equivalent) + THE cascade
//
// Styling & theming, Card "Named style classes".
//
//   defineStyle('critical', { stroke: '#ef4444', strokeWidth: 3 })
//   node.setStyle({ styleClass: 'critical' })
//
// The cascade, lowest → highest (themes/style-cascade.ts):
//
//     theme  <  type-default  <  named-class  <  element-inline  <  state
//
// Application model: INLINE-RESOLVED. Layers 2–5 are resolved by one ordered
// spread and emitted on the element; only the theme layer stays in the
// stylesheet. So `state` beats `element-inline` (a selected node paints its
// selection colours even when it carries its own fill) — which is what the
// cascade documents, and what mainstream libraries do.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import {
  LIGHT_THEME,
  clearStyles,
  defineStyle,
  defineStyles,
  getStyle,
  hasStyle,
  listStyles,
  removeStyle,
  resolveLinkStyle,
  resolveNodeStyle,
} from '../themes';
import type { Theme, VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function findVNodeByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findVNodeByKey(child, key);
    if (found) return found;
  }
  return undefined;
}

function findByClassToken(vnode: any, token: string): any {
  if (!vnode) return undefined;
  const cls = vnode.props?.className;
  if (typeof cls === 'string' && cls.split(/\s+/).includes(token)) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findByClassToken(child, token);
    if (found) return found;
  }
  return undefined;
}

/** A theme with per-TYPE defaults — `theme.nodes[type]` / `theme.links[type]`. */
const TYPED_THEME: Theme = {
  ...LIGHT_THEME,
  nodes: {
    ...LIGHT_THEME.nodes,
    decision: { fill: '#f0f0f0', stroke: '#333333', strokeWidth: 4 },
  },
  links: {
    ...LIGHT_THEME.links,
    orthogonal: { stroke: '#00aa00', strokeDasharray: '1,1' },
  },
};

describe('SVGRenderer - named style classes + cascade', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    clearStyles();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    renderer = new SVGRenderer(engine, {}); // CSS mode (default)
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
    clearStyles();
  });

  function addNode(style?: Record<string, unknown>, type = 'basic'): NodeModel {
    const node = new NodeModel({ type, position: { x: 100, y: 100 }, size: { width: 100, height: 50 } });
    if (style) node.setStyle(style);
    diagram.addNode(node);
    return node;
  }

  function addLink(style?: Record<string, unknown>, pathType?: 'direct' | 'orthogonal' | 'smooth' | 'bezier'): LinkModel {
    const source = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 50 } });
    const target = new NodeModel({ type: 'basic', position: { x: 400, y: 300 }, size: { width: 100, height: 50 } });
    source.addPort(new PortModel({ id: `p-out-${Math.random()}`, type: 'output', side: 'right' }));
    target.addPort(new PortModel({ id: `p-in-${Math.random()}`, type: 'input', side: 'left' }));
    diagram.addNode(source);
    diagram.addNode(target);

    const sourcePort = Array.from(source.getPorts().values())[0];
    const targetPort = Array.from(target.getPorts().values())[0];
    const link = new LinkModel(sourcePort.id, targetPort.id, pathType);
    if (style) link.updateStyle(style);
    diagram.addLink(link);
    return link;
  }

  /** The node body VNode (the shape registry hoists fill/stroke into props.style). */
  function nodeShape(node: NodeModel): any {
    const root = renderer.render(VIEWPORT, 1) as VNode;
    return findByClassToken(findVNodeByKey(root, `node-${node.id}`), 'diagram-node');
  }

  function linkPath(link: LinkModel): any {
    const root = renderer.render(VIEWPORT, 1) as VNode;
    return findByClassToken(findVNodeByKey(root, `link-${link.id}`), 'diagram-link');
  }

  // =========================================================================
  // The registry
  // =========================================================================
  describe('style registry', () => {
    it('defines, reads back, lists and removes named styles', () => {
      expect(hasStyle('critical')).toBe(false);

      defineStyle('critical', { stroke: '#ef4444', strokeWidth: 3 });

      expect(hasStyle('critical')).toBe(true);
      expect(getStyle('critical')).toEqual({ stroke: '#ef4444', strokeWidth: 3 });
      expect(listStyles()).toEqual(['critical']);

      expect(removeStyle('critical')).toBe(true);
      expect(hasStyle('critical')).toBe(false);
      expect(removeStyle('critical')).toBe(false);
    });

    it('copies the definition (later mutation of the caller\'s object does nothing)', () => {
      const style = { fill: '#111111' };
      defineStyle('copied', style);
      style.fill = '#999999';

      expect(getStyle('copied')).toEqual({ fill: '#111111' });
    });

    it('defineStyles registers a whole sheet at once', () => {
      defineStyles({ a: { fill: '#aaaaaa' }, b: { fill: '#bbbbbb' } });
      expect(listStyles().sort()).toEqual(['a', 'b']);
    });
  });

  // =========================================================================
  // The cascade, as a pure function (one ordered spread)
  // =========================================================================
  describe('resolveNodeStyle - ordered spread', () => {
    it('theme < type-default: theme.nodes[type] overrides the base', () => {
      const node = new NodeModel({ type: 'decision', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      const resolved = resolveNodeStyle(node, TYPED_THEME, { includeThemeBase: true });

      expect(resolved.fill).toBe('#f0f0f0'); // type default, not theme base #ffffff
      expect(resolved.strokeWidth).toBe(4);
      // Untouched base properties survive.
      expect(resolved.borderRadius).toBe(TYPED_THEME.nodes.default.borderRadius);
    });

    it('type-default < named-class', () => {
      defineStyle('critical', { fill: '#ef4444' });
      const node = new NodeModel({ type: 'decision', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setStyle({ styleClass: 'critical' });

      const resolved = resolveNodeStyle(node, TYPED_THEME, { includeThemeBase: true });
      expect(resolved.fill).toBe('#ef4444'); // named class beat the type default
      expect(resolved.stroke).toBe('#333333'); // …but the type default still supplies the rest
    });

    it('named-class < element-inline', () => {
      defineStyle('critical', { fill: '#ef4444', strokeWidth: 3 });
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setStyle({ styleClass: 'critical', fill: '#00ff00' });

      const resolved = resolveNodeStyle(node, LIGHT_THEME);
      expect(resolved.fill).toBe('#00ff00'); // own property wins
      expect(resolved.strokeWidth).toBe(3); // untouched named-class property survives
    });

    it('element-inline < state (selection wins over an own fill)', () => {
      defineStyle('critical', { fill: '#ef4444' });
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setStyle({ styleClass: 'critical', fill: '#00ff00' });
      node.setSelected(true);

      const resolved = resolveNodeStyle(node, LIGHT_THEME);
      expect(resolved.fill).toBe(LIGHT_THEME.colors.node.selected.fill);
      expect(resolved.stroke).toBe(LIGHT_THEME.colors.node.selected.stroke);
    });

    it('selected beats highlighted (state layer is exclusive, strongest first)', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setSelected(true);
      node.setHighlighted(true);

      expect(resolveNodeStyle(node, LIGHT_THEME).fill).toBe(LIGHT_THEME.colors.node.selected.fill);
    });

    it('a later name in a styleClass LIST wins', () => {
      defineStyles({ base: { fill: '#111111', stroke: '#222222' }, accent: { fill: '#333333' } });
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setStyle({ styleClass: 'base accent' });

      const resolved = resolveNodeStyle(node, LIGHT_THEME);
      expect(resolved.fill).toBe('#333333');
      expect(resolved.stroke).toBe('#222222');
    });

    it('an unknown style name is ignored (no throw)', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setStyle({ styleClass: 'nope', fill: '#abcdef' });

      expect(resolveNodeStyle(node, LIGHT_THEME).fill).toBe('#abcdef');
    });

    it('CSS mode omits the theme base (the stylesheet paints it) — nothing set → nothing resolved', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      expect(resolveNodeStyle(node, LIGHT_THEME)).toEqual({});
    });

    it('never leaks the meta keys (className / styleClass) into paint properties', () => {
      defineStyle('critical', { fill: '#ef4444' });
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
      node.setStyle({ styleClass: 'critical', className: 'my-class' });

      const resolved = resolveNodeStyle(node, LIGHT_THEME) as Record<string, unknown>;
      expect(resolved['styleClass']).toBeUndefined();
      expect(resolved['className']).toBeUndefined();
    });
  });

  describe('resolveLinkStyle - ordered spread', () => {
    it('applies theme.links[pathType] as the type default', () => {
      const link = new LinkModel('a', 'b', 'orthogonal');
      const resolved = resolveLinkStyle(link, TYPED_THEME, { includeThemeBase: true });

      expect(resolved.stroke).toBe('#00aa00');
      expect(resolved.strokeDasharray).toBe('1,1');
      expect(resolved.strokeWidth).toBe(TYPED_THEME.links.default.strokeWidth);
    });

    it('an explicit `type` metadata key beats the path type', () => {
      const link = new LinkModel('a', 'b', 'smooth');
      link.setMetadata('type', 'orthogonal');

      expect(resolveLinkStyle(link, TYPED_THEME).stroke).toBe('#00aa00');
    });

    it('type-default < named-class < element-inline < state', () => {
      defineStyle('critical', { stroke: '#ef4444', strokeWidth: 3 });
      const link = new LinkModel('a', 'b', 'orthogonal');
      link.updateStyle({ styleClass: 'critical' });

      // named class beats the type default
      expect(resolveLinkStyle(link, TYPED_THEME).stroke).toBe('#ef4444');

      // element-inline beats the named class
      link.updateStyle({ stroke: '#0000ff' });
      expect(resolveLinkStyle(link, TYPED_THEME).stroke).toBe('#0000ff');
      expect(resolveLinkStyle(link, TYPED_THEME).strokeWidth).toBe(3); // still from the class

      // state beats everything
      link.setState('selected');
      expect(resolveLinkStyle(link, TYPED_THEME).stroke).toBe(TYPED_THEME.colors.link.selected);
      expect(resolveLinkStyle(link, TYPED_THEME).strokeWidth).toBe(3);
    });
  });

  // =========================================================================
  // What the renderer actually emits
  // =========================================================================
  describe('nodes (CSS mode)', () => {
    it('applies a named style to the rendered node', () => {
      defineStyle('critical', { fill: '#ef4444', stroke: '#7f1d1d', strokeWidth: 3, opacity: 0.9, borderRadius: 6 });
      const node = addNode({ styleClass: 'critical' });

      const shape = nodeShape(node);
      expect(shape.props.style).toContain('fill: #ef4444');
      expect(shape.props.style).toContain('stroke: #7f1d1d');
      expect(shape.props.style).toContain('stroke-width: 3');
      expect(shape.props.opacity).toBe(0.9);
      expect(shape.props.rx).toBe(6);
    });

    it('emits a marker class per applied named style', () => {
      defineStyles({ critical: { fill: '#ef4444' }, dashed: { strokeDasharray: '4,2' } });
      const node = addNode({ styleClass: 'critical dashed' });

      const classes = nodeShape(node).props.className.split(/\s+/);
      expect(classes).toContain('diagram-node');
      expect(classes).toContain('grafloria-style-critical');
      expect(classes).toContain('grafloria-style-dashed');
    });

    it('puts style.className verbatim on the element (className on every element)', () => {
      const node = addNode({ className: 'my-node highlight-me' });

      const classes = nodeShape(node).props.className.split(/\s+/);
      expect(classes).toContain('my-node');
      expect(classes).toContain('highlight-me');
      expect(classes).toContain('diagram-node');
    });

    it('renders the model\'s own class set (node.addClass), which was silently dropped before', () => {
      const node = addNode();
      node.addClass('flagged');

      expect(nodeShape(node).props.className.split(/\s+/)).toContain('flagged');
    });

    it('element-inline beats the named class', () => {
      defineStyle('critical', { fill: '#ef4444', strokeWidth: 3 });
      const node = addNode({ styleClass: 'critical', fill: '#00ff00' });

      const shape = nodeShape(node);
      expect(shape.props.style).toContain('fill: #00ff00');
      expect(shape.props.style).toContain('stroke-width: 3'); // untouched class property survives
    });

    it('state beats BOTH the named class and element-inline', () => {
      defineStyle('critical', { fill: '#ef4444' });
      const node = addNode({ styleClass: 'critical', fill: '#00ff00' });
      node.setSelected(true);

      const shape = nodeShape(node);
      expect(shape.props.style).toContain(`fill: ${LIGHT_THEME.colors.node.selected.fill}`);
      expect(shape.props.style).toContain(`stroke: ${LIGHT_THEME.colors.node.selected.stroke}`);
      expect(shape.props.className.split(/\s+/)).toContain('selected');
    });

    it('theme type-defaults reach the element (theme.nodes[type] was never read before)', () => {
      renderer.setTheme(TYPED_THEME);
      const node = addNode(undefined, 'decision');

      const shape = nodeShape(node);
      expect(shape.props.style).toContain('fill: #f0f0f0');
      expect(shape.props.style).toContain('stroke: #333333');
    });

    it('a node with NO styling still emits nothing inline (theme stylesheet paints it)', () => {
      const node = addNode();

      const shape = nodeShape(node);
      expect(shape.props.style).toBeUndefined();
      expect(shape.props.opacity).toBeUndefined();
      expect(shape.props.rx).toBeUndefined();
      expect(shape.props.className).toContain('diagram-node');
    });
  });

  describe('links (CSS mode)', () => {
    it('applies a named style, and keeps it INLINE so it beats the theme rule', () => {
      defineStyle('critical', { stroke: '#ef4444', strokeWidth: 3, strokeDasharray: '6,3', opacity: 0.8 });
      const link = addLink({ styleClass: 'critical' });

      const path = linkPath(link);
      expect(path.props.stroke).toBe('#ef4444');
      expect(path.props.style).toContain('stroke: #ef4444');
      expect(path.props.style).toContain('stroke-width: 3');
      expect(path.props.style).toContain('stroke-dasharray: 6,3');
      expect(path.props.style).toContain('opacity: 0.8');
      expect(path.props.className.split(/\s+/)).toContain('grafloria-style-critical');
    });

    it('element-inline beats the named class; state beats both', () => {
      defineStyle('critical', { stroke: '#ef4444', strokeWidth: 3 });
      const link = addLink({ styleClass: 'critical', stroke: '#0000ff' });

      expect(linkPath(link).props.stroke).toBe('#0000ff');

      link.setState('selected');
      const selected = linkPath(link);
      expect(selected.props.stroke).toBe(LIGHT_THEME.colors.link.selected);
      expect(selected.props.style).toContain(`stroke: ${LIGHT_THEME.colors.link.selected}`);
    });

    it('puts style.className verbatim on the path', () => {
      const link = addLink({ className: 'my-link' });
      expect(linkPath(link).props.className.split(/\s+/)).toContain('my-link');
    });
  });

  describe('programmatic (Canvas) mode', () => {
    it('resolves the SAME cascade, with the theme base included', () => {
      renderer.dispose();
      renderer = new SVGRenderer(engine, { useCSSMode: false }, TYPED_THEME);

      defineStyle('critical', { fill: '#ef4444' });
      const node = addNode({ styleClass: 'critical' }, 'decision');

      const root = renderer.render(VIEWPORT, 1) as VNode;
      // The node BODY: the group also holds the drop-shadow rect (`node-shadow`)
      // and, when selected, the selection outline — both carry a className.
      const shape = findVNodeByKey(root, `node-${node.id}`).children.find(
        (c: VNode) => c.type === 'rect' && !c.props.className
      );

      // The shape registry hoists fill/stroke/strokeWidth into an inline style
      // string in both modes; rx stays a presentation attribute.
      expect(shape.props.style).toContain('fill: #ef4444'); // named class
      expect(shape.props.style).toContain('stroke: #333333'); // type default
      expect(shape.props.style).toContain('stroke-width: 4'); // type default
      expect(shape.props.rx).toBe(TYPED_THEME.nodes.default.borderRadius); // theme base
    });
  });

  // =========================================================================
  // Redefining a style has to invalidate what the renderer cached
  // =========================================================================
  describe('registry changes invalidate cached VNodes', () => {
    it('re-renders with the new values after defineStyle()', () => {
      defineStyle('critical', { fill: '#ef4444' });
      const node = addNode({ styleClass: 'critical' });

      expect(nodeShape(node).props.style).toContain('fill: #ef4444');

      // Same node, same cache key — only the definition changed.
      defineStyle('critical', { fill: '#00ff00' });
      expect(nodeShape(node).props.style).toContain('fill: #00ff00');
    });

    it('stops applying a removed style', () => {
      defineStyle('critical', { fill: '#ef4444' });
      const node = addNode({ styleClass: 'critical' });
      expect(nodeShape(node).props.style).toContain('fill: #ef4444');

      removeStyle('critical');
      expect(nodeShape(node).props.style).toBeUndefined();
    });
  });
});
