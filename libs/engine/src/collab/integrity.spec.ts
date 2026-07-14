// Wave 9 — Card 4: REFERENTIAL INTEGRITY.
//
// ---------------------------------------------------------------------------
// THE DECISION CARD 0 LEFT OPEN, AND WHY THE LITERATURE'S ANSWER IS THE WRONG ONE
// ---------------------------------------------------------------------------
//
// Card 0 left presence as an LWW register and flagged the question: should a concurrent
// ADD survive a REMOVE that never saw it (an observed-remove set), or should remove win?
// It named the motivating scenario: DELETE A NODE WHILE A COLLEAGUE ATTACHES A LINK TO IT.
//
// Work that scenario through and the framing collapses. `remove node N` and `add link L`
// are writes to DIFFERENT REGISTERS. They do not race. There is no add/remove conflict to
// resolve — both ops apply, on every peer, under LWW and under an OR-set alike. The node
// goes; the link stays; the link now points at nothing.
//
//     AN OR-SET DOES NOT FIX THE DANGLING LINK. It is an answer to a different question.
//
// The actual failure is a REFERENTIAL INTEGRITY violation ACROSS registers, and the
// add/remove semantics of any one register are irrelevant to it. So we keep LWW presence —
// the simple thing is the correct thing here — and we fix the real bug.
//
// ---------------------------------------------------------------------------
// WHAT THE USER SHOULD SEE (the argument, from the users, not from the papers)
// ---------------------------------------------------------------------------
//
// Two people. Bob selects a node and presses Delete. Alice, at the same moment, drags a
// connection onto it. Three candidate outcomes:
//
//   (a) THE NODE COMES BACK, because Alice's link "observed" it. Bob watches the node he
//       just deleted reappear on his screen, seconds later, for no reason he can see. A
//       delete that spontaneously undoes itself is a ghost, and it is the single most
//       alarming thing a diagram editor can do. Nobody has ever wanted this.
//
//   (b) THE LINK SURVIVES, pointing at a node that no longer exists. This is what the
//       engine does TODAY. It is convergent — every peer agrees on the same broken
//       document — which is exactly what makes it dangerous: no error, no conflict, just a
//       diagram that is quietly invalid, and a renderer resolving an endpoint to undefined.
//
//   (c) THE LINK GOES WITH THE NODE. Bob gets what he asked for: the node and its edges
//       are gone. Alice loses a link she drew — to an object that no longer exists. There
//       is nothing to preserve; the link's meaning died with its endpoint. Alice's OTHER
//       work is untouched, because ops are per-property and per-entity.
//
// (c). And it is what every single-user diagram editor already does when you delete a
// node — which is the point: COLLABORATION SHOULD NOT INVENT NEW SEMANTICS. The rule is
// the one users already know, applied to a state they did not know they were in.
//
// ---------------------------------------------------------------------------
// HOW IT CONVERGES WITHOUT AN OP
// ---------------------------------------------------------------------------
// Liveness is a PURE FUNCTION OF STATE, not an event:
//
//     a link is LIVE  ⟺  both its endpoint ports resolve to nodes present in the diagram
//
// Every peer evaluates the same predicate over the same converged presence registers and
// gets the same answer. So integrity needs NO op of its own, no cascade broadcast, and no
// agreement protocol: it converges because it is derived. A cascade of `remove link` ops
// would be strictly worse — it would race with a concurrent `add link` and put us right
// back here.
//
// And a derived rule is REVERSIBLE, which a cascade is not. An orphaned link is not
// destroyed, it is QUARANTINED: held aside, still in the presence registers, invisible to
// the document. Resurrect the node — undo the delete — and the predicate flips back and the
// link RETURNS, including a colleague's link that we never even knew about. That falls out
// of the design for free, and it is the behaviour a user would call obviously correct.

import { DiagramModel } from '../models/DiagramModel';
import { Replica } from './replica';
import { replay } from './op-log';
import type { Op } from './op';
import { bytes, expectConverged, link, node, peer } from './testing';

describe('referential integrity: a link whose node is gone', () => {
  it('THE ONE THAT MATTERS: deleting a node while a colleague links to it leaves NO dangling link', () => {
    // Bob deletes n1. Alice, concurrently and blind to it, draws a link INTO n1.
    // Different registers: they do not conflict, so both ops apply everywhere. The
    // question is only whether the engine notices that the result is invalid.
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.addNode(node('n2', 300, 0));

    const aliceOps: Op[] = [];
    const bobOps: Op[] = [];
    const alice = peer('alice', seeder.diagram, aliceOps);
    const bob = peer('bob', seeder.diagram, bobOps);
    alice.receive(seedOps);
    bob.receive(seedOps);

    alice.diagram.addLink(link('l1', 'n1', 'n2')); // Alice connects INTO n1
    bob.diagram.removeNode('n1'); //                  Bob deletes n1

    alice.receive(bobOps);
    bob.receive(aliceOps);

    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')).toBeUndefined(); // the delete stands…
      expect(p.diagram.getLink('l1')).toBeUndefined(); // …and took the link with it
    }
    expectConverged(alice.diagram, bob.diagram);

    [seeder, alice, bob].forEach((p) => p.dispose());
  });

  it('the orphaned link is QUARANTINED, not destroyed — resurrect the node and it RETURNS', () => {
    // The payoff of making integrity DERIVED rather than a cascade of remove-ops. Bob
    // deletes the node; Alice's link (which Bob never saw) is held aside. Bob undoes the
    // delete. Alice's link comes back — on both peers — with its state intact.
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.addNode(node('n2', 300, 0));

    const aliceOps: Op[] = [];
    const bobOps: Op[] = [];
    const alice = peer('alice', seeder.diagram, aliceOps);
    const bob = peer('bob', seeder.diagram, bobOps);
    alice.receive(seedOps);
    bob.receive(seedOps);

    const l = link('l1', 'n1', 'n2');
    alice.diagram.addLink(l);
    l.setMetadata('label', 'depends on'); // …and labels it
    bob.diagram.removeNode('n1');

    alice.receive(bobOps);
    bob.receive(aliceOps);
    expect(alice.diagram.getLink('l1')).toBeUndefined();
    expect(alice.quarantinedLinks).toEqual(['l1']); // held, not destroyed

    // Bob undoes his delete — the node comes back…
    bob.undo();
    alice.receive(bobOps.splice(0));

    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')).toBeDefined();
      const back = p.diagram.getLink('l1');
      expect(back).toBeDefined(); // …and so does Alice's link
      expect(back!.getMetadata('label')).toBe('depends on'); // with its state
      expect(p.quarantinedLinks).toEqual([]);
    }
    expectConverged(alice.diagram, bob.diagram);

    [seeder, alice, bob].forEach((p) => p.dispose());
  });

  it('a property write to a QUARANTINED link is not lost — it lands when the link returns', () => {
    // The trap. A `set` on an entity the diagram does not hold is dropped by applyOp
    // (correctly — you cannot write to what is not there) BUT the LWW gate has already
    // claimed the register for it. Re-delivery is then refused as superseded, and the
    // value is gone FOREVER on this peer while surviving on a peer that never quarantined
    // the link. That is silent, permanent divergence, and it is invisible to any test that
    // does not resurrect.
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.addNode(node('n2', 300, 0));
    seeder.diagram.addLink(link('l1', 'n1', 'n2'));

    const aliceOps: Op[] = [];
    const bobOps: Op[] = [];
    const alice = peer('alice', seeder.diagram, aliceOps);
    const bob = peer('bob', seeder.diagram, bobOps);
    alice.receive(seedOps);
    bob.receive(seedOps);

    bob.diagram.removeNode('n1'); // l1 is now quarantined on Bob
    expect(bob.quarantinedLinks).toEqual(['l1']);

    // Alice — who still has the node — relabels the link. Bob receives the write while
    // the link is in quarantine.
    alice.diagram.getLink('l1')!.setMetadata('label', 'still here');
    bob.receive(aliceOps.splice(0));
    alice.receive(bobOps.splice(0)); // Alice learns of the delete; her link quarantines too

    // Now the node comes back.
    bob.undo();
    alice.receive(bobOps.splice(0));

    for (const p of [alice, bob]) {
      expect(p.diagram.getLink('l1')!.getMetadata('label')).toBe('still here');
    }
    expectConverged(alice.diagram, bob.diagram);

    [seeder, alice, bob].forEach((p) => p.dispose());
  });
});

describe('referential integrity: endpoint resolution is not arrival-order dependent', () => {
  it('a link that arrives BEFORE its node still resolves its endpoints', () => {
    // installLink() backfills the cached sourceNodeId/targetNodeId from the port index —
    // ONCE, at install time, and only if they are not already set. A link applied before
    // its node has arrived indexes NOTHING, and the cached ids stay undefined FOREVER.
    // They are in serialize(), so the two peers' documents differ; and the renderer
    // resolves port sides through them, so the link is drawn wrong.
    //
    // Card 0's fuzz could never have caught this: it never creates a link.
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.addNode(node('n2', 300, 0));
    seeder.diagram.addLink(link('l1', 'n1', 'n2'));

    // In total order: add n1, add n2, add l1. The network delivers it BACKWARDS.
    const inOrder = peer('a');
    const backwards = peer('b', inOrder.diagram);
    inOrder.receive(seedOps);
    backwards.receive([...seedOps].reverse());

    expect(backwards.diagram.getLink('l1')!.sourceNodeId).toBe('n1');
    expect(backwards.diagram.getLink('l1')!.targetNodeId).toBe('n2');
    expectConverged(inOrder.diagram, backwards.diagram);

    [seeder, inOrder, backwards].forEach((p) => p.dispose());
  });

  it('a property write that arrives BEFORE its entity is BUFFERED, not dropped', () => {
    // applyOp drops a `set` on an entity that is not there — correct, and Card 0 flagged
    // the consequence honestly: under an unreliable transport the op must be BUFFERED
    // until its dependency lands, or the write is lost while the LWW gate still records
    // it as the register's winner (so re-delivery cannot repair it either).
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.getNode('n1')!.setMetadata('label', 'Start');
    seeder.diagram.getNode('n1')!.setPosition(400, 250);

    const late = peer('late', seeder.diagram);
    // The `add` arrives LAST — every property write precedes the entity it writes to.
    const addFirst = seedOps.filter((o) => o.op === 'add');
    const setsFirst = seedOps.filter((o) => o.op !== 'add');
    late.receive(setsFirst);
    expect(late.diagram.getNode('n1')).toBeUndefined(); // nothing to apply to — yet
    late.receive(addFirst);

    const n = late.diagram.getNode('n1')!;
    expect(n.getMetadata('label')).toBe('Start'); // the buffered writes landed
    expect(n.position).toMatchObject({ x: 400, y: 250 });
    expectConverged(late.diagram, seeder.diagram);

    [seeder, late].forEach((p) => p.dispose());
  });
});

describe('referential integrity holds under replay, not just under receive()', () => {
  it('replaying a log that deletes a linked node leaves no dangling link', () => {
    // A peer joining from a persisted log must reach the same place as a peer that was
    // there live. If integrity only ran in receive(), replay() would produce an invalid
    // document and the two would disagree.
    const ops: Op[] = [];
    const author = peer('author', undefined, ops);
    author.diagram.addNode(node('n1', 0, 0));
    author.diagram.addNode(node('n2', 300, 0));
    author.diagram.addLink(link('l1', 'n1', 'n2'));
    author.diagram.removeNode('n1');

    const fresh = new DiagramModel(author.diagram.name, {
      id: author.diagram.id,
      uuid: author.diagram.uuid,
    });
    replay(fresh, ops);

    expect(fresh.getLink('l1')).toBeUndefined();
    expect(bytes(fresh)).toEqual(bytes(author.diagram));

    author.dispose();
  });
});

describe('the LOCAL editor is held to the same rule', () => {
  it('a local removeNode() takes its links with it — RemoveNodeCommand never did', () => {
    // DiagramModel.removeNode() does not touch links, and RemoveNodeCommand (the single-
    // node delete) does not either — it cascades node DESCENDANTS and stops. So the engine
    // could already strand a link on a deleted node with nobody else in the room.
    // DeleteSelectionCommand works around it by hand. Integrity closes the hole wherever
    // a Replica is attached, single-player included.
    const r = new Replica(new DiagramModel('solo'), { actor: 'solo' });
    r.diagram.addNode(node('n1', 0, 0));
    r.diagram.addNode(node('n2', 300, 0));
    r.diagram.addLink(link('l1', 'n1', 'n2'));

    r.diagram.removeNode('n1');

    expect(r.diagram.getLink('l1')).toBeUndefined();
    r.dispose();
  });
});
