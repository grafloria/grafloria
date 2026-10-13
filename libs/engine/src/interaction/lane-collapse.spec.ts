// Collapsing a LANE. A lane is a band of its pool, so it collapses to a thin
// titled band across the pool, the bands after it close up, and the pool gives
// back the space — the other lanes keep their size. Measured before this: the
// lane shrank to a 180×44 box at its corner, the next lane stayed where it was,
// and the pool kept a hole where the lane had been.
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { SwimlaneService } from './SwimlaneService';
import { GroupCollapseService } from './GroupCollapseService';
import { settleLaneDrop, groupDragContents } from './confinement';

const BAND = 44; // a collapsed lane's thickness

function node(id: string, x: number, y: number): NodeModel {
  return new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: 100, height: 40, depth: 0 } });
}

/** 3 lanes of 160 in a 1000×480 pool at (60, 60), one step in each lane. */
function pool(diagram: DiagramModel, orientation: 'horizontal' | 'vertical' = 'horizontal') {
  const svc = new SwimlaneService(diagram);
  const made = svc.createPool({
    name: 'Orders', orientation,
    bounds: orientation === 'horizontal' ? { x: 60, y: 60, width: 1000, height: 480 } : { x: 60, y: 60, width: 480, height: 1000 },
    lanes: [{ name: 'Customer' }, { name: 'Sales' }, { name: 'Warehouse' }],
    headerSize: 40,
  });
  made.lanes.forEach((lane, i) => {
    const b = lane.getInnerBounds();
    const n = orientation === 'horizontal' ? node(`s${i}`, b.x + 200, b.y + 60) : node(`s${i}`, b.x + 60, b.y + 200);
    diagram.addNode(n);
    lane.addMember(n.id, diagram);
  });
  return { svc, ...made };
}

const rect = (r: { x: number; y: number; width: number; height: number }) => [r.x, r.y, r.width, r.height];

describe('collapsing a lane', () => {
  it('folds the lane to a band across the pool, closes the gap and shrinks the pool', () => {
    const diagram = new DiagramModel();
    const { pool: p, lanes } = pool(diagram);
    const s2 = { ...diagram.getNode('s2')!.position };

    new GroupCollapseService(diagram).collapse(lanes[1]!);

    expect(rect(lanes[0]!.getOuterBounds())).toEqual([100, 60, 960, 160]);
    expect(rect(lanes[1]!.getOuterBounds())).toEqual([100, 220, 960, BAND]);
    expect(rect(lanes[2]!.getOuterBounds())).toEqual([100, 220 + BAND, 960, 160]);
    expect(rect(p.getOuterBounds())).toEqual([60, 60, 1000, 480 - 160 + BAND]);
    // the step in the lane after it rode up with its band
    expect(diagram.getNode('s2')!.position).toEqual(expect.objectContaining({ x: s2.x, y: s2.y - (160 - BAND) }));
    // the folded lane's step is hidden; its placeholder IS the band
    expect(diagram.getNode('s1')!.state.visible).toBe(false);
    const proxy = diagram.getNode(lanes[1]!.collapsedState!.proxyNodeId)!;
    expect([proxy.position.x, proxy.position.y, proxy.size.width, proxy.size.height]).toEqual([100, 220, 960, BAND]);
  });

  it('expands back to exactly where it was', () => {
    const diagram = new DiagramModel();
    const { pool: p, lanes } = pool(diagram);
    const before = { pool: rect(p.getOuterBounds()), lanes: lanes.map((l) => rect(l.getOuterBounds())), steps: ['s0', 's1', 's2'].map((id) => ({ ...diagram.getNode(id)!.position })) };
    const svc = new GroupCollapseService(diagram);
    svc.collapse(lanes[1]!);
    svc.expand(lanes[1]!);
    expect(rect(p.getOuterBounds())).toEqual(before.pool);
    expect(lanes.map((l) => rect(l.getOuterBounds()))).toEqual(before.lanes);
    expect(['s0', 's1', 's2'].map((id) => ({ ...diagram.getNode(id)!.position }))).toEqual(before.steps);
    expect(diagram.getNode('s1')!.state.visible).not.toBe(false);
    expect(lanes[1]!.laneConfig!.fixedSize).toBeUndefined();
  });

  it('expands into the pool where it is NOW: a pool moved while the lane was folded brings its steps along', () => {
    const diagram = new DiagramModel();
    const { svc, pool: p, lanes } = pool(diagram);
    const s1 = { ...diagram.getNode('s1')!.position };
    const collapse = new GroupCollapseService(diagram);
    collapse.collapse(lanes[1]!);
    const b = p.getOuterBounds();
    svc.resizePool(p, { ...b, x: b.x + 300, y: b.y + 100 });
    collapse.expand(lanes[1]!);
    expect(diagram.getNode('s1')!.position).toEqual(expect.objectContaining({ x: s1.x + 300, y: s1.y + 100 }));
    expect(rect(p.getOuterBounds())).toEqual([360, 160, 1000, 480]);
  });

  it('a vertical pool folds the lane to a column band', () => {
    const diagram = new DiagramModel();
    const { pool: p, lanes } = pool(diagram, 'vertical');
    new GroupCollapseService(diagram).collapse(lanes[0]!);
    expect(rect(lanes[0]!.getOuterBounds())).toEqual([60, 100, BAND, 960]);
    expect(lanes[1]!.getOuterBounds().x).toBe(60 + BAND);
    expect(p.getOuterBounds().width).toBe(480 - 160 + BAND);
  });

  it('collapse and expand through the engine are one undo step each', async () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('d');
    const { pool: p, lanes } = pool(diagram);
    const h0 = p.getOuterBounds().height;
    await engine.collapseGroup(lanes[1]!.id);
    expect(p.getOuterBounds().height).toBe(h0 - 160 + BAND);
    await engine.undo();
    expect(p.getOuterBounds().height).toBe(h0);
    expect(lanes[2]!.getOuterBounds().y).toBe(60 + 320);
    expect(diagram.getNode('s1')!.state.visible).not.toBe(false);
    engine.destroy();
  });

  it('a folded lane is no routing obstacle: links between the lanes either side cross its band', async () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('d');
    const { lanes } = pool(diagram);
    await engine.collapseGroup(lanes[1]!.id);
    const ids = (engine as unknown as { routingEngine: { getObstacles(): Array<{ id: string }> } }).routingEngine.getObstacles().map((o) => o.id);
    expect(ids).not.toContain(lanes[1]!.id);
    expect(ids).not.toContain(lanes[1]!.collapsedState!.proxyNodeId);
    expect(ids).toContain('s0');
    engine.destroy();
  });

  it('a saved diagram with a folded lane loads and still expands', () => {
    const diagram = new DiagramModel();
    const { lanes } = pool(diagram);
    new GroupCollapseService(diagram).collapse(lanes[1]!);
    const loaded = DiagramModel.fromJSON(JSON.parse(JSON.stringify(diagram.serialize())));
    const lane = loaded.getGroup(lanes[1]!.id)!;
    new GroupCollapseService(loaded).expand(lane);
    const pool2 = loaded.getGroup(lane.parentGroupId!)!;
    expect(pool2.getOuterBounds().height).toBe(480);
    expect(lane.getOuterBounds().height).toBe(160);
  });

  it("links meet a folded lane's band on the side facing the other step, right across from it", () => {
    const diagram = new DiagramModel();
    const { lanes } = pool(diagram);
    const link = (id: string, a: string, b: string) => {
      const l = new LinkModel(diagram.getNode(a)!.getPortBySide('right')!.id, diagram.getNode(b)!.getPortBySide('left')!.id);
      (l as unknown as { id: string }).id = id;
      diagram.addLink(l);
      return l;
    };
    const into = link('in', 's0', 's1'), out = link('out', 's1', 's2');
    new GroupCollapseService(diagram).collapse(lanes[1]!);
    const proxy = diagram.getNode(lanes[1]!.collapsedState!.proxyNodeId)!;
    const portOf = (id: string | undefined) => proxy.getPort(id!)!;
    const s0 = diagram.getNode('s0')!, s2 = diagram.getNode('s2')!;
    expect(portOf(into.targetPortId).alignment.side).toBe('top');
    expect(portOf(out.sourcePortId).alignment.side).toBe('bottom');
    // across from the other step — a link in 12px to one side, a link out 12px to the other
    expect(into.targetPortId).toBe(`${proxy.id}__top@${s0.position.x + 50 - proxy.position.x - 12}`);
    expect(out.sourcePortId).toBe(`${proxy.id}__bottom@${s2.position.x + 50 - proxy.position.x + 12}`);
    // the other ends turn to face the band, and the links are pinned port to port while folded
    expect(into.sourcePortId).toBe(s0.getPortBySide('bottom')!.id);
    expect(out.targetPortId).toBe(s2.getPortBySide('top')!.id);
    expect(into.getMetadata('connectionPoint')).toBe('port');
    new GroupCollapseService(diagram).expand(lanes[1]!);
    const back = diagram.getLink('in')!;
    expect(diagram.getNodeByPortId(back.targetPortId)!.id).toBe('s1');
    expect(back.sourcePortId).toBe(s0.getPortBySide('right')!.id);
    expect(back.getMetadata('connectionPoint')).toBeUndefined();
    expect(diagram.getLink('out')!.targetPortId).toBe(s2.getPortBySide('left')!.id);
  });

  it('a folded lane takes no drops: a step dragged onto its band goes home', () => {
    const diagram = new DiagramModel();
    const { lanes } = pool(diagram);
    new GroupCollapseService(diagram).collapse(lanes[1]!);
    const s0 = diagram.getNode('s0')!;
    const from = { ...s0.position };
    const band = lanes[1]!.getOuterBounds();
    s0.setPosition(from.x, band.y + band.height / 2 - 20);
    settleLaneDrop(diagram, [{ id: 's0', from }]);
    expect(s0.position).toEqual(expect.objectContaining(from));
  });

  it("a drag of the pool carries a folded lane's band with it", () => {
    const diagram = new DiagramModel();
    const { pool: p, lanes } = pool(diagram);
    new GroupCollapseService(diagram).collapse(lanes[1]!);
    const { nodeIds } = groupDragContents(diagram, p);
    expect(nodeIds).toContain(lanes[1]!.collapsedState!.proxyNodeId);
  });
});
