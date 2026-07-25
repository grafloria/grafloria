/**
 * The shape-data panel — Visio's "Shape Data" window.
 *
 * T9. Every master ships a `dataSchema` (all 80 generated ones do) and the values
 * live on `node.data`. The renderer already had a full `property-schema/` type
 * contract, but it was TYPES ONLY — zero runtime — and the one working property
 * sheet was inside the Angular wrapper, unreachable from a vanilla / React / Vue
 * embed. This is the framework-free runtime: read the selected node's schema,
 * render its fields, and write them back through `SetNodeDataCommand` so every
 * edit is undoable and collab-safe (per-key, matching node.data's LWW registers).
 */
import { SetNodeDataCommand } from '@grafloria/engine';
import { ensureStencilKitStyles } from './styles';

/** A JSON-Schema-shaped field description, as the masters author it. */
interface SchemaProp {
  type?: string;
  default?: unknown;
  enum?: unknown[];
  title?: string;
  description?: string;
}

export interface ShapeDataPanelApi {
  getEngine(): any;
  getModel(): any;
  on(event: string, handler: (payload: any) => void): () => void;
}

export interface ShapeDataPanelOptions {
  /** Heading above the fields (default "Shape data"). */
  title?: string;
  /** Shown when nothing (or more than one thing) is selected. */
  emptyText?: string;
  /** Called after an edit commits. */
  onEdit?: (info: { nodeId: string; key: string; value: unknown }) => void;
}

export interface ShapeDataPanelHandle {
  /** Re-read the selection and rebuild the fields. */
  refresh(): void;
  destroy(): void;
}

/** The schema a node's shape data follows, via the master it was stamped from. */
function schemaFor(engine: any, node: any): Record<string, SchemaProp> | null {
  const templateId = node?.getMetadata?.('templateId');
  if (!templateId) return null;
  const master = engine?.templateRegistry?.get?.(templateId);
  const props = master?.dataSchema?.properties;
  return props && typeof props === 'object' ? (props as Record<string, SchemaProp>) : null;
}

/** Turn `unitCost` / `unit_cost` into "Unit cost" for the field label. */
function humanize(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Bind a shape-data panel into `host`. It follows the diagram's selection: one
 * node selected → its schema's fields; anything else → the empty message.
 */
export function bindShapeDataPanel(
  api: ShapeDataPanelApi,
  host: HTMLElement,
  options: ShapeDataPanelOptions = {}
): ShapeDataPanelHandle {
  ensureStencilKitStyles(host.ownerDocument ?? document);
  host.classList.add('gf-shapedata');

  const title = options.title ?? 'Shape data';
  const emptyText = options.emptyText ?? 'Select a shape to edit its data.';

  function render(): void {
    host.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'gf-sd-title';
    head.textContent = title;
    host.appendChild(head);

    const diagram = api.getModel();
    const engine = api.getEngine();
    const selected = (diagram?.getSelectedNodes?.() ?? []) as any[];

    if (selected.length !== 1) {
      const empty = document.createElement('div');
      empty.className = 'gf-sd-empty';
      empty.textContent = selected.length > 1 ? 'Select a single shape.' : emptyText;
      host.appendChild(empty);
      return;
    }

    const node = selected[0];
    const props = schemaFor(engine, node);
    if (!props || Object.keys(props).length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gf-sd-empty';
      empty.textContent = 'This shape has no data fields.';
      host.appendChild(empty);
      return;
    }

    const form = document.createElement('div');
    form.className = 'gf-sd-fields';

    for (const [key, prop] of Object.entries(props)) {
      const row = document.createElement('label');
      row.className = 'gf-sd-row';

      const label = document.createElement('span');
      label.className = 'gf-sd-label';
      label.textContent = prop.title ?? humanize(key);
      if (prop.description) row.title = prop.description;
      row.appendChild(label);

      const current = node.getData?.(key) ?? prop.default ?? '';
      // Commit through the command so the edit is undoable and collab-safe.
      const commit = (value: unknown) => {
        void engine.commandManager.execute(new SetNodeDataCommand(node.id, { [key]: value }));
        options.onEdit?.({ nodeId: node.id, key, value });
      };

      let field: HTMLElement;
      if (Array.isArray(prop.enum) && prop.enum.length > 0) {
        const sel = document.createElement('select');
        sel.className = 'gf-sd-input';
        for (const opt of prop.enum) {
          const o = document.createElement('option');
          o.value = String(opt);
          o.textContent = String(opt);
          if (String(opt) === String(current)) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => commit(sel.value));
        field = sel;
      } else if (prop.type === 'boolean') {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'gf-sd-check';
        box.checked = current === true || current === 'true';
        box.addEventListener('change', () => commit(box.checked));
        field = box;
      } else {
        const input = document.createElement('input');
        const numeric = prop.type === 'number' || prop.type === 'integer';
        input.type = numeric ? 'number' : 'text';
        input.className = 'gf-sd-input';
        input.value = current === undefined || current === null ? '' : String(current);
        // Commit on change (blur / Enter), not per keystroke: one undo entry per edit.
        input.addEventListener('change', () => {
          if (numeric) {
            const n = input.value === '' ? null : Number(input.value);
            if (n !== null && Number.isNaN(n)) { input.value = String(node.getData?.(key) ?? ''); return; }
            commit(n);
          } else {
            commit(input.value);
          }
        });
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();                       // keep canvas keys out of the field
          if ((e as KeyboardEvent).key === 'Enter') input.blur();
        });
        field = input;
      }
      row.appendChild(field);
      form.appendChild(row);
    }
    host.appendChild(form);
  }

  const off = api.on('selection:change', () => render());
  render();

  return {
    refresh: render,
    destroy() {
      off?.();
      host.classList.remove('gf-shapedata');
      host.innerHTML = '';
    },
  };
}
