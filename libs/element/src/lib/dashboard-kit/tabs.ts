/**
 * TAB CONTAINERS — a container whose children are PAGES, one visible at a
 * time, with a strip of tabs across its top. DevExpress ships this as its Tab
 * Container; VS Code's editor area is a split of them.
 *
 * This module owns the strip: its height, its geometry and its DOM. Who is
 * active, where the pages sit and what a press means are the container's
 * business (dashboard.ts), exactly as the caption band's press routing is the
 * binder's.
 */

export interface TabsOptions {
  /** Where the strip sits. Only 'top' today; 'bottom' | 'start' | 'end' follow. */
  position?: 'top';
  /** Along the strip (default 'start', mirrored on RTL). */
  align?: 'start' | 'center' | 'end';
  /** Tabs share the strip's width equally. */
  stretch?: boolean;
  /** Strip height, px (default 30). */
  height?: number;
  /** Your class on the strip, for per-container theming. */
  className?: string;
}

export interface TabPage {
  id: string;
  label: string;
}

export const TAB_STRIP_HEIGHT = 30;

/**
 * Travel, in px, that turns a press on a tab from a click into a drag. VS Code
 * uses the platform drag threshold; 4 px is the same order and keeps a shaky
 * click a click.
 */
export const TAB_DRAG_THRESHOLD = 4;

/** Pixels the pages give up at the top of the container. */
export function tabStripReserve(o: TabsOptions | undefined, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.max(18, o?.height ?? TAB_STRIP_HEIGHT);
}

/**
 * Paint the strip. Repainted only when its identity changes (the pages, the
 * active one, the options, RTL) so a page switch is a class toggle, not a
 * rebuild — and so a `click` listener survives between switches.
 */
export function tabStripKey(pages: TabPage[], activeId: string, o: TabsOptions | undefined, rtl: boolean): string {
  return JSON.stringify([pages, activeId, o ?? null, rtl]);
}

export function paintTabStrip(
  strip: HTMLElement,
  pages: TabPage[],
  activeId: string,
  o: TabsOptions | undefined,
  rtl: boolean,
  onPick: (id: string) => void,
  onSelectContainer?: (e: PointerEvent) => void,
  /**
   * The tab is the PAGE's drag handle, as it is in VS Code: press one and
   * travel, and the whole page leaves — not the widget under the pointer,
   * which used to be the only way to drag anything out and left the tab
   * behind pointing at an empty page.
   */
  onDrag?: (pageId: string, ev: PointerEvent) => boolean
): void {
  const doc = strip.ownerDocument;
  // Set by a tab drag, read by the click that trails it. Strip-level so it
  // survives between the two listeners, cleared on the next press so an
  // aborted drag never eats a later click.
  let suppressClick = false;
  strip.className = 'axdb-tabs';
  if (o?.className) for (const c of o.className.split(/\s+/).filter(Boolean)) strip.classList.add(c);
  strip.classList.toggle('axdb-tabs--center', o?.align === 'center');
  strip.classList.toggle('axdb-tabs--end', o?.align === 'end');
  strip.classList.toggle('axdb-tabs--stretch', o?.stretch === true);
  strip.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  strip.setAttribute('role', 'tablist');
  strip.textContent = '';
  // The strip's EMPTY space selects the container. A tab container's pages
  // cover it completely, so without this there is nowhere to press to select
  // it — and an unselected section shows no corner handle, which made the
  // container impossible to resize by hand.
  // A real listener, not the `onpointerdown` IDL attribute: the attribute is
  // not an event handler under jsdom, so the strip's empty-space press — the
  // whole group's drag handle — could never be driven by a spec. Repaints
  // replace the previous listener rather than stacking one per paint.
  const withSelect = strip as HTMLElement & { __axdbSelect?: (e: Event) => void };
  if (withSelect.__axdbSelect) strip.removeEventListener('pointerdown', withSelect.__axdbSelect);
  withSelect.__axdbSelect = (e: Event) => {
    if ((e.target as Element | null)?.closest('.axdb-tab')) return;
    onSelectContainer?.(e as PointerEvent);
  };
  strip.addEventListener('pointerdown', withSelect.__axdbSelect);
  for (const p of pages) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'axdb-tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('data-tab-id', p.id);
    b.setAttribute('aria-selected', String(p.id === activeId));
    b.classList.toggle('axdb-tab--on', p.id === activeId);
    // ONE tab stop for the whole strip, arrows move between tabs — the
    // pattern every tablist uses, and it keeps the board's single tab stop
    // rule intact.
    b.tabIndex = p.id === activeId ? 0 : -1;
    b.textContent = p.label;
    b.title = p.label;
    b.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (pe.button !== undefined && pe.button > 0) return;
      suppressClick = false;
      if (!onDrag) return;
      const from = { x: pe.clientX, y: pe.clientY };
      const stop = (): void => {
        doc.removeEventListener('pointermove', move, true);
        doc.removeEventListener('pointerup', stop, true);
        doc.removeEventListener('pointercancel', stop, true);
      };
      const move = (m: Event): void => {
        const pm = m as PointerEvent;
        if (
          Math.abs(pm.clientX - from.x) < TAB_DRAG_THRESHOLD &&
          Math.abs(pm.clientY - from.y) < TAB_DRAG_THRESHOLD
        )
          return;
        stop();
        // A press that TRAVELLED is a drag: the click that may follow it must
        // not also switch the page — but only if the drag was actually TAKEN.
        // A board that cannot place the page (a split pane, a container down
        // to its last page) refuses, and then the press is still a click.
        suppressClick = onDrag(p.id, pm) === true;
      };
      doc.addEventListener('pointermove', move, true);
      doc.addEventListener('pointerup', stop, true);
      doc.addEventListener('pointercancel', stop, true);
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      onPick(p.id);
    });
    b.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      const step = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'Home' ? -pages.length : k === 'End' ? pages.length : 0;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      const i = pages.findIndex((x) => x.id === p.id);
      const dir = rtl && (k === 'ArrowRight' || k === 'ArrowLeft') ? -step : step;
      const next = Math.max(0, Math.min(pages.length - 1, i + dir));
      onPick(pages[next].id);
      (strip.querySelector(`[data-tab-id="${pages[next].id}"]`) as HTMLElement | null)?.focus();
    });
    strip.appendChild(b);
  }
}
