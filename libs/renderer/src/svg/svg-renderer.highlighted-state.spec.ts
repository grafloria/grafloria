// SVGRenderer — the `highlighted` state, wired end-to-end (Styling & theming, Card 1)
//
// Before this card the `highlighted` state only affected link z-ordering: no
// `.diagram-*.highlighted` class was ever emitted and no CSS rule existed.
// These specs pin the full wiring:
//   - links: state 'highlighted' emits the `highlighted` class + a themed rule
//   - nodes: state.highlighted emits the class + a themed rule
//   - precedence: `selected` wins over `highlighted` (CSS source order in
//     CSS mode; the state switch order in programmatic/Canvas mode)

import { SVGRenderer, GRAFLORIA_BASE_STYLE_ID } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { GRAFLORIA_INSTANCE_ATTR, DARK_THEME, LIGHT_THEME } from '../themes';
import type { VNode } from '../types';

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

/**
 * Every `stroke` value in a subtree (used for programmatic/Canvas-mode checks).
 * Captures both the `stroke` presentation attribute AND `stroke:` inside an
 * inline `style` string — the shape registry hoists rect/circle/diamond
 * fill+stroke into an inline style string rather than a prop.
 */
function strokesOf(vnode: any, acc: string[] = []): string[] {
  if (!vnode) return acc;
  const s = vnode.props?.stroke;
  if (typeof s === 'string') acc.push(s);
  const style = vnode.props?.style;
  if (typeof style === 'string') {
    const m = style.match(/stroke:\s*([^;]+)/);
    if (m) acc.push(m[1].trim());
  }
  for (const c of vnode.children ?? []) strokesOf(c, acc);
  return acc;
}

describe('SVGRenderer - highlighted state end-to-end', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    renderer = new SVGRenderer(engine, {}); // CSS mode (default)
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  /**
   * The SHARED rules (theme-independent, written in var(--grafloria-*)). Since the
   * scoped-theme card, the theme's hex values no longer live in the rules — they
   * live in this renderer's variable block — so a rule is checked by RESOLVING it
   * (see `resolvedDecl`), which is what a browser does.
   */
  function themeCSS(): string {
    return document.getElementById(GRAFLORIA_BASE_STYLE_ID)?.textContent || '';
  }

  /** This instance's `--grafloria-*` variable block. */
  function varsCSS(): string {
    return document.getElementById(renderer.getStyleElementId())?.textContent || '';
  }

  /** The value a browser would paint for `selector { prop }` in THIS diagram. */
  function resolvedDecl(selector: string, prop: string): string | undefined {
    const rule = new RegExp(
      `\\[${GRAFLORIA_INSTANCE_ATTR}\\]\\s+${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`
    ).exec(themeCSS());
    if (!rule) return undefined;

    const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule[1]);
    if (!decl) return undefined;

    return decl[1].trim().replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      const value = new RegExp(`${name}\\s*:\\s*([^;]+)`).exec(varsCSS());
      return value ? value[1].trim() : '';
    });
  }

  function addNode(x: number, y: number): NodeModel {
    const node = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    diagram.addNode(node);
    return node;
  }

  function addLink(): LinkModel {
    const source = addNode(100, 100);
    const target = addNode(300, 200);
    source.addPort(new PortModel({ id: 'p1', type: 'output', side: 'right' }));
    target.addPort(new PortModel({ id: 'p2', type: 'input', side: 'left' }));
    const link = new LinkModel('p1', 'p2');
    diagram.addLink(link);
    return link;
  }

  function nodeGroup(node: NodeModel): any {
    const root = renderer.render(VIEWPORT, 1.0) as VNode;
    const group = findVNodeByKey(root, `node-${node.id}`);
    expect(group).toBeDefined();
    return group;
  }

  function linkGroup(link: LinkModel): any {
    const root = renderer.render(VIEWPORT, 1.0) as VNode;
    const group = findVNodeByKey(root, `link-${link.id}`);
    expect(group).toBeDefined();
    return group;
  }

  describe('links (CSS mode)', () => {
    it("emits the `highlighted` class when link state is 'highlighted'", () => {
      const link = addLink();
      link.setState('highlighted');

      const path = findByClassToken(linkGroup(link), 'diagram-link');
      expect(path).toBeDefined();
      expect(path.props.className.split(/\s+/)).toContain('highlighted');
    });

    it('does NOT emit `highlighted` for a default link', () => {
      const link = addLink();
      const path = findByClassToken(linkGroup(link), 'diagram-link');
      expect(path.props.className.split(/\s+/)).not.toContain('highlighted');
    });

    it('injects a `.diagram-link.highlighted` rule carrying the theme token', () => {
      addLink();
      expect(themeCSS()).toContain('.diagram-link.highlighted {');
      // The rule is written in variables; resolved against this instance's block
      // it still paints the theme's highlight token.
      expect(resolvedDecl('.diagram-link.highlighted', 'stroke')).toBe(LIGHT_THEME.colors.link.highlighted);
      expect(resolvedDecl('.diagram-link.highlighted', 'stroke-width')).toBe('3px');
    });
  });

  describe('nodes (CSS mode)', () => {
    it('emits the `highlighted` class when node.state.highlighted is set', () => {
      const node = addNode(120, 120);
      node.setHighlighted(true);

      const shape = findByClassToken(nodeGroup(node), 'diagram-node');
      expect(shape).toBeDefined();
      expect(shape.props.className.split(/\s+/)).toContain('highlighted');
    });

    it('does NOT emit `highlighted` for a default node', () => {
      const node = addNode(120, 120);
      const shape = findByClassToken(nodeGroup(node), 'diagram-node');
      expect(shape.props.className.split(/\s+/)).not.toContain('highlighted');
    });

    it('injects a `.diagram-node.highlighted` rule carrying the theme token', () => {
      addNode(120, 120);
      expect(themeCSS()).toContain('.diagram-node.highlighted {');
      expect(resolvedDecl('.diagram-node.highlighted', 'stroke')).toBe(LIGHT_THEME.colors.node.highlighted.stroke);
    });

    it('SELECTED wins over HIGHLIGHTED: both classes emit, but the .selected rule is authored last', () => {
      const node = addNode(120, 120);
      node.setSelected(true);
      node.setHighlighted(true);

      const classes = findByClassToken(nodeGroup(node), 'diagram-node').props.className.split(/\s+/);
      expect(classes).toContain('selected');
      expect(classes).toContain('highlighted');

      // Equal specificity → CSS source order decides. The `.highlighted` rule
      // must be authored BEFORE the `.selected` rule so `.selected` wins.
      const css = themeCSS();
      const hi = css.indexOf('.diagram-node.highlighted {');
      const sel = css.indexOf('.diagram-node.selected {');
      expect(hi).toBeGreaterThanOrEqual(0);
      expect(sel).toBeGreaterThan(hi);
    });
  });

  describe('programmatic (Canvas) mode', () => {
    beforeEach(() => {
      renderer.dispose();
      renderer = new SVGRenderer(engine, { useCSSMode: false });
    });

    it('paints a highlighted link with the highlighted theme token', () => {
      const link = addLink();
      link.setState('highlighted');
      expect(strokesOf(linkGroup(link))).toContain(LIGHT_THEME.colors.link.highlighted);
    });

    it('paints a highlighted node with the highlighted theme token', () => {
      const node = addNode(120, 120);
      node.setHighlighted(true);
      expect(strokesOf(nodeGroup(node))).toContain(LIGHT_THEME.colors.node.highlighted.stroke);
    });

    it('selection still wins over highlight (no amber painted when both set)', () => {
      const node = addNode(120, 120);
      node.setHighlighted(true);
      node.setSelected(true);
      const strokes = strokesOf(nodeGroup(node));
      expect(strokes).toContain('#2563eb'); // light node.selected.stroke
      expect(strokes).not.toContain(LIGHT_THEME.colors.node.highlighted.stroke); // highlight was NOT applied to the body
    });
  });

  describe('serialization', () => {
    it('round-trips node.state.highlighted through serialize/fromJSON', () => {
      const node = addNode(10, 10);
      node.setHighlighted(true);
      expect(NodeModel.fromJSON(node.serialize()).isHighlighted()).toBe(true);
    });

    it('setHighlighted(false) clears it', () => {
      const node = addNode(10, 10);
      node.setHighlighted(true);
      node.setHighlighted(false);
      expect(node.isHighlighted()).toBe(false);
      expect(NodeModel.fromJSON(node.serialize()).isHighlighted()).toBe(false);
    });
  });

  describe('dark theme', () => {
    it('carries dark-theme highlighted tokens', () => {
      renderer.dispose();
      renderer = new SVGRenderer(engine, {}, DARK_THEME);
      addNode(10, 10);
      expect(themeCSS()).toContain('.diagram-node.highlighted {');
      // Same shared rule, this instance's variables → the DARK token.
      expect(resolvedDecl('.diagram-node.highlighted', 'fill')).toBe('#78350f');
    });
  });
});
