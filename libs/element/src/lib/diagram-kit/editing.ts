/**
 * In-canvas editing chrome (P2 title rename + P4 column/member editing).
 *
 * Bound once per container by a kit's `finalize(api)` when `editable: true`.
 * It turns the editing affordances the card already draws (`card.ts` grows them
 * when editable) into gestures:
 *
 *   - double-click the header (`.axk-entity-head` / `.axk-uml-name`) → rename
 *     the table / class;
 *   - double-click a column name (`.axk-col`) or a member (`.axk-member`) →
 *     rename it in place;
 *   - click the "＋ add column" / "＋ attribute" / "＋ method" affordance → add
 *     one, then inline-edit its name;
 *   - click a row's "×" delete control → remove that column / member.
 *
 * Every mutation goes through {@link updateEntity} / {@link updateClass} — so it
 * is ONE undoable step and the card + ports + edges stay consistent.
 *
 * The inline editor is a real `<input>` mounted in the renderer's WORLD layer
 * via `createViewportPortal`, so it pans and zooms WITH the card. When there is
 * no world layer (a bare jsdom mount, or a host that swapped the renderer) it
 * falls back to an absolutely-positioned input in the container — the edit
 * still commits, it just doesn't track the camera.
 *
 * Control clicks are claimed in the CAPTURE phase (`stopPropagation`) so the
 * row-selection handler and the binder's node/​waypoint double-click never also
 * fire for the same gesture.
 */

import { createViewportPortal } from '@grafloria/renderer';
import { updateEntity, updateClass, addColumnAt, removeColumnAt, renameColumnAt } from './update';
import type { ErColumn, ErEntitySpec } from './er';
import type { UmlClassSpec } from './uml';

interface EditApi {
  container: HTMLElement;
  viewport?: { getZoom?: () => number; clientToWorld?: (x: number, y: number, rect: DOMRect) => { x: number; y: number } };
  getModel(): {
    getNode(id: string): { getMetadata(key: string): unknown } | undefined;
  };
  getEngine?: () => unknown;
  renderNow?: () => void;
}

export interface CardEditingHandle {
  dispose(): void;
}

const bindings = new WeakMap<HTMLElement, CardEditingHandle>();

const ROW_SELECTOR = '.axk-row, .axk-member';

/** Resolve the node id + the clicked row's global index (among selectable rows). */
function locate(el: Element): { nodeId: string; rowIndex: number; group: Element } | null {
  const group = el.closest('[data-node-id]');
  if (!group) return null;
  const nodeId = group.getAttribute('data-node-id');
  if (!nodeId) return null;
  const rowEl = el.closest(ROW_SELECTOR);
  const rows = Array.from(group.querySelectorAll(ROW_SELECTOR));
  const rowIndex = rowEl ? rows.indexOf(rowEl) : -1;
  return { nodeId, rowIndex, group };
}

const kitEntity = (api: EditApi, nodeId: string): ErEntitySpec | undefined =>
  api.getModel().getNode(nodeId)?.getMetadata('kitEntity') as ErEntitySpec | undefined;
const kitClass = (api: EditApi, nodeId: string): UmlClassSpec | undefined =>
  api.getModel().getNode(nodeId)?.getMetadata('kitClass') as UmlClassSpec | undefined;

/** UML: split a global member index into its compartment + local index. */
function umlSection(cls: UmlClassSpec, rowIndex: number): { section: 'attributes' | 'methods'; local: number } {
  const attrs = cls.attributes ?? [];
  return rowIndex < attrs.length
    ? { section: 'attributes', local: rowIndex }
    : { section: 'methods', local: rowIndex - attrs.length };
}

/**
 * Mount a focused `<input>` over `targetEl`, prefilled with `value`. Commits on
 * Enter/blur, cancels on Escape. Returns the input (already in the DOM).
 */
/**
 * The inline editor currently open, if any.
 *
 * The editor is mounted in the renderer's WORLD layer, not inside the card, so
 * it does not die when the card re-renders. That is what lets it survive a
 * re-render mid-edit — and it is also why deleting the very row being edited
 * used to leave a stray input floating over the canvas: the row vanished, the
 * portal did not. Any structural edit now dismisses it first.
 */
let activeEditor: { cancel: () => void } | null = null;

/** Dismiss any open inline editor WITHOUT committing. */
export function dismissInlineEditor(): void {
  const open = activeEditor;
  activeEditor = null;
  open?.cancel();
}

/** A stable address for a cell, so it can be found again after a re-render. */
interface CellAddr { nodeId: string; rowIndex: number; kind: 'name' | 'type' }

function addrOf(el: Element): CellAddr | null {
  const loc = locate(el);
  if (!loc || loc.rowIndex < 0) return null;
  const kind = el.closest('.axk-ty') ? 'type' : 'name';
  return { nodeId: loc.nodeId, rowIndex: loc.rowIndex, kind };
}

/** The cell `dir` steps away in reading order (name → type → next row's name). */
function neighbourCell(el: Element, dir: 1 | -1): CellAddr | null {
  const a = addrOf(el);
  if (!a) return null;
  if (dir === 1) {
    return a.kind === 'name'
      ? { ...a, kind: 'type' }
      : { ...a, rowIndex: a.rowIndex + 1, kind: 'name' };
  }
  return a.kind === 'type'
    ? { ...a, kind: 'name' }
    : { ...a, rowIndex: a.rowIndex - 1, kind: 'type' };
}

/** The same column, one row down. */
function cellBelow(el: Element): CellAddr | null {
  const a = addrOf(el);
  return a ? { ...a, rowIndex: a.rowIndex + 1 } : null;
}

/** Re-open the editor at an address, if that cell still exists. */
function reopenAt(api: EditApi, addr: CellAddr): void {
  const card = api.container.querySelector(`[data-node-id="${cssEscape(addr.nodeId)}"]`);
  const row = card?.querySelectorAll('.axk-row, .axk-member')[addr.rowIndex] as Element | undefined;
  const cell = row?.querySelector(addr.kind === 'type' ? '.axk-ty' : '.axk-col');
  if (cell) beginRename(api, cell);
}

/** First occurrence wins, order preserved. */
function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** SQL-ish column types offered when editing a type cell. */
export const ER_TYPE_SUGGESTIONS = [
  'uuid', 'int', 'bigint', 'smallint', 'serial', 'decimal', 'numeric', 'real', 'double',
  'varchar', 'text', 'char', 'boolean', 'date', 'time', 'timestamp', 'timestamptz',
  'json', 'jsonb', 'bytea', 'enum',
];

function openInlineEditor(
  api: EditApi,
  targetEl: Element,
  value: string,
  onCommit: (next: string) => void,
  suggestions?: readonly string[]
): HTMLInputElement {
  const container = api.container;
  const doc = container.ownerDocument;
  const input = doc.createElement('input');
  input.className = 'axk-edit-input';
  input.value = value;
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');

  // A type is a choice, not free prose. `<datalist>` gives a real combobox —
  // the browser filters the list AS YOU TYPE and still allows a value that is
  // not in it, which is what a schema editor needs (custom/domain types).
  let listEl: HTMLDataListElement | null = null;
  if (suggestions?.length) {
    listEl = doc.createElement('datalist');
    listEl.id = `axk-types-${Math.random().toString(36).slice(2, 8)}`;
    for (const t of suggestions) {
      const opt = doc.createElement('option');
      opt.value = t;
      listEl.appendChild(opt);
    }
    doc.body.appendChild(listEl);
    input.setAttribute('list', listEl.id);
  }

  const rect = targetEl.getBoundingClientRect();
  const zoom = api.viewport?.getZoom?.() ?? 1;
  const layer = container.querySelector('.grafloria-html-layer') as HTMLElement | null;

  let portal: { element: HTMLElement; dispose(): void } | null = null;
  if (layer && api.viewport?.clientToWorld && rect.width > 0) {
    // World-space: place the input at the target's world position; the layer's
    // camera transform scales it, so its px width is divided by the zoom.
    // A cell can be far narrower than the value you are about to pick — the
    // type cell is sized to "uuid", which left a 23px-wide combobox nobody
    // could use. Give the editor a comfortable floor…
    const minW = suggestions?.length ? 132 : 72;
    let w = Math.max(rect.width / zoom, minW);
    // …but never let it spill past the CARD. Widening a right-hand cell pushes
    // the editor outside the table border, which looks broken and can cover the
    // canvas. Keep the right edge inside the card by sliding the editor left,
    // and only shrink if the card itself is narrower than the floor.
    let left = rect.left;
    const card = targetEl.closest('.axk-entity, .axk-uml') as HTMLElement | null;
    if (card) {
      const cb = card.getBoundingClientRect();
      const pad = 4 * zoom;
      const maxW = (cb.width - pad * 2) / zoom;
      if (w > maxW) w = maxW;
      const overflow = left + w * zoom - (cb.right - pad);
      if (overflow > 0) left -= overflow;
      if (left < cb.left + pad) left = cb.left + pad;
    }
    input.style.cssText = `width:${w}px;height:${rect.height / zoom}px;`;
    // World position uses the CLAMPED left, so the editor lands where it will
    // actually be drawn rather than where the cell happens to start.
    const world = api.viewport.clientToWorld(left, rect.top, container.getBoundingClientRect());
    try {
      portal = createViewportPortal(layer, { x: world.x, y: world.y, className: 'axk-edit-portal' });
      portal.element.appendChild(input);
    } catch {
      portal = null;
    }
  }
  if (!portal) {
    // Fallback: absolute in the container (jsdom / no world layer).
    const host = container.getBoundingClientRect();
    input.style.cssText =
      `position:absolute;left:${rect.left - host.left}px;top:${rect.top - host.top}px;` +
      (rect.width ? `width:${rect.width}px;height:${rect.height}px;` : 'min-width:120px;');
    container.appendChild(input);
  }

  let done = false;
  const self: { cancel: () => void } = { cancel: () => undefined };
  const cleanup = () => {
    if (activeEditor === self) activeEditor = null;
    listEl?.remove();
    if (portal) portal.dispose();
    else input.remove();
  };
  const commit = () => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    cleanup();
    if (next.length) onCommit(next);
  };
  const cancel = () => {
    if (done) return;
    done = true;
    cleanup();
  };

  input.addEventListener('keydown', (e) => {
    // Keyboard navigation: TAB walks the cells (name → type → next row's name,
    // Shift+Tab back). Enter deliberately does NOT move — it commits and
    // closes, which is what every other inline editor in the app does and what
    // a user pressing Enter to "finish" expects. Navigation belongs on Tab.
    if (e.key === 'Tab') {
      const next = neighbourCell(targetEl, e.shiftKey ? -1 : 1);
      if (next) {
        e.preventDefault();
        commit();
        // Re-open on the next cell after the card has re-rendered.
        setTimeout(() => reopenAt(api, next), 0);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    e.stopPropagation();
  });
  // Registered AFTER commit/cancel exist so a structural edit can dismiss it.
  self.cancel = cancel;
  activeEditor = self;

  input.addEventListener('blur', commit);
  // Don't let a click INSIDE the input bubble to the canvas (deselect / pan).
  // Keep the canvas binder OUT of the editor. It listens on POINTER events and
  // preventDefaults them to own the gesture — which also suppressed the native
  // <datalist> popup, so the type dropdown either never opened or flashed open
  // and shut. Guarding `mousedown` alone was not enough: pointerdown fires
  // first and is what the binder acts on.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick']) {
    input.addEventListener(type, (e) => e.stopPropagation());
  }

  // Focus after mount so select() works.
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
  return input;
}

/** Begin renaming whatever the clicked row/header targets. */
function beginRename(api: EditApi, target: Element): void {
  const loc = locate(target);
  if (!loc) return;
  const { nodeId, rowIndex } = loc;

  // Title (ER header / UML name).
  if (target.closest('.axk-entity-head')) {
    const ent = kitEntity(api, nodeId);
    openInlineEditor(api, target.closest('.axk-entity-head')!, ent?.name ?? nodeId, (name) =>
      void updateEntity(api as never, nodeId, { name })
    );
    return;
  }
  if (target.closest('.axk-uml-name')) {
    const cls = kitClass(api, nodeId);
    openInlineEditor(api, target.closest('.axk-uml-name')!, cls?.name ?? nodeId, (name) =>
      void updateClass(api as never, nodeId, { name })
    );
    return;
  }

  // ER column. Which CELL was double-clicked decides what gets edited and where
  // the input is mounted: the name span (`.axk-col`) and the type span
  // (`.axk-ty`) are SIBLINGS inside `.axk-row`. Editing only ever handled the
  // name and always anchored to it, so double-clicking a type either did
  // nothing or dropped the caret over the name — the wrong field in the wrong
  // place. A double-click anywhere else on the row falls back to the name,
  // anchored to the name cell, so the gesture is predictable everywhere.
  const typeEl = target.closest('.axk-ty');
  if (typeEl && rowIndex >= 0) {
    const ent = kitEntity(api, nodeId);
    if (!ent) return;
    openInlineEditor(
      api,
      typeEl,
      ent.columns[rowIndex]?.type ?? '',
      (type) => {
        const columns = ent.columns.map((c, i) => (i === rowIndex ? { ...c, type } : c));
        void updateEntity(api as never, nodeId, { columns });
      },
      // Offer the types already used in THIS diagram first, then the standards —
      // a schema is usually internally consistent, so what you just typed
      // elsewhere is the likeliest next value.
      dedupe([...ent.columns.map((c) => c.type).filter(Boolean) as string[], ...ER_TYPE_SUGGESTIONS])
    );
    return;
  }

  const rowEl = target.closest('.axk-row');
  const colEl = target.closest('.axk-col') ?? rowEl?.querySelector('.axk-col') ?? null;
  if (colEl && rowIndex >= 0) {
    const ent = kitEntity(api, nodeId);
    if (!ent) return;
    openInlineEditor(api, colEl, ent.columns[rowIndex]?.name ?? '', (name) =>
      void updateEntity(api as never, nodeId, { columns: renameColumnAt(ent.columns, rowIndex, name) })
    );
    return;
  }

  // UML member rename.
  const memberEl = target.closest('.axk-member');
  if (memberEl && rowIndex >= 0) {
    const cls = kitClass(api, nodeId);
    if (!cls) return;
    const { section, local } = umlSection(cls, rowIndex);
    const list = (cls[section] ?? []).slice();
    openInlineEditor(api, memberEl.querySelector('.axk-mtext') ?? memberEl, list[local] ?? '', (next) => {
      list[local] = next;
      void updateClass(api as never, nodeId, { [section]: list });
    });
  }
}

/** Add a column / member (then inline-edit the new one). Returns true if handled. */
function handleAdd(api: EditApi, target: Element): boolean {
  const addEr = target.closest('.axk-entity-add');
  if (addEr) {
    const loc = locate(addEr);
    if (!loc) return true;
    const ent = kitEntity(api, loc.nodeId);
    if (!ent) return true;
    const columns = addColumnAt(ent.columns, { name: 'new_column', type: '' });
    void updateEntity(api as never, loc.nodeId, { columns }).then(() => {
      const newRow = api.container.querySelectorAll(`[data-node-id="${cssEscape(loc.nodeId)}"] .axk-row`)[columns.length - 1];
      const col = newRow?.querySelector('.axk-col');
      if (col) beginRename(api, col);
    });
    return true;
  }
  const addUml = target.closest('.axk-uml-add');
  if (addUml) {
    const loc = locate(addUml);
    if (!loc) return true;
    const cls = kitClass(api, loc.nodeId);
    if (!cls) return true;
    const comps = Array.from(loc.group.querySelectorAll('.axk-uml-comp'));
    const section: 'attributes' | 'methods' = comps.indexOf(addUml.closest('.axk-uml-comp')!) === 0 ? 'attributes' : 'methods';
    const list = [...(cls[section] ?? []), section === 'attributes' ? '+ field: type' : '+ method(): void'];
    void updateClass(api as never, loc.nodeId, { [section]: list });
    return true;
  }
  return false;
}

/** Delete the column / member whose "×" control was clicked. Returns true if handled. */
function handleDelete(api: EditApi, target: Element): boolean {
  const del = target.closest('.axk-col-del');
  if (!del) return false;
  const loc = locate(del);
  if (!loc || loc.rowIndex < 0) return true;
  const ent = kitEntity(api, loc.nodeId);
  if (ent) {
    void updateEntity(api as never, loc.nodeId, { columns: removeColumnAt(ent.columns, loc.rowIndex) });
    return true;
  }
  const cls = kitClass(api, loc.nodeId);
  if (cls) {
    const { section, local } = umlSection(cls, loc.rowIndex);
    const list = (cls[section] ?? []).slice();
    list.splice(local, 1);
    void updateClass(api as never, loc.nodeId, { [section]: list });
  }
  return true;
}

function cssEscape(id: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
}

/**
 * Wire the editing gestures onto a kit container. Idempotent per container
 * (a re-bind disposes the previous one), matching `bindRowInteractions`.
 */
export function bindCardEditing(api: EditApi): CardEditingHandle {
  const container = api.container;
  bindings.get(container)?.dispose();

  const onClickCapture = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // Claim control clicks BEFORE row-selection / canvas handlers see them.
    // An open editor is dismissed first: its row may be the one being removed,
    // and committing a rename into a structural change is a race even when it
    // is not (the card re-renders under the caret).
    if (target.closest('.axk-col-del') || target.closest('.axk-entity-add') || target.closest('.axk-uml-add')) {
      dismissInlineEditor();
    }
    if (handleDelete(api, target) || handleAdd(api, target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onDblClickCapture = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.axk-edit-input')) return; // don't re-open over our own input
    if (
      target.closest('.axk-entity-head') ||
      target.closest('.axk-uml-name') ||
      target.closest('.axk-col') ||
      target.closest('.axk-ty') ||
      target.closest('.axk-row') ||
      target.closest('.axk-member')
    ) {
      event.preventDefault();
      event.stopPropagation();
      beginRename(api, target);
    }
  };

  // A control press must dismiss the editor BEFORE the browser's focus change
  // fires `blur` → `commit`. Doing it on `click` was too late: the rename had
  // already landed, so deleting the row you were editing renamed it first and
  // then removed a shifted index. preventDefault keeps focus in place too.
  const onMouseDownCapture = (event: MouseEvent) => {
    const t = event.target instanceof Element ? event.target : null;
    if (!t) return;
    if (t.closest('.axk-col-del') || t.closest('.axk-entity-add') || t.closest('.axk-uml-add')) {
      dismissInlineEditor();
      event.preventDefault();
    }
  };

  container.addEventListener('mousedown', onMouseDownCapture, true);
  container.addEventListener('click', onClickCapture, true);
  container.addEventListener('dblclick', onDblClickCapture, true);

  const handle: CardEditingHandle = {
    dispose() {
      container.removeEventListener('mousedown', onMouseDownCapture, true);
      container.removeEventListener('click', onClickCapture, true);
      container.removeEventListener('dblclick', onDblClickCapture, true);
      if (bindings.get(container) === handle) bindings.delete(container);
    },
  };
  bindings.set(container, handle);
  return handle;
}
