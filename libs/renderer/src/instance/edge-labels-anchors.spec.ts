/**
 * THE AI-DIAGRAM LOOK, STEPS 4–5 — a line's label ABOVE or BELOW it, in its own
 * colour and weight; and a line that leaves a tall box at a chosen height.
 *
 * "card number and CVV" sits in green bold text just over its green line, with
 * no box behind it; "card typed as a / "bank account" (H1)" sits under its red
 * one. And three lines leave the same tall "Customer" box at three heights —
 * `right@36`, `right@210`, `right@240` — where a side handle could only mean
 * the middle of the side.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { EdgeSpec, NodeSpec } from './model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const box = (id: string, x: number, y: number, w: number, h: number): NodeSpec => ({ id, position: { x, y }, size: { width: w, height: h }, label: id });
const CUSTOMER = box('customer', 20, 78, 150, 292);
const PAGE = box('page', 410, 78, 210, 72);
const API = box('api', 410, 264, 210, 72);
const WALLETS = box('wallets', 712, 78, 210, 72);

describe('a line label above or below its line, in its own colour — and anchors along a side', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const labelGroup = (id: string) => container.querySelector(`[data-link-id="${id}"] .link-label-group`) as SVGGElement | null;
  const at = (g: SVGGElement) => {
    const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(g.getAttribute('transform') ?? '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: NaN, y: NaN };
  };
  const pts = (id: string) => diagram!.getModel().getLink(id)!.points;
  const make = (edges: EdgeSpec[], nodes: NodeSpec[] = [CUSTOMER, PAGE, API, WALLETS]) => {
    diagram = createDiagram(container, { nodes, edges });
    diagram.renderNow();
  };

  describe('anchors: side@offset', () => {
    it('right@36 / left@36: the line leaves the tall box 36 px down its right side and meets the other box 36 px down its left', () => {
      make([{ id: 'card', source: 'customer', target: 'page', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'direct' }]);
      const p = pts('card');
      expect(p[0].x).toBeCloseTo(170, 0);
      expect(p[0].y).toBeCloseTo(114, 0);
      expect(p[p.length - 1].x).toBeCloseTo(410, 0);
      expect(p[p.length - 1].y).toBeCloseTo(114, 0);
    });

    it('several heights on one side: three lines leave the same box at three different heights', () => {
      make([
        { id: 'a', source: 'customer', target: 'page', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'direct' },
        { id: 'b', source: 'customer', target: 'api', sourceHandle: 'right@210', targetHandle: 'left@24', type: 'direct' },
        { id: 'c', source: 'customer', target: 'api', sourceHandle: 'right@240', targetHandle: 'left@54', type: 'direct' },
      ]);
      expect([pts('a')[0].y, pts('b')[0].y, pts('c')[0].y].map(Math.round)).toEqual([114, 288, 318]);
    });

    it('top@ and bottom@ measure from the LEFT; a percentage measures the side', () => {
      make([
        { id: 'up', source: 'api', target: 'wallets', sourceHandle: 'top@170', targetHandle: 'bottom@138', type: 'orthogonal' },
        { id: 'mid', source: 'page', target: 'wallets', sourceHandle: 'right@50%', targetHandle: 'left@50%', type: 'direct' },
      ]);
      const up = pts('up');
      expect(up[0].x).toBeCloseTo(580, 0);
      expect(up[0].y).toBeCloseTo(264, 0);
      expect(up[up.length - 1].x).toBeCloseTo(850, 0);
      expect(up[up.length - 1].y).toBeCloseTo(150, 0);
      expect(pts('mid')[0].y).toBeCloseTo(114, 0);
    });

    it('two anchored lines between the same pair of boxes stay straight: anchors are placements, never a bundle to fan', () => {
      make([
        { id: 'link', source: 'api', target: 'customer', sourceHandle: 'left@24', targetHandle: 'right@210', type: 'direct' },
        { id: 'h1', source: 'customer', target: 'api', sourceHandle: 'right@240', targetHandle: 'left@54', type: 'direct' },
      ]);
      for (const id of ['link', 'h1']) {
        const ys = pts(id).map((p) => Math.round(p.y));
        expect(new Set(ys).size).toBe(1); // one height, end to end
      }
    });

    it('re-applying the same spec re-uses the anchor: no duplicate ports', () => {
      const edges: EdgeSpec[] = [{ id: 'card', source: 'customer', target: 'page', sourceHandle: 'right@36', targetHandle: 'left@36' }];
      make(edges);
      const before = diagram!.getModel().getNode('customer')!.getPorts().length;
      diagram!.setEdges([...edges]);
      diagram!.renderNow();
      expect(diagram!.getModel().getNode('customer')!.getPorts().length).toBe(before);
    });
  });

  describe('labels: labelPlacement + labelStyle', () => {
    it("'above': the label rides just over a horizontal line, in its own colour and weight, with NO box behind it", () => {
      make([{ id: 'card', source: 'customer', target: 'page', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'direct', label: 'card number and CVV', labelPlacement: 'above', labelStyle: { color: '#15803d', fontWeight: '700' } }]);
      const g = labelGroup('card')!;
      const { y } = at(g);
      expect(y).toBeLessThan(114 - 5);
      expect(y).toBeGreaterThan(114 - 25);
      expect(g.querySelector('.link-label-bg')).toBeNull();
      const t = g.querySelector('text')!;
      expect((t.getAttribute('fill') ?? t.style.fill)).toBe('#15803d');
      expect(t.getAttribute('font-weight') ?? t.style.fontWeight).toBe('700');
    });

    it("'below': a two-line label hangs under its line, both lines drawn", () => {
      make([{ id: 'h1', source: 'customer', target: 'api', sourceHandle: 'right@240', targetHandle: 'left@54', type: 'direct', label: 'card typed as a\n"bank account" (H1)', labelPlacement: 'below', labelStyle: { color: '#dc2626' } }]);
      const g = labelGroup('h1')!;
      expect(at(g).y).toBeGreaterThan(318 + 5);
      expect(g.textContent).toContain('card typed as a');
      expect(g.textContent).toContain('"bank account" (H1)');
    });

    it("'above' on a VERTICAL line keeps the label off the line, to its left", () => {
      const TOP = box('top', 400, 40, 100, 40);
      const BOT = box('bot', 400, 400, 100, 40);
      make([{ id: 'v', source: 'top', target: 'bot', sourceHandle: 'bottom', targetHandle: 'top', type: 'direct', label: 'down', labelPlacement: 'above' }], [TOP, BOT]);
      expect(at(labelGroup('v')!).x).toBeLessThan(450 - 5);
    });

    it('with no placement, a label is exactly as before: 10 px over the line, on its box', () => {
      make([{ id: 'plain', source: 'customer', target: 'page', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'direct', label: 'adds money' }]);
      const g = labelGroup('plain')!;
      expect(at(g).y).toBeCloseTo(104, 0); // the legacy label's own { x: 0, y: -10 } offset
      expect(g.querySelector('.link-label-bg')).not.toBeNull();
    });

    it('the placement and style are part of the model: the link keeps its text as its accessible name', () => {
      make([{ id: 'card', source: 'customer', target: 'page', label: 'card number and CVV', labelPlacement: 'above', labelStyle: { color: '#15803d' } }]);
      const link = diagram!.getModel().getLink('card')!;
      expect(link.getMetadata('labelPlacement')).toBe('above');
      expect(link.getLabel()).toBe('card number and CVV');
      expect(link.labels[0].style?.color).toBe('#15803d');
    });
  });

  it("subtitles and line labels take the theme's face — not the host page's — and a label's own family still wins", async () => {
    const { generateBaseStyleSheet } = await import('../themes/theme-css');
    const css = generateBaseStyleSheet();
    expect(css).toMatch(/\.diagram-sublabel[^{]*\{[^}]*font-family/);
    expect(css).toMatch(/\.link-label-text[^{]*\{[^}]*font-family/);
    make([{ id: 'm', source: 'customer', target: 'page', label: 'mono', labelPlacement: 'above', labelStyle: { fontFamily: 'Menlo, monospace' } }]);
    const t = container.querySelector('[data-link-id="m"] .link-label-text') as SVGTextElement;
    expect(t.style.fontFamily).toContain('Menlo');
  });

  it('waypoints: the bends a line must take — the elbow runs exactly where it was drawn, between the zones', () => {
    make([{ id: 'up', source: 'api', target: 'wallets', sourceHandle: 'top@170', targetHandle: 'bottom@138', type: 'orthogonal', waypoints: [{ x: 580, y: 204 }, { x: 850, y: 204 }] }]);
    const p = pts('up').map((q) => [Math.round(q.x), Math.round(q.y)]);
    expect(p[0]).toEqual([580, 264]);
    expect(p).toContainEqual([580, 204]);
    expect(p).toContainEqual([850, 204]);
    expect(p[p.length - 1]).toEqual([850, 150]);
    expect(diagram!.getModel().getLink('up')!.getMetadata('hasManualWaypoints')).toBe(true);
  });
});

