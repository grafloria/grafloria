// PHASES — named stages across every lane of a pool ("Order", "Fulfil", "Bill").
// A header band names them; the lanes tile the rest of the pool; a step belongs
// to the phase it sits in and moves with it; layout keeps it there.
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { SwimlaneService } from './SwimlaneService';
import { phaseBands, phaseHeaderRect, phaseAt } from './pool-phases';
import { laneHandleAt, LaneGesture } from './lane-gestures';
import { layoutPool } from './swimlane-layout';

const W = 120, H = 40;
const add = (d: DiagramModel, id: string, x: number, y: number) =>
  d.addNode(new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: W, height: H, depth: 0 } }));
const spans = (pool: Parameters<typeof phaseBands>[0]) => phaseBands(pool).map((b) => [b.name, b.start, b.end]);

/** A 1000×328 pool at (0,0), header 40, phase header 28: lanes Sales/Warehouse of 150; phases Order 300, Fulfil 360, Bill (the rest, 300). */
function setup(d: DiagramModel, svc = new SwimlaneService(d)) {
  const made = svc.createPool({
    name: 'Orders', orientation: 'horizontal', bounds: { x: 0, y: 0, width: 1000, height: 328 },
    lanes: [{ name: 'Sales' }, { name: 'Warehouse' }], headerSize: 40,
    phases: [{ id: 'order', name: 'Order', size: 300 }, { id: 'fulfil', name: 'Fulfil', size: 360 }, { id: 'bill', name: 'Bill' }],
  });
  add(d, 'a', 100, 60); made.lanes[0]!.addMember('a', d);   // Order
  add(d, 'b', 450, 210); made.lanes[1]!.addMember('b', d);  // Fulfil
  add(d, 'c', 800, 60); made.lanes[0]!.addMember('c', d);   // Bill
  return { svc, ...made };
}

describe('pool phases', () => {
  it('a header band names the phases; the lanes tile the pool under it', () => {
    const d = new DiagramModel();
    const { pool, lanes } = setup(d);
    expect(spans(pool)).toEqual([['Order', 40, 340], ['Fulfil', 340, 700], ['Bill', 700, 1000]]);
    expect(phaseHeaderRect(pool)).toEqual({ x: 40, y: 0, width: 960, height: 28 });
    expect(lanes.map((l) => [l.getOuterBounds().y, l.getOuterBounds().height])).toEqual([[28, 150], [178, 150]]);
    expect(phaseAt(pool, 450)?.name).toBe('Fulfil');
  });

  it("a vertical pool's phases run down it, named in a band on its left", () => {
    const d = new DiagramModel();
    const { pool, lanes } = new SwimlaneService(d).createPool({
      name: 'Orders', orientation: 'vertical', bounds: { x: 0, y: 0, width: 328, height: 1000 },
      lanes: [{ name: 'Sales' }, { name: 'Warehouse' }], headerSize: 40,
      phases: [{ name: 'Order' }, { name: 'Bill' }],
    });
    expect(spans(pool)).toEqual([['Order', 40, 520], ['Bill', 520, 1000]]);
    expect(phaseHeaderRect(pool)).toEqual({ x: 0, y: 40, width: 28, height: 960 });
    expect(lanes[0]!.getOuterBounds().x).toBe(28);
  });

  it('sizing a phase grows the pool along its lanes; the steps in later phases move along, earlier ones stay', () => {
    const d = new DiagramModel();
    const { svc, pool } = setup(d);
    svc.setPhaseSize(pool, 'fulfil', 460);
    expect(spans(pool)).toEqual([['Order', 40, 340], ['Fulfil', 340, 800], ['Bill', 800, 1100]]);
    expect(pool.getOuterBounds().width).toBe(1100);
    expect(d.getNode('a')!.position.x).toBe(100);
    expect(d.getNode('b')!.position.x).toBe(450);
    expect(d.getNode('c')!.position.x).toBe(900);
  });

  it('adding a phase grows the pool by its size; removing one hands its room to the phase before it', () => {
    const d = new DiagramModel();
    const { svc, pool } = setup(d);
    svc.addPhase(pool, { id: 'pack', name: 'Pack', size: 200 }, 2);
    expect(spans(pool).map((s) => s[0])).toEqual(['Order', 'Fulfil', 'Pack', 'Bill']);
    expect(pool.getOuterBounds().width).toBe(1200);
    expect(d.getNode('c')!.position.x).toBe(1000);
    svc.removePhase(pool, 'pack');
    expect(spans(pool)).toEqual([['Order', 40, 340], ['Fulfil', 340, 900], ['Bill', 900, 1200]]);
    expect(d.getNode('c')!.position.x).toBe(1000);
  });

  it('moving a phase carries its steps, each keeping its place inside the phase', () => {
    const d = new DiagramModel();
    const { svc, pool } = setup(d);
    svc.movePhase(pool, 'bill', 0);
    expect(spans(pool)).toEqual([['Bill', 40, 340], ['Order', 340, 640], ['Fulfil', 640, 1000]]);
    expect(d.getNode('c')!.position.x).toBe(140); // 100 into Bill, still
    expect(d.getNode('a')!.position.x).toBe(400);
    expect(d.getNode('b')!.position.x).toBe(750);
  });

  it('layout keeps every step in its phase, each phase as long as its steps need', () => {
    const d = new DiagramModel();
    const { pool, lanes } = setup(d);
    add(d, 'b2', 600, 210); lanes[1]!.addMember('b2', d); // also in Fulfil
    const link = (s: string, t: string) => d.addLink(new LinkModel(d.getNode(s)!.getPortBySide('right')!.id, d.getNode(t)!.getPortBySide('left')!.id));
    link('a', 'b'); link('b', 'b2'); link('b2', 'c');
    layoutPool(d, pool);
    for (const [id, phase] of [['a', 'Order'], ['b', 'Fulfil'], ['b2', 'Fulfil'], ['c', 'Bill']] as const) {
      const n = d.getNode(id)!;
      const band = phaseBands(pool).find((p) => p.name === phase)!;
      expect(n.position.x).toBeGreaterThanOrEqual(band.start);
      expect(n.position.x + W).toBeLessThanOrEqual(band.end);
    }
    expect(d.getNode('b')!.position.x).toBeLessThan(d.getNode('b2')!.position.x);
    const bands = phaseBands(pool);
    expect(pool.getOuterBounds().width).toBe(40 + bands.reduce((s, b) => s + (b.end - b.start), 0));
    expect(lanes[0]!.getOuterBounds().y).toBe(28);
  });

  it("gestures: the header's lines size phases, its cells carry them; a lane's title still works under the header", () => {
    const d = new DiagramModel();
    const { pool } = setup(d);
    const at = (x: number, y: number) => { const h = laneHandleAt(d, x, y, 5) as any; return h ? [h.kind, h.phaseId ?? h.lane?.name] : null; };
    expect(at(340, 14)).toEqual(['phase-border', 'order']);
    expect(at(500, 14)).toEqual(['phase-title', 'fulfil']);
    expect(at(1000, 14)).toEqual(['pool-edge', undefined]);
    expect(at(500, 35)).toEqual(['title', 'Sales']);
    const g = new LaneGesture(d, laneHandleAt(d, 340, 14, 5)!, 340, 14);
    g.move(400, 14);
    expect(spans(pool)[0]).toEqual(['Order', 40, 400]);
    const r = new LaneGesture(d, laneHandleAt(d, 850, 14, 5)!, 850, 14);
    for (let x = 850; x >= 50; x -= 20) r.move(x, 14);
    expect(spans(pool).map((s) => s[0])).toEqual(['Bill', 'Order', 'Fulfil']);
  });

  it('with a dispatcher every phase edit is ONE undo step; phases survive save and load', async () => {
    const engine = new DiagramEngine();
    const d = engine.createDiagram('d');
    const { pool } = setup(d, new SwimlaneService(d));
    const svc = new SwimlaneService(d, { dispatcher: engine.commandManager });
    const before = JSON.stringify(spans(pool));
    svc.setPhaseSize(pool, 'order', 500);
    svc.movePhase(pool, 'bill', 0);
    await new Promise((r) => setTimeout(r, 0));
    await engine.undo();
    await engine.undo();
    expect(JSON.stringify(spans(pool))).toBe(before);
    expect(d.getNode('c')!.position.x).toBe(800);
    const loaded = DiagramModel.fromJSON(JSON.parse(JSON.stringify(d.serialize())));
    expect(spans(loaded.getGroup(pool.id)!)).toEqual(spans(pool));
    engine.destroy();
  });
});
