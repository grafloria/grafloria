// Wave 9 — Card 5: the in-memory transport.
//
// SHIPPED, not a test double. Three real jobs:
//
//   1. THE TEST SUBSTRATE. Every convergence property in this wave is proven over this
//      transport, because it is the only one where "peer B has now received it" is a
//      statement you can make without a timer, a poll or a flake.
//   2. TWO PANES IN ONE PAGE. Split-view, a linked minimap, an embedded preview that must
//      track the live document — all of them are two Replicas in one JS context, and
//      routing that through a socket to a server and back would be absurd.
//   3. THE REFERENCE. It is 90 lines. If a new transport is longer than this plus its
//      protocol's framing, the author has put logic in the wrong layer.
//
// Delivery is SYNCHRONOUS: `send()` returns after every other peer's handler has run.
// That makes the tests deterministic and it is exactly what a same-thread bus should do.
// The `UnreliableHub` next door is the same class with the network's malice added back.

import type { ActorId } from '../../collab/op';
import type { SyncMessage } from '../protocol';
import type { SyncTransport, TransportStatus, Unsubscribe } from '../transport';

type Handler = (message: SyncMessage) => void;

/** A shared bus. One hub = one document = one "room". */
export class MemoryHub {
  protected readonly ports = new Set<MemoryTransport>();

  /** Every message that crossed the bus — the wire tap the tests assert against. */
  readonly traffic: Array<{ from: ActorId; message: SyncMessage }> = [];

  connect(actor: ActorId): MemoryTransport {
    const port = new MemoryTransport(this, actor);
    this.ports.add(port);
    return port;
  }

  /** Deliver to everyone EXCEPT the sender. A peer never hears its own echo. */
  deliver(from: MemoryTransport, message: SyncMessage): void {
    this.traffic.push({ from: from.actor, message });
    for (const port of [...this.ports]) {
      if (port === from) continue;
      port.accept(message);
    }
  }

  detach(port: MemoryTransport): void {
    this.ports.delete(port);
  }

  get peerCount(): number {
    return this.ports.size;
  }
}

export class MemoryTransport implements SyncTransport {
  private handlers = new Set<Handler>();
  private statusHandlers = new Set<(s: TransportStatus) => void>();
  private _status: TransportStatus = 'disconnected';
  private closed = false;

  constructor(
    private readonly hub: MemoryHub,
    readonly actor: ActorId
  ) {}

  get status(): TransportStatus {
    return this._status;
  }

  send(message: SyncMessage): void {
    // A send while down is a NO-OP, not an error. This is what a real socket does, and it
    // is what makes "the peer was offline for 30 seconds" a survivable event rather than
    // an exception to handle at every call site. The ops are in the log; the reconnect's
    // sync round delivers them.
    if (this.closed || this._status !== 'connected') return;
    this.hub.deliver(this, message);
  }

  /** Inbound. Ignored while disconnected — a dropped peer hears nothing, by definition. */
  accept(message: SyncMessage): void {
    if (this.closed || this._status !== 'connected') return;
    for (const h of [...this.handlers]) h(message);
  }

  onMessage(handler: Handler): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: (s: TransportStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  connect(): void {
    if (this.closed || this._status === 'connected') return;
    this.setStatus('connected');
  }

  disconnect(): void {
    if (this._status === 'disconnected') return;
    this.setStatus('disconnected');
  }

  close(): void {
    if (this.closed) return;
    this.disconnect();
    this.closed = true;
    this.hub.detach(this);
    this.handlers.clear();
    this.statusHandlers.clear();
  }

  private setStatus(next: TransportStatus): void {
    this._status = next;
    for (const h of [...this.statusHandlers]) h(next);
  }
}
