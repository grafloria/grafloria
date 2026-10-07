// A node that joins a group must end up inside the group's frame.
//
// Adding a member used to change the membership only: a node far from the
// frame joined it, stayed outside, and was dragged along with the frame from
// off-canvas. The frame now grows to take the member in (never shrinks), the
// enclosing groups grow with it, and undo puts every frame back as it was.

import { DiagramModel } from '../../models/DiagramModel';
import { GroupModel } from '../../models/GroupModel';
import { NodeModel } from '../../models/NodeModel';
import { CommandManager } from '../CommandManager';
import { EventBus } from '../../events/EventBus';
import { AddToGroupCommand } from './AddToGroupCommand';

function node(diagram: DiagramModel, id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: 130, height: 56 } });
  diagram.addNode(n);
  return n;
}

function frameOf(g: GroupModel) {
  return {
    position: { ...g.position },
    size: g.size ? { ...g.size } : undefined,
    bounds: g.bounds ? { ...g.bounds } : undefined,
  };
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

describe('AddToGroupCommand refits the frame', () => {
  let diagram: DiagramModel;
  let manager: CommandManager;
  let billing: GroupModel;

  beforeEach(() => {
    diagram = new DiagramModel();
    manager = new CommandManager({ diagram, eventBus: new EventBus() });
    node(diagram, 'paid', 150, 150);
    node(diagram, 'inv', 760, 420);
    billing = new GroupModel({ id: 'billing', name: 'Billing' });
    diagram.addGroup(billing);
    billing.addMember('paid', diagram);
    billing.setFrame({ x: 110, y: 100, width: 320, height: 270 });
  });

  it('grows the frame to take in a node that joins from outside it', async () => {
    const inv = diagram.getNode('inv')!;
    expect(contains(billing, inv)).toBe(false);

    await manager.execute(new AddToGroupCommand('billing', 'inv'));

    expect(billing.members.has('inv')).toBe(true);
    expect(contains(billing, inv)).toBe(true);
    // Padding is kept on the far side…
    const r = billing.getOuterBounds();
    const pad = billing.getPadding();
    expect(r.x + r.width).toBe(760 + 130 + pad.right);
    expect(r.y + r.height).toBe(420 + 56 + pad.bottom);
    // …and the authored frame is never shrunk: its top-left corner stays.
    expect(r.x).toBe(110);
    expect(r.y).toBe(100);
  });

  it('undo restores the old frame exactly, and redo grows it again', async () => {
    const before = frameOf(billing);
    await manager.execute(new AddToGroupCommand('billing', 'inv'));
    const grown = frameOf(billing);
    expect(grown).not.toEqual(before);

    await manager.undo();
    expect(billing.members.has('inv')).toBe(false);
    expect(frameOf(billing)).toEqual(before);

    await manager.redo();
    expect(billing.members.has('inv')).toBe(true);
    expect(frameOf(billing)).toEqual(grown);
  });

  it('leaves the frame alone when the node is already inside it', async () => {
    node(diagram, 'inside', 200, 260);
    const before = frameOf(billing);
    const version = billing.version;
    await manager.execute(new AddToGroupCommand('billing', 'inside'));
    expect(frameOf(billing)).toEqual(before);
    // No frame write at all: membership is the only change recorded.
    expect(billing.version - version).toBe(1);
  });

  it('gives a group with no frame yet a frame around its first member', async () => {
    const retry = new GroupModel({ id: 'retry', name: 'Retry handler' });
    retry.padding = 12;
    diagram.addGroup(retry);
    expect(retry.size).toBeUndefined();

    await manager.execute(new AddToGroupCommand('retry', 'inv'));
    expect(retry.getOuterBounds()).toEqual({
      x: 760 - 12,
      y: 420 - 12 - retry.headerHeight,
      width: 130 + 24,
      height: 56 + 24 + retry.headerHeight,
    });

    await manager.undo();
    expect(retry.size).toBeUndefined();
    expect(retry.bounds).toBeUndefined();
  });

  it('grows the enclosing groups too, and undo restores them all', async () => {
    const outer = new GroupModel({ id: 'outer', name: 'Outer' });
    diagram.addGroup(outer);
    outer.addMember('billing', diagram);
    outer.setFrame({ x: 90, y: 60, width: 360, height: 330 });
    const outerBefore = frameOf(outer);
    const billingBefore = frameOf(billing);

    await manager.execute(new AddToGroupCommand('billing', 'inv'));
    const b = billing.getOuterBounds();
    const o = outer.getOuterBounds();
    expect(o.x + o.width).toBeGreaterThanOrEqual(b.x + b.width);
    expect(o.y + o.height).toBeGreaterThanOrEqual(b.y + b.height);

    await manager.undo();
    expect(frameOf(billing)).toEqual(billingBefore);
    expect(frameOf(outer)).toEqual(outerBefore);
  });

  it('does not touch a layout container, a lane, a confining group or a group drawn without a frame', async () => {
    const board = new GroupModel({ id: 'board', name: 'Board' });
    board.setMetadata('frameChrome', 'none');
    const lane = new GroupModel({ id: 'lane', name: 'Lane' });
    lane.laneConfig = { role: 'lane' } as GroupModel['laneConfig'];
    const flex = new GroupModel({ id: 'flex', name: 'Flex' });
    flex.setLayout('flexbox', { direction: 'row', gap: 0 } as never);
    const fence = new GroupModel({ id: 'fence', name: 'Fence' });
    fence.constrainChildren = true;
    for (const g of [board, lane, flex, fence]) {
      diagram.addGroup(g);
      g.setFrame({ x: 0, y: 0, width: 200, height: 100 });
    }
    node(diagram, 'a', 900, 900);
    node(diagram, 'b', 900, 900);
    node(diagram, 'c', 900, 900);
    node(diagram, 'd', 900, 900);

    await manager.execute(new AddToGroupCommand('board', 'a'));
    await manager.execute(new AddToGroupCommand('lane', 'b'));
    await manager.execute(new AddToGroupCommand('flex', 'c'));
    await manager.execute(new AddToGroupCommand('fence', 'd'));

    expect(board.getOuterBounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(lane.getOuterBounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(flex.getOuterBounds().width).toBe(200);
    expect(fence.getOuterBounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});
