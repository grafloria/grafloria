// Wave 9 — Card 6: unread markers.
//
// ===========================================================================
// READ STATE IS NOT DOCUMENT STATE. THIS IS THE WHOLE FILE.
// ===========================================================================
//
// Everything else in this card rides the op log, because everything else is a fact about
// the DOCUMENT. "Ada has read this thread" is not a fact about the document. It is a fact
// about Ada. Putting it in the shared log would be wrong three separate ways, and it is
// the single most common mistake in this feature:
//
//   1. WRONG SEMANTICS. Ada opens a thread; the op replicates; Ben's unread badge clears.
//      Ben never read it. The badge — the one thing whose entire job is to tell YOU what
//      YOU have not seen — now lies to everyone but the last person to scroll.
//   2. WRONG ECONOMICS. Reading is the most common action in a comment system by two
//      orders of magnitude. Making every read a broadcast op turns a passive act into
//      write traffic to every peer, and it puts it in the persisted history forever.
//   3. WRONG LIFETIME. It would be replayed, undone, and merged. Undoing a node move
//      should not mark a comment unread again.
//
// So read state is LOCAL, per viewer, and the seam to persist it is `toJSON()`/`fromJSON()`
// — the host puts it in localStorage or on its own user-scoped API. That is a seam with no
// machinery behind it, which is the correct amount for something the engine cannot know.
//
// (A product that genuinely wants shared "seen by" receipts wants a DIFFERENT feature —
// per-user receipts keyed by user id, which is additive shared data rather than a shared
// mutable flag. Not built, deliberately, and called out so nobody mistakes its absence
// for an oversight.)
//
// THE MARKER IS A WATERMARK, NOT A COUNT. We store the sort key of the newest message the
// viewer has seen in each thread. A count would be wrong the instant a message arrived
// out of order or a tombstone changed the length; a watermark is monotone and compares
// against the SAME total order the messages are displayed in (`messageKey`).

import { messageKey, type CommentMessage } from './types';

/** The serializable shape. Give this to the host to persist; hand it back on load. */
export interface SerializedReadState {
  viewer: string;
  /** threadId → the messageKey of the newest message this viewer has seen. */
  watermarks: Record<string, string>;
}

/**
 * What THIS viewer has seen. Local. Never synced.
 */
export class ReadState {
  private readonly watermarks = new Map<string, string>();

  constructor(readonly viewer: string) {}

  /**
   * Mark a thread read up to its newest message.
   *
   * Takes the messages rather than a key so the caller cannot accidentally set a
   * watermark ahead of the messages it has actually seen — which would silently swallow
   * a message that is still in flight.
   */
  markRead(threadId: string, messages: readonly CommentMessage[]): void {
    let max = this.watermarks.get(threadId) ?? '';
    for (const m of messages) {
      const k = messageKey(m);
      if (k > max) max = k;
    }
    if (max) this.watermarks.set(threadId, max);
  }

  /** Explicitly mark unread again (a "mark as unread" affordance). */
  markUnread(threadId: string): void {
    this.watermarks.delete(threadId);
  }

  /**
   * How many messages in this thread the viewer has not seen.
   *
   * A message YOU wrote is never unread — you were there. A tombstoned message is never
   * unread either: a badge that says "1 unread" and opens onto "message deleted" is a
   * badge that has wasted someone's attention, which is the only currency a notification
   * has.
   */
  unreadCount(threadId: string, messages: readonly CommentMessage[]): number {
    const mark = this.watermarks.get(threadId) ?? '';
    let n = 0;
    for (const m of messages) {
      if (m.deleted) continue;
      if (m.author === this.viewer) continue;
      if (messageKey(m) > mark) n++;
    }
    return n;
  }

  isRead(threadId: string, messages: readonly CommentMessage[]): boolean {
    return this.unreadCount(threadId, messages) === 0;
  }

  toJSON(): SerializedReadState {
    return { viewer: this.viewer, watermarks: Object.fromEntries(this.watermarks) };
  }

  static fromJSON(data: SerializedReadState): ReadState {
    const rs = new ReadState(data.viewer);
    for (const [k, v] of Object.entries(data.watermarks ?? {})) rs.watermarks.set(k, v);
    return rs;
  }
}
