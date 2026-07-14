// Wave 9 — Card 5: the catch-up frontier.
//
// The first two describes are the important ones, and they are unusual: they are tests
// that PROVE THE WRONG ANSWERS ARE WRONG. Both wrong answers look right, one of them ships
// in the codebase already (`OpLog.since`), and neither fails on any healthy transport —
// which is exactly why they need a test that reproduces the failure on purpose. Without
// these, the third describe is just an assertion that my code does what my code does.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { OpLog } from '../collab/op-log';
import { Replica } from '../collab/replica';
import type { Op } from '../collab/op';
import { VersionVector, deltaFor } from './version-vector';

function node(id: string, x = 0, y = 0): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

/** Two peers who have already seen each other's work — clocks level at `start`. */
function pair(start: number): { a: Replica; b: Replica; aOps: Op[]; bOps: Op[] } {
  const aOps: Op[] = [];
  const bOps: Op[] = [];
  const da = new DiagramModel('d');
  const db = new DiagramModel('d');
  da.addNode(node('n1', 0, 0));
  db.addNode(node('n1', 0, 0));

  const a = new Replica(da, { actor: 'alice', startClock: start, onLocalOp: (o) => aOps.push(o) });
  const b = new Replica(db, { actor: 'bob', startClock: start, onLocalOp: (o) => bOps.push(o) });
  return { a, b, aOps, bOps };
}

describe('WRONG ANSWER #1 — the scalar watermark (OpLog.since), which is in the codebase TODAY', () => {
  it('LOSES a concurrent edit on reconnect, because two peers share a clock value', () => {
    // Alice and Bob are both at clock 10: they have seen each other's work. Then the
    // network drops and they each make ONE edit.
    const { a, b, aOps, bOps } = pair(10);

    a.diagram.getNode('n1')!.setPosition(100, 100); // alice → clock 11
    b.diagram.getNode('n1')!.setMetadata('label', 'Bob was here'); // bob → clock 11

    expect(aOps[0].clock).toBe(11);
    expect(bOps[0].clock).toBe(11); // …the SAME clock. That is what "concurrent" means.

    // Reconnect. Alice's watermark is 11, so she asks Bob for "everything after 11".
    const bobsLog = new OpLog();
    bobsLog.appendAll(bOps);
    const tail = bobsLog.since(a.clock);

    // Bob's edit IS 11. `o.clock > 11` is false. He sends nothing.
    expect(tail).toEqual([]);

    // Alice never learns of it, and nothing anywhere reports an error.
    a.receive(tail);
    expect(a.diagram.getNode('n1')!.getMetadata('label')).toBeUndefined();
    expect(b.diagram.getNode('n1')!.getMetadata('label')).toBe('Bob was here');
    // ^ Two users. Two different documents. Forever.
  });

  it('…and the digested frontier gets it right on the same inputs', () => {
    const { a, b, aOps, bOps } = pair(10);
    a.diagram.getNode('n1')!.setPosition(100, 100);
    b.diagram.getNode('n1')!.setMetadata('label', 'Bob was here');

    const aVv = VersionVector.fromOps(a.history());
    const { ops } = deltaFor(b.history(), aVv.toJSON());

    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual(bOps[0]);

    a.receive(ops);
    expect(a.diagram.getNode('n1')!.getMetadata('label')).toBe('Bob was here');
    void aOps;
  });
});

describe('WRONG ANSWER #2 — the plain version vector (per-actor MAX clock)', () => {
  // A Lamport clock is not contiguous: it LEAPS whenever its owner observes a peer. So an
  // actor's own ops might be clocked 3, 5, 12, 40 — and "my max from Bob is 40" tells you
  // nothing whatsoever about whether you have Bob's op at 12.
  const bobsOps: Op[] = [
    { op: 'set', target: 'node', id: 'n1', path: 'position', value: { x: 3, y: 0 }, clock: 3, actor: 'bob' },
    { op: 'set', target: 'node', id: 'n1', path: 'size', value: { width: 12, height: 1 }, clock: 12, actor: 'bob' },
    { op: 'set', target: 'node', id: 'n1', path: 'style', value: { fill: 'red' }, clock: 40, actor: 'bob' },
  ];

  it('a MAX-only vector reports "fully caught up" while a hole sits under its nose', () => {
    // We hold Bob@3 and Bob@40. Bob@12 was dropped in transit.
    const held = [bobsOps[0], bobsOps[2]];
    const maxOnly: Record<string, number> = {};
    for (const o of held) maxOnly[o.actor] = Math.max(maxOnly[o.actor] ?? 0, o.clock);

    expect(maxOnly['bob']).toBe(40);

    // "Send me everything above 40." Bob@12 is not above 40. It is gone forever, and the
    // vector cheerfully reports full coverage.
    const naiveDelta = bobsOps.filter((o) => o.clock > (maxOnly[o.actor] ?? 0));
    expect(naiveDelta).toEqual([]);
  });

  it('the DIGESTED frontier sees the hole (count) and repairs it', () => {
    const mine = VersionVector.fromOps([bobsOps[0], bobsOps[2]]);
    const { ops, repairedActors } = deltaFor(bobsOps, mine.toJSON());

    expect(repairedActors).toEqual(['bob']);
    expect(ops.map((o) => o.clock)).toEqual([3, 12, 40]); // whole history; the log dedupes
  });

  it('…and sees a hole COUNT alone cannot: same max, same count, DIFFERENT ops', () => {
    // I hold Bob@{3,40}. The peer holds Bob@{12,40}. Two ops each, max 40 each. A
    // count-and-max vector declares them in sync. They are not: each is missing one of the
    // other's edits, and only the hash can tell.
    const mine = VersionVector.fromOps([bobsOps[0], bobsOps[2]]).toJSON();
    const theirs = VersionVector.fromOps([bobsOps[1], bobsOps[2]]).toJSON();

    expect(theirs['bob'].max).toBe(mine['bob'].max);
    expect(theirs['bob'].count).toBe(mine['bob'].count);
    expect(theirs['bob'].hash).not.toBe(mine['bob'].hash); // ← the only signal there is

    const { ops, repairedActors } = deltaFor([bobsOps[0], bobsOps[2]], theirs);
    expect(repairedActors).toEqual(['bob']);
    expect(ops.map((o) => o.clock)).toContain(3); // the op only I have. It ships.
  });

  it('the shortcut "they have more than me, not my problem" also loses an edit', () => {
    // I hold Bob@{3}. They hold Bob@{12,40}. Their count is BIGGER, so a `count > rf.count`
    // filter concludes they are ahead of me and sends nothing — but they are missing Bob@3,
    // which only I have. Both peers reason that way and the edit never meets its document.
    const theirs = VersionVector.fromOps([bobsOps[1], bobsOps[2]]).toJSON();
    const { ops } = deltaFor([bobsOps[0]], theirs);
    expect(ops.map((o) => o.clock)).toEqual([3]);
  });
});

describe('the digested frontier', () => {
  it('takes the CHEAP path when the peer is honestly behind — only the tail ships', () => {
    const all: Op[] = [1, 2, 3, 4, 5].map((c) => ({
      op: 'set', target: 'node', id: 'n1', path: `p${c}`, value: c, clock: c, actor: 'alice',
    }));

    const peer = VersionVector.fromOps(all.slice(0, 3)); // has 1,2,3
    const { ops, repairedActors } = deltaFor(all, peer.toJSON());

    expect(repairedActors).toEqual([]); // no hole ⇒ no repair
    expect(ops.map((o) => o.clock)).toEqual([4, 5]);
  });

  it('sends NOTHING to a peer that is fully caught up', () => {
    const all: Op[] = [1, 2, 3].map((c) => ({
      op: 'set', target: 'node', id: 'n1', path: `p${c}`, value: c, clock: c, actor: 'alice',
    }));
    const { ops } = deltaFor(all, VersionVector.fromOps(all).toJSON());
    expect(ops).toEqual([]);
  });

  it('is order-independent — two peers who received the same ops in different orders agree', () => {
    // If the digest depended on arrival order, EVERY sync round would "repair" a history
    // that was never broken, and the fast path would never once fire.
    const ops: Op[] = [7, 2, 9, 4].map((c) => ({
      op: 'set', target: 'node', id: 'n1', path: 'position', value: c, clock: c, actor: 'bob',
    }));
    const forward = VersionVector.fromOps(ops).toJSON();
    const backward = VersionVector.fromOps([...ops].reverse()).toJSON();
    expect(backward).toEqual(forward);
  });

  it('returns the delta in TOTAL ORDER, so an `add` precedes the `set`s that need it', () => {
    const ops: Op[] = [
      { op: 'set', target: 'node', id: 'n1', path: 'position', value: { x: 1, y: 1 }, clock: 5, actor: 'a' },
      { op: 'add', target: 'node', id: 'n1', data: {} as never, clock: 2, actor: 'a' },
      { op: 'set', target: 'node', id: 'n1', path: 'size', value: { width: 1, height: 1 }, clock: 9, actor: 'b' },
    ];
    const { ops: delta } = deltaFor(ops, {});
    expect(delta.map((o) => o.clock)).toEqual([2, 5, 9]);
  });
});
