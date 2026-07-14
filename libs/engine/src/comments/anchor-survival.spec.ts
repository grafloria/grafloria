// Wave 9 — Card 6: THE ANCHOR MUST SURVIVE.
//
// The whole card lives or dies here. A comment that detaches from what it was about is
// not a degraded comment — it is a LIE WITH A TIMESTAMP ON IT, and it is worse than no
// comment at all, because a reader will believe it.
//
// Four things can happen to a comment's subject. This file proves what happens to the
// comment in each:
//
//   THE NODE MOVES     → the pin follows it, and NOT ONE OP is emitted to make that
//                        happen. (Position is derived. Derived state is never synced.)
//   THE NODE IS DELETED→ the thread SURVIVES, orphaned, drawn where its subject last
//                        was, still saying what it was about.
//   THE NODE COMES BACK→ it RE-ATTACHES, instantly, with no op and no code. (Because
//                        `attached` is derived, not stored — the argument is in
//                        comment-store.ts and this is the proof.)
//   IT WAS NEVER A NODE→ a free-region thread is in WORLD coordinates, so pan and zoom
//                        cannot move it relative to the diagram.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { Replica, type Op } from '../collab';
import { CommentStore } from './comment-store';

function node(id: string, x: number, y: number, label: string): NodeModel {
  const n = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 100, height: 50 },
  });
  (n as unknown as { id: string }).id = id;
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.setMetadata('label', label);
  return n;
}

function session(actor: string) {
  const diagram = new DiagramModel('doc', { id: 'doc', uuid: 'doc-uuid' });
  diagram.addNode(node('n1', 100, 100, 'Payment gateway'));
  const outbox: Op[] = [];
  const replica = new Replica(diagram, { actor, onLocalOp: (o) => outbox.push(o) });
  let n = 0;
  const store = new CommentStore(diagram, {
    viewer: actor,
    idFactory: () => `${actor}${++n}`,
    now: (() => {
      let t = 1_700_000_000_000;
      return () => ++t;
    })(),
  });
  outbox.length = 0;
  return { diagram, replica, store, outbox };
}

describe('anchor survival — a node that MOVES', () => {
  it('the pin follows the node, and syncs NOTHING to make it happen', () => {
    const { diagram, store, outbox } = session('alice');
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'why here?');

    // Pin at the node's top-right corner.
    expect(store.thread(tid)!.resolvedAnchor.point).toEqual({ x: 200, y: 100 });

    const opsBefore = outbox.length;
    diagram.getNode('n1')!.setPosition(900, 640);

    // The pin moved with the node…
    expect(store.thread(tid)!.resolvedAnchor.point).toEqual({ x: 1000, y: 640 });

    // …and the only op emitted was the node's own position. The COMMENT said nothing.
    // Anchoring by coordinates would have had to broadcast a new pin position on every
    // drag frame; anchoring by identity broadcasts nothing, ever.
    const commentOps = outbox
      .slice(opsBefore)
      .filter((o) => (o as { path?: string }).path?.startsWith('comments'));
    expect(commentOps).toHaveLength(0);
  });

  it('survives an auto-layout that moves EVERY node — which is what kills a coordinate anchor', () => {
    const { diagram, store } = session('alice');
    diagram.addNode(node('n2', 400, 100, 'Ledger'));
    const t1 = store.createThread({ kind: 'node', id: 'n1' }, 'about the gateway');
    const t2 = store.createThread({ kind: 'node', id: 'n2' }, 'about the ledger');

    // A layout run: the two nodes swap places. A comment pinned to COORDINATES would now
    // be a comment about the other node — still there, still timestamped, and completely
    // wrong. Anchored by identity, each one goes where its subject went.
    diagram.getNode('n1')!.setPosition(400, 100);
    diagram.getNode('n2')!.setPosition(100, 100);

    expect(store.thread(t1)!.resolvedAnchor.targetLabel).toBe('Payment gateway');
    expect(store.thread(t1)!.resolvedAnchor.point).toEqual({ x: 500, y: 100 });
    expect(store.thread(t2)!.resolvedAnchor.targetLabel).toBe('Ledger');
    expect(store.thread(t2)!.resolvedAnchor.point).toEqual({ x: 200, y: 100 });
  });
});

describe('anchor survival — a node that is DELETED', () => {
  it('the CONVERSATION SURVIVES: orphaned, readable, replyable, and honest about it', () => {
    const { diagram, store } = session('alice');
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'we cut this in March, no?');
    store.reply(tid, 'we did. deleting.');

    diagram.removeNode('n1');

    const t = store.thread(tid);
    expect(t).toBeDefined(); // ← the whole card. A delete is not a censor.
    expect(t!.messages).toHaveLength(2);
    expect(t!.resolvedAnchor.attached).toBe(false); // …and it does not PRETEND to be attached
    expect(t!.resolvedAnchor.targetLabel).toBe('Payment gateway'); // it still says what it was about
    expect(store.orphans().map((o) => o.id)).toEqual([tid]);

    // Still a conversation: you can reply to an orphan. (You must be able to — the reply
    // is very often "…and here is what we replaced it with".)
    store.reply(tid, 'replacement is n7');
    expect(store.thread(tid)!.messages).toHaveLength(3);
  });

  it('the ghost pin sits where the node LAST WAS, not where it was when the thread began', () => {
    const { diagram, store } = session('alice');
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');
    expect(store.thread(tid)!.resolvedAnchor.point).toEqual({ x: 200, y: 100 });

    // The node is dragged far away, and only THEN deleted. The anchor's op-borne fallback
    // still says (200,100) — an hour out of date. A peer that watched it move knows
    // better, and knowing better costs zero bytes on the wire.
    diagram.getNode('n1')!.setPosition(900, 640);
    store.thread(tid); // a frame renders: this peer observes where the node now is
    diagram.removeNode('n1');

    const t = store.thread(tid)!;
    expect(t.resolvedAnchor.attached).toBe(false);
    expect(t.resolvedAnchor.point).toEqual({ x: 1000, y: 640 }); // where it actually was
  });

  it('a peer that NEVER SAW the node alive falls back to the anchor snapshot — the best anyone can know', () => {
    const A = session('alice');
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'x');
    A.diagram.removeNode('n1');

    // Carol joins after the fact, from the log alone, on an empty document.
    const carolDiagram = new DiagramModel('doc', { id: 'doc', uuid: 'doc-uuid' });
    const carol = new Replica(carolDiagram, { actor: 'carol' });
    carol.receive(A.replica.history() as Op[]);
    const store = new CommentStore(carolDiagram, { viewer: 'carol' });

    const t = store.thread(tid)!;
    expect(t).toBeDefined();
    expect(t.resolvedAnchor.attached).toBe(false);
    expect(t.resolvedAnchor.point).toEqual({ x: 200, y: 100 }); // the obituary in the anchor
    expect(t.resolvedAnchor.targetLabel).toBe('Payment gateway');
    store.dispose();
  });

  it('RE-ATTACHES for free when the node comes back — undo, or a CRDT that lets an add win', () => {
    const { diagram, store } = session('alice');
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');

    const snapshot = diagram.getNode('n1')!.serialize();
    diagram.removeNode('n1');
    expect(store.thread(tid)!.resolvedAnchor.attached).toBe(false);

    // Ctrl-Z. (Or: Card 4 lands on observed-remove and a concurrent add survives a delete
    // that never saw it. Or: someone re-imports the node from a template. The thread does
    // not know or care WHY — it re-attaches because `attached` is DERIVED from the live
    // diagram, so it cannot be out of step with it.)
    diagram.restoreNode(snapshot);

    const t = store.thread(tid)!;
    expect(t.resolvedAnchor.attached).toBe(true);
    expect(t.resolvedAnchor.point).toEqual({ x: 200, y: 100 });
    expect(t.messages).toHaveLength(1);
  });

  it('MUTATION CONTROL: a STORED orphan flag would have to be un-set, and nothing would un-set it', () => {
    // Break the mechanism and watch it go wrong — otherwise the test above is theatre.
    //
    // This is the design I did NOT ship: an `orphaned` flag written into the document when
    // the node dies. Here it is, faithfully, so its failure is visible rather than
    // theoretical.
    const { diagram, store } = session('alice');
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');

    const snapshot = diagram.getNode('n1')!.serialize();
    diagram.removeNode('n1');
    // …the stored-flag design writes the fact down:
    diagram.writeCommentRegister(`${tid}.orphaned`, true);

    diagram.restoreNode(snapshot); // undo

    // The DERIVED answer is correct: the node is right there.
    expect(store.thread(tid)!.resolvedAnchor.attached).toBe(true);
    // The STORED answer now contradicts the document it describes, and it will keep
    // contradicting it until some peer notices and emits a second op — which is a race
    // in itself, and which is why derived state is the only sound answer here.
    expect(diagram.readCommentRegister(`${tid}.orphaned`)).toBe(true);
  });
});

describe('anchor survival — a FREE REGION', () => {
  it('is in WORLD coordinates, so pan and zoom cannot move it relative to the diagram', () => {
    const { diagram, store } = session('alice');
    const tid = store.createThread(
      { kind: 'region', x: 640, y: 480, width: 200, height: 120 },
      'this whole area needs a rethink'
    );

    const before = store.thread(tid)!.resolvedAnchor.point;

    // The user scrolls to the far side of the canvas and zooms out.
    diagram.viewport = { x: 5000, y: 3000, width: 1200, height: 800, zoom: 0.25 };

    // The note has not moved. It could not have: a world coordinate is a fact about the
    // DIAGRAM, and the viewport is a fact about the READER. Store screen coordinates and
    // this note would now be about a patch of empty canvas 5000px away — which is exactly
    // what "it must survive pan/zoom" is warning you about.
    expect(store.thread(tid)!.resolvedAnchor.point).toEqual(before);
    expect(store.thread(tid)!.resolvedAnchor.point).toEqual({ x: 640, y: 480 });
    expect(store.thread(tid)!.resolvedAnchor.attached).toBe(true); // the canvas cannot be deleted
  });

  it('an orphan can be RE-ANCHORED — to another node, or pinned to the canvas', () => {
    const { diagram, store } = session('alice');
    diagram.addNode(node('n7', 700, 700, 'Payment gateway v2'));
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');
    diagram.removeNode('n1');
    expect(store.thread(tid)!.resolvedAnchor.attached).toBe(false);

    store.reanchor(tid, { kind: 'node', id: 'n7' });

    const t = store.thread(tid)!;
    expect(t.resolvedAnchor.attached).toBe(true);
    expect(t.resolvedAnchor.targetLabel).toBe('Payment gateway v2');
    expect(t.resolvedAnchor.point).toEqual({ x: 800, y: 700 });
    expect(t.messages).toHaveLength(1); // the conversation came with it
  });
});

describe('anchor survival — under CONCURRENCY, which is where it actually gets tested', () => {
  it('Ada comments on a node while Ben deletes it, offline: the comment SURVIVES, orphaned', () => {
    const ada = session('ada');
    const ben = session('ben');

    // Ben, offline, deletes the node.
    ben.diagram.removeNode('n1');
    // Ada, offline, has a long conversation about it.
    const tid = ada.store.createThread({ kind: 'node', id: 'n1' }, 'this is load-bearing, careful');
    ada.store.reply(tid, 'agreed, do not remove');

    // They reconnect. Both directions.
    const adaOps = ada.outbox.splice(0);
    const benOps = ben.outbox.splice(0);
    ada.replica.receive(benOps);
    ben.replica.receive(adaOps);

    // The node is gone on both (Card 0's presence register is LWW; whichever way Card 4
    // eventually settles it, the thread does not care — that is the point).
    // The CONVERSATION IS ON BOTH. Nobody's argument was deleted by somebody else's edit.
    for (const p of [ada, ben]) {
      const t = p.store.thread(tid);
      expect(t).toBeDefined();
      expect(t!.messages.map((m) => m.body)).toEqual([
        'this is load-bearing, careful',
        'agreed, do not remove',
      ]);
      expect(t!.resolvedAnchor.attached).toBe(false);
      expect(t!.resolvedAnchor.targetLabel).toBe('Payment gateway');
      expect(t!.resolvedAnchor.point).toEqual({ x: 200, y: 100 });
    }
  });

  it('…and if the CRDT card later lets the concurrent add win, the thread re-attaches with no new code', () => {
    // Card 4 is deciding add/remove semantics right now. This card must be correct under
    // BOTH answers, and it is — because it never asked the entity to exist.
    const ada = session('ada');
    const tid = ada.store.createThread({ kind: 'node', id: 'n1' }, 'careful');
    const snapshot = ada.diagram.getNode('n1')!.serialize();
    ada.diagram.removeNode('n1');
    expect(ada.store.thread(tid)!.resolvedAnchor.attached).toBe(false);

    // A hypothetical observed-remove set resurrects the node (an add the remove never saw).
    ada.diagram.restoreNode(snapshot);
    expect(ada.store.thread(tid)!.resolvedAnchor.attached).toBe(true);
  });
});
