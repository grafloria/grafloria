/**
 * Row interactions — "select a column / field" on kit cards (P1 of the
 * ER/UML editing track).
 *
 * Kit cards are `interactive: true` (their rows are real DOM targets — the
 * binder's node click/drag resolution is geometric, so dragging and selecting
 * the TABLE keeps working; proven live before this was built). This module is
 * the runtime the kit's `finalize(api)` binds once per diagram:
 *
 *  - click a row → it becomes THE selected row (one per diagram), painted with
 *    `.axk-row-selected`; click again or click anywhere else → deselected;
 *  - every row click dispatches `axk:row-click` on the container, and every
 *    selection CHANGE dispatches `axk:row-select` — both bubbling
 *    CustomEvents, matching the element package's "DOM events out" contract;
 *  - the selected row survives card re-renders: the renderer keys the
 *    foreignObject by content hash, so an html edit swaps the subtree and
 *    drops the class — a MutationObserver re-applies it by (nodeId, rowIndex);
 *  - selection is EPHEMERAL view state, exactly like node selection: never
 *    serialized, never in the op log, not undoable.
 *
 * Row identity: `rowIndex` is the position among the card's rows (ER columns,
 * or UML members across both compartments); `name` resolves from the spec the
 * kit stored in node metadata (`kitEntity` / `kitClass`), falling back to the
 * row's text.
 */

export interface RowRef {
  nodeId: string;
  rowIndex: number;
  /** Column name (ER) or member text (UML). */
  name?: string;
  kind: 'er' | 'uml';
  /** UML only: which compartment the member sits in. */
  section?: 'attributes' | 'methods';
}

export interface RowInteractionsHandle {
  getSelected(): RowRef | null;
  /** Programmatic selection (null clears). Fires axk:row-select like a click. */
  select(ref: { nodeId: string; rowIndex: number } | null): void;
  dispose(): void;
}

interface KitApi {
  container: HTMLElement;
  getModel(): {
    getNode(id: string): { getMetadata?(key: string): unknown } | undefined;
  };
}

const ROW_SELECTOR = '.axk-row, .axk-member';
const SELECTED_CLASS = 'axk-row-selected';

/** One binding per container — rebinding disposes the previous one. */
const bindings = new WeakMap<HTMLElement, RowInteractionsHandle>();

function rowsOfNode(container: HTMLElement, nodeId: string): HTMLElement[] {
  const esc = (window.CSS && CSS.escape) ? CSS.escape(nodeId) : nodeId.replace(/"/g, '\\"');
  const group = container.querySelector(`[data-node-id="${esc}"]`);
  return group ? (Array.from(group.querySelectorAll(ROW_SELECTOR)) as HTMLElement[]) : [];
}

function resolveRef(container: HTMLElement, api: KitApi, rowEl: HTMLElement): RowRef | null {
  const group = rowEl.closest('[data-node-id]');
  if (!group) return null;
  const nodeId = group.getAttribute('data-node-id')!;
  const rows = Array.from(group.querySelectorAll(ROW_SELECTOR)) as HTMLElement[];
  const rowIndex = rows.indexOf(rowEl);
  if (rowIndex === -1) return null;
  const kind: RowRef['kind'] = rowEl.classList.contains('axk-member') ? 'uml' : 'er';

  const node = api.getModel?.().getNode?.(nodeId);
  const meta = (key: string) => node?.getMetadata?.(key) as Record<string, unknown> | undefined;

  if (kind === 'er') {
    const entity = meta('kitEntity') as { columns?: Array<{ name?: string }> } | undefined;
    const name = entity?.columns?.[rowIndex]?.name ?? rowEl.querySelector('.axk-col')?.textContent ?? undefined;
    return { nodeId, rowIndex, name: name ?? undefined, kind };
  }

  const cls = meta('kitClass') as { attributes?: string[]; methods?: string[] } | undefined;
  const attrCount = cls?.attributes?.length ?? countFirstCompartment(rowEl);
  const section: RowRef['section'] = rowIndex < attrCount ? 'attributes' : 'methods';
  const name =
    (section === 'attributes' ? cls?.attributes?.[rowIndex] : cls?.methods?.[rowIndex - attrCount]) ??
    rowEl.textContent?.trim() ??
    undefined;
  return { nodeId, rowIndex, name, kind, section };
}

/** Without spec metadata, the first compartment's member count splits sections. */
function countFirstCompartment(rowEl: HTMLElement): number {
  const card = rowEl.closest('.axk-uml');
  const firstComp = card?.querySelector('.axk-uml-comp');
  return firstComp ? firstComp.querySelectorAll('.axk-member').length : Number.MAX_SAFE_INTEGER;
}

export function bindRowInteractions(api: KitApi): RowInteractionsHandle {
  const container = api.container;
  bindings.get(container)?.dispose();

  let selected: RowRef | null = null;

  const paint = () => {
    for (const el of Array.from(container.querySelectorAll(`.${SELECTED_CLASS}`))) {
      el.classList.remove(SELECTED_CLASS);
    }
    if (selected) rowsOfNode(container, selected.nodeId)[selected.rowIndex]?.classList.add(SELECTED_CLASS);
  };

  const emitSelect = () => {
    container.dispatchEvent(new CustomEvent('axk:row-select', { bubbles: true, detail: { selected } }));
  };

  const setSelected = (next: RowRef | null) => {
    const same =
      (next === null && selected === null) ||
      (next !== null && selected !== null && next.nodeId === selected.nodeId && next.rowIndex === selected.rowIndex);
    if (same) return;
    selected = next;
    paint();
    emitSelect();
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const rowEl = target?.closest?.(ROW_SELECTOR) as HTMLElement | null;
    if (!rowEl || !container.contains(rowEl)) {
      setSelected(null);
      return;
    }
    const ref = resolveRef(container, api, rowEl);
    if (!ref) return;
    container.dispatchEvent(new CustomEvent('axk:row-click', { bubbles: true, detail: { ...ref } }));
    const isReclick = selected && selected.nodeId === ref.nodeId && selected.rowIndex === ref.rowIndex;
    setSelected(isReclick ? null : ref);
  };

  // Card re-renders replace the foreignObject subtree (content-hash keyed) and
  // lose the class — re-apply whenever the selected row's paint went missing.
  const observer = new MutationObserver(() => {
    if (!selected) return;
    const el = rowsOfNode(container, selected.nodeId)[selected.rowIndex];
    if (el && !el.classList.contains(SELECTED_CLASS)) paint();
    else if (!el) {
      // The row (or its node) is gone — the selection dies with it.
      setSelected(null);
    }
  });

  container.addEventListener('click', onClick);
  observer.observe(container, { childList: true, subtree: true });

  const handle: RowInteractionsHandle = {
    getSelected: () => (selected ? { ...selected } : null),
    select: (ref) => {
      if (ref === null) {
        setSelected(null);
        return;
      }
      const el = rowsOfNode(container, ref.nodeId)[ref.rowIndex];
      if (!el) return;
      const resolved = resolveRef(container, api, el);
      if (resolved) setSelected(resolved);
    },
    dispose: () => {
      container.removeEventListener('click', onClick);
      observer.disconnect();
      if (bindings.get(container) === handle) bindings.delete(container);
    },
  };
  bindings.set(container, handle);
  return handle;
}
