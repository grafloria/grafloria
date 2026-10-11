/**
 * The DOM skeleton of a mounted diagram — ONE definition, used by both halves.
 *
 * The server (`renderToStaticSVG`) emits this markup as a string; the client
 * (`createDiagram`) builds the identical structure with `createElement`, or
 * ADOPTS the server's when hydrating. Any divergence between the two — a class
 * name, a style declaration, an attribute — is a hydration mismatch, so both
 * paths read the constants from here rather than each spelling them out.
 *
 *   <div class="grafloria-diagram-root" data-grafloria-instance="grafloria-1">
 *     <div class="grafloria-svg-layer">   <svg …/>  </div>   ← the deterministic part
 *     <div class="grafloria-html-layer">  …custom nodes…  </div>  ← client-only
 *   </div>
 *
 * The HTML layer holds nodes that render as framework components (React
 * portals, slotted templates). It carries the camera as a CSS transform so it
 * stays registered with the SVG layer, and is `pointer-events: none` so it does
 * not eat clicks meant for the SVG underneath — each mounted node host turns
 * pointer events back on for itself.
 */

export const ROOT_CLASS = 'grafloria-diagram-root';
export const SVG_LAYER_CLASS = 'grafloria-svg-layer';
export const HTML_LAYER_CLASS = 'grafloria-html-layer';

/** `data-grafloria-instance` — the renderer's CSS scope, mirrored onto the root. */
export const INSTANCE_ATTR = 'data-grafloria-instance';

export const ROOT_STYLE = 'position:relative;width:100%;height:100%;overflow:hidden';
export const SVG_LAYER_STYLE = 'position:absolute;top:0;left:0;width:100%;height:100%';

/**
 * The ROOT as the server emits it: the live root plus `container-type:size`, so
 * the server SVG layer below can centre itself on the container with `cq` units.
 * The root's size is its container's (100%/100%), so size containment changes
 * nothing about its box.
 */
export const SERVER_ROOT_STYLE = `${ROOT_STYLE};container-type:size`;

/**
 * The SVG layer as the SERVER emits it: the server canvas at its own size,
 * centred on the container. The adoptable `<svg>` carries no width/height (it
 * must fill the layer once live), so without this the browser scaled the server
 * picture to fit whatever box it landed in (`preserveAspectRatio` "meet") and it
 * snapped back to 1:1 on resume (v4 S9).
 *
 * Centred is where the client's first size sync keeps the camera (keep-centre),
 * and in that same callback the client resets root and layer to the live styles
 * — so adoption moves and scales nothing. The centring is a TRANSFORM on a box
 * anchored at the container's top-left, deliberately: the release then only
 * grows the box from the same corner and drops a transform, neither of which is
 * a layout shift (CLS stays 0). Without `cq` unit support the transform is
 * ignored and the picture starts top-left at 1:1 — still no scale snap.
 */
export function serverSvgLayerStyle(width: number, height: number): string {
  return (
    `position:absolute;top:0;left:0;width:${width}px;height:${height}px;` +
    `transform:translate(calc(50cqw - ${width / 2}px),calc(50cqh - ${height / 2}px))`
  );
}

/** The HTML layer's style for a given camera transform (see ViewportController). */
export function htmlLayerStyle(transform: string): string {
  return (
    'position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;' +
    `transform:${transform}`
  );
}

/** The style of one custom node's host element inside the HTML layer. */
export function nodeHostStyle(
  x: number,
  y: number,
  width: number,
  height: number
): string {
  return (
    `position:absolute;left:${x}px;top:${y}px;` +
    `width:${width}px;height:${height}px;pointer-events:auto`
  );
}
