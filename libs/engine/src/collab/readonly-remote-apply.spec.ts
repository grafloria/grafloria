// Wave 9 — Card 7 gap: a LOCKED replica must still receive REMOTE edits.
//
// The read-only lock exists to refuse a LOCAL user's document writes. It was over-reaching:
// because the collab reducer applies a remote op through the very same model mutators a
// local edit uses (setPosition, replaceStyle, addNode, removeNode…), a locked replica
// silently DROPPED every collaborator's edit and diverged from the rest of the session.
// "Read-only" is supposed to mean "I cannot edit", never "I refuse to see your edits".
//
// The fix scopes the system-write bypass (DiagramModel.runSystemWrite — the same door
// auto-size and portal placement already use) to the REMOTE-APPLY boundary only: batch
// replay() and Replica.receive(). A remote op is the document already meaning something new,
// mirrored from a peer — not this user's intent — so the lock (which guards this user's
// intent) must not block it.
//
// The tests below assert BOTH halves, because either one alone is a hole:
//   • a locked replica APPLIES remote position / style / structural ops, converging on the
//     AUTHOR'S value (asserted on the LOCKED replica's own bytes, never the author's);
//   • a locked replica STILL REFUSES a LOCAL edit — direct mutator, command, structural add —
//     including AFTER a receive(), which is the tooth that proves the bypass is scoped to the
//     apply window and does not leak onto local input.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { Replica } from './replica';
import { replay } from './op-log';
import { node, link, bytes, contentBytes, expectConverged, peer } from './test-helpers';
import type { Op } from './op';

/**
 * alice (author, unlocked) + bob (viewer, LOCKED). Both hold n1. `sink` collects alice's
 * ops as she edits, so a test can hand bob exactly the delta a live transport would.
 *
 * bob catches up UNLOCKED, then is locked — the real sequence: you load the document, then
 * the host puts you in VIEW/PRESENTATION mode. Locking bob mid-catch-up would be a different
 * (and also-broken) story; this test is about a viewer of a LIVE session.
 */
function lockedPair(): { alice: Replica; bob: Replica; sink: Op[] } {
  const sink: Op[] = [];
  const alice = peer('alice', undefined, sink);
  alice.diagram.addNode(node('n1', 10, 20));

  const bob = peer('bob', alice.diagram);
  bob.receive(alice.log.toArray()); // bob joins, still editable
  sink.length = 0;

  bob.diagram.setReadonly(true); // …then the host locks bob's view
  return { alice, bob, sink };
}

describe('a LOCKED replica still receives REMOTE edits', () => {
  it('APPLIES a remote position edit — and holds the AUTHORS value, not its stale one', () => {
    const { alice, bob, sink } = lockedPair();

    alice.diagram.getNode('n1')!.setPosition(200, 340);
    bob.receive(sink);

    const n = bob.diagram.getNode('n1')!;
    // The RIGHT value, on the LOCKED replica's own model — not merely "same as some baseline".
    expect(n.position.x).toBe(200);
    expect(n.position.y).toBe(340);
    expect(bob.diagram.isReadonly()).toBe(true); // still locked; it did not un-lock to do this
    expectConverged(bob.diagram, alice.diagram);
  });

  it('APPLIES a remote style edit (replaceStyle) through the lock', () => {
    const { alice, bob, sink } = lockedPair();

    alice.diagram.getNode('n1')!.replaceStyle({ fill: '#ff0055' });
    bob.receive(sink);

    expect(bob.diagram.getNode('n1')!.style).toEqual({ fill: '#ff0055' });
    expectConverged(bob.diagram, alice.diagram);
  });

  it('APPLIES a remote structural add AND remove', () => {
    const { alice, bob, sink } = lockedPair();

    alice.diagram.addNode(node('n2', 400, 400));
    bob.receive(sink);
    sink.length = 0;
    expect(bob.diagram.getNode('n2')).toBeDefined();
    expect(bob.diagram.getNode('n2')!.position.x).toBe(400);

    alice.diagram.removeNode('n2');
    bob.receive(sink);
    expect(bob.diagram.getNode('n2')).toBeUndefined();

    expectConverged(bob.diagram, alice.diagram);
  });

  it('APPLIES a remote link add through the lock', () => {
    const { alice, bob, sink } = lockedPair();

    alice.diagram.addNode(node('n2', 400, 400));
    const l = link('l1', 'n1', 'n2');
    alice.diagram.addLink(l);
    bob.receive(sink);

    expect(bob.diagram.getLink('l1')).toBeDefined();
    expectConverged(bob.diagram, alice.diagram);
  });

  it('batch REPLAY into a locked document applies every op (the joining-peer path)', () => {
    // replay() is how a peer that joins a live session catches up. If it honours the lock, a
    // viewer who joins ALREADY read-only receives an empty document.
    const author = peer('alice', undefined, []);
    author.diagram.addNode(node('n1', 10, 20));
    author.diagram.getNode('n1')!.setPosition(77, 88);
    author.diagram.addNode(node('n2', 400, 400));

    const locked = new DiagramModel(author.diagram.name, {
      id: author.diagram.id,
      uuid: author.diagram.uuid,
    });
    locked.setReadonly(true);
    replay(locked, author.log.toArray());

    expect(locked.getNode('n1')).toBeDefined();
    expect(locked.getNode('n1')!.position.x).toBe(77);
    expect(locked.getNode('n2')).toBeDefined();
    expect(contentBytes(locked)).toBe(contentBytes(author.diagram));
  });
});

describe('the SECURITY tooth: a LOCKED replica still REFUSES a LOCAL edit', () => {
  it('refuses a direct mutator write', () => {
    const { bob } = lockedPair();
    bob.diagram.getNode('n1')!.setPosition(999, 999);
    expect(bob.diagram.getNode('n1')!.position.x).toBe(10); // unchanged
  });

  it('refuses a local structural add and a local remove', () => {
    const { bob } = lockedPair();
    bob.diagram.addNode(node('zzz', 1, 1));
    expect(bob.diagram.getNode('zzz')).toBeUndefined();

    bob.diagram.removeNode('n1');
    expect(bob.diagram.getNode('n1')).toBeDefined(); // the delete was refused
  });

  it('STILL refuses a local edit AFTER applying a remote op — the bypass must not leak', () => {
    // The scoping tooth. runSystemWrite is a try/finally depth counter; if the bypass leaked
    // past the apply window (a depth that never restored), this LOCAL write would land.
    const { alice, bob, sink } = lockedPair();

    alice.diagram.getNode('n1')!.setPosition(200, 340);
    bob.receive(sink); // remote apply opens, and must CLOSE, the bypass

    bob.diagram.getNode('n1')!.setPosition(999, 999); // a LOCAL edit, right after
    expect(bob.diagram.getNode('n1')!.position.x).toBe(200); // still the remote value, not 999
    expect(bob.diagram.inSystemWrite()).toBe(false); // the window is shut
  });
});

describe('a LOCKED replica preserves its OWN view state under a remote edit', () => {
  it('keeps this viewers selection when a remote state op lands', () => {
    const { alice, bob, sink } = lockedPair();

    // bob selects n1 locally — a view key, allowed even while locked.
    bob.diagram.getNode('n1')!.setState({ selected: true });

    // alice makes a DURABLE state edit (visible:false) — that reaches bob…
    alice.diagram.getNode('n1')!.setState({ visible: false });
    bob.receive(sink);

    const n = bob.diagram.getNode('n1')!;
    expect(n.state.visible).toBe(false); // …the durable fact arrived…
    expect(n.state.selected).toBe(true); // …and bob's own selection SURVIVED it
  });
});

describe('a LOCKED replica converges with an UNLOCKED one on the same ops', () => {
  it('locked bob and unlocked carol hold byte-identical documents', () => {
    const sink: Op[] = [];
    const alice = peer('alice', undefined, sink);
    alice.diagram.addNode(node('n1', 10, 20));

    const bob = peer('bob', alice.diagram);
    const carol = peer('carol', alice.diagram);
    bob.receive(alice.log.toArray());
    carol.receive(alice.log.toArray());
    sink.length = 0;

    bob.diagram.setReadonly(true); // bob locked, carol not

    // A mixed batch: position, style, a structural add, a remove.
    alice.diagram.getNode('n1')!.setPosition(150, 150);
    alice.diagram.getNode('n1')!.replaceStyle({ stroke: '#000' });
    alice.diagram.addNode(node('n2', 300, 300));
    alice.diagram.getNode('n2')!.setPosition(305, 305);
    alice.diagram.removeNode('n1');

    bob.receive(sink);
    carol.receive(sink);

    expect(contentBytes(bob.diagram)).toBe(contentBytes(carol.diagram));
    expect(bytes(bob.diagram)).toContain('n2'); // sanity: content actually landed
    expectConverged(bob.diagram, carol.diagram);
  });
});
