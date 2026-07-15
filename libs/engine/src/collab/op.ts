// Wave 9 (Collaboration) — Card 0: the operation format.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT "PROMOTING THE EXISTING COMMAND STREAM", WHICH IS WHAT THE
// ROADMAP CARD ASKED FOR
// ---------------------------------------------------------------------------
//
// The card says: promote the existing SerializedCommand/CommandManager stream into
// a semantic op format. Two things are wrong with that premise, and both change the
// design:
//
//   1. THE COMMAND STREAM IS WRITE-ONLY. Every Command implements serialize(), and
//      there is NO deserializer anywhere in the codebase — not one. You can emit the
//      bytes and nothing on earth can consume them. (The same defect this project has
//      found in every single wave: machinery wired to nothing.)
//
//   2. COMMANDS AND THE INCREMENTAL DIFF ARE BOTH WHOLE-ENTITY. AddLinkCommand stores
//      `link.serialize()`; DiagramIncremental reports `modified: [<the whole node>]`.
//      Whole-entity granularity is FATAL for merge, and quietly so: if you drag a node
//      while I rename it, whole-entity last-writer-wins throws one of us away. No
//      error, no conflict — just silently lost work, which is the worst possible
//      failure mode for a collaboration engine.
//
// So an op is PER-PROPERTY. `set(node n1, position, {x,y})` and `set(node n1,
// metadata.label, "Foo")` are different registers and both survive. That single
// decision is what makes convergence possible at all, and it is why this is a build
// rather than a promotion.
//
// ---------------------------------------------------------------------------
// TIME
// ---------------------------------------------------------------------------
//
// Command.timestamp is `Date.now()`. A wall clock is useless here and actively
// dangerous: two peers' clocks disagree, clocks run backwards (NTP, DST, a VM
// resuming), and "later" in wall time says nothing about causality. We use a LAMPORT
// clock — a counter that advances past anything it has seen — so `a → b` (a caused b)
// always implies `clock(a) < clock(b)`.
//
// Lamport gives a PARTIAL order; concurrent ops can share a clock value. We need a
// TOTAL order (so every peer sorts the log identically), so ties break on actor id.
// That is arbitrary but it is *stable and identical everywhere*, which is the only
// property that matters.

import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';
import type { SerializedStroke } from '../models/StrokeModel';

/** Who made the edit. Stable for the lifetime of a session; distinct per peer. */
export type ActorId = string;

/**
 * The entity kinds a diagram is made of, plus the diagram itself.
 *
 * wave10/whiteboard: `stroke` joins the list. Ink is DOCUMENT CONTENT — two people drawing
 * on the same board must converge — so a stroke is a first-class op target, not annotation
 * smuggled through a diagram-level `set`. (It very nearly WAS: `trackChange('strokes', …)`
 * is a diagram-level change event, and without `stroke` in this union the capture layer's
 * fall-through emitted `set(diagram, strokes, <live StrokeModel>)` — a class instance on the
 * wire, claiming the whole collection. See capture.ts / apply-op.ts.)
 */
export type OpTarget = 'node' | 'link' | 'group' | 'stroke' | 'diagram';

/**
 * A property path. Dot-separated for nested registers: 'position', 'size',
 * 'metadata.label', 'state.locked'.
 *
 * THE PATH IS THE REGISTER KEY. Two concurrent writes to the SAME path conflict and
 * are resolved by last-writer-wins; two writes to DIFFERENT paths of the same entity
 * do not conflict at all and both survive. This is the whole point (see the header).
 */
export type OpPath = string;

/** JSON-safe value. Ops must survive a network hop and a disk round-trip. */
export type OpValue = null | boolean | number | string | OpValue[] | { [k: string]: OpValue };

interface OpBase {
  /**
   * Lamport clock. Causality, NOT wall time. Advances past every clock this actor
   * has observed, so `caused-by` always implies a strictly greater clock.
   */
  clock: number;
  /** Who. Also the deterministic tiebreak when two ops share a clock. */
  actor: ActorId;
}

/** Create an entity. Carries the full serialized form — an add has no prior state to diff against. */
export interface AddOp extends OpBase {
  op: 'add';
  target: Exclude<OpTarget, 'diagram'>;
  id: string;
  data: SerializedNode | SerializedLink | SerializedGroup | SerializedStroke;
}

/** Remove an entity. */
export interface RemoveOp extends OpBase {
  op: 'remove';
  target: Exclude<OpTarget, 'diagram'>;
  id: string;
}

/** Write one property register. The unit of concurrency. */
export interface SetOp extends OpBase {
  op: 'set';
  target: OpTarget;
  /** '' for the diagram itself, which is a singleton. */
  id: string;
  path: OpPath;
  /**
   * The value the register now holds. ABSENT when the op is a clear.
   *
   * wave14: this used to be required, and clearing a register (deleteMetadata,
   * clearFlexItem) emitted `value: undefined` — which this type forbids and which only
   * crossed the wire because JSON.stringify silently DROPS an undefined key and the
   * peer's apply happened to read missing-as-undefined. A load-bearing accident. Clears
   * are now EXPLICIT (`clear: true`), and `undefined` never appears in an emitted op.
   */
  value?: OpValue;
  /**
   * Explicitly empty the register: the key is deleted, not set to anything. NOT null —
   * null is a legitimate STORED value (a peer that stores null and a peer that cleared
   * must not converge on the same document), so it cannot double as the clear sentinel.
   */
  clear?: true;
}

export type Op = AddOp | RemoveOp | SetOp;

/**
 * The value a `set` op writes, with clears normalised to `undefined`.
 *
 * BACK-COMPAT lives here and nowhere else: every log persisted before wave14 encodes a
 * clear as an ABSENT value key (JSON dropped the `undefined`), so `value === undefined`
 * must read as a clear forever — alongside the explicit `clear: true` new ops carry.
 */
export function setValueOf(op: SetOp): OpValue | undefined {
  return op.clear === true ? undefined : op.value;
}

/**
 * TOTAL ORDER over ops. Every peer must sort the same log into the same sequence, or
 * "replay converges" is meaningless.
 *
 * (clock, actor) is a total order because clocks are integers and actor ids are
 * distinct strings. The actor tiebreak is arbitrary — it does NOT mean the
 * lexicographically-larger actor is "righter" — but it is the same arbitrary answer
 * on every peer, which is the only thing required.
 */
export function compareOps(a: Op, b: Op): number {
  if (a.clock !== b.clock) return a.clock - b.clock;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  // Same clock AND same actor: an actor never issues two ops at one clock value
  // (nextClock() increments), so this is unreachable for well-formed logs. Return 0
  // rather than throwing — a corrupt log should degrade, not explode, and the dedupe
  // in OpLog will collapse true duplicates anyway.
  return 0;
}

/** Identity of an op, for idempotent delivery: the same op received twice is one op. */
export function opId(op: Op): string {
  return `${op.clock}@${op.actor}`;
}

/**
 * A Lamport clock.
 *
 * `tick()` for a local event. `observe(remoteClock)` on receipt, which jumps this
 * clock past anything the remote had seen — that is what makes the resulting order
 * respect causality across peers rather than merely within one.
 */
export class LamportClock {
  private value: number;

  constructor(private readonly actor: ActorId, start = 0) {
    if (!actor) throw new Error('LamportClock requires a non-empty actor id');
    this.value = start;
  }

  /** The next clock value for a local event. */
  tick(): number {
    return ++this.value;
  }

  /**
   * Fold in a clock we have just seen. After this, our next tick() is guaranteed to
   * be greater than `seen` — so any op we issue AFTER observing theirs sorts AFTER it,
   * which is exactly the causality guarantee.
   */
  observe(seen: number): void {
    if (seen > this.value) this.value = seen;
  }

  peek(): number {
    return this.value;
  }

  get actorId(): ActorId {
    return this.actor;
  }
}
