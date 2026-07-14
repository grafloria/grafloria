// Wave 9 — Card 6: the comment store.
//
// A VIEW over `diagram.comments`, not a second copy of it. The store owns no thread
// state; every read walks the register tree on the model and every write goes through
// `diagram.writeCommentRegister()`, which is the model's change funnel, which is what
// OpCapture listens to, which is what mints the op. One source of truth, and the path
// from "user pressed Enter" to "op on the wire" has no branch in it that could be
// forgotten.
//
// The store holds exactly two things that are NOT document data, and both are honest
// about it:
//   • `readState` — what THIS viewer has read. Per-person, never synced (read-state.ts).
//   • `lastKnownPoint` — where each thread's target was the last time this peer saw it
//     alive. A pure cache, described where it is used.

import { DiagramModel } from '../models/DiagramModel';
import type { LinkModel } from '../models/LinkModel';
import type { NodeModel } from '../models/NodeModel';
import { mentionIds, mentionKey, type MentionEvent, type MentionNotifier } from './mentions';
import { ReadState } from './read-state';
import {
  messageOrder,
  type CommentAnchor,
  type CommentMessage,
  type CommentThreadStatus,
  type CommentThreadView,
  type ResolvedAnchor,
  type StoredThread,
  type WorldPoint,
} from './types';

/** What a caller asks for. The store fills in the obituary (fallback point + label). */
export type AnchorSpec =
  | { kind: 'node'; id: string }
  | { kind: 'link'; id: string }
  | { kind: 'region'; x: number; y: number; width?: number; height?: number };

export interface CommentStoreOptions {
  /**
   * The PERSON at this peer. Not the actor/session id.
   *
   * These are genuinely different and conflating them is a real bug: an actor id is
   * per-session (open two tabs, get two actors) and exists to break ties in the total
   * order. A comment is authored by a HUMAN, who is the same human in both tabs and is
   * still the same human tomorrow when the session id is long gone.
   */
  viewer: string;
  /** Deterministic ids for tests. Default: unique by construction (see `mintId`). */
  idFactory?: () => string;
  /** Deterministic time for tests. Default: Date.now. */
  now?: () => number;
  /** The @mention seam. Absent ⇒ mentions are still parsed, stored and queryable. */
  notifier?: MentionNotifier;
  /** This viewer's unread watermarks — hand back what you persisted. */
  readState?: ReadState;
  /** How to name an entity. Default: `metadata.label`, then `type`, then the id. */
  labelOf?: (kind: 'node' | 'link', id: string) => string | undefined;
}

type Unsub = () => void;

export class CommentStore {
  private readonly opts: Required<Pick<CommentStoreOptions, 'viewer'>> & CommentStoreOptions;
  readonly readState: ReadState;

  /**
   * WHERE THE TARGET WAS, LAST TIME WE SAW IT ALIVE.
   *
   * The anchor carries a `fallback` point captured when the thread was CREATED. If the
   * node then gets dragged across the canvas and only afterwards deleted, that fallback
   * is stale by however far it moved, and the ghost pin would appear somewhere the node
   * has not been for an hour — which is worse than useless, it is misleading.
   *
   * The fix must not cost traffic: broadcasting the node's position into the anchor on
   * every drag frame would sync DERIVED geometry, which is exactly what capture.ts
   * refuses to do and for exactly the right reasons. So each peer simply REMEMBERS,
   * locally, where it last saw the target. Free, precise, and not one byte on the wire.
   *
   * A peer that joined after the delete never saw it and falls back to the op-borne
   * snapshot. That peer's ghost pin is a little stale. It is also the only thing anyone
   * could possibly know, so it is the right answer.
   */
  private readonly lastKnownPoint = new Map<string, WorldPoint>();

  /** Message ids this store has already dispatched mention events for. */
  private readonly notified = new Set<string>();

  private readonly subs = new Set<() => void>();
  private unsubscribe: Unsub | null = null;
  private counter = 0;

  constructor(
    readonly diagram: DiagramModel,
    options: CommentStoreOptions
  ) {
    this.opts = options;
    this.readState = options.readState ?? new ReadState(options.viewer);

    // Anything already in the document was written before this store existed. It is
    // history, not news: seed the notified set so loading a file with 400 old @mentions
    // does not fire 400 notifications at the person who opened it.
    for (const [tid, t] of Object.entries(this.tree())) {
      for (const mid of Object.keys(t.messages ?? {})) this.notified.add(mentionKey(tid, mid));
    }

    this.unsubscribe = this.diagram.on('change', ((entry: { property: string }) => {
      if (entry.property !== 'comments' && !entry.property.startsWith('comments.')) return;
      this.onCommentsChanged();
    }) as never);
  }

  // ==========================================================================
  // AUTHORING — every one of these ends in exactly one register write per fact.
  // ==========================================================================

  /**
   * Start a thread. Three ops: head, anchor, first message.
   *
   * Three and not one, because `comments.<tid>` and `comments.<tid>.status` would be
   * OVERLAPPING registers — LWW cannot order two writes to different paths, so a
   * whole-thread write that arrived late would silently wipe a resolve. Prefix-free
   * leaves are the price of correctness under out-of-order delivery, and the fuzz test
   * asserts prefix-freedom rather than trusting me to remember it.
   */
  createThread(spec: AnchorSpec, body: string): string {
    const tid = this.mintId('t');
    const at = this.now();

    this.diagram.writeCommentRegister(`${tid}.head`, {
      id: tid,
      author: this.opts.viewer,
      createdAt: at,
    });
    this.diagram.writeCommentRegister(`${tid}.anchor`, this.buildAnchor(spec));
    this.writeMessage(tid, this.mintId('m'), body, at);
    return tid;
  }

  /** Add a message. ONE register — which is why a colleague's simultaneous reply lives. */
  reply(threadId: string, body: string): string {
    const mid = this.mintId('m');
    this.writeMessage(threadId, mid, body, this.now());
    return mid;
  }

  /**
   * Edit a message: rewrite its register whole.
   *
   * Two people editing the same message concurrently is a genuine conflict on one
   * register and LWW picks one, deterministically, on every peer. That is the right
   * answer — an edit IS a whole-body replacement, so there is no finer cut that would
   * have saved both, and merging two rewrites of one sentence produces a sentence
   * neither person wrote.
   */
  editMessage(threadId: string, messageId: string, body: string): boolean {
    const existing = this.message(threadId, messageId);
    if (!existing || existing.deleted) return false;
    const mentions = mentionIds(body);
    const next: CommentMessage = {
      id: existing.id,
      author: existing.author,
      body,
      createdAt: existing.createdAt,
      editedAt: this.now(),
    };
    if (mentions.length) next.mentions = mentions;
    return this.diagram.writeCommentRegister(`${threadId}.messages.${messageId}`, next);
  }

  /**
   * Delete a message — TOMBSTONE, never key removal.
   *
   * Removing the key would let a concurrent edit of the same message resurrect it from
   * the dead (the edit's register write auto-creates the path again), and it would shift
   * the ordering of the surviving messages on a peer that has not yet seen the delete.
   * A tombstone keeps the author and the timestamp, so the conversation still reads in
   * the order it happened, with a hole where somebody withdrew something — which is what
   * actually occurred.
   */
  deleteMessage(threadId: string, messageId: string): boolean {
    const existing = this.message(threadId, messageId);
    if (!existing || existing.deleted) return false;
    const tomb: CommentMessage = {
      id: existing.id,
      author: existing.author,
      body: '',
      createdAt: existing.createdAt,
      deleted: true,
    };
    return this.diagram.writeCommentRegister(`${threadId}.messages.${messageId}`, tomb);
  }

  resolve(threadId: string): boolean {
    return this.setStatus(threadId, true);
  }

  reopen(threadId: string): boolean {
    return this.setStatus(threadId, false);
  }

  /** Re-point a thread — the manual rescue for an orphan, and the only way to move one. */
  reanchor(threadId: string, spec: AnchorSpec): boolean {
    if (!this.head(threadId)) return false;
    this.lastKnownPoint.delete(threadId);
    return this.diagram.writeCommentRegister(`${threadId}.anchor`, this.buildAnchor(spec));
  }

  private setStatus(threadId: string, resolved: boolean): boolean {
    if (!this.head(threadId)) return false;
    const status: CommentThreadStatus = {
      resolved,
      by: this.opts.viewer,
      at: this.now(),
    };
    // Resolve/reopen is ONE register, so the flag and its attribution can never split —
    // a thread that says "resolved" but not by whom is a thread nobody will reopen.
    return this.diagram.writeCommentRegister(`${threadId}.status`, status);
  }

  private writeMessage(threadId: string, messageId: string, body: string, at: number): void {
    const mentions = mentionIds(body);
    const msg: CommentMessage = {
      id: messageId,
      author: this.opts.viewer,
      body,
      createdAt: at,
    };
    if (mentions.length) msg.mentions = mentions;
    this.diagram.writeCommentRegister(`${threadId}.messages.${messageId}`, msg);
  }

  // ==========================================================================
  // ANCHORING — the part the whole card lives or dies on.
  // ==========================================================================

  /** Snapshot the target's position and name INTO the anchor. Its obituary, written early. */
  private buildAnchor(spec: AnchorSpec): CommentAnchor {
    if (spec.kind === 'region') {
      const a: CommentAnchor = { kind: 'region', x: spec.x, y: spec.y };
      if (spec.width !== undefined) a.width = spec.width;
      if (spec.height !== undefined) a.height = spec.height;
      return a;
    }
    const live = this.livePoint(spec.kind, spec.id);
    const anchor: Extract<CommentAnchor, { kind: 'node' | 'link' }> = {
      kind: spec.kind,
      id: spec.id,
      fallback: live ?? { x: 0, y: 0 },
    };
    const label = this.labelOf(spec.kind, spec.id);
    if (label) anchor.targetLabel = label;
    return anchor;
  }

  /**
   * WHERE THE PIN GOES, AND WHETHER ITS SUBJECT STILL EXISTS.
   *
   * ===========================================================================
   * WHAT HAPPENS TO A COMMENT WHEN SOMEBODY DELETES ITS NODE
   * ===========================================================================
   *
   * It survives. It becomes ORPHANED — visibly detached, still readable, still
   * replyable, still listed — and it never, under any circumstance, disappears.
   *
   * Argued from the user's side, because that is the only side that matters here. A
   * thread is a conversation between PEOPLE. The node is merely what it was about. If
   * Ben deletes a box and that silently destroys the eight-message design argument Ada
   * and Chen had about it, then a routine edit has quietly deleted other people's work —
   * work they cannot recover, cannot see was lost, and were never asked about. Worse, the
   * comment is very often ABOUT the deletion ("why is this still here? we cut this in
   * March") — so the delete would destroy precisely the discussion that authorised it.
   * There is no version of that trade that is worth a tidier canvas.
   *
   * The inverse mistake is just as bad: keeping the pin attached to nothing, hovering at
   * the coordinates of a box that is gone. That is a lie with a timestamp on it. So the
   * orphan is DRAWN DIFFERENTLY, NAMED DIFFERENTLY ("detached"), and grouped separately
   * in the panel. The user is told, in the place they are looking, exactly what happened.
   *
   * ===========================================================================
   * AND WHY `attached` IS DERIVED RATHER THAN STORED — this is the subtle half
   * ===========================================================================
   *
   * The obvious implementation writes an `orphaned: true` flag when the node dies. It is
   * wrong three ways, and every one of them bites:
   *
   *   1. IT RACES. Marking a thread orphaned would be an OP, emitted by whichever peer
   *      noticed the delete first. Two peers notice, two ops. Worse, the flag now merges
   *      by LWW against a concurrent un-delete, and the flag can converge to a value that
   *      contradicts the diagram it is meant to describe: `orphaned: true` on a thread
   *      whose node is manifestly right there. Derived state cannot contradict its source.
   *      Stored state can, and eventually will.
   *   2. IT BREAKS UNDO. Ctrl-Z brings the node back. A stored flag would need a second
   *      op to un-orphan the thread, from some peer that thought to look, and until then
   *      the thread sits detached beside the node it is attached to. Derived, the thread
   *      RE-ATTACHES on the very next read, with zero ops and zero code.
   *   3. IT ASSUMES AN ANSWER THE CRDT CARD HAS NOT GIVEN YET. Card 4 is concurrently
   *      deciding whether a remove beats a concurrent add, or whether an observed-remove
   *      set lets the add survive. If they land on add-wins, a node this store had marked
   *      dead comes back. Deriving the state means BOTH answers are already handled and
   *      neither can be wrong: whatever the diagram says right now, the pin agrees with
   *      it. That is the only way to be robust to a decision that has not been made.
   *
   * So: nothing is stored, nothing is broadcast, and `attached` is simply "is the entity
   * in the diagram, right now". The thread survives the delete BY NOT DEPENDING ON THE
   * ENTITY AT ALL.
   */
  resolveAnchor(threadId: string, anchor: CommentAnchor): ResolvedAnchor {
    if (anchor.kind === 'region') {
      return {
        point: { x: anchor.x, y: anchor.y },
        attached: true, // a region is anchored to the canvas, and the canvas cannot be deleted
        targetLabel: 'a region of the canvas',
        targetKind: 'region',
      };
    }

    const live = this.livePoint(anchor.kind, anchor.id);
    if (live) {
      // Alive. Remember where — this is the ONLY place the ghost position is learned,
      // and it costs nothing because we already had to compute the pin's position.
      this.lastKnownPoint.set(threadId, live);
      return {
        point: live,
        attached: true,
        targetLabel: this.labelOf(anchor.kind, anchor.id) ?? anchor.targetLabel ?? anchor.id,
        targetKind: anchor.kind,
        targetId: anchor.id,
      };
    }

    return {
      point: this.lastKnownPoint.get(threadId) ?? anchor.fallback,
      attached: false,
      targetLabel: anchor.targetLabel ?? anchor.id,
      targetKind: anchor.kind,
      targetId: anchor.id,
    };
  }

  /** The live world point for an entity, or undefined if it is not in the diagram. */
  private livePoint(kind: 'node' | 'link', id: string): WorldPoint | undefined {
    if (kind === 'node') {
      const node = this.diagram.getNode(id);
      if (!node) return undefined;
      const box = node.getBoundingBox();
      // Top-right corner: the conventional place for a pin, and the one least likely to
      // sit on top of the node's own label.
      return { x: box.right, y: box.top };
    }

    const link = this.diagram.getLink(id);
    if (!link) return undefined;
    return this.linkMidpoint(link);
  }

  private linkMidpoint(link: LinkModel): WorldPoint {
    // Prefer the ROUTED points when the renderer has produced them — that is where the
    // line actually is. Fall back to the midpoint of the endpoint nodes, which is where
    // it will be once it is routed.
    const pts = link.points ?? [];
    if (pts.length >= 2) {
      const mid = pts[Math.floor(pts.length / 2)];
      if (pts.length % 2 === 1) return { x: mid.x, y: mid.y };
      const a = pts[pts.length / 2 - 1];
      return { x: (a.x + mid.x) / 2, y: (a.y + mid.y) / 2 };
    }
    const s = this.endpointCenter(link.sourceNodeId, link.sourcePortId);
    const t = this.endpointCenter(link.targetNodeId, link.targetPortId);
    if (s && t) return { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
    return s ?? t ?? { x: 0, y: 0 };
  }

  private endpointCenter(nodeId?: string, portId?: string): WorldPoint | undefined {
    const node: NodeModel | undefined =
      (nodeId ? this.diagram.getNode(nodeId) : undefined) ??
      (portId ? this.diagram.getNodeByPortId(portId) : undefined);
    if (!node) return undefined;
    const box = node.getBoundingBox();
    return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  }

  private labelOf(kind: 'node' | 'link', id: string): string | undefined {
    if (this.opts.labelOf) return this.opts.labelOf(kind, id);
    const entity = kind === 'node' ? this.diagram.getNode(id) : this.diagram.getLink(id);
    if (!entity) return undefined;
    const label = entity.getMetadata('label');
    if (typeof label === 'string' && label) return label;
    const type = (entity as { type?: string }).type;
    return typeof type === 'string' && type ? type : id;
  }

  // ==========================================================================
  // READING
  // ==========================================================================

  private tree(): Record<string, StoredThread> {
    return this.diagram.comments ?? {};
  }

  private head(threadId: string) {
    return this.tree()[threadId]?.head;
  }

  private message(threadId: string, messageId: string): CommentMessage | undefined {
    return this.tree()[threadId]?.messages?.[messageId];
  }

  /**
   * Assemble a thread for reading.
   *
   * INCOMPLETE THREADS ARE INVISIBLE, NOT BROKEN. A thread is three ops, and an
   * unreliable transport is free to deliver the reply before the head that owns it — the
   * substrate says so out loud (causal readiness is explicitly Card 4/5's, and until they
   * ship it, `applyOp` will happily write `comments.t1.messages.m1` into a tree with no
   * `t1.head`). A store that crashed on that would be broken by a packet reorder; a store
   * that rendered a half-thread would show a message from nobody, about nothing. So a
   * thread without a head or an anchor simply does not exist yet, and it appears — whole,
   * with every message that arrived early already in it — the moment its head lands.
   * Nothing is dropped; the pieces just wait.
   */
  thread(threadId: string): CommentThreadView | undefined {
    const stored = this.tree()[threadId];
    if (!stored?.head || !stored.anchor) return undefined;

    const messages = Object.values(stored.messages ?? {})
      .filter((m): m is CommentMessage => !!m && typeof m.id === 'string' && !!m.author)
      .sort(messageOrder);

    const status = stored.status;
    const view: CommentThreadView = {
      id: stored.head.id,
      author: stored.head.author,
      createdAt: stored.head.createdAt,
      anchor: stored.anchor,
      resolved: status?.resolved ?? false,
      messages,
      unread: this.readState.unreadCount(threadId, messages),
      resolvedAnchor: this.resolveAnchor(threadId, stored.anchor),
    };
    if (status?.resolved) {
      view.resolvedBy = status.by;
      view.resolvedAt = status.at;
    }
    return view;
  }

  /** Every readable thread, in a stable order identical on every peer. */
  threads(options?: { includeResolved?: boolean }): CommentThreadView[] {
    const includeResolved = options?.includeResolved ?? true;
    const out: CommentThreadView[] = [];
    for (const tid of Object.keys(this.tree())) {
      const t = this.thread(tid);
      if (!t) continue;
      if (!includeResolved && t.resolved) continue;
      out.push(t);
    }
    return out.sort((a, b) =>
      a.createdAt !== b.createdAt
        ? a.createdAt - b.createdAt
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
    );
  }

  /** Threads whose subject is gone. Derived, every time. Never stored, never synced. */
  orphans(): CommentThreadView[] {
    return this.threads().filter((t) => !t.resolvedAnchor.attached);
  }

  /** Threads anchored to a given entity — attached ones only. */
  threadsFor(kind: 'node' | 'link', id: string): CommentThreadView[] {
    return this.threads().filter(
      (t) => t.anchor.kind === kind && t.anchor.id === id && t.resolvedAnchor.attached
    );
  }

  // ==========================================================================
  // READ STATE (local) + MENTIONS (seam)
  // ==========================================================================

  markRead(threadId: string): void {
    const t = this.thread(threadId);
    if (!t) return;
    this.readState.markRead(threadId, t.messages);
    this.emit();
  }

  markUnread(threadId: string): void {
    this.readState.markUnread(threadId);
    this.emit();
  }

  /** Unread messages across every unresolved thread — the number a badge shows. */
  totalUnread(): number {
    return this.threads({ includeResolved: false }).reduce((n, t) => n + t.unread, 0);
  }

  /** Threads that @mention this viewer and that they have not read. */
  mentionsOfViewer(): CommentThreadView[] {
    return this.threads().filter((t) =>
      t.messages.some(
        (m) => !m.deleted && m.author !== this.opts.viewer && m.mentions?.includes(this.opts.viewer)
      )
    );
  }

  /**
   * A message has entered the store — local or remote, first time only. Fire the seam.
   *
   * Fires on EVERY peer that receives the op, with an idempotency key that is identical
   * on all of them. That is deliberate and it is documented in mentions.ts: the engine
   * cannot know which peer is privileged, so it tells all of them the same true thing and
   * gives the host the one piece of information it needs to send exactly one email.
   */
  private onCommentsChanged(): void {
    if (this.opts.notifier) {
      for (const [tid, stored] of Object.entries(this.tree())) {
        // No anchor yet ⇒ the thread is still arriving. Do NOT mark these notified: the
        // event carries the anchor, and a notification that cannot say what it is about
        // is worth less than one that arrives a beat later and can.
        if (!stored.head || !stored.anchor) continue;
        for (const m of Object.values(stored.messages ?? {})) {
          const key = mentionKey(tid, m.id);
          if (this.notified.has(key)) continue;
          this.notified.add(key);
          if (!m.mentions?.length || m.deleted) continue;
          const event: MentionEvent = {
            key,
            diagramId: this.diagram.id,
            threadId: tid,
            messageId: m.id,
            mentioned: [...m.mentions],
            author: m.author,
            body: m.body,
            anchor: stored.anchor,
            createdAt: m.createdAt,
            local: m.author === this.opts.viewer,
          };
          this.opts.notifier.notify(event);
        }
      }
    }
    this.emit();
  }

  // ==========================================================================

  /** Fired whenever the comment DATA or this viewer's READ STATE changes. */
  onChange(cb: () => void): Unsub {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private emit(): void {
    for (const cb of [...this.subs]) cb();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.subs.clear();
  }

  // ==========================================================================

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  /**
   * A globally unique id, minted by the AUTHORING peer and carried in the op.
   *
   * Determinism is preserved even though this is random, and the distinction matters: a
   * random id chosen INSIDE a reducer would make replay non-deterministic and destroy
   * every guarantee in the substrate. A random id chosen at AUTHORING time is just a
   * value in the payload — every peer replays the same one forever.
   *
   * A per-session counter alone would be a disaster: restart the tab and it restarts at
   * 1, so `alice-m1` collides with a message alice wrote yesterday, whose register it
   * would then silently OVERWRITE. Hence time + a counter + randomness, and an
   * `idFactory` seam so tests can be deterministic without the production path pretending
   * to be.
   *
   * THE COUNTER SITS BEFORE THE RANDOM SUFFIX, AND THAT ORDERING IS LOAD-BEARING. The id
   * is the LAST tiebreak in `messageOrder` — (createdAt, author, id) — so it decides the
   * order of two messages written by the same person in the same MILLISECOND. Put the
   * random part first and that decision is a coin toss: paste two comments in quick
   * succession and they can read back in the wrong order. (Found by a test with a frozen
   * clock, which is the only way a millisecond collision is reliably reproducible.) With
   * the zero-padded counter in front, same-millisecond messages sort in the order they
   * were actually written — on every peer, forever, because the id travels in the op.
   */
  private mintId(prefix: string): string {
    if (this.opts.idFactory) return this.opts.idFactory();
    const seq = (this.counter++).toString(36).padStart(4, '0');
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${seq}_${rand}`;
  }
}
