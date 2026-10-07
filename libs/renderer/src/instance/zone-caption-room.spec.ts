/**
 * A zone's caption is drawn inside its frame, in the top (or bottom) margin.
 * A frame fitted to its members must leave that margin free, or the first
 * member is painted over the caption.
 *
 * The measurements come from the rendered `<text>` (centred on its `y`), so
 * the test follows wherever the renderer actually puts the caption.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { GroupSpec, NodeSpec } from './model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const box = (id: string, x: number, y: number): NodeSpec => ({
  id,
  position: { x, y },
  size: { width: 130, height: 56 },
  label: id,
});
const NODES = [box('paid', 150, 150), box('retry', 150, 250), box('inv', 760, 420)];

describe('a labelled zone reserves room for its caption', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  /** The caption's glyph box, from the rendered text (central baseline). */
  function caption(id: string): { top: number; bottom: number } {
    const t = container.querySelector(`[data-group-id="${id}"] text`) as SVGTextElement;
    expect(t).not.toBeNull();
    const y = Number(t.getAttribute('y'));
    const size = parseFloat(t.style.fontSize) || 11;
    return { top: y - size * 0.6, bottom: y + size * 0.6 };
  }

  function membersBox(ids: string[]): { top: number; bottom: number } {
    const model = diagram!.getModel();
    const nodes = ids.map((i) => model.getNode(i)!);
    return {
      top: Math.min(...nodes.map((n) => n.position.y)),
      bottom: Math.max(...nodes.map((n) => n.position.y + n.size.height)),
    };
  }

  const zone = (extra: Partial<GroupSpec> = {}): GroupSpec => ({
    id: 'billing',
    label: 'Billing',
    children: ['paid', 'retry'],
    style: { fill: '#eff6ff', stroke: '#93c5fd' },
    ...extra,
  });

  it('a zone fitted around its children keeps its caption above the first child', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: [zone()] });
    diagram.renderNow();
    expect(caption('billing').bottom).toBeLessThanOrEqual(membersBox(['paid', 'retry']).top);
  });

  it('a zone with authored bounds keeps the room when it is refitted to its members', () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      groups: [zone({ bounds: { x: 110, y: 100, width: 320, height: 270 } })],
    });
    const billing = diagram.getModel().getGroup('billing')!;
    billing.fitToContents(diagram.getModel());
    diagram.renderNow();
    expect(caption('billing').bottom).toBeLessThanOrEqual(membersBox(['paid', 'retry']).top);
  });

  it('keeps the room when a node joins the zone and the frame grows', async () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      groups: [zone({ bounds: { x: 110, y: 100, width: 320, height: 270 } })],
    });
    diagram.getModel().getGroup('billing')!.fitToContents(diagram.getModel());
    await diagram.getEngine().addToGroup('billing', 'inv');
    diagram.renderNow();
    const frame = diagram.getModel().getGroup('billing')!.getOuterBounds();
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(760 + 130);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(420 + 56);
    expect(caption('billing').bottom).toBeLessThanOrEqual(membersBox(['paid', 'retry', 'inv']).top);
  });

  it('a larger caption gets a larger margin', () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      groups: [zone({ style: { fill: '#eff6ff', fontSize: 18 } })],
    });
    diagram.renderNow();
    expect(caption('billing').bottom).toBeLessThanOrEqual(membersBox(['paid', 'retry']).top);
  });

  it("a 'bottom-left' caption keeps its room below the last child", () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      groups: [zone({ labelPlacement: 'bottom-left' })],
    });
    diagram.renderNow();
    expect(caption('billing').top).toBeGreaterThanOrEqual(membersBox(['paid', 'retry']).bottom);
  });

  it('a zone without a caption is fitted with its padding alone', () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      groups: [zone({ label: undefined, padding: 20 })],
    });
    const frame = diagram.getModel().getGroup('billing')!.getOuterBounds();
    expect(frame).toEqual({ x: 130, y: 130, width: 170, height: 196 });
  });
});
