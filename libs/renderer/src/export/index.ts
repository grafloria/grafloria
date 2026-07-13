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
export * from './style-flattener';
export * from './vnode-serializer';
export * from './svg-export';
export * from './raster';
