/**
 * Where a dragged member may go — `memberConfinement` / `laneAtPoint`.
 *
 * `constrainChildren` was documented as "clamp member drags to the inner
 * extent" and nothing in the drag path ever clamped: on the swimlanes demo a
 * ticket could be dragged straight out of its lane and the pool while it stayed
 * a member of "In progress". The confinement is answered HERE, once, for every
 * host: a LANE confines to its whole pool's lane area (so a member can still
 * move to a sibling lane), any other confining group to its own inner extent.
 */
import { DiagramModel } from '../models/DiagramModel';
import { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { SwimlaneService } from './SwimlaneService';
import { memberConfinement, laneAtPoint, containingGroup, settleLaneDrop } from './confinement';
import { GroupMembershipService } from './GroupMembershipService';

function poolDiagram() {
  const diagram = new DiagramModel();
  const ticket = new NodeModel({ id: 't', type: 'rect', position: { x: 300, y: 200 }, size: { width: 120, height: 50, depth: 0 } });
  diagram.addNode(ticket);
  const svc = new SwimlaneService(diagram);
  const { pool, lanes } = svc.createPool({
    name: 'Delivery', orientation: 'horizontal',
    bounds: { x: 60, y: 60, width: 1000, height: 480 },
    lanes: [{ name: 'Backlog' }, { name: 'In progress', weight: 2 }, { name: 'Done' }],
    headerSize: 40,
  });
  lanes[1]!.addMember('t', diagram);
  return { diagram, pool, lanes, ticket };
}

describe('memberConfinement', () => {
  it('a lane member is confined to the WHOLE pool lane area, not its own band', () => {
    const { diagram, pool, lanes } = poolDiagram();
    const r = memberConfinement(diagram, 't')!;
    expect(r).toBeTruthy();
    const first = lanes[0]!.getInnerBounds(), last = lanes[2]!.getInnerBounds();
    expect(r.y).toBeCloseTo(first.y);
    expect(r.y + r.height).toBeCloseTo(last.y + last.height);
    // inside the pool, right of its header band
    const p = pool.getOuterBounds();
    expect(r.x).toBeGreaterThanOrEqual(p.x + 40);
    expect(r.x + r.width).toBeLessThanOrEqual(p.x + p.width);
  });

  it('a member of a plain confining group is confined to that group’s inner extent', () => {
    const diagram = new DiagramModel();
    diagram.addNode(new NodeModel({ id: 'n', type: 'rect', position: { x: 120, y: 120 }, size: { width: 50, height: 30, depth: 0 } }));
    const g = new GroupModel({ name: 'box' });
    diagram.addGroup(g);
    g.setFrame({ x: 100, y: 100, width: 300, height: 200 });
    g.constrainChildren = true;
    g.addMember('n', diagram);
    expect(memberConfinement(diagram, 'n')).toEqual(g.getInnerBounds());
  });

  it('nothing confines a free node, or a member of a group that does not confine', () => {
    const diagram = new DiagramModel();
    diagram.addNode(new NodeModel({ id: 'free', type: 'rect', position: { x: 0, y: 0 }, size: { width: 10, height: 10, depth: 0 } }));
    diagram.addNode(new NodeModel({ id: 'm', type: 'rect', position: { x: 120, y: 120 }, size: { width: 10, height: 10, depth: 0 } }));
    const g = new GroupModel({ name: 'loose' });
    diagram.addGroup(g);
    g.setFrame({ x: 100, y: 100, width: 300, height: 200 });
    g.addMember('m', diagram);
    expect(memberConfinement(diagram, 'free')).toBeNull();
    expect(memberConfinement(diagram, 'm')).toBeNull();
    expect(containingGroup(diagram, 'm')).toBe(g);
  });
});

describe('laneAtPoint', () => {
  it('answers the lane band a point falls in, and nothing outside the pool', () => {
    const { pool, lanes, diagram } = poolDiagram();
    const done = lanes[2]!.getOuterBounds();
    expect(laneAtPoint(diagram, pool, { x: done.x + 50, y: done.y + done.height / 2 })).toBe(lanes[2]);
    expect(laneAtPoint(diagram, pool, { x: 2000, y: 2000 })).toBeUndefined();
  });
});

describe('dropping a lane member on a SIBLING lane moves it there', () => {
  it('In progress → Done transfers membership; a drop outside the pool is still refused', async () => {
    const { diagram, lanes } = poolDiagram();
    const service = new GroupMembershipService({ diagram });
    const done = lanes[2]!.getOuterBounds();
    const moved = await service.handleNodeDragEnd('t', { x: done.x + 100, y: done.y + done.height / 2 });
    expect(moved.rejected).toBe(false);
    expect(lanes[2]!.members.has('t')).toBe(true);
    expect(lanes[1]!.members.has('t')).toBe(false);

    const out = await service.handleNodeDragEnd('t', { x: 3000, y: 3000 });
    expect(out.rejected).toBe(true);
    expect(lanes[2]!.members.has('t')).toBe(true);
  });
});

describe('settleLaneDrop — where dropped lane members land', () => {
  const add = (diagram: DiagramModel, id: string, x: number, y: number) =>
    diagram.addNode(new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: 120, height: 50, depth: 0 } }));
  const centreY = (r: { y: number; height: number }) => r.y + r.height / 2;

  it('a member dropped across a lane line moves fully inside the lane under its centre', () => {
    const { diagram, lanes, ticket } = poolDiagram();
    const done = lanes[2]!.getInnerBounds();
    ticket.setPosition(300, done.y - 10); // centre inside Done, top edge above it
    settleLaneDrop(diagram, [{ id: 't', from: { x: 300, y: 200 } }]);
    expect(ticket.position.y).toBeGreaterThanOrEqual(done.y - 0.5);
  });

  it('a lane that is full sends the member back where the drag found it', () => {
    const { diagram, lanes, ticket } = poolDiagram();
    add(diagram, 'd', 600, 470);
    lanes[2]!.addMember('d', diagram);
    lanes[2]!.capacity = 1;
    ticket.setPosition(300, centreY(lanes[2]!.getInnerBounds()) - 25);
    settleLaneDrop(diagram, [{ id: 't', from: { x: 300, y: 200 } }]);
    expect(ticket.position).toMatchObject({ x: 300, y: 200 });
  });

  it('members dropped together count against the room in order: the second one of two goes home', () => {
    const { diagram, lanes, ticket } = poolDiagram();
    add(diagram, 'u', 480, 200);
    lanes[1]!.addMember('u', diagram);
    lanes[2]!.capacity = 1;
    const y = centreY(lanes[2]!.getInnerBounds()) - 25;
    ticket.setPosition(300, y);
    diagram.getNode('u')!.setPosition(480, y);
    settleLaneDrop(diagram, [{ id: 't', from: { x: 300, y: 200 } }, { id: 'u', from: { x: 480, y: 200 } }]);
    expect(ticket.position.y).toBeCloseTo(y);
    expect(diagram.getNode('u')!.position).toMatchObject({ x: 480, y: 200 });
  });

  it("a lane whose own rule says no sends the member home too", () => {
    const { diagram, lanes, ticket } = poolDiagram();
    lanes[0]!.memberValidation = () => false;
    ticket.setPosition(300, centreY(lanes[0]!.getInnerBounds()) - 25);
    settleLaneDrop(diagram, [{ id: 't', from: { x: 300, y: 200 } }]);
    expect(ticket.position).toMatchObject({ x: 300, y: 200 });
  });

  it('a node that is not a lane member is left where it was dropped', () => {
    const diagram = new DiagramModel();
    add(diagram, 'free', 900, 900);
    settleLaneDrop(diagram, [{ id: 'free', from: { x: 0, y: 0 } }]);
    expect(diagram.getNode('free')!.position).toMatchObject({ x: 900, y: 900 });
  });
});

describe('GroupMembershipService.planNodesDrop', () => {
  it('several lane members each join the lane under their own centre', () => {
    const { diagram, lanes, ticket } = poolDiagram();
    diagram.addNode(new NodeModel({ id: 'u', type: 'rect', position: { x: 480, y: 200 }, size: { width: 120, height: 50, depth: 0 } }));
    lanes[1]!.addMember('u', diagram);
    const done = lanes[2]!.getInnerBounds(), backlog = lanes[0]!.getInnerBounds();
    ticket.setPosition(300, done.y + 10);
    diagram.getNode('u')!.setPosition(480, backlog.y + 10);
    const plans = new GroupMembershipService({ diagram }).planNodesDrop(['t', 'u']);
    expect(plans.map((p) => [p.nodeId, p.toGroupId, p.changed])).toEqual([
      ['t', lanes[2]!.id, true],
      ['u', lanes[0]!.id, true],
    ]);
  });

  it('several nodes dropped outside lanes keep their groups, as before', () => {
    const diagram = new DiagramModel();
    for (const id of ['a', 'b']) diagram.addNode(new NodeModel({ id, type: 'rect', position: { x: 50, y: 50 }, size: { width: 40, height: 40, depth: 0 } }));
    const g = new GroupModel({ name: 'g' });
    diagram.addGroup(g);
    g.setFrame({ x: 500, y: 500, width: 300, height: 300 });
    diagram.getNode('a')!.setPosition(600, 600);
    expect(new GroupMembershipService({ diagram }).planNodesDrop(['a', 'b'])).toEqual([]);
  });
});
