/**
 * ============================================================================
 * Card 6 — Portals: injecting host content into the canvas
 * ============================================================================
 *
 * Two coordinate spaces, and the distinction is the whole point:
 *
 *   SCREEN SPACE (`createPortal`)      pinned to the viewport. Pans/zooms with
 *                                      NOTHING. This is what floating toolbars,
 *                                      the MiniMap and the Controls sit in.
 *
 *   WORLD SPACE (`createViewportPortal`) lives IN the diagram. Content pans and
 *                                      zooms WITH the canvas, so a DOM annotation
 *                                      stays glued to the node it labels.
 *
 * Both hand back a plain `HTMLElement` and a disposer. They deliberately do NOT
 * take VNodes: the point of a portal is to let a HOST framework own the subtree
 * (a React portal target, an Angular ViewContainerRef, a `<template>` clone), so
 * the renderer must not try to reconcile what is inside it.
 *
 * ---------------------------------------------------------------------------
 * Why the world-space portal reuses the existing HTML layer
 * ---------------------------------------------------------------------------
 * `createDiagram` already maintains an `.grafloria-html-layer` that carries the
 * camera as a CSS transform (that is how HTML/foreignObject custom nodes track
 * the canvas — see instance/layers.ts). A world-space portal is therefore not a
 * new mechanism at all: it is a child of that layer. Reusing it means the portal
 * cannot drift from custom nodes, because there is exactly one transform.
 *
 * The screen-space layer is new — and it is a SIBLING of the SVG/HTML layers,
 * NOT a child of the transformed one, which is precisely what makes it immune to
 * the camera.
 *
 * ---------------------------------------------------------------------------
 * pointer-events
 * ---------------------------------------------------------------------------
 * Both layers are `pointer-events: none` so an empty portal layer never eats a
 * click meant for the canvas underneath. Each mounted portal element turns
 * pointer events back ON for itself. This is the same rule the HTML node-host
 * layer already follows, and getting it wrong is how you end up with an
 * invisible full-canvas div swallowing every drag.
 */

import type { Disposer } from './disposable';
import { once } from './disposable';
import type { ViewportController } from '../viewport/viewport-controller';

export const SCREEN_LAYER_CLASS = 'grafloria-screen-layer';
export const PORTAL_CLASS = 'grafloria-portal';
export const WORLD_PORTAL_CLASS = 'grafloria-world-portal';

/** Corner placements for a screen-space portal. */
export type PortalPlacement =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center'
  | 'center'
  /** No positioning at all — you own `style`/`class`. */
  | 'none';

export interface PortalOptions {
  /** Where to pin it. Default `'top-left'`. */
  placement?: PortalPlacement;
  /** Offset from the placement corner, in CSS px. Default 12. */
  offset?: number;
  /** Extra class names on the portal element. */
  className?: string;
  /** Inline style appended after the placement rules (so it wins). */
  style?: string;
  /** Stacking order within the screen layer. */
  zIndex?: number;
}

export interface Portal {
  /** The element you render into. Already in the DOM. */
  readonly element: HTMLElement;
  /** Re-pin (after changing placement/offset). */
  update(options?: PortalOptions): void;
  dispose(): void;
}

export interface ViewportPortal extends Portal {
  /** Move the portal's world-space origin. */
  setPosition(x: number, y: number): void;
}

/**
 * The screen-space layer, created lazily on the diagram root. Idempotent: many
 * portals share one layer.
 */
export function ensureScreenLayer(root: HTMLElement): HTMLElement {
  const existing = root.querySelector(`:scope > .${SCREEN_LAYER_CLASS}`);
  if (existing) return existing as HTMLElement;

  const doc = root.ownerDocument;
  const layer = doc.createElement('div');
  layer.className = SCREEN_LAYER_CLASS;
  // NOT transformed — this is what "screen space" means. pointer-events:none so
  // the layer itself is invisible to the pointer; portals re-enable per element.
  layer.setAttribute(
    'style',
    'position:absolute;inset:0;pointer-events:none;overflow:hidden'
  );
  root.appendChild(layer);
  return layer;
}

function placementStyle(placement: PortalPlacement, offset: number): string {
  switch (placement) {
    case 'top-left':
      return `top:${offset}px;left:${offset}px;`;
    case 'top-right':
      return `top:${offset}px;right:${offset}px;`;
    case 'bottom-left':
      return `bottom:${offset}px;left:${offset}px;`;
    case 'bottom-right':
      return `bottom:${offset}px;right:${offset}px;`;
    case 'top-center':
      return `top:${offset}px;left:50%;transform:translateX(-50%);`;
    case 'bottom-center':
      return `bottom:${offset}px;left:50%;transform:translateX(-50%);`;
    case 'center':
      return `top:50%;left:50%;transform:translate(-50%,-50%);`;
    case 'none':
      return '';
  }
}

/**
 * Mount a SCREEN-SPACE portal — a floating panel pinned to the viewport.
 *
 * ```ts
 * const panel = createPortal(diagram.container, { placement: 'top-right' });
 * panel.element.appendChild(myToolbar);
 * // later
 * panel.dispose();
 * ```
 */
export function createPortal(root: HTMLElement, options: PortalOptions = {}): Portal {
  const layer = ensureScreenLayer(root);
  const doc = root.ownerDocument;
  const element = doc.createElement('div');

  let current: PortalOptions = { placement: 'top-left', offset: 12, ...options };

  const apply = (): void => {
    const placement = current.placement ?? 'top-left';
    const offset = current.offset ?? 12;
    element.className = [PORTAL_CLASS, current.className].filter(Boolean).join(' ');
    element.setAttribute(
      'style',
      'position:absolute;pointer-events:auto;' +
        placementStyle(placement, offset) +
        (current.zIndex !== undefined ? `z-index:${current.zIndex};` : '') +
        (current.style ?? '')
    );
  };

  apply();
  layer.appendChild(element);

  return {
    element,
    update(next?: PortalOptions) {
      if (next) current = { ...current, ...next };
      apply();
    },
    dispose: once(() => {
      element.remove();
      // Reap the shared layer once the last portal leaves, so a disposed diagram
      // does not leave an empty div behind.
      if (layer.childElementCount === 0) layer.remove();
    }),
  };
}

/**
 * Mount a WORLD-SPACE portal — content that pans and zooms WITH the canvas.
 *
 * `x`/`y` are WORLD coordinates. The element is placed inside the camera-
 * transformed HTML layer, so it needs no per-frame updates: the single transform
 * on the layer moves it. That is why this takes the layer, not the viewport, and
 * why there is no `onChange` subscription to leak.
 *
 * ```ts
 * const note = createViewportPortal(htmlLayer, { x: 320, y: 180 });
 * note.element.textContent = 'sticky note';
 * ```
 */
export function createViewportPortal(
  htmlLayer: HTMLElement,
  options: { x?: number; y?: number; className?: string; style?: string } = {}
): ViewportPortal {
  const doc = htmlLayer.ownerDocument;
  const element = doc.createElement('div');

  let x = options.x ?? 0;
  let y = options.y ?? 0;

  const apply = (): void => {
    element.className = [WORLD_PORTAL_CLASS, options.className].filter(Boolean).join(' ');
    element.setAttribute(
      'style',
      `position:absolute;left:${x}px;top:${y}px;pointer-events:auto;` + (options.style ?? '')
    );
  };

  apply();
  htmlLayer.appendChild(element);

  return {
    element,
    setPosition(nx: number, ny: number) {
      x = nx;
      y = ny;
      apply();
    },
    update() {
      apply();
    },
    dispose: once(() => {
      element.remove();
    }),
  };
}

/**
 * A world-space portal that must also stay a FIXED SCREEN SIZE (a resize handle,
 * a badge that should not grow when you zoom in). It lives in world space but
 * counter-scales by 1/zoom on every camera change.
 *
 * This one DOES subscribe, so it DOES return a disposer that unsubscribes — the
 * leak the wave-2 bug was about.
 */
export function createCounterScaledPortal(
  htmlLayer: HTMLElement,
  viewport: ViewportController,
  options: { x?: number; y?: number; className?: string; style?: string } = {}
): ViewportPortal {
  const portal = createViewportPortal(htmlLayer, options);

  const applyScale = (): void => {
    const zoom = viewport.getZoom() || 1;
    portal.element.style.transform = `scale(${1 / zoom})`;
    portal.element.style.transformOrigin = '0 0';
  };

  applyScale();
  const unsubscribe = viewport.onChange(applyScale);

  return {
    element: portal.element,
    setPosition(x: number, y: number) {
      portal.setPosition(x, y);
      applyScale();
    },
    update() {
      portal.update();
      applyScale();
    },
    dispose: once(() => {
      unsubscribe();
      portal.dispose();
    }),
  };
}
