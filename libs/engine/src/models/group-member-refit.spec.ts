// A member that joins a group ends up inside its frame — on EVERY path.
//
// AddToGroupCommand already grew the frame, but `GroupModel.addMember()` itself
// changed the membership only: a host (or a kit) calling it directly left a
// 340×114 frame around a node far outside it, dragged along from off-canvas.
// The refit now lives in the model, so the command, the drop, `setGroups()` and
// a direct call all behave the same: the frame grows (never shrinks) to take the
// member in, enclosing frames grow with it. Frames something else owns are left
// alone, and so is a group that has no frame yet (whoever fits it decides it).

import { DiagramModel } from './DiagramModel';
import { GroupModel } from './GroupModel';
import { NodeModel } from './NodeModel';

function node(diagram: DiagramModel, id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: 100, height: 50 } });
  diagram.addNode(n);
  return n;
}

function contains(g: GroupModel, n: NodeModel): boolean {
  const r = g.getOuterBounds();
  return (
    n.position.x >= r.x &&
    n.position.y >= r.y &&
    n.position.x + n.size.width <= r.x + r.width &&
    n.position.y + n.size.height <= r.y + r.height
  );
}

describe('GroupModel.addMember refits the frame', () => {
  let diagram: DiagramModel;
  let team: GroupModel;

  beforeEach(() => {
    diagram = new DiagramModel();
    node(diagram, 'a', 0, 0);
    node(diagram, 'b', 200, 0);
    team = new GroupModel({ id: 'team', name: 'Team' });
    diagram.addGroup(team);
    team.addMember('a', diagram);
    team.addMember('b', diagram);
    team.fitToContents(diagram, { mode: 'exact' });
  });

  it('a direct addMember of a node outside the frame grows the frame around it', () => {
    const c = node(diagram, 'c', 500, 300);
    const before = team.getOuterBounds();
    team.addMember('c', diagram);
    const after = team.getOuterBounds();
    expect(contains(team, c)).toBe(true);
    // Grow-only: the old frame is still inside the new one.
    expect(after.x).toBeLessThanOrEqual(before.x);
    expect(after.y).toBeLessThanOrEqual(before.y);
    expect(after.x + after.width).toBeGreaterThanOrEqual(before.x + before.width);
    expect(after.y + after.height).toBeGreaterThanOrEqual(before.y + before.height);
  });

  it('works without passing the diagram (the group knows its diagram)', () => {
    const c = node(diagram, 'c', 500, 300);
    team.addMember('c');
    expect(contains(team, c)).toBe(true);
  });

  it('a node already inside the frame changes nothing (no bounds write)', () => {
    team.setFrame({ x: -100, y: -100, width: 800, height: 600 });
    node(diagram, 'c', 100, 100);
    const writes: string[] = [];
    team.on('bounds:changed', () => writes.push('bounds'));
    team.addMember('c', diagram);
    expect(writes).toEqual([]);
    expect(team.getOuterBounds()).toEqual({ x: -100, y: -100, width: 800, height: 600 });
  });

  it('a member inside an authored frame, even in its padding, leaves the frame exactly as drawn', () => {
    team.setFrame({ x: -10, y: -10, width: 700, height: 400 });
    node(diagram, 'c', 585, 335); // inside, 5 px from the bottom-right corner
    team.addMember('c', diagram);
    expect(team.getOuterBounds()).toEqual({ x: -10, y: -10, width: 700, height: 400 });
  });

  it('an explicit (authored) frame is only ever grown, never refitted smaller', () => {
    team.setFrame({ x: -300, y: -300, width: 2700, height: 1900 });
    const c = node(diagram, 'c', 2500, 0);
    team.addMember('c', diagram);
    const after = team.getOuterBounds();
    expect(after.x).toBe(-300);
    expect(after.y).toBe(-300);
    expect(after.height).toBe(1900);
    expect(contains(team, c)).toBe(true);
  });

  it('enclosing groups grow with it', () => {
    const outer = new GroupModel({ id: 'outer', name: 'Outer' });
    diagram.addGroup(outer);
    outer.addMember('team', diagram);
    outer.fitToContents(diagram, { mode: 'exact' });
    const c = node(diagram, 'c', 900, 700);
    team.addMember('c', diagram);
    expect(contains(team, c)).toBe(true);
    expect(contains(outer, c)).toBe(true);
  });

  it('a group with no frame yet is left frameless', () => {
    const loose = new GroupModel({ id: 'loose', name: 'Loose' });
    diagram.addGroup(loose);
    node(diagram, 'c', 900, 700);
    loose.addMember('c', diagram);
    expect(loose.size).toBeUndefined();
  });

  it('does not touch a layout container, a lane, a confining group, a frameless board or a collapsed group', () => {
    const board = new GroupModel({ id: 'board', name: 'Board' });
    board.setMetadata('frameChrome', 'none');
    const lane = new GroupModel({ id: 'lane', name: 'Lane' });
    lane.laneConfig = { role: 'lane' } as GroupModel['laneConfig'];
    const flex = new GroupModel({ id: 'flex', name: 'Flex' });
    flex.setLayout('flexbox', { direction: 'row', gap: 0 } as never);
    const fence = new GroupModel({ id: 'fence', name: 'Fence' });
    fence.constrainChildren = true;
    const folded = new GroupModel({ id: 'folded', name: 'Folded' });
    for (const g of [board, lane, flex, fence, folded]) {
      diagram.addGroup(g);
      g.setFrame({ x: 0, y: 0, width: 200, height: 100 });
    }
    folded.isCollapsed = true;
    for (const id of ['p', 'q', 'r', 's', 't']) node(diagram, id, 900, 900);

    board.addMember('p', diagram);
    lane.addMember('q', diagram);
    flex.addMember('r', diagram);
    fence.addMember('s', diagram);
    folded.addMember('t', diagram);

    expect(board.getOuterBounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(lane.getOuterBounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(flex.getOuterBounds().width).toBe(200);
    expect(fence.getOuterBounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(folded.size).toEqual({ width: 200, height: 100, depth: 0 });
  });

  it('a remote / replayed membership (a system write) does not refit: the origin sends its own frame', () => {
    const before = team.getOuterBounds();
    node(diagram, 'c', 500, 300);
    diagram.runSystemWrite(() => team.addMember('c', diagram));
    expect(team.getOuterBounds()).toEqual(before);
  });
});
