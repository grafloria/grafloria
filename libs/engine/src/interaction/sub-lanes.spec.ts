// SUB-LANES — a lane split into lanes of its own (a department with two teams).
// The split lane keeps a title strip at its start and tiles its sub-lanes in the
// rest, stacked the way the pool stacks its lanes; steps live in the sub-lanes.
// Everything a pool does — drops, confinement, sizing, reordering, folding,
// gestures, layout, undo, save — holds one level down.
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { SwimlaneService } from './SwimlaneService';
import { GroupCollapseService } from './GroupCollapseService';
import { GroupMembershipService } from './GroupMembershipService';
import { settleLaneDrop, laneAtPoint, memberConfinement, lanesOfPool } from './confinement';
import { laneHandleAt, LaneGesture } from './lane-gestures';
import { layoutPool } from './swimlane-layout';

const W = 120, H = 40;
const add = (d: DiagramModel, id: string, x: number, y: number) =>
  d.addNode(new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: W, height: H, depth: 0 } }));
const rect = (r: { x: number; y: number; width: number; height: number }) => [r.x, r.y, r.width, r.height];
const inside = (d: DiagramModel, id: string, r: { x: number; y: number; width: number; height: number }) => {
  const n = d.getNode(id)!;
  return n.position.x >= r.x - 0.5 && n.position.y >= r.y - 0.5 && n.position.x + W <= r.x + r.width + 0.5 && n.position.y + H <= r.y + r.height + 0.5;
};

/**
 * Pool (0,0) 1000×480, header 40: three lanes of 160 — Sales, Warehouse, Finance —
 * with Warehouse split into Picking and Dispatch (strip 30), one step in each,
 * and a step in Sales.
 */
function setup(diagram: DiagramModel, svc = new SwimlaneService(diagram)) {
  const made = svc.createPool({
    name: 'Orders', orientation: 'horizontal',
    bounds: { x: 0, y: 0, width: 1000, height: 480 },
    lanes: [{ name: 'Sales' }, { name: 'Warehouse' }, { name: 'Finance' }],
    headerSize: 40,
  });
  const [sales, warehouse, finance] = made.lanes as [any, any, any];
  const wb = warehouse.getInnerBounds();
  add(diagram, 'pick', 300, wb.y + 10);            // upper half of Warehouse
  add(diagram, 'ship', 500, wb.y + wb.height - 50); // lower half
  add(diagram, 'order', 200, sales.getInnerBounds().y + 20);
  warehouse.addMember('pick', diagram);
  warehouse.addMember('ship', diagram);
  sales.addMember('order', diagram);
  const subs = svc.splitLane(made.pool, warehouse.id, [{ name: 'Picking' }, { name: 'Dispatch' }]);
  return { svc, pool: made.pool, sales, warehouse, finance, picking: subs[0]!, dispatch: subs[1]! };
}

describe('sub-lanes', () => {
  it('splitLane: a title strip, two sub-lanes tiling the rest of the band, each step in the one it falls in', () => {
    const d = new DiagramModel();
    const { pool, warehouse, picking, dispatch } = setup(d);
    expect(warehouse.laneConfig).toMatchObject({ laneOrder: [picking.id, dispatch.id], headerSize: 30 });
    expect(rect(picking.getOuterBounds())).toEqual([70, 160, 930, 80]);
    expect(rect(dispatch.getOuterBounds())).toEqual([70, 240, 930, 80]);
    expect(picking.members.has('pick') && dispatch.members.has('ship')).toBe(true);
    expect([...warehouse.members].every((id) => !d.getNode(id))).toBe(true); // a split lane holds lanes, not steps
    expect(lanesOfPool(d, pool).map((l) => l.name)).toEqual(['Sales', 'Picking', 'Dispatch', 'Finance']);
  });

  it('drops land in sub-lanes: from one sub-lane to the other, and from a top lane into a sub-lane', () => {
    const d = new DiagramModel();
    const { pool, sales, picking, dispatch } = setup(d);
    const svc = new GroupMembershipService({ diagram: d });
    expect(laneAtPoint(d, pool, { x: 600, y: 270 })).toBe(dispatch);
    const pick = d.getNode('pick')!;
    const from = { ...pick.position };
    pick.setPosition(from.x, 270 - H / 2);
    settleLaneDrop(d, [{ id: 'pick', from }]);
    for (const plan of svc.planNodesDrop(['pick'])) for (const c of plan.commands) c.execute({ diagram: d } as never);
    expect(dispatch.members.has('pick') && !picking.members.has('pick')).toBe(true);
    expect(inside(d, 'pick', dispatch.getInnerBounds())).toBe(true);
    const order = d.getNode('order')!;
    const o = { ...order.position };
    order.setPosition(o.x, 200 - H / 2);
    settleLaneDrop(d, [{ id: 'order', from: o }]);
    for (const plan of svc.planNodesDrop(['order'])) for (const c of plan.commands) c.execute({ diagram: d } as never);
    expect(picking.members.has('order') && !sales.members.has('order')).toBe(true);
  });

  it("a sub-lane's step is confined to the whole pool, not its sub-lane", () => {
    const d = new DiagramModel();
    const { pool } = setup(d);
    const r = memberConfinement(d, 'pick')!;
    const p = pool.getOuterBounds();
    expect(r.y).toBeLessThanOrEqual(16 + 0.5);
    expect(r.y + r.height).toBeGreaterThanOrEqual(p.height - 16 - 0.5);
  });

  it('sizing a sub-lane grows its lane and the pool; every other lane keeps its size', () => {
    const d = new DiagramModel();
    const { svc, pool, sales, warehouse, finance, picking, dispatch } = setup(d);
    svc.setLaneSize(pool, picking.id, 140);
    const h = (g: any) => g.getOuterBounds().height;
    expect([h(sales), h(picking), h(dispatch), h(warehouse), h(finance)]).toEqual([160, 140, 80, 220, 160]);
    expect(h(pool)).toBe(540);
    expect(finance.getOuterBounds().y).toBe(380);
  });

  it('a sub-lane moves among its siblings only; a split lane moves with its sub-lanes and their steps', () => {
    const d = new DiagramModel();
    const { svc, pool, warehouse, picking, dispatch } = setup(d);
    svc.moveLane(pool, dispatch.id, 0);
    expect(warehouse.laneConfig!.laneOrder).toEqual([dispatch.id, picking.id]);
    expect(pool.laneConfig!.laneOrder!.length).toBe(3);
    const ship = { ...d.getNode('ship')!.position };
    svc.moveLane(pool, warehouse.id, 0);
    expect(lanesOfPool(d, pool).map((l) => l.name)).toEqual(['Dispatch', 'Picking', 'Sales', 'Finance']);
    expect(d.getNode('ship')!.position.y).toBe(ship.y - 160);
    expect(inside(d, 'ship', dispatch.getInnerBounds())).toBe(true);
  });

  it('adding a sub-lane to a pinned split lane gives it room: its lane and the pool grow by it', () => {
    const d = new DiagramModel();
    const { svc, pool, warehouse, picking, dispatch } = setup(d);
    svc.setLaneSize(pool, picking.id, 80); // pins every lane at every depth
    const packing = svc.addSubLane(pool, warehouse.id, { name: 'Packing' })!;
    expect(packing.getOuterBounds().height).toBe(80);
    expect(warehouse.getOuterBounds().height).toBe(240);
    expect(pool.getOuterBounds().height).toBe(560);
    expect([picking, dispatch].map((l) => l.getOuterBounds().height)).toEqual([80, 80]);
  });

  it('removing a sub-lane hands its steps to its sibling; removing the last one makes the lane whole again', () => {
    const d = new DiagramModel();
    const { svc, pool, warehouse, picking, dispatch } = setup(d);
    svc.removeLane(pool, dispatch.id);
    expect(picking.members.has('ship')).toBe(true);
    expect(warehouse.laneConfig!.laneOrder).toEqual([picking.id]);
    svc.removeLane(pool, picking.id);
    expect(warehouse.laneConfig!.laneOrder).toBeUndefined();
    expect(warehouse.members.has('pick') && warehouse.members.has('ship')).toBe(true);
    expect(inside(d, 'ship', warehouse.getInnerBounds())).toBe(true);
    expect(lanesOfPool(d, pool).map((l) => l.name)).toEqual(['Sales', 'Warehouse', 'Finance']);
  });

  it('folding a sub-lane shrinks its lane and the pool; unfolding gives it all back', () => {
    const d = new DiagramModel();
    const { pool, warehouse, finance, picking } = setup(d);
    const fold = new GroupCollapseService(d);
    fold.collapse(picking);
    expect(picking.getOuterBounds().height).toBe(44);
    expect(warehouse.getOuterBounds().height).toBe(160 - 80 + 44);
    expect(pool.getOuterBounds().height).toBe(480 - 36);
    expect(finance.getOuterBounds().y).toBe(160 + 124);
    fold.expand(picking);
    expect(picking.getOuterBounds().height).toBe(80);
    expect(pool.getOuterBounds().height).toBe(480);
    expect(inside(d, 'pick', picking.getInnerBounds())).toBe(true);
  });

  it('folding a split lane folds it whole; unfolding re-tiles its sub-lanes', () => {
    const d = new DiagramModel();
    const { pool, warehouse, picking, dispatch } = setup(d);
    const fold = new GroupCollapseService(d);
    fold.collapse(warehouse);
    expect(warehouse.getOuterBounds().height).toBe(44);
    expect(d.getNode('pick')!.state.visible).toBe(false);
    expect(lanesOfPool(d, pool).map((l) => l.name)).toEqual(['Sales', 'Warehouse', 'Finance']);
    fold.expand(warehouse);
    expect(rect(picking.getOuterBounds())).toEqual([70, 160, 930, 80]);
    expect(rect(dispatch.getOuterBounds())).toEqual([70, 240, 930, 80]);
    expect(inside(d, 'ship', dispatch.getInnerBounds())).toBe(true);
  });

  it("gestures: a split lane's strip carries it; a sub-lane's border sizes it; a sub-lane's title moves it within its lane", () => {
    const d = new DiagramModel();
    const { pool, warehouse, picking, dispatch } = setup(d);
    const at = (x: number, y: number) => { const h = laneHandleAt(d, x, y, 5) as { kind: string; lane?: { id: string } } | null; return h ? [h.kind, h.lane?.id] : null; };
    expect(at(50, 250)).toEqual(['title', warehouse.id]);
    expect(at(600, 240)).toEqual(['border', picking.id]);
    expect(at(600, 250)).toEqual(['title', dispatch.id]);
    const g = new LaneGesture(d, laneHandleAt(d, 600, 250, 5)!, 600, 250);
    for (let y = 250; y >= 0; y -= 10) g.move(600, y); // dragged far above its lane
    expect(warehouse.laneConfig!.laneOrder).toEqual([dispatch.id, picking.id]);
    expect(pool.laneConfig!.laneOrder!.map((id) => d.getGroup(id)!.name)).toEqual(['Sales', 'Warehouse', 'Finance']);
  });

  it('layout: steps go along the leaves, each in its own sub-lane, columns past the title strip', () => {
    const d = new DiagramModel();
    const { pool, picking, dispatch, sales } = setup(d);
    d.addLink(new LinkModel(d.getNode('order')!.getPortBySide('right')!.id, d.getNode('pick')!.getPortBySide('left')!.id));
    d.addLink(new LinkModel(d.getNode('pick')!.getPortBySide('right')!.id, d.getNode('ship')!.getPortBySide('left')!.id));
    layoutPool(d, pool);
    expect(inside(d, 'order', sales.getInnerBounds())).toBe(true);
    expect(inside(d, 'pick', picking.getInnerBounds())).toBe(true);
    expect(inside(d, 'ship', dispatch.getInnerBounds())).toBe(true);
    const xs = ['order', 'pick', 'ship'].map((id) => d.getNode(id)!.position.x);
    expect(xs[0]! < xs[1]! && xs[1]! < xs[2]!).toBe(true);
    expect(xs[0]).toBeGreaterThanOrEqual(40 + 30); // every column clears the split lane's strip
  });

  it('a vertical pool splits its column into columns', () => {
    const d = new DiagramModel();
    const svc = new SwimlaneService(d);
    const { pool, lanes } = svc.createPool({
      name: 'Orders', orientation: 'vertical', bounds: { x: 0, y: 0, width: 900, height: 800 },
      lanes: [{ name: 'Sales' }, { name: 'Warehouse' }, { name: 'Finance' }], headerSize: 40,
    });
    add(d, 'pick', 310, 300); // the left half of Warehouse (300–600)
    add(d, 'ship', 470, 500); // the right half
    lanes[1]!.addMember('pick', d);
    lanes[1]!.addMember('ship', d);
    const [picking, dispatch] = svc.splitLane(pool, lanes[1]!.id, [{ name: 'Picking' }, { name: 'Dispatch' }]);
    expect(rect(picking!.getOuterBounds())).toEqual([300, 70, 150, 730]);
    expect(rect(dispatch!.getOuterBounds())).toEqual([450, 70, 150, 730]);
    expect(picking!.members.has('pick') && dispatch!.members.has('ship')).toBe(true);
  });

  it('with a dispatcher, a split is ONE undo step; and the structure survives save and load', async () => {
    const engine = new DiagramEngine();
    const d = engine.createDiagram('d');
    const svc = new SwimlaneService(d, { dispatcher: engine.commandManager });
    const plain = new SwimlaneService(d);
    const made = plain.createPool({ name: 'P', orientation: 'horizontal', bounds: { x: 0, y: 0, width: 800, height: 320 }, lanes: [{ name: 'A' }, { name: 'B' }], headerSize: 40 });
    add(d, 's', 200, 30);
    made.lanes[0]!.addMember('s', d);
    svc.splitLane(made.pool, made.lanes[0]!.id, [{ name: 'A1' }, { name: 'A2' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(lanesOfPool(d, made.pool).map((l) => l.name)).toEqual(['A1', 'A2', 'B']);
    const loaded = DiagramModel.fromJSON(JSON.parse(JSON.stringify(d.serialize())));
    expect(lanesOfPool(loaded, loaded.getGroup(made.pool.id)!).map((l) => l.name)).toEqual(['A1', 'A2', 'B']);
    await engine.undo();
    expect(lanesOfPool(d, made.pool).map((l) => l.name)).toEqual(['A', 'B']);
    expect(made.lanes[0]!.members.has('s')).toBe(true);
    engine.destroy();
  });
});
