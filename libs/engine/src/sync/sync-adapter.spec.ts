// Wave 9 — Card 5: the SyncAdapter.
//
// The properties here are the ones a user would name if you asked them what
// "collaboration" means: I see your edits; you see mine; if my wifi drops I do not lose my
// work; when I come back we agree; and I can see where you are.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { Replica } from '../collab/replica';
import { replay } from '../collab/op-log';
import type { Op } from '../collab/op';
import { createSyncSession, SyncAdapter } from './sync-adapter';
import { MemoryHub, MemoryTransport } from './transports/memory';
import { UnreliableHub } from './transports/unreliable';
import { VersionVector } from './version-vector';

function node(id: string, x = 0, y = 0): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

/** One shared starting document, byte-identical on every peer. (See hostile-transport.spec.) */
const SEED: { name: string; id: string; uuid: string; ops: Op[] } = (() => {
  const base = new DiagramModel('shared');
  const ops: Op[] = [];
  const seeder = new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), {
    actor: 'seed',
    onLocalOp: (o) => ops.push(o),
  });
  seeder.diagram.addNode(node('n1', 0, 0));
  seeder.dispose();
  return { name: base.name, id: base.id, uuid: base.uuid, ops };
})();

function seeded(): DiagramModel {
  const d = new DiagramModel(SEED.name, { id: SEED.id, uuid: SEED.uuid });
  replay(d, SEED.ops);
  return d;
}

function peer(hub: MemoryHub, actor: string): SyncAdapter {
  const a = createSyncSession(seeded(), hub.connect(actor), {
    actor,
    batch: { intervalMs: 1_000_000, maxBatch: 10_000 }, // flushed by hand: no timers, no races
  });
  a.join();
  return a;
}

/** The transport a session is holding — the tests need to yank the cable. */
function cable(a: SyncAdapter): MemoryTransport {
  return (a as unknown as { transport: MemoryTransport }).transport;
}

describe('an edit REACHES the other peer (the whole point)', () => {
  it('a local node move arrives at the remote diagram', () => {
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    alice.diagram.getNode('n1')!.setPosition(321, 654);
    alice.flush();

    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 321, y: 654 });
    alice.dispose();
    bob.dispose();
  });

  it('a peer joining LATE is caught up by an existing peer, without asking twice', () => {
    // The BroadcastChannel case, and the reason `hello` carries a frontier: the channel has
    // no history, so a tab opened five minutes late has missed literally everything. It must
    // be caught up by a PEER, on the first message, or it stares at a blank canvas.
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');

    alice.diagram.addNode(node('early', 5, 5));
    alice.diagram.getNode('early')!.setMetadata('label', 'made before you arrived');
    alice.flush();

    const bob = peer(hub, 'bob'); // joins now, knowing nothing

    expect(bob.diagram.getNode('early')).toBeDefined();
    expect(bob.diagram.getNode('early')!.getMetadata('label')).toBe('made before you arrived');
    alice.dispose();
    bob.dispose();
  });
});

describe('RECONNECT — the case the card is actually about', () => {
  it('30 seconds offline, BOTH sides edit, and they converge on reconnect', () => {
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    // A shared starting point both have seen.
    alice.diagram.getNode('n1')!.setPosition(10, 10);
    alice.flush();
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 10, y: 10 });

    // ---- THE CABLE COMES OUT --------------------------------------------------------
    cable(bob).disconnect();

    // Bob keeps working, offline. He does not know he is alone.
    bob.diagram.getNode('n1')!.setMetadata('label', 'bob was offline');
    bob.diagram.addNode(node('bob-made-this', 700, 700));
    bob.flush(); // …into the void. The transport drops it: `send()` while down is a no-op.

    // Alice keeps working too, and never hears from Bob.
    alice.diagram.getNode('n1')!.setSize(999, 111);
    alice.diagram.addNode(node('alice-made-this', 800, 800));
    alice.flush();

    // Neither saw the other. This is the divergence a reconnect has to repair.
    expect(alice.diagram.getNode('bob-made-this')).toBeUndefined();
    expect(bob.diagram.getNode('alice-made-this')).toBeUndefined();

    // ---- THE CABLE GOES BACK IN ------------------------------------------------------
    cable(bob).connect(); // → status 'connected' → announce() → hello + sync, both ways

    // Everything both sides did while apart is now on both sides. Nothing was lost; it was
    // only undelivered — it was in their logs the whole time.
    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('bob-made-this')).toBeDefined();
      expect(p.diagram.getNode('alice-made-this')).toBeDefined();
      expect(p.diagram.getNode('n1')!.getMetadata('label')).toBe('bob was offline');
      expect(p.diagram.getNode('n1')!.size).toMatchObject({ width: 999, height: 111 });
    }

    expect(bob.stats.reconnects).toBe(1);
    alice.dispose();
    bob.dispose();
  });

  it('a batch queued while OFFLINE is not silently lost — the log redelivers it', () => {
    // `discard()` on disconnect looks like a data-loss hatch and would be one, were the op
    // not already in the local log. This is the test that says so out loud.
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    cable(alice).disconnect();
    alice.diagram.getNode('n1')!.setPosition(42, 42); // queued in the batcher…
    // …and never flushed. The disconnect DISCARDS the queue.
    cable(alice).connect();

    // The op was in the log all along, so anti-entropy delivers it anyway.
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 42, y: 42 });
    alice.dispose();
    bob.dispose();
  });
});

describe('anti-entropy costs nothing when nothing is wrong', () => {
  it('a healthy channel never triggers a repair — the fast path is actually the fast path', () => {
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    for (let i = 0; i < 20; i++) {
      alice.diagram.getNode('n1')!.setPosition(i, i);
      bob.diagram.getNode('n1')!.setMetadata('label', `l${i}`);
      alice.flush();
      bob.flush();
      alice.sync();
      bob.sync();
    }

    expect(alice.stats.repairs).toBe(0);
    expect(bob.stats.repairs).toBe(0);
    alice.dispose();
    bob.dispose();
  });

  it('A DUPLICATING channel STILL never triggers a repair — duplicates are absorbed for FREE', () => {
    // A channel that DUPLICATES EVERYTHING but LOSES and REORDERS NOTHING. There are no
    // holes in it, so a repair here would not merely be wasteful — it would be provably
    // wrong, and `repairs === 0` is an exact statement rather than a hopeful one.
    const hub = new UnreliableHub({
      seed: 4,
      dropRate: 0,
      delayRate: 0,
      duplicateRate: 0.6, // every other message, twice or thrice
      maxDuplicates: 2,
    });
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    for (let i = 0; i < 20; i++) {
      alice.diagram.getNode('n1')!.setPosition(i, i);
      bob.diagram.getNode('n1')!.setMetadata('label', `l${i}`);
      alice.flush();
      bob.flush();
      alice.sync();
      bob.sync();
    }

    // The duplicates really did happen…
    expect(hub.faults.duplicated).toBeGreaterThan(10);
    expect(alice.stats.opsDuplicate + bob.stats.opsDuplicate).toBeGreaterThan(5);

    // …and cost exactly nothing. No hole was invented; no history was resent.
    expect(alice.stats.repairs).toBe(0);
    expect(bob.stats.repairs).toBe(0);

    alice.dispose();
    bob.dispose();
  });
});

describe('THE FRONTIER INVARIANT — the cache must not lie about the log it caches', () => {
  // ---------------------------------------------------------------------------
  //     frontier() === VersionVector.fromOps(replica.history())     — ALWAYS.
  //
  // The frontier is maintained INCREMENTALLY (observe each accepted op) so we never rescan
  // the history to answer a sync. That makes it a cache, and this is the assertion that it
  // has not drifted from its source.
  //
  // It is what catches the DOUBLE-COUNT bug, and getting here took two wrong tests, which is
  // worth recording because both looked convincing:
  //
  //   • "A healthy channel never repairs." VACUOUS — a channel that never duplicates never
  //     produces a duplicate op, so the bug cannot fire. Mutation-tested: stayed green.
  //   • "A duplicating channel never repairs." ALSO VACUOUS, and more subtly: a duplicated
  //     message is a duplicate of a WHOLE batch, so every op in it is already known, `fresh`
  //     is empty, and `ingest()` early-returns BEFORE it touches the frontier. The bug needs
  //     a MIXED batch (some new ops, some known) to fire at all — which is what a repair
  //     resend or a reordered delivery produces. Mutation-tested: also stayed green.
  //
  // Neither of those is a convergence bug, and no convergence oracle can see it: the document
  // still converges perfectly, because over-sending is free. So the only test that can catch
  // it is one that checks the frontier AGAINST THE LOG directly — which is the invariant it
  // was always supposed to satisfy.
  // ---------------------------------------------------------------------------
  it('after a full hostile session, each peer’s frontier equals the one derived from its log', () => {
    const hub = new UnreliableHub({ seed: 31, dropRate: 0.2, duplicateRate: 0.3, delayRate: 0.4 });
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    for (let i = 0; i < 30; i++) {
      alice.diagram.getNode('n1')!.setPosition(i, i);
      bob.diagram.addNode(node(`b${i}`, i, i));
      alice.flush();
      bob.flush();
      hub.step(0.5);
      alice.sync();
      bob.sync();
    }
    hub.heal();
    hub.settle();
    for (let r = 0; r < 4; r++) {
      alice.sync();
      bob.sync();
      hub.settle();
    }

    // The mixed batches really happened (a repair resend is exactly one) — without them the
    // assertion below would be vacuous, which is the trap that ate the two tests before it.
    expect(alice.stats.repairs + bob.stats.repairs).toBeGreaterThan(0);
    expect(alice.stats.opsDuplicate + bob.stats.opsDuplicate).toBeGreaterThan(0);

    for (const p of [alice, bob]) {
      expect(p.frontier()).toEqual(VersionVector.fromOps(p.replica.history()).toJSON());
    }

    alice.dispose();
    bob.dispose();
  });
});

describe('MESH RELAY — a peer reachable only THROUGH another peer', () => {
  it('A—B—C: an edit at A reaches C, which A cannot even talk to', () => {
    // Two separate buses. B is on both; A and C have never heard of each other. This is a
    // WebRTC mesh, or a chain of relays, and it is the case `Replica.receive()` returns
    // `fresh` for: forward what was NEW to you, and a re-delivery is new to nobody, which is
    // what makes the forwarding terminate instead of ringing forever.
    const left = new MemoryHub();
    const right = new MemoryHub();

    const a = createSyncSession(seeded(), left.connect('a'), {
      actor: 'a', relay: true, batch: { intervalMs: 1_000_000 },
    });
    // B has one session but TWO transports… which the adapter does not model. So B is two
    // adapters over ONE diagram — a relay node, honestly built: it merges from the left and
    // republishes to the right because both adapters watch the same document.
    const bDiagram = seeded();
    const bLeft = new SyncAdapter(
      new Replica(bDiagram, { actor: 'b', onLocalOp: (op) => bLeft.publish(op) }),
      left.connect('b'),
      { relay: true, batch: { intervalMs: 1_000_000 } }
    );
    const bRight = new SyncAdapter(
      new Replica(bDiagram, { actor: 'b2', onLocalOp: (op) => bRight.publish(op) }),
      right.connect('b'),
      { relay: true, batch: { intervalMs: 1_000_000 } }
    );
    const c = createSyncSession(seeded(), right.connect('c'), {
      actor: 'c', relay: true, batch: { intervalMs: 1_000_000 },
    });

    a.join();
    bLeft.join();
    bRight.join();
    c.join();

    a.diagram.getNode('n1')!.setPosition(123, 456);
    a.flush();

    // A → B (direct). B applies it; B's SECOND replica sees the model change as a LOCAL edit
    // and republishes it rightward. B → C.
    bLeft.flush();
    bRight.flush();

    expect(bDiagram.getNode('n1')!.position).toMatchObject({ x: 123, y: 456 });
    expect(c.diagram.getNode('n1')!.position).toMatchObject({ x: 123, y: 456 });

    // …and it TERMINATED. If forwarding re-forwarded re-deliveries, this would still be
    // ringing: every relayed op would bounce back and forth forever, each hop amplifying.
    const before = c.stats.messagesReceived;
    bLeft.flush();
    bRight.flush();
    expect(c.stats.messagesReceived).toBe(before);

    [a, bLeft, bRight, c].forEach((s) => s.dispose());
  });
});

describe('AWARENESS IS NOT AN OP — the containment, asserted', () => {
  it('a THOUSAND cursor moves leave the op log completely EMPTY', () => {
    // If this ever fails, the document's history is being poisoned with mouse jitter — 60Hz
    // of ephemeral, worthless, PERMANENT entries in an append-only log, plus a Lamport clock
    // in the millions, plus cursors in the undo stack. It is unrecoverable by construction
    // (the log is append-only), which is why it gets an assertion rather than a code review.
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    const logBefore = alice.replica.history().length;

    for (let i = 0; i < 1000; i++) {
      alice.setAwareness({ cursor: { x: i, y: i * 2 } });
    }

    expect(alice.replica.history().length).toBe(logBefore);
    expect(bob.replica.history().length).toBe(logBefore);
    expect(alice.replica.clock).toBe(0); // not one Lamport tick was spent on a mouse
    alice.dispose();
    bob.dispose();
  });

  it('…but it DOES reach the other peer, or it would be a very safe no-op', () => {
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    alice.setAwareness({ name: 'Alice', color: '#f0f', cursor: { x: 10, y: 20 } });

    const seen = bob.awareness.getPeer('alice');
    expect(seen).toBeDefined();
    expect(seen!.state.name).toBe('Alice');
    expect(seen!.state.cursor).toEqual({ x: 10, y: 20 });
    alice.dispose();
    bob.dispose();
  });

  it('selection travels as awareness, NOT as a document edit', () => {
    // Selection is a genuinely interesting call. It is `state.selected` on the model, so an
    // op WOULD capture it — and then MY clicking a node would move YOUR selection, because
    // it is one shared register. Selection is per-VIEWER, so it belongs in awareness.
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    alice.setAwareness({ selection: ['n1'] });

    expect(bob.awareness.getPeer('alice')!.state.selection).toEqual(['n1']);
    expect(bob.diagram.getNode('n1')!.state.selected).toBe(false); // …and NOT selected for Bob
    alice.dispose();
    bob.dispose();
  });

  it('a peer that says goodbye stops being a cursor immediately', () => {
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    alice.setAwareness({ cursor: { x: 1, y: 1 } });
    expect(bob.awareness.peerCount).toBe(1);

    alice.leave();
    expect(bob.awareness.peerCount).toBe(0);
    alice.dispose();
    bob.dispose();
  });

  it('a peer that CRASHES (no goodbye) is expired by the TTL — the guarantee, not the fast path', () => {
    // A crashed tab, a closed laptop and a severed cable all send no `bye` whatsoever, and
    // every one of them must eventually stop showing a cursor. `bye` is the optimisation;
    // this is the promise.
    let clock = 1000;
    const hub = new MemoryHub();
    const bob = createSyncSession(seeded(), hub.connect('bob'), {
      actor: 'bob',
      awarenessTimeoutMs: 5000,
      now: () => clock,
      batch: { intervalMs: 1_000_000 },
    });
    bob.join();

    const alice = peer(hub, 'alice');
    alice.setAwareness({ cursor: { x: 1, y: 1 } });
    expect(bob.awareness.peerCount).toBe(1);

    // Alice's laptop lid closes. No bye. No heartbeat. Nothing.
    clock += 6000;
    bob.awareness.prune();

    expect(bob.awareness.peerCount).toBe(0);
    alice.dispose();
    bob.dispose();
  });
});
