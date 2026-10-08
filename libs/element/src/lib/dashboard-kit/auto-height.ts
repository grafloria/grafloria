/**
 * CONTENT-DRIVEN HEIGHT (`autoHeight`) — a widget as tall as what it shows.
 *
 * The pack grid sizes in whole rows, so a Kanban card or a form field had to
 * guess its row span, and guessed wrong the moment its text re-wrapped at
 * another width. Here the kit measures instead: the host's natural height (its
 * cell height released for one read), rounded UP to whole rows of the board
 * that holds it, written through the binder's `fitRows` — as LAYOUT, not an
 * edit, so measuring never adds an undo step.
 *
 * WHEN it measures: once the host is painted, whenever the host's width
 * changes (a responsive column count, a narrower window, a card dragged into a
 * wider column), after `update()`/`repaint()`, and after every history event
 * (an undo restores the cells as they were saved; the content decides again).
 * Reads are batched into one animation frame. A board with a live gesture is
 * asked again shortly after — a drag's own layout is never re-written under
 * the hand.
 *
 * Height only: the span stays the author's (or the user's). Containers are
 * never measured — their height is their children's.
 */
import type { DashboardGridHandle } from './grid-binder';

export interface AutoHeightHost {
  /** Is `id` an auto-height widget (spec flag, else the dashboard default)? */
  isAuto(id: string): boolean;
  /** The binder of the board that holds `id` now (membership moves with drags). */
  binderOf(id: string): DashboardGridHandle | undefined;
  /** The widget's world width, to convert the host's CSS pixels to world units. */
  worldWidthOf(id: string): number | undefined;
  /** The spec's row limits, if any. */
  limitsOf(id: string): { minRows?: number; maxRows?: number } | undefined;
}

export interface AutoHeight {
  /** Start watching a freshly painted host. */
  observe(id: string, host: HTMLElement): void;
  /** Re-measure one widget at the next frame. */
  queue(id: string): void;
  /** Re-measure every watched widget at the next frame. */
  queueAll(): void;
  /** Measure the queue NOW (tests, and a page that just changed content). */
  flush(): void;
  dispose(): void;
}

/**
 * Natural height in CSS px: the cell height released for one synchronous read.
 * A tile is a SIZE container (`container: axdb-tile / size`, so cards can query
 * their own height) — and size containment means its height ignores its
 * content: released, it reads 0. For the read it is an inline-size container,
 * which keeps width queries answering and lets the height follow the content.
 */
export function naturalHeight(host: HTMLElement): number {
  const prevH = host.style.height;
  const prevC = host.style.containerType;
  host.style.containerType = 'inline-size';
  host.style.height = 'auto';
  const h = host.offsetHeight;
  host.style.height = prevH;
  host.style.containerType = prevC;
  return h;
}

/** Whole rows that hold `px` on a board of `rowHeight` rows and `gap` gaps. */
export function rowsForHeight(px: number, rowHeight: number, gap: number): number {
  if (!(rowHeight > 0)) return 1;
  // A sub-pixel overshoot (1.0001 rows of text metrics) must not cost a row.
  return Math.max(1, Math.ceil((px + gap) / (rowHeight + gap) - 1e-3));
}

const BUSY_RETRY_MS = 120;

export function createAutoHeight(host: AutoHeightHost): AutoHeight {
  const hosts = new Map<string, HTMLElement>();
  const idOf = new WeakMap<Element, string>();
  const dirty = new Set<string>();
  let frame = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver((entries) => {
          for (const e of entries) {
            const id = idOf.get(e.target);
            if (id) dirty.add(id);
          }
          schedule();
        })
      : null;

  const schedule = (): void => {
    if (disposed || frame || dirty.size === 0) return;
    frame = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(run) : (setTimeout(run, 16) as unknown as number);
  };
  const run = (): void => {
    frame = 0;
    flush();
  };

  const fitOne = (id: string): 'done' | 'busy' => {
    const el = hosts.get(id);
    if (!el || !el.isConnected || !host.isAuto(id)) return 'done';
    const binder = host.binderOf(id);
    if (!binder) return 'done';
    if (binder.busy) return 'busy';
    const cell = binder.cellOf(id);
    const m = binder.metrics();
    if (!cell || !(m.rowHeight > 0)) return 'done';
    const cssW = el.offsetWidth;
    const worldW = host.worldWidthOf(id);
    const scale = cssW > 0 && worldW && worldW > 0 ? cssW / worldW : 1;
    const px = naturalHeight(el) / scale;
    const lim = host.limitsOf(id);
    let rows = rowsForHeight(px, m.rowHeight, m.gap);
    if (lim?.minRows !== undefined) rows = Math.max(rows, lim.minRows);
    if (lim?.maxRows !== undefined) rows = Math.min(rows, lim.maxRows);
    if (rows !== cell.h) binder.fitRows(id, rows);
    return 'done';
  };

  const flush = (): void => {
    if (disposed) return;
    const ids = [...dirty];
    dirty.clear();
    let wait = false;
    for (const id of ids) {
      if (fitOne(id) === 'busy') {
        dirty.add(id);
        wait = true;
      }
    }
    if (wait && !retry) {
      retry = setTimeout(() => {
        retry = null;
        schedule();
      }, BUSY_RETRY_MS);
    }
  };

  return {
    observe(id, el) {
      if (disposed) return;
      const prev = hosts.get(id);
      if (prev && prev !== el) ro?.unobserve(prev);
      hosts.set(id, el);
      idOf.set(el, id);
      ro?.observe(el);
      dirty.add(id);
      schedule();
    },
    queue(id) {
      if (!hosts.has(id)) return;
      dirty.add(id);
      schedule();
    },
    queueAll() {
      for (const id of hosts.keys()) dirty.add(id);
      schedule();
    },
    flush,
    dispose() {
      disposed = true;
      ro?.disconnect();
      if (frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
      if (retry) clearTimeout(retry);
      hosts.clear();
      dirty.clear();
    },
  };
}
