// Wave 9 — Card 5: the transport seam.
//
// This interface is deliberately, aggressively small. Six members, none of them clever.
// Everything a collaboration engine actually has to get right — batching, catch-up after
// a reconnect, causal readiness, duplicate suppression, awareness expiry — lives ABOVE
// this line, in `SyncAdapter`, where it is written once and tested once.
//
// That is the entire point of "transport-agnostic". If the hard parts lived in the
// transport, then adding WebRTC would mean re-implementing (and re-earning trust in)
// reconnect and de-duplication for a third time, and the third implementation would have
// a bug the first two do not. Here, a new transport is: move bytes, tell me when you are
// up, tell me when you are down. Forty lines. It CANNOT get convergence wrong because it
// is not allowed to know what convergence is.
//
// WHAT A TRANSPORT MAY DO TO YOU, AND IS ALLOWED TO:
//   • drop a message      (the adapter's anti-entropy re-requests it)
//   • deliver it twice    (the op log de-duplicates by opId)
//   • deliver out of order(the LWW gate refuses superseded ops; the causal buffer holds
//                          the ones that arrived before their dependency)
//   • deliver it late     (same as out of order)
//   • disconnect and come back (the adapter re-syncs from its frontier)
//
// None of those are bugs to be fixed in the transport. They are the CONTRACT. The proof
// is `hostile-transport.spec.ts`, which does all five at once, on purpose, with a seeded
// PRNG, and demands convergence anyway.

import type { SyncMessage } from './protocol';

export type Unsubscribe = () => void;

export type TransportStatus = 'connected' | 'disconnected';

/**
 * A pipe that moves `SyncMessage`s between peers.
 *
 * The delivery model is BROADCAST-TO-OTHERS: `send()` delivers to every other peer on
 * the channel and never echoes back to the sender. (A star topology through a server, a
 * BroadcastChannel between tabs, and a full WebRTC mesh all present this way; a
 * point-to-point transport presents itself as a channel with one other peer.)
 */
export interface SyncTransport {
  /** Broadcast to the other peers. A no-op — NOT an error — while disconnected. */
  send(message: SyncMessage): void;

  /** Inbound messages from other peers. Never our own. */
  onMessage(handler: (message: SyncMessage) => void): Unsubscribe;

  /**
   * Connection transitions. THE hook the whole reconnect story hangs on: the adapter
   * subscribes here and fires an anti-entropy round the moment it hears 'connected'
   * again. A transport that never reports its status can never be caught up.
   */
  onStatus(handler: (status: TransportStatus) => void): Unsubscribe;

  readonly status: TransportStatus;

  /** Open (or re-open) the channel. Idempotent. */
  connect(): void;

  /** Close the channel but stay re-openable — this is what a "drop" is. */
  disconnect(): void;

  /** Tear down for good. */
  close(): void;
}
