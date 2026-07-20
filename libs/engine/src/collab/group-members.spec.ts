// Wave 9 — group membership over the op log.
//
// ---------------------------------------------------------------------------
// THE BUG THIS FILE EXISTS TO KEEP FIXED
// ---------------------------------------------------------------------------
//
// `GroupModel.members` is a `Set<string>`, and until this suite existed NOT ONE TEST IN
// THE ENTIRE COLLAB SUITE ever added a member to a group. 196 tests, a 200-trial
// convergence fuzz, a byte-identical replay oracle — and the most ordinary edit a group
// has was never once driven through a second peer. It was broken the whole time, in two
// different ways, and both were invisible to the author:
//
//   1. `addMember('node-1')` emitted `set(group, members, "node-1")` — the funnel reports
//      the member that MOVED, not the value the register now holds, and capture shipped
//      it verbatim. The receiving peer had no `setMembers()` mutator, so the generic
//      write assigned the RAW STRING over its Set. serialize() then did
//      `Array.from('node-1')` and produced SIX PHANTOM MEMBERS — ['n','o','d','e','-','1'] —
//      each one a node id that exists nowhere.
//
//   2. `removeMember()` travelled as `null`. The peer's `members` became null, and
//      `Array.from(null)` THREW: the receiving peer could no longer serialize the
//      document AT ALL. Save, autosave and every subsequent op died — on the peer that
//      had made no edit.
//
// Neither reproduces in one process: the author's own Set is always fine. That is the
// whole shape of the defect, and it is why every assertion below runs the ops through a
// SECOND REPLICA and demands the peer's bytes, not the author's.
//
// A third bug fell out of the same investigation: re-parenting a nested group mutated the
// OLD parent's `members` Set without a trackChange, so that detach reached no peer and
// the two documents disagreed about the nesting tree forever. See linkChildGroup/setParent.

import { DiagramModel } from '../models/DiagramModel';
import { GroupModel } from '../models/GroupModel';
import { replay } from './op-log';
import { bytes, expectConverged, node, peer } from './test-helpers';
import type { Op } from './op';

/** A real wire hop: ops must survive JSON, which is where a Set would quietly die. */
function overTheWire(ops: readonly Op[]): Op[] {
  return JSON.parse(JSON.stringify(ops)) as Op[];
}

/**
 * Alice + Bob, both holding the same group with the same three nodes.
 *
 * Bob is seeded BY SHIPPING ALICE'S OPS, never by building the same entities a
 * second time. Two separately-constructed peers disagree about every `uuid` (the
 * generator is sequential), which would make expectConverged fail on an artifact
 * of the test rather than on anything the engine did — and, worse, would make a
 * REAL divergence indistinguishable from that noise.
 */
function twoPeers(): {
  wire: Op[];
  bobWire: Op[];
  alice: ReturnType<typeof peer>;
  bob: ReturnType<typeof peer>;
  group: GroupModel;
} {
  const wire: Op[] = [];
  const bobWire: Op[] = [];
  const alice = peer('alice', undefined, wire);
  const bob = peer('bob', alice.diagram, bobWire);

  alice.diagram.addNode(node('n1', 0, 0));
  alice.diagram.addNode(node('n2', 200, 0));
  alice.diagram.addNode(node('n3', 400, 0));
  const group = new GroupModel({ id: 'g1', name: 'Cluster' });
  alice.diagram.addGroup(group);

  bob.receive(overTheWire(wire));
  wire.length = 0;
  bobWire.length = 0;
  return { wire, bobWire, alice, bob, group };
}

describe('group membership over collab', () => {
  it('an added member arrives as a MEMBER, not as six characters of one', () => {
    const { wire, alice, bob, group } = twoPeers();

    group.addMember('n1');
    bob.receive(overTheWire(wire));

    const peerGroup = bob.diagram.getGroup('g1')!;
    // The register value is the COLLECTION, not the delta the funnel reported.
    expect(wire).toHaveLength(1);
    expect(wire[0]).toMatchObject({ path: 'members', value: ['n1'] });

    // The Set is still a Set. Before the fix this was the string 'n1'.
    expect(peerGroup.members).toBeInstanceOf(Set);
    expect([...peerGroup.members]).toEqual(['n1']);
    // And the character split it produced is gone. This is the assertion that fails
    // loudest without the fix: ['n','1'] instead of ['n1'].
    expect(peerGroup.serialize().members).toEqual(['n1']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('a removed member does not leave the peer unable to serialize at all', () => {
    const { wire, alice, bob, group } = twoPeers();
    group.addMember('n1');
    group.addMember('n2');
    bob.receive(overTheWire(wire));
    wire.length = 0;

    group.removeMember('n1');
    bob.receive(overTheWire(wire));

    // Before the fix `members` was null here and this threw
    // "object null is not iterable".
    expect(() => bob.diagram.serialize()).not.toThrow();
    expect(bob.diagram.getGroup('g1')!.members).toBeInstanceOf(Set);
    expect([...bob.diagram.getGroup('g1')!.members]).toEqual(['n2']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('emptying a group travels as [] and converges', () => {
    const { wire, alice, bob, group } = twoPeers();
    group.addMember('n1');
    bob.receive(overTheWire(wire));
    wire.length = 0;

    group.removeMember('n1');
    expect(wire[0]).toMatchObject({ path: 'members', value: [] });
    bob.receive(overTheWire(wire));

    expect([...bob.diagram.getGroup('g1')!.members]).toEqual([]);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('membership ORDER is part of the document and survives the hop', () => {
    const { wire, alice, bob, group } = twoPeers();

    // Deliberately not insertion-sorted: order is Array.from(Set) = insertion order, and
    // it lands in serialize(), so the byte oracle can see it.
    group.addMember('n3');
    group.addMember('n1');
    group.addMember('n2');
    bob.receive(overTheWire(wire));

    expect(bob.diagram.getGroup('g1')!.serialize().members).toEqual(['n3', 'n1', 'n2']);
    expect(bytes(bob.diagram)).toEqual(bytes(alice.diagram));
  });

  it('a duplicate delivery changes nothing (the idempotence guard fires)', () => {
    const { wire, bob, group } = twoPeers();
    group.addMember('n1');

    const ops = overTheWire(wire);
    bob.receive(ops);
    const afterFirst = bytes(bob.diagram);
    const versionAfterFirst = bob.diagram.getGroup('g1')!.version;

    // Same ops again, and again with a fresh log identity stripped away — the register
    // read must compare like with like (array vs array) or every redelivery rebuilds the
    // collection and bumps `version`, which the byte oracle then catches.
    bob.receive(ops);
    expect(bytes(bob.diagram)).toEqual(afterFirst);
    expect(bob.diagram.getGroup('g1')!.version).toBe(versionAfterFirst);
  });

  it('replaying a membership session into an empty diagram is byte-identical', () => {
    // The load-bearing oracle of the whole wave, applied to the register that never had it.
    const wire: Op[] = [];
    const alice = peer('alice', undefined, wire);
    alice.diagram.addNode(node('n1', 0, 0));
    alice.diagram.addNode(node('n2', 200, 0));
    const g = new GroupModel({ id: 'g1', name: 'Cluster' });
    alice.diagram.addGroup(g);
    g.addMember('n1');
    g.addMember('n2');
    g.removeMember('n1');
    g.addMember('n1');

    const fresh = new DiagramModel(alice.diagram.name, {
      id: alice.diagram.id,
      uuid: alice.diagram.uuid,
    });
    replay(fresh, overTheWire(wire));

    expect(bytes(fresh)).toEqual(bytes(alice.diagram));
  });

  it('undo of a membership change restores the exact prior collection, in order', () => {
    const { wire, alice, bob, group } = twoPeers();
    group.addMember('n3');
    group.addMember('n1');
    bob.receive(overTheWire(wire));
    wire.length = 0;

    group.addMember('n2');
    bob.receive(overTheWire(wire));
    wire.length = 0;

    alice.undo();
    bob.receive(overTheWire(wire));

    // Order matters: a `before` reconstructed by re-adding the removed id would have put
    // n3 back at the END. The shadow remembers where it actually was.
    expect(alice.diagram.getGroup('g1')!.serialize().members).toEqual(['n3', 'n1']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('re-parenting a nested group detaches it on the PEER too', () => {
    const wire: Op[] = [];
    const alice = peer('alice', undefined, wire);
    const bob = peer('bob', alice.diagram);

    const oldParent = new GroupModel({ id: 'g0', name: 'Old' });
    const newParent = new GroupModel({ id: 'g1', name: 'New' });
    const kid = new GroupModel({ id: 'kid', name: 'Kid' });
    alice.diagram.addGroup(oldParent);
    alice.diagram.addGroup(newParent);
    alice.diagram.addGroup(kid);
    oldParent.addMember('kid');
    bob.receive(overTheWire(wire));
    wire.length = 0;

    newParent.addMember('kid');
    bob.receive(overTheWire(wire));

    // Without the funnel fix in linkChildGroup this detach emitted NO op at all, and
    // bob's g0 kept `kid` forever — two documents, same log, no error anywhere.
    expect([...bob.diagram.getGroup('g0')!.members]).toEqual([]);
    expect([...bob.diagram.getGroup('g1')!.members]).toEqual(['kid']);
    expect(bob.diagram.getGroup('kid')!.parentGroupId).toBe('g1');
    expectConverged(alice.diagram, bob.diagram);
  });

  it('setParent keeps both parents’ collections on the wire', () => {
    const wire: Op[] = [];
    const alice = peer('alice', undefined, wire);
    const bob = peer('bob', alice.diagram);

    alice.diagram.addGroup(new GroupModel({ id: 'g0', name: 'Old' }));
    alice.diagram.addGroup(new GroupModel({ id: 'g1', name: 'New' }));
    const kid = new GroupModel({ id: 'kid', name: 'Kid' });
    alice.diagram.addGroup(kid);
    kid.setParent('g0');
    bob.receive(overTheWire(wire));
    wire.length = 0;

    kid.setParent('g1');
    bob.receive(overTheWire(wire));

    expect([...bob.diagram.getGroup('g0')!.members]).toEqual([]);
    expect([...bob.diagram.getGroup('g1')!.members]).toEqual(['kid']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('concurrent membership edits CONVERGE (last-writer-wins on the collection)', () => {
    // Honest about the semantics rather than asserting a merge this design does not do:
    // `members` is ONE register, so two concurrent adds race it and the newer stamp wins
    // WHOLESALE. Both peers agree — which is the contract — but the losing add is gone.
    // See the note in the suite header; per-member registers (the `ports.<id>` treatment)
    // are what would make this add-wins.
    const { wire, bobWire, alice, bob, group } = twoPeers();

    // Neither has seen the other's edit when it is made — that is what makes
    // them concurrent, and both carry the same clock, so the actor tiebreak
    // decides deterministically.
    group.addMember('n1');
    bob.diagram.getGroup('g1')!.addMember('n2');

    bob.receive(overTheWire(wire));
    alice.receive(overTheWire(bobWire));

    // Whatever they settle on, they settle on the SAME thing, and it is a real Set of
    // real member ids — not a string, not null, not a character split.
    expect(alice.diagram.getGroup('g1')!.members).toBeInstanceOf(Set);
    expect(bob.diagram.getGroup('g1')!.members).toBeInstanceOf(Set);
    for (const m of alice.diagram.getGroup('g1')!.members) {
      expect(['n1', 'n2']).toContain(m);
    }
    expectConverged(alice.diagram, bob.diagram);
  });

  describe('hostile / legacy traffic', () => {
    // Logs persisted BEFORE the fix carry the broken shapes. A fixed peer must refuse
    // them, not corrupt itself replaying its own history.
    const legacy = (value: unknown): Op =>
      ({
        op: 'set',
        target: 'group',
        id: 'g1',
        path: 'members',
        value,
        clock: 99,
        actor: 'ancient',
      }) as Op;

    it('a bare member id (the pre-fix add) is refused, not assigned', () => {
      const { bob, group, wire } = twoPeers();
      group.addMember('n1');
      bob.receive(overTheWire(wire));

      bob.receive([legacy('n1')]);
      const g = bob.diagram.getGroup('g1')!;
      expect(g.members).toBeInstanceOf(Set);
      expect([...g.members]).toEqual(['n1']);
      expect(() => bob.diagram.serialize()).not.toThrow();
    });

    it('a bare null (the pre-fix remove) is refused, not assigned', () => {
      const { bob, group, wire } = twoPeers();
      group.addMember('n1');
      bob.receive(overTheWire(wire));

      bob.receive([legacy(null)]);
      expect(bob.diagram.getGroup('g1')!.members).toBeInstanceOf(Set);
      expect(() => bob.diagram.serialize()).not.toThrow();
    });

    it('junk entries inside the collection are dropped, not stored', () => {
      const { bob } = twoPeers();
      bob.receive([legacy(['n1', 42, null, { id: 'n2' }, 'n3'])]);
      expect([...bob.diagram.getGroup('g1')!.members]).toEqual(['n1', 'n3']);
      expect(() => bob.diagram.serialize()).not.toThrow();
    });
  });
});
