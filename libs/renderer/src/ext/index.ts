/**
 * ============================================================================
 * @grafloria/renderer — the EXTENSION API (Wave 6)
 * ============================================================================
 *
 * The public, semver'd seam for everything a host can add to the engine. One
 * entry point, typed capability grants, and a disposer on every registration.
 *
 * ```ts
 * import { createDiagram, createExtensionHost, attachCanvasPlugins } from '@grafloria/renderer';
 *
 * const diagram = createDiagram(el, { nodes, edges });
 *
 * // The drop-in components (Card 6) — background grid, minimap, controls.
 * const plugins = attachCanvasPlugins(diagram, {
 *   background: { variant: 'dots', gap: 20 },
 *   minimap: true,
 *   controls: true,
 * });
 *
 * // A capability-scoped extension (Cards 0 + 7).
 * const host = createExtensionHost({
 *   engine: diagram.getEngine(),
 *   root: diagram.container,
 *   requestRender: () => diagram.render(),
 * });
 *
 * host.register({
 *   manifest: {
 *     id: 'acme.stars',
 *     version: '1.0.0',
 *     engines: { grafloria: '^1.0.0' },
 *     capabilities: ['shapes', 'links'],   // ← the ENFORCED grant
 *     contributes: { shapes: ['star'], connectors: ['zigzag'] },
 *   },
 *   activate({ capabilities }) {
 *     capabilities.shapes.registerPath('star', starPath);
 *     capabilities.links.registerConnector('zigzag', ({ points }) => zigzag(points));
 *     // capabilities.routers is NOT here — the manifest did not ask for it.
 *   },
 * });
 * ```
 *
 * Everything above is undone by `host.dispose('acme.stars')` — including shapes
 * that OVERRODE a built-in, which are restored rather than deleted.
 */

// Card 0 — the host + the typed capability contract.
export * from './extension-host';
export * from './capabilities';
export * from './disposable';

// PER-DIAGRAM REGISTRIES. The contribution registries used to be module-scope
// Maps — one process, one vocabulary — so two diagrams on one page could not
// disagree about what a shape name meant, and one diagram's extension teardown
// stripped the other's registration. `diagram.registry` is one diagram's own
// table; the module-level `registerShape()` / `defineStyle()` / … are still the
// process-wide one, and a diagram falls through to it for every name it did not
// claim itself.
export * from './registry-scope';
export * from './diagram-registry';

// Card 7 — the manifest, the compat gate, and the semver matcher behind it.
export * from './manifest';

// Card 2 — the link-pipeline seams that were missing (anchors, connection
// points, connectors). The router half already existed on the RoutingEngine.
export * from './link-pipeline';

// Card 5 — the tool registry + the isValidConnection hook.
export * from './tools';

// Card 4 — the documented public reactive + imperative surface over the
// ViewportController / InteractionController / createDiagram machinery waves 3-4
// already shipped. A named API, not a new engine.
export * from './public-api';

// Card 3 — the framework-agnostic node-component authoring contract (typed
// props, lifecycle, MEASURED SIZE) on top of wave 4's renderCustomNode hook.
export * from './node-component';

// Card 6 — portals (screen space + world space) and the drop-in components.
export * from './portal';
export * from './components/background';
export * from './components/minimap';
export * from './components/controls';
export * from './components/attach';

// NOTE: `capability-factory` is deliberately NOT exported. It is the host's
// private wiring to the real registries; an extension reaching it directly would
// bypass the capability grant, which is the whole point of Card 7.
// Lazy entry for the plugin chain — what the framework wrappers use, so
// consumers who never mount plugins ship none of this chain.
export { loadCanvasPlugins } from './plugins-loader';
