// Wave 9 — Card 1 VERIFICATION, before any claim is made about it.
//
// The card asks for two things. They are in very different states, and the honest thing is
// to test rather than assert:
//
//   A. Every node/link/port carries a DURABLE uuid that survives a save/load round-trip.
//   B. A saved document is "a snapshot checkpoint PLUS AN OP-LOG TAIL".
//
// And there is a third thing neither the card nor I asked for, which two separate agents
// flagged independently: two peers holding the SAME CONVERGED DOCUMENT produce different
// bytes when they save it.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';
import { Replica } from '../collab/replica';
import { checksumOf } from './DocumentEnvelope';
import {
  saveDocument,
  loadDocument,
  documentChecksumOf,
  sameDocument,
} from './PersistedDocument';
import type { Op } from '../collab/op';

function node(id: string, x = 0, y = 0): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  return n;
}

describe('Card 1 (A): stable identity — VERIFY, do not assume', () => {
  it('every node, link and port keeps its uuid across a save/load round-trip', () => {
    const d = new DiagramModel('doc');
    d.addNode(node('a'));
    d.addNode(node('b'));
    const link = new LinkModel('a-out', 'b-in', 'orthogonal');
    (link as unknown as { id: string }).id = 'l1';
    d.addLink(link);

    const before = d.serialize();
    const after = DiagramModel.fromJSON(JSON.parse(JSON.stringify(before))).serialize();

    expect(after.uuid).toBe(before.uuid);
    expect(after.nodes.map((n) => n.uuid)).toEqual(before.nodes.map((n) => n.uuid));
    expect(after.links.map((l) => l.uuid)).toEqual(before.links.map((l) => l.uuid));
    expect(after.nodes[0].ports.map((p) => p.uuid)).toEqual(before.nodes[0].ports.map((p) => p.uuid));

    // …and none of them is empty, which is the way this silently fails.
    for (const n of after.nodes) expect(n.uuid).toBeTruthy();
    for (const p of after.nodes[0].ports) expect(p.uuid).toBeTruthy();
  });
});

describe('Card 1 (C): THE BUG — two peers, one converged document, two different files', () => {
  it('saves DIVERGE across peers that hold the identical document', () => {
    // Flagged independently by wave9/comments AND wave9/sync. `version` is a per-replica
    // MUTATION COUNTER: when two peers race a register, the winner applies two writes and
    // the loser applies one (its remote is refused — which is precisely what makes them
    // converge). So the counters legitimately differ… and they are IN THE SAVED BYTES.
    //
    // Consequence: two people who agree completely about a diagram cannot agree that they
    // agree. A checksum comparison — the thing a sync server, a cache, or an "is this the
    // same document?" check would naturally do — reports a MISMATCH on identical content.
    const engineA = new DiagramEngine();
    const docA = engineA.createDiagram('shared')!;
    const opsA: Op[] = [];
    const alice = new Replica(docA, { actor: 'alice', onLocalOp: (o) => opsA.push(o) });

    const bob = new Replica(new DiagramModel('shared', { id: docA.id, uuid: docA.uuid }), {
      actor: 'bob',
    });

    docA.addNode(node('n1'));
    bob.receive(opsA.splice(0));

    // Both write the SAME register concurrently. One wins; both converge on the value.
    const opsB: Op[] = [];
    const bob2 = new Replica(bob.diagram, { actor: 'bob2', onLocalOp: (o) => opsB.push(o) });
    docA.getNode('n1')!.setPosition(10, 10);
    bob2.diagram.getNode('n1')!.setPosition(99, 99);

    bob2.receive(opsA.splice(0));
    alice.receive(opsB.splice(0));

    // They agree about the diagram…
    expect(docA.getNode('n1')!.position).toEqual(bob2.diagram.getNode('n1')!.position);

    // …and their SAVED FILES disagree. This is the defect.
    expect(checksumOf(docA.serialize())).not.toEqual(checksumOf(bob2.diagram.serialize()));

    alice.dispose();
    bob.dispose();
    bob2.dispose();
    engineA.destroy();
  });
});

// ===========================================================================
describe('Card 1 (B): snapshot + op-log tail — and the collaborator who silently vanishes', () => {
  // ===========================================================================
  // THE BUG THIS CARD EXISTS TO PREVENT, and it is not the one the card describes.
  //
  // A saved document used to be a snapshot and nothing else — `SerializedDiagram` has no ops
  // field. The snapshot is COMPLETE, so reopening it looks fine: every node, every link,
  // every property is there.
  //
  // But a peer that reopens it has no Lamport clock. It restarts at 0. Its very first edit
  // mints op id `1@alice` — an id that ALREADY EXISTS in every other peer's log, from the
  // first edit of the previous session. `OpLog.append()` de-duplicates on exactly that id.
  //
  // So the op is SILENTLY DROPPED. It shows on Alice's own screen (it was applied locally)
  // and reaches nobody. And it is not one op: every op she issues for the rest of the
  // session collides with one from her last session and vanishes the same way. Alice edits
  // happily for an hour, and nothing she does is real. No error. No warning. Nothing in the
  // document is corrupt — she has simply stopped existing to everyone else.
  //
  // You cannot rebuild the clock from a snapshot: a snapshot has no clocks in it. That is
  // what the tail is for, and it is the reason this card is not "nice-to-have persistence".

  function peerFor(doc: DiagramModel, actor: string, sink: Op[]): Replica {
    return new Replica(doc, { actor, onLocalOp: (o) => sink.push(o) });
  }

  it('a reloaded peer resumes its CLOCK — or every edit it makes vanishes', () => {
    const aliceOps: Op[] = [];
    const docA = new DiagramModel('shared');
    const alice = peerFor(docA, 'alice', aliceOps);

    const bob = new Replica(new DiagramModel('shared', { id: docA.id, uuid: docA.uuid }), {
      actor: 'bob',
    });

    // A first session: Alice adds a node; Bob sees it.
    docA.addNode(node('n1', 5, 5));
    bob.receive(aliceOps.splice(0));
    expect(bob.diagram.getNode('n1')).toBeDefined();

    // Alice saves and closes the tab.
    const saved = saveDocument(alice);
    alice.dispose();
    expect(saved.log!.clock).toBeGreaterThan(0); // the watermark is IN the file

    // …and reopens it tomorrow.
    const reopenedOps: Op[] = [];
    const alice2 = loadDocument(saved, { actor: 'alice', onLocalOp: (o) => reopenedOps.push(o) });

    // She makes an edit. THIS is the op that used to vanish.
    alice2.diagram.getNode('n1')!.setPosition(400, 400);
    expect(reopenedOps).toHaveLength(1);

    // Its id must not collide with one from the previous session…
    const oldIds = new Set(bob.history().map((o) => `${o.clock}@${o.actor}`));
    expect(oldIds.has(`${reopenedOps[0].clock}@${reopenedOps[0].actor}`)).toBe(false);

    // …and it must actually REACH Bob, who never left.
    bob.receive(reopenedOps);
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 400, y: 400 });

    alice2.dispose();
    bob.dispose();
  });

  it('THE CONTROL: restart the clock at 0 and the edit is silently swallowed', () => {
    // Proof that the fix above is load-bearing and not decoration. This is exactly what
    // reopening a snapshot-only document did.
    const aliceOps: Op[] = [];
    const docA = new DiagramModel('shared');
    const alice = peerFor(docA, 'alice', aliceOps);
    const bob = new Replica(new DiagramModel('shared', { id: docA.id, uuid: docA.uuid }), {
      actor: 'bob',
    });

    docA.addNode(node('n1', 5, 5));
    bob.receive(aliceOps.splice(0));
    const saved = saveDocument(alice);
    alice.dispose();

    // Reopen WITHOUT the watermark — the old behaviour.
    const naiveOps: Op[] = [];
    const naive = new Replica(DiagramModel.fromJSON(saved.document), {
      actor: 'alice',
      onLocalOp: (o) => naiveOps.push(o),
    });

    naive.diagram.getNode('n1')!.setPosition(400, 400);
    expect(naiveOps).toHaveLength(1);

    // Bob's log has ALREADY SEEN `1@alice` — from her first edit, yesterday.
    const accepted = bob.receive(naiveOps);
    expect(accepted).toHaveLength(0); // …so it is de-duplicated into oblivion
    expect(bob.diagram.getNode('n1')!.position).not.toMatchObject({ x: 400, y: 400 });

    // Alice sees her own move. Bob never will. Nothing anywhere reports a problem.
    expect(naive.diagram.getNode('n1')!.position).toMatchObject({ x: 400, y: 400 });

    naive.dispose();
    bob.dispose();
  });

  it('adopting the tail does not re-apply it — reopening a file is not an edit', () => {
    const ops: Op[] = [];
    const doc = new DiagramModel('shared');
    const alice = peerFor(doc, 'alice', ops);
    doc.addNode(node('n1', 5, 5));
    doc.getNode('n1')!.setPosition(50, 50);

    const saved = saveDocument(alice);
    alice.dispose();

    const reopened = loadDocument(saved, { actor: 'alice' });

    // The log and the stamps are seeded (so a straggler is still refused, and a duplicate
    // is still recognised)…
    expect(reopened.history()).toHaveLength(saved.log!.ops.length);
    expect(reopened.receive(saved.log!.ops)).toHaveLength(0); // already known

    // …but the model was NOT touched: the version counters are the snapshot's, not the
    // snapshot's plus a replay.
    expect(reopened.diagram.serialize().nodes[0].version).toBe(
      saved.document.nodes[0].version
    );

    reopened.dispose();
  });

  it('a LEGACY document with no tail still loads (forward migration)', () => {
    const doc = new DiagramModel('legacy');
    doc.addNode(node('n1'));

    // Exactly what a pre-Card-1 save looks like: a snapshot, no log.
    const legacy = { schemaVersion: 1, document: doc.serialize() };

    const replica = loadDocument(legacy, { actor: 'alice' });
    expect(replica.diagram.getNode('n1')).toBeDefined();
    expect(replica.history()).toHaveLength(0);

    // And it is SAFE at clock 0, precisely because there is no log for it to collide with.
    replica.diagram.getNode('n1')!.setPosition(9, 9);
    expect(replica.clock).toBeGreaterThan(0);
    replica.dispose();
  });
});

describe('Card 1 (C, fixed): two peers that agree can now PROVE they agree', () => {
  it('documentChecksumOf is equal across converged peers; checksumOf is not', () => {
    const engineA = new DiagramEngine();
    const docA = engineA.createDiagram('shared')!;
    const opsA: Op[] = [];
    const alice = new Replica(docA, { actor: 'alice', onLocalOp: (o) => opsA.push(o) });
    const bob = new Replica(new DiagramModel('shared', { id: docA.id, uuid: docA.uuid }), {
      actor: 'bob',
    });

    docA.addNode(node('n1'));
    bob.receive(opsA.splice(0));

    const opsB: Op[] = [];
    const bob2 = new Replica(bob.diagram, { actor: 'bob2', onLocalOp: (o) => opsB.push(o) });
    docA.getNode('n1')!.setPosition(10, 10);
    bob2.diagram.getNode('n1')!.setPosition(99, 99);
    bob2.receive(opsA.splice(0));
    alice.receive(opsB.splice(0));

    // The two answer DIFFERENT questions, and both answers are correct.
    expect(checksumOf(docA.serialize())).not.toEqual(checksumOf(bob2.diagram.serialize()));
    expect(documentChecksumOf(docA.serialize())).toEqual(
      documentChecksumOf(bob2.diagram.serialize())
    );
    expect(sameDocument(docA.serialize(), bob2.diagram.serialize())).toBe(true);

    alice.dispose();
    bob.dispose();
    bob2.dispose();
    engineA.destroy();
  });

  it('…and it still notices a REAL difference', () => {
    // The guard against the obvious failure of a content checksum: stripping so much that it
    // stops distinguishing documents at all.
    const a = new DiagramModel('d');
    a.addNode(node('n1'));
    const b = new DiagramModel('d', { id: a.id, uuid: a.uuid });
    b.addNode(node('n1'));
    b.getNode('n1')!.setPosition(1, 0); // one pixel

    expect(sameDocument(a.serialize(), b.serialize())).toBe(false);
  });
});
