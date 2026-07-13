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

// Card 7 — the manifest, the compat gate, and the semver matcher behind it.
export * from './manifest';

// Card 2 — the link-pipeline seams that were missing (anchors, connection
// points, connectors). The router half already existed on the RoutingEngine.
export * from './link-pipeline';

// Card 5 — the tool registry + the isValidConnection hook.
export * from './tools';

// Card 6 — portals (screen space + world space) and the drop-in components.
export * from './portal';
export * from './components/background';
export * from './components/minimap';
export * from './components/controls';
export * from './components/attach';

// NOTE: `capability-factory` is deliberately NOT exported. It is the host's
// private wiring to the real registries; an extension reaching it directly would
// bypass the capability grant, which is the whole point of Card 7.
