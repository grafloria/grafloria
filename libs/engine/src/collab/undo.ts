// Wave 9 — Card 4: COLLABORATION-AWARE UNDO.
//
// ---------------------------------------------------------------------------
// CTRL-Z MUST UNDO *MY* LAST EDIT, NOT THE LAST EDIT
// ---------------------------------------------------------------------------
//
// If Alice moves a node and Bob presses Ctrl-Z, Bob must not undo Alice's move. It is the
// single most infuriating bug in every home-grown multiplayer editor, and it comes from
// the same place every time: one global history stack, shared by everyone, popped by
// whoever pressed the key.
//
// Here the property is STRUCTURAL, not a filter. `OpCapture` emits ops for LOCAL edits
// only — remote ops are applied with capture suppressed (that same three-character
// re-entrancy guard that stops two peers ping-ponging). So an op that reaches this stack
// is MINE BY CONSTRUCTION. There is nothing to filter out, and therefore no filter to get
// wrong later. The test still asserts it, because a structural guarantee that nobody
// checks is one refactor away from not being one.
//
// ---------------------------------------------------------------------------
// THE HARD PART: UNDO MUST NOT RESURRECT STALE STATE
// ---------------------------------------------------------------------------
//
// A naive undo restores the value it captured when the edit was made. That is wrong the
// moment anyone else is in the document, and wrong in a way that destroys other people's
// work:
//
//     Bob moves node N to (10,10).            [Bob's op]
//     Alice moves N to (900,900).             [newer — this is what everyone now sees]
//     Bob presses Ctrl-Z.
//
// Naive undo: "restore N to where it was before MY move" → N jumps back to its original
// spot and ALICE'S MOVE IS SILENTLY DESTROYED. Bob undid his own edit and deleted hers.
//
// The correct answer is that BOB'S EDIT IS ALREADY GONE. Alice overwrote that register; the
// document does not contain Bob's move any more. Undoing an edit that has no effect must
// have no effect. So:
//
//     UNDO OF OP `O` ON REGISTER `R` IS SKIPPED IFF THE NEWEST SURVIVING WRITE TO `R`
//     (EXCLUDING `O` AND EXCLUDING WRITES ALREADY UNDONE) IS NEWER THAN `O`.
//
// And when it is NOT skipped, the value restored is not the one we captured — it is THE
// NEWEST SURVIVING WRITE OLDER THAN `O`, read out of the log. That distinction matters in
// a case a captured `before` cannot get right:
//
//     Alice sets colour=red    (clock 5)
//     Bob   sets colour=blue   (clock 9)   ← Bob captured before=red
//     Alice sets colour=green  (clock 7)   ← arrives LATE at Bob; refused, 7 < 9
//     Bob presses Ctrl-Z.
//
// Bob's captured `before` is `red` — a value that no longer exists anywhere in the
// document's history-of-record. The log says the newest surviving write below Bob's is
// Alice's GREEN at clock 7. Restoring red would resurrect a value two writes stale.
// Restoring green is right, and only the log knows it.
//
// The captured `before` is still kept, as the fallback for the case the log CANNOT answer:
// in production a peer joins from a SNAPSHOT plus a tail, so the op that originally set a
// register may be long compacted away. Then `before` is the only witness there is.
//
// ---------------------------------------------------------------------------
// UNDO IS AN OP
// ---------------------------------------------------------------------------
// An undo is an edit. It must converge, it must reach the other peers, and it must itself
// be undoable (redo). So undo does not reach into the model behind the engine's back — it
// applies the inverse THROUGH THE MODEL, with capture LIVE, and the op that results is
// minted by the same clock as any other local edit. It sorts after everything it has seen,
// so it wins its registers by the ordinary LWW rule. There is no special "undo op" kind and
// no second code path to keep in step with the first.

import type { OpBefore } from './capture';
import type { OpLog } from './op-log';
import { compareOps, opId, type ActorId, type Op, type OpValue } from './op';

/** One captured local edit: the op, and what it displaced. */
interface Record {
  op: Op;
  before: OpBefore;
  /** The op the undo emitted, if it was not skipped. Redo compares against it. */
  undoOp?: Op;
}

/** One user-visible step. A gesture is one entry however many ops it took. */
interface Entry {
  records: Record[];
}

/** The register an op writes: a property path, or the entity's existence. */
function registerOf(op: Op): string {
  return op.op === 'set'
    ? `${op.target} ${op.id} ${op.path}`
    : `${op.target} ${op.id}  presence`;
}

/**
 * A per-actor, supersession-aware undo/redo stack.
 *
 * Owns no model state. It reads the LOG to decide what an undo should do, and applies the
 * result through the diagram so that capture mints a normal op for it.
 */
export class UndoStack {
  private readonly undoable: Entry[] = [];
  private readonly redoable: Entry[] = [];

  /** Ops of mine that are currently undone. Excluded when resolving what a register held. */
  private readonly undone = new Set<string>();

  /**
   * Ops that MY OWN undo/redo emitted. Not authored edits — machinery.
   *
   * They have to be excluded when resolving what a register held, and the reason is a bug
   * that only shows up on the SECOND press of Ctrl-Z. Undoing my move emits a fresh `set`
   * with a fresh (therefore highest) clock. Ask "what is the newest write to this register"
   * again, to undo the move BEFORE it, and the answer is that undo op — newer than the op
   * being undone — so the supersession rule fires and the second Ctrl-Z silently does
   * nothing. The user is stuck one step from where they wanted to be, for no visible reason.
   *
   * ONLY my own. Another peer's undo op is, to me, an ordinary write by another peer — I
   * cannot tell it was an undo and I must not treat it as one. That asymmetry is the whole
   * point: undo is local, ops are global.
   */
  private readonly machinery = new Set<string>();

  /** Open transaction: ops land here instead of becoming one entry each. */
  private txn: Record[] | null = null;

  /** True while we are applying an undo/redo, so the ops it emits are not recorded anew. */
  private replaying = false;

  constructor(
    private readonly log: OpLog,
    private readonly actor: ActorId,
    /**
     * Apply an inverse THROUGH THE MODEL, with capture live.
     *
     * Supplied by the Replica rather than called directly, because the Replica knows one
     * thing this class must not have to: a link may be in QUARANTINE, in which case it has
     * to be put back in the document before removing it can be a real mutation that capture
     * can mint an op from.
     */
    private readonly apply: (op: Op) => void
  ) {}

  get canUndo(): boolean {
    return this.undoable.length > 0;
  }

  get canRedo(): boolean {
    return this.redoable.length > 0;
  }

  /** Depth of the undo stack — one entry per user-visible step. */
  get depth(): number {
    return this.undoable.length;
  }

  /**
   * Record a local edit.
   *
   * Ignored while replaying: the ops an undo emits are the undo, not new work to undo.
   */
  record(op: Op, before: OpBefore): void {
    if (this.replaying) return;

    // Any NEW work invalidates the redo branch — the same rule a single-player editor has.
    //
    // The entries are dropped; the ops in them STAY MARKED UNDONE. Losing the ability to redo
    // an op is not the same as the op coming back into force: its effect was reversed by an
    // undo op that is in the log and is never going away. Clearing the marks (which is what I
    // wrote first) makes a discarded op count as a "surviving write" again, and the next undo
    // of that register restores ITS value — a value the user already took back. You get it by
    // undoing a move, typing anything at all, moving again, and undoing: the node jumps to the
    // position you undid two steps ago.
    this.redoable.length = 0;

    if (this.txn) {
      this.txn.push({ op, before });
      return;
    }
    this.undoable.push({ records: [{ op, before }] });
  }

  /**
   * Group everything `fn` does into ONE undo step.
   *
   * Without this, a gesture that touches four registers costs four Ctrl-Zs — and deleting
   * a node with three links (which the editor does as four ops) would take four. The
   * grouping is a LOCAL, UI-level concern: it changes what one keypress undoes, never what
   * is on the wire, and two peers may group differently without diverging.
   */
  transact<T>(fn: () => T): T {
    if (this.txn) return fn(); // already in one — flatten, don't nest
    const records: Record[] = [];
    this.txn = records;
    try {
      return fn();
    } finally {
      this.txn = null;
      if (records.length > 0) this.undoable.push({ records });
    }
  }

  /**
   * Undo my last step. Returns the ops it emitted — empty if every part of it was already
   * superseded, which is a legitimate and silent outcome.
   *
   * `apply` runs the inverse through the model with capture LIVE, so the resulting ops are
   * minted, logged, gated and broadcast exactly like any other local edit.
   */
  undo(): Op[] {
    const entry = this.undoable.pop();
    if (!entry) return [];

    const emitted: Op[] = [];
    this.replaying = true;
    try {
      // In REVERSE: the last thing done is the first thing undone, or a step that wrote the
      // same register twice restores the wrong one of them.
      for (const rec of [...entry.records].reverse()) {
        this.undone.add(opId(rec.op)); // …so it is excluded when we resolve the register
        const inverse = this.invert(rec);
        rec.undoOp = undefined;
        if (!inverse) continue;
        const before = this.log.size;
        this.apply(inverse);
        rec.undoOp = this.lastLogged(before);
        if (rec.undoOp) {
          this.machinery.add(opId(rec.undoOp));
          emitted.push(rec.undoOp);
        }
      }
    } finally {
      this.replaying = false;
    }

    this.redoable.push(entry);
    return emitted;
  }

  /** Redo the step undo last took back. */
  redo(): Op[] {
    const entry = this.redoable.pop();
    if (!entry) return [];

    const emitted: Op[] = [];
    this.replaying = true;
    try {
      for (const rec of entry.records) {
        const forward = this.reapply(rec);
        this.undone.delete(opId(rec.op));
        if (!forward) continue;
        const before = this.log.size;
        this.apply(forward);
        const op = this.lastLogged(before);
        if (op) {
          this.machinery.add(opId(op));
          emitted.push(op);
        }
      }
    } finally {
      this.replaying = false;
    }

    this.undoable.push(entry);
    return emitted;
  }

  // -------------------------------------------------------------------------

  /**
   * The op that reverses `rec`, or undefined if it has already been superseded.
   *
   * The clock and actor on the returned op are PLACEHOLDERS and are never used: applyOp
   * ignores them, and the op that actually reaches the log and the wire is the one capture
   * mints from the resulting model mutation, with a fresh Lamport clock. Constructing a
   * "real" op here and applying it directly would bypass capture and give the undo a
   * second, divergent code path.
   */
  private invert(rec: Record): Op | undefined {
    const { op, before } = rec;
    const survivor = this.newestOther(op);

    // Superseded: someone wrote this register after me. My edit is already invisible;
    // undoing it must stay invisible. THIS IS THE LINE THAT PROTECTS ALICE'S WORK.
    if (survivor && compareOps(survivor, op) > 0) return undefined;

    const stub = { clock: 0, actor: this.actor };

    switch (op.op) {
      case 'add': {
        // If an OLDER `add` survives — I replaced an earlier incarnation of this entity —
        // then undoing mine should restore THAT one, not delete the entity outright.
        if (survivor && survivor.op === 'add') {
          return { ...stub, op: 'add', target: op.target, id: op.id, data: survivor.data };
        }
        return { ...stub, op: 'remove', target: op.target, id: op.id };
      }

      case 'remove': {
        // TWO PEOPLE DELETE THE SAME NODE, AND ONE PRESSES CTRL-Z. This is the case that made
        // me change the rule, and it is worth the paragraph.
        //
        // The tempting rule is "a colleague's delete is still standing, so the node stays
        // gone" — recompute LWW presence excluding my undone op, and both removes vote
        // delete. It is convergent, and it is a terrible editor: each peer only knows about
        // its OWN undos, so BOTH users press Ctrl-Z, BOTH undos decline, and the node is gone
        // for good with two people staring at it wondering why undo is broken. To fix that
        // properly, an undo would have to be a first-class op that TOMBSTONES the op it
        // undoes, so peers could recompute — a much bigger machine than this card.
        //
        // The rule that works is the simple one, and it is already written above: an undo is
        // skipped IFF MY OP IS SUPERSEDED. Whoever's delete is currently IN FORCE can take it
        // back, and the node returns. The other person's undo then finds a newer `add` on the
        // register, sees that its own delete no longer decides anything, and correctly says
        // nothing. One rule, both users get sane behaviour, and it converges.
        //
        // The `if (survivor && compareOps(...) > 0)` above is therefore LOAD-BEARING HERE and
        // nowhere else: without it, the superseded peer re-adds ITS OWN STALE SNAPSHOT over
        // the live incarnation, and a colleague's work vanishes.
        //
        // Restore the entity as it was AT THE MOMENT I DELETED IT — not as it was born. The
        // snapshot carries every property edit it had accumulated, and because the resurrect
        // op gets a fresh (highest) clock, the presence barrier voids every older write to
        // it: the entity comes back exactly as the snapshot says, on every peer.
        if (before.kind !== 'entity') return undefined; // nothing to restore it from
        return { ...stub, op: 'add', target: op.target, id: op.id, data: before.data };
      }

      case 'set': {
        // The newest surviving write BELOW mine is what the register should hold. Falling
        // back to the captured `before` covers the case the log cannot answer — a peer that
        // joined from a snapshot has no op for a register nobody has touched since.
        if (before.kind !== 'value') return undefined;
        const value: OpValue | undefined =
          survivor && survivor.op === 'set' ? survivor.value : before.value;

        // `undefined` means THE REGISTER WAS EMPTY, and that is a value to restore, not a
        // failure to find one. Bail out here and you cannot undo the FIRST label you ever
        // put on a node — the commonest undo there is — because there was nothing there
        // before it. The op carries undefined, JSON.stringify drops the key, the receiving
        // peer reads `value` back as undefined, and setMetadata(k, undefined) empties the
        // register on both sides: getMetadata() answers undefined and serialize() omits the
        // key, so the two peers agree byte for byte.
        //
        // (`OpValue` does not admit undefined, and has been quietly lying about it since
        // Card 0 — capture has always emitted it whenever a user CLEARED a metadata key.
        // Widening the shared type mid-wave would break the three siblings compiling
        // against it, so the cast is here and the type stays put. Flagged, not smuggled.)
        return {
          ...stub,
          op: 'set',
          target: op.target,
          id: op.id,
          path: op.path,
          value: value as OpValue,
        };
      }
    }
  }

  /** The op that re-does `rec`, or undefined if redoing it would clobber newer work. */
  private reapply(rec: Record): Op | undefined {
    // The undo did nothing (it was already superseded), so the redo does nothing. Anything
    // else would have Ctrl-Z do nothing and Ctrl-Y assert a stale value over a colleague's
    // newer one — the exact stale-state resurrection the undo path exists to prevent.
    if (!rec.undoOp) return undefined;

    // Someone edited this register AFTER my undo landed. Their write is the current truth;
    // a redo must not silently overwrite it.
    const after = this.newestOther(rec.op, rec.undoOp);
    if (after && compareOps(after, rec.undoOp) > 0) return undefined;

    const stub = { clock: 0, actor: this.actor };
    const { op } = rec;
    switch (op.op) {
      case 'add':
        return { ...stub, op: 'add', target: op.target, id: op.id, data: op.data };
      case 'remove':
        return { ...stub, op: 'remove', target: op.target, id: op.id };
      case 'set':
        return { ...stub, op: 'set', target: op.target, id: op.id, path: op.path, value: op.value };
    }
  }

  /**
   * The newest op in the log that writes the same register as `op`, ignoring `op` itself,
   * anything else currently undone, and (optionally) one more op.
   *
   * O(log). That is fine for a keypress and would not be for a drag frame — nothing on a
   * hot path calls it.
   */
  private newestOther(op: Op, alsoIgnore?: Op): Op | undefined {
    const reg = registerOf(op);
    const self = opId(op);
    const skip = alsoIgnore ? opId(alsoIgnore) : undefined;

    let best: Op | undefined;
    for (const candidate of this.log.toArray()) {
      const id = opId(candidate);
      if (id === self || id === skip) continue;
      if (this.undone.has(id)) continue; // an undone op is not a surviving write
      if (this.machinery.has(id)) continue; // …and neither is my own undo of one
      if (registerOf(candidate) !== reg) continue;
      if (!best || compareOps(candidate, best) > 0) best = candidate;
    }
    return best;
  }

  /** The op capture minted for the mutation we just made, if it made one. */
  private lastLogged(sizeBefore: number): Op | undefined {
    const ops = this.log.toArray();
    if (ops.length === sizeBefore) return undefined; // the write was a no-op
    // The op we just minted has the highest clock we have ever issued, so it sorts last.
    return ops[ops.length - 1];
  }
}
