// Wave 9 — Card 4: REFERENTIAL INTEGRITY, and the buffer for ops that outran their cause.
//
// ---------------------------------------------------------------------------
// THE RULE
// ---------------------------------------------------------------------------
//
//     A LINK IS LIVE  ⟺  BOTH ITS ENDPOINT PORTS RESOLVE TO NODES PRESENT IN THE DIAGRAM.
//
// That is the whole model. Everything below is bookkeeping in service of it.
//
// It is stated as a PURE FUNCTION OF STATE, and that is the load-bearing choice. Every
// peer evaluates the same predicate over the same (converged) presence registers and
// therefore reaches the same answer — so integrity CONVERGES BECAUSE IT IS DERIVED. It
// needs no op of its own, no cascade broadcast, no agreement protocol, and it cannot
// itself become a source of conflict.
//
// The obvious alternative — cascade: when a node is deleted, also emit `remove link` for
// each of its links — is strictly worse, and it is worth saying why, because it is what
// one writes first:
//
//   • It cannot see a link it does not know about. Bob deletes node N and cascades the
//     links HE can see. Alice, concurrently, draws a new link into N. Bob's cascade never
//     saw it. It survives, dangling. The cascade has bought nothing in the only case that
//     matters — the concurrent one.
//   • It is IRREVERSIBLE. A `remove link` op puts "removed" in the link's presence
//     register. Undo the node delete and the node returns to a diagram whose links are
//     permanently dead, because nothing knows to resurrect them too.
//   • It is chatty: N ops on the wire for one user action, all of them derivable.
//
// So orphaned links are QUARANTINED, not destroyed: held aside by this class, absent from
// the document, and STILL PRESENT in the presence registers. Bring the node back and the
// predicate flips and the links come back with it — including a colleague's link that this
// peer never saw as live. Integrity being derived is exactly what makes it reversible.
//
// ---------------------------------------------------------------------------
// TWO KINDS OF "NOT HERE", AND CONFLATING THEM LOSES DATA
// ---------------------------------------------------------------------------
// applyOp drops a `set` on an entity the diagram does not hold. For a DELETED entity that
// is right. For one that has merely NOT ARRIVED YET it is a silent, permanent data loss —
// and worse, the LWW gate has by then claimed the register for that write, so a
// re-delivery is refused as superseded and cannot repair it. Card 0 flagged this honestly
// and left it. It is the same shape of problem as the quarantine, so it is solved here, by
// the same mechanism: hold the write until its dependency lands.
//
//   • entity NEVER SEEN (no presence stamp)  → BUFFER the write; flush it when the `add`
//     arrives.
//   • entity QUARANTINED (a held link)       → apply the write TO THE HELD INSTANCE, so
//     its state is complete and current the moment it is released.
//   • entity REMOVED (a remove won)          → DROP the write. It is gone, and the
//     presence barrier in lww.ts makes that decision stick on every peer.

import { DiagramModel } from '../models/DiagramModel';
import { LinkModel } from '../models/LinkModel';
import { applyEntitySet } from './apply-op';
import type { LwwRegistry, Stamp } from './lww';
import type { Op } from './op';

/**
 * Holds the diagram to its one hard invariant, and buffers the ops that cannot be applied
 * yet.
 *
 * Drives the model directly. Its writes MUST NOT be captured as ops (they are derived, and
 * broadcasting them would race with the very ops they are derived from) — the Replica runs
 * every call into this class with capture suppressed.
 */
export class ReferentialIntegrity {
  /** Links that logically exist but whose endpoints do not resolve. Held, not destroyed. */
  private readonly quarantine = new Map<string, LinkModel>();

  /**
   * portId → nodeId. OUR OWN, not the engine's.
   *
   * DiagramModel keeps a portIndex, and it would be the obvious thing to resolve endpoints
   * through. It cannot be used here, and the reason is a genuine ordering trap:
   *
   *     installNode():  nodes.set(id, node)          ← the node is queryable
   *                     trackChange('nodes', …)      ← CAPTURE FIRES HERE
   *                     indexNodePorts(node)         ← the port index catches up HERE
   *
   *     removeNode():   nodes.delete(id)
   *                     unindexNodePorts(node)       ← the port index is updated FIRST
   *                     trackChange('nodes', …)      ← capture fires here
   *
   * So on ADD the engine's port index is a beat BEHIND the change event we react to, and on
   * REMOVE it is a beat AHEAD. Reconciling on the add would find the new node's ports
   * missing and refuse to release the links waiting for it — for good, since nothing would
   * ever ask again. An asymmetry like that is exactly the kind of thing that works in every
   * test and fails in a session.
   *
   * The node itself is fully queryable at both moments, so we index from the node and the
   * ordering stops mattering.
   */
  private readonly portOwner = new Map<string, string>();

  /**
   * Is the entity order possibly WRONG, and what is the newest presence stamp in each
   * collection?
   *
   * canonicalize() is O(n) even when it changes nothing, and it used to run on every structural
   * op — which is the other half of what made a bulk load quadratic. But order can only break
   * one way: an entity APPENDED with a presence stamp OLDER than one already in the collection.
   * Adds in the ordinary course of events arrive with ever-increasing clocks, so the collection
   * stays sorted for free and the scan is pure waste. Removals cannot unsort anything.
   *
   * So: watch for a stamp that goes backwards, and only then pay for the sort.
   */
  private orderDirty = false;
  private readonly maxPresence = new Map<string, Stamp>();

  constructor(
    private readonly diagram: DiagramModel,
    private readonly lww: LwwRegistry
  ) {
    // A Replica is routinely attached to a diagram that already has content.
    for (const n of diagram.getNodes()) this.indexPorts(n.id);
  }

  /** Link ids currently held out of the document. Small; usually empty. */
  get quarantined(): string[] {
    return [...this.quarantine.keys()].sort();
  }

  /** Is this link being held out of the document? */
  isHeld(id: string): boolean {
    return this.quarantine.has(id);
  }

  /** The held instance, so a write can still reach a link that is out of the document. */
  held(id: string): LinkModel | undefined {
    return this.quarantine.get(id);
  }

  /**
   * Force a held link back into the document, endpoints or no endpoints.
   *
   * Only for undo: to UNDO the creation of a link that is currently quarantined, the link
   * has to be in the document for `removeLink()` to be a real mutation that capture can
   * mint an op from. Without this the undo silently does nothing, the link's presence
   * register still says "present", and resurrecting its node brings back a link the user
   * explicitly took back. The following reconcile() re-quarantines it if it is still
   * orphaned, so this is a keyhole, not a hole.
   */
  release(id: string): void {
    const link = this.quarantine.get(id);
    if (!link) return;
    this.quarantine.delete(id);
    this.orderDirty = true; // re-inserting APPENDS — see canonicalizeIfDirty()
    this.diagram.addLink(link);
  }

  /** Keep the port map and the order watermark current with the ops that change structure. */
  note(op: Op): void {
    // An `add` APPENDS to its collection. If its stamp is older than one already in there, the
    // collection is no longer in canonical order and must be re-sorted — but only then.
    if (op.op === 'add') {
      const max = this.maxPresence.get(op.target);
      const stamp: Stamp = { clock: op.clock, actor: op.actor };
      if (max && (max.clock > stamp.clock || (max.clock === stamp.clock && max.actor > stamp.actor))) {
        this.orderDirty = true;
      } else {
        this.maxPresence.set(op.target, stamp);
      }
    }

    if (op.target !== 'node') return;
    if (op.op === 'add' || (op.op === 'set' && op.path === 'ports')) {
      this.indexPorts(op.id);
    } else if (op.op === 'remove') {
      for (const [port, owner] of this.portOwner) {
        if (owner === op.id) this.portOwner.delete(port);
      }
    }
  }

  private indexPorts(nodeId: string): void {
    const n = this.diagram.getNode(nodeId);
    if (!n) return;
    for (const [port, owner] of this.portOwner) {
      if (owner === nodeId) this.portOwner.delete(port); // a port may have been removed
    }
    for (const p of n.getPorts()) this.portOwner.set(p.id, nodeId);
  }

  /**
   * Can this op be applied to the document right now?
   *
   * Returns `true` when the op was DIVERTED — written into a link this class is holding out
   * of the document — in which case the caller must not also hand it to applyOp.
   *
   * A held link still takes its property writes, through the SAME mutators a live one uses.
   * An entity that took a different write path in quarantine would drift from a live one, and
   * the drift would only surface on release, long after anything could point at the cause.
   */
  divert(op: Op): boolean {
    if (op.op !== 'set' || op.target !== 'link') return false;

    const held = this.quarantine.get(op.id);
    if (!held) return false;

    if (this.lww.admit(op)) applyEntitySet(held, op.path, op.value);
    return true;
  }

  /**
   * The INCREMENTAL invariant check: only what THIS op could possibly have broken.
   *
   * A full sweep after every local edit is O(links), and a local edit stream is n ops long, so
   * a bulk load — importing a document into a live session — was O(n²). Measured: 2,000 nodes
   * and 2,000 links took 8.5 SECONDS through a Replica, against ~90ms without one. Nothing
   * caught it, because no perf gate in this repo drives a Replica. That is the shape of defect
   * this codebase keeps shipping, and I very nearly shipped another one.
   *
   * So each op pays only for what it can actually affect:
   *
   *   add node      → only a QUARANTINED link can become live. The quarantine is almost always
   *                   empty, so this is free. (A live link cannot break when a node ARRIVES.)
   *   add link      → that one link. O(1).
   *   remove link   → drop it from the quarantine. O(1).
   *   remove node   → live links attached to it can be orphaned. O(links) — but deleting a node
   *                   is a human action, not a loop.
   *   set ports     → same as removing a node: an endpoint may have vanished.
   *   set endpoints → that one link. O(1).
   *
   * A bulk load is all adds, so it is linear again.
   */
  settle(op: Op): void {
    switch (op.op) {
      case 'add':
        if (op.target === 'node') this.releaseResolvable();
        else if (op.target === 'link') this.checkLink(op.id);
        break;

      case 'remove':
        if (op.target === 'node') {
          this.evictOrphans();
          this.releaseResolvable();
        } else if (op.target === 'link') {
          this.quarantine.delete(op.id);
        }
        break;

      case 'set':
        if (op.target === 'node' && op.path === 'ports') {
          // A port can VANISH from under a link — the same wound as deleting the node, and
          // the reason this is not just an add-path concern.
          this.evictOrphans();
          this.releaseResolvable();
        } else if (
          op.target === 'link' &&
          (op.path === 'sourcePortId' || op.path === 'targetPortId')
        ) {
          this.checkLink(op.id);
        }
        break;
    }
    this.canonicalizeIfDirty();
  }

  /**
   * Re-evaluate the invariant over the WHOLE document.
   *
   * Once per BATCH of remote ops, and once at the end of a replay — where the invariant is a
   * function of the batch's final state, not of the path through it (a link orphaned mid-batch
   * and re-parented by the end of it was never really orphaned).
   */
  reconcile(): void {
    this.evictOrphans();
    this.releaseResolvable();
    this.canonicalizeIfDirty();
  }

  /**
   * Evict links that have lost an endpoint — and RE-RESOLVE the cached endpoint node ids of
   * the survivors.
   *
   * That re-resolution is not housekeeping, it is a bug fix. installLink() backfills
   * sourceNodeId/targetNodeId from the port index exactly once, at install, and only if they
   * are unset. A link applied BEFORE its node arrived (which the network is entitled to do,
   * and which a mesh does routinely) indexes nothing and keeps `undefined` node ids FOREVER.
   * They are in serialize(), so the peers' documents differ — and the renderer resolves port
   * SIDES through them, so the link is drawn wrong on one peer and right on the other.
   * Deriving them makes them a function of state, and the arrival order stops mattering.
   */
  private evictOrphans(): void {
    for (const link of this.diagram.getLinks()) {
      if (this.endpointsResolve(link)) {
        this.resolveEndpoints(link);
      } else {
        this.diagram.removeLink(link.id);
        this.quarantine.set(link.id, link);
      }
    }
  }

  /** Give back the links whose endpoints have come home. */
  private releaseResolvable(): void {
    for (const [id, link] of [...this.quarantine]) {
      if (!this.endpointsResolve(link)) continue;
      this.quarantine.delete(id);
      // Endpoints resolved BEFORE it is installed: installLink only backfills ids it finds
      // unset, so a link released with stale ids would keep them.
      this.resolveEndpoints(link);
      // A released link is APPENDED, wherever its presence stamp says it belongs — so the
      // collection may no longer be in canonical order. No `add` op passes through note() on
      // this path, so nothing else would notice. (The 3-peer fuzz noticed: two peers holding
      // the same two links in opposite order, which is the same document painted differently.)
      this.orderDirty = true;
      this.diagram.addLink(link);
    }
  }

  /** One link, either way. */
  private checkLink(id: string): void {
    const live = this.diagram.getLink(id);
    if (live) {
      if (this.endpointsResolve(live)) this.resolveEndpoints(live);
      else {
        this.diagram.removeLink(id);
        this.quarantine.set(id, live);
      }
      return;
    }
    const held = this.quarantine.get(id);
    if (held && this.endpointsResolve(held)) {
      this.quarantine.delete(id);
      this.resolveEndpoints(held);
      this.orderDirty = true; // appended — see canonicalizeIfDirty()
      this.diagram.addLink(held);
    }
  }

  /**
   * ORDER IS PART OF THE DOCUMENT, and the fuzz is what proved it.
   *
   * `serialize()` writes `nodes` as `Array.from(this.nodes.values())` — Map INSERTION order.
   * And the SVG renderer sorts nodes by `zIndex` with a STABLE sort, so when zIndex ties (the
   * overwhelmingly common case: nobody sets it, everything is 0) THE ARRAY ORDER IS THE PAINT
   * ORDER. It decides which of two overlapping nodes is on top.
   *
   * Insertion order is a function of the path a peer took, not of the state it arrived at:
   *
   *     Alice deletes node `a` and undoes → `a` is re-inserted, so it moves to the END.
   *     Bob receives the re-add BEFORE the delete → the delete is then refused as superseded,
   *     Bob never removed anything, and `a` never moves.
   *
   * Same ops. Same content, field for field. Different `nodes` array. The two of them paint
   * overlapping nodes in a different order and save byte-different files. The fuzz caught it on
   * trial 2 and it would never have occurred to me.
   *
   * The fix is the same shape as everything else in this file: DERIVE the order from the
   * converged state instead of inheriting it from the delivery path. An entity's rank is the
   * stamp of the write that established its CURRENT INCARNATION. That is identical on every
   * peer, and in the ordinary case (add a, add b, add c) it reproduces insertion order exactly,
   * so nothing that was not already broken changes.
   *
   * Gated on `orderDirty`, because the sort is O(n) even when it changes nothing and adds
   * normally arrive with ever-increasing clocks — see the field's comment.
   */
  private canonicalizeIfDirty(): void {
    if (!this.orderDirty) return;
    this.orderDirty = false;
    this.order(this.diagram.nodes, 'node');
    this.order(this.diagram.links, 'link');
    this.order(this.diagram.groups, 'group');
  }

  private order(map: Map<string, unknown>, target: 'node' | 'link' | 'group'): void {
    if (map.size < 2) return;

    const rank = (id: string): Stamp | undefined => this.lww.presenceOf(target, id);
    const cmp = (a: Stamp | undefined, b: Stamp | undefined): number => {
      if (!a && !b) return 0; // both predate the log — a stable sort keeps them put
      if (!a) return -1;
      if (!b) return 1;
      if (a.clock !== b.clock) return a.clock - b.clock;
      return a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0;
    };

    const entries = [...map.entries()];
    entries.sort((a, b) => cmp(rank(a[0]), rank(b[0])));
    map.clear();
    for (const [k, v] of entries) map.set(k, v);
  }

  /** Drop a link from quarantine for good — its presence register says it is gone. */
  forget(op: Op): void {
    if (op.op === 'remove' && op.target === 'link') this.quarantine.delete(op.id);
  }

  // -------------------------------------------------------------------------

  /** The node that owns a port, IF that node is currently in the document. */
  private ownerOf(portId: string): string | undefined {
    const nodeId = this.portOwner.get(portId);
    if (nodeId === undefined) return undefined;
    return this.diagram.getNode(nodeId) ? nodeId : undefined;
  }

  private endpointsResolve(link: LinkModel): boolean {
    return (
      this.ownerOf(link.sourcePortId) !== undefined && this.ownerOf(link.targetPortId) !== undefined
    );
  }

  /**
   * Derive the cached endpoint node ids.
   *
   * Assigned directly, NOT through a mutator, and that is deliberate: these are DERIVED
   * state, not authored state. A trackChange here would emit an op, broadcast a value every
   * peer can compute for itself, and race with the ops it was derived from.
   */
  private resolveEndpoints(link: LinkModel): void {
    const s = this.ownerOf(link.sourcePortId);
    const t = this.ownerOf(link.targetPortId);
    if (link.sourceNodeId !== s) link.sourceNodeId = s;
    if (link.targetNodeId !== t) link.targetNodeId = t;
  }
}
