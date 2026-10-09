import { DiagramEngine, getMutationEpoch, exportDiagramText, importDiagramText, CommentStore, layoutArchitecture, DSL, stripGrafloriaSidecar, adoptTextGrammarMetadata } from '@grafloria/engine';
import type { MeasureText, ClipboardData } from '@grafloria/engine';
import { CommentOverlayController } from '../comments/comment-overlay';
import type {
  DiagramModel,
  GroupModel,
  LinkModel,
  LODLevel,
  NodeModel,
  ExportTextOptions,
  ImportTextOptions,
  ImportTextResult,
} from '@grafloria/engine';
import type { Theme } from '../types/theme.types';
import type { HighlightConnectedOptions, SVGRendererConfig } from '../types/renderer.interface';
import type { Rectangle } from '../types/geometry.types';
import { contentBounds } from './content-bounds';
import type { ExportFormat, ExportOptions } from '../types/renderer.interface';
import type { ColorMode, ThemeSet } from '../themes/color-mode';
import type { TokenBridge } from '../themes/token-bridge';
import type { GovernorState } from '../perf/quality-governor';
import type { AnimationService } from '../services/animation.service';
import type { SvgExportResult } from '../export/svg-export';
import type { PdfExportResult } from '../export/pdf/pdf-export';
import { createExportPipeline } from '../export/capture-pipeline';
import type { VNode } from '../types/vnode.types';
import { SVGRenderer } from '../svg/svg-renderer';
import type { FrameCoverage } from '../svg/svg-renderer';
import type { DiagramRegistry } from '../ext/diagram-registry';
import { VNodePatcher } from '../vnode/patch';
import { InteractionController } from '../interaction/interaction-controller';
import { HighlighterController, DEFAULT_HIGHLIGHTER_CONFIG, type Highlighter, type HighlighterConfig } from '../interaction/highlighters';
import { ViewportController } from '../viewport/viewport-controller';
import type { Feature, FeatureContext } from './workflow/feature';
import { installConnectReason } from './workflow/connect-reason';
import { createClipboardApi } from './workflow/clipboard';
import { installRunOverlay } from './workflow/run-overlay';
import { insertNodeOnLink } from './workflow/insert-on-link';
import { placeFlow, tidyFlow } from './workflow/flow-place';
import { createNodeTemplates, installNodeTemplates } from './workflow/node-templates';
import { installAffordances } from './workflow/affordances';
import type { AffordanceOptions, LinkAddRequest, PortAddRequest } from './workflow/affordances';
import type { NodeTemplate } from './workflow/node-templates';
import type { FlowPlaceOptions, PlaceNodesOptions } from './workflow/flow-place';
import type { InsertNodeOnLinkOptions, InsertNodeOnLinkResult } from './workflow/insert-on-link';
import type { RunOverlay, RunOverlayFeature } from './workflow/run-overlay';
import type { ClipboardHooks, PasteOptions } from './workflow/clipboard';
import type { CanvasRect, Unsubscribe } from '../viewport/viewport-controller';
import { RenderScheduler } from './render-scheduler';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderOptions } from './dom-event-binder';
import { applyEdges, applyGroups, applyNodes, toNodeSpec, toEdgeSpec } from './model-input';
import type { EdgeWarning } from './model-input';
import type { EdgeSpec, GroupSpec, NodeSpec } from './model-input';
import {
  HTML_LAYER_CLASS,
  INSTANCE_ATTR,
  ROOT_CLASS,
  ROOT_STYLE,
  SVG_LAYER_CLASS,
  SVG_LAYER_STYLE,
  htmlLayerStyle,
  nodeHostStyle,
} from './layers';
import type { HydrationSnapshot } from '../ssr/render-to-static';
import { isBrowser } from '../platform';
import { HtmlHostCuller } from '../lazy/host-culling';
import type { HostCullOptions } from '../lazy/host-culling';
import type { ViewLifecycle } from '../lazy/view-lifecycle';
import { ShapeAwareHighlighterController } from './highlighter-overlay';

/**
 * `createDiagram()` — the headless instance factory.
 *
 * Wave 3 fixed the CONTRACT (./diagram-instance.ts) and listed four blockers.
 * All four are now closed and this is the factory they were building towards:
 *
 *   1. VNode → DOM materializer  → `VNodePatcher`      (wave 3)
 *   2. DOM event binding         → `DomEventBinder`    (wave 4, this card)
 *   3. Render scheduling         → `RenderScheduler`   (wave 4, this card)
 *   4. Custom-node host callback → `renderCustomNode`  (wave 4, this card)
 *
 * Every framework wrapper in the workspace is now a thin shell over this: the
 * React `<GrafloriaFlow>` and the `<grafloria-flow>` custom element both do nothing but
 * (a) forward props into `setNodes`/`setEdges` and (b) turn `on(...)` events
 * into their own render signal. There is ZERO diagram logic in either.
 */

/** Nodes/edges may be handed in as plain specs or as live engine models. */
export type NodeInput = NodeSpec | NodeModel;
export type EdgeInput = EdgeSpec | LinkModel;

export interface DiagramEventMap {
  /**
   * A connection drag (from a port, or its "+") ended over NOTHING. The host can
   * offer the next step there; `world` is where, in diagram coordinates.
   */
  'connect:drop-empty': { nodeId: string | undefined; portId: string; world: { x: number; y: number }; clientPoint: { x: number; y: number } };
  /** A single node was dragged and released over a link (`nodeDropOnLink`). Nothing changed; the host decides. */
  'link:insert-request': { linkId: string; nodeId: string; clientPoint: { x: number; y: number } };
  /**
   * Something in the input did not land as written, and the instance carried on:
   * an edge dropped because an end resolves to no port, or attached to a
   * fallback port because the one it names does not exist. Warnings raised while
   * `createDiagram` applies its initial spec arrive a microtask later, so a
   * listener added right after it returns still hears them.
   */
  'renderer:warning': EdgeWarning;
  /** The "+" on an unconnected output port was pressed (`affordances.portAdd`). */
  'port:add-request': PortAddRequest;
  /** The "+" at a hovered link's midpoint was pressed (`affordances.linkAdd`). */
  'link:add-request': LinkAddRequest;
  /** The delete button beside it was pressed (`affordances.linkDelete`). */
  'link:delete-request': LinkAddRequest;
  'nodes:change': { nodes: NodeModel[] };
  'edges:change': { edges: LinkModel[] };
  'selection:change': { nodes: NodeModel[]; edges: LinkModel[] };
  connect: { link: LinkModel };
  reconnect: { link: LinkModel; endpoint: 'source' | 'target' };
  'node:click': { node: NodeModel; world: { x: number; y: number } };
  'node:doubleclick': { node: NodeModel; world: { x: number; y: number } };
  'edge:click': { edge: LinkModel; world: { x: number; y: number } };
  'viewport:change': { viewport: Rectangle; zoom: number };
  ready: void;
}

export type DiagramEventName = keyof DiagramEventMap;
export type DiagramEventHandler<K extends DiagramEventName> = (
  payload: DiagramEventMap[K]
) => void;

export interface CreateDiagramOptions extends DomEventBinderOptions {
  nodes?: NodeInput[];
  edges?: EdgeInput[];
  /**
   * Zones: groups around some boxes, each with a frame of its own — fill,
   * border, dash, a caption in a corner (the tinted regions of the diagrams AI
   * tools draw). A live `GroupModel` passes through. See {@link GroupSpec}.
   */
  groups?: Array<GroupSpec | GroupModel>;
  theme?: Theme;

  /**
   * Follow the OS colour scheme instead of pinning `theme`.
   *
   * `'system'` upgrades to the high-contrast theme under `prefers-contrast: more`
   * or forced-colors, rather than flashing a light canvas at someone who asked
   * the operating system for neither.
   */
  colorMode?: ColorMode;
  /** The themes `colorMode` switches between. Defaults to `DEFAULT_THEME_SET`. */
  themes?: ThemeSet;
  /** Drive Grafloria's variables from the host's design tokens (shadcn/MUI/Tailwind). */
  tokenBridge?: TokenBridge;
  /**
   * The full renderer config, for every knob the ergonomic fields above do not
   * name: `connectionPoint` / `smartConnectionPoints` (floating edges),
   * `parallelLinks` + `parallelSpacing`, `channelNudging`, `jumpOwnership`,
   * `globalRouting`, `linkHitAreaWidth`. Every field was documented, consumed by
   * the renderer, and settable by NOBODY — the one factory that builds a renderer
   * for a host never passed the config on. The named fields above win over
   * anything set here, and `instanceId` is omitted because hydration owns it.
   */
  renderer?: Omit<SVGRendererConfig, 'instanceId'>;

  /**
   * Select a node and its lines come forward in the page's ink while every other
   * line fades back; a line of the selection that runs across another node is
   * lifted above the cards and drawn dashed. Off by default; see
   * {@link HighlightConnectedOptions}. Wins over `renderer.highlightConnected`.
   * Switch it live with `setHighlightConnected()`.
   */
  highlightConnected?: boolean | HighlightConnectedOptions;

  /**
   * The OUTLINE LAYER Angular's canvas draws: an outline around the hovered node,
   * the selected node, nodes with a validation issue, and the valid targets while
   * a connection is drawn. `true` turns every kind on; an object turns kinds on or
   * off one by one, over the defaults ({@link HighlighterConfig}). Off when unset,
   * so an existing app is unchanged. Validation outlines include the engine's
   * warnings, an unregistered node type among them; `{ showValidation: false }`
   * keeps only hover and selection. Switch it live with `setHighlighterConfig()`.
   */
  highlighterConfig?: boolean | Partial<HighlighterConfig>;

  /**
   * Arrange the diagram on mount. `'architecture'` composes it the way AI tools
   * hand-draw one: zones as regions on a grid, boxes sized to their words and
   * aligned in rows, lines straight where boxes line up and bent in the gutters,
   * a node's `near` note beside its target. Positions in the spec are not needed
   * (and are overridden). The same layout runs from Mermaid with
   * `%%grafloria:layout architecture`, or later with `engine.layout('architecture')`.
   */
  layout?: 'architecture';

  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Camera origin in world coordinates. */
  viewport?: { x: number; y: number };

  /** Attach to an existing engine instead of creating one. */
  engine?: DiagramEngine;
  /** Passed through to `new DiagramEngine({ interaction })`. */
  interaction?: Record<string, unknown>;
  /** Force the renderer's CSS scope (hydration does this for you). */
  instanceId?: string;
  /** Fit the camera to the content on mount. */
  fitView?: boolean;

  /**
   * Blocker #4: host hook for nodes that render as framework components rather
   * than SVG (`custom: true` / `metadata.useHTMLLayer`). The instance creates and
   * positions an absolutely-placed host element inside the HTML layer and hands
   * it to you; you own what goes inside it.
   *
   * RETURN A PROMISE IF YOU DRAW LATER. A painter that defers — to a
   * `requestAnimationFrame`, a `fetch`, a framework's async render, a web font — has
   * drawn nothing by the time a synchronous export reads the host, and its widget used
   * to come out as a marked box. Returning the promise is the SIGNAL that closes that:
   * `await diagram.export(…)` waits for exactly the painters that said they were not
   * done, and for nothing else — no polling and no fixed sleep. It is bounded by
   * {@link ExportOptions.customNodeTimeout} (default 5s) so a painter that never settles
   * cannot hang a print job, and a miss is WARNED about rather than silently blank.
   *
   * ```ts
   * renderCustomNode: async (node, el) => {
   *   const data = await fetch(`/api/widget/${node.id}`).then(r => r.json());
   *   el.append(chartFor(data));
   * }
   * ```
   *
   * Nothing else changes: the promise is ignored by the frame loop (a widget still
   * appears when it appears) and by `exportSvgString()` / `exportPdf()`, which are
   * synchronous by contract and report an unfinished painter instead of waiting. A
   * rejection is caught, reported, and never reaches the host as an unhandled rejection.
   */
  renderCustomNode?: (node: NodeModel, element: HTMLElement) => void | Promise<void>;
  /** Called before a custom node's host element is removed — unmount your component. */
  removeCustomNode?: (nodeId: string, element: HTMLElement) => void;

  /**
   * VIEWPORT-CULL the custom-node hosts: keep only the ones near the viewport in the
   * document. `true` for the defaults, or an options object (`margin`, `hysteresis`,
   * `mode` — see {@link HostCullOptions}).
   *
   * OFF by default, and that is not timidity. Every custom host has been permanently in
   * the document since custom nodes existed, and embedders are entitled to have built on
   * that: this workspace's own dashboard kit resolves a tile with
   * `container.querySelector('.grafloria-node-host[data-node-id=…]')`, and outside it there
   * are IntersectionObservers, React portal containers, third-party widget libraries that
   * cache a DOM reference at mount, and analytics that count nodes. Culling removes
   * elements from the document with no error and no visible diff, so switching it on by
   * default would break working apps on a version bump, silently, in exchange for a
   * performance win they did not ask for. A host with hundreds of widgets knows it has
   * hundreds of widgets and can say so.
   *
   * The default MODE, once you are in, is the safe one: `'detach'` keeps the element and
   * re-appends it on re-entry, so `renderCustomNode` still mounts exactly once and
   * `removeCustomNode` does NOT fire on a cull.
   *
   * INTERACTION WITH ANYTHING THAT READS WIDGET CONTENT, stated because it is not obvious.
   * Culling never removes a host from `nodeHosts` in `'detach'` mode, only from the
   * document, so a consumer that walks the map (rather than querying the DOM) still sees
   * every widget it ever saw.
   *
   * EXPORT IS UNAFFECTED, in either mode, and this used to be untrue. A widget the camera
   * has never reached has never been painted and a detached one has no layout box, so an
   * export found nothing to capture for exactly the tiles a user had not scrolled to — and
   * this comment used to tell you to "pan or `fitView()` first", which is no answer at all
   * for a headless print job or a server-side thumbnailer. `export()` / `exportSvgString()`
   * / `exportPdf()` now FORCE-MATERIALIZE the hosts they need, read them, and put the
   * document back exactly as they found it (see `materializeCustomNodes` below for what
   * "put back" means per mode). Turning culling on cannot change what comes out of a file:
   * it is a performance knob, and a performance knob that lost data would not be one.
   *
   * An ASYNC painter materialized this way is waited for by `await export(…)` — and the
   * hosts an in-flight capture is holding are exempt from culling for exactly that long,
   * so a frame (or an animated pan) mid-export cannot empty the widget being read.
   */
  cullCustomNodes?: boolean | HostCullOptions;

  /**
   * Install a {@link ViewLifecycle} — freeze/unfreeze, `autoFreeze`, and the admission set
   * a {@link ProgressiveMounter} drives.
   *
   * The lazy subsystem has been fully built and fully tested since wave 8 and was
   * reachable only by constructing an `SVGRenderer` by hand — which `createDiagram()`
   * exists to stop you doing. Undefined keeps today's behaviour exactly: no gate, every
   * entity culling admits gets a view on the frame it is admitted.
   *
   * Custom-node culling honours it too: an explicitly frozen node releases its HTML host.
   */
  viewLifecycle?: ViewLifecycle;

  /**
   * Adopt a server-rendered snapshot instead of mounting fresh (Card 6).
   * Pass the `snapshot` returned by `renderToStaticSVG()`. The instance rebuilds
   * the identical model, renders the identical VNode tree, and ADOPTS the DOM
   * already in the container — no re-creation, no flash, no re-layout.
   */
  hydrate?: HydrationSnapshot;

  /**
   * Anchored comment threads. `true` creates a store (viewer `'local'`);
   * pass a `CommentStore` to share one (collab). Pins render into the VNode
   * tree via the comment overlay; read them back with `getCommentStore()`.
   */
  comments?: boolean | CommentStore;
  /** Viewer id for a `comments: true`-created store (default `'local'`). */
  commentsViewer?: string;

  /**
   * While a connection is dragged over a port that refuses it, show WHY beside
   * that port: a host validator's reason string (`registerConnectionValidator`
   * returning text) or a built-in rule's message (a port at its link limit, a
   * duplicate link). Off by default. Styled by `.grafloria-connect-reason` and
   * `--grafloria-connect-reason-bg` / `--grafloria-connect-reason-fg`.
   */
  connectionReasons?: boolean;

  /**
   * Keep the host's own clipboard format beside the diagram's. `onCopy` gets the
   * diagram's payload after every copy/cut (keyboard or `copy()`/`cut()`);
   * `onPaste` may answer one back before a paste. With this set, Ctrl/⌘ C and V
   * go through these hooks; without it they run exactly as before.
   */
  clipboard?: ClipboardHooks;

  /**
   * Data-driven node TEMPLATES, one per node type: `(data, ctx) → { html, ports,
   * size }`. Nodes of a templated type become HTML cards the template paints —
   * and paints again whenever their data changes. Their ports and size come from
   * the template, and a data edit through `SetNodeDataCommand` re-derives them in
   * the SAME undo step, removing (and on undo restoring) wires on a removed port.
   * An element marked `data-port="<port id>"` anchors that port level with it
   * (see `anchorPorts`). A template may be an object with a `compact` form for
   * zooms below `compactBelow`. Unset: nothing here runs.
   */
  nodeTemplates?: Record<string, NodeTemplate>;
  /** Below this zoom, templated cards draw their `compact` form; hosts carry `data-lod`. */
  compactBelow?: number;
  /**
   * Anchor a templated card's ports to its `[data-port]` elements: each port sits
   * on its side's edge, level with its element, re-measured on content change,
   * resize and font load. Default true when `nodeTemplates` is set.
   */
  anchorPorts?: boolean;

  /**
   * The "+" a flow editor shows where the next step can go: `portAdd` on every
   * unconnected OUTPUT port, `linkAdd` / `linkDelete` at a hovered link's
   * midpoint. They only emit (`port:add-request`, `link:add-request`,
   * `link:delete-request`) — the host decides what happens — and never show
   * while read-only. Off by default.
   */
  affordances?: AffordanceOptions;
}

export interface DiagramInstance {
  setNodes(nodes: NodeInput[]): void;
  setEdges(edges: EdgeInput[]): void;
  /** Reconcile the zones (groups) — add, restyle, remove. Removing a zone keeps its boxes. */
  setGroups(groups: Array<GroupSpec | GroupModel>): void;
  getModel(): DiagramModel;
  getEngine(): DiagramEngine;
  /** The comment store, when `comments` was enabled; `null` otherwise. */
  getCommentStore(): CommentStore | null;

  on<K extends DiagramEventName>(event: K, handler: DiagramEventHandler<K>): Unsubscribe;
  off<K extends DiagramEventName>(event: K, handler: DiagramEventHandler<K>): void;

  readonly viewport: ViewportController;
  readonly interaction: InteractionController;

  /** Theme swap (re-injects this instance's CSS variable block only). */
  setTheme(theme: Theme): void;

  /**
   * Follow the OS colour scheme (`'system'`), or pin light/dark.
   *
   * `'system'` also honours `prefers-contrast: more` and forced-colors by
   * upgrading to the high-contrast theme — an accessibility preference outranks
   * an aesthetic one.
   */
  setColorMode(mode: ColorMode, themes?: ThemeSet): void;
  getColorMode(): ColorMode | undefined;
  /** Re-point Grafloria's CSS variables at the host design system's tokens. */
  setTokenBridge(bridge: TokenBridge | null | undefined): void;

  /**
   * Turn the selected nodes' line highlight on (`true`, or options) or off
   * (`false`) — see `CreateDiagramOptions.highlightConnected`. Repaints.
   */
  setHighlightConnected(value: boolean | HighlightConnectedOptions): void;
  /**
   * Turn the outline layer on (`true`, or an object of kinds) or off (`false`) —
   * see `CreateDiagramOptions.highlighterConfig`. Repaints.
   */
  setHighlighterConfig(value: boolean | Partial<HighlighterConfig>): void;
  /** The current `highlightConnected` setting (`false` when off). */
  getHighlightConnected(): boolean | HighlightConnectedOptions;

  /**
   * Export the CURRENT view. `'svg'` returns SVG source; `'png' | 'jpeg' |
   * 'webp' | 'pdf'` return a `data:` URL.
   *
   * Pass `{ embedModel: true }` (PNG and SVG) and the diagram model rides inside
   * the artifact — the exported file re-opens as an editable diagram.
   *
   * THE ASYNC ONE, and the only one. If a custom node's `renderCustomNode` returned a
   * promise — "I draw later: a rAF, a fetch, a framework's render, a web font" — this
   * waits for it before reading the host, bounded by
   * {@link ExportOptions.customNodeTimeout}. The synchronous entry points below cannot,
   * and say so in their `warnings`. Read the fidelity report through
   * {@link ExportOptions.onWarnings}, which fires on every format.
   */
  export(format?: ExportFormat, options?: ExportOptions): Promise<string>;
  /**
   * Synchronous, DOM-free, deterministic. Carries `warnings`.
   *
   * Synchronous means a widget whose painter is still running is captured as it stands
   * and REPORTED, not waited for — `await export('svg')` is the entry point that waits.
   */
  exportSvgString(options?: ExportOptions): SvgExportResult;
  /** A real vector PDF: paths stay paths, text stays selectable text. */
  exportPdf(options?: ExportOptions): PdfExportResult;

  /** The LOD tier actually rendered, and the adaptive governor's last verdict. */
  getQualityState(): { tier: LODLevel; governor?: GovernorState };

  /** Frame all content. */
  fitView(padding?: number): void;

  /** Queue a repaint (coalesced into one frame). */
  render(): void;
  /** Repaint synchronously — use when you must measure right after a change. */
  renderNow(): void;

  /**
   * wave8/dirty — Card 1: apply many mutations as ONE frame.
   *
   * ```ts
   * diagram.batchUpdate((model) => {
   *   for (const n of model.getNodes()) n.setPosition(n.position.x + 10, n.position.y);
   * });
   * ```
   *
   * Two distinct things are coalesced, and they are coalesced in two different
   * places, which is worth being precise about:
   *
   *   - **Events.** `DiagramModel.beginBatch()` QUEUES its change events instead
   *     of firing them, so a thousand `setPosition()` calls do not walk a
   *     thousand listener chains on their way to the same rAF.
   *   - **Frames.** `RenderScheduler` folds every `schedule()` in a tick into one
   *     rAF callback, so the thousand mutations produce exactly one `render()`
   *     and one `reconcile()` — one patch, not a thousand.
   *
   * Nesting is depth-counted (it bottoms out in `DiagramEntity`), so a batch
   * inside a batch is still one frame. `mutate` throwing does not strand the
   * model in batch mode.
   *
   * It never paints synchronously — that is the point. If you need the DOM to be
   * correct before you measure it, follow with `renderNow()`.
   */
  batchUpdate(mutate: (model: DiagramModel) => void): void;

  /**
   * The renderer's animation service. Host policy lives here: global
   * enable/speed, reduced-motion overrides, and the battery-saver auto-toggle
   * (`updateConfig({ respectBatteryStatus: false })` to opt out — on by
   * default, and on a low unplugged battery it disables edge animations).
   */
  animations: AnimationService;

  /**
   * Mermaid-compatible text export (with the lossless sidecar by default) —
   * feed the result back to `loadText` for a full round-trip.
   */
  exportText(options?: ExportTextOptions): string;

  /**
   * Parse Mermaid-compatible text (sidecar-aware) and reconcile it INTO the
   * live diagram through the same spec reconciler `setNodes`/`setEdges` use —
   * listeners, plugins, and the renderer all stay attached. The diagram type
   * comes along, so `exportText` writes it back in the grammar it came in.
   *
   * THROWS — and leaves the canvas exactly as it was — when the text is empty,
   * is a Mermaid type the canvas cannot draw (`sequenceDiagram`, `gantt`, …), or
   * has a line the parser could not read (a typo'd header, a broken shape). The
   * message names the line.
   */
  loadText(text: string, options?: ImportTextOptions): ImportTextResult;

  dispose(): void;

  /**
   * Wave 6 — Card 3: the nodes currently being dragged (past the movement
   * threshold). Custom node components receive this as the `dragging` prop.
   */
  getDraggingNodeIds(): string[];

  /**
   * Read-only, live, as ONE switch. On: no moving, connecting, deleting,
   * resizing, pasting or undoing from the keyboard, no "+" affordances, no
   * editing chrome. Kept: selection, click, double-click (`node:doubleclick`
   * still fires, so a viewer can open a step), hover, pan/zoom and the run
   * overlay. A VIEW switch: code can still change the document. The container
   * carries `data-readonly` while it is on. Starts from the `readonly` option.
   */
  setReadonly(readonly: boolean): void;
  /** Is the view read-only — the `readonly` option / `setReadonly`, or the document's own lock? */
  isReadonly(): boolean;

  /**
   * Copy the selection to the diagram's clipboard; resolves with the payload
   * (plain JSON), or null when nothing was selected. Calls `clipboard.onCopy`.
   */
  copy(): Promise<ClipboardData | null>;
  /** Copy, then delete the selection — ONE undo step. Null when nothing was cut (or read-only). */
  cut(): Promise<ClipboardData | null>;
  /**
   * Paste `data` if given, else what `clipboard.onPaste` answers, else the last
   * copy. Resolves false when there was nothing to paste (or read-only).
   */
  paste(data?: ClipboardData, options?: PasteOptions): Promise<boolean>;

  /**
   * Draw a RUN on the flow without making it part of the document: per node a
   * status frame (`idle | pending | running | completed | error | warning`) and
   * an optional badge, per link a label chip ("2 items") and an optional moving
   * dash. REPLACES the previous overlay; repaints immediately, so it is cheap to
   * call many times a second as a run streams in. Never enters undo,
   * serialization or collab. Styled by `.grafloria-run-*` classes and
   * `--grafloria-run-<status>` variables.
   */
  setOverlay(overlay: RunOverlay): void;
  /** Remove the run overlay. */
  clearOverlay(): void;
  /** The overlay as last set (a copy). */
  getOverlay(): RunOverlay;

  /**
   * Replace the link A→B with A→N→B as ONE undo step: N (built from `node`, the
   * same spec `render()` takes) lands in the gap, its entry port level with A's,
   * and B and what lies downstream shift along the flow only as far as N needs.
   * Undo restores A→B exactly — the same link id, labels and style. Resolves
   * null when the link (or a named port) does not exist.
   */
  insertNodeOnLink(linkId: string, node: NodeSpec, options?: InsertNodeOnLinkOptions): Promise<InsertNodeOnLinkResult | null>;

  /**
   * Tidy the whole flow — a tree in OUTPUT PORT ORDER (an If's `true` branch
   * above its `false` one, a Switch's outputs top to bottom), merges to the right
   * of every branch that feeds them, nodes with no links (notes) left alone and
   * kept clear. Animated (unless `animate: false` or reduced motion), ONE undo
   * step. Resolves the ids that moved.
   */
  tidy(options?: FlowPlaceOptions): Promise<string[]>;
  /**
   * Place only `ids`; every other node stays put. Each goes one step along the
   * flow from its parent (`after`, else the step linking into it), in its port's
   * slot among the parent's children, nudged clear of what is there. Animated,
   * ONE undo step. Resolves the ids that moved.
   */
  placeNodes(ids: string[], options?: PlaceNodesOptions): Promise<string[]>;

  /**
   * visio-depth — open the in-place label editor programmatically: a node's
   * label (`{ type: 'node', nodeId }`) or a link label
   * (`{ type: 'link-label', linkId, labelIndex }`). The seam a host's
   * context-menu Rename / F2 binding uses; the same editor + undoable commit
   * that double-click opens. `seed` replaces the text the editor opens with
   * (type-to-replace). Returns false when the target is missing, not editable,
   * or the instance is readonly.
   */
  beginLabelEdit(
    target: { type: 'node' | 'link-label'; nodeId?: string; linkId?: string; labelIndex?: number },
    opts?: { seed?: string }
  ): boolean;

  /**
   * THIS diagram's contribution registry — shapes, named styles, link/label
   * templates, markers, anchors, connection points, connectors, animations.
   *
   * The module-level `registerShape()` / `defineStyle()` / … remain the
   * PROCESS-WIDE registry and still work exactly as before; this one shadows it
   * for this diagram only. That distinction is the whole reason it exists: the
   * registries used to be module-scope `Map`s, so two diagrams on one page could
   * not have different vocabularies, and unloading one diagram's extension
   * restored the registry to its pre-registration state — silently stripping the
   * shape out from under the diagram beside it.
   *
   * ```ts
   * editor.registry.registerShape('badge', badgeGeometry);   // editor only
   * preview.registry.registerShape('badge', otherGeometry);  // preview only
   * ```
   *
   * Pass it to `createExtensionHost({ …, registry: diagram.registry })` and every
   * extension that host loads contributes to this diagram alone.
   */
  readonly registry: DiagramRegistry;

  /** Escape hatches for hosts and tests. */
  readonly container: HTMLElement;
  readonly scheduler: RenderScheduler;
  readonly patcher: VNodePatcher;
}

type Listener = (payload: never) => void;

export function createDiagram(
  container: HTMLElement,
  options: CreateDiagramOptions = {}
): DiagramInstance {
  if (!isBrowser()) {
    // A clear failure beats a mysterious `document is not defined` five frames
    // deep. The server path is `renderToStaticSVG()`; the client then hydrates.
    throw new Error(
      'createDiagram() requires a browser DOM. On the server call renderToStaticSVG() ' +
        'and hydrate with createDiagram(el, { hydrate: snapshot }) in an effect.'
    );
  }

  const hydration = options.hydrate;
  const doc = container.ownerDocument;

  // -- engine + model ---------------------------------------------------------
  const engine =
    options.engine ??
    new DiagramEngine(
      options.interaction ? ({ interaction: options.interaction } as never) : {}
    );
  const model = engine.getDiagram() ?? engine.createDiagram('grafloria');

  // Wave 6 BUG FIX. This used to be `applyNodes(model, options.nodes ?? [])`.
  //
  // `applyNodes`/`applyEdges` are full RECONCILERS — anything not in the list is
  // REMOVED. So passing no `nodes` reconciled against the EMPTY list and silently
  // deleted every node already on the diagram. That made the documented
  // "attach to an existing engine" path (`createDiagram(el, { engine })`) wipe
  // the very diagram it was attaching to.
  //
  // Absent means "I am not managing this" — NOT "make it empty". A host that
  // really wants to clear the diagram passes `nodes: []` explicitly, which still
  // works.
  // The camera does not exist yet when the first nodes are prepared: zoom 1 until it does.
  let zoomNow: () => number = () => 1;
  // Node templates go in BEFORE the nodes: a templated node must have its
  // template's ports by the time the edges (which may name them) are applied.
  const nodeTemplates = options.nodeTemplates
    ? createNodeTemplates(
        { templates: options.nodeTemplates, compactBelow: options.compactBelow, anchorPorts: options.anchorPorts },
        () => zoomNow()
      )
    : null;
  let stopTemplates: (() => void) | null = null;
  if (nodeTemplates) {
    model.setNodeTemplateResolver(nodeTemplates.resolve);
    for (const node of model.getNodes()) nodeTemplates.prepare(model, node);
    stopTemplates = model.on('node:added', (node: NodeModel) => nodeTemplates.prepare(model, node)) as unknown as () => void;
  }

  if (options.nodes) applyNodes(model, options.nodes);
  // Zones after their boxes (membership needs the nodes), before the lines.
  if (options.groups) applyGroups(model, options.groups);
  // Warnings from the initial spec are held until listeners can exist.
  const earlyWarnings: EdgeWarning[] = [];
  let warnEdge: (w: EdgeWarning) => void = (w) => earlyWarnings.push(w);
  if (options.edges) applyEdges(model, options.edges, (w) => warnEdge(w));
  if (options.layout === 'architecture') layoutArchitecture(model, { measureText: canvasTextMeasure() });

  zoomNow = () => viewport.getZoom();

  // -- camera -----------------------------------------------------------------
  const rect0 = container.getBoundingClientRect();
  const viewport = new ViewportController({
    viewport: {
      x: hydration?.viewport.x ?? options.viewport?.x ?? 0,
      y: hydration?.viewport.y ?? options.viewport?.y ?? 0,
      // Hydration MUST reuse the server's canvas size or the viewBox differs and
      // the very first client frame would re-lay-out the picture.
      width: hydration?.width ?? rect0.width ?? 800,
      height: hydration?.height ?? rect0.height ?? 600,
    },
    zoom: hydration?.zoom ?? options.zoom ?? 1,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom,
    zoomSensitivity: options.zoomSensitivity,
  });

  // -- layers -----------------------------------------------------------------
  const layers = ensureLayers(container, doc, hydration);

  // -- renderer + patcher -----------------------------------------------------
  // Wave 10 BUG FIX. This used to forward `instanceId` and NOTHING ELSE.
  //
  // `SVGRendererConfig` has carried `colorMode`, `themes` and `tokenBridge` for
  // two waves. `createDiagram()` is the ONLY way a host builds a renderer — so
  // dropping them here made all three unreachable, and with them:
  //
  //   - `colorMode: 'system'`, i.e. following the OS colour scheme at all, and
  //     the a11y upgrade where `prefers-contrast: more` / forced-colors promotes
  //     you to the high-contrast theme instead of flashing light at the user.
  //     The themes existed. The controller existed. Nothing could switch them on.
  //   - the shadcn / MUI / Tailwind design-token bridge — the whole point of
  //     which is that a HOST re-points Grafloria's variables at its own tokens.
  //
  // Three features, fully built and fully tested, lost in a five-line literal.
  const renderer = new SVGRenderer(
    engine,
    {
      // The general escape hatch first, so the ergonomic named fields below win over
      // anything the host also set through `renderer`.
      ...(options.renderer ?? {}),
      instanceId: hydration?.instanceId ?? options.instanceId,
      colorMode: options.colorMode ?? options.renderer?.colorMode,
      themes: options.themes,
      tokenBridge: options.tokenBridge,
      highlightConnected: options.highlightConnected ?? options.renderer?.highlightConnected,
      // "My picture improved with no model change — repaint me." Fired by the
      // async route solver's refinements and by motion-stable routing's settle
      // frame (a tween's provisional routes re-deciding once motion stops).
      // Neither has a model event to ride, so without this wire both improved
      // pictures were unreachable from a real instance: the renderer bumped its
      // invalidation epoch and nobody ever asked the scheduler for a frame.
      // Late-bound on purpose — `scheduler` is constructed below and this
      // callback only ever fires asynchronously, after mount. The host's own
      // callback (if any) is chained, not replaced.
      onRoutesRefined: () => {
        options.renderer?.onRoutesRefined?.();
        scheduler.schedule();
      },
    },
    options.theme
  );
  renderer.applyInstanceScope(layers.root);
  // The lazy subsystem (freeze / autoFreeze / progressive mount) has existed since wave 8
  // and was reachable only by building an `SVGRenderer` yourself — i.e. not from the
  // factory that every host actually uses. Absent leaves the renderer ungated, which is
  // exactly what it did before this line existed.
  if (options.viewLifecycle) renderer.setViewLifecycle(options.viewLifecycle);
  const patcher = new VNodePatcher({ document: doc });
  // highlightConnected: the lines of the selection that cross a card are drawn
  // AGAIN above every card — in an overlay at the end of the HTML layer, which
  // sits over the SVG and over custom-node hosts and carries the camera. Its own
  // patcher, so the SVG layer's per-frame stats stay the SVG layer's.
  const overlayPatcher = new VNodePatcher({ document: doc });
  let overlayHost: HTMLElement | null = null;
  const syncLineOverlay = (): void => {
    const tree = renderer.getLineOverlay();
    if (!tree) {
      overlayHost?.remove();
      overlayHost = null;
      return;
    }
    if (!overlayHost || overlayHost.parentNode !== layers.html) {
      overlayHost = doc.createElement('div');
      overlayHost.className = 'grafloria-line-overlay';
      overlayHost.setAttribute('aria-hidden', 'true');
      // z-index 1: above node hosts appended after it (they carry none).
      overlayHost.setAttribute('style', 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:1');
      layers.html.appendChild(overlayHost);
    }
    overlayPatcher.reconcile(overlayHost, tree);
  };

  // -- the outline layer (highlighterConfig) ------------------------------------
  // The same controller Angular's canvas uses, so the outlines are the same ones;
  // drawn like the line overlay, in world units inside the HTML layer, which
  // carries the camera — a pan or zoom moves them with the picture for free.
  // Shape-aware: built-in shapes (`rect`, `ellipse`, …) are not flagged as
  // unregistered types — see ShapeAwareHighlighterController.
  const highlighter: HighlighterController = new ShapeAwareHighlighterController();
  let highlighterOn = false;
  const highlighterPatcher = new VNodePatcher({ document: doc });
  let highlighterHost: HTMLElement | null = null;
  /** The colours of Angular's canvas, as presentation attributes so a host's CSS on the class wins. */
  const OUTLINE_STROKE: Record<string, string> = {
    hover: '#60a5fa',
    selection: '#3b82f6',
    'connect-target': '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
  };
  const outlineVNode = (h: Highlighter): VNode => {
    const stroke = OUTLINE_STROKE[h.kind === 'validation' ? (h.severity ?? 'warning') : h.kind] ?? '#3b82f6';
    const common = {
      className: h.className,
      fill: 'none',
      stroke,
      'vector-effect': 'non-scaling-stroke',
      ...(h.kind === 'selection' ? { strokeDasharray: '4 3' } : {}),
      ...(h.kind === 'hover' ? { opacity: 0.9 } : {}),
      ...(h.severity ? { 'data-severity': h.severity } : {}),
    };
    const title: VNode[] = h.message ? [{ type: 'title', key: `${h.id}-t`, props: { textContent: h.message }, children: [] }] : [];
    if (h.bounds) {
      const b = h.bounds;
      const rotate = h.rotation ? { transform: `rotate(${h.rotation}, ${b.x + b.width / 2}, ${b.y + b.height / 2})` } : {};
      return { type: 'rect', key: h.id, props: { ...common, ...rotate, x: b.x, y: b.y, width: b.width, height: b.height, strokeWidth: 2 }, children: title };
    }
    return { type: 'polyline', key: h.id, props: { ...common, points: (h.points ?? []).map((p) => `${p.x},${p.y}`).join(' '), strokeWidth: 6 }, children: title };
  };
  const syncHighlighterOverlay = (): void => {
    if (!highlighterOn) {
      highlighterHost?.remove();
      highlighterHost = null;
      return;
    }
    if (!highlighterHost || highlighterHost.parentNode !== layers.html) {
      highlighterHost = doc.createElement('div');
      highlighterHost.className = 'grafloria-highlighter-overlay';
      highlighterHost.setAttribute('aria-hidden', 'true');
      // z-index 2: above the cards and above the line overlay (1).
      highlighterHost.setAttribute('style', 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2');
      layers.html.appendChild(highlighterHost);
    }
    highlighterPatcher.reconcile(highlighterHost, {
      type: 'svg',
      key: 'grafloria-highlighter-overlay',
      props: { width: 1, height: 1, style: { position: 'absolute', left: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' } },
      children: highlighter.compute(engine).map(outlineVNode),
    });
  };
  /** Apply a setting; the next frame draws it (validation is refreshed when the layer comes on). */
  const applyHighlighterConfig = (value: boolean | Partial<HighlighterConfig> | undefined): void => {
    const was = highlighterOn;
    highlighterOn = value !== undefined && value !== false;
    highlighter.updateConfig({ ...DEFAULT_HIGHLIGHTER_CONFIG, ...(typeof value === 'object' ? value : {}) });
    if (highlighterOn && !was) highlighter.refreshValidation(engine);
    if (!highlighterOn) highlighter.clearValidation();
  };
  applyHighlighterConfig(options.highlighterConfig);

  // -- events -----------------------------------------------------------------
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, payload: unknown): void => {
    const set = listeners.get(event);
    if (!set) return;
    // Copy: a handler is allowed to unsubscribe itself.
    for (const listener of [...set]) (listener as (p: unknown) => void)(payload);
  };

  warnEdge = (w) => emit('renderer:warning', w);
  if (earlyWarnings.length) {
    const held = earlyWarnings.splice(0);
    queueMicrotask(() => held.forEach((w) => emit('renderer:warning', w)));
  }

  // -- selection:change: ONE per gesture, carrying the final selection ---------
  // Two channels announce a selection change: the model's `selection:changed`
  // (one per mutation) and the event binder's own emit at the end of a gesture.
  // Both used to reach listeners, so one click fired twice — and the first was
  // STALE: `selectNode` fires the model event before the binder deselects the
  // edge that was selected ({n:1,e:1} then {n:1,e:0}). Every framework binding
  // forwards these, so React/Vue/Qwik selection callbacks fired twice per click.
  //
  // Now both go through one gate. While the binder is handling a gesture (it
  // brackets each DOM event, and holds a press until its release) an emission is
  // only OWED; it is paid once, with the selection as it then stands, when the
  // outermost batch closes. Outside any gesture — selectNode()/clearSelection()
  // from code — it emits immediately, as it always did.
  //
  // A gesture that ends where it started — a click on the node that already is
  // the selection, a click on empty canvas with nothing selected — owes nothing:
  // the selection is compared with the one the gesture began with, and only a
  // real change is announced.
  let selectionBatchDepth = 0;
  let selectionOwed = false;
  let selectionAtGestureStart = '';
  const selectedEdges = (): LinkModel[] => model.getLinks().filter((l: LinkModel) => l.state === 'selected');
  const selectionKey = (): string =>
    model.getSelectedNodes().map((n: NodeModel) => n.id).join('\u0000') +
    '\u0001' +
    selectedEdges().map((l: LinkModel) => l.id).join('\u0000');
  const emitSelectionNow = (): void => {
    emit('selection:change', { nodes: model.getSelectedNodes(), edges: selectedEdges() });
  };
  const announceSelection = (): void => {
    if (selectionBatchDepth > 0) selectionOwed = true;
    else emitSelectionNow();
  };

  // -- comments ---------------------------------------------------------------
  // The overlay hooks the renderer's comment source, so pins render inside the
  // VNode tree (they survive export and pan/zoom for free).
  let commentStore: CommentStore | null = null;
  let commentOverlay: CommentOverlayController | null = null;
  if (options.comments) {
    commentStore =
      options.comments === true
        ? new CommentStore(model, { viewer: options.commentsViewer ?? 'local' })
        : options.comments;
    commentOverlay = new CommentOverlayController(commentStore, renderer);
  }

  // -- interaction ------------------------------------------------------------
  const interaction = new InteractionController();
  interaction.syncWithEngineConfig(engine);
  // The link grab distance derives from the renderer's interaction-stroke
  // width; a host override must reach BOTH sides or the painted hit-area and
  // the accepted press drift apart again.
  if (options.renderer?.linkHitAreaWidth !== undefined) {
    interaction.setLinkHitAreaWidth(options.renderer.linkHitAreaWidth);
  }

  const getRect = (): CanvasRect => container.getBoundingClientRect();

  const scheduler = new RenderScheduler({
    onFrame: () => paint(),
    shouldSkip: () => canSkipFrame(),
  });

  const binder = new DomEventBinder(
    container,
    {
      getEngine: () => engine,
      viewport,
      interaction,
      getRect,
      requestRender: () => scheduler.schedule(),
      // The clipboard keys go through the instance's copy/cut/paste only when the
      // host asked for its hooks or owns the keyboard; otherwise the binder's own
      // engine copy/paste runs, exactly as before.
      // connection.snapToNode / nodeDropOnLink: the marks the drag shows.
      markConnectSnap: (nodeId, verdict) => {
        for (const [id, host] of nodeHosts) {
          if (id === nodeId) host.setAttribute('data-connect-snap', verdict ?? 'accept');
          else if (host.hasAttribute('data-connect-snap')) host.removeAttribute('data-connect-snap');
        }
        renderer.setConnectSnap(nodeId, verdict);
        scheduler.schedule();
      },
      markDropLink: (linkId) => {
        renderer.setDropTargetLink(linkId);
        scheduler.schedule();
      },
      clipboardKey:
        options.clipboard || typeof options.keyboard === 'object'
          ? (action) => {
              void clipboardApi[action]();
              return true;
            }
          : undefined,
      // The binder's selection:change is the same announcement as the model's:
      // route it through the gate (its payload is re-read at emit time).
      emit: (event, payload) => (event === 'selection:change' ? announceSelection() : emit(event, payload)),
      beginSelectionBatch: () => {
        if (selectionBatchDepth === 0) selectionAtGestureStart = selectionKey();
        selectionBatchDepth++;
      },
      endSelectionBatch: () => {
        if (selectionBatchDepth === 0) return;
        selectionBatchDepth--;
        if (selectionBatchDepth === 0 && selectionOwed) {
          selectionOwed = false;
          if (selectionKey() !== selectionAtGestureStart) emitSelectionNow();
        }
      },
    },
    options
  );

  // -- the clipboard: copy()/cut()/paste() and the host's hooks ----------------
  const clipboardApi = createClipboardApi(engine, options.clipboard, {
    changed: () => scheduler.schedule(),
    isReadonly: () => binder.readonlyNow(),
  });

  // -- workflow-editor features (each opt-in; see ./workflow/feature.ts) -------
  /** Set by a feature's `invalidate()`; cleared when the next frame starts. */
  let featureRepaintOwed = false;
  const featureCtx: FeatureContext = {
    doc,
    container,
    htmlLayer: layers.html,
    engine,
    getModel: () => engine.getDiagram() ?? model,
    viewport,
    schedule: () => scheduler.schedule(),
    invalidate: () => {
      featureRepaintOwed = true;
      renderer.invalidateFrame();
      scheduler.schedule();
    },
    emit: (event, payload) => emit(event, payload),
    isReadonly: () => binder.readonlyNow(),
    startConnection: (portId, clientX, clientY) => binder.startConnectionFromPort(portId, clientX, clientY),
  };
  // Read-only is a VIEW switch: the binder refuses gestures, the renderer drops
  // editing chrome, the root says so for host CSS. The document stays writable.
  const applyReadonly = (readonly: boolean): void => {
    binder.setReadonly(readonly);
    renderer.setViewReadonly(readonly);
    if (readonly) container.setAttribute('data-readonly', '');
    else container.removeAttribute('data-readonly');
  };
  if (options.readonly) applyReadonly(true);
  const features: Feature[] = [];
  if (options.connectionReasons) features.push(installConnectReason(featureCtx));
  const templateCards = nodeTemplates
    ? installNodeTemplates(featureCtx, nodeTemplates, { templates: options.nodeTemplates!, compactBelow: options.compactBelow, anchorPorts: options.anchorPorts })
    : null;
  if (templateCards) features.push(templateCards);
  if (options.affordances) features.push(installAffordances(featureCtx, options.affordances));
  /**
   * `setNodes` writes a node's data by plain assignment — the HOST's state coming
   * in, which must not become an undo entry. For a templated node that is not
   * enough on its own: its ports and size come from its data, and its card is
   * repainted only on a frame that knows the picture changed. So: note each
   * templated node's data before, and for every one whose data changed re-derive
   * ports and size (wires on a vanished port go with it, no undo entry) and mark
   * the frame stale so the card repaints — before a following `setEdges` that
   * may name a port that has only just appeared.
   */
  const templatedData = (): Map<string, string> | null => {
    if (!nodeTemplates) return null;
    const out = new Map<string, string>();
    for (const node of model.getNodes()) if (nodeTemplates.has(node.type)) out.set(node.id, JSON.stringify(node.data ?? {}));
    return out;
  };
  const rederiveTemplates = (before: Map<string, string> | null): void => {
    if (!nodeTemplates || !before) return;
    let stale = false;
    for (const node of model.getNodes()) {
      if (!nodeTemplates.has(node.type) || before.get(node.id) === JSON.stringify(node.data ?? {})) continue;
      nodeTemplates.prepare(model, node);
      stale = true;
    }
    if (stale) {
      renderer.invalidateFrame();
      scheduler.schedule();
    }
  };

  /** Tear a custom host down: the template's bookkeeping, then the host's own hook. */
  const removeCustomHost = (id: string, host: HTMLElement): void => {
    templateCards?.unmount(id);
    options.removeCustomNode?.(id, host);
  };
  // The run overlay installs itself on first use: a diagram that never calls
  // setOverlay() never creates its element or its stylesheet.
  let runOverlay: RunOverlayFeature | null = null;
  const overlayFeature = (): RunOverlayFeature => {
    if (!runOverlay) {
      runOverlay = installRunOverlay(featureCtx);
      features.push(runOverlay);
    }
    return runOverlay;
  };
  const syncFeatures = (): void => {
    for (const f of features) f.sync?.();
  };
  const cameraFeatures = (): void => {
    for (const f of features) f.camera?.();
  };

  // -- custom (HTML-layer) nodes ---------------------------------------------
  //
  // `nodeHosts` is the record of every host this instance OWNS — not of what is in the
  // document. In `'detach'` cull mode a culled host stays in this map with its element
  // parked off-document, which is what keeps the two teardown paths below (model removal,
  // and `dispose()`) correct without either of them learning that culling exists: a node
  // that is culled and then deleted still fires `removeCustomNode` exactly once, because
  // it never left the map.
  const nodeHosts = new Map<string, HTMLElement>();

  const culler = options.cullCustomNodes
    ? new HtmlHostCuller(
        options.cullCustomNodes === true ? {} : options.cullCustomNodes,
        renderer.getViewLifecycle()
      )
    : null;

  /**
   * Nodes a live gesture owns, which must never be culled out from under it.
   *
   * Built only when culling is on — a host that never opted in pays not even the Set.
   */
  const gestureHeld = (): ReadonlySet<string> => {
    const ids = new Set<string>(binder.getDraggingNodeIds());
    // Resize / rotate / vertex. `SelectionToolsController` keeps the gesture's node
    // private and these gestures are single-selection by construction, so the selection
    // is the available answer — and being a superset is the safe direction to be wrong in.
    if (binder.hasActiveGesture()) {
      for (const node of model.getSelectedNodes()) ids.add(node.id);
    }
    return ids;
  };

  /** The lifecycle the culler consults, read once so the export can consult it too. */
  const lifecycle = renderer.getViewLifecycle();

  /**
   * THE PAINT LEDGER — what an ASYNC `renderCustomNode` told us about itself.
   *
   * `pendingPaints` holds one entry per widget whose painter returned a promise that has
   * not settled; the entry deletes itself when it does. `paintFailures` remembers the ones
   * that rejected, so an export can say "its painter rejected: …" instead of the useless
   * "its host was empty".
   *
   * Both are keyed by node id and both are written ONLY on a first mount, because
   * `renderCustomNode` runs exactly once per host — so there is exactly one promise per
   * widget, ever, and re-attaching a culled host neither re-runs nor re-awaits anything.
   */
  const pendingPaints = new Map<string, Promise<void>>();
  const paintFailures = new Map<string, string>();
  /**
   * Which of those failures was a SYNCHRONOUS throw rather than a rejected
   * promise. Kept apart because the two have different fixes and the warning
   * should say which one happened — "your painter threw" sends a developer to a
   * stack trace, "your promise rejected" sends them to the async work inside it.
   */
  const paintThrew = new Set<string>();

  const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function';

  /**
   * Record what a painter returned.
   *
   * The `.then` here is also what keeps a rejecting painter from surfacing as an unhandled
   * rejection in the host's console — we are the ones who asked for the promise, so we are
   * the ones who must handle it, whether or not an export ever happens.
   */
  const trackPaint = (id: string, result: unknown): void => {
    if (!isThenable(result)) return;
    try {
      const settled: Promise<void> = Promise.resolve(result).then(
        () => undefined,
        (error: unknown) => {
          paintFailures.set(id, error instanceof Error ? error.message : String(error));
        }
      );
      const entry = settled.then(() => {
        // Identity-checked: a 'destroy'-mode remount replaces the entry, and a stale
        // promise settling afterwards must not delete its successor.
        if (pendingPaints.get(id) === entry) pendingPaints.delete(id);
      });
      pendingPaints.set(id, entry);
    } catch {
      // A broken thenable is not worth taking a frame down for. It simply is not tracked,
      // and its widget degrades exactly as an unreadable host already does.
    }
  };

  /** World bounds of a custom node — the rect both the culler and the capture work in. */
  const nodeBounds = (node: NodeModel): Rectangle => ({
    x: node.position.x,
    y: node.position.y,
    width: node.size?.width ?? 0,
    height: node.size?.height ?? 0,
  });

  /**
   * Create-or-re-attach one custom node's host and place it.
   *
   * Shared by the frame loop and the export boundary deliberately: the two must agree
   * byte for byte on what a host is (the class, the `data-node-id`, the style, and above
   * all the mount-once rule that `renderCustomNode` fires only when the element is
   * created). Two copies of this would drift, and the drift would be silent.
   *
   * The element is put in `nodeHosts` and in the document BEFORE the painter runs, which
   * is what lets the export boundary undo a mount whose painter threw.
   */
  const mountHost = (node: NodeModel): void => {
    let host = nodeHosts.get(node.id);

    if (!host) {
      host = doc.createElement('div');
      host.setAttribute('data-node-id', node.id);
      host.className = 'grafloria-node-host';
      layers.html.appendChild(host);
      nodeHosts.set(node.id, host);
      // A fresh paint supersedes whatever the last one ended in — only reachable in
      // 'destroy' cull mode, which is the one mode that re-runs a painter.
      pendingPaints.delete(node.id);
      paintFailures.delete(node.id);
      paintThrew.delete(node.id);
      // The RETURN VALUE is the whole async contract: a painter that is not finished says
      // so by handing back a promise. Sync painters return undefined and cost nothing.
      //
      // A painter that THROWS is contained here, exactly like one whose promise
      // rejects — same failure map, same export warning. Uncontained, a single
      // bad widget did far more than blank itself: the throw propagated out of
      // the mount paint, which runs BEFORE `const instance` is constructed, so
      // createDiagram() never returned. The caller got an exception instead of a
      // diagram and therefore had no handle to dispose — while the instance was
      // already alive, with its ResizeObserver still driving the viewport. Retry
      // the call (which is what a React error boundary or StrictMode does) and
      // the undisposable instances stack up in the same container.
      try {
        trackPaint(
          node.id,
          templateCards && nodeTemplates?.has(node.type) ? templateCards.mount(node, host) : options.renderCustomNode?.(node, host)
        );
      } catch (error) {
        paintFailures.set(node.id, error instanceof Error ? error.message : String(error));
        paintThrew.add(node.id);
      }
    } else if (!host.parentNode) {
      // Re-entry after a detach cull: the SAME element goes back, with its subtree, its
      // scroll offset, its canvas bitmap and its event listeners intact. `renderCustomNode`
      // is NOT called again — "a custom node mounts exactly once" is a promise neither the
      // cull nor the export is allowed to break.
      layers.html.appendChild(host);
    }

    host.setAttribute(
      'style',
      nodeHostStyle(node.position.x, node.position.y, node.size.width, node.size.height)
    );
  };

  /**
   * Hosts an in-flight ASYNC capture is holding open, which no frame may cull.
   *
   * Only an async export can populate this, and only for as long as it is waiting. The
   * synchronous capture materializes, reads and restores inside one tick with no
   * suspension point, so nothing can run in the middle of it and it needs no pin.
   *
   * Without this, waiting for a painter would be self-defeating: real frames run WHILE we
   * wait (that is what "async" means here), and one of them culling the very host we are
   * waiting on would hand the capture a detached element — no layout box, every rect zero,
   * a blank widget. An animated pan during an export would silently empty it. In 'destroy'
   * mode it is worse than blank: the frame fires `removeCustomNode` and drops the host, so
   * the export's own teardown would fire a SECOND time on an element the embedder has
   * already disposed.
   */
  const pinnedHosts = new Set<string>();

  const syncCustomNodes = (): void => {
    const wanted = new Set<string>();

    // The viewBox, not `getViewport()`: the two diverge at any zoom != 1 and culling
    // against the camera rect drops hosts that are on screen whenever the board is zoomed
    // out — which fitView() always does.
    if (culler) culler.beginFrame(viewport.getViewBox(), viewport.getZoom(), gestureHeld());

    for (const node of model.getNodes()) {
      if (!node.getMetadata('useHTMLLayer')) continue;
      wanted.add(node.id);

      const existing = nodeHosts.get(node.id);

      if (culler && !pinnedHosts.has(node.id)) {
        // `existing?.parentNode` — the DOM's own answer to "is this mounted", rather than a
        // bookkeeping set that can drift from it. Feeding the CURRENT state back in is what
        // makes the hysteresis band work: which of the two rects applies depends on where
        // the host already is.
        if (!culler.admits(node.id, nodeBounds(node), !!existing?.parentNode)) {
          if (existing) {
            if (culler.getMode() === 'destroy') {
              removeCustomHost(node.id, existing);
              existing.remove();
              nodeHosts.delete(node.id);
            } else if (existing.parentNode) {
              // DETACH ONLY. No `removeCustomNode` — the component was not unmounted, it
              // is parked. Firing the teardown hook here would be a lie the host would act
              // on (disposing a chart it is about to be handed back).
              existing.remove();
            }
          }
          // …and no style write. That is most of the saving: a 400-widget board stops
          // paying 400 `setAttribute` calls per frame to position elements nobody sees.
          continue;
        }
      }

      mountHost(node);
    }

    for (const [id, host] of [...nodeHosts]) {
      if (wanted.has(id)) continue;
      removeCustomHost(id, host);
      host.remove();
      nodeHosts.delete(id);
    }
  };

  /**
   * Which custom nodes an export can contain — combined with the export's own scope by
   * the pipeline, it is the one definition of "in scope", shared by everything that has
   * to agree on it (what gets materialized, what gets pinned, what gets waited for).
   *
   * WHAT IT WILL NOT INCLUDE. An explicit {@link ViewLifecycle} freeze is skipped, and
   * that is not timidity: `SVGRenderer.render` gates every entity on
   * `ViewLifecycle.admits`, so the render pass of this very export omits a frozen node.
   * Capturing its widget would put content in the file with no node beneath it, and
   * stretch the fitted viewBox to reach a node the same file does not draw.
   */
  const isExportableCustomNode = (node: NodeModel): boolean =>
    !!node.getMetadata('useHTMLLayer') && !lifecycle?.isExplicitlyFrozen('node', node.id);

  /**
   * FORCE-MATERIALIZE the hosts an export is about to read, and hand back the undo.
   *
   * THE GAP THIS CLOSES. Culling means a widget the camera has never reached has never
   * been painted, so there is nothing in the document to capture; a widget culling
   * detached has an element with no layout box, which every `getBoundingClientRect()`
   * reports as zero. Either way the export used to emit an empty box, and the option's
   * own documentation told the caller to "pan or fitView() first". That is not a
   * workaround anyone can apply from a headless print job, a thumbnailer or a server —
   * and it made `cullCustomNodes`, a PERFORMANCE knob, silently change what comes out of
   * a file. A performance knob that loses data is not a performance knob.
   *
   * So the rule is now: **an export contains the same widgets whether culling is on or
   * off.** The capture mounts what it needs, reads it, and puts the document back.
   *
   * PUTS IT BACK, precisely — because an export that permanently mounted a 300-widget
   * board would just be a different bug:
   *
   *   was 'attached'  nothing to do, nothing to undo. Already live, already correct.
   *   was 'detached'  re-attached to be read, then detached again. `renderCustomNode`
   *                   never re-runs, so mount-once is untouched.
   *   was 'absent'    created and painted — a legitimate FIRST mount, not a second one.
   *                   Then re-culled to whatever the configured mode means:
   *                     • 'detach'  — parked off-document, retained. Identical to what a
   *                       pan across the board and back leaves behind, and it keeps the
   *                       promise that this widget's painter runs exactly once, ever.
   *                     • 'destroy' — torn down for real (`removeCustomNode` fires). That
   *                       mode exists to BOUND THE HEAP, so leaving hosts retained would
   *                       defeat it outright; the balanced mount/unmount an export
   *                       performs is the same lifecycle a pan already produces, and a
   *                       'destroy' embedder has accepted that its painter re-runs.
   *                     • no culler at all — left mounted. There is no culled state to
   *                       restore to, and the documented default is that every custom
   *                       host is permanently in the document, so this is the state the
   *                       next frame would have produced anyway. (Reachable by exporting
   *                       between `setNodes()` and the frame it schedules — which used to
   *                       export blank widgets, and no longer does.)
   *
   * WHAT IT WILL NOT OVERRULE is decided by `isExportableCustomNode` above — an explicit
   * {@link ViewLifecycle} freeze is skipped, and it says why.
   *
   * WHAT IT CANNOT DO ON ITS OWN. `renderCustomNode` is called here and read on the next
   * line, because `exportSvgString()` is synchronous by contract. A painter that defers
   * its paint has not drawn anything by the time we look. That is what the async path
   * below exists for; the synchronous one still reports it rather than exporting a
   * silent blank.
   */
  const materializeCustomNodes = (nodes: readonly NodeModel[]): (() => void) => {
    const undo: Array<() => void> = [];

    for (const node of nodes) {
      if (nodeHosts.get(node.id)?.parentNode) continue; // already live — leave it alone

      const was = nodeHosts.has(node.id) ? 'detached' : 'absent';
      try {
        mountHost(node);
      } catch {
        // A FIRST-MOUNT PAINTER THAT THROWS must not take the export with it. This is the
        // only place a widget's painter runs outside a frame, so letting it propagate
        // would abort the whole export AND strand every host materialized before it.
        // `mountHost` registers the element before it calls the painter, so the undo below
        // is still knowable, and the capture degrades to the marked box and warning that
        // every unreadable host already gets.
      }

      const host = nodeHosts.get(node.id);
      if (!host) continue;

      if (was === 'detached' || !culler) {
        if (was === 'detached') undo.push(() => host.remove());
      } else if (culler.getMode() === 'destroy') {
        undo.push(() => {
          // IDENTITY-CHECKED, because the async path can suspend between the mount and
          // this undo. If the node left the model while we waited, the frame's own
          // teardown loop has already fired `removeCustomNode` and dropped the host —
          // firing again would dispose an embedder's component twice. In the synchronous
          // path nothing can run in between, so this is always true and changes nothing.
          if (nodeHosts.get(node.id) !== host) return;
          removeCustomHost(node.id, host);
          host.remove();
          nodeHosts.delete(node.id);
        });
      } else {
        undo.push(() => host.remove());
      }
    }

    return () => {
      for (const restore of undo) restore();
    };
  };

  /**
   * Why this widget's capture may be short, in the words a developer can act on.
   *
   * `waited` distinguishes the two ways an unfinished painter reaches an export, because
   * they have different fixes: the synchronous entry points CANNOT wait and the caller
   * should move to `await export(…)`; the asynchronous one waited and gave up, and the
   * caller should raise the deadline or find out why the painter never settles.
   */
  const paintWarning = (
    id: string,
    waited: boolean,
    timeoutMs: number
  ): string | undefined => {
    const failure = paintFailures.get(id);
    if (failure !== undefined) {
      const how = paintThrew.has(id)
        ? 'THREW synchronously'
        : 'promise REJECTED';
      return (
        `custom node "${id}" — its renderCustomNode ${how} (${failure}), so whatever ` +
        'it had not drawn by then is missing from this export.'
      );
    }
    if (!pendingPaints.has(id)) return undefined;
    if (waited) {
      return (
        `custom node "${id}" did not finish painting within ${timeoutMs}ms — captured as it ` +
        'stood at the deadline, which may be partial or blank. Raise ' +
        'ExportOptions.customNodeTimeout, or check why its renderCustomNode promise never settles.'
      );
    }
    return (
      `custom node "${id}" is STILL PAINTING asynchronously (its renderCustomNode returned a ` +
      'promise that has not settled). exportSvgString() / exportPdf() are synchronous by ' +
      "contract and cannot wait — use `await diagram.export('svg' | 'pdf' | 'png', …)`, which does."
    );
  };

  /**
   * THE EXPORT BOUNDARY for HTML-layer nodes — this canvas's hosts, handed to the shared
   * pipeline in `export/capture-pipeline.ts` (which every canvas runs, so the Angular
   * canvas captures its own HTML layer through the identical code).
   *
   * Only this instance holds the hosts, the culler and the paint ledger, so what it
   * supplies is exactly those: where each host is, how to force-mount one
   * (`materializeCustomNodes`), which painters are still pending, what to warn about
   * them, and the pin that keeps a waited-on host from being culled mid-capture.
   */
  const exportPipeline = createExportPipeline(renderer, {
    getNodes: () => model.getNodes(),
    getHost: (id) => nodeHosts.get(id),
    isExportable: isExportableCustomNode,
    bounds: nodeBounds,
    materialize: materializeCustomNodes,
    pendingPaint: (id) => pendingPaints.get(id),
    paintWarning,
    pin: (ids) => {
      for (const id of ids) pinnedHosts.add(id);
      return () => {
        for (const id of ids) pinnedHosts.delete(id);
      };
    },
  });

  // -- the frame --------------------------------------------------------------
  let lastViewportKey = '';
  let lastFrameHadPreview = false;
  /** Mutation epoch as of the end of the last painted frame. See canSkipFrame(). */
  let lastFrameEpoch = -1;
  /** Renderer invalidation epoch as of the end of the last painted frame. */
  let lastRendererEpoch = -1;
  /**
   * Coverage of the frame currently in the DOM — OUR copy, captured right after
   * the render() call paint() reconciled. Never read the renderer's field
   * lazily: exports share the render pass and overwrite it (see
   * SVGRenderer.getFrameCoverage).
   */
  let lastFrameCoverage: FrameCoverage | null = null;
  /**
   * True while renderNow() is on the stack. renderNow is the documented "give
   * me a correct DOM before I measure it" escape hatch — it must reconcile for
   * real, never take the camera fast path.
   */
  let forceFullPaint = false;
  let ready = false;
  let disposed = false;

  /**
   * `ready` fires on a microtask, not inline in the mount paint. The first paint
   * happens INSIDE `createDiagram()`, so a caller doing
   * `const d = createDiagram(...); d.on('ready', …)` could never have observed an
   * inline emit — the handler is registered one statement too late.
   */
  const signalReady = (): void => {
    if (ready) return;
    ready = true;
    queueMicrotask(() => {
      if (!disposed) emit('ready', undefined);
    });
  };

  const viewportKey = (): string => {
    const v = viewport.getViewport();
    return `${v.x},${v.y},${v.width},${v.height}@${viewport.getZoom()}`;
  };

  const isConnectionPreviewActive = (): boolean => {
    try {
      return engine.getConnectionStateManager().getState().isConnecting === true;
    } catch {
      return false;
    }
  };

  /**
   * Idle-skip: drop a queued frame only when nothing visible could have changed.
   * The connection preview lives in interaction state, not in entity dirty flags,
   * so we never skip while it is — or was, last frame — active, otherwise its
   * removal would not repaint.
   *
   * wave8/dirty — BUG FIXED HERE. This used to sum `getDirtyNodes/Links/Groups`
   * and skip only when the total was zero. On any diagram bigger than the
   * viewport that total is NEVER zero, so the idle-skip never once fired:
   *
   *   the renderer marks an entity clean when it RENDERS it, and it renders only
   *   what is visible. Open a 10,000-node diagram with 56 nodes on screen and the
   *   other 9,944 stay dirty for the life of the canvas — they are never drawn,
   *   so they are never cleaned. `dirty > 0` forever. `return false` forever.
   *
   * So the one guard whose entire job was "don't repaint an idle canvas" was
   * dead exactly where idleness costs the most, and it charged three O(n) array
   * scans per queued frame for the privilege of always saying no.
   *
   * The mutation epoch answers the real question — *has anything changed since
   * the frame on screen?* — in O(1) and without caring whether the change was on
   * screen. (Off-screen changes matter: an off-screen node is an obstacle the
   * edge optimizer routes around, and its edge may well cross the viewport.)
   */
  const canSkipFrame = (): boolean => {
    if (!engine.getDiagram()) return false;
    // A feature measured something DURING the last frame (a port anchored to its
    // row) and owes the picture a repaint. Its change happened before that frame
    // stamped its epochs, so the epochs alone would call this frame idle.
    if (featureRepaintOwed) return false;
    if (getMutationEpoch() !== lastFrameEpoch) return false;
    // …and the RENDERER's own picture must not have gone stale either. The model
    // epoch answers "did the world change"; this answers "did my picture of it
    // change". They are not the same question, and the gap is a real bug: when
    // the off-thread route solver answers, the model has not changed — the epoch
    // does not move — but the routes have improved. Keyed only on the model, this
    // would drop that repaint before render() was ever called, and the refined
    // routes we paid a worker for would never reach the screen.
    if (renderer.getInvalidationEpoch() !== lastRendererEpoch) return false;
    if (viewportKey() !== lastViewportKey) return false;
    if (isConnectionPreviewActive() || lastFrameHadPreview) return false;
    return true;
  };

  /**
   * THE FRAME — in three strictly ordered phases (wave8/dirty, Card 1).
   *
   *   READ    every DOM measurement, before any write.
   *   COMPUTE pure VNode construction: no DOM in, no DOM out.
   *   WRITE   every DOM mutation, with no read between them.
   *
   * The order is the whole point. A read after a write forces the browser to
   * flush layout synchronously to answer it; do that inside a loop over N nodes
   * and you have N forced layouts — layout thrash, and the classic way a canvas
   * that is fast at 50 nodes dies at 500. Keeping the phases apart makes it
   * structurally impossible rather than merely absent today. (`node-component.ts`
   * had exactly this bug in its refresh loop; it now batches the same way.)
   */
  /**
   * THE CAMERA FAST PATH. The SVG draws in WORLD coordinates — the camera is
   * nothing but the root's `viewBox` attribute plus the HTML layer's CSS
   * transform. So a frame in which ONLY the camera moved needs no VNode build,
   * no reconcile, no custom-node sync: rewrite those two strings and the
   * already-painted overscan margin (SVGRenderer.CAMERA_OVERSCAN) scrolls into
   * view. This is what holds 60fps pan on scenes whose full frame costs 30ms.
   *
   * "Only the camera moved" is decided by the SAME signals canSkipFrame()
   * already stakes correctness on — the model's mutation epoch and the
   * renderer's invalidation epoch. Anything that changes the picture without
   * bumping one of those is already a bug today (canSkipFrame would drop its
   * frame outright). On any doubt this returns false and the full paint runs:
   * the fallback is never wrong, only slower.
   */
  const tryCameraFrame = (): boolean => {
    const cov = lastFrameCoverage;
    if (!cov || forceFullPaint) return false;
    // A custom-node culler admits hosts against the exact viewBox inside
    // syncCustomNodes(), which this path skips — its hosts have no overscan
    // margin to reveal, so boards that cull custom nodes take the full paint.
    if (culler) return false;
    if (!engine.getDiagram()) return false;
    if (getMutationEpoch() !== lastFrameEpoch) return false;
    if (renderer.getInvalidationEpoch() !== lastRendererEpoch) return false;
    if (isConnectionPreviewActive() || lastFrameHadPreview) return false;

    // The zoom must MATCH (LOD tiers are chosen per zoom) and the viewBox must
    // stay inside what the last full frame actually drew.
    const zoom = viewport.getZoom();
    if (zoom !== cov.zoom) return false;
    const box = viewport.getViewBox();
    if (box.width !== cov.viewBoxWidth || box.height !== cov.viewBoxHeight) return false;
    if (!cov.total) {
      const r = cov.rect;
      if (
        box.x < r.x ||
        box.y < r.y ||
        box.x + box.width > r.x + r.width ||
        box.y + box.height > r.y + r.height
      ) {
        return false;
      }
    }

    const svg = layers.svg.firstElementChild;
    if (!svg) return false;

    // Identical strings to the ones a full frame would produce: the viewBox from
    // the same getViewBox() math SVGRenderer uses, the transform from the same
    // helper paint() writes.
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    layers.html.setAttribute('style', htmlLayerStyle(viewport.getHtmlLayerTransform()));
    cameraFeatures();

    // The epochs did not move (precondition) and the DOM'd frame is unchanged —
    // only the viewport key advances, so a following no-camera schedule skips.
    lastViewportKey = viewportKey();
    return true;
  };

  const paint = (): void => {
    // An owed feature repaint is a FULL frame: the camera-only fast path keys on
    // the same epochs and would move the viewBox and nothing else.
    const owed = featureRepaintOwed;
    featureRepaintOwed = false;
    if (!owed && tryCameraFrame()) return;

    // -- READ ------------------------------------------------------------------
    const renderViewport = viewport.getRenderViewport();
    const zoom = viewport.getZoom();
    const htmlTransform = viewport.getHtmlLayerTransform();

    // -- COMPUTE ---------------------------------------------------------------
    const vnode = renderer.render(renderViewport, zoom);
    lastFrameCoverage = renderer.getFrameCoverage();

    // -- WRITE -----------------------------------------------------------------
    layers.html.setAttribute('style', htmlLayerStyle(htmlTransform));
    patcher.reconcile(layers.svg, vnode);
    syncCustomNodes();
    syncLineOverlay();
    syncHighlighterOverlay();
    syncFeatures();

    lastViewportKey = viewportKey();
    lastFrameHadPreview = isConnectionPreviewActive();
    // AFTER the frame, not before: rendering legitimately dirties model entities
    // (routed geometry, auto-sizing), and stamping on entry would record an epoch
    // the frame itself then invalidates — the skip would never fire again.
    lastFrameEpoch = getMutationEpoch();
    lastRendererEpoch = renderer.getInvalidationEpoch();

    signalReady();
  };

  /**
   * The HYDRATION frame: render the VNode tree, then ADOPT the server's DOM
   * instead of building it. Zero DOM writes ⇒ no flash and no re-layout.
   */
  const hydratePaint = (): void => {
    const vnode = renderer.render(viewport.getRenderViewport(), viewport.getZoom());
    lastFrameCoverage = renderer.getFrameCoverage();
    patcher.hydrate(layers.svg, vnode);
    syncCustomNodes();
    lastViewportKey = viewportKey();
    lastFrameHadPreview = isConnectionPreviewActive();
    lastFrameEpoch = getMutationEpoch();
    lastRendererEpoch = renderer.getInvalidationEpoch();
    signalReady();
  };

  // -- model → repaint --------------------------------------------------------
  const unsubs: Array<() => void> = [];
  const onModel = (event: string, handler: (...args: never[]) => void): void => {
    unsubs.push(model.on(event, handler as never));
  };

  onModel('node:added', () => {
    scheduler.schedule();
    emit('nodes:change', { nodes: model.getNodes() });
  });
  onModel('node:removed', () => {
    scheduler.schedule();
    emit('nodes:change', { nodes: model.getNodes() });
  });
  onModel('node:changed', () => scheduler.schedule());
  onModel('link:added', ((link: LinkModel) => {
    scheduler.schedule();
    emit('edges:change', { edges: model.getLinks() });
    // The engine creates the link ASYNCHRONOUSLY from `connection:complete`, so
    // this — not the mouseup — is where a user-drawn connection is observable.
    if (link) emit('connect', { link });
  }) as never);
  onModel('link:removed', () => {
    scheduler.schedule();
    emit('edges:change', { edges: model.getLinks() });
  });
  onModel('link:changed', () => scheduler.schedule());
  // Groups paint too (frames, lanes, collapse proxies) — leaving these out made
  // fitToContents() invisible until an unrelated event happened to render.
  onModel('group:added', () => scheduler.schedule());
  onModel('group:removed', () => scheduler.schedule());
  onModel('group:changed', () => scheduler.schedule());
  // Ink paints too. The draw tool asks for its own repaint, so the pen always
  // looked fine — but ink added IN CODE (a saved board, seeded strokes, a
  // collaborator's stroke through applyIncremental) stayed invisible until an
  // unrelated event happened to render.
  onModel('stroke:added', () => scheduler.schedule());
  onModel('stroke:removed', () => scheduler.schedule());
  onModel('strokes:cleared', () => scheduler.schedule());
  // …and so do the bulk clears, which emit only their `*:cleared` event.
  onModel('nodes:cleared', () => {
    scheduler.schedule();
    emit('nodes:change', { nodes: model.getNodes() });
  });
  onModel('links:cleared', () => {
    scheduler.schedule();
    emit('edges:change', { edges: model.getLinks() });
  });
  onModel('groups:cleared', () => scheduler.schedule());
  // Comment pins paint too. The overlay drops the cached frame on every store
  // change, but dropping the cache paints nothing: a new thread showed no pin
  // (and a resolved one kept its pin) until an unrelated hover repainted.
  if (commentStore) unsubs.push(commentStore.onChange(() => scheduler.schedule()));
  // The outline layer's validation is refreshed when the STRUCTURE changes — a
  // node, link or group added, removed or cleared — as Angular's canvas does
  // after a structural command. Never per frame: validateDiagram() walks it all.
  for (const ev of ['node:added', 'node:removed', 'link:added', 'link:removed', 'group:added', 'group:removed', 'nodes:cleared', 'links:cleared', 'groups:cleared']) {
    onModel(ev, () => {
      if (!highlighterOn) return;
      highlighter.refreshValidation(engine);
      scheduler.schedule();
    });
  }
  onModel('selection:changed', () => {
    scheduler.schedule();
    announceSelection();
  });

  unsubs.push(
    viewport.onChange((state) => {
      scheduler.schedule();
      emit('viewport:change', state);
    })
  );

  // -- resize -----------------------------------------------------------------
  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      const r = getRect();
      if (r.width > 0 && r.height > 0) viewport.syncCanvasSize(r);
    });
    resizeObserver.observe(container);
  }

  // -- mount ------------------------------------------------------------------
  binder.attach();

  if (hydration) {
    hydratePaint();
  } else {
    if (options.fitView) fitView(40);
    // Synchronous first paint: a host that measures right after createDiagram()
    // must not see an empty container.
    scheduler.flush();
  }

  function fitView(padding = 40): void {
    const bounds = contentBounds(model);
    // maxZoom 1: fitting means "show me everything", never "magnify a small
    // graph until it fills the wall". Zooming out to fit is still unbounded
    // (down to the controller's minZoom). Hosts wanting magnification can call
    // viewport.fitToBounds directly.
    if (bounds) viewport.fitToBounds(bounds, padding, { maxZoom: 1 });
  }

  const instance: DiagramInstance = {
    setNodes(nodes) {
      const before = templatedData();
      const changed = applyNodes(model, nodes);
      rederiveTemplates(before);
      if (changed) scheduler.schedule();
    },
    setEdges(edges) {
      if (applyEdges(model, edges, (w) => warnEdge(w))) scheduler.schedule();
    },
    setGroups(groups) {
      if (applyGroups(model, groups)) {
        renderer.invalidateFrame();
        scheduler.schedule();
      }
    },
    getModel: () => model,
    getEngine: () => engine,
    getCommentStore: () => commentStore,

    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as Listener);
      return () => set?.delete(handler as Listener);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler as Listener);
    },

    viewport,
    interaction,

    setTheme(theme) {
      renderer.setTheme(theme);
      scheduler.schedule();
    },

    // Wave 10: the renderer could already do all of this. The instance — the only
    // handle a host is given — exposed none of it, and did not expose the renderer
    // either, so `SVGRenderer.export()` was unreachable from an embed. The library
    // shipped PNG, JPEG, WebP, a real vector PDF and a deterministic zero-DOM SVG
    // serializer that an embedder had no way to call.
    setColorMode(mode, themes) {
      renderer.setColorMode(mode, themes);
      scheduler.schedule();
    },
    getColorMode: () => renderer.getColorMode(),
    setTokenBridge(bridge) {
      renderer.setTokenBridge(bridge);
      scheduler.schedule();
    },
    setHighlightConnected(value) {
      renderer.setHighlightConnected(value);
      scheduler.schedule();
    },
    setHighlighterConfig(value) {
      applyHighlighterConfig(value);
      // nothing in the model changed, so the frame gate must be told
      renderer.invalidateFrame();
      scheduler.schedule();
    },
    getHighlightConnected: () => renderer.getHighlightConnected(),

    // THE ONLY ASYNC EXPORT ENTRY POINT — and it always was one. `IRenderer.export`
    // has returned a Promise since the seam existed, so an ASYNC custom-node painter
    // needs no new public method: this is where waiting for one belongs. The two
    // synchronous entry points below keep their contract exactly, and report an
    // unfinished painter rather than pretending to have read it.
    export: (format, exportOptions) => exportPipeline.export(format, exportOptions),
    exportSvgString: (exportOptions) => exportPipeline.exportSvgString(exportOptions),
    exportPdf: (exportOptions) => exportPipeline.exportPdf(exportOptions),

    exportText: (textOptions) => exportDiagramText(model, textOptions),
    loadText: (text, textOptions) => {
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
      const result = importDiagramText(text, textOptions);
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
      // every metadata key but `label`. (Loading into the same instance that
      // still held those node objects looked lossless; the loss only showed up
      // in the case that matters, opening a file.) A model under an id already
      // on the canvas REPLACES the old one — edited text must show its edits. applyNodes/applyEdges already accept live
      // models through their isNodeModel branch, so nothing about the reconciler
      // required the projection — and exportText's own contract promises a
      // "lossless sidecar … feed the result back to loadText for a full
      // round-trip", which this is what makes true.
      const templatedBefore = templatedData();
      applyNodes(model, result.diagram.getNodes());
      rederiveTemplates(templatedBefore);
      applyEdges(model, result.diagram.getLinks(), (w) => warnEdge(w));

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

      scheduler.schedule();
      return result;
    },

    /** The LOD tier actually rendered, and the governor's last verdict. */
    getQualityState: () => renderer.getQualityState(),

    /** Animation policy (global toggle, speed, reduced-motion, battery-saver opt-out). */
    animations: renderer.getAnimationService(),

    fitView,

    render: () => scheduler.schedule(),
    renderNow: () => {
      forceFullPaint = true;
      try {
        scheduler.flush();
      } finally {
        forceFullPaint = false;
      }
    },

    batchUpdate(mutate) {
      model.beginBatch();
      try {
        mutate(model);
      } finally {
        // `finally`: a throwing mutator must not leave the model batching
        // forever — every subsequent change would be silently swallowed, and the
        // canvas would simply stop updating with no error to explain it.
        model.endBatch();
      }
      // endBatch() replays the queued events, and each of those already calls
      // schedule(). This is for the batch that changed something the model does
      // not emit for (or nothing at all): schedule() is idempotent within a tick,
      // so an extra call costs one `coalesced` counter, never an extra frame.
      scheduler.schedule();
    },

    getDraggingNodeIds: () => binder.getDraggingNodeIds(),
    setReadonly(readonly: boolean) {
      applyReadonly(readonly);
      scheduler.schedule();
    },
    isReadonly: () => binder.readonlyNow(),
    copy: () => clipboardApi.copy(),
    cut: () => clipboardApi.cut(),
    paste: (data, pasteOptions) => clipboardApi.paste(data, pasteOptions),
    setOverlay: (overlay) => overlayFeature().set(overlay),
    clearOverlay: () => runOverlay?.set({}),
    getOverlay: () => runOverlay?.get() ?? {},
    tidy: (tidyOptions = {}) => tidyFlow(engine, tidyOptions, () => scheduler.schedule()),
    placeNodes: (ids, placeOptions = {}) => placeFlow(engine, ids, placeOptions, () => scheduler.schedule()),
    async insertNodeOnLink(linkId, node, insertOptions) {
      const result = await insertNodeOnLink(engine, linkId, node, insertOptions, nodeTemplates ? (n) => nodeTemplates.prepare(model, n) : undefined);
      if (result) scheduler.schedule();
      return result;
    },

    beginLabelEdit: (target, opts) => binder.beginLabelEdit(target, opts),

    registry: renderer.getRegistry(),

    dispose() {
      if (disposed) return;
      disposed = true;

      commentOverlay?.dispose();
      commentOverlay = null;
      for (const f of features.splice(0)) f.dispose();
      stopTemplates?.();
      if (nodeTemplates && model.getNodeTemplateResolver() === nodeTemplates.resolve) model.setNodeTemplateResolver(null);
      binder.detach();
      scheduler.dispose();
      resizeObserver?.disconnect();

      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      listeners.clear();

      for (const [id, host] of [...nodeHosts]) {
        removeCustomHost(id, host);
        host.remove();
      }
      nodeHosts.clear();

      interaction.dispose();
      viewport.dispose();
      renderer.dispose();
      patcher.unmount(layers.svg);
      // Only tear down the DOM we created. An engine handed in by the caller is
      // theirs to destroy.
      layers.root.remove();
      if (!options.engine) engine.destroy();
    },

    container,
    scheduler,
    patcher,
  };

  return instance;
}


// contentBounds lives in its own DOM-free module so the server render fits the
// same way; re-exported here, where callers have always found it.
export { contentBounds };

interface Layers {
  root: HTMLElement;
  svg: HTMLElement;
  html: HTMLElement;
}

/**
 * Build the layer skeleton — or ADOPT the server's when hydrating. The adopted
 * path must not write to the DOM at all: that is what "no flash, no re-layout"
 * means in practice.
 */
function ensureLayers(
  container: HTMLElement,
  doc: Document,
  hydration: HydrationSnapshot | undefined
): Layers {
  if (hydration) {
    const root = container.querySelector(`.${ROOT_CLASS}`) as HTMLElement | null;
    const svg = root?.querySelector(`.${SVG_LAYER_CLASS}`) as HTMLElement | null;
    const html = root?.querySelector(`.${HTML_LAYER_CLASS}`) as HTMLElement | null;
    if (root && svg && html) return { root, svg, html };
    // Server markup missing → fall through and mount fresh (correct, if not
    // flash-free). Silently rebuilding beats rendering nothing.
  }

  const root = doc.createElement('div');
  root.className = ROOT_CLASS;
  root.setAttribute('style', ROOT_STYLE);

  const svg = doc.createElement('div');
  svg.className = SVG_LAYER_CLASS;
  svg.setAttribute('style', SVG_LAYER_STYLE);

  const html = doc.createElement('div');
  html.className = HTML_LAYER_CLASS;
  html.setAttribute('style', htmlLayerStyle('translate(0px, 0px) scale(1)'));

  root.appendChild(svg);
  root.appendChild(html);
  container.appendChild(root);

  return { root, svg, html };
}

/**
 * Measure text with a real canvas, in the theme's faces, so a composing layout
 * sizes boxes to the words as they will actually draw. Undefined where there is
 * no canvas (a server, jsdom) — the layout then estimates.
 */
function canvasTextMeasure(): MeasureText | undefined {
  if (typeof document === 'undefined') return undefined;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')) return undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    return undefined;
  }
  if (!ctx) return undefined;
  const c = ctx;
  return (text, font) => {
    const family = /mono/i.test(font.family ?? '')
      ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      : font.family ?? 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    c.font = `${font.weight ?? 400} ${font.size}px ${family}`;
    return c.measureText(text).width + (font.letterSpacing ?? 0) * Array.from(text).length;
  };
}

