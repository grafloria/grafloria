// Card "Theme-bound properties" — END TO END, through the real renderer.
//
// The primitive is unit-tested in themes/theme-ref.spec.ts. THIS file exists
// because the recurring bug in this capability has always been the same shape:
// "the config existed but nothing ever read it" (`theme.nodes[type]` was never
// read; `NodeModel.addClass()` never rendered). So every assertion here starts
// from a real SVGRenderer.render() and reads the EMITTED VNode.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { clearStyles, defineStyle, DARK_THEME, LIGHT_THEME, themeRef } from '../themes';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

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

function findByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findByKey(child, key);
    if (found) return found;
  }
  return undefined;
}

/**
 * The node's BODY, structurally — for programmatic mode, which emits no classes.
 *
 * The decorations that surround it DO keep their classes in both modes, so they
 * are what we skip: the drop-shadow rect (a black rect emitted BEFORE the body)
 * and the selection ring.
 */
const SHAPE_ELEMENTS = new Set(['rect', 'ellipse', 'circle', 'polygon']);
const DECORATIONS = new Set(['node-shadow', 'selection-highlight', 'node-selection']);

function findShapeElement(vnode: any): any {
  if (!vnode) return undefined;
  const className = vnode.props?.className;
  const isDecoration = typeof className === 'string' && DECORATIONS.has(className);
  if (SHAPE_ELEMENTS.has(vnode.type) && !isDecoration) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findShapeElement(child);
    if (found) return found;
  }
  return undefined;
}

/** A painted value, whether it landed on the attribute or in the inline style string. */
function paintOf(vnode: any, prop: 'fill' | 'stroke' | 'stroke-width'): string | undefined {
  const attr = prop === 'stroke-width' ? vnode?.props?.strokeWidth : vnode?.props?.[prop];
  if (attr !== undefined) return String(attr);

  const style = vnode?.props?.style;
  if (typeof style !== 'string') return undefined;
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    if (decl.slice(0, colon).trim() === prop) return decl.slice(colon + 1).trim();
  }
  return undefined;
}

describe('SVGRenderer — theme-bound properties (themeRef)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    clearStyles();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
    clearStyles();
    document.head.querySelectorAll('style[id^="grafloria-renderer-"]').forEach(el => el.remove());
  });

  function addNode(style: Record<string, unknown> = {}, type = 'basic'): NodeModel {
    const node = new NodeModel({ type, position: { x: 100, y: 100 }, size: { width: 100, height: 50 } });
    node.setStyle(style as any);
    diagram.addNode(node);
    return node;
  }

  function addLink(style: Record<string, unknown> = {}): LinkModel {
    const source = new NodeModel({ type: 'basic', position: { x: 50, y: 50 }, size: { width: 80, height: 40 } });
    const target = new NodeModel({ type: 'basic', position: { x: 300, y: 200 }, size: { width: 80, height: 40 } });
    source.addPort(new PortModel({ id: 'p-out', type: 'output', side: 'right' }));
    target.addPort(new PortModel({ id: 'p-in', type: 'input', side: 'left' }));
    diagram.addNode(source);
    diagram.addNode(target);

    const link = new LinkModel('p-out', 'p-in');
    link.updateStyle(style as any);
    diagram.addLink(link);
    return link;
  }

  function nodeBody(node: NodeModel): any {
    const root = renderer.render(VIEWPORT, 1) as VNode;
    // CSS mode tags the body `diagram-node`; programmatic mode emits no classes
    // at all, so fall back to the shape element inside the node's group.
    return findByClassToken(root, 'diagram-node') ?? findShapeElement(findByKey(root, `node-${node.id}`));
  }

  function linkPath(link: LinkModel): any {
    const root = renderer.render(VIEWPORT, 1) as VNode;
    const group = findByKey(root, `link-${link.id}`);
    if (!group) return undefined;
    return (
      findByClassToken(group, 'diagram-link') ??
      // Programmatic mode emits no `diagram-link` class — but the invisible
      // hit-area path IS still classed, so skip it explicitly rather than taking
      // the first path (which is the hit area: 12px wide and transparent).
      (group.children ?? []).find(
        (child: any) =>
          child.type === 'path' && child.props?.d && child.props?.className !== 'link-hit-area'
      )
    );
  }

  // =========================================================================
  // CSS mode — bound properties become var() references, so a theme swap is a
  // variable rebind rather than a rebuild.
  // =========================================================================
  describe('CSS mode', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
    });

    it('a bound node fill REACHES the emitted element as a var() reference', () => {
      const node = addNode({ fill: themeRef('category.critical') });
      const body = nodeBody(node);

      // The critical assertion: it landed in an inline STYLE string. A
      // presentation attribute cannot hold var() — `fill="var(--x)"` is invalid
      // and the shape would paint black.
      expect(body.props.style).toContain('fill: var(--grafloria-category-critical');
      // …with the active theme's literal as the fallback.
      expect(body.props.style).toContain(LIGHT_THEME.categories!.critical!);
    });

    it('a bound strokeWidth reaches it too (numbers, not just colours)', () => {
      const node = addNode({ stroke: themeRef('category.accent'), strokeWidth: themeRef('numbers.emphasis') });
      const body = nodeBody(node);

      expect(body.props.style).toContain('stroke: var(--grafloria-category-accent');
      expect(body.props.style).toContain('stroke-width: var(--grafloria-numbers-emphasis, 3)');
    });

    it('a bound LINK stroke reaches the path', () => {
      const link = addLink({ stroke: themeRef('category.critical'), strokeWidth: themeRef('numbers.heavy') });
      const path = linkPath(link);

      expect(path.props.style).toContain('stroke: var(--grafloria-category-critical');
      expect(path.props.style).toContain('stroke-width: var(--grafloria-numbers-heavy, 4)');
    });

    it('THE POINT: the same model paints a different colour under a different theme', () => {
      const node = addNode({ fill: themeRef('category.critical') });

      expect(nodeBody(node).props.style).toContain(LIGHT_THEME.categories!.critical!);

      renderer.setTheme(DARK_THEME);
      const dark = nodeBody(node).props.style;

      expect(dark).toContain(DARK_THEME.categories!.critical!);
      expect(dark).not.toContain(LIGHT_THEME.categories!.critical!);
    });

    it('works through a NAMED STYLE (defineStyle), not just an inline style', () => {
      defineStyle('critical', {
        stroke: themeRef('category.critical'),
        strokeWidth: themeRef('numbers.emphasis'),
      });
      const node = addNode({ styleClass: 'critical' });

      const body = nodeBody(node);
      expect(body.props.style).toContain('stroke: var(--grafloria-category-critical');
      expect(body.props.style).toContain('stroke-width: var(--grafloria-numbers-emphasis, 3)');
    });

    it('works through a THEME TYPE-DEFAULT (theme.nodes[type])', () => {
      const typed = {
        ...LIGHT_THEME,
        nodes: { ...LIGHT_THEME.nodes, decision: { fill: themeRef('category.warning') } },
      };
      renderer.dispose();
      renderer = new SVGRenderer(engine, {}, typed as any);

      const node = addNode({}, 'decision');
      expect(nodeBody(node).props.style).toContain('fill: var(--grafloria-category-warning');
    });

    it('respects the cascade: element-inline beats a named class, STATE beats both', () => {
      defineStyle('critical', { fill: themeRef('category.critical') });
      const node = addNode({ styleClass: 'critical', fill: themeRef('category.info') });

      // element-inline wins over the named class
      expect(nodeBody(node).props.style).toContain('fill: var(--grafloria-category-info');

      // …and the state layer wins over BOTH (it is the top of the cascade)
      node.setState({ selected: true });
      const selected = nodeBody(node);
      expect(selected.props.style).toContain(`fill: ${LIGHT_THEME.colors.node.selected.fill}`);
      expect(selected.props.style).not.toContain('--grafloria-category-info');
    });

    it('a bound property on an ELLIPSE (a presentation-attribute shape) is HOISTED to style', () => {
      // Ellipse/hexagon spread their paints as presentation ATTRIBUTES, where
      // var() is invalid and the shape would paint black. This is the latent trap
      // the theme-bound card walked into; the shape registry now hoists them.
      const node = addNode({ fill: themeRef('category.success') });
      node.setMetadata('shape', { type: 'ellipse' });
      const body = nodeBody(node);

      expect(body.type).toBe('ellipse');
      expect(String(body.props.style)).toContain('fill: var(--grafloria-category-success');
      // …and the invalid ATTRIBUTE is gone.
      expect(body.props.fill).toBeUndefined();
    });

    it('an unresolvable token drops the property (so the theme still paints it)', () => {
      const node = addNode({ fill: themeRef('category.does-not-exist') });
      const body = nodeBody(node);

      // No `fill: undefined`, no `var(--nonexistent)` — nothing at all, so the
      // `.diagram-node { fill: var(--grafloria-node-fill) }` rule wins, which is the
      // correct fallback.
      const style = String(body.props.style ?? '');
      expect(style).not.toContain('undefined');
      expect(style).not.toContain('does-not-exist');
      expect(body.props.fill).toBeUndefined();
    });
  });

  // =========================================================================
  // LATENT BUG (found building this card, fixed here).
  //
  // `renderNodeShape()` spread the shape config's paints ON TOP of the fully
  // resolved cascade:
  //
  //     const shapeStyles = { ...styles, ...(shapeConfig.fill && { fill: … }) };
  //
  // …which put `metadata.shape.fill` above EVERY layer — element-inline, and
  // `state` with it. So a SELECTED node carrying a shape-config fill never showed
  // its selection colour, and neither did a hovered, disabled or errored one. The
  // documented cascade said one thing; the renderer did another.
  //
  // The paints now resolve inside the cascade's element-inline layer
  // (themes/style-cascade.ts → shapeMetadataStyle), so state beats them, and the
  // typed `setStyle()` API beats the untyped legacy metadata bag.
  // =========================================================================
  describe('LATENT BUG: metadata.shape paints outranked the whole cascade', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
    });

    function shapedNode(shape: Record<string, unknown>, style: Record<string, unknown> = {}): NodeModel {
      const node = addNode(style);
      node.setMetadata('shape', { type: 'rect', ...shape });
      return node;
    }

    it('still PAINTS a shape-config fill (the common case is unchanged)', () => {
      const node = shapedNode({ fill: '#dbeafe', stroke: '#334155', strokeWidth: 1.5 });
      const body = nodeBody(node);

      expect(body.props.style).toContain('fill: #dbeafe');
      expect(body.props.style).toContain('stroke: #334155');
      expect(body.props.style).toContain('stroke-width: 1.5');
    });

    it('THE BUG: SELECTION now beats it (it used to be invisible)', () => {
      const node = shapedNode({ fill: '#dbeafe', stroke: '#334155' });
      node.setState({ selected: true });

      const body = nodeBody(node);
      expect(body.props.style).toContain(`fill: ${LIGHT_THEME.colors.node.selected.fill}`);
      expect(body.props.style).toContain(`stroke: ${LIGHT_THEME.colors.node.selected.stroke}`);
      expect(body.props.style).not.toContain('#dbeafe');
    });

    it.each([
      ['highlighted', { highlighted: true }, () => LIGHT_THEME.colors.node.highlighted.fill],
      ['hovered', { hovered: true }, () => LIGHT_THEME.colors.node.hovered.fill],
      ['error', { error: true }, () => LIGHT_THEME.colors.node.error.fill],
    ])('…and so does %s', (_name, state, expected) => {
      const node = shapedNode({ fill: '#dbeafe' });
      node.setState(state as any);

      expect(nodeBody(node).props.style).toContain(`fill: ${expected()}`);
    });

    it('the typed setStyle() API beats the untyped metadata bag', () => {
      const node = shapedNode({ fill: '#dbeafe' }, { fill: '#ff0000' });
      expect(nodeBody(node).props.style).toContain('fill: #ff0000');
    });

    it('…including when the style is theme-BOUND', () => {
      const node = shapedNode({ fill: '#dbeafe' }, { fill: themeRef('category.critical') });
      expect(nodeBody(node).props.style).toContain('fill: var(--grafloria-category-critical');
    });

    it('the shape TYPE is untouched (it is not a paint)', () => {
      const node = shapedNode({ type: 'ellipse', fill: '#dbeafe' });
      expect(nodeBody(node).type).toBe('ellipse');
    });
  });

  // =========================================================================
  // Programmatic (Canvas) mode — no stylesheet, so a bound property must be a
  // LITERAL or nothing would paint.
  // =========================================================================
  describe('programmatic mode', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, { useCSSMode: false }, LIGHT_THEME);
    });

    it('resolves a bound fill to a LITERAL — var() would paint nothing here', () => {
      const node = addNode({ fill: themeRef('category.critical') });

      expect(paintOf(nodeBody(node), 'fill')).toBe(LIGHT_THEME.categories!.critical);
      expect(paintOf(nodeBody(node), 'fill')).not.toContain('var(');
    });

    it('still re-themes: the literal is re-resolved against the new theme', () => {
      const node = addNode({ fill: themeRef('category.critical') });
      expect(paintOf(nodeBody(node), 'fill')).toBe(LIGHT_THEME.categories!.critical);

      renderer.setTheme(DARK_THEME);
      expect(paintOf(nodeBody(node), 'fill')).toBe(DARK_THEME.categories!.critical);
    });

    it('resolves a bound link strokeWidth to a number', () => {
      const link = addLink({ strokeWidth: themeRef('numbers.heavy') });
      expect(Number(paintOf(linkPath(link), 'stroke-width'))).toBe(4);
    });
  });

  // =========================================================================
  // The traps a var() value walks into if nothing guards them.
  // =========================================================================
  describe('values that CANNOT be a var()', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
    });

    it('the ARROWHEAD gets a literal colour, never var() (it paints via attributes)', () => {
      addLink({
        stroke: themeRef('category.critical'),
        arrowHead: { type: 'arrow', size: 10, filled: true } as any,
      });
      const root = renderer.render(VIEWPORT, 1) as VNode;

      // No `fill="var(...)"` / `stroke="var(...)"` ATTRIBUTE anywhere: those are
      // invalid in SVG and the marker would render black.
      const attrs: string[] = [];
      const walk = (vnode: any) => {
        if (!vnode) return;
        for (const key of ['fill', 'stroke']) {
          const value = vnode.props?.[key];
          if (typeof value === 'string') attrs.push(value);
        }
        (vnode.children ?? []).forEach(walk);
      };
      walk(root);
      expect(attrs.some(value => value.includes('var('))).toBe(false);
    });

    it('the hit-area width is computed from the LITERAL stroke width, not NaN', () => {
      // `Number('var(--grafloria-numbers-heavy, 4)')` is NaN, and a NaN-wide hit area
      // is an unclickable link.
      const link = addLink({ strokeWidth: themeRef('numbers.heavy') });
      const root = renderer.render(VIEWPORT, 1) as VNode;
      const hit = findByClassToken(root, 'link-hit-area');

      expect(hit).toBeDefined();
      const width = Number(hit.props.strokeWidth);
      expect(Number.isFinite(width)).toBe(true);
      expect(width).toBeGreaterThan(0);
    });

    it('never emits the raw ThemeRef object into the DOM', () => {
      const node = addNode({
        fill: themeRef('category.critical'),
        borderRadius: themeRef('effects.borderRadius.lg'),
      });
      const body = nodeBody(node);

      expect(String(body.props.style ?? '')).not.toContain('[object Object]');
      // borderRadius is emitted as the `rx` ATTRIBUTE, so it must be a literal.
      expect(body.props.rx).toBe(8);
    });
  });
});
