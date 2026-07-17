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

import { DiagramModel, type DiagramLoadOptions, type SerializedDiagram } from '../models/DiagramModel';
import { LinkModel } from '../models/LinkModel';
import type { NodeModel } from '../models/NodeModel';
import type { PortModel } from '../models/PortModel';
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
  /**
   * True when a hand-edited body was applied ON TOP of the sidecar document —
   * the edit took, and everything the grammar cannot express (positions,
   * styles, ports, groups, viewport) survived from the sidecar.
   */
  sidecarMerged?: boolean;
  /** True when a sidecar line existed but its JSON would not parse. */
  sidecarInvalid?: boolean;
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
  const documentLine =
    GRAFLORIA_DOC_PREFIX + canonicalStringify(sanitizeForSidecar(diagram.serialize()));
  const hashLine = GRAFLORIA_HASH_PREFIX + fnv1aHex(normalizedBody);
  return normalizedBody + documentLine + '\n' + hashLine + '\n';
}

/**
 * The sidecar carries the DOCUMENT — not the viewing session and not derived
 * per-frame state. Two families are stripped:
 *
 * - EPHEMERAL entity state (selected / hovered / focused): per-viewer facts.
 *   Baked in, a committed file re-imports with a node pre-selected because
 *   someone happened to have it selected at export time. Same reasoning (and
 *   same key set) as the collab layer's EPHEMERAL exclusion in OpCapture.
 * - Link `points`: the routed polyline is DERIVED — the renderer re-routes and
 *   re-syncs it on the first frame. Serialized, a single smooth link drags a
 *   17-sample flattened curve into the text form, churning every git diff the
 *   "git-diffable text" story exists for.
 */
export function sanitizeForSidecar(doc: SerializedDiagram): SerializedDiagram {
  const EPHEMERAL = ['selected', 'hovered', 'focused'];
  const stripState = (entity: Record<string, unknown>): Record<string, unknown> => {
    const state = entity['state'];
    // LINKS carry a state STRING ('default' | 'selected' | …). Spreading it
    // would explode it into a character map ({0:'d',1:'e',…}) — and a
    // selected/hovered string is per-viewer anyway: reset it to 'default'.
    if (typeof state === 'string') {
      return EPHEMERAL.includes(state) ? { ...entity, state: 'default' } : entity;
    }
    if (!state || typeof state !== 'object') return entity;
    const cleaned = { ...(state as Record<string, unknown>) };
    for (const key of EPHEMERAL) delete cleaned[key];
    return { ...entity, state: cleaned };
  };
  const nodes = ((doc.nodes as unknown as Array<Record<string, unknown>>) ?? []).map(stripState);
  const links = ((doc.links as unknown as Array<Record<string, unknown>>) ?? []).map((l) => {
    const cleaned = stripState({ ...l });
    // Emptied, not deleted: LinkModel.fromJSON expects the array to exist. The
    // routing pre-pass rebuilds the real polyline on the first frame.
    cleaned['points'] = [];
    return cleaned;
  });
  return { ...doc, nodes, links } as unknown as SerializedDiagram;
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

  // Line endings are TRANSPORT, not content. A file that crossed a Windows
  // editor or a CRLF-checkout arrives with \r\n; hashed raw, every line reads
  // as "hand-edited" and a byte-identical document used to lose its entire
  // layout to the text path.
  const normalized = text.replace(/\r\n?/g, '\n');

  let documentJson: string | undefined;
  let recordedBodyHash: string | undefined;
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trimStart();
    if (line.startsWith(GRAFLORIA_DOC_PREFIX)) {
      documentJson = line.slice(GRAFLORIA_DOC_PREFIX.length).trim();
    } else if (line.startsWith(GRAFLORIA_HASH_PREFIX)) {
      recordedBodyHash = line.slice(GRAFLORIA_HASH_PREFIX.length).trim();
    }
  }

  // A sidecar that will not parse (truncated by an editor, mangled by a
  // merge) is a MISSING sidecar, not a crash: the body is still right there.
  let sidecarDoc: SerializedDiagram | undefined;
  let sidecarInvalid = false;
  if (documentJson !== undefined) {
    try {
      sidecarDoc = JSON.parse(documentJson) as SerializedDiagram;
    } catch {
      sidecarInvalid = true;
    }
  }

  const body = stripGrafloriaSidecar(normalized);
  const bodyEdited =
    recordedBodyHash !== undefined && fnv1aHex(body) !== recordedBodyHash;

  const useSidecar =
    sidecarDoc !== undefined &&
    (prefer === 'sidecar' || (prefer === 'auto' && !bodyEdited));

  if (useSidecar) {
    const diagram = DiagramModel.fromJSON(sidecarDoc!, options);
    return { diagram, source: 'sidecar', bodyEdited, sidecarInvalid };
  }

  // Text wins: parse the (possibly hand-edited) Mermaid body. autoLayout off —
  // an import must not silently rearrange whatever positions the DSL carries.
  const dsl = new DSL({ autoLayout: false });
  const parsed = dsl.parse(body);

  // THE MERGE. The grammar covers structure and labels — nothing else. Loading
  // the parsed body alone therefore wiped positions, sizes, styles, ports and
  // groups on every hand edit (live report: change one label, lose the whole
  // layout). When a sidecar exists, the edited body is applied ON TOP of it:
  // the sidecar document is the base; the body dictates which nodes/edges
  // exist, their labels and shapes; everything the text cannot express rides
  // through untouched.
  if (sidecarDoc !== undefined && prefer !== 'text') {
    const diagram = applyBodyOntoSidecar(sidecarDoc, parsed, options);
    return { diagram, source: 'text', bodyEdited, sidecarMerged: true, sidecarInvalid };
  }
  return { diagram: parsed, source: 'text', bodyEdited, sidecarInvalid };
}

/**
 * Sidecar-as-base merge: rebuild from the sidecar document, then apply the
 * hand-edited body's STRUCTURE onto it.
 *
 *  - a node in both: the body's label and shape win; geometry/style/ports stay
 *  - a node only in the body: added as parsed (the DSL's default placement)
 *  - a node only in the sidecar: it was deleted in the text — remove it
 *  - links are matched as (source, target) PAIRS, count-aware: label updates
 *    apply to survivors, removed pairs go, new pairs come in as parsed
 */
function applyBodyOntoSidecar(
  sidecarDoc: SerializedDiagram,
  parsed: DiagramModel,
  options: DiagramLoadOptions
): DiagramModel {
  const base = DiagramModel.fromJSON(sidecarDoc, options);

  const parsedNodes = parsed.getNodes();
  const parsedIds = new Set(parsedNodes.map((n) => n.id));

  // Deletions first (cascades take stale links with them).
  for (const node of [...base.getNodes()]) {
    if (!parsedIds.has(node.id)) base.removeNode(node.id);
  }

  // Label / shape updates + additions.
  for (const parsedNode of parsedNodes) {
    const existing = base.getNode(parsedNode.id);
    if (existing) {
      const label = parsedNode.getLabel?.() ?? parsedNode.getMetadata('label');
      if (label !== undefined) existing.setLabel(label as string);
      const shape = parsedNode.getMetadata('shape');
      if (shape !== undefined) existing.setMetadata('shape', shape);
    } else {
      base.addNode(parsedNode);
    }
  }

  // Links, as pair multisets.
  const pairKey = (sourceNodeId: string | undefined, targetNodeId: string | undefined): string =>
    `${sourceNodeId ?? '?'}→${targetNodeId ?? '?'}`;
  const unclaimed = new Map<string, Array<ReturnType<DiagramModel['getLinks']>[number]>>();
  for (const link of base.getLinks()) {
    const key = pairKey(link.sourceNodeId, link.targetNodeId);
    const bucket = unclaimed.get(key) ?? [];
    bucket.push(link);
    unclaimed.set(key, bucket);
  }
  for (const parsedLink of parsed.getLinks()) {
    const key = pairKey(parsedLink.sourceNodeId, parsedLink.targetNodeId);
    const bucket = unclaimed.get(key);
    const survivor = bucket?.shift();
    if (survivor) {
      const label = parsedLink.getMetadata('label');
      if (label !== undefined) survivor.setMetadata('label', label);
      continue;
    }
    // New in the body. Endpoints resolve inside `base` (ports differ between
    // the two models), so wire it as a fresh smart link between the nodes.
    const source = base.getNode(parsedLink.sourceNodeId ?? '');
    const target = base.getNode(parsedLink.targetNodeId ?? '');
    if (source && target) {
      let link = base.createSmartLink(source, target, parsedLink.pathType ?? 'smooth');
      if (!link) {
        // Smart-linking validates port TYPES — but a hand-written `a --> b`
        // is an explicit instruction, and a node whose author gave it only
        // input ports must still honour it. Wire the least-wrong port pair
        // directly rather than silently dropping the human's edge.
        const pick = (node: NodeModel, prefer: string): PortModel | undefined => {
          const ports = [...node.getPorts().values()];
          return ports.find((p) => p.type === prefer || p.type === 'bi') ?? ports[0];
        };
        const sourcePort = pick(source, 'output');
        const targetPort = pick(target, 'input');
        if (sourcePort && targetPort) {
          link = new LinkModel(sourcePort.id, targetPort.id, parsedLink.pathType ?? 'smooth');
          base.addLink(link);
        }
      }
      const label = parsedLink.getMetadata('label');
      if (link && label !== undefined) link.setMetadata('label', label);
    }
  }
  // Whatever pairs the body no longer declares are deletions.
  for (const bucket of unclaimed.values()) {
    for (const leftover of bucket) base.removeLink(leftover.id);
  }

  // The body's direction is authoritative for the text form's own metadata.
  const direction = parsed.getMetadata?.('direction');
  if (direction !== undefined) base.setMetadata?.('direction', direction);

  return base;
}
