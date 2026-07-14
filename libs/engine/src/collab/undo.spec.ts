// Wave 9 — Card 4: COLLABORATION-AWARE UNDO.
//
// Three properties, and a home-grown multiplayer editor typically gets none of them:
//
//   1. Ctrl-Z undoes MY last edit, not the last edit.
//   2. Undoing an edit that a colleague has already overwritten does NOTHING — it does not
//      resurrect my stale value over their newer one.
//   3. The undo is itself an OP: it converges, it reaches the other peers, and it can be
//      redone.
//
// The tests below are written from the two-users-in-a-room point of view, because that is
// the only place these bugs exist and the only place a reader can judge whether the
// behaviour is the right one.

import { DiagramModel } from '../models/DiagramModel';
import { Replica } from './replica';
import type { Op } from './op';
import { expectConverged, link, node, peer } from './testing';

/** Two peers on the same document, each with their ops collected. */
function pair(): {
  alice: Replica;
  bob: Replica;
  aliceOps: Op[];
  bobOps: Op[];
  sync: () => void;
  seed: (build: (d: DiagramModel) => void) => void;
  dispose: () => void;
} {
  const seedOps: Op[] = [];
  const seeder = peer('seed', undefined, seedOps);
  const aliceOps: Op[] = [];
  const bobOps: Op[] = [];
  const alice = peer('alice', seeder.diagram, aliceOps);
  const bob = peer('bob', seeder.diagram, bobOps);

  return {
    alice,
    bob,
    aliceOps,
    bobOps,
    seed: (build) => {
      build(seeder.diagram);
      alice.receive(seedOps);
      bob.receive(seedOps);
      seedOps.length = 0;
    },
    sync: () => {
      const a = aliceOps.splice(0);
      const b = bobOps.splice(0);
      alice.receive(b);
      bob.receive(a);
      // …and again, so that any op an undo emitted during the first pass also lands.
      const a2 = aliceOps.splice(0);
      const b2 = bobOps.splice(0);
      if (b2.length) alice.receive(b2);
      if (a2.length) bob.receive(a2);
    },
    dispose: () => [seeder, alice, bob].forEach((p) => p.dispose()),
  };
}

describe('undo is MINE', () => {
  it('THE ONE THAT MATTERS: Bob pressing Ctrl-Z does not undo ALICE\'s move', () => {
    // The single most infuriating bug in every home-grown multiplayer editor. It comes from
    // one global history stack, shared by everyone, popped by whoever pressed the key.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => {
      d.addNode(node('n1', 0, 0));
      d.addNode(node('n2', 300, 0));
    });

    bob.diagram.getNode('n2')!.setPosition(50, 50); // Bob's own edit, earlier
    alice.diagram.getNode('n1')!.setPosition(700, 700); // Alice moves n1
    sync();

    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 700, y: 700 });

    bob.undo(); // Bob presses Ctrl-Z

    // Alice's move is UNTOUCHED. Bob took back his OWN last edit — the n2 move.
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 700, y: 700 });
    expect(bob.diagram.getNode('n2')!.position).toMatchObject({ x: 300, y: 0 });

    sync();
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('a peer with no local edits has nothing to undo, however busy the room is', () => {
    // The per-actor property is STRUCTURAL: capture only ever sees local mutations, so a
    // remote op cannot reach the undo stack to begin with. Asserted anyway — a structural
    // guarantee nobody checks is one refactor away from not being one.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    alice.diagram.getNode('n1')!.setPosition(10, 10);
    alice.diagram.getNode('n1')!.setMetadata('label', 'Alice was here');
    alice.diagram.addNode(node('n2', 400, 0));
    sync();

    expect(bob.diagram.getNodes()).toHaveLength(2); // Bob has all her work…
    expect(bob.canUndo).toBe(false); // …and no power to undo any of it
    expect(bob.undo()).toEqual([]);
    expect(bob.diagram.getNodes()).toHaveLength(2);

    dispose();
  });
});

describe('undo must not resurrect stale state', () => {
  it("THE ONE THAT MATTERS: undoing an edit Alice already overwrote does NOTHING", () => {
    //     Bob   moves N to (10,10)
    //     Alice moves N to (900,900)      ← newer; this is what everyone sees
    //     Bob presses Ctrl-Z
    //
    // A naive undo restores "where it was before MY move" and DESTROYS ALICE'S MOVE. But
    // Bob's edit is already gone from the document — Alice overwrote that register. Undoing
    // an edit that has no effect must have no effect.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    bob.diagram.getNode('n1')!.setPosition(10, 10);
    sync();
    alice.diagram.getNode('n1')!.setPosition(900, 900);
    sync();

    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 900, y: 900 });

    const emitted = bob.undo();

    expect(emitted).toEqual([]); // nothing to say — and nothing said
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 900, y: 900 });

    sync();
    expect(alice.diagram.getNode('n1')!.position).toMatchObject({ x: 900, y: 900 });
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('undo restores the newest SURVIVING write below mine — not the value I captured', () => {
    // The case a captured `before` cannot get right, and the reason undo reads the LOG.
    //
    //     Alice sets label=red     (clock 5)
    //     Bob   sets label=blue    (clock 9)   ← Bob captured before="red"
    //     Alice sets label=green   (clock 7)   ← reaches Bob LATE; refused, 7 < 9
    //     Bob presses Ctrl-Z
    //
    // Bob's captured "before" is red — a value that no longer exists anywhere in the
    // document's history of record. The newest surviving write below Bob's is Alice's GREEN.
    // Restoring red would resurrect a value two writes stale.
    const { alice, bob, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    const aliceOut: Op[] = [];
    const bobOut: Op[] = [];
    const a = new Replica(alice.diagram, { actor: 'alice', onLocalOp: (o) => aliceOut.push(o) });
    const b = new Replica(bob.diagram, { actor: 'bob', onLocalOp: (o) => bobOut.push(o) });

    a.diagram.getNode('n1')!.setMetadata('label', 'red');
    b.receive(aliceOut.splice(0)); // Bob sees red
    b.diagram.getNode('n1')!.setMetadata('label', 'blue'); // …and overwrites it

    // Alice writes green WITHOUT having seen Bob's blue — her clock is lower, so blue wins…
    a.diagram.getNode('n1')!.setMetadata('label', 'green');
    const green = aliceOut.splice(0);
    b.receive(green); // …and green is refused on arrival: superseded.
    expect(b.diagram.getNode('n1')!.getMetadata('label')).toBe('blue');

    b.undo();

    // NOT "red" — the value Bob happened to be looking at when he typed.
    expect(b.diagram.getNode('n1')!.getMetadata('label')).toBe('green');

    [a, b].forEach((p) => p.dispose());
    dispose();
  });

  it('WE BOTH DELETE THE SAME NODE: the one whose delete is in force can take it back — and the other\'s undo says nothing', () => {
    // Found by MUTATION-TESTING: deleting the supersession check left the whole suite green,
    // which is what an untested gate looks like from the outside. Closing the gap forced a
    // real semantics decision, and my first answer was wrong.
    //
    // Two people select the same node and press Delete. Not exotic — Tuesday.
    //
    // My first rule was "a colleague's delete is still standing, so it stays gone" (recompute
    // presence excluding my undone op; both removes vote delete). Convergent, and a TERRIBLE
    // EDITOR: a peer only knows about its OWN undos, so BOTH users press Ctrl-Z, BOTH undos
    // decline, and the node is gone forever with two people wondering why undo is broken.
    //
    // The rule that works is the one already there: skip IFF MY OP IS SUPERSEDED. Whoever's
    // delete is currently IN FORCE takes it back and the node returns; the other's undo then
    // finds a newer `add` on the register and correctly says nothing.
    //
    // Bob renames the node before deleting it, so his snapshot differs from Alice's. That is
    // what makes the second half of this test bite: if Alice's superseded undo fired, it would
    // re-add HER snapshot and Bob's label — live on both screens — would silently vanish.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    bob.diagram.getNode('n1')!.setMetadata('label', "Bob's");
    bob.diagram.removeNode('n1');
    alice.diagram.removeNode('n1'); // concurrent, and blind to the rename
    sync();
    for (const p of [alice, bob]) expect(p.diagram.getNode('n1')).toBeUndefined();

    // Bob's delete is the one in force (it sorts last). He takes it back; the node returns,
    // exactly as it was when HE deleted it.
    expect(bob.undo()).toHaveLength(1);
    sync();
    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')!.getMetadata('label')).toBe("Bob's");
    }

    // Alice presses Ctrl-Z on her own, now-superseded, delete.
    const emitted = alice.undo();

    expect(emitted).toEqual([]); // it decides nothing, so it says nothing
    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')).toBeDefined();
      expect(p.diagram.getNode('n1')!.getMetadata('label')).toBe("Bob's"); // NOT clobbered
    }

    sync();
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('an op I undid stays undone even after the redo branch is discarded', () => {
    // A bug I found by reasoning about the mutation results, not by seeing it fail.
    //
    // New work discards the redo branch — right. It was ALSO un-marking those ops as undone —
    // wrong. Losing the ability to REDO an op is not the same as the op coming back into
    // force: its effect was reversed by an undo op that is in the log and is not going away.
    //
    // Un-marked, the op counts as a "surviving write" again, and the next undo of that
    // register restores ITS value — a value the user already took back. Undo a move, type
    // anything, move again, undo: the node jumps to the position you undid two steps ago.
    const { alice, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));
    const n = alice.diagram.getNode('n1')!;

    n.setPosition(100, 100);
    n.setPosition(200, 200);
    alice.undo(); // back to (100,100); the (200,200) op is undone
    expect(n.position).toMatchObject({ x: 100, y: 100 });

    n.setMetadata('label', 'anything'); // new work → the redo branch is discarded
    n.setPosition(300, 300);
    alice.undo(); // …and this must go back to (100,100), NOT to the undone (200,200)

    expect(n.position).toMatchObject({ x: 100, y: 100 });
    dispose();
  });

  it('two of my own edits in a row undo one at a time, back to the start', () => {
    // The supersession rule must not fire on MY OWN later writes, or a second Ctrl-Z would
    // be swallowed and the user would be stuck.
    const { alice, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    alice.diagram.getNode('n1')!.setPosition(100, 100);
    alice.diagram.getNode('n1')!.setPosition(200, 200);

    alice.undo();
    expect(alice.diagram.getNode('n1')!.position).toMatchObject({ x: 100, y: 100 });
    alice.undo();
    expect(alice.diagram.getNode('n1')!.position).toMatchObject({ x: 0, y: 0 });

    dispose();
  });
});

describe('undo is an OP', () => {
  it('an undo REACHES THE OTHER PEER — it is an edit, not a local rewind', () => {
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    alice.diagram.getNode('n1')!.setPosition(500, 500);
    sync();
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 500, y: 500 });

    const emitted = alice.undo();
    expect(emitted).toHaveLength(1); // the undo IS an op
    sync();

    // Bob sees the undo. He does not have to know it WAS one.
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 0, y: 0 });
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('undo, then redo, and the peers still agree', () => {
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    alice.diagram.getNode('n1')!.setMetadata('label', 'Draft');
    sync();
    alice.undo();
    sync();
    expect(bob.diagram.getNode('n1')!.getMetadata('label')).toBeUndefined();

    alice.redo();
    sync();
    expect(bob.diagram.getNode('n1')!.getMetadata('label')).toBe('Draft');
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('REDO does not clobber a write that landed after my undo', () => {
    // Symmetric to the undo rule, and it has to be: a redo that re-asserted my old value
    // over a colleague's newer one would be the same stale-state resurrection wearing a
    // different hat.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    alice.diagram.getNode('n1')!.setMetadata('label', 'Mine');
    sync();
    alice.undo(); // label cleared
    sync();

    bob.diagram.getNode('n1')!.setMetadata('label', 'Bob renamed it'); // …after the undo
    sync();

    alice.redo(); // Alice presses Ctrl-Y
    sync();

    // Bob's newer write stands. Redo declined rather than resurrect.
    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')!.getMetadata('label')).toBe('Bob renamed it');
    }
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('new work discards the redo branch — the rule a single-player editor already has', () => {
    const { alice, seed, dispose } = pair();
    seed((d) => d.addNode(node('n1', 0, 0)));

    alice.diagram.getNode('n1')!.setPosition(100, 100);
    alice.undo();
    expect(alice.canRedo).toBe(true);

    alice.diagram.getNode('n1')!.setPosition(777, 777); // new work
    expect(alice.canRedo).toBe(false);
    alice.redo();
    expect(alice.diagram.getNode('n1')!.position).toMatchObject({ x: 777, y: 777 });

    dispose();
  });
});

describe('undo across structure', () => {
  it('undoing a DELETE brings the node back — and its links with it', () => {
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => {
      d.addNode(node('n1', 0, 0));
      d.addNode(node('n2', 300, 0));
      d.addLink(link('l1', 'n1', 'n2'));
    });

    alice.diagram.removeNode('n1');
    sync();
    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')).toBeUndefined();
      expect(p.diagram.getLink('l1')).toBeUndefined(); // integrity took the link too
    }

    alice.undo();
    sync();
    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')).toBeDefined();
      expect(p.diagram.getLink('l1')).toBeDefined(); // …and gave it back
    }
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('undoing an ADD of a link that is currently QUARANTINED really removes it', () => {
    // The keyhole. The link is not in the document (its node is gone), so removeLink() would
    // mutate nothing and capture would mint no op — the link's presence register would still
    // say "present", and resurrecting the node would bring back a link the user explicitly
    // took back.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => {
      d.addNode(node('n1', 0, 0));
      d.addNode(node('n2', 300, 0));
    });

    alice.diagram.addLink(link('l1', 'n1', 'n2'));
    bob.diagram.removeNode('n1'); // …concurrently
    sync();

    expect(alice.quarantinedLinks).toEqual(['l1']);
    alice.undo(); // Alice takes back the link she drew
    sync();
    expect(alice.quarantinedLinks).toEqual([]);

    bob.undo(); // Bob takes back the delete: n1 returns
    sync();

    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')).toBeDefined();
      expect(p.diagram.getLink('l1')).toBeUndefined(); // the link stays gone. It was undone.
    }
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('transact() makes a multi-op gesture ONE Ctrl-Z', () => {
    // Deleting a node with its links is several ops. Without grouping that is several
    // presses of Ctrl-Z, which no user would forgive. Grouping is LOCAL — it changes what
    // one keypress takes back, never what goes on the wire.
    const { alice, bob, sync, seed, dispose } = pair();
    seed((d) => {
      d.addNode(node('n1', 0, 0));
      d.addNode(node('n2', 300, 0));
    });

    alice.transact(() => {
      alice.diagram.getNode('n1')!.setPosition(50, 50);
      alice.diagram.getNode('n1')!.setSize(200, 90);
      alice.diagram.getNode('n1')!.setMetadata('label', 'Grouped');
    });

    alice.undo(); // ONE press

    const n = alice.diagram.getNode('n1')!;
    expect(n.position).toMatchObject({ x: 0, y: 0 });
    expect(n.size).toMatchObject({ width: 120, height: 60 });
    expect(n.getMetadata('label')).toBeUndefined();
    expect(alice.canUndo).toBe(false); // …and it was the only step

    sync();
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });
});
