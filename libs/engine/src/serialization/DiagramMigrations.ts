// Document-level schema versioning + ordered migration chain.
//
// `schemaVersion` describes the SHAPE of a serialized diagram document and is
// distinct from the per-entity `version` counter (which counts mutations of a
// live entity). Documents written before this system exist are treated as
// schemaVersion 1; the current writer stamps DIAGRAM_SCHEMA_VERSION.
//
// On load, `runDiagramMigrations` upgrades an older document step by step
// (1→2→…→current) through registered migrations, and FAILS LOUDLY — instead of
// silently mis-loading — when the document is newer than the runtime or when a
// migration step is missing.

import type { SerializedDiagram } from '../models/DiagramModel';

/**
 * The schema version this engine writes.
 *
 * History:
 *  - 1: implicit — documents written before schemaVersion existed
 *       (fromJSON bypassed the wired restore path; groups could carry a
 *       runtime 'diagram' metadata key).
 *  - 2: documents written by the unified load/save path. Structurally
 *       identical to v1 except: `schemaVersion` is stamped, `groups` is
 *       always present, and runtime-only metadata is never serialized.
 */
export const DIAGRAM_SCHEMA_VERSION = 2;

export interface DiagramMigration {
  /** Source schema version this migration upgrades FROM. */
  from: number;
  /** Target schema version (must be from + 1 — migrations run stepwise). */
  to: number;
  /** Human-readable summary shown in errors/logs. */
  description: string;
  /** Pure upgrade: receives the document, returns the upgraded document. */
  migrate(data: SerializedDiagram): SerializedDiagram;
}

const registry: DiagramMigration[] = [];

/**
 * Register a document migration. Apps embedding the engine can register their
 * own steps when they extend the document shape.
 */
export function registerDiagramMigration(migration: DiagramMigration): void {
  if (migration.to !== migration.from + 1) {
    throw new Error(
      `Diagram migration must upgrade exactly one step (got ${migration.from} → ${migration.to})`
    );
  }
  if (registry.some((m) => m.from === migration.from)) {
    throw new Error(
      `A diagram migration from schemaVersion ${migration.from} is already registered`
    );
  }
  registry.push(migration);
  registry.sort((a, b) => a.from - b.from);
}

/** Registered migrations, in order (primarily for tests/diagnostics). */
export function getDiagramMigrations(): readonly DiagramMigration[] {
  return registry;
}

/**
 * Upgrade a serialized document to DIAGRAM_SCHEMA_VERSION.
 *
 * - A document with no `schemaVersion` is treated as v1.
 * - A document NEWER than the runtime throws (loading it would silently drop
 *   or mangle data written by a newer app — the caller must upgrade instead).
 * - A missing step in the chain throws (a partial upgrade is worse than none).
 *
 * @param migrations override the global registry (tests / embedders).
 */
export function runDiagramMigrations(
  data: SerializedDiagram,
  migrations: readonly DiagramMigration[] = registry
): SerializedDiagram {
  let doc = data;
  let v = doc.schemaVersion ?? 1;

  if (v > DIAGRAM_SCHEMA_VERSION) {
    throw new Error(
      `Diagram document has schemaVersion ${v}, but this engine only knows ` +
        `${DIAGRAM_SCHEMA_VERSION}. Refusing to load a newer document — ` +
        `upgrade the engine (or re-export from an app on schema ${DIAGRAM_SCHEMA_VERSION}).`
    );
  }

  while (v < DIAGRAM_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === v);
    if (!step) {
      throw new Error(
        `No diagram migration registered for schemaVersion ${v} → ${v + 1}; ` +
          `cannot upgrade this document to ${DIAGRAM_SCHEMA_VERSION}.`
      );
    }
    doc = step.migrate(doc);
    v = step.to;
    // Stamp defensively so a forgetful migrate() cannot stall the loop.
    doc.schemaVersion = v;
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Built-in chain
// ---------------------------------------------------------------------------

registerDiagramMigration({
  from: 1,
  to: 2,
  description:
    'v1 → v2: stamp schemaVersion, guarantee the groups collection exists, ' +
    'and strip runtime-only group metadata (the live diagram back-reference) ' +
    'that pre-unified writers could leak into payloads.',
  migrate(data) {
    const groups = (data.groups ?? []).map((g) => {
      if (g && g.metadata && 'diagram' in g.metadata) {
        const { diagram: _runtimeRef, ...metadata } = g.metadata as Record<string, unknown>;
        return { ...g, metadata };
      }
      return g;
    });
    return { ...data, groups, schemaVersion: 2 };
  },
});
