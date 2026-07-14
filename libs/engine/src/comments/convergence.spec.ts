// Wave 9 — Card 6: comments CONVERGE. Fuzzed, not asserted.
//
// A comment system is collaborative data or it is a single-player notepad. Two people
// commenting at once, offline, on the same node, is the NORMAL case — it is what a design
// review IS — and the failure mode is not an error message, it is that one of them opens
// the file tomorrow and their colleague's comment is simply not there.
//
// So this file does three things, in ascending order of how much they can teach you:
//
//   1. A SEEDED FUZZ. Two peers, random comment traffic interleaved with random diagram
//      edits, random delivery order, deliberate REDELIVERY. 200 trials. Converge or fail.
//   2. MUTATION CONTROLS. Break the mechanism on purpose and watch the test go red. A gate
//      that cannot be shown to fail is not a gate, it is a decoration. (The registers are
//      re-cut the WRONG way — the obvious way — and we watch a comment die.)
//   3. AN INVARIANT the fuzz enforces on every op the store has ever emitted: the register
//      paths are PREFIX-FREE. Without it, LWW cannot order a whole-thread write against a
//      resolve, and out-of-order delivery silently wipes state.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { Replica, type Op } from '../collab';
import { CommentStore } from './comment-store';

// ---------------------------------------------------------------------------

/** Mulberry32 — a tiny seeded PRNG. Reproducible failures or it is not a fuzz test. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * THE ORACLE: the comment tree, canonically.
 *
 * Keys are sorted. That is NOT a weakening — a JSON object's key ORDER is a property of
 * the order the ops happened to be applied in (alice applies her own thread first, bob
 * applies his), and it is not content. What IS content — every thread, every message,
 * every register value — is compared exactly. And the semantic order that DOES matter,
 * the order a human reads the messages in, is not left to key order at all: it is a total
 * order (`messageOrder`), and it is asserted separately below.
 */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sort(val)])
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

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

const NODE_IDS = ['n1', 'n2', 'n3'];

interface Peer {
  name: string;
  diagram: DiagramModel;
  replica: Replica;
  store: CommentStore;
  outbox: Op[];
  emitted: Op[];
}

function makePeer(name: string, wall: { t: number }): Peer {
  const diagram = new DiagramModel('doc', { id: 'doc', uuid: 'doc-uuid' });
  for (const [i, id] of NODE_IDS.entries()) {
    diagram.addNode(node(id, 100 * (i + 1), 100, `Node ${id}`));
  }
  const outbox: Op[] = [];
  const emitted: Op[] = [];
  const replica = new Replica(diagram, {
    actor: name,
    onLocalOp: (o) => {
      outbox.push(o);
      emitted.push(o);
    },
  });
  let n = 0;
  const store = new CommentStore(diagram, {
    viewer: name,
    idFactory: () => `${name}_${++n}`,
    // A SHARED wall clock that only ever advances: two peers' `createdAt` values must be
    // comparable, and in a fuzz we want the ordering to be exercised, not accidental.
    now: () => ++wall.t,
  });
  outbox.length = 0;
  emitted.length = 0;
  return { name, diagram, replica, store, outbox, emitted };
}

// ===========================================================================

describe('comment convergence — FUZZED over random interleavings', () => {
  it('200 seeded trials: two peers, random comment + diagram traffic, random delivery, REDELIVERY', () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
      const wall = { t: 1_700_000_000_000 };

      const A = makePeer('alice', wall);
      const B = makePeer('bob', wall);
      const peers = [A, B];
      // Threads each peer KNOWS about — you cannot reply to a thread you have not seen.
      const known = new Map<Peer, string[]>([
        [A, []],
        [B, []],
      ]);

      const inflight: Array<{ to: Peer; ops: Op[] }> = [];

      for (let step = 0; step < 40; step++) {
        const p = pick(peers);
        const other = p === A ? B : A;
        const mine = known.get(p)!;
        const action = rand();

        if (action < 0.2 || mine.length === 0) {
          // start a thread — on a node, or on a free region
          const tid =
            rand() < 0.75
              ? p.store.createThread({ kind: 'node', id: pick(NODE_IDS) }, `t${step} by ${p.name}`)
              : p.store.createThread(
                  { kind: 'region', x: Math.floor(rand() * 900), y: Math.floor(rand() * 600) },
                  `note ${step}`
                );
          mine.push(tid);
        } else if (action < 0.5) {
          p.store.reply(pick(mine), `reply ${step} from ${p.name} @${other.name}`);
        } else if (action < 0.58) {
          p.store.resolve(pick(mine));
        } else if (action < 0.64) {
          p.store.reopen(pick(mine));
        } else if (action < 0.7) {
          const t = p.store.thread(pick(mine));
          const m = t?.messages.find((x) => !x.deleted);
          if (m) {
            if (rand() < 0.5) p.store.editMessage(t!.id, m.id, `edited by ${p.name} @${step}`);
            else p.store.deleteMessage(t!.id, m.id);
          }
        } else if (action < 0.76) {
          p.store.reanchor(pick(mine), { kind: 'node', id: pick(NODE_IDS) });
        } else if (action < 0.82) {
          // …and the diagram is being edited AT THE SAME TIME, including deletions of the
          // very nodes the comments are about. That is the whole reason this is hard.
          const n = p.diagram.getNode(pick(NODE_IDS));
          if (n) n.setPosition(Math.floor(rand() * 800), Math.floor(rand() * 600));
        } else if (action < 0.86) {
          p.diagram.removeNode(pick(NODE_IDS));
        } else if (action < 0.9) {
          const id = pick(NODE_IDS);
          if (!p.diagram.getNode(id)) p.diagram.addNode(node(id, 50, 50, `Node ${id}`));
        } else {
          // NETWORK: hand what this peer has said to the other — sometimes now, sometimes
          // later, sometimes shuffled, sometimes twice.
          const ops = p.outbox.splice(0);
          if (ops.length) {
            const batch = rand() < 0.3 ? [...ops].reverse() : ops;
            if (rand() < 0.5) {
              other.replica.receive(batch);
              for (const t of p.store.threads()) {
                if (!known.get(other)!.includes(t.id)) known.get(other)!.push(t.id);
              }
            } else {
              inflight.push({ to: other, ops: batch });
            }
            if (rand() < 0.3) inflight.push({ to: other, ops: batch }); // duplicate delivery
          }
        }
      }

      // Settle: everything in flight, plus everything still in an outbox, plus a full
      // history redelivery in both directions (a reconnect replays; it must be free).
      for (const { to, ops } of inflight) to.replica.receive(ops);
      A.replica.receive(B.outbox.splice(0));
      B.replica.receive(A.outbox.splice(0));
      A.replica.receive(B.replica.history() as Op[]);
      B.replica.receive(A.replica.history() as Op[]);
      A.replica.receive(B.replica.history() as Op[]);

      // --- 1. THE COMMENT TREES ARE IDENTICAL ------------------------------
      const ca = canonical(A.diagram.comments);
      const cb = canonical(B.diagram.comments);
      if (ca !== cb) {
        failures.push(`seed ${seed}: comment trees diverged\n  A=${ca}\n  B=${cb}`);
        continue;
      }

      // --- 2. NOBODY'S COMMENT WAS LOST ------------------------------------
      // Every message either peer ever authored is present on BOTH, unless it was
      // explicitly tombstoned. This is the property a user actually cares about.
      const authored = new Set<string>();
      for (const p of peers) {
        for (const op of p.emitted) {
          const path = (op as { path?: string }).path ?? '';
          const m = /^comments\.([^.]+)\.messages\.([^.]+)$/.exec(path);
          if (m) authored.add(`${m[1]}/${m[2]}`);
        }
      }
      for (const key of authored) {
        const [tid, mid] = key.split('/');
        for (const p of peers) {
          if (!p.diagram.comments[tid]?.messages?.[mid]) {
            failures.push(`seed ${seed}: message ${key} LOST on ${p.name}`);
          }
        }
      }

      // --- 3. THE CONVERSATION READS THE SAME ON BOTH ----------------------
      const readA = A.store.threads().map((t) => `${t.id}:${t.messages.map((m) => m.id).join(',')}:${t.resolved}`);
      const readB = B.store.threads().map((t) => `${t.id}:${t.messages.map((m) => m.id).join(',')}:${t.resolved}`);
      if (JSON.stringify(readA) !== JSON.stringify(readB)) {
        failures.push(`seed ${seed}: the two peers READ the conversation differently`);
      }

      // --- 4. THE INVARIANT: EVERY EMITTED REGISTER PATH IS PREFIX-FREE ----
      const paths = [...A.emitted, ...B.emitted]
        .map((o) => (o as { path?: string }).path ?? '')
        .filter((p) => p.startsWith('comments.'));
      for (const a of paths) {
        for (const b of paths) {
          if (a !== b && b.startsWith(a + '.')) {
            failures.push(`seed ${seed}: overlapping registers '${a}' ⊂ '${b}'`);
          }
        }
      }

      A.store.dispose();
      B.store.dispose();
      A.replica.dispose();
      B.replica.dispose();
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('the fuzz actually FUZZES — it produces threads, messages, resolves and orphans', () => {
    // A fuzz whose scenarios are all trivially empty is a green test that proves nothing.
    const wall = { t: 1 };
    const A = makePeer('alice', wall);
    const B = makePeer('bob', wall);
    const rand = rng(7);
    for (let i = 0; i < 40; i++) {
      const p = rand() < 0.5 ? A : B;
      const tid = p.store.createThread({ kind: 'node', id: NODE_IDS[i % 3] }, `m${i}`);
      if (rand() < 0.5) p.store.reply(tid, 'r');
      if (rand() < 0.3) p.store.resolve(tid);
    }
    A.diagram.removeNode('n2');
    B.replica.receive(A.outbox.splice(0));
    A.replica.receive(B.outbox.splice(0));

    expect(A.store.threads().length).toBeGreaterThan(20);
    expect(A.store.threads().some((t) => t.resolved)).toBe(true);
    expect(A.store.orphans().length).toBeGreaterThan(0);
    expect(A.store.threads().some((t) => t.messages.length > 1)).toBe(true);
    A.store.dispose();
    B.store.dispose();
  });
});

// ===========================================================================

describe('comment convergence — MUTATION CONTROLS (break it and watch it go red)', () => {
  it('CONCURRENT REPLIES BOTH SURVIVE — because one message is one register', () => {
    const wall = { t: 1_700_000_000_000 };
    const A = makePeer('alice', wall);
    const B = makePeer('bob', wall);

    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'what do we do here?');
    B.replica.receive(A.outbox.splice(0));

    // Both go offline. Both reply. This is a design review; it happens constantly.
    A.store.reply(tid, "let's cache it");
    B.store.reply(tid, "let's just delete it");

    const fromA = A.outbox.splice(0);
    const fromB = B.outbox.splice(0);
    B.replica.receive(fromA);
    A.replica.receive(fromB);

    for (const p of [A, B]) {
      const bodies = p.store.thread(tid)!.messages.map((m) => m.body);
      expect(bodies).toContain("let's cache it");
      expect(bodies).toContain("let's just delete it");
      expect(bodies).toHaveLength(3);
    }
    A.store.dispose();
    B.store.dispose();
  });

  it('THE CONTROL: cut the registers the OBVIOUS way (messages as one array) and a comment DIES', () => {
    // The gate above is only meaningful if the wrong design can be shown to fail. So here
    // is the wrong design — `messages: [...]` as a single register, which is what anyone
    // would write first — driven through the SAME real Replica and the SAME real LWW gate.
    const A = makePeer('alice', { t: 1 });
    const B = makePeer('bob', { t: 1 });

    A.diagram.writeCommentRegister('t9.head', { id: 't9', author: 'alice', createdAt: 1 });
    A.diagram.writeCommentRegister('t9.anchor', { kind: 'node', id: 'n1', fallback: { x: 0, y: 0 } });
    A.diagram.writeCommentRegister('t9.msgArray', [{ id: 'm1', author: 'alice', body: 'what do we do?' }]);
    B.replica.receive(A.outbox.splice(0));

    // Offline, both append to the array they can see. Read-modify-write on ONE register.
    const aArr = A.diagram.readCommentRegister('t9.msgArray') as unknown[];
    A.diagram.writeCommentRegister('t9.msgArray', [...aArr, { id: 'm2', author: 'alice', body: "let's cache it" }]);
    const bArr = B.diagram.readCommentRegister('t9.msgArray') as unknown[];
    B.diagram.writeCommentRegister('t9.msgArray', [...bArr, { id: 'm3', author: 'bob', body: "let's delete it" }]);

    B.replica.receive(A.outbox.splice(0));
    A.replica.receive(B.outbox.splice(0));

    // Both peers agree — and they agree on a conversation that is MISSING A COMMENT.
    // LWW did its job perfectly: one write to one register, one winner. Somebody's
    // contribution was deleted by a stranger, silently, and every test that only checked
    // "the peers converged" would be green.
    const arrA = A.diagram.readCommentRegister('t9.msgArray') as Array<{ body: string }>;
    const arrB = B.diagram.readCommentRegister('t9.msgArray') as Array<{ body: string }>;
    expect(canonical(arrA)).toEqual(canonical(arrB)); // converged…
    expect(arrA).toHaveLength(2); // …onto TWO messages, when three were written
    const bodies = arrA.map((m) => m.body);
    expect(bodies.includes("let's cache it") && bodies.includes("let's delete it")).toBe(false);

    A.store.dispose();
    B.store.dispose();
  });

  it('a RESOLVE and a REPLY at the same moment do not cancel each other', () => {
    const wall = { t: 1_700_000_000_000 };
    const A = makePeer('alice', wall);
    const B = makePeer('bob', wall);
    const tid = A.store.createThread({ kind: 'node', id: 'n1' }, 'is this done?');
    B.replica.receive(A.outbox.splice(0));

    A.store.resolve(tid); // alice: done
    B.store.reply(tid, 'no! one more thing'); // bob, at the same instant

    B.replica.receive(A.outbox.splice(0));
    A.replica.receive(B.outbox.splice(0));

    for (const p of [A, B]) {
      const t = p.store.thread(tid)!;
      expect(t.resolved).toBe(true); // different registers…
      expect(t.messages.map((m) => m.body)).toContain('no! one more thing'); // …so both survive
    }
    A.store.dispose();
    B.store.dispose();
  });

  it('THE CONTROL FOR PREFIX-FREEDOM: a whole-thread write DOES silently wipe a resolve', () => {
    // Why every path the store writes is a LEAF, and why `writeCommentRegister` refuses a
    // one-segment path outright. Here is the failure it is refusing.
    //
    // These ops are hand-built precisely BECAUSE the store cannot emit them — that is the
    // point of the guard. They are then fed to the REAL Replica, the REAL LWW gate and the
    // REAL applyOp reducer, so what follows is what would actually happen on the wire.
    const A = makePeer('alice', { t: 1 });
    const B = makePeer('bob', { t: 1 });

    const setOp = (clock: number, actor: string, path: string, value: unknown): Op =>
      ({ op: 'set', target: 'diagram', id: '', path, value, clock, actor }) as Op;

    const head = setOp(1, 'alice', 'comments.t9.head', { id: 't9', author: 'alice', createdAt: 1 });
    const anchor = setOp(2, 'alice', 'comments.t9.anchor', { kind: 'region', x: 0, y: 0 });
    const resolve = setOp(3, 'bob', 'comments.t9.status', { resolved: true, by: 'bob', at: 3 });
    // The forbidden shape: `comments.t9` — a strict PREFIX of `comments.t9.status`.
    const whole = setOp(4, 'alice', 'comments.t9', {
      head: { id: 't9', author: 'alice', createdAt: 1 },
      anchor: { kind: 'region', x: 0, y: 0 },
      messages: {},
    });

    // The same four ops. Two arrival orders — which is all a network ever promises.
    A.replica.receive([head, anchor, resolve, whole]);
    B.replica.receive([head, anchor, whole, resolve]);

    // The LWW gate admitted every one of them, correctly: `comments.t9` and
    // `comments.t9.status` are DIFFERENT registers, so it has nothing to order them by.
    // Application order — i.e. the network — decided instead.
    expect(A.store.thread('t9')!.resolved).toBe(false); // the whole-thread write landed last
    expect(B.store.thread('t9')!.resolved).toBe(true); // …here it landed first
    expect(canonical(A.diagram.comments)).not.toEqual(canonical(B.diagram.comments)); // DIVERGED

    // And with the register cut as the store actually cuts it — leaves only — the same
    // two arrival orders converge, because now LWW has a register to be authoritative on.
    const C = makePeer('carol', { t: 1 });
    const D = makePeer('dave', { t: 1 });
    const statusLater = setOp(5, 'alice', 'comments.t9.status', { resolved: false, by: 'alice', at: 5 });
    C.replica.receive([head, anchor, resolve, statusLater]);
    D.replica.receive([head, anchor, statusLater, resolve]);
    expect(C.store.thread('t9')!.resolved).toBe(false);
    expect(D.store.thread('t9')!.resolved).toBe(false); // the older write was REFUSED, not applied
    expect(canonical(C.diagram.comments)).toEqual(canonical(D.diagram.comments));

    for (const p of [A, B, C, D]) {
      p.store.dispose();
      p.replica.dispose();
    }
  });
});
