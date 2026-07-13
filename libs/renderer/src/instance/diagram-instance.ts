import type {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  SerializedNode,
  SerializedLink,
} from '@grafloria/engine';
import type { Theme } from '../types/theme.types';
import type { InteractionController } from '../interaction/interaction-controller';
import type {
  ViewportController,
  ViewportState,
  ViewportPoint,
  Unsubscribe,
} from '../viewport/viewport-controller';

/**
 * ============================================================================
 * The headless instance contract
 * ============================================================================
 *
 * This module defines the PUBLIC SHAPE of the framework-agnostic diagram
 * instance — the thing a future `createDiagram(container, options)` returns and
 * that every wrapper (React, Vue, Svelte, web component, plain script tag) will
 * be a thin adapter over:
 *
 * ```ts
 * const diagram = createDiagram(document.getElementById('canvas')!, {
 *   nodes, edges, theme: LIGHT_THEME,
 * });
 * const off = diagram.on('selection:change', ({ nodes }) => console.log(nodes));
 * diagram.setNodes(nextNodes);
 * diagram.dispose();
 * ```
 *
 * It is deliberately TYPES-ONLY for now. Two of the four subsystems it composes
 * already exist as framework-agnostic classes in this library:
 *
 *   ✅ {@link InteractionController} — hover / connect / reconnect / waypoints
 *   ✅ {@link ViewportController}    — screen↔world, zoom, pan, viewBox
 *   ✅ `SVGRenderer` / `CanvasRenderer` — model → VNode tree
 *
 * ## What still blocks `createDiagram()` shipping (the follow-on card)
 *
 * 1. **VNode → DOM materializer.** The only patcher that can turn a VNode tree
 *    into real DOM is `VNodeRendererService` in `@grafloria/renderer-angular`.
 *    Until a keyed reconciler is promoted into `@grafloria/renderer`, nothing here
 *    can mount into `container`. *(Owned by the patcher card — in flight.)*
 *
 * 2. **DOM event binding + handler orchestration.** The listeners are Angular
 *    `@HostListener`s on `DiagramCanvasComponent` (`wheel`, `mousedown`,
 *    `mousemove`, `mouseup`, `mouseleave`, `window:keydown`), and the *order* in
 *    which a `mousedown` is dispatched across port → handle → waypoint →
 *    control-point → link → node branches lives inline in that 2096-line
 *    component. A headless instance needs that decision tree lifted into a
 *    framework-agnostic `DomEventBinder` that does
 *    `addEventListener` → {@link ViewportController.clientToWorld} →
 *    {@link InteractionController}. This is the single largest remaining piece.
 *
 * 3. **Render scheduling.** `scheduleRender()` (rAF coalescing + the idle-skip
 *    check keyed on viewport+zoom) is a private component method. It needs to
 *    become a small framework-agnostic `RenderScheduler`.
 *
 * 4. **Custom / HTML-layer nodes.** Nodes with `metadata.useHTMLLayer` are
 *    materialized by `ComponentRendererService` + `HandleRegistryService`, which
 *    instantiate **Angular** components. The instance API needs a pluggable
 *    `renderCustomNode(node, el)` host callback so each framework supplies its
 *    own node renderer; otherwise custom nodes stay Angular-only.
 *
 * Items 2–4 are pure extraction (no redesign) and are independent of item 1.
 * The Angular canvas keeps working throughout: it already delegates its
 * interaction logic to {@link InteractionController}, so each piece can be
 * lifted out and re-consumed by the component one at a time.
 */

/** Nodes/edges may be handed in as live models or as serialized descriptors. */
export type NodeInput = NodeModel | SerializedNode;
export type EdgeInput = LinkModel | SerializedLink;

/**
 * Events a diagram instance emits. Hosts subscribe with {@link DiagramInstance.on}
 * and translate them into their framework's render trigger — the wrapper's ONLY
 * job. Names mirror the engine's own event vocabulary.
 */
export interface DiagramEventMap {
  /** The node set changed (added / removed / moved / restyled). */
  'nodes:change': { nodes: NodeModel[] };
  /** The edge set changed. */
  'edges:change': { edges: LinkModel[] };
  /** Selection changed (nodes and/or edges). */
  'selection:change': { nodes: NodeModel[]; edges: LinkModel[] };
  /** A new link was completed by dragging port → port. */
  connect: { link: LinkModel };
  /** An existing link's endpoint was dropped on a new port. */
  reconnect: { link: LinkModel; endpoint: 'source' | 'target' };
  'node:click': { node: NodeModel; world: ViewportPoint };
  'node:doubleclick': { node: NodeModel; world: ViewportPoint };
  'edge:click': { edge: LinkModel; world: ViewportPoint };
  /** Camera moved — pan, zoom, or canvas resize. */
  'viewport:change': ViewportState;
  /** Emitted once the instance is mounted and has painted its first frame. */
  ready: void;
}

export type DiagramEventName = keyof DiagramEventMap;

export type DiagramEventHandler<K extends DiagramEventName> = (
  payload: DiagramEventMap[K]
) => void;

// NOTE: `Unsubscribe` (the return of `on()`) is declared ONCE, in ./viewport, and
// imported above. Do not re-declare or re-export it here: `@grafloria/renderer`'s
// barrel re-exports both modules, and a second declaration of the same name makes
// that export ambiguous (TS2308) — which breaks every consumer of the library.

export interface CreateDiagramOptions {
  /** Initial nodes. */
  nodes?: NodeInput[];
  /** Initial edges. */
  edges?: EdgeInput[];
  /** Visual theme. Defaults to `LIGHT_THEME`. */
  theme?: Theme;
  /** Which rendering strategy to mount. Defaults to `'svg'`. */
  renderer?: 'svg' | 'canvas' | 'hybrid';

  /** Initial zoom. Defaults to 1. */
  zoom?: number;
  /** Zoom clamp. Default 0.1 / 3.0 — see {@link ViewportController}. */
  minZoom?: number;
  maxZoom?: number;

  /** Attach to an existing engine instead of creating one. */
  engine?: DiagramEngine;

  /**
   * Host hook for nodes that render as framework components rather than SVG
   * (`metadata.useHTMLLayer`). Blocker #4 above: without this, custom nodes
   * cannot exist outside Angular. The host owns the element's lifetime.
   */
  renderCustomNode?: (node: NodeModel, element: HTMLElement) => void;
}

/**
 * The headless diagram instance. Framework wrappers hold one of these and do
 * nothing but (a) forward props into `setNodes`/`setEdges`, and (b) turn the
 * events from `on()` into their own re-render signal.
 */
export interface DiagramInstance {
  // -- model -----------------------------------------------------------------

  /** Replace the node set (diffed against the current model). */
  setNodes(nodes: NodeInput[]): void;
  /** Replace the edge set (diffed against the current model). */
  setEdges(edges: EdgeInput[]): void;
  /** The live diagram model — the source of truth. */
  getModel(): DiagramModel;
  /** Escape hatch to the full engine (layout, DSL, serialization, history). */
  getEngine(): DiagramEngine;

  // -- events ----------------------------------------------------------------

  /** Subscribe. Returns an unsubscribe fn; also removable via {@link off}. */
  on<K extends DiagramEventName>(
    event: K,
    handler: DiagramEventHandler<K>
  ): Unsubscribe;
  off<K extends DiagramEventName>(event: K, handler: DiagramEventHandler<K>): void;

  // -- subsystems (already framework-agnostic today) --------------------------

  /** The camera: screen↔world, zoom, pan, fit. */
  readonly viewport: ViewportController;
  /** The interaction brain: hover, connect, reconnect, waypoints. */
  readonly interaction: InteractionController;

  // -- lifecycle -------------------------------------------------------------

  /** Force a repaint (normally automatic). */
  render(): void;
  /** Detach all DOM listeners, drop subscriptions, release the engine. */
  dispose(): void;
}

/**
 * The factory a wrapper calls. NOT YET IMPLEMENTED — see the blocker list above.
 * Declaring the signature now fixes the contract that the patcher card and the
 * event-binder card are building towards.
 */
export type CreateDiagram = (
  container: HTMLElement,
  options?: CreateDiagramOptions
) => DiagramInstance;
