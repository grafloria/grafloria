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

export interface OpCaptureOptions {
  /** Who this peer is. Must be unique across peers; used for the total-order tiebreak. */
  actor: ActorId;
  /** Called for each captured op — hand it to a sync adapter, an autosave, a test. */
  onOp: (op: Op) => void;
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
  private readonly onOp: (op: Op) => void;
  private readonly unsubs: Unsubscribe[] = [];
  private readonly entitySubs = new Map<string, Unsubscribe>();

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
    this.applying = true;
    try {
      for (const op of ops) {
        this.clock.observe(op.clock);
        apply(op);
      }
    } finally {
      // finally, not a trailing assignment: if apply() throws, a stuck `applying` flag
      // would silently disable capture for the rest of the session — every subsequent
      // local edit lost, with no error anywhere.
      this.applying = false;
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

  private emit(op: OpDraft): void {
    if (this.applying || this.stopped) return;
    this.onOp({
      ...(op as Op),
      clock: this.clock.tick(),
      actor: this.clock.actorId,
    } as Op);
  }

  private watchDiagram(): void {
    const onChange = (entry: { property: string; oldValue: unknown; newValue: unknown }) => {
      const { property, oldValue, newValue } = entry;

      if (STRUCTURAL.has(property)) {
        // trackChange('nodes', null, node) = add · trackChange('nodes', node, null) = remove
        const target = property === 'nodes' ? 'node' : property === 'links' ? 'link' : 'group';
        if (newValue && !oldValue) {
          const e = newValue as Entity;
          this.emit({ op: 'add', target, id: e.id, data: e.serialize() as never });
          this.watchEntity(target, e);
        } else if (oldValue && !newValue) {
          const e = oldValue as Entity;
          this.emit({ op: 'remove', target, id: e.id });
          this.unwatchEntity(e.id);
        }
        return;
      }

      // A property of the diagram itself (name, viewport, …).
      if (!DERIVED.has(property)) {
        this.emit({ op: 'set', target: 'diagram', id: '', path: property, value: newValue as OpValue });
      }
    };

    // on() hands back its own unsubscriber — no need to reconstruct the handler identity
    this.unsubs.push(this.diagram.on('change', onChange as never));
  }

  private watchEntity(target: 'node' | 'link' | 'group', entity: Entity): void {
    if (this.entitySubs.has(entity.id)) return;

    const onChange = (entry: { property: string; newValue: unknown }) => {
      if (DERIVED.has(entry.property)) return;
      this.emit({
        op: 'set',
        target,
        id: entity.id,
        path: entry.property,
        value: entry.newValue as OpValue,
      });
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
