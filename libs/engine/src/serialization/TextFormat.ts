// Text (DSL) persistence — diagrams as human-readable, git-diffable,
// LLM-writable Mermaid-compatible text, WITHOUT giving up losslessness.
//
// The engine's dsl/ layer already generates and parses Mermaid-compatible
// text, but the grammar covers a diagram SUBSET (structure + labels) — style
// bags, port geometry, group nesting, viewport, and data bags drop on a pure
// text round-trip. This module closes that gap with a SIDECAR line:
//
//   graph TD
//     node-a["Source"] --> node-b["Sink"]
//     %%grafloria:document {"...full canonical SerializedDiagram..."}
//     %%grafloria:body-hash 1a2b3c4d
//
// - The BODY stays readable Mermaid (renderers ignore %% comments).
// - The SIDECAR carries the exact document, making machine round-trips
//   provably lossless (same invariant as the JSON path).
// - The BODY-HASH records what the body looked like when written. On import,
//   a hash mismatch means a human (or an LLM) edited the text — the edited
//   BODY then wins and is parsed via the DSL (best effort), instead of being
//   silently overwritten by the stale sidecar. Machine round-trips prefer
//   the sidecar; human edits are respected. Callers can force either.

import { DiagramModel, type DiagramLoadOptions } from '../models/DiagramModel';
import { DSL } from '../dsl/DSL';
import { canonicalStringify, fnv1aHex } from './DocumentEnvelope';

export const GRAFLORIA_DOC_PREFIX = '%%grafloria:document ';
export const GRAFLORIA_HASH_PREFIX = '%%grafloria:body-hash ';

export interface ExportTextOptions {
  /**
   * Append the lossless sidecar (default true). Without it the text is pure
   * Mermaid and imports are best-effort DSL parses (the lossy boundary).
   */
  lossless?: boolean;
}

export interface ImportTextOptions extends DiagramLoadOptions {
  /**
   * Which source wins when both exist:
   *  - 'auto' (default): the sidecar wins UNLESS the body hash shows the body
   *    was hand-edited after export — then the edited body wins.
   *  - 'sidecar': always load the sidecar document (ignore body edits).
   *  - 'text': always parse the body text (ignore the sidecar).
   */
  prefer?: 'auto' | 'sidecar' | 'text';
}

export interface ImportTextResult {
  diagram: DiagramModel;
  /** Which source actually produced the model. */
  source: 'sidecar' | 'text';
  /** True when a sidecar existed but the body had been hand-edited. */
  bodyEdited: boolean;
}

/** The body without any %%grafloria sidecar lines (what a human reads/edits). */
export function stripGrafloriaSidecar(text: string): string {
  return text
    .split('\n')
    .filter(
      (line) =>
        !line.trimStart().startsWith(GRAFLORIA_DOC_PREFIX.trim()) &&
        !line.trimStart().startsWith(GRAFLORIA_HASH_PREFIX.trim())
    )
    .join('\n')
    .replace(/\n+$/, '\n');
}

/**
 * Export a diagram as Mermaid-compatible text. With `lossless` (default) the
 * exact document travels in a `%%grafloria:document` comment, so importing this
 * text reproduces the diagram byte-for-byte (serialize-equality), while the
 * body stays renderable by any Mermaid consumer.
 */
export function exportDiagramText(
  diagram: DiagramModel,
  options: ExportTextOptions = {}
): string {
  const dsl = new DSL({ autoLayout: false });
  const body = dsl.generate(diagram, { preserveIds: true, includeComments: false });
  if (options.lossless === false) {
    return body;
  }
  const normalizedBody = body.endsWith('\n') ? body : body + '\n';
  const documentLine = GRAFLORIA_DOC_PREFIX + canonicalStringify(diagram.serialize());
  const hashLine = GRAFLORIA_HASH_PREFIX + fnv1aHex(normalizedBody);
  return normalizedBody + documentLine + '\n' + hashLine + '\n';
}

/**
 * Import diagram text. Sidecar-carrying text loads losslessly through the
 * unified JSON path; pure Mermaid text parses through the DSL (best effort —
 * the documented lossy boundary). See ImportTextOptions.prefer for who wins
 * when the body was hand-edited after export.
 */
export function importDiagramText(
  text: string,
  options: ImportTextOptions = {}
): ImportTextResult {
  const prefer = options.prefer ?? 'auto';

  let documentJson: string | undefined;
  let recordedBodyHash: string | undefined;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimStart();
    if (line.startsWith(GRAFLORIA_DOC_PREFIX)) {
      documentJson = line.slice(GRAFLORIA_DOC_PREFIX.length).trim();
    } else if (line.startsWith(GRAFLORIA_HASH_PREFIX)) {
      recordedBodyHash = line.slice(GRAFLORIA_HASH_PREFIX.length).trim();
    }
  }

  const body = stripGrafloriaSidecar(text);
  const bodyEdited =
    recordedBodyHash !== undefined && fnv1aHex(body) !== recordedBodyHash;

  const useSidecar =
    documentJson !== undefined &&
    (prefer === 'sidecar' || (prefer === 'auto' && !bodyEdited));

  if (useSidecar) {
    const diagram = DiagramModel.fromJSON(JSON.parse(documentJson!), options);
    return { diagram, source: 'sidecar', bodyEdited };
  }

  // Text wins: parse the (possibly hand-edited) Mermaid body. autoLayout off —
  // an import must not silently rearrange whatever positions the DSL carries.
  const dsl = new DSL({ autoLayout: false });
  const diagram = dsl.parse(body);
  return { diagram, source: 'text', bodyEdited };
}
