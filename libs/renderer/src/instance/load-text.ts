import {
  DSL,
  adoptTextGrammarMetadata,
  importDiagramText,
  stripGrafloriaSidecar,
  type DiagramModel,
  type ImportTextOptions,
  type ImportTextResult,
} from '@grafloria/engine';
import { applyEdges, applyNodes, type EdgeWarning } from './model-input';
import { textKitFor } from './text-kits';

/** Hooks a canvas binding gives `loadTextInto` around the reconcile. */
export interface LoadTextHooks {
  /** Called just before the imported nodes are reconciled; its result goes to `afterNodes`. */
  beforeNodes?: () => unknown;
  /** Called right after the nodes (and before the edges) are reconciled. */
  afterNodes?: (before: unknown) => void;
  /** Receives every edge the reconcile drops or re-attaches. */
  warnEdge?: (warning: EdgeWarning) => void;
}

/**
 * Parse Mermaid-compatible text (sidecar-aware) and reconcile it INTO a live model.
 *
 * This is the one load path every canvas uses — `createDiagram().loadText` and the
 * framework canvases (Angular's `<grafloria-diagram-canvas>`) — so a fix here reaches
 * them all. It:
 *  - REFUSES text it cannot read before anything is applied (empty text, an
 *    unsupported diagram type, any parse error), leaving the model exactly as it was;
 *  - hands the reconcilers the imported MODELS (ports, styles and metadata survive);
 *  - reconciles groups and whiteboard ink, which ride in neither nodes nor edges;
 *  - adopts the diagram type and grammar metadata, so `exportText` writes the
 *    grammar the text came in (an erDiagram exports as an erDiagram).
 *
 * It does not schedule a repaint — the caller does.
 */
export function loadTextInto(
  model: DiagramModel,
  text: string,
  options?: ImportTextOptions,
  hooks: LoadTextHooks = {}
): ImportTextResult {
  // REFUSE what cannot be read, before anything is applied: the canvas must
  // be left exactly as it was. The parser recovers line by line, so the
  // import itself never fails — `flowchart\n a[[[ -->` parsed to an empty
  // diagram, "loaded", and wiped the canvas; a header typo became a node;
  // empty text died in the lexer with a TypeError.
  const refuse = (why: string): never => {
    throw new Error(`loadText: ${why} The canvas was left unchanged.`);
  };
  if (typeof text !== 'string' || stripGrafloriaSidecar(text).trim() === '') {
    refuse('the text is empty — there is no diagram in it. (To clear the canvas, call setNodes([]) and setEdges([]).)');
  }
  const result = importDiagramText(text, options);
  if (result.unsupported) {
    refuse(
      `"${result.unsupported}" diagrams cannot be drawn on the canvas. ` +
        `Supported: ${DSL.SUPPORTED_TEXT_TYPES.join(', ')}.`
    );
  }
  if (result.source === 'text') {
    // The body was parsed (no sidecar, or it was hand-edited): it must be
    // what it claims to be, every line of it.
    const errors =
      result.errors ??
      new DSL({ autoLayout: false }).validate(stripGrafloriaSidecar(text.replace(/\r\n?/g, '\n'))).errors;
    if (errors.length > 0) refuse(`the text has errors — ${errors.join(' ')}`);
  }
  // Reconcile INTO the live model (never swap it): applyNodes/applyEdges
  // are full reconcilers, so removals happen and every listener, plugin,
  // and renderer binding stays attached to the same DiagramModel.
  //
  // Hand them the imported MODELS, not `toNodeSpec`/`toEdgeSpec` projections
  // of them. Those projections carry id/type/position/size/selected/data/
  // label/shape/custom — and nothing else — so loading a saved document into
  // a FRESH canvas silently dropped custom ports, node and link styles, and
  // every metadata key but `label`. A model under an id already on the canvas
  // REPLACES the old one — edited text must show its edits. That is what makes
  // exportText's "lossless sidecar … feed the result back to loadText" true.
  // C9: the diagram type's proper notation (ER table cards + crow's feet, UML
  // class cards + markers), when a kit registered one — see text-kits.ts.
  textKitFor(result.diagram.getMetadata('diagramType'))?.decorate(result.diagram);

  const before = hooks.beforeNodes?.();
  applyNodes(model, result.diagram.getNodes());
  hooks.afterNodes?.(before);
  applyEdges(model, result.diagram.getLinks(), hooks.warnEdge);

  // Groups travel in neither `nodes` nor `edges`, so without this they were
  // simply not loaded — the same trap `@grafloria/element`'s loader documents
  // and works around in its own finalize step.
  const incoming = result.diagram.getGroups();
  const wanted = new Set(incoming.map((g) => g.id));
  for (const existing of model.getGroups()) {
    if (!wanted.has(existing.id)) model.removeGroup(existing.id);
  }
  for (const group of incoming) {
    const current = model.getGroup(group.id);
    if (current && current !== group) model.removeGroup(current.id);
    if (model.getGroup(group.id) !== group) model.addGroup(group);
  }

  // Whiteboard ink is outside nodes/edges/groups too. Replaced like them:
  // loading a DIFFERENT diagram left the old one's ink drawn over it, and the
  // ink in the loaded text's lossless sidecar never came back. Plain text
  // carries none, so it clears the ink. Through removeStroke/addStroke (not
  // clearStrokes), so undo, collab capture and the repaint all see it.
  const incomingInk = result.diagram.getStrokes();
  const wantedInk = new Set(incomingInk.map((stroke) => stroke.id));
  for (const existing of model.getStrokes()) {
    if (!wantedInk.has(existing.id)) model.removeStroke(existing.id);
  }
  for (const stroke of incomingInk) {
    const current = model.getStroke(stroke.id);
    if (current && current !== stroke) model.removeStroke(current.id);
    if (model.getStroke(stroke.id) !== stroke) model.addStroke(stroke);
  }

  // …and neither does the DIAGRAM TYPE. exportText picks its grammar by the
  // model's `diagramType` (and the ER/class/state/block generators read
  // diagram-level keys of their own), so an erDiagram, stateDiagram,
  // block-beta or architecture-beta loaded here exported as a flowchart,
  // and a classDiagram lost its members.
  adoptTextGrammarMetadata(model, result.diagram);
  return result;
}
