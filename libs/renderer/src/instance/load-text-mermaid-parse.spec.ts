/**
 * The Mermaid parse gaps of the Atloria brief (2026-10-19), checked on the canvas
 * a reader actually gets from `createDiagram().loadText`:
 *
 *  - P0-5a  a state id with spaces is REFUSED with line errors (it used to load
 *           with the lines silently gone — or as an empty diagram);
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
});
