import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 600, right: 1200, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const step = (id: string, x: number, y = 100): NodeSpec => ({
  id,
  position: { x, y },
  size: { width: 100, height: 60 },
  ports: [
    { id: `${id}:in`, side: 'left', type: 'input' },
    { id: `${id}:out`, side: 'right', type: 'output' },
  ],
});
const edge = (id: string, from: string, to: string) => ({ id, source: from, sourceHandle: `${from}:out`, target: to, targetHandle: `${to}:in` });
const NEW: NodeSpec = {
  size: { width: 120, height: 60 },
  ports: [
    { id: 'n:in', side: 'left', type: 'input' },
    { id: 'n:ok', side: 'right', type: 'output' },
    { id: 'n:err', side: 'bottom', type: 'output' },
  ],
};

describe('insertNodeOnLink: A→B becomes A→N→B, one undo step', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });
  const pos = (id: string) => ({ ...d!.getModel().getNode(id)!.position });
  const ends = (linkId: string) => {
    const l = d!.getModel().getLink(linkId)!;
    return [l.sourcePortId, l.targetPortId];
  };

  it('a wide gap: N sits in the middle, entry port level with A\'s, nothing moves', async () => {
    d = createDiagram(container, { nodes: [step('a', 0), step('b', 400)], edges: [edge('e', 'a', 'b')] });
    const r = (await d.insertNodeOnLink('e', { ...NEW, id: 'n' }))!;
    expect(r.nodeId).toBe('n');
    expect(r.moved).toEqual([]);
    // A's out port at x 100, B's in port at x 400: a 300 gap, N is 120 wide → x 190
    expect(pos('n').x).toBeCloseTo(190);
    expect(pos('n').y).toBeCloseTo(100); // same height cards: level ports
    expect([pos('b').x, pos('b').y]).toEqual([400, 100]);
    expect(d.getModel().getLink('e')).toBeUndefined();
    expect(ends(r.upstreamLinkId)).toEqual(['a:out', 'n:in']); // first input port
    expect(ends(r.downstreamLinkId)).toEqual(['n:ok', 'b:in']); // first output port
  });

  it('a tight gap: B and what lies downstream shift only as far as needed; upstream never moves', async () => {
    d = createDiagram(container, {
      nodes: [step('z', -300), step('a', 0), step('b', 150), step('c', 350), step('side', 150, 300)],
      edges: [edge('za', 'z', 'a'), edge('e', 'a', 'b'), edge('bc', 'b', 'c')],
    });
    const r = (await d.insertNodeOnLink('e', { ...NEW, id: 'n' }))!;
    // gap 50 (100 → 150); needed 60 + 120 + 60 = 240 → shift 190
    expect(r.moved.sort()).toEqual(['b', 'c']);
    expect(pos('b').x).toBeCloseTo(340);
    expect(pos('c').x).toBeCloseTo(540);
    expect(pos('z').x).toBe(-300);
    expect(pos('a').x).toBe(0);
    expect(pos('side').x).toBe(150); // not downstream of B: stays
    expect(pos('n').x).toBeCloseTo(160); // one gap past A's port
  });

  it('named ports, and the old labels ride on the upstream half (a branch label is the source\'s)', async () => {
    d = createDiagram(container, { nodes: [step('a', 0), step('b', 400)], edges: [{ ...edge('e', 'a', 'b'), label: 'true' }] });
    const r = (await d.insertNodeOnLink('e', { ...NEW, id: 'n' }, { outPort: 'n:err' }))!;
    expect(ends(r.downstreamLinkId)).toEqual(['n:err', 'b:in']);
    expect(d.getModel().getLink(r.upstreamLinkId)!.getLabel()).toBe('true');
    expect(d.getModel().getLink(r.downstreamLinkId)!.getLabel()).toBeFalsy();
  });

  it('ONE undo restores A→B exactly — same link id, labels, ports — and every shifted node; redo re-applies', async () => {
    d = createDiagram(container, {
      nodes: [step('a', 0), step('b', 150), step('c', 350)],
      edges: [{ ...edge('e', 'a', 'b'), label: 'true' }, edge('bc', 'b', 'c')],
    });
    const before = JSON.stringify(d.getModel().getLink('e')!.serialize());
    await d.insertNodeOnLink('e', { ...NEW, id: 'n' });
    await d.getEngine().undo();
    expect(d.getModel().getNode('n')).toBeUndefined();
    expect(JSON.stringify(d.getModel().getLink('e')!.serialize())).toBe(before);
    expect(d.getModel().getLinks()).toHaveLength(2);
    expect(pos('b').x).toBe(150);
    expect(pos('c').x).toBe(350);
    await d.getEngine().redo();
    expect(d.getModel().getNode('n')).toBeDefined();
    expect(d.getModel().getLink('e')).toBeUndefined();
    expect(pos('b').x).toBeCloseTo(340);
  });

  it('a vertical flow inserts downwards', async () => {
    const vstep = (id: string, y: number): NodeSpec => ({ id, position: { x: 100, y }, size: { width: 100, height: 60 }, ports: [{ id: `${id}:in`, side: 'top', type: 'input' }, { id: `${id}:out`, side: 'bottom', type: 'output' }] });
    d = createDiagram(container, { nodes: [vstep('a', 0), vstep('b', 120)], edges: [edge('e', 'a', 'b')] });
    const r = (await d.insertNodeOnLink('e', { id: 'n', size: { width: 100, height: 60 }, ports: [{ id: 'n:in', side: 'top', type: 'input' }, { id: 'n:out', side: 'bottom', type: 'output' }] }))!;
    expect(r.moved).toEqual(['b']);
    expect(pos('n').y).toBeCloseTo(120); // one gap below A's bottom port (60)
    expect(pos('b').y).toBeCloseTo(240); // gap 60 needed 180 → +120
  });

  it('an unknown link answers null and changes nothing', async () => {
    d = createDiagram(container, { nodes: [step('a', 0)] });
    expect(await d.insertNodeOnLink('nope', NEW)).toBeNull();
    expect(d.getModel().getNodes()).toHaveLength(1);
  });
});
