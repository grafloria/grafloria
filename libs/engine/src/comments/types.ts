// Wave 9 (Collaboration) — Card 6: comments, annotations & @mentions.
//
// ===========================================================================
// WHERE COMMENTS LIVE, AND WHY
// ===========================================================================
//
// Comments RIDE THE OP LOG. They are not a side store. `diagram.comments` is a
// register namespace on the model, written through the same `set(diagram, …)` ops
// as everything else, so a comment gets convergence, transport, persistence and
// causal ordering for free — the same four things every other card had to build.
//
//   • CONVERGENCE. Two people commenting on the same node, offline, must both keep
//     their comment. Riding the log means the LWW register table (Card 0) already
//     decides this — provided the REGISTERS ARE CUT CORRECTLY, which is the whole
//     of the design below.
//   • TRANSPORT. The sync card (Card 5) ships ops. Comments ship with them. No second
//     channel, no second auth handshake, no second reconnect/backfill path.
//   • PERSISTENCE. serialize() → save → fromJSON, and replay(log) reconstructs the
//     comments exactly as it reconstructs the nodes.
//   • CAUSALITY. A comment saying "delete this box" and the deletion of the box are
//     ordered against each other by the same Lamport clock. Two clocks would not be.
//
// THE ARGUMENT FOR A SEPARATE STORE, honestly: comments are unbounded text, they are
// a distinct privacy/ACL surface (a reviewer may comment but not edit), and you may
// want to load them lazily. That is a real argument, and it is answered WITHOUT a
// second store: the register namespace `comments.*` IS the seam. A host that wants
// separate storage or separate ACLs filters ops by `op.path.startsWith('comments.')`
// at the transport — a three-line predicate — and gets both. Splitting the store to
// buy that would cost a second clock, and a second clock is not free (see below).
//
// A SECOND CLOCK IS A BUG, not a design choice. `opId()` is `${clock}@${actor}`. Give
// comments their own LamportClock under the same actor and the very first comment
// mints op id `1@alice` — which the OpLog has already seen (alice's first node edit)
// and therefore SILENTLY DROPS. The comment is gone. No error. That single fact is
// what makes "reuse the diagram's op stream" the only cheap answer.
//
// ===========================================================================
// HOW THE REGISTERS ARE CUT — the part that decides whether comments survive
// ===========================================================================
//
// A register is a property path, and LWW resolves two writes to the SAME path. So the
// cut of the paths IS the concurrency semantics. Two rules, both load-bearing:
//
//   1. ONE MESSAGE = ONE REGISTER (`comments.<tid>.messages.<mid>`).
//      This is the rule that makes concurrent replies safe. Two people replying to the
//      same thread while offline write to DIFFERENT registers (different message ids),
//      so LWW never has to choose and BOTH replies survive. Store the messages as a
//      single `messages: [...]` array register instead — the obvious shape — and the
//      two replies collide on one register, LWW picks one, and somebody's comment is
//      deleted by a stranger. Silently. (There is a test that builds exactly that
//      wrong design and watches it lose a message, so the claim is demonstrated and
//      not merely asserted.)
//
//   2. THE WRITTEN PATHS ARE PREFIX-FREE. No path we ever write is a prefix of another
//      path we ever write. This is not tidiness, it is correctness under out-of-order
//      delivery: `set(comments.t1)` and `set(comments.t1.status)` are DIFFERENT LWW
//      registers, so the gate cannot order them — whichever is APPLIED last wins, and
//      arrival order is a property of the network. A late whole-thread write would
//      silently wipe a resolve. So a thread is written as leaves:
//
//          comments.<tid>.head              { id, author, createdAt }   — write-once
//          comments.<tid>.anchor            CommentAnchor               — re-anchorable
//          comments.<tid>.status            { resolved, by, at }        — resolve/reopen
//          comments.<tid>.messages.<mid>    CommentMessage              — one per message
//
//      `comments.<tid>` and `comments.<tid>.messages` are NEVER written. The fuzz test
//      asserts prefix-freedom over every op the store has ever emitted, so this cannot
//      rot.
//
// A consequence, faced rather than hidden: a thread arrives as SEVERAL ops, and an
// unreliable transport can deliver a message before the head that owns it. The read
// model therefore treats an incomplete thread as INVISIBLE, not as a crash and not as
// a half-thread — it appears, whole, when its head lands. See `readThreads`.

/** A point in WORLD space. Never screen space — see CommentAnchor. */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * WHAT A COMMENT IS ABOUT.
 *
 * ANCHOR BY IDENTITY, NEVER BY COORDINATES — for anything that has an identity. A
 * comment pinned to (420, 180) is a comment about whatever happens to be at (420, 180)
 * *right now*, which after one auto-layout is a different node and a different meaning.
 * The comment would still be there, still timestamped, still confidently wrong. So a
 * node/link anchor stores the ENTITY ID and derives its position from the live entity
 * every frame; move the node across the canvas and the pin comes with it, and not one
 * op is emitted to make that happen (position is derived, and derived state is never
 * synced — the same rule capture.ts applies to link routes).
 *
 * A FREE-REGION anchor genuinely is coordinates, and they are WORLD coordinates. Screen
 * coordinates would make the pin's meaning depend on the reader's scroll position and
 * zoom — a note about the top-right corner of a subsystem would drift onto empty canvas
 * the moment anyone panned. World coordinates are invariant under pan and zoom by
 * construction, and the renderer draws them inside the viewBox, so the pin sticks to
 * the diagram rather than to the glass.
 *
 * `fallback` and `targetLabel` are the ANCHOR'S OBITUARY: where the target was and what
 * it was called, captured at the moment the thread was created. They exist for exactly
 * one purpose — so that a thread whose target has been DELETED can still be shown, in
 * the right place, saying what it was about. See ResolvedAnchor.
 */
export type CommentAnchor =
  | {
      kind: 'node';
      /** The node this thread is about. The pin follows it. */
      id: string;
      /** Where it was when the thread was created. Used only if the node is gone. */
      fallback: WorldPoint;
      /** What it was called when the thread was created. Used only if the node is gone. */
      targetLabel?: string;
    }
  | {
      kind: 'link';
      id: string;
      fallback: WorldPoint;
      targetLabel?: string;
    }
  | {
      /** A note about a REGION of the canvas, attached to nothing. World coordinates. */
      kind: 'region';
      x: number;
      y: number;
      width?: number;
      height?: number;
    };

/** Write-once thread identity. One register, so a thread appears whole or not at all. */
export interface CommentThreadHead {
  id: string;
  /** The PERSON who started the thread (a user id, not a session/actor id). */
  author: string;
  /**
   * Wall-clock milliseconds, captured at authoring time and carried IN the op.
   *
   * The substrate bans wall time from deciding CAUSALITY, and rightly: a clock that
   * runs backwards would corrupt merge. It does not ban wall time from being DATA.
   * `Date.now()` read inside a reducer destroys replay determinism; `Date.now()`
   * captured into an op's payload at the moment a human pressed Enter is just a
   * number, identical on every peer forever. This is the latter.
   */
  createdAt: number;
}

/** Resolve/reopen. ONE register, so the flag and its attribution can never split. */
export interface CommentThreadStatus {
  resolved: boolean;
  by: string;
  at: number;
}

/**
 * One message. ONE register — the rule that makes concurrent replies survive.
 *
 * An edit rewrites the whole register (an edit IS a whole-body replacement, so nothing
 * is gained by splitting it). A delete rewrites it as a TOMBSTONE — `deleted: true`,
 * body cleared, author and createdAt kept — rather than removing the key, because
 * removing it would let a concurrent edit resurrect the message with no body, and
 * because the ordering of the surviving messages must not shift under a peer that has
 * not yet seen the delete.
 */
export interface CommentMessage {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  /** User ids extracted from the body at authoring time. Convergent, queryable. */
  mentions?: string[];
  editedAt?: number;
  deleted?: boolean;
}

/** The raw register tree as it sits on the model and in the serialized document. */
export interface StoredThread {
  head?: CommentThreadHead;
  anchor?: CommentAnchor;
  status?: CommentThreadStatus;
  messages?: Record<string, CommentMessage>;
}
export type CommentRegisterTree = Record<string, StoredThread>;

/**
 * WHERE A THREAD'S PIN GOES, AND WHETHER ITS SUBJECT STILL EXISTS.
 *
 * `attached` is DERIVED — computed from the live diagram on every read, never stored
 * and never synced. That is the single most important decision in this file, and it is
 * argued at length in comment-store.ts (`resolveAnchor`).
 */
export interface ResolvedAnchor {
  /** World coordinates for the pin. */
  point: WorldPoint;
  /** False ⇒ ORPHANED: the node/link this thread is about is not in the diagram. */
  attached: boolean;
  /** The live label if attached; the snapshot taken at anchor time if not. */
  targetLabel: string;
  targetKind: 'node' | 'link' | 'region';
  targetId?: string;
}

/** A thread, assembled for reading: sorted messages, derived anchor, viewer's unread count. */
export interface CommentThreadView {
  id: string;
  author: string;
  createdAt: number;
  anchor: CommentAnchor;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: number;
  /** Total order, identical on every peer. Tombstones included (flagged `deleted`). */
  messages: CommentMessage[];
  /** Messages this viewer has not seen, authored by someone else. LOCAL, never synced. */
  unread: number;
  /** Derived from the live diagram — see ResolvedAnchor. */
  resolvedAnchor: ResolvedAnchor;
}

/**
 * THE TOTAL ORDER ON MESSAGES.
 *
 * Every peer must list a thread's messages in the SAME order or two people reading the
 * same conversation read different conversations. `(createdAt, author, id)` is total
 * (ids are unique) and it is computed from data that travels IN the ops, so it is
 * identical on every peer and stable across replay.
 *
 * It is wall time, and that is a deliberate, bounded concession. Wall time may not
 * decide MERGE — a skewed clock deciding which edit wins is silent data loss, which is
 * why the substrate uses Lamport clocks for that and why this function is not used for
 * anything but display order. Wall time deciding the ORDER OF A CHAT LIST is what every
 * messaging product on earth does, and its worst case is cosmetic: two messages sent
 * within the clock skew of each other may read in the wrong order. Nobody loses a
 * comment. (The alternative — a per-message Lamport stamp — is unavailable without
 * reaching into OpCapture's clock, and buying strict causal order for a chat list at
 * the price of a second way to mint stamps is a bad trade.)
 */
export function messageOrder(a: CommentMessage, b: CommentMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  if (a.author !== b.author) return a.author < b.author ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The sort key of a message, as an opaque comparable string. Used by read-state. */
export function messageKey(m: CommentMessage): string {
  return `${String(m.createdAt).padStart(16, '0')}|${m.author}|${m.id}`;
}
