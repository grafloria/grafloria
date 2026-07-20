/**
 * ============================================================================
 * Card 0 — the FACADE. This is where capability objects meet the real registries.
 * ============================================================================
 *
 * Read this file as the answer to "did they rewrite the registries?" — no. Every
 * method below is a delegation to the registry that already existed, wrapped in
 * exactly two things it did not have:
 *
 *   1. a DISPOSER, and
 *   2. RESTORE-ON-DISPOSE (put back what was there before, don't just delete).
 *
 * `buildCapabilities` also enforces the grant: it materialises ONLY the keys the
 * manifest declared. An extension that did not ask for `routers` does not get a
 * `routers` object it could call — the property is absent, not merely typed away.
 *
 * ---------------------------------------------------------------------------
 * WHOSE REGISTRY — the thing that used to be missing
 * ---------------------------------------------------------------------------
 * Every delegation below now goes through `bindings.registry`, which is
 * `diagram.registry` when the host was bound to one and the process-global
 * registry otherwise. Both are the SAME class (see `diagram-registry.ts`), so
 * there is one implementation of restore-on-dispose rather than one per scope.
 *
 * That single indirection is the whole per-diagram isolation fix. Before it,
 * two hosts on one page wrote the same module-global map: the second
 * registration silently repainted the first diagram, and the first host's
 * `dispose()` — faithfully restoring what was there before IT registered —
 * deleted the second diagram's shape out from under it.
 *
 * NOT YET ROUTED: `tools` and `registerConnectionValidator`. Those registries are
 * read on the INTERACTION path (`resolveTool` on pointerdown, `isValidConnection`
 * during snapping), not inside the render pass, so scoping their storage without
 * also scoping those four read sites would make a scoped tool invisible — a
 * worse bug than the one being fixed. They are still process-global and still
 * collide between diagrams; see the note on `tools` below.
 */

import type { ShapeDefinition, PathGeometry, PathShapeOptions } from '../svg/shape-registry';
import type { LinkTemplate, LabelTemplate, MarkerDefinition } from '../svg/edge-templates';
import type { AnchorFn, ConnectionPointFn, ConnectorFn } from './link-pipeline';
import type { CustomAnimationDefinition } from '../services/custom-animation-registry';
import { registerTool, registerConnectionValidator, listTools, hasTool } from './tools';
import type { CanvasTool, ConnectionValidator } from './tools';
import { createPortal, createViewportPortal, createCounterScaledPortal } from './portal';
import { GLOBAL_DIAGRAM_REGISTRY } from './diagram-registry';
import type { CapabilityName, ExtensionCapabilities, HostBindings } from './capabilities';
import type { DisposableStore } from './disposable';
import type { IRouter, NodeTemplate } from '@grafloria/engine';

/**
 * Build the capability objects for ONE extension, tracking every registration in
 * that extension's own {@link DisposableStore}.
 */
export function buildCapabilities(
  granted: readonly CapabilityName[],
  bindings: HostBindings,
  store: DisposableStore
): Partial<ExtensionCapabilities> {
  const capabilities: Partial<ExtensionCapabilities> = {};
  const wanted = new Set<CapabilityName>(granted);

  // Any contribution that changes the picture should schedule a repaint —
  // otherwise a shape registered after mount would not appear until something
  // else happened to dirty the scene. (That is the dead-config failure mode in
  // miniature, and it is why this is threaded through every register().)
  const track = (disposer: () => void): (() => void) => {
    bindings.requestRender?.();
    return store.add(() => {
      disposer();
      bindings.requestRender?.();
    });
  };

  // The registry this host contributes to: the diagram's own when it was bound
  // to one, else the process-wide one. Same class, same disposer semantics.
  const registry = bindings.registry ?? GLOBAL_DIAGRAM_REGISTRY;

  // -- shapes ---------------------------------------------------------------
  if (wanted.has('shapes')) {
    capabilities.shapes = {
      register: (type: string, definition: Omit<ShapeDefinition, 'type'> & { type?: string }) =>
        track(registry.registerShape(type, definition)),
      registerPath: (type: string, geometry: PathGeometry, options?: PathShapeOptions) =>
        track(registry.registerPathShape(type, geometry, options)),
      has: (type: string) => registry.hasShape(type),
      list: () => registry.listShapes(),
    };
  }

  // -- links ----------------------------------------------------------------
  if (wanted.has('links')) {
    capabilities.links = {
      registerTemplate: (name: string, template: LinkTemplate) =>
        track(registry.registerLinkTemplate(name, template)),
      registerLabelTemplate: (name: string, template: LabelTemplate) =>
        track(registry.registerLabelTemplate(name, template)),
      registerMarker: (name: string, definition: MarkerDefinition) =>
        track(registry.registerMarker(name, definition)),
      registerConnector: (name: string, connector: ConnectorFn) =>
        track(registry.registerConnector(name, connector)),
      registerAnchor: (name: string, anchor: AnchorFn) =>
        track(registry.registerAnchor(name, anchor)),
      registerConnectionPoint: (name: string, strategy: ConnectionPointFn) =>
        track(registry.registerConnectionPoint(name, strategy)),
      listConnectors: () => registry.listConnectors(),
      listAnchors: () => registry.listAnchors(),
      listConnectionPoints: () => registry.listConnectionPoints(),
    };
  }

  // -- routers --------------------------------------------------------------
  if (wanted.has('routers')) {
    const routing = bindings.engine.getRoutingEngine();
    capabilities.routers = {
      register(name: string, router: IRouter) {
        // NOTE: `RoutingEngine.registerRouter` THROWS on a duplicate name (it is
        // the one registry that refuses to overwrite). We keep that contract
        // rather than papering over it — but we do give back a real disposer,
        // which it never had.
        routing.registerRouter(name, router);
        return track(() => {
          routing.unregisterRouter(name);
        });
      },
      list: () => routing.getAvailableAlgorithms(),
      has: (name: string) => routing.getAvailableAlgorithms().includes(name),
    };
  }

  // -- templates ------------------------------------------------------------
  if (wanted.has('templates')) {
    // Guaranteed present: the host's `assertGrantable` refuses to register an
    // extension that declares `templates` without one bound.
    const templates = bindings.templateRegistry;
    if (!templates) {
      throw new Error("[ExtensionHost] 'templates' capability requires a TemplateRegistry");
    }
    capabilities.templates = {
      register(template: NodeTemplate) {
        templates.register(template);
        return track(() => {
          templates.unregister(template.id);
        });
      },
      list: () => templates.getAll(),
      has: (id: string) => templates.has(id),
    };
  }

  // -- animations -----------------------------------------------------------
  if (wanted.has('animations')) {
    const animations = registry.animations;
    capabilities.animations = {
      register(definition: CustomAnimationDefinition) {
        animations.register(definition);
        return track(() => {
          animations.unregister(definition.name);
        });
      },
      has: (name: string) => animations.has(name),
      list: () => animations.getAll(),
    };
  }

  // -- tools ----------------------------------------------------------------
  //
  // STILL PROCESS-GLOBAL, deliberately. `resolveTool` (pointerdown) and
  // `isValidConnection` (snapping) read these from the interaction path, which the
  // render pass's registry scope does not cover — so partitioning the storage here
  // without also scoping those readers would hide a scoped tool from the very
  // gesture it was registered for. Two diagrams still share tools and validators;
  // that is a known remaining collision, not an oversight.
  if (wanted.has('tools')) {
    capabilities.tools = {
      register: (tool: CanvasTool) => track(registerTool(tool)),
      registerConnectionValidator: (validator: ConnectionValidator) =>
        track(registerConnectionValidator(validator)),
      list: listTools,
      has: hasTool,
    };
  }

  // -- panels ---------------------------------------------------------------
  if (wanted.has('panels')) {
    const root = bindings.root;
    if (!root) {
      // The host already refused to register this extension (assertGrantable),
      // so reaching here means the bindings changed underneath us.
      throw new Error("[ExtensionHost] 'panels' capability requires a DOM root");
    }
    capabilities.panels = {
      createPanel(options) {
        const portal = createPortal(root, options);
        store.add(() => portal.dispose());
        return portal;
      },
      createViewportPanel(options) {
        const layer = bindings.htmlLayer;
        if (!layer) throw new Error("[ExtensionHost] world-space panels require the HTML layer");
        const portal = createViewportPortal(layer, options);
        store.add(() => portal.dispose());
        return portal;
      },
      createCounterScaledPanel(options) {
        const layer = bindings.htmlLayer;
        const viewport = bindings.viewport;
        if (!layer || !viewport) {
          throw new Error(
            '[ExtensionHost] counter-scaled panels require the HTML layer and the camera'
          );
        }
        const portal = createCounterScaledPortal(layer, viewport, options);
        store.add(() => portal.dispose());
        return portal;
      },
    };
  }

  return capabilities;
}
