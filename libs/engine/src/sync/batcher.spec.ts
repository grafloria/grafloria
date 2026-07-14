// Wave 9 — Card 5: batching, and the two ways to get it wrong.
//
// Both wrong ways CONVERGE. Both pass a "the peers agree" oracle. Both are silent. They
// only show up if you assert on the CONTENT of what went on the wire — which is what this
// file does.

import type { Op } from '../collab/op';
import { OpBatcher, coalesce } from './batcher';

const set = (id: string, path: string, value: unknown, clock: number): Op =>
  ({ op: 'set', target: 'node', id, path, value, clock, actor: 'a' }) as Op;
const add = (id: string, clock: number): Op =>
  ({ op: 'add', target: 'node', id, data: {}, clock, actor: 'a' }) as Op;
const remove = (id: string, clock: number): Op =>
  ({ op: 'remove', target: 'node', id, clock, actor: 'a' }) as Op;

describe('coalesce', () => {
  it('KEEPS THE LAST write to a register — the node must not freeze mid-drag', () => {
    // The obvious implementation is `if (!seen.has(key)) { seen.add(key); out.push(op) }`,
    // which keeps the FIRST of the 60 pointermoves and throws away the other 59. The remote
    // node then stops dead a few pixels into the drag while the local user watches it fly
    // across the canvas. It converges — both peers agree on the wrong value — and it never
    // errors. This test is named after that bug.
    const drag = [0, 1, 2, 3, 4].map((i) => set('n1', 'position', { x: i * 10, y: 0 }, i + 1));

    const { kept: out, dropped } = coalesce(drag);

    expect(out).toHaveLength(1);
    expect((out[0] as { value: unknown }).value).toEqual({ x: 40, y: 0 }); // the LAST, not the first

    // The four superseded ops are REPORTED, not merely discarded — the adapter has to know
    // exactly which ops it is never going to send, or its frontier advertises history no
    // peer can ever obtain. See `SyncAdapter.sharedHistory()`.
    expect(dropped.map((o) => o.clock)).toEqual([1, 2, 3, 4]);
  });

  it('does NOT coalesce across DIFFERENT registers — a move and a rename both survive', () => {
    const ops = [
      set('n1', 'position', { x: 1, y: 1 }, 1),
      set('n1', 'metadata.label', 'hello', 2),
      set('n1', 'position', { x: 2, y: 2 }, 3),
    ];
    const { kept: out } = coalesce(ops);

    expect(out).toHaveLength(2);
    expect(out.map((o) => (o as { path: string }).path)).toEqual(['metadata.label', 'position']);
  });

  it('NEVER REORDERS: an `add` still precedes the `set`s that depend on it', () => {
    // A "group by register, then flatten" implementation emits all of register A's ops, then
    // all of register B's — which is not the order they happened in. For independent
    // registers that is harmless; for `add(n7)` before `set(n7.position)` it is a
    // catastrophe: the set arrives first, the receiver has no n7, and we have manufactured —
    // on the SENDER, on purpose — the exact reordering the causal buffer exists to survive.
    const ops = [
      set('n1', 'position', { x: 1, y: 1 }, 1),
      add('n7', 2),
      set('n7', 'position', { x: 9, y: 9 }, 3),
      set('n1', 'position', { x: 5, y: 5 }, 4),
    ];
    const { kept: out } = coalesce(ops);

    // n1's first position is dropped (superseded); everything else keeps its place.
    expect(out.map((o) => `${o.op}:${o.id}@${o.clock}`)).toEqual([
      'add:n7@2',
      'set:n7@3',
      'set:n1@4',
    ]);
  });

  it('never drops an `add` or a `remove` — they are events, not register writes', () => {
    const ops = [add('n1', 1), remove('n1', 2), add('n1', 3)];
    expect(coalesce(ops).kept).toEqual(ops);
    expect(coalesce(ops).dropped).toEqual([]);
  });

  it('a set before a remove-and-re-add is still safely dropped', () => {
    // set(pos=A) · remove · add(fresh) · set(pos=B). Dropping the first set is correct: the
    // entity was destroyed and rebuilt from its `add` data in between, so A could never have
    // survived anyway.
    const ops = [
      set('n1', 'position', { x: 1, y: 1 }, 1),
      remove('n1', 2),
      add('n1', 3),
      set('n1', 'position', { x: 2, y: 2 }, 4),
    ];
    const { kept: out } = coalesce(ops);
    expect(out.map((o) => `${o.op}@${o.clock}`)).toEqual(['remove@2', 'add@3', 'set@4']);
  });
});

describe('OpBatcher', () => {
  /** A hand-cranked clock: the tests decide when a frame happens, so nothing races. */
  function manual() {
    let pending: (() => void) | null = null;
    return {
      setTimer: (cb: () => void) => {
        pending = cb;
        return 1;
      },
      clearTimer: () => {
        pending = null;
      },
      tick: () => {
        const cb = pending;
        pending = null;
        cb?.();
      },
    };
  }

  it('a 60-frame drag becomes ONE message carrying ONE op', () => {
    const timer = manual();
    const flushed: Op[][] = [];
    const b = new OpBatcher({
      onFlush: (ops) => flushed.push(ops),
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    for (let i = 0; i < 60; i++) b.push(set('n1', 'position', { x: i, y: 0 }, i + 1));
    expect(flushed).toHaveLength(0); // nothing on the wire yet

    timer.tick();

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(1);
    expect((flushed[0][0] as { value: unknown }).value).toEqual({ x: 59, y: 0 });
    expect(b.queued - b.sent).toBe(59); // what coalescing saved
  });

  it('flushes IMMEDIATELY at maxBatch — a bulk import must not become one giant frame', () => {
    const timer = manual();
    const flushed: Op[][] = [];
    const b = new OpBatcher({
      onFlush: (ops) => flushed.push(ops),
      maxBatch: 10,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    // 10 DISTINCT registers, so coalescing cannot hide the backpressure.
    for (let i = 0; i < 10; i++) b.push(set(`n${i}`, 'position', { x: i, y: 0 }, i + 1));

    expect(flushed).toHaveLength(1); // …without the timer ever firing
    expect(flushed[0]).toHaveLength(10);
  });

  it('discard() drops the queue WITHOUT sending — the disconnect path', () => {
    const timer = manual();
    const flushed: Op[][] = [];
    const b = new OpBatcher({
      onFlush: (ops) => flushed.push(ops),
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });

    b.push(set('n1', 'position', { x: 1, y: 1 }, 1));
    b.discard();
    timer.tick();

    expect(flushed).toHaveLength(0);
    // Safe ONLY because the op is already in the local log — the reconnect's sync round is
    // what actually delivers it. `sync-adapter.spec.ts` proves that end to end.
  });

  it('an empty flush sends nothing at all — no heartbeat of empty frames', () => {
    const flushed: Op[][] = [];
    const b = new OpBatcher({ onFlush: (ops) => flushed.push(ops) });
    b.flush();
    b.flush();
    expect(flushed).toHaveLength(0);
    b.dispose();
  });
});
