// Wave 9 — Card 1: a saved document is a SNAPSHOT CHECKPOINT PLUS AN OP-LOG TAIL.
//
// The identity half of this card (durable uuids on every node, link and port, surviving a
// save/load round-trip) was genuinely shipped in Wave 1 — verified, not assumed, in
// card1-verify.spec.ts. This file is the half that was not: `SerializedDiagram` had no ops
// field at all, so a saved document was a snapshot and nothing else.
//
// ---------------------------------------------------------------------------
// WHY A SNAPSHOT ALONE IS NOT ENOUGH, AND THE BUG THAT PROVES IT
// ---------------------------------------------------------------------------
//
// The snapshot already contains every node, link and property. So what is the tail FOR?
//
// THE LAMPORT CLOCK. A peer that saves, closes the tab, and reopens the document has to
// resume its clock — and if it restarts at 0, its very first edit mints op id `1@alice`.
// That id ALREADY EXISTS in every other peer's log, from the first edit of the previous
// session. `OpLog.append()` de-duplicates on exactly that id, so the op is SILENTLY
// DROPPED. The user's edit appears on their own screen (it was applied locally) and reaches
// nobody. They keep editing. Every op they issue for the rest of the session collides with
// one from their last session and vanishes. No error. No warning. A collaborator who has
// gone quiet for an hour and does not know it.
//
// You cannot reconstruct the clock from the snapshot, because the snapshot has no clocks in
// it. That is the whole reason the tail exists.
//
// The tail also carries:
//   • THE LWW STAMPS. Without them a reloaded peer would accept a straggling op that
//     predates its own state and silently move a register backwards.
//   • HISTORY. Undo survives a reload; an audit trail survives at all.
//   • CHEAP AUTOSAVE. Append the ops since the last checkpoint instead of rewriting the
//     whole document every few seconds.
//
// ---------------------------------------------------------------------------
// FORWARD MIGRATION
// ---------------------------------------------------------------------------
// A document saved before this existed has no tail. It loads, and it loads CORRECTLY — the
// snapshot is complete, and a peer resuming from it starts at clock 0 with an EMPTY log, so
// there are no ids for it to collide with. The dangerous case is precisely the one the tail
// prevents: a log that exists but whose clock has been forgotten.

import { DiagramModel, type SerializedDiagram } from '../models/DiagramModel';
import { Replica, type ReplicaOptions } from '../collab/replica';
import type { ActorId, Op } from '../collab/op';
import { canonicalStringify, fnv1aHex } from './DocumentEnvelope';

/** Bump when the shape of the PERSISTED wrapper changes (not the document inside it). */
export const PERSISTED_SCHEMA_VERSION = 1;

/** The op-log tail: what the document has done since its checkpoint. */
export interface PersistedLog {
  /**
   * The highest Lamport clock this document has SEEN. Resuming from it is what stops a
   * reloaded peer minting op ids that already exist — see the header. This is the single
   * most important number in the file.
   */
  clock: number;
  /** Ops since the checkpoint, in total order. */
  ops: Op[];
}

export interface PersistedDocument {
  schemaVersion: number;
  /** The checkpoint. Complete on its own — this is what makes the tail OPTIONAL. */
  document: SerializedDiagram;
  /** Absent on a document saved before Card 1, and on a document with no collaboration history. */
  log?: PersistedLog;
}

/**
 * Save a live peer: its document AND the clock/ops needed to keep collaborating after a
 * reload.
 *
 * `sinceClock` lets an autosave append only what is new. The default (0) writes the whole
 * tail, which is what a "Save As" wants.
 */
export function saveDocument(replica: Replica, sinceClock = 0): PersistedDocument {
  const ops = replica.history().filter((o) => o.clock > sinceClock);
  return {
    schemaVersion: PERSISTED_SCHEMA_VERSION,
    document: replica.diagram.serialize(),
    log: { clock: replica.clock, ops: [...ops] },
  };
}

/** Save a diagram that is not part of a session. There is no tail, and that is fine. */
export function saveSnapshot(diagram: DiagramModel): PersistedDocument {
  return { schemaVersion: PERSISTED_SCHEMA_VERSION, document: diagram.serialize() };
}

/**
 * Reopen a saved document as a live peer.
 *
 * THE ORDER HERE IS LOAD-BEARING:
 *
 *   1. Restore the SNAPSHOT. It is the checkpoint; it already holds every node and property.
 *   2. Start the clock AT THE SAVED WATERMARK — before any capture can tick it. A peer whose
 *      clock restarts at 0 mints op ids that already exist, and every op it issues for the
 *      rest of its life is silently swallowed by the log's own de-duplication.
 *   3. Re-seed the log and the LWW stamps from the tail, WITHOUT re-applying the ops to the
 *      model — the snapshot already contains their effects. Re-applying would be harmless
 *      for content (the reducer's redundant-write guard would drop them) but it would bump
 *      every version counter and fire a repaint for a document that has not changed.
 *
 * A legacy document (no tail) takes the same path with an empty log and a zero clock, which
 * is correct: with no ops there are no ids to collide with.
 */
export function loadDocument(
  persisted: PersistedDocument,
  options: ReplicaOptions
): Replica {
  const diagram = DiagramModel.fromJSON(persisted.document);

  const replica = new Replica(diagram, {
    ...options,
    // The watermark. Not a nicety — see the header, and the test that reproduces the
    // silently-vanishing collaborator.
    startClock: persisted.log?.clock ?? options.startClock ?? 0,
  });

  if (persisted.log?.ops.length) {
    replica.adopt(persisted.log.ops);
  }

  return replica;
}

/**
 * The identity of a document's CONTENT, equal on every peer that agrees about it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `checksumOf`, AND WHY BOTH MUST EXIST
 * ---------------------------------------------------------------------------
 * `checksumOf` hashes the exact bytes, which is right for its job: TAMPER DETECTION. If a
 * byte changed in transit, it must say so.
 *
 * But it cannot answer the question a sync server, a cache, or an "are we looking at the
 * same document?" check actually asks — because two peers who agree COMPLETELY about a
 * diagram produce different bytes. Flagged independently by two agents, and reproduced in
 * card1-verify.spec.ts:
 *
 *   `version` is a per-replica MUTATION COUNTER. When two peers race a register, the winner
 *   applies two writes and the loser applies one (its remote is REFUSED as superseded —
 *   which is precisely the mechanism that makes them converge). The counters legitimately
 *   differ, forever, and they are in the saved bytes.
 *
 * The viewer-state keys are excluded for the same reason and a stronger one: they are not in
 * the shared document AT ALL (capture strips them — hovering a node must not write to a
 * document), so two peers will routinely differ on them by design.
 *
 * So: `checksumOf` = "are these the same BYTES". `documentChecksumOf` = "are these the same
 * DOCUMENT". Confusing the two gives you a system that reports corruption every time two
 * people agree.
 */
const NOT_DOCUMENT = new Set(['version', 'selected', 'hovered', 'highlighted', 'focused']);

export function documentChecksumOf(document: SerializedDiagram): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !NOT_DOCUMENT.has(k))
          .map(([k, val]) => [k, strip(val)])
      );
    }
    return v;
  };
  return fnv1aHex(canonicalStringify(strip(document)));
}

/** Do two peers hold the same document? (Not: do they hold the same bytes.) */
export function sameDocument(a: SerializedDiagram, b: SerializedDiagram): boolean {
  return documentChecksumOf(a) === documentChecksumOf(b);
}

export type { ActorId };
