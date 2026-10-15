/**
 * KEYBOARD OPERATION (tile first, step 4b-i: out of the binder). WCAG 2.1.1,
 * and the non-drag alternative 2.5.7 asks for: on a focused member, arrows
 * move it one cell, Shift+arrows resize it one cell, Home/End jump to the
 * first/last member. Every move and resize is the same programmatic gesture
 * the API uses — one undoable step, reported through onLayoutChange — and
 * every outcome is spoken: the tile's new cell, each neighbour it displaced,
 * or why it was refused. Handled keys stop here so the renderer's own pixel
 * nudge never fights the grid.
 *
 * In a LIST (a one-column `stack` section: a Kanban column) a card's place is
 * a position in an order, so Ctrl (or Alt, for a Mac, where Ctrl+arrows
 * belong to the system) with an arrow moves by position: ← and → to the same
 * index, clamped, of the next list on the row — the drop policy asked exactly
 * as a pointer drop asks it — and ↑ and ↓ within the list. A list that
 * refuses the card stops it there: it is never passed over.
 */
import type { NodeModel } from '@grafloria/engine';
import { LiveRegionController } from '@grafloria/renderer';
import type { CellRect } from './grid-mapping';
import type { BoardCtx } from './board-ctx';
import { sectionNameOf } from './caption';
import { LIST_FULL, refusalOf, refusalSentence } from './drop-policy';

/** How long a list that refused a keyboard move keeps its refusal showing, unless a key or a focus change clears it first. */
export const KEY_REFUSAL_MS = 2500;

/**
 * Key presses a list move has answered. Every board of a canvas listens on
 * the same container, and between two listeners of a real key press the
 * browser runs the microtasks — so the move has landed, and the card is a
 * member of the list it went to, by the time that list's listener runs. It
 * must not take the same press as its own and move the card on again.
 */
const ANSWERED = new WeakSet<Event>();

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

/**
 * What the keyboard needs from the dashboard to move a card between lists —
 * where the other lists are and how a card goes into one. A list's binder
 * carries it as its `lists` option; the keyboard asks the drop policy and
 * speaks for itself.
 */
export interface ListMoves {
  /** The nearest other list on this list's row: `dir` 1 to the right on screen, -1 to the left. */
  next(dir: -1 | 1): string | undefined;
  /** A list's cards, top to bottom. */
  cards(listId: string): string[];
  /**
   * Put card `id` at `index` of list `listId` (clamped): ONE undo step,
   * reported through `onLayoutChange`; `'full'` when the list has no room for
   * it. The policy is not asked here.
   */
  place(id: string, listId: string, index: number): Promise<boolean | 'full'>;
  /** Keyboard focus to card `id`, on whichever board holds it now. */
  focus(id: string): void;
  /** A step is still landing, or a hand is on a board: `place` would answer false now. */
  busy(): boolean;
}

export interface KeyboardDeps {
  /** The board's handle — its programmatic move, resize and focus; read late, it exists after the binder is built. */
  handle(): { moveTo(id: string, x: number, y: number): Promise<boolean>; resizeTo(id: string, w: number, h: number): Promise<boolean>; focusWidget(id: string): boolean };
  /** This board is a LIST: a one-column `stack` section. */
  isList(): boolean;
  /** Mark a section as the drop target, or as refusing it with `reason` (the pointer's ring); null clears. */
  markDrop(boardId: string | null, refused: boolean, reason?: string): void;
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

  /**
   * A list that refused a keyboard move wears the refusal a pointer drag over
   * it would — the ring and the reason — so a sighted keyboard user sees what
   * a screen reader says. It goes with the next key, a focus change, or time.
   */
  let refusalTimer: ReturnType<typeof setTimeout> | null = null;
  const clearRefusal = (): void => {
    if (!refusalTimer) return;
    clearTimeout(refusalTimer);
    refusalTimer = null;
    if (!ctx.disposed() && !deps.gestureRunning()) deps.markDrop(null, false);
  };
  const showRefusal = (boardId: string, reason: string): void => {
    deps.markDrop(boardId, true, reason);
    refusalTimer = setTimeout(clearRefusal, KEY_REFUSAL_MS);
  };

  const listName = (id: string): string => {
    const grp = diagram.getGroup(id);
    return grp ? sectionNameOf(grp) : id;
  };

  /**
   * A card moved by its POSITION in a list: `dy` within this list, `dx` to the
   * next list on the row. Every outcome is spoken; a move is the dashboard's
   * `place` — one undo step and an `onLayoutChange`, as a drop.
   */
  const moveInLists = async (lists: ListMoves, id: string, name: string, dx: number, dy: number): Promise<void> => {
    const live = deps.live;
    const here = group.id;
    const order = lists.cards(here);
    const at = order.indexOf(id);
    if (at < 0) return;
    if (dy !== 0) {
      const to = at + dy;
      if (to < 0 || to >= order.length) {
        live.announceError(`${name} is already ${dy < 0 ? 'first' : 'last'} in ${listName(here)}`);
        return;
      }
      const ok = await lists.place(id, here, to);
      if (ctx.disposed()) return; // the board went while the move landed: nothing is left to speak or focus
      if (ok !== true) {
        live.announceError(`Cannot move ${name} ${directionName(0, dy)}`);
        return;
      }
      const now = lists.cards(here);
      live.announce(`${name} moved ${directionName(0, dy)}, ${now.indexOf(id) + 1} of ${now.length}`, 'polite', true);
      lists.focus(id);
      return;
    }
    // The NEXT list on the row, or nowhere: a list that refuses the card
    // stops it there, with the reason, and it is never passed over — on a
    // board whose columns are states, landing two lists on would be a change
    // the person never asked for. The drop policy is asked as a pointer drop
    // asks it, never for the list the card is leaving; a full list of fixed
    // height refuses too.
    const to = lists.next(dx < 0 ? -1 : 1);
    if (to === undefined) {
      live.announceError(`${name} stays in ${listName(here)}: no list to the ${directionName(dx, 0)}`);
      return;
    }
    const policy = ctx.options.canDrop ? refusalOf(ctx.options.canDrop({ nodeId: id, from: here, to })) : null;
    const answer = policy === null ? await lists.place(id, to, at) : false;
    if (ctx.disposed()) return; // the board went while the move landed
    const reason = policy ?? (answer === 'full' ? LIST_FULL : null);
    if (reason !== null) {
      live.announceError(`${name} stays in ${listName(here)}. ${refusalSentence(listName(to), 'it', reason)}`);
      showRefusal(to, reason);
      return;
    }
    if (answer !== true) {
      live.announceError(`Cannot move ${name} to ${listName(to)}`);
      return;
    }
    const now = lists.cards(to);
    live.announce(`${name} moved to ${listName(to)}, ${now.indexOf(id) + 1} of ${now.length}`, 'polite', true);
    lists.focus(id);
  };

  const onFocusIn = (e: FocusEvent): void => {
    clearRefusal();
    const hit = memberHostAt(e.target);
    if (!hit || ctx.disposed()) return;
    if (deps.focusedId() !== hit.id || deps.selectedId() !== hit.id) {
      deps.setFocusedId(hit.id);
      deps.selectWidget(hit.id);
      deps.syncA11y();
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    clearRefusal();
    if (ctx.disposed() || deps.gestureRunning() || ANSWERED.has(e)) return;
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
    const resize = e.shiftKey;
    if (resize && node.getMetadata?.('widgetResizable') === false) {
      live.announceError(`${name} cannot be resized`);
      return;
    }
    if (!resize && node.getMetadata?.('widgetMovable') === false) {
      live.announceError(`${name} cannot be moved`);
      return;
    }
    const lists = ctx.options.lists;
    if (lists && !resize && (e.ctrlKey || e.altKey) && !e.metaKey && deps.isList()) {
      // A move still landing (this one's, a drop's): the card would be refused
      // where it is going, so a repeat waits its turn by being ignored.
      ANSWERED.add(e);
      if (!lists.busy()) void moveInLists(lists, hit.id, name, dx, dy);
      return;
    }
    const before = new Map(engine.getItems().map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]));
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
