/**
 * `fromDocument()` — the LOAD front door.
 *
 * ---------------------------------------------------------------------------
 * THE GAP THIS CLOSES
 * ---------------------------------------------------------------------------
 * Saving was never the problem. `DiagramSerializer.serialize()` already emits a
 * document that round-trips byte-identically, carrying nodes, links, ports,
 * groups and every scrap of kit metadata. LOADING was the problem, in three
 * layers:
 *
 *   1. THERE WAS NO FRONT DOOR. `CreateDiagramOptions` takes `nodes`/`edges`;
 *      nothing took a saved document. `deserialize()` handed back a
 *      `DiagramModel` that no entry point would render.
 *   2. THE KITS' POST-RENDER WIRING NEVER RAN. `erDiagram()`/`umlDiagram()` do
 *      their interaction wiring in `finalize(api)` — row selection, in-canvas
 *      editing, the suppressed resize handles. A document has no `finalize`, so
 *      a "successfully loaded" ERD was a PICTURE of an ERD: it looked right and
 *      did nothing.
 *   3. CUSTOM NODES HAD NO PAINTER. `renderCustomNode` is a function; functions
 *      do not serialize. A loaded dashboard mounted 14 widget hosts and painted
 *      into none of them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE NODES GO BACK IN AS LIVE MODELS
 * ---------------------------------------------------------------------------
 * The obvious implementation projects every loaded `NodeModel` back down into a
 * `NodeSpec` and lets `buildNode()` rebuild it. That is a LOSSY detour, and it
 * loses exactly the things a saved diagram is made of: `toNodeSpec()` carries
 * id/position/size/data/label/shape and nothing else — no ports, no metadata,
 * no behavior. An ER card would come back with four default side ports instead
 * of its field ports, and every FK→PK edge would silently reroute.
 *
 * It is also unnecessary. `applyNodes()`/`applyEdges()` have always accepted a
 * live `NodeModel`/`LinkModel` and pass it through untouched — the documented
 * "mix data with your own model" seam. So the loaded models ARE the input, and
 * nothing is projected, converted or lost.
 *
 * ---------------------------------------------------------------------------
 * HOW PAINTERS COME BACK
 * ---------------------------------------------------------------------------
 * ER and UML need NOTHING: their card is `metadata.html`, a structured tree the
 * renderer paints itself, and metadata round-trips. Measured, not assumed — a
 * loaded ER document paints byte-identical cards with no painter in sight.
 *
 * Dashboard widgets are custom HTML nodes and do need one. The kit REBUILDS the
 * widget spec from the node's own metadata (`widgetKind` / `widgetSpec` /
 * `widgetTitle`) and hands it to the same `defaultWidgetRenderer` the authoring
 * path uses, so a loaded board is drawn by the identical code.
 *
 * Precedence, and why:
 *
 *   caller's `renderCustomNode`  — an explicit override outranks everything.
 *   caller's `renderWidget`      — the app's own chart painter; a board that was
 *                                  authored with one must be reloaded with it.
 *   the kit's own painter        — but ONLY for nodes the kit actually stamped.
 *   {@link getNodeType} registry — everything else, exactly as `render()` does.
 *
 * The kit claims a node by its METADATA, never by `type === 'widget'` alone.
 * Hijacking a type name would mean any unrelated diagram with a node called
 * "widget" got dashboard chrome painted over it; requiring the stamp the kit
 * itself wrote keeps the registry the general seam it is meant to be.
 */
import { DiagramSerializer } from '@grafloria/engine';
import type {
  DiagramDocumentEnvelope,
  DiagramModel,
  GroupModel,
  LinkModel,
  NodeModel,
  SerializedDiagramData,
} from '@grafloria/engine';
import { getNodeType } from './node-type-registry';
import { bindRowInteractions } from './diagram-kit/rows';
import { bindCardEditing } from './diagram-kit/editing';
import { ensureDiagramKitStyles } from './diagram-kit/styles';
import { bindDashboardGrid, type DashboardGridHandle } from './dashboard-kit/grid-binder';
import { ensureDashboardKitStyles } from './dashboard-kit/styles';
import { defaultWidgetRenderer, type WidgetRenderer } from './dashboard-kit/widgets';
import type { DashboardWidgetSpec } from './dashboard-kit/dashboard';

/** Anything `DiagramSerializer.deserialize()` accepts, or the JSON string of it. */
export type SavedDiagram =
  | SerializedDiagramData
  | DiagramDocumentEnvelope
  | Record<string, unknown>
  | string;

export interface FromDocumentOptions {
  /**
   * The app's own widget painter — the same function it passed to
   * `dashboard({ renderWidget })`. A board authored with a custom painter must
   * be RELOADED with it, or the reload silently drops the app's chrome.
   */
  renderWidget?: WidgetRenderer;
  /** Full override of the custom-node painter. Outranks everything. */
  renderCustomNode?: (node: NodeModel, host: HTMLElement) => void;
  /**
   * Re-attach kit interaction wiring (row selection, in-canvas editing, the
   * dashboard grid binder). Default true — a loaded diagram should behave like
   * the one that was saved. Pass false for a read-only viewer.
   */
  interactive?: boolean;
}

/** What {@link fromDocument} returns: a `render()` spec, plus the way back in. */
export interface LoadedDiagramSpec {
  nodes: NodeModel[];
  edges: LinkModel[];
  renderCustomNode: (node: NodeModel, host: HTMLElement) => void;
  finalize: (api: unknown) => void;
  /** The deserialized model — the escape hatch, available before any render. */
  readonly model: DiagramModel;
  /**
   * Live grid binders for the boards `finalize()` re-attached, keyed by group
   * id. Empty for a document that is not a dashboard.
   */
  readonly boards: Map<string, DashboardGridHandle>;
}

/** The board geometry `dashboard()` stamps on its view group so a reload can rebind. */
interface PersistedBoard {
  columns?: number;
  gap?: number;
  padding?: number;
  sizing?: 'fit' | 'grow';
  baseRowHeight?: number;
  designHeight?: number;
  float?: boolean;
  rtl?: boolean;
}

/** True when the node is an ER entity card or a UML class card. */
function isDiagramKitCard(node: NodeModel): boolean {
  return node.getMetadata('kitEntity') !== undefined || node.getMetadata('kitClass') !== undefined;
}

/**
 * Rebuild the widget spec the kit's renderers eat, from the node's own metadata.
 * Returns null for a node the dashboard kit did not stamp — see the header on
 * why the type name alone is not enough.
 */
function widgetSpecOf(node: NodeModel): DashboardWidgetSpec | null {
  const kind = node.getMetadata('widgetKind');
  if (kind === undefined) return null;
  const title = node.getMetadata('widgetTitle');
  return {
    id: node.id,
    kind: kind as string,
    ...(typeof title === 'string' ? { title } : {}),
    data: (node.getMetadata('widgetSpec') ?? {}) as Record<string, unknown>,
    span: node.getMetadata('columnSpan') as number | undefined,
    rows: node.getMetadata('rowSpan') as number | undefined,
  };
}

/**
 * Turn a saved document back into something `render()` can mount.
 *
 * ```ts
 * const json = JSON.stringify(new DiagramSerializer().serialize(api.getModel()));
 * // …later, in a fresh page:
 * render(fromDocument(json), host);
 * ```
 *
 * Accepts the flat serializer form, the portable envelope, or the JSON string
 * of either.
 */
export function fromDocument(
  document: SavedDiagram,
  options: FromDocumentOptions = {}
): LoadedDiagramSpec {
  const parsed = typeof document === 'string' ? parseDocument(document) : document;
  const model = new DiagramSerializer().deserialize(parsed as never);
  const nodes = model.getNodes();
  const groups = model.getGroups();
  const boards = new Map<string, DashboardGridHandle>();

  // The kits inject their stylesheet from their builder; a load never calls one,
  // so an un-styled card would come back as unstyled divs. Only for documents
  // that actually contain that kit's nodes.
  if (nodes.some(isDiagramKitCard)) ensureDiagramKitStyles();
  if (nodes.some((n) => widgetSpecOf(n) !== null)) ensureDashboardKitStyles();

  const paintWidget = options.renderWidget ?? defaultWidgetRenderer;

  const renderCustomNode = (node: NodeModel, host: HTMLElement): void => {
    if (options.renderCustomNode) return options.renderCustomNode(node, host);
    const widget = widgetSpecOf(node);
    if (widget) return paintWidget(widget, host);
    getNodeType(node.type)?.(node, host);
  };

  const finalize = (api: unknown): void => {
    const a = api as FinalizeApi | null;
    if (!a) return;

    // -- groups ---------------------------------------------------------------
    // Groups are not part of `nodes`/`edges`, so nothing else would carry them
    // across. A dashboard without its view group is a set of loose widgets: no
    // board frame, and nothing for the grid binder to bind to.
    const live = a.getModel?.();
    if (live) {
      for (const group of groups) {
        if (!live.getGroup?.(group.id)) live.addGroup?.(group);
      }
    }

    if (options.interactive === false) return;

    // -- ER / UML -------------------------------------------------------------
    const cards = nodes.filter(isDiagramKitCard);
    if (cards.length > 0 && a.container) {
      for (const node of cards) {
        // The card draws its own selection ring; the node's resize handles would
        // frame it a second time. `erDiagram().finalize` does this on the live
        // model for the same reason — and behaviour is NOT in the document.
        node.setBehavior?.({ resizable: false });
      }
      // `rowSelection: false` is recorded only when it is the non-default, so an
      // ordinary document stays byte-identical to what it always was.
      if (!cards.some((n) => n.getMetadata('kitRowSelection') === false)) {
        bindRowInteractions(a as never);
      }
      if (cards.some((n) => n.getMetadata('kitEditable') === true)) {
        bindCardEditing(a as never);
      }
    }

    // -- dashboard boards -----------------------------------------------------
    for (const group of groups) {
      const board = group.getMetadata('dashboardBoard') as PersistedBoard | undefined;
      if (!board) continue;
      boards.set(group.id, bindDashboardGrid(a as never, group, { ...board }));
    }
  };

  return { nodes, edges: model.getLinks(), renderCustomNode, finalize, model, boards };
}

interface FinalizeApi {
  container?: HTMLElement;
  getModel?: () => {
    getGroup?: (id: string) => GroupModel | undefined;
    addGroup?: (g: GroupModel) => void;
  };
}

function parseDocument(json: string): SavedDiagram {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`fromDocument: not a saved diagram (${(error as Error).message})`);
  }
}
