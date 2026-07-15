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
import { bytes, expectConverged, link, node, peer } from './test-helpers';

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

  it('a property write that arrives BEFORE its entity is not lost — it lands when the entity does', () => {
    // applyOp drops a `set` on an entity that is not there. Correct — there is nothing to
    // write to — and Card 0 flagged the consequence honestly: the write is gone, while the LWW
    // gate has already recorded it as the register's winner, so not even a re-delivery can
    // repair it.
    //
    // I first fixed this with a BUFFER: hold the write aside, flush it when the `add` lands.
    // Then MUTATION-TESTING showed the buffer could be deleted with the whole suite still
    // green — because Replica.repair() had made it redundant. An entity's state is its `add`
    // data plus every log write NEWER than the add, replayed in total order; a write that
    // outran its own entity is simply one of those. So the buffer WAS DELETED rather than left
    // in the tree to be admired. This test now pins the mechanism that actually carries the
    // weight: disable repair() and it goes red.
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

describe('the invariant is checked INCREMENTALLY, or the engine stops being usable', () => {
  it('a bulk load through a Replica stays LINEAR — it was quadratic, and nothing was watching', () => {
    // The invariant check began life as a full O(links) sweep after every structural op. A
    // bulk load — importing a document into a live session — is n structural ops, so it was
    // O(n²): MEASURED AT 8.5 SECONDS for 2,000 nodes and 2,000 links, against ~90ms for the
    // same work with no Replica attached.
    //
    // Not one gate in this repo noticed, because no perf harness drives a Replica. I found it
    // by measuring on a hunch, which is not a system. So the gate exists now.
    //
    // wave14/model — HOW the gate asserts, revised. The original chose a deliberately loose
    // absolute budget (~8× the measured 250ms) on the correct reasoning that a tight
    // wall-clock assertion is a flaky test — and then flaked anyway, because under parallel
    // machine load even 8× headroom is a coin toss and no constant is safe on every box.
    // The test's REAL claim was never "under 2 seconds"; it is LINEARITY. So measure the
    // claim: run two sizes in the same process and assert the RATIO. Linear work at 4×
    // the size costs ~4×; the quadratic bug this gate exists to catch costs ~16× and blows
    // through the 6× ceiling on any machine, however loaded — machine speed and parallel
    // load divide OUT of a ratio taken in the same run. The original's loose-absolute
    // instinct is preserved as a backstop generous enough to never flake, tight enough to
    // catch the pathological (the bug as originally measured was 8.5s).
    const measure = (n: number): number => {
      const r = new Replica(new DiagramModel(`bulk-${n}`), { actor: 'importer' });
      const started = performance.now();
      for (let i = 0; i < n; i++) r.diagram.addNode(node(`n${i}`, i * 10, 0));
      for (let i = 1; i < n; i++) r.diagram.addLink(link(`l${i}`, `n${i - 1}`, `n${i}`));
      const elapsed = performance.now() - started;

      expect(r.diagram.getNodes()).toHaveLength(n);
      expect(r.diagram.getLinks()).toHaveLength(n - 1); // …and every link is LIVE, not quarantined
      expect(r.quarantinedLinks).toEqual([]);

      r.dispose();
      return elapsed;
    };

    measure(200); // discarded warm-up: JIT/allocator noise must not inflate the small run

    const small = measure(500);
    const large = measure(2000); // 4× the entities

    // LINEAR ⇒ ~4×. Quadratic ⇒ ~16×. The floor keeps a sub-millisecond `small` (fast
    // machine, tiny timer quantum) from turning the ratio into a noise amplifier.
    expect(large).toBeLessThan(Math.max(small, 20) * 6);
    // Backstop, very loose on purpose: the regression this catches measured 8.5s.
    expect(large).toBeLessThan(8000);
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
