// Portable document envelope — the stable OUTER shape of a persisted diagram.
//
// The envelope answers the questions a document store, an export file, or a
// support ticket needs answered WITHOUT parsing the model: what format is
// this, which app/version wrote it, when, and has it been corrupted in
// transit (checksum over a canonical serialization). The inner `document` is
// the SerializedDiagram, which carries its own schemaVersion + migration
// chain (DiagramMigrations).
//
// Adoption is opt-in: `unwrapDiagramDocument` accepts BOTH enveloped and
// legacy flat payloads, so existing persisted documents keep loading.

import type { SerializedDiagram } from '../models/DiagramModel';

export const DIAGRAM_ENVELOPE_FORMAT = 'grafloria-diagram' as const;
export const DIAGRAM_ENVELOPE_VERSION = 1;

export interface DiagramDocumentEnvelope {
  format: typeof DIAGRAM_ENVELOPE_FORMAT;
  envelopeVersion: number;
  /** Writer identity, e.g. '@grafloria/engine'. */
  generator: string;
  /** Writer version — the document schemaVersion the writer targets. */
  generatorVersion: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** FNV-1a hash of the canonical JSON of `document` (see canonicalStringify). */
  checksum?: string;
  document: SerializedDiagram;
}

/**
 * Deterministic JSON: object keys sorted recursively so the same logical
 * document always hashes identically, regardless of property insertion order.
 * (Arrays keep their order — element order IS meaning in nodes/links.)
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** FNV-1a 32-bit over a string, hex encoded — cheap, dependency-free. */
export function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Integrity checksum of a document's canonical JSON. */
export function checksumOf(document: SerializedDiagram): string {
  return fnv1aHex(canonicalStringify(document));
}

export interface WrapOptions {
  generator?: string;
  generatorVersion?: string;
  /** Include an integrity checksum (default true). */
  checksum?: boolean;
  /** Timestamp override (tests / deterministic exports). */
  createdAt?: string;
}

export function wrapDiagramDocument(
  document: SerializedDiagram,
  options: WrapOptions = {}
): DiagramDocumentEnvelope {
  const envelope: DiagramDocumentEnvelope = {
    format: DIAGRAM_ENVELOPE_FORMAT,
    envelopeVersion: DIAGRAM_ENVELOPE_VERSION,
    generator: options.generator ?? '@grafloria/engine',
    generatorVersion: options.generatorVersion ?? String(document.schemaVersion ?? 1),
    createdAt: options.createdAt ?? new Date().toISOString(),
    document,
  };
  if (options.checksum !== false) {
    envelope.checksum = checksumOf(document);
  }
  return envelope;
}

export function isDiagramDocumentEnvelope(value: unknown): value is DiagramDocumentEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as DiagramDocumentEnvelope).format === DIAGRAM_ENVELOPE_FORMAT &&
    typeof (value as DiagramDocumentEnvelope).envelopeVersion === 'number' &&
    !!(value as DiagramDocumentEnvelope).document
  );
}

export class DiagramChecksumError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string
  ) {
    super(
      `Diagram document checksum mismatch (expected ${expected}, computed ${actual}) — ` +
        `the payload was modified or corrupted after it was written.`
    );
    this.name = 'DiagramChecksumError';
  }
}

export interface UnwrapResult {
  document: SerializedDiagram;
  /** Present when the input was enveloped. */
  envelope?: DiagramDocumentEnvelope;
}

/**
 * Accepts an enveloped document OR a legacy flat SerializedDiagram and
 * returns the inner document. When the envelope carries a checksum it is
 * verified (throws DiagramChecksumError on mismatch — an integrity failure
 * must never load silently).
 */
export function unwrapDiagramDocument(
  input: SerializedDiagram | DiagramDocumentEnvelope
): UnwrapResult {
  if (isDiagramDocumentEnvelope(input)) {
    if (input.envelopeVersion > DIAGRAM_ENVELOPE_VERSION) {
      throw new Error(
        `Diagram envelope version ${input.envelopeVersion} is newer than this runtime ` +
          `(${DIAGRAM_ENVELOPE_VERSION}) — refusing to load.`
      );
    }
    if (input.checksum) {
      const actual = checksumOf(input.document);
      if (actual !== input.checksum) {
        throw new DiagramChecksumError(input.checksum, actual);
      }
    }
    return { document: input.document, envelope: input };
  }
  return { document: input };
}
