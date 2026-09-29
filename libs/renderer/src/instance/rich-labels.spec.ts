/**
 * THE AI-DIAGRAM LOOK, STEP 1 — a node's own typography, and a SUBTITLE.
 *
 * The diagrams Claude and ChatGPT draw as hand-written SVG share one vocabulary:
 * a box with a bold name and a smaller, muted line under it ("Our API" /
 * "sherkety-erp-api"), captions in their own colour and weight. Grafloria had
 * the style fields — `style.color`, `fontSize`, `fontWeight`, `fontFamily` —
 * declared on NodeStyle and read by nothing: a caption styled teal, bold and
 * 11 px rendered in the default ink at 14 px, weight 400. And no subtitle.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeSpec } from './model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('a node draws its own typography, and a subtitle under its name', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const texts = (id: string) => Array.from(container.querySelectorAll(`[data-node-id="${id}"] text`)) as SVGTextElement[];
  const title = (id: string) => container.querySelector(`[data-node-id="${id}"] text.diagram-label`) as SVGTextElement | null;
  const sub = (id: string) => container.querySelector(`[data-node-id="${id}"] text.diagram-sublabel`) as SVGTextElement | null;
  const y = (t: SVGTextElement) => Number(t.getAttribute('y'));
  const box = (spec: Partial<NodeSpec> & { id: string }): NodeSpec => ({ position: { x: 100, y: 100 }, size: { width: 210, height: 72 }, ...spec }) as NodeSpec;

  it("the node's style.color, fontSize, fontWeight and fontFamily reach its label", () => {
    diagram = createDiagram(container, {
      nodes: [box({ id: 'cap', label: 'OUR SIDE', style: { color: '#1f6f7a', fontSize: 11, fontWeight: '700', fontFamily: 'Georgia, serif' } })],
    });
    const t = title('cap')!;
    expect(t.style.fill).toBe('#1f6f7a');
    expect(t.style.fontSize).toBe('11px');
    expect(t.style.fontWeight).toBe('700');
    expect(t.style.fontFamily).toContain('Georgia');
  });

  it('a node with no typography of its own is exactly as before: one centred label, no inline font', () => {
    diagram = createDiagram(container, { nodes: [box({ id: 'plain', label: 'Plain' })] });
    expect(texts('plain')).toHaveLength(1);
    const t = title('plain')!;
    expect(t.getAttribute('text-anchor')).toBe('middle');
    expect(t.style.fill).toBe('');
    expect(t.style.fontWeight).toBe('');
    expect(sub('plain')).toBeNull();
  });

  it('sublabel: a second, smaller, muted line under a bold name — the pair centred in the box', () => {
    diagram = createDiagram(container, { nodes: [box({ id: 'api', label: 'Our API', sublabel: 'the card is typed here' })] });
    const t = title('api')!;
    const s = sub('api')!;
    expect(t.textContent).toBe('Our API');
    expect(s.textContent).toBe('the card is typed here');
    expect(t.style.fontWeight).toBe('600'); // a name over a subtitle reads as a name
    expect(Number.parseFloat(s.style.fontSize)).toBeLessThan(14); // smaller than the theme's 14
    expect(s.style.fill).toBe('#6b7280'); // the light theme's secondary text
    expect(y(t)).toBeLessThan(y(s)); // name above subtitle
    // the pair is centred: the name's top half above the middle, the subtitle below it
    expect(y(t)).toBeLessThan(36);
    expect(y(s)).toBeGreaterThan(36);
    // both are clipped to the box like any label
    expect(s.getAttribute('clip-path')).toBe(t.getAttribute('clip-path'));
  });

  it('sublabel as an object: its own font (the "mono" keyword picks a monospace stack) and colour', () => {
    diagram = createDiagram(container, {
      nodes: [box({ id: 'api', label: 'Our API', sublabel: { text: 'sherkety-erp-api', fontFamily: 'mono', color: '#dc2626' } })],
    });
    const s = sub('api')!;
    expect(s.textContent).toBe('sherkety-erp-api');
    expect(s.style.fontFamily).toMatch(/mono/i);
    expect(s.style.fill).toBe('#dc2626');
  });

  it('the node style still wins for the NAME, and an explicit weight beats the bold default', () => {
    diagram = createDiagram(container, {
      nodes: [box({ id: 'fake', label: 'Fake card page', sublabel: "not HealthPay's", style: { color: '#b91c1c', fontWeight: '800' } })],
    });
    expect(title('fake')!.style.fill).toBe('#b91c1c');
    expect(title('fake')!.style.fontWeight).toBe('800');
  });

  it('the subtitle is part of the model: it survives a JSON round trip and is editable later', () => {
    diagram = createDiagram(container, { nodes: [box({ id: 'db', label: 'Our database', sublabel: 'keys, ledger, bank numbers' })] });
    const node = diagram.getModel().getNode('db')!;
    expect(node.getMetadata('sublabel')).toBe('keys, ledger, bank numbers');
    node.setMetadata('sublabel', 'keys and ledger');
    diagram.renderNow();
    expect(sub('db')!.textContent).toBe('keys and ledger');
    node.setMetadata('sublabel', undefined);
    diagram.renderNow();
    expect(sub('db')).toBeNull();
  });

  describe("shape 'text' — a note on the canvas: words, no box", () => {
    const body = (id: string) => container.querySelector(`[data-node-id="${id}"] rect`) as SVGRectElement | null;
    it('draws no box: the body is transparent, borderless and shadowless — but still a node you can select and drag', () => {
      diagram = createDiagram(container, {
        nodes: [box({ id: 'note', label: 'if someone swaps the link, the customer lands here (M1)', size: { width: 400, height: 26 }, shape: { type: 'text' }, style: { color: '#dc2626', fontWeight: '700' } })],
      });
      const r = body('note')!;
      const paint = (prop: 'fill' | 'stroke') => (r.style[prop] || r.getAttribute(prop) || '').replace(/\s/g, '');
      expect(['transparent', 'none', 'rgba(0,0,0,0)']).toContain(paint('fill'));
      expect(paint('stroke')).toBe('none');
      expect(r.getAttribute('filter')).toBeNull();
      diagram.getModel().selectNode(diagram.getModel().getNode('note')!);
      diagram.renderNow();
      expect(diagram.getModel().getNode('note')!.isSelected()).toBe(true);
    });

    it('no drop shadow under a note, and it announces itself as Text', () => {
      diagram = createDiagram(container, { nodes: [box({ id: 'note', label: 'hi', shape: { type: 'text' } })] });
      expect(container.querySelector('[data-node-id="note"] .node-shadow')).toBeNull();
      expect(container.querySelector('[data-node-id="note"]')!.getAttribute('aria-roledescription')).toBe('Text');
    });

    it('its words start at its left edge, keep their own colour and weight, and are never clipped or cut to "…"', () => {
      diagram = createDiagram(container, {
        nodes: [box({ id: 'note', label: 'if someone swaps the link, the customer lands here (M1)', size: { width: 400, height: 26 }, shape: { type: 'text' }, style: { color: '#dc2626', fontWeight: '700' } })],
      });
      const t = title('note')!;
      expect(t.getAttribute('text-anchor')).toBe('start');
      expect(Number(t.getAttribute('x'))).toBe(0);
      expect(t.getAttribute('clip-path')).toBeNull();
      expect(t.textContent).toBe('if someone swaps the link, the customer lands here (M1)');
      expect(t.style.fill).toBe('#dc2626');
      expect(t.style.fontWeight).toBe('700');
    });

    it("metadata.textAlign centres or right-aligns a note's words", () => {
      diagram = createDiagram(container, {
        nodes: [box({ id: 'c', label: 'centred', shape: { type: 'text' }, metadata: { textAlign: 'center' } }), box({ id: 'r', label: 'right', shape: { type: 'text' }, metadata: { textAlign: 'end' } })],
      });
      expect(title('c')!.getAttribute('text-anchor')).toBe('middle');
      expect(Number(title('c')!.getAttribute('x'))).toBe(105);
      expect(title('r')!.getAttribute('text-anchor')).toBe('end');
      expect(Number(title('r')!.getAttribute('x'))).toBe(210);
    });
  });

  it('style.shadow: false removes the default drop shadow from any node (a flat box)', () => {
    diagram = createDiagram(container, { nodes: [box({ id: 'flat', label: 'Flat', style: { shadow: false } }), box({ id: 'lifted', label: 'Lifted', position: { x: 400, y: 100 } })] });
    expect(container.querySelector('[data-node-id="flat"] .node-shadow')).toBeNull();
    expect(container.querySelector('[data-node-id="lifted"] .node-shadow')).not.toBeNull(); // the default is unchanged
  });
});

