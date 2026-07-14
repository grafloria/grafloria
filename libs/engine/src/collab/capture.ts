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
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';
import { LamportClock, type ActorId, type Op, type OpValue } from './op';

type Entity = NodeModel | LinkModel | GroupModel;
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
const STRUCTURAL = new Set(['nodes', 'links', 'groups']);

/**
 * Properties we do NOT put on the wire.
 *
 * `points` is a link's ROUTED geometry — it is DERIVED, recomputed by the renderer from
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
 */
const DERIVED = new Set(['points']);

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
        const target = property === 'nodes' ? 'node' : property === 'links' ? 'link' : 'group';
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
      if (!DERIVED.has(property)) {
        this.emit(
          { op: 'set', target: 'diagram', id: '', path: property, value: newValue as OpValue },
          { kind: 'value', value: oldValue as OpValue }
        );
      }
    };

    // on() hands back its own unsubscriber — no need to reconstruct the handler identity
    this.unsubs.push(this.diagram.on('change', onChange as never));
  }

  private watchEntity(target: 'node' | 'link' | 'group', entity: Entity): void {
    if (this.entitySubs.has(entity.id)) return;

    const onChange = (entry: { property: string; oldValue: unknown; newValue: unknown }) => {
      if (DERIVED.has(entry.property)) return;

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

      this.emit(
        {
          op: 'set',
          target,
          id: entity.id,
          path: entry.property,
          value: entry.newValue as OpValue,
        },
        { kind: 'value', value: entry.oldValue as OpValue }
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
