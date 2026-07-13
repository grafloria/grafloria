// SemanticMembershipService.spec.ts — Wave-5 Card 7: rule-driven membership +
// lane WIP limits.
//
// Covers: the serializable declarative matcher (leaf ops + all/any/not),
// reactive auto add/remove on data change (subscribe, not poll), coexistence
// with manual membership, capacity gating of auto-add, and WIP-limit drop
// rejection + warning state through GroupModel/GroupMembershipService.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { GroupModel } from '../models/GroupModel';
import { SemanticMembershipService, matchesRule } from './SemanticMembershipService';
import { GroupMembershipService } from './GroupMembershipService';

function node(id: string, data: Record<string, unknown> = {}): NodeModel {
  const n = new NodeModel({ id, type: 'default', position: { x: 0, y: 0 }, size: { width: 20, height: 20 } });
  for (const [k, v] of Object.entries(data)) n.setData(k, v);
  return n;
}

describe('matchesRule (declarative matcher)', () => {
  const n = node('n', { status: 'done', priority: 3, owner: 'amy' });

  it('evaluates leaf operators', () => {
    expect(matchesRule({ field: 'status', op: 'eq', value: 'done' }, n)).toBe(true);
    expect(matchesRule({ field: 'status', op: 'ne', value: 'todo' }, n)).toBe(true);
    expect(matchesRule({ field: 'priority', op: 'gte', value: 3 }, n)).toBe(true);
    expect(matchesRule({ field: 'priority', op: 'lt', value: 3 }, n)).toBe(false);
    expect(matchesRule({ field: 'status', op: 'in', value: ['done', 'wip'] }, n)).toBe(true);
    expect(matchesRule({ field: 'status', op: 'nin', value: ['todo'] }, n)).toBe(true);
    expect(matchesRule({ field: 'owner', op: 'exists' }, n)).toBe(true);
    expect(matchesRule({ field: 'missing', op: 'exists' }, n)).toBe(false);
    expect(matchesRule({ field: 'owner', op: 'matches', value: '^a' }, n)).toBe(true);
  });

  it('composes with all / any / not', () => {
    expect(
      matchesRule(
        { all: [{ field: 'status', op: 'eq', value: 'done' }, { field: 'priority', op: 'gte', value: 2 }] },
        n
      )
    ).toBe(true);
    expect(
      matchesRule({ any: [{ field: 'status', op: 'eq', value: 'x' }, { field: 'owner', op: 'eq', value: 'amy' }] }, n)
    ).toBe(true);
    expect(matchesRule({ not: { field: 'status', op: 'eq', value: 'todo' } }, n)).toBe(true);
  });
});

describe('SemanticMembershipService (Wave-5 Card 7)', () => {
  it('auto-adds matching nodes on register (initial sweep)', () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'done', name: 'Done' });
    g.membershipRule = { field: 'status', op: 'eq', value: 'done' };
    diagram.addGroup(g);
    diagram.addNode(node('a', { status: 'done' }));
    diagram.addNode(node('b', { status: 'todo' }));

    new SemanticMembershipService(diagram).register(g);

    expect(g.members.has('a')).toBe(true);
    expect(g.members.has('b')).toBe(false);
  });

  it('reacts to data changes: auto-add when it starts matching, auto-remove when it stops', () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'done', name: 'Done' });
    g.membershipRule = { field: 'status', op: 'eq', value: 'done' };
    diagram.addGroup(g);
    const a = node('a', { status: 'todo' });
    diagram.addNode(a);

    new SemanticMembershipService(diagram).register(g);
    expect(g.members.has('a')).toBe(false);

    a.setData('status', 'done'); // subscribe-driven, no manual poll
    expect(g.members.has('a')).toBe(true);

    a.setData('status', 'todo');
    expect(g.members.has('a')).toBe(false);
  });

  it('auto-adds a node created AFTER registration', () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'done', name: 'Done' });
    g.membershipRule = { field: 'status', op: 'eq', value: 'done' };
    diagram.addGroup(g);
    new SemanticMembershipService(diagram).register(g);

    diagram.addNode(node('late', { status: 'done' }));
    expect(g.members.has('late')).toBe(true);
  });

  it('coexists with manual membership: never auto-removes a manual member', () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'done', name: 'Done' });
    g.membershipRule = { field: 'status', op: 'eq', value: 'done' };
    diagram.addGroup(g);
    const m = node('m', { status: 'todo' });
    diagram.addNode(m);
    g.addMember('m', diagram); // manual — never matched the rule

    new SemanticMembershipService(diagram).register(g);
    // still a member even though it doesn't match, and a data change won't evict it
    expect(g.members.has('m')).toBe(true);
    m.setData('other', 1);
    expect(g.members.has('m')).toBe(true);
  });

  it('does not auto-add past a capacity/WIP limit', () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'wip', name: 'WIP' });
    g.membershipRule = { field: 'status', op: 'eq', value: 'active' };
    g.capacity = 1;
    diagram.addGroup(g);
    diagram.addNode(node('a', { status: 'active' }));
    diagram.addNode(node('b', { status: 'active' }));

    new SemanticMembershipService(diagram).register(g);
    expect(g.members.size).toBe(1); // capacity gated the second auto-add
    expect(g.isOverCapacity()).toBe(true); // full → warning state
  });
});

describe('WIP limit drop rejection + warning state (Wave-5 Card 7)', () => {
  it('reports a warning state at/over capacity', () => {
    const g = new GroupModel({ id: 'g', name: 'G' });
    g.capacity = 2;
    expect(g.getWipState()).toEqual({ count: 0, capacity: 2, state: 'under' });
    const d = new DiagramModel();
    d.addGroup(g);
    d.addNode(node('a'));
    d.addNode(node('b'));
    g.addMember('a', d);
    g.addMember('b', d);
    expect(g.getWipState().state).toBe('full');
    expect(g.isOverCapacity()).toBe(true);
  });

  it('rejects a drop that would exceed a lane WIP limit', async () => {
    const diagram = new DiagramModel();
    const lane = new GroupModel({ id: 'lane', name: 'Lane' });
    lane.capacity = 1;
    lane.setFrame({ x: 0, y: 0, width: 200, height: 200 });
    diagram.addGroup(lane);

    const a = node('a');
    const b = node('b');
    [a, b].forEach((n) => diagram.addNode(n));
    lane.addMember('a', diagram); // lane now full

    const membership = new GroupMembershipService({ diagram });
    const result = await membership.handleNodeDragEnd('b', { x: 100, y: 100 });

    expect(result.rejected).toBe(true);
    expect(lane.members.has('b')).toBe(false);
  });

  it('round-trips membershipRule and capacity through serialize/fromJSON', () => {
    const g = new GroupModel({ id: 'g', name: 'G' });
    g.membershipRule = { all: [{ field: 'status', op: 'in', value: ['a', 'b'] }, { not: { field: 'x', op: 'exists' } }] };
    g.capacity = 3;

    const restored = GroupModel.fromJSON(g.serialize());
    expect(restored.membershipRule).toEqual(g.membershipRule);
    expect(restored.capacity).toBe(3);
  });
});
