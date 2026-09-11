/** The drag handle — the caption strip, a selector, or a painted grip — and the press test for it (tile first, step 4b-i: out of the binder). */

/** A painted grip: the only drag zone, placed along the card's top edge. */
export interface DragGripOptions {
  grip: true;
  /** Where along the top edge. Default 'left'. */
  position?: 'left' | 'center' | 'right';
  /** In the header band, or a tab above the card. Default 'inside'. */
  placement?: 'inside' | 'outside';
}
export type DragHandleOption = boolean | string | DragGripOptions;

/** The class of the painted grip element (a child of the node host). */
export const GRIP_CLASS = 'axdb-grip';
/** The container class that turns the caption strip's grip dots on. */
export const DRAG_HANDLE_CLASS = 'axdb-drag-handle';
/** The caption strip of a host with no kit header, px from the card's top. */
export const CAPTION_BAND = 28;

/** A `dragHandle` value with its defaults filled in — the form the handle reports. */
export const normalizeDragHandle = (v: DragHandleOption | undefined): DragHandleOption =>
  typeof v === 'object' && v !== null && v.grip
    ? { grip: true, position: v.position ?? 'left', placement: v.placement ?? 'inside' }
    : v === true ? true : typeof v === 'string' && v.length > 0 ? v : false;
/** The selector a `dragHandle` value names — `null` when the whole card is the handle. */
export const dragHandleSelector = (v: DragHandleOption): string | null =>
  v === true ? '.axdb-widget-h' : typeof v === 'string' ? v : typeof v === 'object' ? '.' + GRIP_CLASS : null;
/** The grip config of a value, or null when it paints no grip. */
export const gripOf = (v: DragHandleOption): DragGripOptions | null => (typeof v === 'object' ? v : null);
export const sameDragHandle = (a: DragHandleOption, b: DragHandleOption): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Paint (or remove) the grip on one host, and stamp the host with the grip's
 * placement so the header can make room for it. `movable` false = no grip.
 */
export function syncGrip(host: HTMLElement, cfg: DragGripOptions | null, movable: boolean): void {
  const existing = host.querySelector(':scope > .' + GRIP_CLASS);
  host.classList.remove('axdb-gp-inside', 'axdb-gp-outside', 'axdb-gp-left', 'axdb-gp-center', 'axdb-gp-right');
  if (!cfg || !movable) {
    existing?.remove();
    return;
  }
  const el = (existing as HTMLElement | null) ?? host.ownerDocument.createElement('div');
  if (!existing) {
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('title', 'Drag');
    host.appendChild(el);
  }
  el.className = `${GRIP_CLASS} ${GRIP_CLASS}--${cfg.position ?? 'left'} ${GRIP_CLASS}--${cfg.placement ?? 'inside'}`;
  host.classList.add(`axdb-gp-${cfg.placement ?? 'inside'}`, `axdb-gp-${cfg.position ?? 'left'}`);
}

/** The member host a press on a painted grip belongs to (the grip may sit OUTSIDE the host's box). */
export function gripHostOf(target: Element | null): HTMLElement | null {
  const grip = target?.closest?.('.' + GRIP_CLASS);
  return (grip?.closest('.grafloria-node-host') as HTMLElement | null) ?? null;
}

/**
 * Did a press land on the drag handle? A press INSIDE the handle element
 * always does. The default handle is a CAPTION BAR the DevExpress way: the
 * strip from the card's top edge down to the header's bottom, padding
 * included — so the pointer need not hit the header's text to grab the tile.
 */
export function pressOnDragHandle(sel: string, target: Element | null, hostEl: HTMLElement | null, clientX: number, clientY: number): boolean {
  const grip = target?.closest?.(sel) ?? null;
  if (grip && (!hostEl || hostEl.contains(grip))) return true;
  if (sel !== '.axdb-widget-h' || !hostEl) return false;
  const hr = hostEl.getBoundingClientRect();
  const header = hostEl.querySelector('.axdb-widget-h');
  // A host painting its own content has no kit header: its caption is the top
  // band of the card, so `dragHandle: true` still means something there.
  const bottom = header ? header.getBoundingClientRect().bottom : hr.top + CAPTION_BAND;
  return clientX >= hr.left && clientX <= hr.right && clientY >= hr.top && clientY <= bottom;
}
