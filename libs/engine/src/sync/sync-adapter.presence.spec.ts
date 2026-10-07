// Remote cursors under the DEFAULT options.
//
// A peer that crashes sends nothing: no `bye`, no more awareness. Its cursor must
// still expire, with no presence option set at all. A peer that is alive but idle
// (cursor resting) must NOT expire, and a peer that leaves cleanly disappears at once.
//
// The clock and the interval timers are injected, so "20 seconds later" is exact.

import { DiagramModel } from '../models/DiagramModel';
import { createSyncSession, type SyncAdapter, type SyncAdapterOptions } from './sync-adapter';
import { MemoryHub, MemoryTransport } from './transports/memory';

/** One shared clock and interval scheduler for every peer in a test. */
function scheduler() {
  let now = 1_000;
  let nextId = 1;
  const intervals = new Map<number, { cb: () => void; ms: number; due: number }>();
  return {
    now: () => now,
    setInterval: (cb: () => void, ms: number) => {
      const id = nextId++;
      intervals.set(id, { cb, ms, due: now + ms });
      return id;
    },
    clearInterval: (id: unknown) => {
      intervals.delete(id as number);
    },
    get active() {
      return intervals.size;
    },
    /** Move the clock forward, firing every interval that comes due, in time order. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let next: { id: number; due: number } | null = null;
        for (const [id, t] of intervals) if (t.due <= end && (!next || t.due < next.due)) next = { id, due: t.due };
        if (!next) break;
        const t = intervals.get(next.id)!;
        now = t.due;
        t.due += t.ms;
        t.cb();
      }
      now = end;
    },
  };
}

type Clock = ReturnType<typeof scheduler>;

function peer(hub: MemoryHub, actor: string, clock: Clock, options: SyncAdapterOptions = {}): SyncAdapter {
  const a = createSyncSession(new DiagramModel('shared', { id: 'd', uuid: 'u' }), hub.connect(actor), {
    actor,
    batch: { intervalMs: 1_000_000, maxBatch: 10_000 },
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    awarenessThrottleMs: 0,
    ...options,
  });
  a.join();
  return a;
}

/** The peer's tab dies: from now on it sends nothing at all — not even a goodbye. */
function crash(a: SyncAdapter): void {
  const transport = (a as unknown as { transport: MemoryTransport }).transport;
  transport.send = () => undefined;
}

describe('remote cursors expire with the default options', () => {
  it("a crashed peer's cursor is gone within the awareness timeout", () => {
    const clock = scheduler();
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice', clock);
    const bob = peer(hub, 'bob', clock);

    alice.setAwareness({ cursor: { x: 10, y: 20 } });
    expect(bob.awareness.getPeer('alice')?.state.cursor).toEqual({ x: 10, y: 20 });

    crash(alice);
    clock.advance(25_000);

    expect(bob.awareness.getPeer('alice')).toBeUndefined();
    alice.dispose();
    bob.dispose();
  });

  it('an idle peer that is still there keeps its cursor', () => {
    const clock = scheduler();
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice', clock);
    const bob = peer(hub, 'bob', clock);

    alice.setAwareness({ cursor: { x: 10, y: 20 } });
    clock.advance(120_000); // two minutes, the hand resting on the mouse

    expect(bob.awareness.getPeer('alice')?.state.cursor).toEqual({ x: 10, y: 20 });
    expect(alice.awareness.getPeer('bob')).toBeDefined();
    alice.dispose();
    bob.dispose();
  });

  it('a peer that leaves cleanly disappears at once', () => {
    const clock = scheduler();
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice', clock);
    const bob = peer(hub, 'bob', clock);
    alice.setAwareness({ cursor: { x: 1, y: 1 } });
    expect(bob.awareness.peerCount).toBe(1);

    alice.dispose();
    expect(bob.awareness.peerCount).toBe(0);
    bob.dispose();
  });

  it('with the heartbeat turned off, a silent peer still expires', () => {
    const clock = scheduler();
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice', clock, { heartbeatMs: 0 });
    const bob = peer(hub, 'bob', clock, { heartbeatMs: 0, awarenessTimeoutMs: 5_000 });

    alice.setAwareness({ cursor: { x: 1, y: 1 } });
    const sent = alice.stats.messagesSent;
    clock.advance(8_000);

    expect(bob.awareness.peerCount).toBe(0);
    // …and no heartbeat went out: turning it off still means off.
    expect(alice.stats.messagesSent).toBe(sent);
    alice.dispose();
    bob.dispose();
  });

  it('stops every presence timer on dispose', () => {
    const clock = scheduler();
    const hub = new MemoryHub();
    const alice = peer(hub, 'alice', clock);
    alice.dispose();
    expect(clock.active).toBe(0);
  });
});
