/**
 * ============================================================================
 * Card 0 — the typed CAPABILITY accessors
 * ============================================================================
 *
 * An extension never receives the engine, the renderer, or a raw registry. It
 * receives a set of narrow, typed capability objects — and ONLY the ones its
 * manifest declared (Card 7). That is the least-privilege rule, and it is what
 * makes an extension's blast radius readable from its manifest alone.
 *
 * Every `register*` here returns a {@link Disposer}, and every disposer RESTORES
 * the previous registration rather than merely deleting the key — so an
 * extension that overrode a built-in gives it back on unload.
 *
 * These are FACADES. Not one of them reimplements a registry: they delegate to
 * the real ones (shape-registry, edge-templates, RoutingEngine, TemplateRegistry,
 * CustomAnimationRegistry, and Wave 6's link-pipeline), adding only the disposer
 * + restore semantics the underlying registries never had.
 */

import type { DiagramEngine, NodeTemplate, TemplateRegistry } from '@grafloria/engine';
import type { IRouter } from '@grafloria/engine';
import type { ShapeDefinition } from '../svg/shape-registry';
import type { PathGeometry, PathShapeOptions } from '../svg/shape-registry';
import type { LinkTemplate, LabelTemplate, MarkerDefinition } from '../svg/edge-templates';
import type { CustomAnimationDefinition } from '../services/custom-animation-registry';
import type { AnchorFn, ConnectionPointFn, ConnectorFn } from './link-pipeline';
import type { Disposer } from './disposable';
import type { Portal, PortalOptions, ViewportPortal } from './portal';
import type { CanvasTool, ConnectionValidator } from './tools';

/** The names an extension may request. Mirrors the keys of {@link ExtensionCapabilities}. */
export type CapabilityName =
  | 'shapes'
  | 'links'
  | 'routers'
  | 'templates'
  | 'animations'
  | 'tools'
  | 'panels';

/** Contribute node geometry. Wraps the (already unified) shape registry. */
export interface ShapeCapability {
  /** Register a full shape definition. */
  register(type: string, definition: Omit<ShapeDefinition, 'type'> & { type?: string }): Disposer;
  /** Register a shape from an SVG path (boundary + port anchors auto-derived). */
  registerPath(type: string, geometry: PathGeometry, options?: PathShapeOptions): Disposer;
  has(type: string): boolean;
  list(): string[];
}

/** Contribute link visuals + the four link-pipeline stages. */
export interface LinkCapability {
  /** Whole-link VNode template (`link.style.template`). */
  registerTemplate(name: string, template: LinkTemplate): Disposer;
  /** Label VNode template (`label.template`). */
  registerLabelTemplate(name: string, template: LabelTemplate): Disposer;
  /** Arrowhead / marker (`arrowHead.type`). */
  registerMarker(name: string, definition: MarkerDefinition): Disposer;
  /** Polyline → SVG path `d` (`link.connector`). */
  registerConnector(name: string, connector: ConnectorFn): Disposer;
  /** Per-end attachment point (`link.metadata.sourceAnchor` / `targetAnchor`). */
  registerAnchor(name: string, anchor: AnchorFn): Disposer;
  /** Whole-link, two-ended attachment strategy (`link.metadata.connectionPoint`). */
  registerConnectionPoint(name: string, strategy: ConnectionPointFn): Disposer;
  listConnectors(): string[];
  listAnchors(): string[];
  listConnectionPoints(): string[];
}

/** Contribute routing algorithms. Wraps `RoutingEngine.registerRouter`. */
export interface RouterCapability {
  register(name: string, router: IRouter): Disposer;
  list(): string[];
  has(name: string): boolean;
}

/** Contribute reusable node templates. Wraps the engine's TemplateRegistry. */
export interface TemplateCapability {
  register(template: NodeTemplate): Disposer;
  list(): NodeTemplate[];
  has(id: string): boolean;
}

/** Contribute named animations. Wraps CustomAnimationRegistry. */
export interface AnimationCapability {
  register(definition: CustomAnimationDefinition): Disposer;
  has(name: string): boolean;
  list(): CustomAnimationDefinition[];
}

/** Contribute interaction tools + connection validation (Card 5). */
export interface ToolCapability {
  /**
   * Register (or REPLACE, by name) a canvas tool. Replacing `'node-drag'` with
   * your own is the point: the built-ins are registrations, not privileged code.
   */
  register(tool: CanvasTool): Disposer;
  /** Veto connections. All registered validators must pass. */
  registerConnectionValidator(validator: ConnectionValidator): Disposer;
  list(): string[];
  has(id: string): boolean;
}

/**
 * Contribute on-canvas UI (Card 6). This is the ONLY capability that hands back
 * a DOM element, and it is scoped to the diagram's own layers — an extension
 * cannot reach the rest of the page through it.
 */
export interface PanelCapability {
  /** A floating panel pinned to the viewport (does not pan/zoom). */
  createPanel(options?: PortalOptions): Portal;
  /** Content that lives IN the diagram (pans/zooms with the canvas). */
  createViewportPanel(options?: { x?: number; y?: number; className?: string; style?: string }): ViewportPortal;
  /** World-space, but held at a constant on-screen size. */
  createCounterScaledPanel(options?: { x?: number; y?: number; className?: string; style?: string }): ViewportPortal;
}

/**
 * The full capability set. An extension's `activate()` receives a PARTIAL of
 * this — exactly the keys its manifest declared.
 */
export interface ExtensionCapabilities {
  shapes: ShapeCapability;
  links: LinkCapability;
  routers: RouterCapability;
  templates: TemplateCapability;
  animations: AnimationCapability;
  tools: ToolCapability;
  panels: PanelCapability;
}

/**
 * What an extension is given at activation, beyond its capabilities: a scoped
 * logger, its own resolved manifest, and a disposal bag. Deliberately NOT the
 * engine — see Card 7.
 */
export interface ExtensionContext<C extends CapabilityName = CapabilityName> {
  /** Only the capabilities the manifest declared. */
  readonly capabilities: Pick<ExtensionCapabilities, C>;
  /** The extension's own id. */
  readonly id: string;
  /**
   * Anything pushed here is disposed with the extension. Use it for your own
   * timers/listeners; registry registrations are tracked automatically.
   */
  onDispose(disposer: Disposer): void;
}

/**
 * The host's own view of the world. Passed to the capability factories so they
 * can reach the real registries. NOT exposed to extensions.
 */
export interface HostBindings {
  engine: DiagramEngine;
  /**
   * The registry every contribution is written into. Pass `diagram.registry` and
   * this host's extensions contribute to THAT DIAGRAM ONLY.
   *
   * Absent means the PROCESS-GLOBAL registries, which is what every host did
   * before per-diagram registries existed and remains the right answer for an
   * app-wide plugin. It is also why two hosts on one page used to fight: both
   * wrote the same `badge`, the second won, and the first one's `dispose()`
   * restored "no badge" over the top of the second's registration.
   */
  registry?: import('./diagram-registry').DiagramRegistry;
  /**
   * The engine's node-template registry.
   *
   * MUST be passed explicitly: `TemplateRegistry` is constructed with an
   * `EventBus` and is NOT reachable from `DiagramEngine` (there is no
   * `getTemplateRegistry()`), so the host cannot find it on its own. An
   * extension declaring the `templates` capability is REJECTED when this is
   * absent — rather than handed a capability object that would throw on use.
   */
  templateRegistry?: TemplateRegistry;
  /** The diagram root element — panels attach here. May be absent (headless). */
  root?: HTMLElement;
  /** The camera-transformed HTML layer — world-space panels attach here. */
  htmlLayer?: HTMLElement;
  /** The camera, for counter-scaled panels. */
  viewport?: import('../viewport/viewport-controller').ViewportController;
  /** Ask the host to repaint (a contributed shape/connector changes the picture). */
  requestRender?: () => void;
}
