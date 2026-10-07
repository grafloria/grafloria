/**
 * THE AI-DIAGRAM LOOK, STEP 3 — ZONES.
 *
 * "HEALTHPAY'S SIDE · CARDS ARE TYPED HERE": a tinted region with a dashed edge
 * and a small caption in its corner, the boxes inside it. Grafloria has groups,
 * but the render spec could not declare one, and a group's frame was the
 * theme's alone — surface tint, a title band, a label in the band. A zone is a
 * group with its OWN frame: fill, border, dash, radius, a caption styled and
 * placed (top-left, bottom-left…), no band.
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

const box = (id: string, x: number, y: number, w = 210, h = 72): NodeSpec => ({ id, position: { x, y }, size: { width: w, height: h }, label: id });
const NODES = [box('page', 410, 78), box('wallets', 712, 78), box('api', 410, 264), box('db', 712, 264)];
const HP = {
  id: 'hp',
  label: "HEALTHPAY'S SIDE · CARDS ARE TYPED HERE",
  children: ['page', 'wallets'],
  bounds: { x: 380, y: 36, width: 566, height: 138 },
  style: { fill: '#e8f1f3', stroke: '#7fb1b9', strokeDasharray: '5 4', borderRadius: 6, color: '#1f6f7a', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
};

describe('zones: groups declared in the spec, with a frame of their own', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const frame = (id: string) => container.querySelector(`[data-group-id="${id}"]`) as SVGGElement | null;
  const frameRect = (id: string) => frame(id)!.querySelector('rect.group-frame-rect, rect') as SVGRectElement;
  const caption = (id: string) => frame(id)!.querySelector('text') as SVGTextElement;
  const n = (el: Element, a: string) => Number(el.getAttribute(a));

  it('a zone with explicit bounds draws exactly that frame: its fill, border, dash and radius — no title band', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: [HP] });
    expect(frame('hp')).not.toBeNull();
    const r = frameRect('hp');
    expect([n(r, 'x'), n(r, 'y'), n(r, 'width'), n(r, 'height')]).toEqual([380, 36, 566, 138]);
    expect(r.getAttribute('fill')).toBe('#e8f1f3');
    expect(r.getAttribute('stroke')).toBe('#7fb1b9');
    expect(r.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(n(r, 'rx')).toBe(6);
    expect(frame('hp')!.querySelector('.group-frame-band')).toBeNull();
  });

  it('its caption sits in the top-left corner in its own typography', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: [HP] });
    const t = caption('hp');
    expect(t.textContent).toBe("HEALTHPAY'S SIDE · CARDS ARE TYPED HERE");
    expect(t.getAttribute('text-anchor') ?? 'start').toBe('start');
    expect(n(t, 'x')).toBeGreaterThan(380);
    expect(n(t, 'x')).toBeLessThan(380 + 30);
    expect(n(t, 'y')).toBeGreaterThan(36);
    expect(n(t, 'y')).toBeLessThan(36 + 30);
    expect(t.style.fill).toBe('#1f6f7a');
    expect(t.style.fontSize).toBe('11px');
    expect(t.style.fontWeight).toBe('700');
    expect(t.style.letterSpacing).toBe('1px');
  });

  it("labelPlacement: 'bottom-left' puts the caption in the bottom-left corner", () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      groups: [{ id: 'ours', label: 'OUR SIDE · MUST NEVER SEE A CARD', children: ['api', 'db'], bounds: { x: 380, y: 236, width: 566, height: 150 }, labelPlacement: 'bottom-left', style: { fill: '#f1f3f5' } }],
    });
    const t = caption('ours');
    expect(n(t, 'x')).toBeLessThan(380 + 30);
    expect(n(t, 'y')).toBeGreaterThan(236 + 150 - 30);
    expect(n(t, 'y')).toBeLessThan(236 + 150);
  });

  it('a zone without bounds is fitted around its children, with padding', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: [{ id: 'fit', label: 'FIT', children: ['api', 'db'], padding: 20, style: { fill: '#fff8e1' } }] });
    const r = frameRect('fit');
    expect(n(r, 'x')).toBeLessThanOrEqual(410 - 20);
    expect(n(r, 'y')).toBeLessThanOrEqual(264 - 20);
    expect(n(r, 'x') + n(r, 'width')).toBeGreaterThanOrEqual(712 + 210 + 20);
    expect(n(r, 'y') + n(r, 'height')).toBeGreaterThanOrEqual(264 + 72 + 20);
  });

  it('the children are the zone’s members, and the zone draws BEHIND the lines and the boxes', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: [{ source: 'page', target: 'wallets' }], groups: [HP] });
    const g = diagram.getModel().getGroup('hp')!;
    expect([...g.members].sort()).toEqual(['page', 'wallets']);
    const all = Array.from(container.querySelectorAll('[data-group-id], [data-link-id], [data-node-id]'));
    const at = (sel: string) => all.findIndex((e) => e.matches(sel));
    expect(at('[data-group-id="hp"]')).toBeLessThan(at('[data-link-id]'));
    expect(at('[data-group-id="hp"]')).toBeLessThan(at('[data-node-id="page"]'));
  });

  it('a group with no frame style of its own is drawn exactly as before (title band and all)', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: [{ id: 'plain', label: 'Plain', children: ['api', 'db'] }] });
    expect(frame('plain')!.querySelector('.group-frame-band')).not.toBeNull();
  });

  it('the frame style is part of the model, and setGroups reconciles zones like setNodes does', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: [HP] });
    expect((diagram.getModel().getGroup('hp')!.getMetadata('frameStyle') as { fill?: string }).fill).toBe('#e8f1f3');
    diagram.setGroups([{ ...HP, style: { ...HP.style, fill: '#fde68a' } }]);
    diagram.renderNow();
    expect(frameRect('hp').getAttribute('fill')).toBe('#fde68a');
    diagram.setGroups([]);
    diagram.renderNow();
    expect(frame('hp')).toBeNull();
    expect(diagram.getModel().getNode('page')).toBeDefined(); // removing a zone leaves its boxes
  });
});
