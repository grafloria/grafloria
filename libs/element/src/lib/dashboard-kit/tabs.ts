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
  onPick: (id: string) => void
): void {
  const doc = strip.ownerDocument;
  strip.className = 'axdb-tabs';
  if (o?.className) for (const c of o.className.split(/\s+/).filter(Boolean)) strip.classList.add(c);
  strip.classList.toggle('axdb-tabs--center', o?.align === 'center');
  strip.classList.toggle('axdb-tabs--end', o?.align === 'end');
  strip.classList.toggle('axdb-tabs--stretch', o?.stretch === true);
  strip.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  strip.setAttribute('role', 'tablist');
  strip.textContent = '';
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
    b.addEventListener('click', (e) => {
      e.stopPropagation();
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
