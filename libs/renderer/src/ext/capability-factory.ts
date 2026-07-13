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
 */

import {
  registerShape,
  registerPathShape,
  unregisterShape,
  getShapeDefinition,
  hasShape,
  listShapes,
} from '../svg/shape-registry';
import type { ShapeDefinition, PathGeometry, PathShapeOptions } from '../svg/shape-registry';
import {
  registerLinkTemplate,
  registerLabelTemplate,
  registerMarker,
  unregisterLinkTemplate,
  unregisterLabelTemplate,
  unregisterMarker,
  getLinkTemplate,
  getLabelTemplate,
  getMarker,
} from '../svg/edge-templates';
import type { LinkTemplate, LabelTemplate, MarkerDefinition } from '../svg/edge-templates';
import {
  registerAnchor,
  registerConnectionPoint,
  registerConnector,
  listAnchors,
  listConnectionPoints,
  listConnectors,
} from './link-pipeline';
import type { AnchorFn, ConnectionPointFn, ConnectorFn } from './link-pipeline';
import { getGlobalCustomAnimationRegistry } from '../services/custom-animation-registry';
import type { CustomAnimationDefinition } from '../services/custom-animation-registry';
import { registerTool, registerConnectionValidator, listTools, hasTool } from './tools';
import type { CanvasTool, ConnectionValidator } from './tools';
import { createPortal, createViewportPortal, createCounterScaledPortal } from './portal';
import type { CapabilityName, ExtensionCapabilities, HostBindings } from './capabilities';
import type { DisposableStore } from './disposable';
import { snapshotRestore } from './disposable';
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

  // -- shapes ---------------------------------------------------------------
  if (wanted.has('shapes')) {
    capabilities.shapes = {
      register(type: string, definition: Omit<ShapeDefinition, 'type'> & { type?: string }) {
        const previous = getShapeDefinition(type);
        registerShape(type, definition);
        return track(
          snapshotRestore(
            previous,
            (value) => registerShape(type, value),
            () => unregisterShape(type)
          )
        );
      },
      registerPath(type: string, geometry: PathGeometry, options?: PathShapeOptions) {
        const previous = getShapeDefinition(type);
        registerPathShape(type, geometry, options);
        return track(
          snapshotRestore(
            previous,
            (value) => registerShape(type, value),
            () => unregisterShape(type)
          )
        );
      },
      has: hasShape,
      list: listShapes,
    };
  }

  // -- links ----------------------------------------------------------------
  if (wanted.has('links')) {
    capabilities.links = {
      registerTemplate(name: string, template: LinkTemplate) {
        const previous = getLinkTemplate(name);
        registerLinkTemplate(name, template);
        return track(
          snapshotRestore(
            previous,
            (value) => registerLinkTemplate(name, value),
            () => unregisterLinkTemplate(name)
          )
        );
      },
      registerLabelTemplate(name: string, template: LabelTemplate) {
        const previous = getLabelTemplate(name);
        registerLabelTemplate(name, template);
        return track(
          snapshotRestore(
            previous,
            (value) => registerLabelTemplate(name, value),
            () => unregisterLabelTemplate(name)
          )
        );
      },
      registerMarker(name: string, definition: MarkerDefinition) {
        const previous = getMarker(name);
        registerMarker(name, definition);
        return track(
          snapshotRestore(
            previous,
            (value) => registerMarker(name, value),
            () => unregisterMarker(name)
          )
        );
      },
      // These three already return restore-on-dispose disposers of their own.
      registerConnector: (name: string, connector: ConnectorFn) =>
        track(registerConnector(name, connector)),
      registerAnchor: (name: string, anchor: AnchorFn) => track(registerAnchor(name, anchor)),
      registerConnectionPoint: (name: string, strategy: ConnectionPointFn) =>
        track(registerConnectionPoint(name, strategy)),
      listConnectors,
      listAnchors,
      listConnectionPoints,
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
    const animations = getGlobalCustomAnimationRegistry();
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
