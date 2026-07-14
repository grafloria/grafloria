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
import type { LwwRegistry } from './lww';
import { compareOps, type Op, type SetOp } from './op';

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

  /** Property writes whose entity has never been seen. Flushed when its `add` arrives. */
  private readonly pending = new Map<string, SetOp[]>();

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
    this.diagram.addLink(link);
  }

  /** Keep the port map current with the ops that change a node's structure. */
  note(op: Op): void {
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
   * Returns `false` when the op was diverted — buffered for later, or written into a held
   * instance — in which case the caller must NOT hand it to applyOp.
   *
   * NOTE this runs BEFORE the LWW gate for the buffering case, deliberately. A write that
   * is buffered has not been applied, so it must not yet claim its register: claiming it
   * would refuse the very re-delivery that is meant to be harmless, and would refuse the
   * flush too.
   */
  divert(op: Op): boolean {
    if (op.op !== 'set' || op.target === 'diagram') return false;

    // A held link still takes its property writes — through the SAME mutators a live one
    // uses (applyEntitySet), because an entity that took a different write path in
    // quarantine would drift from a live one, and the drift would only surface on
    // resurrection, long after anything could point at the cause.
    const held = this.quarantine.get(op.id);
    if (held && op.target === 'link') {
      if (this.lww.admit(op)) applyEntitySet(held, op.path, op.value);
      return true;
    }

    // Never seen: hold the write until the entity that owns it arrives.
    const present =
      op.target === 'node'
        ? this.diagram.getNode(op.id)
        : op.target === 'link'
          ? this.diagram.getLink(op.id)
          : this.diagram.getGroup(op.id);
    if (!present && !this.lww.knowsPresence(op.target, op.id)) {
      const key = `${op.target} ${op.id}`;
      const buf = this.pending.get(key) ?? [];
      buf.push(op);
      this.pending.set(key, buf);
      return true;
    }

    return false;
  }

  /**
   * Flush any writes that were waiting for this entity to exist.
   *
   * In TOTAL ORDER, not arrival order — they are being applied as if they had arrived in
   * the sequence every peer agrees on, which is the only sequence that converges. Each one
   * still goes through the LWW gate (and thus the presence barrier: a buffered write that
   * predates the `add` that finally arrived is not a write to this incarnation).
   */
  flush(op: Op): void {
    if (op.op !== 'add') return;
    const key = `${op.target} ${op.id}`;
    const buf = this.pending.get(key);
    if (!buf) return;
    this.pending.delete(key);

    for (const s of [...buf].sort(compareOps)) {
      if (!this.lww.admit(s)) continue;
      const held = this.quarantine.get(s.id);
      const entity =
        held ??
        (s.target === 'node'
          ? this.diagram.getNode(s.id)
          : s.target === 'link'
            ? this.diagram.getLink(s.id)
            : this.diagram.getGroup(s.id));
      if (entity) applyEntitySet(entity, s.path, s.value);
    }
  }

  /**
   * Re-evaluate the invariant over the whole document.
   *
   * Called ONCE PER BATCH of ops rather than once per op — it is O(links + quarantine), and
   * a 10k-op replay that swept after every op would be quadratic. Batching is safe because
   * the invariant is a function of the FINAL state of the batch, not of the path taken
   * through it: a link that is orphaned mid-batch and re-parented by the end was never
   * really orphaned.
   */
  reconcile(): void {
    // 1. Evict links that have lost an endpoint — and, for the survivors, RE-RESOLVE the
    //    cached endpoint node ids.
    //
    //    That re-resolution is not housekeeping, it is a bug fix. installLink() backfills
    //    sourceNodeId/targetNodeId from the port index exactly once, at install, and only
    //    if they are unset. A link applied BEFORE its node arrived (which the network is
    //    entitled to do, and which a mesh does routinely) indexes nothing and keeps
    //    `undefined` node ids forever. They are in serialize(), so the peers' documents
    //    differ — and the renderer resolves port SIDES through them, so the link is drawn
    //    wrong on one peer and right on the other. Deriving them here makes them a function
    //    of state, like everything else in this file, and the arrival order stops mattering.
    for (const link of this.diagram.getLinks()) {
      if (this.endpointsResolve(link)) {
        this.resolveEndpoints(link);
      } else {
        this.diagram.removeLink(link.id);
        this.quarantine.set(link.id, link);
      }
    }

    // 2. Release links whose endpoints have come back. Repeat until stable: releasing a
    //    link cannot revive a node, so one pass suffices — but a link released into the
    //    document must have its endpoints resolved BEFORE it is installed, because
    //    installLink only backfills ids it finds unset.
    for (const [id, link] of [...this.quarantine]) {
      if (!this.endpointsResolve(link)) continue;
      this.quarantine.delete(id);
      this.resolveEndpoints(link);
      this.diagram.addLink(link);
    }
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
