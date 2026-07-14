// Wave 9 — Card 6: the comment store, and the ops it actually emits.
//
// The standard this suite holds itself to is the one Card 0 set: DRIVE THE REAL THING.
// Every test here goes through a real Replica, a real OpCapture and the real applyOp
// reducer — because the failure mode this codebase ships in every wave is machinery
// wired to nothing, and a comment store tested against a hand-built op array would be
// exactly that: green, documented, and connected to no transport on earth.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';
import { Replica, type Op } from '../collab';
import { CommentStore } from './comment-store';
import { ReadState } from './read-state';
import type { MentionEvent } from './mentions';

// ---------------------------------------------------------------------------
// A two-peer session, wired exactly as a host would wire it.
// ---------------------------------------------------------------------------

/** A shared wall clock, so `createdAt` is comparable across peers in a test. */
class TestClock {
  t = 1_700_000_000_000;
  now = (): number => ++this.t;
}

function node(id: string, x = 0, y = 0, label?: string): NodeModel {
  const n = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 100, height: 50 },
  });
  (n as unknown as { id: string }).id = id;
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  if (label) n.setMetadata('label', label);
  return n;
}

interface Peer {
  name: string;
  diagram: DiagramModel;
  replica: Replica;
  store: CommentStore;
  outbox: Op[];
  mentions: MentionEvent[];
}

function makePeer(name: string, clock: TestClock, seed?: (d: DiagramModel) => void): Peer {
  const diagram = new DiagramModel('shared', { id: 'shared-doc', uuid: 'shared-uuid' });
  seed?.(diagram);
  const outbox: Op[] = [];
  const replica = new Replica(diagram, { actor: name, onLocalOp: (op) => outbox.push(op) });
  const mentions: MentionEvent[] = [];
  let n = 0;
  const store = new CommentStore(diagram, {
    viewer: name,
    now: clock.now,
    idFactory: () => `${name}${++n}`,
    notifier: { notify: (e) => mentions.push(e) },
  });
  return { name, diagram, replica, store, outbox, mentions };
}

/** Deliver everything one peer has said to the other. Returns what was new. */
function deliver(from: Peer, to: Peer): Op[] {
  const ops = from.outbox.splice(0);
  return to.replica.receive(ops);
}

const seedTwoNodes = (d: DiagramModel) => {
  d.addNode(node('n1', 100, 100, 'Payment gateway'));
  d.addNode(node('n2', 400, 100, 'Ledger'));
};

// ===========================================================================

describe('CommentStore — comments ride the op log', () => {
  let clock: TestClock;
  let A: Peer;
  let B: Peer;

  beforeEach(() => {
    clock = new TestClock();
    A = makePeer('alice', clock, seedTwoNodes);
    B = makePeer('bob', clock, seedTwoNodes);
    A.outbox.length = 0;
    B.outbox.length = 0;
  });

  afterEach(() => {
    A.store.dispose();
    B.store.dispose();
    A.replica.dispose();
    B.replica.dispose();
  });

  it('a real comment, authored through the real store, becomes real ops on the wire', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'Is this the retry path?');

    // THE test that Card 0 says matters: not "ops replay" but "an edit produced ops".
    expect(A.outbox.length).toBe(3); // head, anchor, first message
    expect(A.outbox.every((o) => o.op === 'set' && o.target === 'diagram')).toBe(true);
    expect(A.outbox.map((o) => (o as { path: string }).path)).toEqual([
      `comments.${tid}.head`,
      `comments.${tid}.anchor`,
      `comments.${tid}.messages.alice2`,
    ]);

    deliver(A, B);

    const onB = B.store.thread(tid)!;
    expect(onB).toBeDefined();
    expect(onB.messages.map((m) => m.body)).toEqual(['Is this the retry path?']);
    expect(onB.author).toBe('alice');
    expect(onB.resolvedAnchor.attached).toBe(true);
    expect(onB.resolvedAnchor.targetLabel).toBe('Payment gateway');
  });

  it('EVERY register path the store writes is PREFIX-FREE — the property that makes LWW sound', () => {
    // Two writes to DIFFERENT paths are different registers, and the LWW gate cannot
    // order them: whichever is APPLIED last wins, and arrival order belongs to the
    // network. So if `comments.t1` were ever written, a late delivery of it would
    // silently wipe a `comments.t1.status` resolve. Prefix-freedom is what forbids that,
    // and it is asserted, not remembered.
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'one');
    A.store.reply(tid, 'two');
    A.store.resolve(tid);
    A.store.reopen(tid);
    A.store.reanchor(tid, { kind: 'region', x: 10, y: 20 });
    A.store.editMessage(tid, 'alice2', 'one, edited');
    A.store.deleteMessage(tid, 'alice2');

    const paths = A.outbox.map((o) => (o as { path: string }).path);
    expect(paths.length).toBeGreaterThan(6);
    for (const a of paths) {
      for (const b of paths) {
        if (a === b) continue;
        expect(b.startsWith(a + '.')).toBe(false);
      }
    }
  });

  it('a redundant write is not an op — resolving an already-resolved thread says nothing', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'x');
    A.outbox.length = 0;

    expect(A.store.resolve(tid)).toBe(true);
    expect(A.outbox.length).toBe(1);

    // Same viewer, same value… but `at` moves, so this IS a new fact and IS an op.
    // The one that must be silent is the byte-identical write:
    A.outbox.length = 0;
    expect(A.diagram.writeCommentRegister(`${tid}.status`, A.diagram.readCommentRegister(`${tid}.status`))).toBe(false);
    expect(A.outbox.length).toBe(0);
  });

  it('threads survive save → load → save (they are document data, and are saved with it)', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'ship it?');
    A.store.reply(tid, 'not yet');
    A.store.resolve(tid);

    const doc = A.diagram.serialize();
    expect(doc.comments).toBeDefined();

    const reloaded = DiagramModel.fromJSON(doc);
    const store = new CommentStore(reloaded, { viewer: 'carol' });
    const t = store.thread(tid)!;
    expect(t.messages.map((m) => m.body)).toEqual(['ship it?', 'not yet']);
    expect(t.resolved).toBe(true);
    expect(t.resolvedBy).toBe('alice');
    expect(JSON.stringify(reloaded.serialize().comments)).toEqual(JSON.stringify(doc.comments));
  });

  it('a diagram with NO comments serializes to exactly the bytes it did before this card', () => {
    // The compatibility promise. An always-present `comments: {}` would have rewritten
    // every saved document in the world to say nothing.
    const doc = A.diagram.serialize();
    expect('comments' in doc).toBe(false);
  });

  it('an incomplete thread is INVISIBLE, not a half-thread — and completes when its head lands', () => {
    // An unreliable transport may deliver the reply before the head that owns it. Card 0
    // says causal readiness is not settled yet, so this is not hypothetical.
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'first');
    const [head, anchor, msg] = A.outbox.splice(0);

    B.replica.receive([msg]); // the message, with no thread to hang it on
    expect(B.store.thread(tid)).toBeUndefined();
    expect(B.store.threads()).toHaveLength(0);

    B.replica.receive([anchor]);
    expect(B.store.thread(tid)).toBeUndefined(); // still no head

    B.replica.receive([head]);
    const t = B.store.thread(tid)!;
    expect(t).toBeDefined();
    // Nothing was dropped while it waited — the early message is right there.
    expect(t.messages.map((m) => m.body)).toEqual(['first']);
  });

  it('resolve / reopen carries its attribution, and cannot split from the flag', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'x');
    A.store.resolve(tid);
    deliver(A, B);
    expect(B.store.thread(tid)!.resolved).toBe(true);
    expect(B.store.thread(tid)!.resolvedBy).toBe('alice');

    B.store.reopen(tid);
    deliver(B, A);
    expect(A.store.thread(tid)!.resolved).toBe(false);
  });

  it('deleting a message leaves a TOMBSTONE — the conversation keeps its shape', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'first');
    const mid = A.store.reply(tid, 'second — actually, ignore me');
    A.store.reply(tid, 'third');
    A.store.deleteMessage(tid, mid);
    deliver(A, B);

    const t = B.store.thread(tid)!;
    expect(t.messages).toHaveLength(3); // the hole is still there…
    expect(t.messages[1].deleted).toBe(true);
    expect(t.messages[1].body).toBe(''); // …but the text is gone
    expect(t.messages[1].author).toBe('alice'); // and we still know who withdrew it
    expect(t.messages.map((m) => m.body)).toEqual(['first', '', 'third']); // order intact
  });

  it('an edit rewrites the message and re-extracts its mentions', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'who owns this?');
    A.store.editMessage(tid, 'alice2', 'who owns this? @[Ada](u_ada)');
    deliver(A, B);
    const m = B.store.thread(tid)!.messages[0];
    expect(m.body).toBe('who owns this? @[Ada](u_ada)');
    expect(m.mentions).toEqual(['u_ada']);
    expect(m.editedAt).toBeGreaterThan(0);
  });

  it('two messages posted in the SAME MILLISECOND still read in the order they were written', () => {
    // A real bug, found by a frozen clock — which is the only way a millisecond collision
    // is reliably reproducible, and which is exactly what a paste or a scripted reply
    // produces in the wild.
    //
    // `messageOrder` is (createdAt, author, id). When two messages share a millisecond AND
    // an author, the ID is the whole tiebreak — so if the id is random-first, the order of
    // the conversation is decided by a coin toss. Every peer agrees on the coin toss (so it
    // converges, and a convergence test would stay green), and every peer reads the
    // conversation backwards. The id now carries a zero-padded per-session counter ahead of
    // its random suffix, so the tiebreak is authoring order.
    //
    // Repeated, because "it passed once" is what a random id looks like half the time.
    for (let trial = 0; trial < 200; trial++) {
      const frozen = new DiagramModel('d');
      const store = new CommentStore(frozen, { viewer: 'ada', now: () => 1_700_000_000_000 });
      const tid = store.createThread({ kind: 'region', x: 0, y: 0 }, 'first');
      store.reply(tid, 'second');
      store.reply(tid, 'third');
      expect(store.thread(tid)!.messages.map((m) => m.body)).toEqual([
        'first',
        'second',
        'third',
      ]);
      store.dispose();
    }
  });

  it('the messages of a thread read in the SAME order on every peer', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'a');
    deliver(A, B);
    B.store.reply(tid, 'b');
    A.store.reply(tid, 'c');
    // Cross-delivered in opposite orders — the network is not a courtesy.
    deliver(B, A);
    deliver(A, B);

    expect(A.store.thread(tid)!.messages.map((m) => m.body)).toEqual(
      B.store.thread(tid)!.messages.map((m) => m.body)
    );
  });
});

// ===========================================================================

describe('CommentStore — unread markers are PERSONAL state', () => {
  let clock: TestClock;
  let A: Peer;
  let B: Peer;

  beforeEach(() => {
    clock = new TestClock();
    A = makePeer('alice', clock, seedTwoNodes);
    B = makePeer('bob', clock, seedTwoNodes);
  });
  afterEach(() => {
    A.store.dispose();
    B.store.dispose();
  });

  it('your own message is never unread to you, and a colleague reading it does not clear YOUR badge', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'thoughts?');
    deliver(A, B);

    expect(A.store.thread(tid)!.unread).toBe(0); // alice wrote it; she was there
    expect(B.store.thread(tid)!.unread).toBe(1);

    B.store.markRead(tid);
    expect(B.store.thread(tid)!.unread).toBe(0);

    // …and it emitted NOTHING. Reading is not an edit.
    expect(B.outbox.filter((o) => (o as { path?: string }).path?.startsWith('comments'))).toHaveLength(0);

    // A third peer's badge is untouched by bob's reading — the whole point.
    const C = makePeer('carol', clock, seedTwoNodes);
    C.replica.receive(A.replica.history() as Op[]);
    C.replica.receive(B.replica.history() as Op[]);
    expect(C.store.thread(tid)!.unread).toBe(1);
    C.store.dispose();
  });

  it('a new reply makes a read thread unread again', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'thoughts?');
    deliver(A, B);
    B.store.markRead(tid);
    expect(B.store.totalUnread()).toBe(0);

    A.store.reply(tid, 'bumping this');
    deliver(A, B);
    expect(B.store.thread(tid)!.unread).toBe(1);
    expect(B.store.totalUnread()).toBe(1);
  });

  it('a tombstoned message is not unread — a badge that opens onto "deleted" has wasted your attention', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'oops');
    const mid = A.store.reply(tid, 'never mind');
    A.store.deleteMessage(tid, mid);
    deliver(A, B);
    expect(B.store.thread(tid)!.unread).toBe(1); // just the first one
  });

  it('read state round-trips through the host (toJSON/fromJSON) — the only persistence seam it gets', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'x');
    deliver(A, B);
    B.store.markRead(tid);

    const saved = JSON.parse(JSON.stringify(B.store.readState.toJSON()));

    // A new session for bob: same document, restored watermarks.
    const B2 = makePeer('bob2', clock, seedTwoNodes);
    B2.replica.receive(A.replica.history() as Op[]);
    const restored = new CommentStore(B2.diagram, {
      viewer: 'bob',
      readState: ReadState.fromJSON(saved),
    });
    expect(restored.thread(tid)!.unread).toBe(0);
    restored.dispose();
    B2.store.dispose();
  });
});

// ===========================================================================

describe('CommentStore — @mentions are a SEAM', () => {
  let clock: TestClock;
  let A: Peer;
  let B: Peer;

  beforeEach(() => {
    clock = new TestClock();
    A = makePeer('alice', clock, seedTwoNodes);
    B = makePeer('bob', clock, seedTwoNodes);
  });
  afterEach(() => {
    A.store.dispose();
    B.store.dispose();
  });

  it('fires once per message, with an idempotency key that is IDENTICAL on every peer', () => {
    const tid = A.store.createThread(
      { kind: 'node', id: 'n1' },
      'can you look at this @[Ada](u_ada) — also @chen'
    );
    deliver(A, B);

    expect(A.mentions).toHaveLength(1);
    expect(B.mentions).toHaveLength(1);

    // THE property that lets a host send exactly one email: same key on both peers.
    expect(A.mentions[0].key).toBe(B.mentions[0].key);
    expect(A.mentions[0].key).toBe(`${tid}:alice2`);

    expect(B.mentions[0].mentioned).toEqual(['u_ada', 'chen']);
    expect(B.mentions[0].author).toBe('alice');
    // The event can say what it is ABOUT, which is the difference between an actionable
    // notification and a nuisance.
    expect(B.mentions[0].anchor).toMatchObject({ kind: 'node', id: 'n1' });
    expect(A.mentions[0].local).toBe(true);
    expect(B.mentions[0].local).toBe(false);
  });

  it('redelivery of the same op fires NOTHING further — transports duplicate', () => {
    A.store.createThread({ kind: 'node', id: 'n1' }, 'ping @chen');
    const ops = A.outbox.splice(0);
    B.replica.receive(ops);
    B.replica.receive(ops);
    B.replica.receive([...ops].reverse());
    expect(B.mentions).toHaveLength(1);
  });

  it('opening a FILE full of old mentions notifies nobody', () => {
    A.store.createThread({ kind: 'node', id: 'n1' }, 'hey @chen');
    A.store.createThread({ kind: 'node', id: 'n2' }, 'and @dev');
    const doc = A.diagram.serialize();

    const fresh = DiagramModel.fromJSON(doc);
    const fired: MentionEvent[] = [];
    const store = new CommentStore(fresh, {
      viewer: 'dana',
      notifier: { notify: (e) => fired.push(e) },
    });
    // Loading history is not news. (This is the bug that emails you 400 times.)
    expect(fired).toHaveLength(0);

    store.createThread({ kind: 'node', id: 'n1' }, 'but @chen this one IS new');
    expect(fired).toHaveLength(1);
    store.dispose();
  });

  it('a mention whose thread head has not arrived waits for it — never fires anonymous', () => {
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'urgent @chen');
    const [head, anchor, msg] = A.outbox.splice(0);

    B.replica.receive([msg]);
    expect(B.mentions).toHaveLength(0); // it could not say what it was about

    B.replica.receive([head, anchor]);
    expect(B.mentions).toHaveLength(1);
    expect(B.mentions[0].anchor).toMatchObject({ kind: 'node', id: 'n1' });
    expect(B.mentions[0].threadId).toBe(tid);
  });

  it('mentionsOfViewer finds the threads that are asking YOU a question', () => {
    A.store.createThread({ kind: 'node', id: 'n1' }, 'nothing to see here');
    A.store.createThread({ kind: 'node', id: 'n2' }, 'over to you @bob');
    deliver(A, B);

    const mine = B.store.mentionsOfViewer();
    expect(mine).toHaveLength(1);
    expect(mine[0].messages[0].body).toContain('@bob');
  });
});

// ===========================================================================

describe('CommentStore — a comment on a LINK', () => {
  it('anchors to the link id and follows its geometry', () => {
    const clock = new TestClock();
    const d = new DiagramModel('d');
    d.addNode(node('n1', 0, 0, 'A'));
    d.addNode(node('n2', 300, 0, 'B'));
    const link = new LinkModel('n1-out', 'n2-in');
    (link as unknown as { id: string }).id = 'l1';
    link.setSourcePort('n1-out', 'n1');
    link.setTargetPort('n2-in', 'n2');
    d.addLink(link);

    const store = new CommentStore(d, { viewer: 'alice', now: clock.now });
    const tid = store.createThread({ kind: 'link', id: 'l1' }, 'why is this dashed?');

    const t = store.thread(tid)!;
    expect(t.resolvedAnchor.attached).toBe(true);
    expect(t.resolvedAnchor.targetKind).toBe('link');
    // Midway between the two node centres: (50,25) → (350,25).
    expect(t.resolvedAnchor.point).toEqual({ x: 200, y: 25 });

    d.removeLink('l1');
    expect(store.thread(tid)!.resolvedAnchor.attached).toBe(false);
    expect(store.thread(tid)!.resolvedAnchor.point).toEqual({ x: 200, y: 25 }); // ghost stays put
    store.dispose();
  });
});
