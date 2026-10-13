// Editing a pool's lanes — and taking it back. Every lane edit was a direct
// model call: add a lane and Ctrl+Z did nothing (measured in a browser on
// 2026-10-13: four lanes after the undo). With a dispatcher the service records
// each edit as ONE undo step; renderers record a gesture the same way, from a
// snapshot taken when it began. Also: reorder a lane, and size a lane the way a
// hand drags its border (the pool grows, the other lanes keep their size).
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { SwimlaneService, PoolEditCommand } from './SwimlaneService';

function node(id: string, x: number, y: number): NodeModel {
  return new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: 100, height: 40, depth: 0 } });
}

/** 3 lanes of 160 in a 1000×480 pool at (60, 60), header 40, one step per lane. */
function setup(svc: SwimlaneService, diagram: DiagramModel) {
  const made = svc.createPool({
    name: 'Orders', orientation: 'horizontal',
    bounds: { x: 60, y: 60, width: 1000, height: 480 },
    lanes: [{ name: 'Customer' }, { name: 'Sales' }, { name: 'Warehouse' }],
    headerSize: 40,
  });
  made.lanes.forEach((lane, i) => {
    const b = lane.getInnerBounds();
    diagram.addNode(node(`s${i}`, b.x + 200, b.y + 60));
    lane.addMember(`s${i}`, diagram);
  });
  return made;
}
const heights = (svc: SwimlaneService, pool: Parameters<SwimlaneService['getLanes']>[0]) => svc.getLanes(pool).map((l) => l.getOuterBounds().height);
const names = (svc: SwimlaneService, pool: Parameters<SwimlaneService['getLanes']>[0]) => svc.getLanes(pool).map((l) => l.name);

describe('lane edits', () => {
  it('moveLane reorders the bands, and each lane takes its steps with it', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = setup(svc, diagram);
    const s0 = { ...diagram.getNode('s0')!.position }, s2 = { ...diagram.getNode('s2')!.position };
    svc.moveLane(pool, lanes[2]!.id, 0);
    expect(names(svc, pool)).toEqual(['Warehouse', 'Customer', 'Sales']);
    expect(lanes[2]!.getOuterBounds().y).toBe(60);
    expect(diagram.getNode('s2')!.position.y).toBe(s2.y - 320);
    expect(diagram.getNode('s0')!.position.y).toBe(s0.y + 160);
  });

  it('setLaneSize sizes one lane like a hand on its border: the pool grows, the others keep their size', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = setup(svc, diagram);
    const s2 = { ...diagram.getNode('s2')!.position };
    svc.setLaneSize(pool, lanes[0]!.id, 240);
    expect(heights(svc, pool)).toEqual([240, 160, 160]);
    expect(pool.getOuterBounds().height).toBe(560);
    expect(diagram.getNode('s2')!.position.y).toBe(s2.y + 80);
    // and it never goes below the smallest band that still shows a step
    svc.setLaneSize(pool, lanes[1]!.id, 5);
    expect(lanes[1]!.getOuterBounds().height).toBeGreaterThanOrEqual(40);
  });

  it('a pool whose lanes are all pinned gives a resize to its LAST lane (no gap, no overflow)', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = setup(svc, diagram);
    svc.setLaneSize(pool, lanes[0]!.id, 160); // pins every lane
    const b = pool.getOuterBounds();
    svc.resizePool(pool, { ...b, height: b.height + 100 });
    expect(heights(svc, pool)).toEqual([160, 160, 260]);
  });

  it('removeLane hands its steps to the lane before it; the last lane cannot be removed', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = setup(svc, diagram);
    svc.removeLane(pool, lanes[1]!.id);
    expect(lanes[0]!.members.has('s1')).toBe(true);
    const band = lanes[0]!.getInnerBounds();
    const s1 = diagram.getNode('s1')!;
    expect(s1.position.y).toBeGreaterThanOrEqual(band.y);
    expect(s1.position.y + s1.size.height).toBeLessThanOrEqual(band.y + band.height);
    svc.removeLane(pool, lanes[2]!.id);
    svc.removeLane(pool, lanes[0]!.id); // the last one stays
    expect(svc.getLanes(pool).map((l) => l.id)).toEqual([lanes[0]!.id]);
  });

  describe('with a dispatcher: one undo step per edit', () => {
    async function engineSetup() {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('d');
      const svc = new SwimlaneService(diagram, { dispatcher: engine.commandManager });
      const made = setup(new SwimlaneService(diagram), diagram);
      return { engine, diagram, svc, ...made };
    }
    const state = (diagram: DiagramModel, svc: SwimlaneService, pool: Parameters<SwimlaneService['getLanes']>[0]) => JSON.stringify({
      pool: pool.getOuterBounds(),
      lanes: svc.getLanes(pool).map((l) => [l.id, l.name, l.getOuterBounds(), [...l.members].sort(), l.laneConfig?.fixedSize ?? null]),
      steps: ['s0', 's1', 's2'].map((id) => diagram.getNode(id)?.position),
    });

    it.each([
      ['addLane', (svc: SwimlaneService, pool: any) => svc.addLane(pool, { name: 'Finance' })],
      ['removeLane', (svc: SwimlaneService, pool: any) => svc.removeLane(pool, svc.getLanes(pool)[1]!.id)],
      ['moveLane', (svc: SwimlaneService, pool: any) => svc.moveLane(pool, svc.getLanes(pool)[2]!.id, 0)],
      ['setLaneSize', (svc: SwimlaneService, pool: any) => svc.setLaneSize(pool, svc.getLanes(pool)[0]!.id, 260)],
      ['resizeLane', (svc: SwimlaneService, pool: any) => svc.resizeLane(pool, svc.getLanes(pool)[0]!.id, 260)],
      ['resizePool', (svc: SwimlaneService, pool: any) => svc.resizePool(pool, { x: 100, y: 100, width: 1200, height: 600 })],
    ])('%s: undo puts everything back, redo does it again', async (_name, edit) => {
      const { engine, diagram, svc, pool } = await engineSetup();
      const before = state(diagram, svc, pool);
      edit(svc, pool);
      await new Promise((r) => setTimeout(r, 0));
      const after = state(diagram, svc, pool);
      expect(after).not.toBe(before);
      await engine.undo();
      expect(state(diagram, svc, pool)).toBe(before);
      await engine.redo();
      expect(state(diagram, svc, pool)).toBe(after);
      expect(engine.commandManager.canUndo()).toBe(true);
      await engine.undo();
      expect(engine.commandManager.canUndo()).toBe(false);
      engine.destroy();
    });

    it('addLane still hands back the new lane at once', async () => {
      const { engine, svc, pool } = await engineSetup();
      const lane = svc.addLane(pool, { name: 'Finance' });
      expect(lane.name).toBe('Finance');
      expect(svc.getLanes(pool)).toContain(lane);
      engine.destroy();
    });

    it('a gesture records itself the same way: PoolEditCommand from a snapshot taken when it began', async () => {
      const { engine, diagram, pool, lanes } = await engineSetup();
      const live = new SwimlaneService(diagram); // a gesture edits live, without history
      const before = live.snapshot(pool);
      live.setLaneSize(pool, lanes[0]!.id, 200);
      live.setLaneSize(pool, lanes[0]!.id, 230);
      await engine.commandManager.execute(new PoolEditCommand('Resize lane', before, live.snapshot(pool)));
      expect(lanes[0]!.getOuterBounds().height).toBe(230);
      await engine.undo();
      expect(lanes[0]!.getOuterBounds().height).toBe(160);
      expect(engine.commandManager.canUndo()).toBe(false);
      engine.destroy();
    });
  });
});
