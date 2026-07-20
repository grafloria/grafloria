// Deterministic headless export: VNode → standalone SVG (→ PNG / JPEG / WebP).
//
// The renderer is already a pure VNode producer, so ONE serializer yields both the
// live client picture (via vnode/patch.ts) and a server-side thumbnail from the
// very same tree — no second rendering path, no drift.
//
// Entry points:
//   exportSvg(vnode, opts)      pure, zero-DOM, deterministic → standalone SVG
//   serializeVNode(vnode, opts) the VNode → XML primitive underneath it
//   resolveRasterBackend(…)     the PNG/JPEG/WebP seam (browser canvas by default)
//   SVGRenderer.export(fmt)     the wired IRenderer.export contract
//   vnodeBounds(root)           the content-tight bbox of what is actually DRAWN
export * from './style-flattener';
export * from './vnode-serializer';
export * from './bounds';
export * from './scope';
export * from './round-trip';
export * from './assets';
export * from './svg-export';
export * from './custom-nodes';
export * from './capture-host';
export * from './raster';
export * from './node-raster';
export * from './pagination';
export * from './pdf';
export * from './batch';
