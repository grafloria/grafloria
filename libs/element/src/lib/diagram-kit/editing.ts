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
function openInlineEditor(api: EditApi, targetEl: Element, value: string, onCommit: (next: string) => void): HTMLInputElement {
  const container = api.container;
  const doc = container.ownerDocument;
  const input = doc.createElement('input');
  input.className = 'axk-edit-input';
  input.value = value;
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');

  const rect = targetEl.getBoundingClientRect();
  const zoom = api.viewport?.getZoom?.() ?? 1;
  const layer = container.querySelector('.grafloria-html-layer') as HTMLElement | null;

  let portal: { element: HTMLElement; dispose(): void } | null = null;
  if (layer && api.viewport?.clientToWorld && rect.width > 0) {
    // World-space: place the input at the target's world position; the layer's
    // camera transform scales it, so its px width is divided by the zoom.
    const world = api.viewport.clientToWorld(rect.left, rect.top, container.getBoundingClientRect());
    input.style.cssText = `width:${rect.width / zoom}px;height:${rect.height / zoom}px;`;
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
  const cleanup = () => {
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
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', commit);
  // Don't let a click INSIDE the input bubble to the canvas (deselect / pan).
  input.addEventListener('mousedown', (e) => e.stopPropagation());

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

  // ER column rename.
  const colEl = target.closest('.axk-col');
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
      target.closest('.axk-member')
    ) {
      event.preventDefault();
      event.stopPropagation();
      beginRename(api, target);
    }
  };

  container.addEventListener('click', onClickCapture, true);
  container.addEventListener('dblclick', onDblClickCapture, true);

  const handle: CardEditingHandle = {
    dispose() {
      container.removeEventListener('click', onClickCapture, true);
      container.removeEventListener('dblclick', onDblClickCapture, true);
      if (bindings.get(container) === handle) bindings.delete(container);
    },
  };
  bindings.set(container, handle);
  return handle;
}
