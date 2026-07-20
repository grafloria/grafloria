// Wave 8 — Card 3: deferred / lazy view instantiation, freeze, and the
// time-sliced async mount that keeps a 10k-node graph from freezing the tab for
// 6.8 seconds before it shows the user anything.
//
//     const lifecycle = new ViewLifecycle({ autoFreeze: true });
//     renderer.setViewLifecycle(lifecycle);
//
//     const mounter = new ProgressiveMounter(
//       engine,
//       lifecycle,
//       (vp, zoom) => patcher.reconcile(svg, renderer.render(vp, zoom)),
//       () => renderer.getDeferredEntities()
//     );
//     await mounter.mount(viewport, 1);   // paints in ~5ms, fills in over rAF slices

export { ViewLifecycle } from './view-lifecycle';
export type { ViewLifecycleOptions } from './view-lifecycle';

export { ProgressiveMounter } from './progressive-mounter';
export type {
  DeferredQuery,
  MountFrame,
  ProgressiveMountOptions,
} from './progressive-mounter';

export type { EntityKind, MountGate, MountStats } from './types';

// Viewport culling for CUSTOM (HTML-layer) node hosts — the one layer that was never
// culled, so a 400-widget board paid for 400 mounted divs to show three. Opt in through
// `createDiagram({ cullCustomNodes: true })`; the class is exported for hosts that drive
// the host lifecycle themselves.
export { HtmlHostCuller } from './host-culling';
export type { FreezeQuery, HostCullMode, HostCullOptions } from './host-culling';
