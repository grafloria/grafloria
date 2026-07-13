/**
 * ============================================================================
 * Card 6 — <Controls>: the zoom / fit / lock toolbar
 * ============================================================================
 *
 * A screen-space portal with the four buttons every canvas product ships. It is
 * deliberately thin: each button is one call into `ViewportController` (or the
 * `onFitView` / `onToggleLock` callbacks the host supplies), so there is no
 * duplicate camera maths here to drift from the canvas's own.
 *
 * Framework-free (plain DOM, zero Angular), keyboard-reachable (real `<button>`
 * elements, so Tab/Enter/Space work with no ARIA gymnastics), and every listener
 * it adds is removed by `dispose()`.
 *
 * NOTE ON A11Y: this only uses the semantics that come free with a native
 * `<button>` (focusability, Enter/Space activation, `aria-label`, `aria-pressed`
 * for the lock toggle). The ARIA/live-region emission for the CANVAS itself is
 * `wave6/a11y`'s territory and is not touched here.
 */

import type { Disposer } from '../disposable';
import { once } from '../disposable';
import type { ViewportController } from '../../viewport/viewport-controller';
import type { Portal, PortalPlacement } from '../portal';
import { createPortal } from '../portal';

export interface ControlsOptions {
  placement?: PortalPlacement;
  offset?: number;
  /** Which buttons to show. Default: all except lock. */
  showZoom?: boolean;
  showFitView?: boolean;
  showLock?: boolean;
  /** Lay the buttons out horizontally instead of vertically. */
  orientation?: 'vertical' | 'horizontal';
  /** Zoom step per click (multiplicative). Default 1.2. */
  zoomStep?: number;
  /** Called when "fit view" is pressed. Wire this to `instance.fitView()`. */
  onFitView?: () => void;
  /** Called when the lock is toggled. Return/ignore as you like. */
  onToggleLock?: (locked: boolean) => void;
  /** Initial lock state. */
  locked?: boolean;
}

export interface ControlsHandle {
  readonly portal: Portal;
  readonly element: HTMLElement;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  /** Reflect a lock state changed elsewhere (keeps `aria-pressed` honest). */
  setLocked(locked: boolean): void;
  dispose(): void;
}

/** Minimal inline SVG icons — no icon-font dependency, no external fetch. */
const ICONS = {
  zoomIn: '<path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  zoomOut: '<path d="M3 7h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  fit: '<path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  lock: '<path d="M4 6V4.5a3 3 0 0 1 6 0V6M3 6h8v6H3z" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  unlock: '<path d="M4 6V4.5a3 3 0 0 1 5.7-1.3M3 6h8v6H3z" stroke="currentColor" stroke-width="1.3" fill="none"/>',
} as const;

export function createControls(
  root: HTMLElement,
  viewport: ViewportController,
  options: ControlsOptions = {}
): ControlsHandle {
  const doc = root.ownerDocument;

  const opts: Required<Pick<ControlsOptions, 'placement' | 'offset' | 'showZoom' | 'showFitView' | 'showLock' | 'orientation' | 'zoomStep'>> &
    Pick<ControlsOptions, 'onFitView' | 'onToggleLock'> = {
    placement: options.placement ?? 'bottom-left',
    offset: options.offset ?? 12,
    showZoom: options.showZoom ?? true,
    showFitView: options.showFitView ?? true,
    showLock: options.showLock ?? false,
    orientation: options.orientation ?? 'vertical',
    zoomStep: options.zoomStep ?? 1.2,
    onFitView: options.onFitView,
    onToggleLock: options.onToggleLock,
  };

  let locked = options.locked ?? false;
  let visible = true;

  const portal = createPortal(root, {
    placement: opts.placement,
    offset: opts.offset,
    className: 'grafloria-controls',
  });

  const bar = doc.createElement('div');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Diagram controls');
  bar.setAttribute(
    'style',
    'display:flex;gap:1px;background:rgba(0,0,0,0.12);border-radius:4px;overflow:hidden;' +
      `flex-direction:${opts.orientation === 'horizontal' ? 'row' : 'column'};`
  );
  portal.element.appendChild(bar);

  const cleanups: Disposer[] = [];

  const makeButton = (
    icon: string,
    label: string,
    onClick: () => void
  ): HTMLButtonElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute(
      'style',
      'width:26px;height:26px;display:flex;align-items:center;justify-content:center;' +
        'border:0;padding:0;cursor:pointer;background:#fff;color:#333;'
    );
    button.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">${icon}</svg>`;

    const handler = (event: MouseEvent): void => {
      // The canvas below listens for mousedown/click on the container; without
      // this a control press would ALSO deselect / start a marquee behind it.
      event.preventDefault();
      event.stopPropagation();
      onClick();
    };
    button.addEventListener('click', handler);
    // Stop the press reaching the canvas's pointer ladder as well.
    const swallow = (event: Event): void => event.stopPropagation();
    button.addEventListener('pointerdown', swallow);
    button.addEventListener('mousedown', swallow);

    cleanups.push(() => {
      button.removeEventListener('click', handler);
      button.removeEventListener('pointerdown', swallow);
      button.removeEventListener('mousedown', swallow);
    });

    bar.appendChild(button);
    return button;
  };

  if (opts.showZoom) {
    makeButton(ICONS.zoomIn, 'Zoom in', () => {
      viewport.setZoom(viewport.getZoom() * opts.zoomStep);
    });
    makeButton(ICONS.zoomOut, 'Zoom out', () => {
      viewport.setZoom(viewport.getZoom() / opts.zoomStep);
    });
  }

  if (opts.showFitView) {
    makeButton(ICONS.fit, 'Fit view', () => {
      opts.onFitView?.();
    });
  }

  let lockButton: HTMLButtonElement | undefined;
  const paintLock = (): void => {
    if (!lockButton) return;
    lockButton.setAttribute('aria-pressed', String(locked));
    lockButton.setAttribute('aria-label', locked ? 'Unlock canvas' : 'Lock canvas');
    lockButton.title = locked ? 'Unlock canvas' : 'Lock canvas';
    lockButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">${
      locked ? ICONS.lock : ICONS.unlock
    }</svg>`;
    lockButton.style.background = locked ? '#e8eefc' : '#fff';
  };

  if (opts.showLock) {
    lockButton = makeButton(ICONS.unlock, 'Lock canvas', () => {
      locked = !locked;
      paintLock();
      opts.onToggleLock?.(locked);
    });
    paintLock();
  }

  return {
    portal,
    element: bar,
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      portal.element.style.display = next ? 'block' : 'none';
    },
    isVisible: () => visible,
    setLocked(next: boolean) {
      locked = next;
      paintLock();
    },
    dispose: once(() => {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
      portal.dispose();
    }),
  };
}
