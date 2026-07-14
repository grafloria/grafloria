// Wave 9 — Card 5: THE TEST THAT MATTERS.
//
// Everything else in this card can be green while the engine is broken. Two peers on a
// perfect in-memory bus converge even if the causal buffer is missing, even if the
// frontier is a scalar, even if the batcher keeps the wrong write — because none of those
// bugs can FIRE on a channel that delivers everything exactly once in order.
//
// So: build the worst channel we can (drops, duplicates, reorders, delays, partitions),
// drive two peers through hundreds of random concurrent edits, heal, run anti-entropy, and
// demand BYTE-IDENTICAL documents. Seeded, so a failure is reproducible.
//
// THE ORACLE IS `serialize()` — the whole document, byte for byte — and NOT the op log.
// That is deliberate and it is the honest choice: the logs are allowed to differ (the
// batcher coalesces, so my log has 60 drag samples and yours has one), and a test that
// compared logs would be testing an implementation detail while a test that compares
// documents is testing the thing the user has.
//
// WHAT THIS FUZZ ACTUALLY FOUND — all three were real, all three are fixed, and every one
// of them was invisible on the healthy transport:
//
//   1. THE CAUSAL DROP. A reordered `set` that overtakes its `add` is logged, STAMPS its
//      LWW register, and then evaporates in `applyOp` (no such node). It is then
//      permanently unrecoverable: the log de-duplicates a re-delivery, and the register it
//      already owns now REFUSES it as superseded — by itself. One reordered packet, one
//      node stuck at its birth position forever. → `causal-buffer.ts`.
//   2. THE FRONTIER HOLE. Anti-entropy driven by a max-clock vector reports "fully caught
//      up" across a gap, because a Lamport clock is not contiguous. → the digest in
//      `version-vector.ts`.
//   3. THE LOCAL-ADD HANG. The causal buffer knew about entities a PEER added and entities
//      already on the diagram — but not entities THIS peer created. So a peer's edit to a
//      node I made was held for an `add` that could never arrive (mine is the only one, it
//      is already in my log, and their anti-entropy correctly declines to echo it back). My
//      node freezes where I made it, they watch it move, and the documents differ forever —
//      over the most ordinary interaction in a collaborative editor. → `CausalBuffer.noteLocal`.
//
// AND ONE IT DELIBERATELY DOES *NOT* CATCH, which is worth stating rather than pretending:
// feeding DUPLICATE ops into the frontier (instead of only the ops the log accepted as NEW)
// inflates `count`, fakes a hole, and makes every sync round resend an actor's whole
// history. The document still CONVERGES — over-sending is free — so no convergence oracle
// can see it. It is a traffic amplifier, not a correctness bug, and it is caught by a
// different assertion: "on a healthy channel, anti-entropy must never repair"
// (sync-adapter.spec.ts). Mutation-tested: that test goes red, this fuzz stays green, and
// that is the correct division of labour.
//
// A NOTE ON `heal()`. Convergence under PERMANENT, TOTAL loss is impossible — an op that is
// never delivered by any route at any time cannot be merged, and nothing in the literature
// claims otherwise. So the honest shape is: be savage while they edit, then heal, then run
// anti-entropy, THEN assert. The savagery creates the holes. The healing lets the repair
// prove it can close them. A fuzz that never heals is a fuzz whose assertion is
// unreachable, and would pass with the whole sync layer deleted.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { Replica } from '../collab/replica';
import { replay } from '../collab/op-log';
import type { Op } from '../collab/op';
import { createSyncSession, type SyncAdapter } from './sync-adapter';
import { UnreliableHub, mulberry32 } from './transports/unreliable';
import { MemoryHub } from './transports/memory';

/** Deterministic node — no ambient ids, or the two peers could never be byte-identical. */
function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 100, height: 50 },
  });
  (n as unknown as { id: string }).id = id;
  return n;
}

function link(id: string, from: string, to: string): LinkModel {
  const l = new LinkModel(from, to, 'direct');
  (l as unknown as { id: string }).id = id;
  return l;
}

/**
 * THE ORACLE — and exactly two things it does not compare, both of them argued for.
 *
 * ---------------------------------------------------------------------------
 * (1) `version` — INHERITED FROM CARD 0, whose reasoning stands unchanged.
 * ---------------------------------------------------------------------------
 * It counts how many times THIS REPLICA mutated the entity. Two peers that correctly
 * converge still differ by one wherever LWW refused a superseded write: the winner's peer
 * applied two writes, the loser's applied one, and REFUSING that write is precisely what
 * made them converge. Forcing the counter to agree would mean applying writes we correctly
 * rejected — breaking convergence to make a counter match.
 *
 * ---------------------------------------------------------------------------
 * (2) ENTITY ARRAY ORDER — A REAL BUG. FOUND BY THIS FUZZ. **NOT FIXED HERE**, BECAUSE
 *     THE FIX IS NOT IN THIS CARD'S FILES.
 * ---------------------------------------------------------------------------
 * This is not a nuance, and it is not a cop-out; it is a genuine defect in the OP FORMAT,
 * and I am scoping the oracle around it in the open rather than quietly sorting and saying
 * nothing.
 *
 * `DiagramModel` stores entities in a `Map`, and `serialize()` emits them in INSERTION
 * order. Insertion order is ARRIVAL order, and arrival order is the network's business.
 * Two peers who concurrently add nodes therefore converge on identical CONTENT in a
 * different SEQUENCE:
 *
 *     Alice adds A (local, immediate) … later receives B  →  [A, B]
 *     Bob   adds B (local, immediate) … later receives A  →  [B, A]
 *
 * Same nodes. Same positions. Same everything. Different array. And an entity array is not
 * cosmetic — for an SVG renderer it is PAINT ORDER, so two overlapping nodes can stack
 * differently for two users looking at "the same" converged document. It also means two
 * peers who save produce byte-different files.
 *
 * WHY I DID NOT FIX IT. An `add` op carries no ordering information at all — no index, no
 * sequence, nothing — and LWW's presence register is a boolean, not a position. Making
 * order converge needs EITHER an ordering key on the op (`op.ts`) or a canonical sort in
 * the reducer (`apply-op.ts`) or in `serialize()` (`DiagramModel`). All three are outside
 * this card: `collab/**` belongs to wave9/crdt and the models are shared. Reaching in to
 * patch them from the transport layer would be exactly the kind of cross-boundary fix that
 * makes a merge conflict out of a bug report. It is written up in the wave report; the
 * cheap fix is a canonical sort by (creating clock, actor) at apply time.
 *
 * `ordered-add.spec.ts`-style proof: `THE ORDER GAP` below reproduces it in nine lines,
 * with no fuzz and no transport, so it is on the record as a failing property of the op
 * format rather than a footnote in a test helper.
 *
 * WHAT THE ORACLE THEREFORE IS: every entity, by id, with every property — a set
 * comparison, not a sequence one. It still catches a missing node, an extra node, a lost
 * label, a stale position, a resurrected delete, and every other real divergence. It is
 * narrower than byte-equality by exactly one known, named, reproduced defect.
 */
function canonical(d: DiagramModel): unknown {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !['version', 'selected', 'hovered', 'highlighted', 'focused'].includes(k))
          .map(([k, val]) => [k, strip(val)])
      );
    }
    return v;
  };

  // THE id-SORT IS GONE, AND ITS REMOVAL IS THE POINT. It was a workaround for the order
  // gap — entity order did not converge, so the oracle sorted the difference away. Now that
  // wave9/crdt derives a canonical order from the presence stamps, sorting here would be a
  // BLINDFOLD: it would hide the exact regression the order fix exists to prevent. The
  // oracle compares sequences again, as it always should have.
  return strip(d.serialize());
}

function doc(a: SyncAdapter): string {
  return JSON.stringify(canonical(a.diagram));
}

interface Peer {
  adapter: SyncAdapter;
  diagram: DiagramModel;
}

// ---------------------------------------------------------------------------
// THE SHARED DOCUMENT.
//
// Two peers cannot be byte-identical unless they start byte-identical, and two separately
// CONSTRUCTED DiagramModels never are: every node mints a fresh uuid and a fresh set of
// default ports with fresh ids. So the seed is built ONCE, captured as ops, and REPLAYED
// into each peer — which is how a real peer gets a document anyway (it receives it), and
// which makes every id in it identical on both sides by construction.
// ---------------------------------------------------------------------------
const SEED: { name: string; id: string; uuid: string; ops: Op[] } = (() => {
  const base = new DiagramModel('shared');
  const ops: Op[] = [];
  const seeder = new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), {
    actor: 'seed',
    onLocalOp: (o) => ops.push(o),
  });
  seeder.diagram.addNode(node('n1', 0, 0));
  seeder.diagram.addNode(node('n2', 200, 0));
  seeder.diagram.addNode(node('n3', 400, 0));
  seeder.dispose();
  return { name: base.name, id: base.id, uuid: base.uuid, ops };
})();

/** A peer's starting document: the same bytes, on every peer, every trial. */
function seedDiagram(): DiagramModel {
  const d = new DiagramModel(SEED.name, { id: SEED.id, uuid: SEED.uuid });
  // Replayed BEFORE the session exists, so these ops are in nobody's log and nobody's
  // frontier — exactly like a document loaded from disk that predates the session.
  replay(d, SEED.ops);
  return d;
}

function peer(hub: MemoryHub, actor: string): Peer {
  const diagram = seedDiagram();
  const adapter = createSyncSession(diagram, hub.connect(actor), {
    actor,
    // Manual batching: the fuzz decides when a batch goes out, so nothing races a timer.
    // The batcher's COALESCING still runs on every flush — this turns off the clock, not
    // the logic under test.
    batch: { intervalMs: 1_000_000, maxBatch: 10_000 },
  });
  adapter.join();
  return { adapter, diagram };
}

/**
 * One random edit. Every branch is a DIFFERENT KIND of conflict, and that spread is the
 * point — a fuzz that only moves nodes never exercises presence races or causal
 * dependencies, and would miss all three bugs listed at the top of this file.
 */
function randomEdit(d: DiagramModel, rand: () => number, tag: string, seq: number): void {
  const nodes = d.getNodes();
  const roll = rand();

  if (roll < 0.35 && nodes.length > 0) {
    // The classic: concurrent writes to the SAME register. LWW must pick one, everywhere.
    const n = nodes[Math.floor(rand() * nodes.length)];
    n.setPosition(Math.floor(rand() * 500), Math.floor(rand() * 500));
    return;
  }
  if (roll < 0.55 && nodes.length > 0) {
    // A DIFFERENT register on the same entity. Both edits must SURVIVE — this is the one
    // whole-entity LWW silently destroys, and the reason ops are per-property.
    const n = nodes[Math.floor(rand() * nodes.length)];
    n.setMetadata('label', `${tag}-${seq}`);
    return;
  }
  if (roll < 0.7) {
    // An ADD, whose id is unique per peer. Its `set`s depend on it having arrived — this
    // is the branch that manufactures the causal-readiness case.
    const id = `${tag}-node-${seq}`;
    d.addNode(node(id, Math.floor(rand() * 500), Math.floor(rand() * 500)));
    return;
  }
  if (roll < 0.8 && nodes.length > 1) {
    const n = nodes[Math.floor(rand() * nodes.length)];
    n.setSize(50 + Math.floor(rand() * 200), 30 + Math.floor(rand() * 100));
    return;
  }
  if (roll < 0.9 && nodes.length > 2) {
    // A REMOVE, racing everyone else's writes to the entity being removed.
    const n = nodes[Math.floor(rand() * nodes.length)];
    d.removeNode(n.id);
    return;
  }
  // A link: an entity whose very existence references two others.
  const id = `${tag}-link-${seq}`;
  if (nodes.length > 1 && !d.getLink(id)) {
    const a = nodes[Math.floor(rand() * nodes.length)];
    const b = nodes[Math.floor(rand() * nodes.length)];
    if (a.id !== b.id) d.addLink(link(id, a.id, b.id));
  }
}

describe('HOSTILE TRANSPORT — two peers, a channel that drops, duplicates, reorders and delays', () => {
  const TRIALS = 60;
  const EDITS = 24;

  // Aggregated across the whole run: if the faults never fired, the fuzz proved nothing.
  const totals = { dropped: 0, duplicated: 0, delayed: 0, repairs: 0, held: 0, dupOps: 0 };

  for (let trial = 0; trial < TRIALS; trial++) {
    it(`converges — seed ${trial}`, () => {
      const rand = mulberry32(1000 + trial);
      const hub = new UnreliableHub({
        seed: 5000 + trial,
        dropRate: 0.25,
        duplicateRate: 0.2,
        delayRate: 0.4,
      });

      const alice = peer(hub, 'alice');
      const bob = peer(hub, 'bob');

      // ---- the storm: both peers edit, blind, through a broken channel -------------
      for (let i = 0; i < EDITS; i++) {
        randomEdit(alice.diagram, rand, 'a', i);
        randomEdit(bob.diagram, rand, 'b', i);

        // Flush whenever the dice say so, so batches are of random sizes and boundaries
        // land in random places — a fixed flush cadence would only ever test one shape.
        if (rand() < 0.5) alice.adapter.flush();
        if (rand() < 0.5) bob.adapter.flush();

        // Release SOME of the in-flight queue, out of order. This is what makes a `set`
        // overtake its `add`.
        if (rand() < 0.6) hub.step(rand());

        // A partition. Both sides keep editing; neither hears a thing.
        if (rand() < 0.08) {
          alice.adapter['transport'].disconnect();
          for (let k = 0; k < 3; k++) randomEdit(alice.diagram, rand, 'a', 100 + i * 10 + k);
          alice.adapter['transport'].connect(); // → status 'connected' → announce() → sync
        }
      }

      // ---- the network recovers ----------------------------------------------------
      alice.adapter.flush();
      bob.adapter.flush();
      hub.heal();
      hub.settle();

      // ---- anti-entropy: find everything the storm lost -----------------------------
      // Rounds, not one shot: a sync answer can itself reveal a hole (a repaired op from
      // Alice teaches Bob about an entity whose `set`s he was holding), and each round is
      // cheap. It reaches a fixed point in 2-3; 6 is headroom, not hope.
      for (let round = 0; round < 6; round++) {
        alice.adapter.sync();
        bob.adapter.sync();
        hub.settle();
        alice.adapter.flush();
        bob.adapter.flush();
        hub.settle();
      }

      // ---- THE ORACLE ---------------------------------------------------------------
      expect(doc(bob.adapter)).toEqual(doc(alice.adapter));

      // Nothing may be left stranded in the causal buffer. A held op is an edit that has
      // been received and NOT applied — if any survive to here, some `add` never arrived
      // and the document is quietly missing work that a peer believes it delivered.
      expect(alice.adapter.pendingOps).toEqual([]);
      expect(bob.adapter.pendingOps).toEqual([]);

      totals.dropped += hub.faults.dropped;
      totals.duplicated += hub.faults.duplicated;
      totals.delayed += hub.faults.delayed;
      totals.repairs += alice.adapter.stats.repairs + bob.adapter.stats.repairs;
      totals.held += alice.adapter.stats.opsHeld + bob.adapter.stats.opsHeld;
      totals.dupOps += alice.adapter.stats.opsDuplicate + bob.adapter.stats.opsDuplicate;

      alice.adapter.dispose();
      bob.adapter.dispose();
    });
  }

  // ---------------------------------------------------------------------------
  // A GREEN FUZZ PROVES NOTHING IF THE FAULTS NEVER FIRED.
  //
  // This is the guard against the most embarrassing possible outcome: a chaos test that
  // passes a thousand trials because the chaos was misconfigured and the channel was
  // quietly perfect the whole time. Each assertion below names a fault, and every one of
  // them is a code path in the sync layer that would otherwise be dead.
  // ---------------------------------------------------------------------------
  it('…and the network really was hostile (a green fuzz over a healthy channel is a lie)', () => {
    expect(totals.dropped).toBeGreaterThan(50); // messages that simply vanished
    expect(totals.duplicated).toBeGreaterThan(20); // …and ones delivered twice
    expect(totals.delayed).toBeGreaterThan(100); // …and ones that arrived out of order
    expect(totals.dupOps).toBeGreaterThan(20); // duplicate OPS actually reached the log
    expect(totals.repairs).toBeGreaterThan(0); // ← the frontier really did find a HOLE
  });
});

// ===========================================================================
// THE ORDER GAP — FIXED AT MERGE by wave9/crdt, and this test is INVERTED to guard it.
//
// It was written to put a real defect ON THE RECORD rather than hide it in a test helper:
// an `add` op carried no ordering information, so two peers who each added a node while the
// other was mid-thought converged on CONTENT and disagreed on ARRAY ORDER — which, for an
// SVG renderer, is PAINT ORDER. Two overlapping nodes stacked differently for two people
// looking at the same converged document, and two saves of it differed byte for byte.
//
// wave9/crdt derives a CANONICAL ORDER from the presence stamps the LWW registry already
// keeps, so the order is a function of the ops rather than of the sequence in which each
// peer happened to hear about them.
// ===========================================================================
describe('entity ORDER converges too — because array order is PAINT order', () => {
  it('two peers agree on entity order after concurrent adds', () => {
    const hub = new MemoryHub(); // a PERFECT channel. No chaos. This was never a network bug.
    const alice = peer(hub, 'alice');
    const bob = peer(hub, 'bob');

    // Each adds a node while the other is mid-thought — the ordinary case, not a rare one.
    alice.diagram.addNode(node('zzz-from-alice', 10, 10));
    bob.diagram.addNode(node('aaa-from-bob', 20, 20));
    alice.adapter.flush();
    bob.adapter.flush();

    expect(doc(alice.adapter)).toEqual(doc(bob.adapter)); // content converged…

    const order = (p: Peer) => p.diagram.getNodes().map((n) => n.id);
    expect(order(alice)).toEqual(order(bob)); // …AND SO DID ORDER

    // …which means both users see the same node on top, and two saves are byte-identical
    // (bar the per-replica version counters, which are not the document).
    alice.adapter.dispose();
    bob.adapter.dispose();
  });
});

describe('HOSTILE TRANSPORT — three peers, so the delta has to be right per ACTOR', () => {
  it('converges with three concurrent editors and a partition', () => {
    const rand = mulberry32(77);
    const hub = new UnreliableHub({ seed: 99, dropRate: 0.3, duplicateRate: 0.25, delayRate: 0.45 });

    const peers = ['alice', 'bob', 'carol'].map((a) => peer(hub, a));

    for (let i = 0; i < 40; i++) {
      for (const p of peers) randomEdit(p.diagram, rand, p.adapter.actor[0], i);
      for (const p of peers) if (rand() < 0.5) p.adapter.flush();
      if (rand() < 0.7) hub.step(rand());

      if (rand() < 0.1) {
        const victim = peers[Math.floor(rand() * peers.length)];
        victim.adapter['transport'].disconnect();
        randomEdit(victim.diagram, rand, victim.adapter.actor[0], 500 + i);
        victim.adapter['transport'].connect();
      }
    }

    for (const p of peers) p.adapter.flush();
    hub.heal();
    hub.settle();

    for (let r = 0; r < 8; r++) {
      for (const p of peers) p.adapter.sync();
      hub.settle();
      for (const p of peers) p.adapter.flush();
      hub.settle();
    }

    const first = doc(peers[0].adapter);
    for (const p of peers) {
      expect(doc(p.adapter)).toEqual(first);
      expect(p.adapter.pendingOps).toEqual([]);
      p.adapter.dispose();
    }
  });
});
