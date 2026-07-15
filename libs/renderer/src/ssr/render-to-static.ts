import { DiagramEngine } from '@grafloria/engine';
import type { Theme } from '../types/theme.types';
import { SVGRenderer } from '../svg/svg-renderer';
import { ViewportController } from '../viewport/viewport-controller';
import { applyEdges, applyNodes } from '../instance/model-input';
import type { EdgeSpec, NodeSpec } from '../instance/model-input';
import {
  HTML_LAYER_CLASS,
  ROOT_CLASS,
  ROOT_STYLE,
  SVG_LAYER_CLASS,
  SVG_LAYER_STYLE,
  htmlLayerStyle,
} from '../instance/layers';
import { serializeVNode } from '../export/vnode-serializer';

/**
 * Card 6 — the deterministic SERVER path.
 *
 * `renderToStaticSVG()` runs the real `DiagramEngine` + the real `SVGRenderer`
 * in Node, with no DOM anywhere, and returns:
 *
 *   - `html`     — the exact markup `createDiagram()` would have mounted,
 *   - `svg`      — just the `<svg>` (for an `<img>`, an email, a README),
 *   - `snapshot` — the four values the client must reuse to reproduce the same
 *                  VNode tree byte-for-byte: instance scope, canvas size, camera
 *                  origin and zoom.
 *
 * Hand the snapshot back to `createDiagram(el, { hydrate: snapshot })` and the
 * client rebuilds the same model, renders the same VNodes, and ADOPTS the DOM
 * that is already on the page — no re-creation, no flash, no re-layout. The
 * competitors either punt on SSR entirely (React Flow is `'use client'`-only) or
 * server-render something that can never become interactive (Mermaid).
 *
 * ## What makes it deterministic
 *
 * - ids: `node-<i>` / `edge-<i>` when the spec omits them (never a nanoid);
 * - ports: rewritten to `<nodeId>__<side>` (the engine's auto-ports are nanoids
 *   and the renderer emits them as VNode keys) — see `instance/model-input.ts`;
 * - instance scope: `instanceId` is fixed here and echoed in the snapshot,
 *   because the renderer's fallback counter restarts in every process;
 * - camera: the snapshot carries width/height/zoom/origin, so the client's
 *   `viewBox` is identical even before it has measured the container.
 *
 * ## Scope (stated plainly)
 *
 * Custom / HTML-layer nodes are NOT server-rendered: they are framework
 * components, and the server has no framework. They mount on hydration, inside
 * the (empty, correctly-transformed) HTML layer this emits. Everything the SVG
 * renderer draws — nodes, ports, edges, labels, arrows, routing — IS in the
 * snapshot, which is the part that would otherwise re-layout.
 */

export interface StaticRenderOptions {
  nodes?: NodeSpec[];
  edges?: EdgeSpec[];
  theme?: Theme;
  /** Canvas width in CSS px. Default 800. */
  width?: number;
  /** Canvas height in CSS px. Default 600. */
  height?: number;
  zoom?: number;
  /** Camera origin in world coordinates. Default (0, 0). */
  viewport?: { x: number; y: number };
  /**
   * CSS scope for this diagram. Default `'grafloria-ssr'`. Give each diagram on a
   * page its own id if you server-render more than one.
   */
  instanceId?: string;
  /** Frame the content instead of using `viewport`/`zoom`. Default false. */
  fitView?: boolean;
  /** Padding (CSS px) for `fitView`. Default 40. */
  fitPadding?: number;
  /** Add `xmlns` to the `<svg>` so it stands alone as a file. Default false. */
  standalone?: boolean;
}

/** Everything the client needs to reproduce this render exactly. */
export interface HydrationSnapshot {
  instanceId: string;
  width: number;
  height: number;
  zoom: number;
  viewport: { x: number; y: number };
}

export interface StaticRenderResult {
  /** The full layer skeleton — drop this straight into your container. */
  html: string;
  /** Only the `<svg>` element. */
  svg: string;
  /**
   * The stylesheet the diagram needs. In CSS mode the theme is expressed purely
   * as `--grafloria-*` variables, so the SVG above is theme-INDEPENDENT (which is
   * what makes hydration a no-op) — but it is also unstyled until this CSS is on
   * the page. Ship it in a `<style>` tag; the client re-injects identical content
   * under the same ids, so nothing repaints.
   */
  css: string;
  snapshot: HydrationSnapshot;
}

export function renderToStaticSVG(options: StaticRenderOptions = {}): StaticRenderResult {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const instanceId = options.instanceId ?? 'grafloria-ssr';

  const engine = new DiagramEngine();
  const model = engine.createDiagram('grafloria-ssr');

  applyNodes(model, options.nodes ?? []);
  applyEdges(model, options.edges ?? []);

  const viewport = new ViewportController({
    viewport: {
      x: options.viewport?.x ?? 0,
      y: options.viewport?.y ?? 0,
      width,
      height,
    },
    zoom: options.zoom ?? 1,
  });

  if (options.fitView) {
    const bounds = contentBoundsOf(model);
    if (bounds) viewport.fitToBounds(bounds, options.fitPadding ?? 40);
  }

  // `useCSSMode` stays ON: the renderer's document access is now guarded
  // (see SVGRenderer.injectThemeCSS), so the VNode tree the server produces is
  // the SAME tree the browser produces — which is the whole point.
  const renderer = new SVGRenderer(engine, { instanceId }, options.theme);
  const vnode = renderer.render(viewport.getRenderViewport(), viewport.getZoom());
  // A static artifact must SIZE ITSELF: the live path leaves width/height to the
  // host's CSS, but an email, a README or a bare <img> cannot add CSS — without
  // these the svg renders 0×0 (the audit's "blank page with a stray dot").
  vnode.props = { ...vnode.props, width: options.width ?? 800, height: options.height ?? 600 };
  // ONE serializer, in DOM fidelity: the snapshot must describe exactly the DOM the
  // client's VNodePatcher would build, or hydration rebuilds the tree and flashes.
  // (The same function in 'file' fidelity is what `export/` uses for standalone SVG.)
  const svg = serializeVNode(vnode, { fidelity: 'dom', standalone: options.standalone });
  const css = renderer.getStyleSheet();

  renderer.dispose();
  engine.destroy();

  const snapshot: HydrationSnapshot = {
    instanceId,
    width,
    height,
    zoom: viewport.getZoom(),
    viewport: { x: viewport.getViewport().x, y: viewport.getViewport().y },
  };

  return { html: wrapInLayers(svg, instanceId), svg, css, snapshot };
}

/** The markup `createDiagram()`'s `ensureLayers()` builds — as a string. */
function wrapInLayers(svg: string, instanceId: string): string {
  return (
    `<div class="${ROOT_CLASS}" style="${ROOT_STYLE}" data-grafloria-instance="${instanceId}">` +
    `<div class="${SVG_LAYER_CLASS}" style="${SVG_LAYER_STYLE}">${svg}</div>` +
    `<div class="${HTML_LAYER_CLASS}" style="${htmlLayerStyle(
      'translate(0px, 0px) scale(1)'
    )}"></div>` +
    `</div>`
  );
}

function contentBoundsOf(
  model: ReturnType<DiagramEngine['createDiagram']>
): { x: number; y: number; width: number; height: number } | null {
  const nodes = model.getNodes();
  if (nodes.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + node.size.width);
    bottom = Math.max(bottom, node.position.y + node.size.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
