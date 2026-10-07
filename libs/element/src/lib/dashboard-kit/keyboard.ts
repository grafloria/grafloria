/**
 * KEYBOARD OPERATION (tile first, step 4b-i: out of the binder). WCAG 2.1.1,
 * and the non-drag alternative 2.5.7 asks for: on a focused member, arrows
 * move it one cell, Shift+arrows resize it one cell, Home/End jump to the
 * first/last member. Every move and resize is the same programmatic gesture
 * the API uses — one undoable step, reported through onLayoutChange — and
 * every outcome is spoken: the tile's new cell, each neighbour it displaced,
 * or why it was refused. Handled keys stop here so the renderer's own pixel
 * nudge never fights the grid.
 */
import type { NodeModel } from '@grafloria/engine';
import { LiveRegionController } from '@grafloria/renderer';
import type { CellRect } from './grid-mapping';
import type { BoardCtx } from './board-ctx';

/**
 * ONE aria-live region per canvas, shared by every board on it — the
 * renderer's own controller (coalescing, de-duplicating), so a dashboard
 * announces through the same channel a diagram does. WeakMap: the region
 * follows the container out of memory.
 */
const LIVE_REGIONS = new WeakMap<HTMLElement, LiveRegionController>();
export function liveRegionFor(container: HTMLElement): LiveRegionController {
  let live = LIVE_REGIONS.get(container);
  if (!live) {
    live = new LiveRegionController(container);
    LIVE_REGIONS.set(container, live);
  }
  return live;
}

export function directionName(dx: number, dy: number): string {
  return dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
}

/** "column 4, row 2, 3 by 1" — the cell as a person hears it (1-based). */
export function describeCell(c: CellRect): string {
  return `column ${c.x + 1}, row ${c.y + 1}, ${c.w} by ${c.h}`;
}

export interface KeyboardDeps {
  /** The board's handle — its programmatic move, resize and focus; read late, it exists after the binder is built. */
  handle(): { moveTo(id: string, x: number, y: number): Promise<boolean>; resizeTo(id: string, w: number, h: number): Promise<boolean>; focusWidget(id: string): boolean };
  live: LiveRegionController;
  /** The accessible name of a widget: its title, else its kind, else its id. */
  nameOf(node: NodeModel): string;
  focusedId(): string | undefined;
  setFocusedId(id: string): void;
  selectedId(): string | undefined;
  selectWidget(id: string): void;
  syncA11y(): void;
  /** A tile gesture is live: the keys stay out of its way. */
  gestureRunning(): boolean;
}

export interface Keyboard {
  onFocusIn(e: FocusEvent): void;
  onKey(e: KeyboardEvent): void;
}

export function createKeyboard(ctx: BoardCtx, deps: KeyboardDeps): Keyboard {
  const { group, diagram } = ctx;

  const memberHostAt = (target: EventTarget | null): { id: string; host: HTMLElement } | null => {
    const host = (target as Element | null)?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host) return null;
    const id = host.getAttribute('data-node-id') ?? '';
    if (!(group.members ?? new Set<string>()).has(id) || !diagram.getNode(id)) return null;
    return { id, host };
  };

  const onFocusIn = (e: FocusEvent): void => {
    const hit = memberHostAt(e.target);
    if (!hit || ctx.disposed()) return;
    if (deps.focusedId() !== hit.id || deps.selectedId() !== hit.id) {
      deps.setFocusedId(hit.id);
      deps.selectWidget(hit.id);
      deps.syncA11y();
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (ctx.disposed() || deps.gestureRunning()) return;
    const handle = deps.handle();
    const hit = memberHostAt(e.target);
    if (!hit) {
      const el = e.target as Element | null;
      const onRoot = !!el && el.tagName?.toLowerCase() === 'svg' && el.classList?.contains('grafloria-diagram');
      if (onRoot && (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ')) {
        const members = [...(group.members ?? [])].filter((id) => !!diagram.getNode(id) && !!ctx.hostOf(id));
        const focused = deps.focusedId();
        const target = focused && members.includes(focused) ? focused : members[0];
        if (target && handle.focusWidget(target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      return;
    }
    const members = [...(group.members ?? [])].filter((id) => !!diagram.getNode(id) && !!ctx.hostOf(id));
    if (e.key === 'Home' || e.key === 'End') {
      const id = e.key === 'Home' ? members[0] : members[members.length - 1];
      if (id) handle.focusWidget(id);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!arrow) return;
    e.preventDefault();
    e.stopPropagation();
    if (ctx.isStatic()) return; // readable, not editable
    const engine = ctx.engine();
    const node = diagram.getNode(hit.id);
    const item = engine.getItem(hit.id);
    if (!node || !item) return;
    const name = deps.nameOf(node);
    const live = deps.live;
    if (node.state?.locked === true) {
      live.announceError(`${name} is pinned`);
      return;
    }
    const [dx, dy] = arrow;
    const before = new Map(engine.getItems().map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]));
    const resize = e.shiftKey;
    if (resize && node.getMetadata?.('widgetResizable') === false) {
      live.announceError(`${name} cannot be resized`);
      return;
    }
    if (!resize && node.getMetadata?.('widgetMovable') === false) {
      live.announceError(`${name} cannot be moved`);
      return;
    }
    const stepOrSwap = async (): Promise<boolean> => {
      if (await handle.moveTo(hit.id, item.x + dx, item.y + dy)) return true;
      const probe = { x: item.x + dx, y: item.y + dy, w: item.w, h: item.h };
      const c = engine
        .getItems()
        .find((o) => o.id !== hit.id && probe.x < o.x + o.w && o.x < probe.x + probe.w && probe.y < o.y + o.h && o.y < probe.y + probe.h);
      if (!c) return false;
      const tx = dx > 0 ? c.x + c.w - item.w : dx < 0 ? c.x : item.x;
      const ty = dy > 0 ? c.y + c.h - item.h : dy < 0 ? c.y : item.y;
      return handle.moveTo(hit.id, tx, ty);
    };
    const op = resize ? handle.resizeTo(hit.id, item.w + dx, item.h + dy) : stepOrSwap();
    void op.then((ok) => {
      if (ctx.disposed()) return;
      const after = ctx.engine().getItem(hit.id);
      if (!ok || !after) {
        live.announceError(resize ? `Cannot resize ${name} that way` : `Cannot move ${name} ${directionName(dx, dy)}`);
        return;
      }
      const parts = [`${name} ${resize ? 'resized' : 'moved'} to ${describeCell(after)}`];
      for (const other of ctx.engine().getItems()) {
        if (other.id === hit.id) continue;
        const was = before.get(other.id);
        if (!was || (was.x === other.x && was.y === other.y)) continue;
        const o = diagram.getNode(other.id);
        parts.push(`${o ? deps.nameOf(o) : other.id} moved to ${describeCell(other)}`);
      }
      live.announce(parts.join('. '), 'polite', true);
      deps.syncA11y();
      ctx.hostOf(hit.id)?.focus?.({ preventScroll: true });
    });
  };

  return { onFocusIn, onKey };
}
