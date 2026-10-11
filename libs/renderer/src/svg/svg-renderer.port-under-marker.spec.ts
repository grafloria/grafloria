/**
 * S15 (docs review v4): ER port dots were drawn over the crow's-foot markers.
 *
 * Ports paint in an overlay ABOVE every node body and every link (so nothing can
 * hide a connection target), which also put each port's dot on top of the
 * marker drawn at the link end that lands on it: build-database-editors showed
 * round dots where the crow's foot and the "one" bar should be. A port yields to
 * an end-glyph marker (the ERD cardinalities, the UML diamonds and the
 * generalization triangle) at a link end that lands on it — until a connection
 * gesture makes it a live target again. Plain arrows keep today's look.
 *
 * Drawing order and visibility only: the markers' orientation is not touched.
 */
import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, LinkModel, NodeModel, PortModel, PortVisibilityStrategy } from '@grafloria/engine';
import { LIGHT_THEME } from '../themes';
import type { VNode } from '../types/vnode.types';

const FULL_VIEW = { x: -2000, y: -2000, width: 8000, height: 8000 };

function portIds(v: VNode | undefined, out: string[] = []): string[] {
  if (!v || typeof v !== 'object') return out;
  const id = (v.props as Record<string, unknown> | undefined)?.['data-port-id'];
  if (typeof id === 'string') out.push(id);
  for (const c of (v.children ?? []) as VNode[]) portIds(c, out);
  return out;
}

describe('S15: a port dot never paints over the end marker landing on it', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;

  function setup(head: string, tail: string) {
    const diagram = engine.getDiagram()!;
    const orders = new NodeModel({ id: 'orders', type: 'default', position: { x: 400, y: 40 }, size: { width: 200, height: 80 } });
    const customers = new NodeModel({ id: 'customers', type: 'default', position: { x: 0, y: 40 }, size: { width: 200, height: 80 } });
    for (const n of [orders, customers]) for (const p of [...n.getPorts().values()]) n.removePort(p.id);
    orders.addPort(new PortModel({ id: 'orders.fk-out', type: 'output', side: 'left' } as never));
    orders.addPort(new PortModel({ id: 'orders.free', type: 'output', side: 'right' } as never));
    customers.addPort(new PortModel({ id: 'customers.id-in', type: 'input', side: 'right' } as never));
    diagram.addNode(orders);
    diagram.addNode(customers);
    const link = new LinkModel('orders.fk-out', 'customers.id-in', 'orthogonal');
    link.updateStyle({ arrowTail: { type: tail, size: 8, filled: false }, arrowHead: { type: head, size: 9, filled: false } } as never);
    diagram.addLink(link);
    return { diagram, link, orders, customers };
  }

  beforeEach(() => {
    engine = new DiagramEngine();
    engine.createDiagram('er');
    engine.setInteractionConfig({ portVisibility: PortVisibilityStrategy.ALWAYS });
    renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
  });

  it("an ER link's two marker ends hide their ports' dots; a free port still shows", () => {
    setup('one', 'crow-foot');
    const drawn = portIds(renderer.render(FULL_VIEW, 1) as VNode);
    expect(drawn).toContain('orders.free');
    expect(drawn).not.toContain('orders.fk-out');
    expect(drawn).not.toContain('customers.id-in');
  });

  it('a connection gesture brings the dot back (the port is a live target)', () => {
    const { customers } = setup('one', 'crow-foot');
    customers.getPort('customers.id-in')!.isValidTarget = true;
    expect(portIds(renderer.render(FULL_VIEW, 1) as VNode)).toContain('customers.id-in');
  });

  it('plain arrows keep their ports drawn (flowcharts unchanged)', () => {
    setup('arrow', 'none');
    const drawn = portIds(renderer.render(FULL_VIEW, 1) as VNode);
    expect(drawn).toContain('orders.fk-out');
    expect(drawn).toContain('customers.id-in');
  });
});
