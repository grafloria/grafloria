/**
 * `layout: 'architecture'` in the render spec — the same composition as the
 * Mermaid `%%grafloria:layout architecture`, for a diagram built in code: boxes
 * with NO positions, zones, lines with a side named where it matters (a relation,
 * not a coordinate), a note `near` what it is about.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { EdgeSpec, GroupSpec, NodeSpec } from './model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 700, right: 1200, bottom: 700 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const sub = (text: string) => ({ text, fontSize: 11 });
const box = { fontSize: 13 };
const NODES: NodeSpec[] = [
  { id: 'customer', label: 'Customer', sublabel: sub('phone or browser'), style: box },
  { id: 'page', label: 'HealthPay payment page', sublabel: sub('the card is typed here'), style: box },
  { id: 'wallets', label: 'HealthPay wallets', sublabel: sub("hold the customer's money"), style: box },
  { id: 'api', label: 'Our API', sublabel: { text: 'sherkety-erp-api', fontFamily: 'mono', fontSize: 11 }, style: box },
  { id: 'db', label: 'Our database', sublabel: sub('keys, ledger, bank numbers'), style: box },
  { id: 'fake', label: 'Fake card page', sublabel: sub("not HealthPay's"), style: box },
  { id: 'note', label: 'if someone swaps the link, the customer lands here (M1)', shape: { type: 'text' }, style: { fontSize: 11, fontWeight: '700' }, near: { target: 'fake', side: 'right' } },
];
const GROUPS: GroupSpec[] = [
  { id: 'hp', label: "HEALTHPAY'S SIDE · CARDS ARE TYPED HERE", children: ['page', 'wallets'], direction: 'LR' },
  { id: 'ours', label: 'OUR SIDE · MUST NEVER SEE A CARD', children: ['api', 'db'], direction: 'LR', labelPlacement: 'bottom-left' },
];
const EDGES: EdgeSpec[] = [
  { source: 'customer', target: 'page', label: 'card number and CVV' },
  { source: 'page', target: 'wallets', label: 'adds money' },
  { source: 'api', target: 'wallets', sourceHandle: 'top', targetHandle: 'bottom', label: 'asks HealthPay to move money' },
  { source: 'api', target: 'db', label: 'saves keys' },
  { source: 'api', target: 'customer', label: 'sends the payment link' },
  { source: 'customer', target: 'api', label: 'card typed as a\n"bank account" (H1)' },
  { source: 'customer', target: 'fake', sourceHandle: 'bottom', targetHandle: 'top' },
];

describe("render spec layout: 'architecture'", () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const rect = (id: string) => {
    const m = diagram!.getModel();
    const n = m.getNode(id);
    if (n) return { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
    const b = m.getGroup(id)!.getOuterBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };

  it('composes boxes that were given no positions: zones stacked, the customer left, the fake page below it, the note beside it', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: GROUPS, edges: EDGES, layout: 'architecture' });
    const hp = rect('hp'), ours = rect('ours'), c = rect('customer'), f = rect('fake'), n = rect('note');
    expect(hp.y + hp.h).toBeLessThan(ours.y);
    expect(c.x + c.w).toBeLessThan(hp.x);
    expect(f.y).toBeGreaterThan(c.y + c.h);
    expect(n.x).toBeGreaterThanOrEqual(f.x + f.w);
    expect(rect('page').y).toBeCloseTo(rect('wallets').y, 0);
    expect(rect('page').x).toBeCloseTo(rect('api').x, 0);
  });

  it('a plain side handle is a relation the layout reads (and keeps): the fake page hangs under the customer on a straight line', () => {
    diagram = createDiagram(container, { nodes: NODES, groups: GROUPS, edges: EDGES, layout: 'architecture' });
    const l = diagram.getModel().getLinks().find((x) => x.targetNodeId === 'fake')!;
    expect(l.getMetadata('sourceSide')).toBe('bottom');
    expect(l.sourcePortId).toMatch(/__bottom@/);
    diagram.renderNow();
    const d = container.querySelector(`[data-link-id="${l.id}"] path`)!.getAttribute('d') ?? '';
    const xs = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
    expect(new Set(xs.map(Math.round)).size).toBe(1); // one x, top to bottom
  });

  it('without the option nothing moves: boxes stay where the spec (or its default) put them', () => {
    diagram = createDiagram(container, { nodes: NODES.map((n) => ({ ...n, position: { x: 5, y: 5 } })), edges: EDGES });
    expect(rect('page').x).toBe(5);
  });
});
