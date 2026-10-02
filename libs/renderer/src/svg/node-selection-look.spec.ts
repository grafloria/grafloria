/**
 * HOW A SELECTED NODE SHOWS IT — `style.selection`.
 *
 * A selected node always got two things: the theme's selected colours on its
 * body (fill AND border) and a dashed ring 3px outside it. For a card UI the
 * ring is one rectangle too many (the chatbot demo: "wouldn't it be best if
 * only the border of the selected item changed instead of an extra rectangle
 * around it"), and there was no way to say so short of hiding it with CSS.
 *
 *   'both'   (default) the body takes the selected colours AND the ring shows
 *   'border' only the node's own border changes; its fill stays, no ring
 *   'ring'   only the ring; the body keeps its own paint
 *
 * It is a STYLE property, so it rides the cascade like any other: per node,
 * per named style, per node type, or theme-wide.
 */
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import { LIGHT_THEME } from '../themes/default-light-theme';
import { resolveNodeStyle } from '../themes/style-cascade';
import { BASE_STYLE_RULES } from '../themes/theme-css';
import { defineStyle, clearStyles } from '../themes/style-registry';
import type { Theme } from '../types/theme.types';
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
const classes = (v: VNode | null) => String(v?.props?.className ?? '').split(/\s+/);
/** Paint as it lands on the body: the inline style string wins, then the attribute. */
const paint = (body: VNode, prop: 'fill' | 'stroke' | 'stroke-width') => {
  const m = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(String(body.props?.style ?? ''));
  if (m) return m[1]!.trim();
  const attr = body.props?.[prop === 'stroke-width' ? 'strokeWidth' : prop];
  return attr === undefined ? undefined : String(attr);
};

function render(setup: (n: NodeModel) => void, theme?: Theme) {
  const engine = new DiagramEngine();
  engine.createDiagram();
  const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 }, size: { width: 200, height: 100 } });
  node.setMetadata('shape', { type: 'rect', cornerRadius: 12 });
  setup(node);
  engine.getDiagram()!.addNode(node);
  const tree = new SVGRenderer(engine, {}, theme).render({ x: -100, y: -100, width: 1000, height: 1000 }, 1);
  const group = find(tree, (v) => v.key === `node-${node.id}`)!;
  return {
    ring: find(group, (v) => classes(v).includes('selection-highlight')),
    body: find(group, (v) => classes(v).includes('diagram-node'))!,
  };
}
const SEL = LIGHT_THEME.colors.node.selected;
const select = (look?: 'both' | 'border' | 'ring', own: Record<string, unknown> = {}) => (n: NodeModel) => {
  n.style = { ...n.style, ...own, ...(look ? { selection: look } : {}) };
  n.setSelected(true);
};

afterEach(() => clearStyles());

describe("style.selection — how a selected node shows it", () => {
  it("default ('both'): the ring shows and the body takes the selected fill and border — as before", () => {
    const { ring, body } = render(select());
    expect(ring).toBeTruthy();
    expect(paint(body, 'fill')).toBe(SEL.fill);
    expect(paint(body, 'stroke')).toBe(SEL.stroke);
    expect(classes(body)).toContain('selected');
  });

  it("'border': no ring; the border takes the selected colour at 2px; the node's own fill stays", () => {
    const { ring, body } = render(select('border', { fill: '#ffffff', stroke: '#d0d5dd' }));
    expect(ring).toBeNull();
    expect(paint(body, 'stroke')).toBe(SEL.stroke);
    expect(paint(body, 'stroke-width')).toBe('2');
    expect(paint(body, 'fill')).toBe('#ffffff');
  });

  it("'border' on a node with NO own fill: no selected fill inline, and the stylesheet gives the base fill back", () => {
    const { body } = render(select('border'));
    expect(paint(body, 'fill')).toBeUndefined();
    expect(classes(body)).toEqual(expect.arrayContaining(['selected', 'selected-border']));
    const rule = BASE_STYLE_RULES.find((r) => r.selector === '.diagram-node.selected.selected-border');
    expect(rule?.decls['fill']).toBe(BASE_STYLE_RULES.find((r) => r.selector === '.diagram-node')!.decls['fill']);
  });

  it("'ring': the ring shows, rounded with the card; the body keeps its own paint", () => {
    const { ring, body } = render(select('ring', { fill: '#ffffff', stroke: '#d0d5dd' }));
    expect(ring).toBeTruthy();
    expect(Number(ring!.props!['rx'])).toBe(15);
    expect(paint(body, 'fill')).toBe('#ffffff');
    expect(paint(body, 'stroke')).toBe('#d0d5dd');
    expect(classes(body)).toContain('selected-ring');
  });

  it("'ring' leaves the body to the other states: hovered while selected still paints the hover", () => {
    const { body } = render((n) => { select('ring')(n); n.setState({ hovered: true }); });
    expect(paint(body, 'stroke')).toBe(LIGHT_THEME.colors.node.hovered.stroke);
  });

  it('rides the cascade: a named style sets it, and the node\'s own style still wins', () => {
    defineStyle('card', { selection: 'border' });
    expect(render(select(undefined, { styleClass: 'card' })).ring).toBeNull();
    expect(render(select('both', { styleClass: 'card' })).ring).toBeTruthy();
  });

  it('theme-wide: theme.nodes.default.selection makes every node border-only', () => {
    const theme: Theme = { ...LIGHT_THEME, nodes: { ...LIGHT_THEME.nodes, default: { ...LIGHT_THEME.nodes.default, selection: 'border' } } };
    expect(render(select(), theme).ring).toBeNull();
    expect(render(select('ring'), theme).ring).toBeTruthy();
  });

  it('Canvas mode resolves the same: border-only keeps the base fill, takes the selected border', () => {
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
    node.style = { ...node.style, selection: 'border' };
    node.setSelected(true);
    const s = resolveNodeStyle(node, LIGHT_THEME, { includeThemeBase: true });
    expect(s.fill).toBe(LIGHT_THEME.colors.node.default.fill);
    expect(s.stroke).toBe(SEL.stroke);
    expect(s.strokeWidth).toBe(2);
  });
});

describe('a component node (useForeignObject) shows selection the same way', () => {
  const comp = (look?: 'both' | 'border' | 'ring') => (n: NodeModel) => {
    n.setMetadata('useForeignObject', true);
    select(look)(n);
  };
  it('default: the ring, now rounded with the node (it was a fixed 6)', () => {
    const { ring } = render(comp());
    expect(ring).toBeTruthy();
    expect(Number(ring!.props!['rx'])).toBe(15);
  });
  it("'border': no ring — the component paints its own border", () => {
    expect(render(comp('border')).ring).toBeNull();
  });
});
