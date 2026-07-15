// Wave 9 — Card 0: turning real edits into ops.
//
// THIS FILE IS THE ONE THAT MATTERS, and it is the one the roadmap did not ask for.
//
// It would be very easy to ship Card 0 as: an Op type, a LamportClock, an applyOp()
// reducer, a replay() function, and a suite of tests that hand-construct ops and
// replay them. Everything green. Everything documented. And the log would be fed by
// NOTHING — an op format that no actual edit ever produces.
//
// That is precisely the bug this engine has shipped in every wave: `setLayoutService()`
// that nothing called, 17 LOD presets that were all a no-op, a worker stack whose tests
// all forced `useWorker:false`, a quality governor (mine) wired to nothing, and — right
// here in this capability — a `Command.serialize()` on every command with NO
// DESERIALIZER ANYWHERE. Write-only. Green tests, zero reachability.
//
// So the capture layer exists, and the load-bearing test in this wave is not "ops
// replay" — it is: DRIVE THE REAL ENGINE WITH REAL EDITS, CAPTURE, REPLAY INTO AN EMPTY
// DIAGRAM, AND DEMAND BYTE-IDENTICAL serialize(). That is the only test that can tell
// you the log is COMPLETE (nothing an edit does is missed), REPLAYABLE, and
// DETERMINISTIC — and no amount of hand-written ops can substitute for it.
//
// ---------------------------------------------------------------------------
// HOW
// ---------------------------------------------------------------------------
// `DiagramEntity.trackChange(property, old, new)` is the SINGLE funnel every mutation
// in this engine passes through (it is what powers dirty-tracking, versioning and the
// change events). It emits `change` with the property name — and, beautifully, the
// vocabulary it already speaks is exactly the vocabulary an op path needs:
// 'position', 'size', 'state', 'style', 'points', 'metadata.<key>'. The diagram itself
// emits trackChange('nodes'|'links'|'groups', old, new) for add/remove.
//
// So capture is a listener on that funnel. No parallel bookkeeping, no second source of
// truth that can drift from the first.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { GroupModel } from '../models/GroupModel';
import { StrokeModel } from '../models/StrokeModel';
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';
import { LamportClock, type ActorId, type Op, type OpValue, type OpTarget } from './op';

type Entity = NodeModel | LinkModel | GroupModel | StrokeModel;
type EntityTarget = Exclude<OpTarget, 'diagram'>;
type Unsubscribe = () => void;

/**
 * An op minus the fields the capture layer stamps on.
 *
 * DISTRIBUTIVE, and it has to be: a bare `Omit<Op, 'clock'|'actor'>` over a union
 * collapses to only the keys the members SHARE — so `data` and `path` vanish and every
 * emit() call fails to typecheck. The `T extends unknown` is what makes it distribute
 * across the union members instead of intersecting them.
 */
type Draft<T> = T extends unknown ? Omit<T, 'clock' | 'actor'> : never;
type OpDraft = Draft<Op>;

/** Property names that are structural (add/remove), not property registers. */
const STRUCTURAL = new Set(['nodes', 'links', 'groups', 'strokes']);

/** The `trackChange` collection name → the op target it adds/removes. */
const STRUCTURAL_TARGET: Record<string, EntityTarget> = {
  nodes: 'node',
  links: 'link',
  groups: 'group',
  strokes: 'stroke',
};

/**
 * Properties we do NOT put on the wire — SCOPED PER TARGET.
 *
 * `points` is a LINK's ROUTED geometry — it is DERIVED, recomputed by the renderer from
 * the node positions and the router on every frame that needs it. Broadcasting it would
 * (a) trade a 2-number node move for an N-point path on every drag frame, and (b) be
 * actively wrong: the receiving peer recomputes the route anyway, so the transmitted
 * points are overwritten milliseconds later. A collaboration engine must sync CAUSES,
 * not their derived consequences.
 *
 * The exception is a link the user has hand-routed — those waypoints are authored
 * intent, not derived geometry — and the model already distinguishes the two with the
 * `hasManualWaypoints` metadata flag, which IS synced (it is a metadata.* register).
 * So a manual reroute travels; an automatic one does not. That is the correct line, and
 * it is the model's own line, not one invented here.
 *
 * wave10/whiteboard: `points` ON A STROKE IS THE OPPOSITE — it is the authored content
 * itself, nothing derives it, and a global `DERIVED = {points}` would drop the one thing a
 * stroke edit changes, so editing a stroke's geometry would silently never reach a peer.
 * (StrokeModel.setPoints documents exactly this trap.) Hence per-target: `points` is
 * derived for a link and authored for a stroke.
 */
const DERIVED_BY_TARGET: Record<string, Set<string>> = {
  link: new Set(['points']),
  diagram: new Set(['points']),
};

function isDerived(target: OpTarget, property: string): boolean {
  return DERIVED_BY_TARGET[target]?.has(property) ?? false;
}

/**
 * ---------------------------------------------------------------------------
 * EPHEMERAL VIEWER STATE — THE BUG THIS SET EXISTS TO CLOSE
 * ---------------------------------------------------------------------------
 *
 * `NodeState` mixes two completely different kinds of fact in one object:
 *
 *     DURABLE (about the DOCUMENT):  visible, locked, expanded, enabled, error, status
 *     EPHEMERAL (about a VIEWER):    selected, hovered, highlighted, focused
 *
 * …and this capture layer used to sync the whole object as a single register. The
 * consequences, found by wave9/sync driving a real two-peer session:
 *
 *   • MOVING YOUR MOUSE ACROSS A NODE WROTE TWO PERMANENT OPS INTO THE SHARED DOCUMENT
 *     (hover on, hover off) — and the peer APPLIED them, so a node lit up on my screen
 *     because your cursor was somewhere near it.
 *   • YOUR CLICK DESELECTED MY NODE. Selection is not a property of the diagram; it is a
 *     property of a person looking at it.
 *   • And every one of those ops went into the replayable, persisted, totally-ordered log
 *     FOREVER. A five-minute session would bury the actual edit history under thousands
 *     of hover events.
 *
 * `LinkModel.state` is worse still: its ONLY values are 'default' | 'selected' | 'hovered'
 * | 'highlighted'. It is ephemeral in its entirety, so a link's state is never synced at
 * all.
 *
 * This is the same distinction wave9/comments drew for read-markers ("Ada read this" is a
 * fact about Ada, not about the document) and the same one that keeps live cursors out of
 * the op log. Presence belongs on the awareness channel — ephemeral, per-peer, expiring —
 * and NEVER in the document.
 */
const EPHEMERAL_NODE_STATE = new Set(['selected', 'hovered', 'highlighted', 'focused']);

/** A link's `state` is view state, top to bottom. Never synced. */
const EPHEMERAL_BY_TARGET: Record<string, Set<string>> = {
  link: new Set(['state']),
};

/** Strip the viewer-local keys out of a node/group `state` object. */
function durableState(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!EPHEMERAL_NODE_STATE.has(k)) out[k] = v;
  }
  return out;
}

/** Structural equality, so a hover that changes nothing durable emits nothing. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What the register held BEFORE the op overwrote it.
 *
 * Card 4 (undo) needs it and nothing else does, so it is handed to the capture callback
 * ALONGSIDE the op rather than being put INSIDE it. An op is a wire format: it crosses a
 * network and a disk, it is broadcast to every peer, and a peer does not need — and must
 * not be trusted with — the sender's idea of the previous value. Undo is a LOCAL concern.
 * Widening the op to carry it would have doubled the traffic to serve one machine.
 */
export type OpBefore =
  /** A `set`: the value the register held. `undefined` = the register was empty. */
  | { kind: 'value'; value: OpValue | undefined }
  /** A `remove`: the entity's full state at the moment it was removed. */
  | { kind: 'entity'; data: SerializedNode | SerializedLink | SerializedGroup }
  /** An `add`: there was nothing before it. */
  | { kind: 'none' };


export interface OpCaptureOptions {
  /** Who this peer is. Must be unique across peers; used for the total-order tiebreak. */
  actor: ActorId;
  /**
   * Called for each captured op — hand it to a sync adapter, an autosave, a test.
   *
   * `before` is the value the op displaced, for the local undo stack. It is NOT part of
   * the op and never goes on the wire.
   */
  onOp: (op: Op, before: OpBefore) => void;
  /** Resume a clock across sessions (e.g. from a persisted op-log tail). */
  startClock?: number;
}

/**
 * Watches a live diagram and emits an Op for every real edit.
 *
 * Re-entrancy: while `applyRemote()` is running, capture is SUPPRESSED. Without that,
 * applying a peer's op would capture it as a local op and re-broadcast it, and the two
 * peers would ping-pong the same edit forever, each amplifying the other. This is the
 * single most important line in the file and it is three characters long.
 */
export class OpCapture {
  private readonly clock: LamportClock;
  private readonly onOp: (op: Op, before: OpBefore) => void;
  private readonly unsubs: Unsubscribe[] = [];
  private readonly entitySubs = new Map<string, Unsubscribe>();
  /** Last ports collection emitted per node — see the 'ports' branch of watchEntity. */
  private readonly lastPorts = new Map<string, OpValue>();

  /** True while we are applying a REMOTE op: everything the model emits is an echo. */
  private applying = false;
  private stopped = false;

  constructor(
    private readonly diagram: DiagramModel,
    options: OpCaptureOptions
  ) {
    this.clock = new LamportClock(options.actor, options.startClock ?? 0);
    this.onOp = options.onOp;

    this.watchDiagram();
    // Entities that already exist when capture starts still need watching — a diagram
    // is rarely empty at the moment you decide to start collaborating on it.
    for (const n of diagram.getNodes()) this.watchEntity('node', n);
    for (const l of diagram.getLinks()) this.watchEntity('link', l);
    for (const g of diagram.getGroups()) this.watchEntity('group', g);
    for (const s of diagram.getStrokes()) this.watchEntity('stroke', s);
  }

  /** The Lamport clock this capture issues from — shared with the sync layer. */
  get lamport(): LamportClock {
    return this.clock;
  }

  /**
   * Apply remote ops WITHOUT capturing them as local edits.
   *
   * The clock observes each remote op first, so any op we issue after this sorts after
   * theirs. That is what makes the resulting order respect causality between peers and
   * not merely within one.
   */
  applyRemote(ops: readonly Op[], apply: (op: Op) => void): void {
    this.silently(() => {
      for (const op of ops) {
        this.clock.observe(op.clock);
        apply(op);
      }
    });
  }

  /**
   * Run `fn` with capture SUPPRESSED — the model mutations it makes emit no ops.
   *
   * For work that is DERIVED rather than authored: referential integrity moving an
   * orphaned link out of the document and back again is a function of state that every
   * peer computes for itself, so broadcasting it would put a redundant op on the wire that
   * races with the ops it was derived from. Deriving it locally is not just cheaper, it is
   * the only thing that converges.
   *
   * Re-entrant: nesting must not clear the flag early (integrity reconciles INSIDE
   * applyRemote), or a remote op's mutations would start echoing back mid-batch.
   */
  silently(fn: () => void): void {
    const was = this.applying;
    this.applying = true;
    try {
      fn();
    } finally {
      // finally, not a trailing assignment: if fn() throws, a stuck `applying` flag would
      // silently disable capture for the rest of the session — every subsequent local edit
      // lost, with no error anywhere.
      this.applying = was;
    }
  }

  stop(): void {
    this.stopped = true;
    for (const u of this.unsubs) u();
    for (const u of this.entitySubs.values()) u();
    this.unsubs.length = 0;
    this.entitySubs.clear();
  }

  // -------------------------------------------------------------------------

  private emit(op: OpDraft, before: OpBefore): void {
    if (this.applying || this.stopped) return;
    this.onOp(
      {
        ...(op as Op),
        clock: this.clock.tick(),
        actor: this.clock.actorId,
      } as Op,
      before
    );
  }

  private watchDiagram(): void {
    const onChange = (entry: { property: string; oldValue: unknown; newValue: unknown }) => {
      const { property, oldValue, newValue } = entry;

      if (STRUCTURAL.has(property)) {
        // trackChange('nodes', null, node) = add · trackChange('nodes', node, null) = remove
        const target = STRUCTURAL_TARGET[property];
        if (newValue && !oldValue) {
          const e = newValue as Entity;
          this.emit({ op: 'add', target, id: e.id, data: e.serialize() as never }, { kind: 'none' });
          this.watchEntity(target, e);
        } else if (oldValue && !newValue) {
          // The entity's FULL STATE at the moment it was removed — the only thing that can
          // undo a delete. (deepClone hands class instances through untouched, so this is
          // the live model, and serialize() on it is exact rather than a stale snapshot.)
          const e = oldValue as Entity;
          this.emit(
            { op: 'remove', target, id: e.id },
            { kind: 'entity', data: e.serialize() as never }
          );
          this.unwatchEntity(e.id);
        }
        return;
      }

      // A property of the diagram itself (name, viewport, …).
      if (!isDerived('diagram', property)) {
        this.emit(
          { op: 'set', target: 'diagram', id: '', path: property, value: newValue as OpValue },
          { kind: 'value', value: oldValue as OpValue }
        );
      }
    };

    // on() hands back its own unsubscriber — no need to reconstruct the handler identity
    this.unsubs.push(this.diagram.on('change', onChange as never));
  }

  private watchEntity(target: EntityTarget, entity: Entity): void {
    if (this.entitySubs.has(entity.id)) return;

    // SEED the ports shadow with what the node ALREADY has.
    //
    // Without this, `before` for the node's FIRST port change is undefined — and undo reads
    // that as "the register was empty", so undoing the first port a user ever adds to a node
    // DELETES EVERY PORT IT HAS, including the ones it was born with. The node survives with
    // nothing to connect to and every link into it is orphaned. The fuzz found it as a node
    // with an empty ports array on one peer.
    if (entity instanceof NodeModel) {
      this.lastPorts.set(
        entity.id,
        entity.getPorts().map((p) => p.serialize()) as unknown as OpValue
      );
    }

    const onChange = (entry: { property: string; oldValue: unknown; newValue: unknown }) => {
      // Per-target: a LINK's `points` is derived and dropped; a STROKE's `points` is the
      // authored content and must travel. See DERIVED_BY_TARGET.
      if (isDerived(target, entry.property)) return;

      // Wholly-ephemeral registers never reach the wire at all. A link's `state` is
      // 'default' | 'selected' | 'hovered' | 'highlighted' — view state, top to bottom.
      if (EPHEMERAL_BY_TARGET[target]?.has(entry.property)) return;

      // PORTS ARE NOT AN ORDINARY REGISTER, and taking them for one puts a LIVE CLASS
      // INSTANCE on the wire.
      //
      // NodeModel.addPort() emits trackChange('ports', null, <PortModel>) — the new PORT,
      // not the ports collection — and deepClone hands class instances through untouched.
      // Captured naively, the op's `value` is a PortModel: not JSON-safe (its prototype
      // does not survive the wire), and semantically a single port claiming to be the whole
      // `ports` register. On the receiving peer applyOp finds no setPorts() mutator, falls
      // back to a direct assignment, and REPLACES node.ports — a Map — WITH A PLAIN OBJECT.
      // Every getPorts() after that returns nothing and serialize() throws.
      //
      // Nothing caught it because a port is almost always added BEFORE its node joins the
      // diagram (so capture is not watching yet). AddPortCommand adds one AFTER, and that
      // is the reachable path.
      //
      // A node's ports are structure, not a property: send the whole SERIALIZED collection
      // and let the reducer rebuild the Map. Whole-collection LWW is the cost — two peers
      // adding a different port to the same node concurrently, and one loses — which is the
      // right trade for a register that a user changes rarely and never by dragging.
      if (entry.property === 'ports') {
        const ports = (entity as NodeModel).getPorts().map((p) => p.serialize()) as unknown as OpValue;
        // The register's PREVIOUS contents, so undo has something to restore. trackChange
        // reports the one port that changed, not the collection it changed, so the
        // collection's prior value has to be remembered here — there is nowhere else to
        // read it from once the Map has been mutated.
        const was = this.lastPorts.get(entity.id);
        this.lastPorts.set(entity.id, ports);
        this.emit(
          { op: 'set', target, id: entity.id, path: 'ports', value: ports },
          { kind: 'value', value: was }
        );
        return;
      }

      let value = entry.newValue as OpValue;
      let before = entry.oldValue as OpValue;

      if (entry.property === 'state') {
        // `state` is a MIXED register: durable document facts (visible, locked, expanded)
        // sitting in the same object as per-viewer ephemera (selected, hovered, focused).
        // Project BOTH sides — and emit NOTHING when only the ephemera moved.
        //
        // Without the second half of that, hovering a node still puts an op on the wire and
        // in the permanent log on every mouse-over. The receiver's redundant-write guard
        // would drop it, so the DOCUMENT would look correct and the bug would be invisible
        // to every convergence test — while the log filled with hover events that outlive
        // the session. (Found by wave9/sync, in two real browser tabs. jsdom does not hover.)
        //
        // `before` is projected TOO, and that is not symmetry for its own sake: undo
        // restores `before`, so an unprojected one would put the undoing user's stale
        // selection back onto every peer's screen — reintroducing the very bug through the
        // undo path.
        const next = durableState(entry.newValue);
        const prev = durableState(entry.oldValue);
        if (sameJson(next, prev)) return;
        value = next as OpValue;
        before = prev as OpValue;
      }

      this.emit(
        { op: 'set', target, id: entity.id, path: entry.property, value },
        { kind: 'value', value: before }
      );

    };

    this.entitySubs.set(entity.id, entity.on('change', onChange as never));
  }

  private unwatchEntity(id: string): void {
    const un = this.entitySubs.get(id);
    if (un) {
      un();
      this.entitySubs.delete(id);
    }
  }
}
