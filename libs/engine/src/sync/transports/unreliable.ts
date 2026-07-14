// Wave 9 — Card 5: THE HOSTILE TRANSPORT.
//
// This is the most important file in the card, and it is a test fixture that ships.
//
// A transport that works is not evidence of anything. The in-memory hub delivers every
// message exactly once, in order, instantly — and under those conditions a completely
// broken sync layer looks perfect. Every bug this card exists to prevent (the causal
// drop, the frontier hole, the coalescer that keeps the wrong write) is INVISIBLE on a
// healthy channel and fatal on a real one. So the only way to know whether the
// composition holds is to build a channel that behaves like the worst afternoon your
// users will ever have, and demand convergence anyway.
//
// It does, on purpose, all at once, with a seeded PRNG so a failure is a bug report and
// not a ghost story:
//
//   DROPS      — a message vanishes. Nothing retransmits it. The ONLY thing that ever
//                recovers it is an anti-entropy round, which is exactly the mechanism
//                under test.
//   DUPLICATES — a message is delivered twice (or five times). Every real transport does
//                this; a WebSocket reconnect replays, a peer re-sends on timeout, a mesh
//                relays the same op from two directions.
//   REORDERS   — messages are held and released out of order, so a `set` overtakes the
//                `add` it depends on. This is the one that used to be unrecoverable.
//   DELAYS     — a message arrives after later messages, and after the peer has already
//                edited the same register. The LWW gate must REFUSE it.
//   PARTITIONS — `disconnect()` / `connect()`, so both halves edit blind and must merge.
//
// WHY DELIVERY IS PUMPED BY HAND (`step()`), NOT BY A TIMER
// A fuzz that depends on wall-clock timers is a fuzz that fails once a fortnight on CI
// for reasons no one can reproduce, and gets deleted within a month. Here the test IS the
// clock: `step()` releases some of the in-flight queue, and the harness decides when.
// Nothing is racing anything, the seed reproduces the failure exactly, and a red test is
// a bug rather than a mood.
//
// WHY THE NETWORK IS HEALED BEFORE THE FINAL ASSERT
// Convergence under PERMANENT loss is impossible — an op that is never delivered, by any
// route, at any time, cannot be merged, and no algorithm in the literature claims
// otherwise. So the shape of an honest test is: be savage while they edit, then heal, then
// run anti-entropy, THEN demand byte-identical documents. The savagery is what creates the
// holes; the healing is what lets the repair prove it can close them. A fuzz that never
// heals proves nothing except that the assert is unreachable.

import type { ActorId } from '../../collab/op';
import type { SyncMessage } from '../protocol';
import { MemoryHub, MemoryTransport } from './memory';

/** Deterministic PRNG (mulberry32). A fuzz you cannot replay is an anecdote. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface UnreliableOptions {
  seed?: number;
  /** P(message is simply never delivered). */
  dropRate?: number;
  /** P(message is delivered more than once). */
  duplicateRate?: number;
  /** P(message is held in flight instead of delivered now) — this is what reorders. */
  delayRate?: number;
  /** Max extra copies when duplicating. */
  maxDuplicates?: number;
}

interface InFlight {
  to: MemoryTransport;
  message: SyncMessage;
}

/**
 * A `MemoryHub` with the network's malice put back.
 *
 * Same API, same adapters, same protocol — the ONLY difference is that this one behaves
 * like the internet. If the sync layer is correct, nothing above it needs to change; if
 * it is not, this is where you find out.
 */
export class UnreliableHub extends MemoryHub {
  private readonly rand: () => number;
  private readonly inFlight: InFlight[] = [];

  private dropRate: number;
  private duplicateRate: number;
  private delayRate: number;
  private readonly maxDuplicates: number;

  /** What the network actually did. Asserted on — a fuzz whose faults never fired is a lie. */
  readonly faults = { dropped: 0, duplicated: 0, delayed: 0, delivered: 0 };

  constructor(options: UnreliableOptions = {}) {
    super();
    this.rand = mulberry32(options.seed ?? 1);
    this.dropRate = options.dropRate ?? 0.2;
    this.duplicateRate = options.duplicateRate ?? 0.15;
    this.delayRate = options.delayRate ?? 0.35;
    this.maxDuplicates = options.maxDuplicates ?? 2;
  }

  override deliver(from: MemoryTransport, message: SyncMessage): void {
    this.traffic.push({ from: from.actor, message });

    for (const port of [...this.ports]) {
      if (port === from) continue;

      if (this.rand() < this.dropRate) {
        this.faults.dropped++;
        continue;
      }

      // A structured-clone stand-in. It is not decoration: without it, two "peers" in one
      // process share op OBJECTS, and a bug where one peer mutates an op in place would
      // be invisible here and explode across a real socket. Peers must not share memory.
      const copy = (): SyncMessage => JSON.parse(JSON.stringify(message)) as SyncMessage;

      const copies = 1 + (this.rand() < this.duplicateRate ? 1 + Math.floor(this.rand() * this.maxDuplicates) : 0);
      if (copies > 1) this.faults.duplicated += copies - 1;

      for (let i = 0; i < copies; i++) {
        if (this.rand() < this.delayRate) {
          this.faults.delayed++;
          this.inFlight.push({ to: port, message: copy() });
        } else {
          this.faults.delivered++;
          port.accept(copy());
        }
      }
    }
  }

  /**
   * Release some of the in-flight queue, in a RANDOM order.
   *
   * The random order is the point. A FIFO flush would only ever produce late delivery, and
   * late-but-ordered is the easy case — the LWW gate handles it alone. Releasing out of
   * order is what lets a `set` land before its `add`, which is the case that used to be
   * unrecoverable and is the reason `CausalBuffer` exists.
   */
  step(fraction = 0.5): number {
    if (this.inFlight.length === 0) return 0;

    const n = Math.max(1, Math.floor(this.inFlight.length * fraction));
    let released = 0;

    for (let i = 0; i < n && this.inFlight.length > 0; i++) {
      const idx = Math.floor(this.rand() * this.inFlight.length);
      const [item] = this.inFlight.splice(idx, 1);
      // A held message for a peer who has since dropped is simply lost — which is exactly
      // what a real network does to a packet whose destination went away, and exactly the
      // hole anti-entropy has to be able to close.
      item.to.accept(item.message);
      this.faults.delivered++;
      released++;
    }
    return released;
  }

  /**
   * Stop breaking things. The network has recovered; from here on it is a plain, honest
   * bus. Anything still lost was lost DURING the storm, and anti-entropy — not the
   * transport — is what has to find it.
   */
  heal(): void {
    this.dropRate = 0;
    this.duplicateRate = 0;
    this.delayRate = 0;
  }

  /** Deliver everything still in flight. */
  settle(): void {
    while (this.inFlight.length > 0) this.step(1);
  }

  get inFlightCount(): number {
    return this.inFlight.length;
  }

  override connect(actor: ActorId): MemoryTransport {
    return super.connect(actor);
  }
}
