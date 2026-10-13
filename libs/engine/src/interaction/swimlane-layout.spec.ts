// Laying out a pool. engine.layout('layered') on a diagram with a pool used to
// lay each lane's steps out on their own (blind to the links between lanes) and
// then arrange the LANES as free boxes: measured in a browser on 2026-10-13, the
// lanes left their bands, the pool frame was cut, and the steps sat in a heap.
// A pool is now laid out as ONE unit: steps go left to right along their links
// (rank columns shared by every lane), each step stays in its own lane, and the
// lanes and the pool grow to fit.
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { SwimlaneService } from './SwimlaneService';
import { layoutPool } from './swimlane-layout';

const W = 140, H = 50;
type Step = [id: string, lane: number];

function build(diagram: DiagramModel, steps: Step[], links: Array<[string, string]>, orientation: 'horizontal' | 'vertical' = 'horizontal') {
  const made = new SwimlaneService(diagram).createPool({
    name: 'Orders', orientation,
    bounds: orientation === 'horizontal' ? { x: 0, y: 0, width: 700, height: 480 } : { x: 0, y: 0, width: 480, height: 700 },
    lanes: [{ name: 'Customer' }, { name: 'Sales' }, { name: 'Warehouse' }],
    headerSize: 40,
  });
  // scrambled on purpose: every step dumped near the pool's start
  steps.forEach(([id, lane], i) => {
    const b = made.lanes[lane]!.getInnerBounds();
    diagram.addNode(new NodeModel({ id, type: 'rect', position: { x: b.x + (i % 2) * 10, y: b.y + 30 }, size: { width: W, height: H, depth: 0 } }));
    made.lanes[lane]!.addMember(id, diagram);
  });
  for (const [a, b] of links) {
    diagram.addLink(new LinkModel(diagram.getNode(a)!.getPortBySide('right')!.id, diagram.getNode(b)!.getPortBySide('left')!.id));
  }
  return made;
}
const box = (d: DiagramModel, id: string) => { const n = d.getNode(id)!; return { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height }; };
const inside = (d: DiagramModel, id: string, r: { x: number; y: number; width: number; height: number }) => {
  const b = box(d, id);
  return b.x >= r.x - 0.5 && b.y >= r.y - 0.5 && b.x + b.w <= r.x + r.width + 0.5 && b.y + b.h <= r.y + r.height + 0.5;
};
const overlap = (d: DiagramModel, a: string, b: string) => {
  const p = box(d, a), q = box(d, b);
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
};
const ORDER: Step[] = [['order', 0], ['approve', 1], ['stock', 2], ['ship', 2], ['receive', 0]];
const FLOW: Array<[string, string]> = [['order', 'approve'], ['approve', 'stock'], ['stock', 'ship'], ['ship', 'receive']];

describe('layoutPool', () => {
  it('steps go left to right along their links, each inside its own lane, none overlapping', () => {
    const d = new DiagramModel();
    const { lanes } = build(d, ORDER, FLOW);
    layoutPool(d, d.getGroups().find((g) => g.laneConfig?.role === 'pool')!);
    const xs = ['order', 'approve', 'stock', 'ship', 'receive'].map((id) => box(d, id).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const [id, lane] of ORDER) expect(inside(d, id, lanes[lane]!.getInnerBounds())).toBe(true);
    for (const [a] of ORDER) for (const [b] of ORDER) if (a < b) expect(overlap(d, a, b)).toBe(false);
  });

  it('the pool grows to hold its columns and keeps its lanes tiled in their order', () => {
    const d = new DiagramModel();
    const { pool, lanes } = build(d, ORDER, FLOW);
    layoutPool(d, pool);
    const last = box(d, 'receive');
    const p = pool.getOuterBounds();
    expect(p.x + p.width).toBeGreaterThanOrEqual(last.x + last.w);
    expect(lanes.map((l) => l.name)).toEqual(['Customer', 'Sales', 'Warehouse']);
    const b = lanes.map((l) => l.getOuterBounds());
    expect(b[1]!.y).toBeCloseTo(b[0]!.y + b[0]!.height);
    expect(b[2]!.y).toBeCloseTo(b[1]!.y + b[1]!.height);
    expect(b[0]!.y).toBe(p.y);
  });

  it('parallel branches share a column; two steps in one lane and column stack, and the lane grows to hold them', () => {
    const d = new DiagramModel();
    const { lanes } = build(d, [['a', 0], ['b', 1], ['c', 1], ['e', 2]], [['a', 'b'], ['a', 'c'], ['b', 'e'], ['c', 'e']]);
    layoutPool(d, d.getGroups().find((g) => g.laneConfig?.role === 'pool')!);
    expect(box(d, 'b').x).toBe(box(d, 'c').x);
    expect(overlap(d, 'b', 'c')).toBe(false);
    expect(inside(d, 'b', lanes[1]!.getInnerBounds()) && inside(d, 'c', lanes[1]!.getInnerBounds())).toBe(true);
    expect(box(d, 'e').x).toBeGreaterThan(box(d, 'b').x);
  });

  it('a loop in the links does not hang it, and every step still lands in its lane', () => {
    const d = new DiagramModel();
    const { lanes } = build(d, [['a', 0], ['b', 1]], [['a', 'b'], ['b', 'a']]);
    layoutPool(d, d.getGroups().find((g) => g.laneConfig?.role === 'pool')!);
    expect(inside(d, 'a', lanes[0]!.getInnerBounds())).toBe(true);
    expect(inside(d, 'b', lanes[1]!.getInnerBounds())).toBe(true);
    expect(box(d, 'a').x).not.toBe(box(d, 'b').x);
  });

  it('a vertical pool runs its steps top to bottom', () => {
    const d = new DiagramModel();
    const { lanes } = build(d, ORDER, FLOW, 'vertical');
    layoutPool(d, d.getGroups().find((g) => g.laneConfig?.role === 'pool')!);
    const ys = ['order', 'approve', 'stock', 'ship', 'receive'].map((id) => box(d, id).y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    for (const [id, lane] of ORDER) expect(inside(d, id, lanes[lane]!.getInnerBounds())).toBe(true);
  });

  it('through the service with a dispatcher it is ONE undo step', async () => {
    const engine = new DiagramEngine();
    const d = engine.createDiagram('d');
    const { pool } = build(d, ORDER, FLOW);
    const before = ORDER.map(([id]) => ({ ...d.getNode(id)!.position }));
    const svc = new SwimlaneService(d, { dispatcher: engine.commandManager });
    svc.editPool(pool, 'Lay out pool', () => layoutPool(d, pool));
    await new Promise((r) => setTimeout(r, 0));
    await engine.undo();
    expect(ORDER.map(([id]) => ({ ...d.getNode(id)!.position }))).toEqual(before);
    engine.destroy();
  });
});

describe("engine.layout() with a pool in the diagram", () => {
  it("lays the pool out as one unit: lanes stay tiled in order, every step in its lane", async () => {
    const engine = new DiagramEngine();
    const d = engine.createDiagram('d');
    const { pool, lanes } = build(d, ORDER, FLOW);
    d.addNode(new NodeModel({ id: 'loose', type: 'rect', position: { x: 50, y: 50 }, size: { width: W, height: H, depth: 0 } }));
    await engine.layout('layered', { direction: 'LR' });
    const b = lanes.map((l) => l.getOuterBounds());
    const p = pool.getOuterBounds();
    expect(b[0]!.y).toBeCloseTo(p.y);
    expect(b[1]!.y).toBeCloseTo(b[0]!.y + b[0]!.height);
    expect(b[2]!.y).toBeCloseTo(b[1]!.y + b[1]!.height);
    expect(b[2]!.y + b[2]!.height).toBeCloseTo(p.y + p.height);
    for (const l of b) expect(l.x).toBeCloseTo(p.x + 40);
    for (const [id, lane] of ORDER) expect(inside(d, id, lanes[lane]!.getInnerBounds())).toBe(true);
    const xs = ['order', 'approve', 'stock', 'ship', 'receive'].map((id) => box(d, id).x);
    expect([...xs].sort((a, b2) => a - b2)).toEqual(xs);
    // the loose node is not dropped inside the pool
    const l = box(d, 'loose');
    expect(l.x + l.w <= p.x || l.x >= p.x + p.width || l.y + l.h <= p.y || l.y >= p.y + p.height).toBe(true);
    engine.destroy();
  });
});
