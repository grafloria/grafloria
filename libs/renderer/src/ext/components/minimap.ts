/**
 * ============================================================================
 * Card 6 — <MiniMap>: the overview panel. GAP CLOSED.
 * ============================================================================
 *
 * The audit's finding: "no minimap". Every competitor ships one, and its absence
 * is the first thing a side-by-side eval notices. `DiagramStore.showMinimap`
 * existed as a `false`-defaulted boolean with ZERO consumers — the flag was the
 * fossil of a feature that had never been built. It drives this component now.
 *
 * ---------------------------------------------------------------------------
 * What it draws
 * ---------------------------------------------------------------------------
 * A screen-space panel (a portal) containing an SVG whose `viewBox` is the
 * CONTENT bounding box of the diagram. Because the viewBox does the scaling, the
 * node rects are drawn in raw world coordinates — no manual scale maths, and no
 * drift between the minimap and the canvas.
 *
 * On top sits the VIEWPORT RECT: the camera's world rectangle, drawn in the same
 * coordinate system. Panning the canvas moves it; dragging it pans the canvas.
 *
 * ---------------------------------------------------------------------------
 * Interaction (this is the part that makes it a real minimap, not a picture)
 * ---------------------------------------------------------------------------
 *   click      → centre the camera on that world point
 *   drag       → pan continuously
 *   wheel      → zoom the canvas
 *
 * Screen→world for the minimap is NOT the canvas's `clientToWorld` — the minimap
 * has its own camera (its viewBox). It is inverted here from the panel's own
 * bounding rect, which is why the two never fight.
 *
 * ---------------------------------------------------------------------------
 * Cost
 * ---------------------------------------------------------------------------
 * Redrawing every node rect on every camera change would make panning O(nodes)
 * for no reason — the nodes have not moved. So the node layer is rebuilt ONLY on
 * model change, while the camera rect is updated on viewport change. Panning a
 * 5,000-node diagram therefore touches exactly one `<rect>`.
 */

import type { DiagramModel, NodeModel } from '@grafloria/engine';
import type { Disposer } from '../disposable';
import { once } from '../disposable';
import type { ViewportController } from '../../viewport/viewport-controller';
import type { Portal } from '../portal';
import { createPortal } from '../portal';
import type { PortalPlacement } from '../portal';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface MiniMapOptions {
  placement?: PortalPlacement;
  offset?: number;
  width?: number;
  height?: number;
  /** Padding (world units) around the content in the minimap's viewBox. */
  padding?: number;
  /** Node fill. A function lets you colour-code by type/state. */
  nodeColor?: string | ((node: NodeModel) => string);
  /** Fill of the camera rectangle. */
  maskColor?: string;
  /** Stroke of the camera rectangle. */
  maskStroke?: string;
  panelBackground?: string;
  panelBorder?: string;
  /** Allow click/drag-to-pan and wheel-to-zoom. Default true. */
  interactive?: boolean;
  /** Draw links too. Default false (nodes carry the shape of a diagram). */
  showLinks?: boolean;
  linkColor?: string;
  /** ARIA label on the panel. */
  ariaLabel?: string;
}

export interface MiniMapHandle {
  readonly portal: Portal;
  readonly element: SVGSVGElement;
  /** Rebuild the node layer (call when the model changed). */
  refresh(): void;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  update(options: Partial<MiniMapOptions>): void;
  dispose(): void;
}

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function contentBoundsOf(model: DiagramModel, padding: number): Bounds | null {
  const nodes = model.getNodes().filter((n: NodeModel) => n.state?.visible !== false);
  if (nodes.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const node of nodes) {
    const p = typeof node.getWorldPosition === 'function' ? node.getWorldPosition() : node.position;
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x + node.size.width);
    bottom = Math.max(bottom, p.y + node.size.height);
  }
  if (!Number.isFinite(left)) return null;

  return {
    x: left - padding,
    y: top - padding,
    w: Math.max(1, right - left + padding * 2),
    h: Math.max(1, bottom - top + padding * 2),
  };
}

export function createMiniMap(
  root: HTMLElement,
  viewport: ViewportController,
  getModel: () => DiagramModel,
  options: MiniMapOptions = {}
): MiniMapHandle {
  const doc = root.ownerDocument;

  let opts: Required<
    Pick<
      MiniMapOptions,
      | 'placement'
      | 'offset'
      | 'width'
      | 'height'
      | 'padding'
      | 'maskColor'
      | 'maskStroke'
      | 'panelBackground'
      | 'panelBorder'
      | 'interactive'
      | 'showLinks'
      | 'linkColor'
      | 'ariaLabel'
    >
  > &
    Pick<MiniMapOptions, 'nodeColor'> = {
    placement: options.placement ?? 'bottom-right',
    offset: options.offset ?? 12,
    width: options.width ?? 200,
    height: options.height ?? 150,
    padding: options.padding ?? 40,
    maskColor: options.maskColor ?? 'rgba(80,130,220,0.18)',
    maskStroke: options.maskStroke ?? 'rgba(60,110,200,0.9)',
    panelBackground: options.panelBackground ?? 'rgba(250,250,252,0.92)',
    panelBorder: options.panelBorder ?? 'rgba(0,0,0,0.15)',
    interactive: options.interactive ?? true,
    showLinks: options.showLinks ?? false,
    linkColor: options.linkColor ?? 'rgba(120,130,145,0.6)',
    ariaLabel: options.ariaLabel ?? 'Diagram minimap',
    nodeColor: options.nodeColor,
  };

  const portal = createPortal(root, {
    placement: opts.placement,
    offset: opts.offset,
    className: 'grafloria-minimap',
  });

  const applyPanelStyle = (): void => {
    portal.element.style.width = `${opts.width}px`;
    portal.element.style.height = `${opts.height}px`;
    portal.element.style.background = opts.panelBackground;
    portal.element.style.border = `1px solid ${opts.panelBorder}`;
    portal.element.style.borderRadius = '4px';
    portal.element.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
    portal.element.style.overflow = 'hidden';
    portal.element.style.cursor = opts.interactive ? 'pointer' : 'default';
  };
  applyPanelStyle();

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('class', 'grafloria-minimap-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', opts.ariaLabel);
  svg.style.display = 'block';

  const linkLayer = doc.createElementNS(SVG_NS, 'g');
  linkLayer.setAttribute('class', 'grafloria-minimap-links');
  const nodeLayer = doc.createElementNS(SVG_NS, 'g');
  nodeLayer.setAttribute('class', 'grafloria-minimap-nodes');
  const cameraRect = doc.createElementNS(SVG_NS, 'rect');
  cameraRect.setAttribute('class', 'grafloria-minimap-viewport');
  cameraRect.setAttribute('pointer-events', 'none');

  svg.appendChild(linkLayer);
  svg.appendChild(nodeLayer);
  svg.appendChild(cameraRect);
  portal.element.appendChild(svg);

  let visible = true;
  /** The world box the minimap's viewBox currently shows. */
  let bounds: Bounds | null = null;

  const nodeFill = (node: NodeModel): string => {
    const c = opts.nodeColor;
    if (typeof c === 'function') return c(node);
    if (typeof c === 'string') return c;
    // NOTE: NodeState is an OBJECT (`{ visible, locked, selected, … }`), unlike
    // LinkModel.state which is a STRING enum. Comparing `node.state ===
    // 'selected'` — the idiom the link code uses — is always false.
    return node.state?.selected ? 'rgba(60,110,200,0.95)' : 'rgba(140,150,165,0.85)';
  };

  /**
   * Rebuild the viewBox + the node/link layers. Model-change only — NOT called
   * on pan/zoom (see the cost note in the header).
   */
  const refresh = (): void => {
    if (!visible) return;
    const model = getModel();
    bounds = contentBoundsOf(model, opts.padding);

    while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
    while (linkLayer.firstChild) linkLayer.removeChild(linkLayer.firstChild);

    if (!bounds) {
      // Empty diagram: nothing to show, and a 0-width viewBox is invalid.
      svg.removeAttribute('viewBox');
      cameraRect.setAttribute('width', '0');
      cameraRect.setAttribute('height', '0');
      return;
    }

    svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
    // Match the canvas's aspect handling: never distort the picture.
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    if (opts.showLinks) {
      for (const link of model.getLinks()) {
        const pts = link.points;
        if (!pts || pts.length < 2) continue;
        const line = doc.createElementNS(SVG_NS, 'polyline');
        line.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', opts.linkColor);
        // Keep hairlines visible regardless of how big the content box is.
        line.setAttribute('stroke-width', String(Math.max(1, bounds.w / 300)));
        linkLayer.appendChild(line);
      }
    }

    for (const node of model.getNodes()) {
      if (node.state?.visible === false) continue;
      const p = typeof node.getWorldPosition === 'function' ? node.getWorldPosition() : node.position;
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(p.x));
      rect.setAttribute('y', String(p.y));
      rect.setAttribute('width', String(Math.max(1, node.size.width)));
      rect.setAttribute('height', String(Math.max(1, node.size.height)));
      rect.setAttribute('rx', '2');
      rect.setAttribute('fill', nodeFill(node));
      rect.setAttribute('data-node-id', node.id);
      nodeLayer.appendChild(rect);
    }

    drawCamera();
  };

  /** Cheap: one rect. Runs on every camera change. */
  const drawCamera = (): void => {
    if (!visible || !bounds) return;
    // getViewBox(), NOT getViewport(): the viewport's width/height are CSS-pixel
    // spans, the VISIBLE WORLD rect divides them by zoom. Copying the raw
    // viewport made the tinted camera rect zoom-blind — at zoom 1.44 it still
    // claimed the whole scene while the canvas showed ~60% of it (live audit).
    const v = viewport.getViewBox();
    cameraRect.setAttribute('x', String(v.x));
    cameraRect.setAttribute('y', String(v.y));
    cameraRect.setAttribute('width', String(Math.max(0, v.width)));
    cameraRect.setAttribute('height', String(Math.max(0, v.height)));
    cameraRect.setAttribute('fill', opts.maskColor);
    cameraRect.setAttribute('stroke', opts.maskStroke);
    // Constant visual weight regardless of content scale.
    cameraRect.setAttribute('stroke-width', String(Math.max(1, bounds.w / 200)));
  };

  // -- interaction ------------------------------------------------------------
  //
  // The minimap has its OWN camera (the viewBox + preserveAspectRatio letterbox).
  // Inverting it by hand is the only way to turn a click into a world point; the
  // canvas's clientToWorld would answer for a different camera entirely.
  const clientToMiniWorld = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!bounds) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;

    // 'meet' letterboxes: the content scale is the SMALLER of the two ratios,
    // and the unused axis is centred (xMidYMid).
    const scale = Math.min(r.width / bounds.w, r.height / bounds.h);
    const drawnW = bounds.w * scale;
    const drawnH = bounds.h * scale;
    const padX = (r.width - drawnW) / 2;
    const padY = (r.height - drawnH) / 2;

    return {
      x: bounds.x + (clientX - r.left - padX) / scale,
      y: bounds.y + (clientY - r.top - padY) / scale,
    };
  };

  /** Centre the canvas camera on a world point. */
  const centreOn = (world: { x: number; y: number }): void => {
    // World-rect maths — see drawCamera: spans must be the view box's, or the
    // centring lands offset whenever zoom != 1.
    const vp = viewport.getViewport();
    const vb = viewport.getViewBox();
    viewport.setViewport({
      x: world.x - vb.width / 2,
      y: world.y - vb.height / 2,
      width: vp.width,
      height: vp.height,
    });
  };

  let dragging = false;

  const onPointerDown = (event: PointerEvent): void => {
    if (!opts.interactive) return;
    const world = clientToMiniWorld(event.clientX, event.clientY);
    if (!world) return;
    dragging = true;
    // Capture on the SVG so a drag that leaves the little panel keeps panning —
    // without capture the camera would stick the moment the pointer exits.
    svg.setPointerCapture?.(event.pointerId);
    centreOn(world);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || !opts.interactive) return;
    const world = clientToMiniWorld(event.clientX, event.clientY);
    if (!world) return;
    centreOn(world);
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    svg.releasePointerCapture?.(event.pointerId);
  };

  const onWheel = (event: WheelEvent): void => {
    if (!opts.interactive) return;
    // Zoom the CANVAS about its own centre. Zooming about the minimap cursor
    // would be a lie: the canvas is not showing that point.
    viewport.zoomByWheel(event.deltaY);
    event.preventDefault();
    event.stopPropagation();
  };

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('wheel', onWheel, { passive: false });

  refresh();
  const unsubscribeViewport = viewport.onChange(drawCamera);

  return {
    portal,
    element: svg,
    refresh,
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      portal.element.style.display = next ? 'block' : 'none';
      if (next) refresh();
    },
    isVisible: () => visible,
    update(next: Partial<MiniMapOptions>) {
      opts = { ...opts, ...next };
      applyPanelStyle();
      portal.update({ placement: opts.placement, offset: opts.offset });
      svg.setAttribute('aria-label', opts.ariaLabel);
      refresh();
    },
    dispose: once(() => {
      unsubscribeViewport();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', endDrag);
      svg.removeEventListener('pointercancel', endDrag);
      svg.removeEventListener('wheel', onWheel);
      portal.dispose();
    }),
  };
}
