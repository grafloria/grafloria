/**
 * The Mermaid parse gaps of the Atloria brief (2026-10-19), checked on the canvas
 * a reader actually gets from `createDiagram().loadText`:
 *
 *  - P0-5a  a state id with spaces is REFUSED with line errors (it used to load
 *           with the lines silently gone — or as an empty diagram);
 *  - P0-5b  `accTitle` / `accDescr` / a frontmatter `title` name and describe the
 *           SVG (they used to become a state, or nothing);
 *  - P1-10  `--o`, `--x`, `<-->` and `---` draw a circle, a cross, both ends and
 *           no marker (all four drew one triangle), and `>text]` draws the flag.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('loadText — the Mermaid parse gaps, on the canvas', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  beforeEach(() => {
    container = makeContainer();
    diagram = createDiagram(container, {
      nodes: [{ id: 'keep', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'Keep' }],
      edges: [],
    });
  });
  afterEach(() => {
    diagram.dispose();
    container.remove();
  });

  const root = () => container.querySelector('svg.grafloria-diagram') as SVGSVGElement;

  it('P0-5a: invoice-lifecycle#1 is refused with errors naming lines 2 and 3; the canvas is unchanged', () => {
    const fence =
      'stateDiagram-v2\n' +
      '    Draft --> Release for Approval: Request approval\n' +
      '    Release for Approval --> Approved: Approve\n' +
      '    Approved --> Due: Consider as sent to client/principal\n' +
      '    Due --> Overdue: payment period overdue\n' +
      '    Due --> Paid: due amount ≤ 0\n' +
      '    Approved --> Draft: Consider as not approved\n';
    expect(() => diagram.loadText(fence)).toThrow(/Line 2: a state id cannot contain spaces[\s\S]*Line 3: a state id cannot contain spaces/);
    expect(diagram.getModel().getNodes().map((n) => n.id)).toEqual(['keep']);
    // A fence made only of such lines is refused too, not loaded as an empty canvas.
    expect(() => diagram.loadText('stateDiagram-v2\n    Draft --> Release for Approval\n')).toThrow(/Line 2/);
    expect(diagram.getModel().getNodes().map((n) => n.id)).toEqual(['keep']);
  });

  it('P0-5b: accTitle names the SVG and accDescr describes it; accTitle is not a state', () => {
    diagram.loadText('stateDiagram-v2\n  accTitle: Lifecycle\n  accDescr: How an invoice moves\n  [*] --> A');
    diagram.renderNow();
    expect(diagram.getModel().getNodes().map((n) => n.getLabel())).not.toContain('Lifecycle');
    expect(root().getAttribute('aria-label')).toMatch(/^Lifecycle, 2 nodes, 1 edge$/);
    expect(root().getAttribute('aria-description')).toBe('How an invoice moves');
    // The next text without them takes them away again.
    diagram.loadText('flowchart LR\n  A --> B');
    diagram.renderNow();
    expect(root().getAttribute('aria-label')).toBe('Diagram, 2 nodes, 1 edge');
    expect(root().hasAttribute('aria-description')).toBe(false);
  });

  it('P0-5b: a frontmatter title names the SVG when there is no accTitle; a diagram with neither is unchanged', () => {
    diagram.loadText('---\ntitle: Order flow\n---\nflowchart LR\n  A --> B');
    diagram.renderNow();
    expect(root().getAttribute('aria-label')).toBe('Order flow, 2 nodes, 1 edge');
    expect(root().hasAttribute('aria-description')).toBe(false);

    diagram.loadText('flowchart LR\n  A --> B');
    diagram.renderNow();
    expect(root().getAttribute('aria-label')).toBe('Diagram, 2 nodes, 1 edge');
  });


  it('P1-10: each edge kind draws its own markers, and `>Flag]` draws the flag', () => {
    diagram.loadText('flowchart LR\n A --o B\n B --x C\n C <--> D\n D --- E\n E --> F>Flag]');
    diagram.renderNow();
    const markers = (from: string, to: string): string[] => {
      const link = diagram.getModel().getLinks().find((l) => l.sourceNodeId === from && l.targetNodeId === to)!;
      return Array.from(container.querySelectorAll(`[data-link-id="${link.id}"] .arrow`))
        .map((el) => Array.from(el.classList).find((c) => c !== 'arrow')!)
        .sort();
    };
    expect(markers('A', 'B')).toEqual(['arrow-circle']);
    expect(markers('B', 'C')).toEqual(['arrow-cross']);
    expect(markers('C', 'D')).toEqual(['arrow-triangle', 'arrow-triangle']);
    expect(markers('D', 'E')).toEqual([]);
    expect(markers('E', 'F')).toEqual(['arrow-triangle']);

    // The flag: a five-point outline with the notch on the left, not a rectangle.
    const body = container.querySelector('[data-node-id="F"] polygon');
    expect(body).not.toBeNull();
    const points = (body!.getAttribute('points') ?? '').trim().split(/\s+/);
    expect(points).toHaveLength(5);
    const [x0] = points[0].split(',').map(Number);
    const [xNotch] = points[4].split(',').map(Number);
    expect(xNotch).toBeGreaterThan(x0);
  });
});
