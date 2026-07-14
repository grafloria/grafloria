// Wave 9 — Card 6: @mentions.
//
// ===========================================================================
// A SEAM, NOT A NOTIFICATION BACKEND
// ===========================================================================
//
// A diagram engine has no business owning email, push, Slack or a user directory. What
// it CAN own, and what nobody else can, is the two facts a notifier needs and cannot
// reconstruct: WHO was mentioned, and WHICH message mentioned them. That is the seam.
//
// THE HARD PART IS NOT PARSING. It is that a collaborative document has N peers, every
// one of which will observe the same @mention op, and every one of which will fire this
// event. Wire a naive notifier to it and Ada gets one email per peer that happened to
// have the file open. That is not a hypothetical: it is what happens the first time
// somebody does the obvious thing.
//
// So the event carries an IDEMPOTENCY KEY — `${threadId}:${messageId}` — which is the
// SAME string on every peer, forever, across reloads and replays, because it is derived
// from data carried in the op rather than from anything local. A host has two correct
// ways to use it, and the seam supports both:
//
//   • SERVER-SIDE (recommended): run the notifier on the relay/server replica only. It
//     sees every op exactly once and is the only peer that should hold mail credentials.
//   • CLIENT-SIDE: fire from every peer and DEDUPE ON `key` at the backend (an upsert on
//     a unique index, a Redis SETNX, whatever). The key makes that a one-liner.
//
// What a host must wire, in full:
//   1. an implementation of MentionNotifier (email/push/websocket/whatever),
//   2. a directory that maps the ids in `mentioned` to real users — the engine never
//      invents one, because a mention id is a HOST identifier and only the host knows
//      what `@ada` means,
//   3. deduplication on `key` (or a single privileged replica).
//
// Everything else is done here.

import type { CommentAnchor } from './types';

/** One @mention found in a message body. */
export interface MentionRef {
  /** The user id to notify. From `@[Name](id)` this is `id`; from `@handle` it is `handle`. */
  id: string;
  /** What was written on screen, for rendering the chip. */
  display: string;
  /** The exact source text, so a renderer can replace it in place. */
  raw: string;
  /** Character offset of `raw` in the body. */
  index: number;
}

/**
 * Two syntaxes, because two things are true at once.
 *
 * `@[Ada Lovelace](u_ada)` — what a real mention-PICKER emits: the display name and the
 * stable id, decoupled, so renaming Ada does not orphan the mention and two Adas do not
 * collide. This is the form the product should write.
 *
 * `@ada` — what a human TYPES. It is ambiguous by nature (a handle is not an id), and we
 * do not pretend otherwise: the id is the handle verbatim, and it is the host's directory
 * that decides whether `ada` resolves to anyone at all. Refusing to parse it would just
 * mean every host writes this regex again, worse.
 *
 * Ordered `@[...](...)` first so the explicit form is never mis-lexed as a bare handle.
 */
const EXPLICIT = /@\[([^\]\n]+)\]\(([^)\s]+)\)/g;
// A bare handle: letters, digits, dot, dash, underscore. Must not be preceded by a word
// character — otherwise every email address in a comment becomes a mention of its domain.
const BARE = /(^|[^\w@[\]()])@([A-Za-z0-9][\w.-]*)/g;

/**
 * Extract the mentions from a body. Pure, and total: never throws, never re-orders.
 *
 * Deduplicated by id — mentioning Ada three times in one message is one notification, not
 * three, and that is a property of the DATA, not of the notifier's retry policy.
 */
export function parseMentions(body: string): MentionRef[] {
  if (!body) return [];
  const found: MentionRef[] = [];
  const claimed: Array<[number, number]> = [];

  EXPLICIT.lastIndex = 0;
  for (let m = EXPLICIT.exec(body); m; m = EXPLICIT.exec(body)) {
    found.push({ id: m[2], display: m[1], raw: m[0], index: m.index });
    claimed.push([m.index, m.index + m[0].length]);
  }

  BARE.lastIndex = 0;
  for (let m = BARE.exec(body); m; m = BARE.exec(body)) {
    const at = m.index + m[1].length; // skip the required preceding character
    // Do not double-count the `@` of an explicit mention we already took.
    if (claimed.some(([s, e]) => at >= s && at < e)) continue;
    found.push({ id: m[2], display: m[2], raw: `@${m[2]}`, index: at });
  }

  found.sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  return found.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** Just the ids — what gets stored on the message register. */
export function mentionIds(body: string): string[] {
  return parseMentions(body).map((r) => r.id);
}

/**
 * What a notifier is handed. Everything it needs, nothing it would have to guess.
 *
 * `anchor` is in here on purpose: "Ada was mentioned" is useless; "Ada was mentioned in a
 * thread on the Payment gateway node" is a notification a human can act on without opening
 * the file.
 */
export interface MentionEvent {
  /**
   * STABLE ACROSS PEERS AND ACROSS REPLAYS. Dedupe on this or send N copies. See header.
   */
  key: string;
  diagramId: string;
  threadId: string;
  messageId: string;
  /** User ids. The host's directory turns these into people. */
  mentioned: string[];
  /** The user id of whoever wrote the message. */
  author: string;
  body: string;
  anchor: CommentAnchor;
  createdAt: number;
  /** True when this peer is the one that authored the message. */
  local: boolean;
}

/** The seam. One method. The engine calls it; the host implements it. */
export interface MentionNotifier {
  notify(event: MentionEvent): void;
}

/** The idempotency key. Derived only from op-borne data — never from local state. */
export function mentionKey(threadId: string, messageId: string): string {
  return `${threadId}:${messageId}`;
}
