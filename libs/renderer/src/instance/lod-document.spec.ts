/**
 * A DOCUMENTATION FIGURE KEEPS ITS WORDS.
 *
 * A docs reader fits each diagram to its column. A 9-box `flowchart LR` at the
 * reader's desktop width (713 px) lands at zoom ~0.4 — below the default LOD's
 * 0.5 breakpoint — and rendered as nine EMPTY boxes with bare lines: no node
 * text, no edge labels, no arrowheads. On a phone (282 px) 21 of 32 real manual
 * fences did the same. A static figure cannot be zoomed, so the words were
 * simply gone.
 *
 * Two ways out, both pinned here:
 *   1. `lod: 'document'` on createDiagram / renderToStaticSVG: nothing is ever
 *      shed, at any zoom, whatever the diagram's size or its own LOD policy —
 *      what a docs reader passes;
 *   2. opt-in on a canvas: `createDefaultLODConfig({ smallDiagramNodes: 200 })`,
 *      and a diagram under 200 nodes never sheds labels or arrowheads.
 * The DEFAULT is unchanged: a small canvas zoomed out follows the full ladder.
 */
import { createDefaultLODConfig, SMALL_DIAGRAM_NODES } from '@grafloria/engine';
import { createDiagram, type DiagramInstance } from './create-diagram';
import { renderToStaticSVG } from '../ssr/render-to-static';
import type { EdgeSpec, NodeSpec } from './model-input';

const CHAIN = 'flowchart LR\n' + Array.from({ length: 8 }, (_, i) => `    N${i + 1}[Step ${i + 1}] --> N${i + 2}[Step ${i + 2}]`).join('\n');

function makeContainer(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width, height, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const labels = (root: ParentNode) => Array.from(root.querySelectorAll('text.diagram-label')).map((t) => t.textContent);
const arrows = (root: ParentNode) => root.querySelectorAll('[class~="arrow"]').length;

describe('a fitted 9-node flowchart LR chain at zoom ~0.4 keeps every label and arrow', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer(713, 200)));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  function mount(options: Parameters<typeof createDiagram>[1] = {}): DiagramInstance {
    diagram = createDiagram(container, { readonly: true, renderer: { qualityGovernor: false }, ...options });
    diagram.loadText(CHAIN);
    diagram.fitView(16);
    diagram.renderNow();
    return diagram;
  }

  it('the fixture really is the failing case: fitted to 713 px it lands below zoom 0.5', () => {
    const d = mount();
    expect(d.viewport.getZoom()).toBeLessThan(0.5);
    expect(d.viewport.getZoom()).toBeGreaterThan(0.3);
  });

  it('opted in (smallDiagramNodes: 200): all 9 node labels and all 8 arrowheads render', () => {
    const d = mount();
    d.getModel().setLODConfig(createDefaultLODConfig({ smallDiagramNodes: SMALL_DIAGRAM_NODES }));
    d.renderNow();
    expect(labels(container)).toEqual(Array.from({ length: 9 }, (_, i) => `Step ${i + 1}`));
    expect(arrows(container)).toBe(8);
    // …and pinned at exactly 0.4, and at a phone's ~0.17:
    for (const zoom of [0.4, 0.17]) {
      d.viewport.setZoom(zoom);
      d.renderNow();
      expect(labels(container)).toHaveLength(9);
      expect(arrows(container)).toBe(8);
    }
  });

  it("lod: 'document': every label and arrowhead at 0.4 — even under a policy that sheds", () => {
    const d = mount({ lod: 'document' });
    // The diagram's OWN policy says shed (the default: the full ladder, no
    // small-diagram floor); a document figure ignores that — nobody can zoom it.
    for (const zoom of [0.4, 0.1]) {
      d.viewport.setZoom(zoom);
      d.renderNow();
      expect(labels(container)).toHaveLength(9);
      expect(arrows(container)).toBe(8);
    }
    expect(d.getQualityState().tier).toBe('document');
  });

  it('BY DEFAULT, as before: without document mode or the floor it sheds them at 0.4 (LOD still works)', () => {
    const d = mount();
    d.viewport.setZoom(0.4);
    d.renderNow();
    expect(d.getQualityState().tier).toBe('sketch');
    expect(labels(container)).toHaveLength(0);
    expect(arrows(container)).toBe(0);
  });
});

describe("renderToStaticSVG({ lod: 'document' })", () => {
  // 220 nodes: past even the opt-in floor, so any policy sheds at far zoom.
  const N = 220;
  const nodes: NodeSpec[] = Array.from({ length: N }, (_, i) => ({
    id: `n${i}`,
    position: { x: (i % 20) * 200, y: Math.floor(i / 20) * 140 },
    size: { width: 120, height: 60 },
    label: `Box ${i}`,
  }));
  const edges: EdgeSpec[] = Array.from({ length: 19 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}` }));
  // Fitted to a 400 px canvas: every box in view, at a far zoom (~0.1).
  const render = (lod?: 'auto' | 'document') =>
    renderToStaticSVG({ nodes, edges, width: 400, height: 300, fitView: true, fitPadding: 8, ...(lod ? { lod } : {}) });

  it('a big diagram fitted at zoom ~0.1 sheds its labels by default (the LOD ladder is intact)', () => {
    const out = render();
    expect(out.snapshot.zoom).toBeLessThan(0.2);
    expect(out.svg).not.toContain('class="diagram-label"');
  });

  it("…and keeps every label and arrowhead with lod: 'document'", () => {
    const svg = render('document').svg;
    expect((svg.match(/class="diagram-label"/g) ?? []).length).toBe(N);
    expect((svg.match(/class="arrow /g) ?? []).length).toBe(edges.length);
  });
});
