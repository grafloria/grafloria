// SwimlaneService.spec.ts — Wave-5 Card 6: first-class swimlanes & pools.
//
// Generic banded pools/lanes: band tiling (horizontal + vertical), weighted +
// fixed lane sizing, drop-to-assign via GroupMembershipService (a lane wins the
// innermost hit-test over its pool), lane resize with the pool re-laying out,
// pool resize re-tiling, add/remove lane, lanes as drag constraints, and a
// laneConfig round-trip.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { GroupModel } from '../models/GroupModel';
import { SwimlaneService } from './SwimlaneService';
import { GroupMembershipService } from './GroupMembershipService';

function node(id: string, x: number, y: number): NodeModel {
  return new NodeModel({ id, type: 'default', position: { x, y }, size: { width: 20, height: 20 } });
}

describe('SwimlaneService (Wave-5 Card 6)', () => {
  it('tiles a horizontal pool into equal-height row bands', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });

    expect(lanes.map((l) => l.getOuterBounds())).toEqual([
      { x: 0, y: 0, width: 400, height: 100 },
      { x: 0, y: 100, width: 400, height: 100 },
      { x: 0, y: 200, width: 400, height: 100 },
    ]);
  });

  it('tiles a vertical pool into column bands', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'vertical',
      bounds: { x: 0, y: 0, width: 300, height: 400 },
      lanes: [{ name: 'A' }, { name: 'B' }],
    });
    expect(lanes.map((l) => l.getOuterBounds())).toEqual([
      { x: 0, y: 0, width: 150, height: 400 },
      { x: 150, y: 0, width: 150, height: 400 },
    ]);
  });

  it('reserves a pool header band along the main-axis start', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 200 },
      lanes: [{ name: 'A' }, { name: 'B' }],
      headerSize: 40,
    });
    // header eats 40px off the left; lanes span the remaining width
    expect(lanes[0].getOuterBounds()).toEqual({ x: 40, y: 0, width: 360, height: 100 });
  });

  it('mixes fixed and weighted lanes (fixed pinned, rest split remaining space)', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A', fixedSize: 60 }, { name: 'B' }, { name: 'C' }],
    });
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([60, 120, 120]);
  });

  it('drop-to-assign: a dropped node joins the LANE, not the pool', async () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });

    const n = node('n', 190, 240); // inside lane C band (y 200..300)
    diagram.addNode(n);

    const membership = new GroupMembershipService({ diagram });
    const result = await membership.handleNodeDragEnd('n', { x: 200, y: 250 });

    expect(result.toGroupId).toBe(lanes[2].id);
    expect(lanes[2].members.has('n')).toBe(true);
    expect(pool.members.has('n')).toBe(false); // pool holds lanes, not the node
  });

  it('resizeLane pins a band and the pool re-lays out siblings', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A', fixedSize: 60 }, { name: 'B' }, { name: 'C' }],
    });

    svc.resizeLane(pool, lanes[1].id, 200);
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([60, 200, 40]);
  });

  it('resizePool re-tiles all lanes', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A' }, { name: 'B' }],
    });
    svc.resizePool(pool, { x: 0, y: 0, width: 600, height: 500 });
    expect(lanes.map((l) => l.getOuterBounds())).toEqual([
      { x: 0, y: 0, width: 600, height: 250 },
      { x: 0, y: 250, width: 600, height: 250 },
    ]);
  });

  it('addLane and removeLane re-tile the pool', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A' }, { name: 'B' }],
    });
    // 2 lanes → 150 each
    expect(lanes[0].getOuterBounds().height).toBe(150);

    const added = svc.addLane(pool, { name: 'C' });
    expect(svc.getLanes(pool).length).toBe(3);
    expect(added.getOuterBounds().height).toBe(100); // now 3 → 100 each

    svc.removeLane(pool, added.id);
    expect(svc.getLanes(pool).length).toBe(2);
    expect(diagram.getGroup(added.id)).toBeUndefined();
    expect(lanes[0].getOuterBounds().height).toBe(150); // back to 150
  });

  it('lanes are drag constraints (constrainChildren clamps members to the band)', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'horizontal',
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      lanes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });
    const lane = lanes[1]; // band y 100..200
    expect(lane.constrainChildren).toBe(true);

    const n = node('n', 50, 500); // dropped below the band
    diagram.addNode(n);
    lane.addMember('n', diagram);

    const moved = lane.clampChildToExtent('n', diagram);
    expect(moved).toBe(true);
    const b = n.getGlobalBounds();
    expect(b.top).toBeGreaterThanOrEqual(100);
    expect(b.bottom).toBeLessThanOrEqual(200);
  });

  it('round-trips laneConfig through serialize/fromJSON', () => {
    const diagram = new DiagramModel();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = svc.createPool({
      name: 'Pool',
      orientation: 'vertical',
      bounds: { x: 0, y: 0, width: 300, height: 200 },
      lanes: [{ name: 'A', weight: 2 }, { name: 'B' }],
    });

    const json = diagram.serialize();
    const reloaded = DiagramModel.fromJSON(JSON.parse(JSON.stringify(json)));
    expect(JSON.stringify(reloaded.serialize())).toEqual(JSON.stringify(json));

    const rp = reloaded.getGroup(pool.id)!;
    expect(rp.laneConfig?.role).toBe('pool');
    expect(rp.laneConfig?.orientation).toBe('vertical');
    expect(rp.laneConfig?.laneOrder).toEqual(lanes.map((l) => l.id));
    const rl = reloaded.getGroup(lanes[0].id)!;
    expect(rl.laneConfig).toMatchObject({ role: 'lane', weight: 2 });
  });
});
