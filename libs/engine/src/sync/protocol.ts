// Wave 9 (Collaboration) — Card 5: the wire protocol.
//
// Five message kinds, all JSON-safe, all small. The protocol is deliberately
// transport-agnostic: it says nothing about sockets, rooms, servers or framing. A
// transport's ONLY job is to move a `SyncMessage` from one peer to the others; every
// decision that matters — batching, catch-up, causal readiness, awareness lifetime —
// is made above it, in the SyncAdapter, and is therefore tested once and works for
// every transport.
//
// ---------------------------------------------------------------------------
// THE ONE LINE THAT MATTERS: AWARENESS IS NOT AN OP
// ---------------------------------------------------------------------------
//
// `ops` and `awareness` are DIFFERENT MESSAGE KINDS, and that is not cosmetic — it is
// the load-bearing separation in this card.
//
// A document op is durable, causally ordered, replayable and persisted forever. A cursor
// position is none of those things: it is ephemeral, emitted at 60Hz, meaningless five
// seconds later, and meaningless AT ALL once its author closes the tab. Put a cursor in
// the op log and you have (a) permanently poisoned the document's history with
// megabytes of mouse jitter, (b) made "replay the log" reproduce someone's mouse
// movements from last March, and (c) given every cursor sample a Lamport clock, which
// pushes every real edit's clock into the millions for no reason whatsoever.
//
// So awareness travels on the same WIRE and never touches the LOG. Different lifecycle
// (last-write-wins per peer, expires on timeout), different delivery guarantee (none —
// dropping a cursor sample costs you nothing, the next one is 16ms away), different
// storage (a Map that is emptied when you disconnect).
//
// There is a test that asserts precisely this: drive a thousand cursor moves through a
// live adapter and assert the op log is still EMPTY.

import type { ActorId, Op } from '../collab/op';
import type { VersionVectorJSON } from './version-vector';

/** Anything a peer publishes about ITSELF that is not a document edit. */
export interface AwarenessState {
  /** Human name for the badge. */
  name?: string;
  /** CSS colour. Derived deterministically from the actor id when absent. */
  color?: string;
  /** Pointer position in WORLD coordinates — never screen: peers have different cameras. */
  cursor?: { x: number; y: number } | null;
  /** Entity ids this peer has selected. */
  selection?: string[];
  /** Free-form (a "typing…" flag, a viewport rect for follow-mode, …). */
  [key: string]: unknown;
}

/**
 * "I have joined." Carries the sender's frontier so an existing peer can push the
 * newcomer the history it lacks WITHOUT the newcomer having to ask a second time.
 */
export interface HelloMessage {
  t: 'hello';
  from: ActorId;
  vv: VersionVectorJSON;
  /** The sender's presence, so peers see the badge on the join frame, not 5s later. */
  awareness?: AwarenessState;
}

/**
 * "This is what I have — send me what I am missing."
 *
 * The anti-entropy request. Sent on join, on RECONNECT, and periodically (a transport
 * that can drop a message can drop an op, and the only thing that repairs that is
 * asking again).
 */
export interface SyncMessage_ {
  t: 'sync';
  from: ActorId;
  vv: VersionVectorJSON;
  /**
   * Ask the recipient to answer with its OWN `sync` so we can push it what IT lacks.
   * False on the reply, or two peers ping-pong sync requests forever.
   */
  reply: boolean;
}

/** A batch of document ops. The only message that reaches the op log. */
export interface OpsMessage {
  t: 'ops';
  from: ActorId;
  ops: Op[];
}

/** Ephemeral presence. NEVER reaches the op log. See the header. */
export interface AwarenessMessage {
  t: 'awareness';
  from: ActorId;
  /** null ⇒ this peer is gone (an explicit, immediate tombstone; the TTL is the backup). */
  state: AwarenessState | null;
  /**
   * Per-peer sequence. Awareness is last-write-wins PER PEER, and a reordering
   * transport will hand you an old cursor after a new one — without this, the cursor
   * jumps backwards. It is not a Lamport clock: peers never compare each other's
   * awareness, only their own successive samples.
   */
  seq: number;
}

/** "I am leaving." Best-effort — the TTL is what actually guarantees cleanup. */
export interface ByeMessage {
  t: 'bye';
  from: ActorId;
}

export type SyncMessage =
  | HelloMessage
  | SyncMessage_
  | OpsMessage
  | AwarenessMessage
  | ByeMessage;

/** True for the ONE message kind that is allowed to touch the durable log. */
export function isDocumentMessage(msg: SyncMessage): msg is OpsMessage {
  return msg.t === 'ops';
}
