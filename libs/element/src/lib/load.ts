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
import {
  createDashboardHandle,
  type DashboardApiRef,
  type DashboardHandle,
  type DashboardHandleContext,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from './dashboard-kit/dashboard';

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
   *
   * This is the SAME Map instance the handle drives (`handle.binderOf` returns
   * from it), so the two can never disagree — `boards` is now derived from the
   * handle's own binders rather than a parallel copy.
   */
  readonly boards: Map<string, DashboardGridHandle>;
  /**
   * The dashboard toolbar handle over the reloaded board(s) — the SAME
   * `DashboardHandle` `dashboard()` returns, built by the one shared builder so
   * it cannot drift from the authoring surface: addWidget/showView/setSizing/
   * setColumns/toJSON/exportIds and the widget handles, all live on the reload.
   *
   * INERT (empty `views`, every op a no-op) for a document that is not a
   * dashboard — an ER/UML load carries no board, so an honest empty handle
   * beats one that pretends a class card is a widget.
   *
   * Two carried limits, both because the datum is not in the document:
   *  - `responsive` is a runtime seam, never serialised, so a reloaded board is
   *    fixed at its saved column count until `setColumns`/`responsive` is
   *    re-supplied; `toJSON()` therefore omits it.
   *  - `renderWidget`/`onLayoutChange` are functions and cannot serialise —
   *    pass `renderWidget` to `fromDocument({ renderWidget })` to reattach the
   *    app's own painter, exactly as `dashboard({ renderWidget })` did.
   */
  readonly handle: DashboardHandle;
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

  // -- reconstruct the dashboard handle's context from the loaded model -------
  // Every board group carries `dashboardBoard` geometry; its widget members
  // carry `widgetSpec`/title/span/rows — the canonical, lossless source for
  // widgets (the load.ts principle that non-widget nodes go back as LIVE models
  // is untouched; only widgets are rebuilt from metadata, exactly as the
  // renderCustomNode painter already does). That is enough to build the SAME
  // handle dashboard() does, through the SAME builder — no drifting twin.
  const dashGroups = groups.filter((g) => g.getMetadata('dashboardBoard') !== undefined);
  const specById = new Map<string, DashboardWidgetSpec>();
  const viewOfWidget = new Map<string, string>();
  const ctxViews: DashboardViewSpec[] = dashGroups.map((g) => {
    const board = g.getMetadata('dashboardBoard') as PersistedBoard;
    const widgets: DashboardWidgetSpec[] = [];
    for (const memberId of g.members ?? []) {
      const node = model.getNode(memberId);
      const ws = node ? widgetSpecOf(node) : null;
      if (!ws) continue; // non-widget members (e.g. a nested slab group) are not widgets
      specById.set(ws.id, ws);
      viewOfWidget.set(ws.id, g.id);
      widgets.push(ws);
    }
    return { id: g.id, name: g.name, widgets, columns: board.columns, width: g.size?.width, height: g.size?.height };
  });

  const firstBoard = dashGroups[0]?.getMetadata('dashboardBoard') as PersistedBoard | undefined;
  // The active view is the one the save left ON camera (x≈0); the others were
  // parked far off-screen by showView. Falls back to the first board when
  // positions are ambiguous (e.g. a single view, or positions not restored).
  const activeGroup = dashGroups.find((g) => g.position.x > -1000) ?? dashGroups[0];

  const ctx: DashboardHandleContext = {
    views: ctxViews,
    groups: new Map(dashGroups.map((g) => [g.id, g])),
    // The SAME map the LoadedDiagramSpec exposes as `boards` — derived, not a copy.
    binders: boards,
    specById,
    viewOfWidget,
    hosts: new Map<string, HTMLElement>(),
    renderWidget: paintWidget,
    columns: firstBoard?.columns ?? 12,
    gap: firstBoard?.gap ?? 8,
    rowHeight: firstBoard?.baseRowHeight ?? 130,
    boardW: dashGroups[0]?.size?.width ?? 1180,
    boardH: dashGroups[0]?.size?.height ?? 660,
    // responsive is NOT in the document (a runtime seam), so it is deliberately
    // absent from the round-trip; width/height/columns/gap/sizing/float/rtl are.
    optionsBase: firstBoard
      ? {
          columns: firstBoard.columns,
          gap: firstBoard.gap,
          rowHeight: firstBoard.baseRowHeight,
          sizing: firstBoard.sizing,
          float: firstBoard.float,
          rtl: firstBoard.rtl,
          width: dashGroups[0]?.size?.width,
          height: dashGroups[0]?.size?.height,
        }
      : {},
    active: activeGroup?.id ?? 'main',
    apiRef: null,
  };
  const handle = createDashboardHandle(ctx);

  const renderCustomNode = (node: NodeModel, host: HTMLElement): void => {
    if (options.renderCustomNode) return options.renderCustomNode(node, host);
    // Prefer the ctx spec object so a later handle.update()/repaint() mutates the
    // SAME object this initial paint used; fall back to a fresh rebuild for a
    // loose widget node that belongs to no reconstructed board.
    const widget = specById.get(node.id) ?? widgetSpecOf(node);
    if (widget) {
      ctx.hosts.set(node.id, host); // captured so update()/repaint() can find the host
      return paintWidget(widget, host);
    }
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
    // Wire the render API into the handle's boxed cell, then bind each board.
    // `bindDashboardGrid` sync()s on construction, so the handle's cellOf/toJSON
    // work immediately — no camera move, no showView, so the paint is byte-for-
    // byte what a boards-only load produced.
    ctx.apiRef = a as unknown as DashboardApiRef;
    for (const group of groups) {
      const board = group.getMetadata('dashboardBoard') as PersistedBoard | undefined;
      if (!board) continue;
      boards.set(group.id, bindDashboardGrid(a as never, group, { ...board }));
    }
  };

  return { nodes, edges: model.getLinks(), renderCustomNode, finalize, model, boards, handle };
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
