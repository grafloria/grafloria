/**
 * The shape-data panel — Visio's "Shape Data" window, grown into the full
 * properties panel Visio users actually expect.
 *
 * T9 built the dataSchema form: read the selected node's schema, render its
 * fields, write them back through `SetNodeDataCommand`. The audit then held it
 * against Visio and found the gap: a plain node said "This shape has no data
 * fields.", a selected EDGE said "Select a shape…", multi-select said "Select a
 * single shape." — but a Visio user gets Name, Size & Position and Format for
 * EVERYTHING selected. So now:
 *
 *   one node   → Shape (Name), Size & Position (X/Y/W/H), Format (fill, line,
 *                width, dash, corner radius on rect silhouettes) — then the
 *                master's dataSchema fields, unchanged, below.
 *   a kit card → Size & Position, then the kit Table/Column (or Class) sections
 *                EXACTLY as before. No Format: an ER/UML card paints
 *                `fill:none` shells on purpose — its look belongs to the kit.
 *   one edge   → Label, Line, Arrows (the engine marker vocabulary), Route.
 *   N > 1      → "N shapes" plus a Format section that restyles the whole
 *                selection as ONE undo entry.
 *
 * Every write goes through a command (SetNodeLabel / Move / Resize /
 * SetNodeStyle / SetNodeShapeConfig / UpdateLinkStyle / SetLinkDisplayLabel /
 * SetLinkPathType, batched for multi) so every edit is undoable and
 * collab-safe. The new controls use their own `gf-sd-ctl` class — the legacy
 * `.gf-sd-input` selector contract (first match = first dataSchema field; the
 * kit card's Name rows) is load-bearing for existing demos and gates.
 */
import {
  BatchCommand,
  MoveNodeCommand,
  ResizeNodeCommand,
  SetLinkDisplayLabelCommand,
  SetLinkPathTypeCommand,
  SetNodeDataCommand,
  SetNodeLabelCommand,
  SetNodeShapeConfigCommand,
  SetNodeStyleCommand,
  UpdateLinkStyleCommand,
} from '@grafloria/engine';
import { erTable, umlClass } from '../diagram-kit';
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

/** `<input type=color>` accepts ONLY #rrggbb — normalise or fall back. */
function toHexColor(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const v = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }
  return fallback;
}

/** The engine's built-in marker vocabulary (ArrowStyle.type literals). */
const ARROW_TYPES = [
  'none', 'arrow', 'circle', 'square', 'diamond',
  'hollow-diamond', 'filled-diamond', 'generalization', 'open-arrow', 'double-arrow',
  'crow-foot', 'one', 'zero-or-one', 'zero-or-many', 'one-or-many',
  'cross', 'bar', 'dot', 'oval', 'half-arrow-left', 'half-arrow-right',
];

const ROUTE_TYPES = ['smooth', 'orthogonal', 'direct', 'bezier'];

/** Dash pattern the "Dashed" checkbox writes. */
const DASH = '6 4';

const PANEL_STYLE_ID = 'grafloria-shapedata-panel-styles';

/**
 * The NEW controls' css, kept panel-local: `styles.ts` belongs to the stencil
 * rail/palette work, and the legacy `.gf-sd-*` classes it defines are a shared
 * selector contract this file must not churn.
 */
function ensureShapeDataPanelStyles(doc: Document = document): void {
  if (doc.getElementById(PANEL_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = PANEL_STYLE_ID;
  style.textContent = `
.gf-sd-ctl {
  padding: 6px 8px; border: 1px solid var(--gf-st-line, #e5e7eb); border-radius: 7px;
  background: var(--gf-st-bg, #fff); color: var(--gf-st-ink, #1e2436);
  font: inherit; outline: none; width: 100%; box-sizing: border-box;
}
.gf-sd-ctl:focus { border-color: var(--gf-st-accent, #3B52D9); }
.gf-sd-color {
  width: 100%; height: 28px; padding: 1px 2px; box-sizing: border-box; cursor: pointer;
  border: 1px solid var(--gf-st-line, #e5e7eb); border-radius: 7px; background: var(--gf-st-bg, #fff);
}
.gf-sd-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.gf-sd-inline { display: flex; flex-direction: row; align-items: center; gap: 8px; }
.gf-sd-inline .gf-sd-label { flex: 1; }
.gf-sd-count { padding: 12px 12px 0; font-weight: 600; font-size: 12px; }
`;
  doc.head.appendChild(style);
}

/**
 * Bind a shape-data panel into `host`. It follows the diagram's selection:
 * nodes, edges and multi-selections each get their own sections; nothing
 * selected shows the empty message.
 */
export function bindShapeDataPanel(
  api: ShapeDataPanelApi,
  host: HTMLElement,
  options: ShapeDataPanelOptions = {}
): ShapeDataPanelHandle {
  const doc = host.ownerDocument ?? document;
  ensureStencilKitStyles(doc);
  ensureShapeDataPanelStyles(doc);
  host.classList.add('gf-shapedata');

  const title = options.title ?? 'Shape data';
  const emptyText = options.emptyText ?? 'Select a shape to edit its data.';

  /** Execute a command, then rebuild so clamped/normalised values show. */
  function exec(cmd: any): void {
    const engine = api.getEngine();
    Promise.resolve(engine?.commandManager?.execute?.(cmd)).then(
      () => render(),
      () => render()
    );
  }

  function render(): void {
    host.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'gf-sd-title';
    head.textContent = title;
    host.appendChild(head);

    const diagram = api.getModel();
    const engine = api.getEngine();
    const nodes = (diagram?.getSelectedNodes?.() ?? []) as any[];
    const links = ((diagram?.getLinks?.() ?? []) as any[]).filter((l) => l?.state === 'selected');
    const total = nodes.length + links.length;

    if (total === 0) {
      const empty = document.createElement('div');
      empty.className = 'gf-sd-empty';
      empty.textContent = emptyText;
      host.appendChild(empty);
      return;
    }

    if (total > 1) {
      renderMulti(nodes, links);
      return;
    }

    if (links.length === 1) {
      renderLink(links[0]);
      return;
    }

    const node = nodes[0];
    const isKit = !!(node.getMetadata?.('kitEntity') || node.getMetadata?.('kitClass'));

    renderNodeSections(node, isKit);

    // KIT CARDS keep their own sections. An ER entity / UML class is not a
    // schema-shaped bag of scalars — it is a card the diagram kit already owns,
    // with a live handle API (`erTable(api,id)`) and a row-selection event.
    // Driving that is the whole point: it is the same surface `erd-editor`
    // edits, so the panel and the canvas can never disagree. The dataSchema
    // path below stays for plain template masters.
    if (isKit) {
      renderKitCard(node);
      return;
    }

    const props = schemaFor(engine, node);
    if (!props || Object.keys(props).length === 0) return;

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

  // ── the Visio sections every node gets ────────────────────────────────────

  /** Smallest size a resize may produce — the gesture path's floor + the node's own minimum. */
  function minSize(node: any): { w: number; h: number } {
    const sizing = (node.getMetadata?.('sizing') ?? {}) as { minWidth?: number; minHeight?: number };
    return { w: Math.max(16, sizing.minWidth ?? 0), h: Math.max(16, sizing.minHeight ?? 0) };
  }

  function renderNodeSections(node: any, isKit: boolean): void {
    const form = document.createElement('div');
    form.className = 'gf-sd-fields';

    if (!isKit) {
      form.appendChild(sectionLabel('Shape'));
      form.appendChild(
        ctlTextField('Name', String(node.getLabel?.() ?? ''), (v) =>
          exec(new SetNodeLabelCommand(node.id, v))
        )
      );
    }

    form.appendChild(sectionLabel('Size & Position'));
    const move = (x: number, y: number) =>
      exec(new MoveNodeCommand(node.id, { x, y, z: node.position?.z }, undefined, { mergeable: false }));
    const resize = (w: number, h: number) => {
      const min = minSize(node);
      exec(
        new ResizeNodeCommand(node.id, {
          width: Math.max(min.w, w),
          height: Math.max(min.h, h),
          depth: node.size?.depth,
        })
      );
    };
    form.appendChild(
      pair(
        numberField('X', () => node.position?.x ?? 0, (n) => move(n, node.position?.y ?? 0)),
        numberField('Y', () => node.position?.y ?? 0, (n) => move(node.position?.x ?? 0, n))
      )
    );
    form.appendChild(
      pair(
        numberField('W', () => node.size?.width ?? 0, (n) => resize(n, node.size?.height ?? 0)),
        numberField('H', () => node.size?.height ?? 0, (n) => resize(node.size?.width ?? 0, n))
      )
    );

    // NO Format for kit cards: their shells are `fill:none` ON PURPOSE — the
    // card's look belongs to the kit, and a panel fill write would repaint the
    // transparent shell into a solid slab over the rows.
    if (!isKit) {
      const shape = (node.getMetadata?.('shape') ?? {}) as Record<string, any>;
      const style = (node.style ?? {}) as Record<string, any>;

      form.appendChild(sectionLabel('Format'));
      form.appendChild(
        colorField('Fill', toHexColor(style['fill'] ?? shape['fill'], '#ffffff'), (v) =>
          exec(new SetNodeStyleCommand(node.id, { fill: v }))
        )
      );
      form.appendChild(
        colorField('Line', toHexColor(style['stroke'] ?? shape['stroke'], '#333333'), (v) =>
          exec(new SetNodeStyleCommand(node.id, { stroke: v }))
        )
      );
      form.appendChild(
        numberField('Line width', () => style['strokeWidth'] ?? shape['strokeWidth'] ?? 1, (n) =>
          exec(new SetNodeStyleCommand(node.id, { strokeWidth: Math.max(0, n) }))
        )
      );
      form.appendChild(
        checkField('Dashed', !!style['strokeDasharray'], (c) =>
          exec(new SetNodeStyleCommand(node.id, { strokeDasharray: c ? DASH : undefined }))
        )
      );

      // Corner radius only where the silhouette HAS corners: the rect family.
      const silhouette = shape['type'] ?? 'rect';
      if (silhouette === 'rect') {
        form.appendChild(
          numberField(
            'Corner radius',
            () => style['borderRadius'] ?? shape['cornerRadius'] ?? 0,
            (n) => {
              const r = Math.max(0, n);
              // shape.cornerRadius is GEOMETRY and defers over the style-borne
              // borderRadius — on masters that ship it (BPMN tasks), the style
              // write would not paint. Edit the key that does.
              exec(
                shape['cornerRadius'] !== undefined
                  ? new SetNodeShapeConfigCommand(node.id, { cornerRadius: r })
                  : new SetNodeStyleCommand(node.id, { borderRadius: r })
              );
            }
          )
        );
      }
    }

    host.appendChild(form);
  }

  // ── one selected edge ─────────────────────────────────────────────────────

  function renderLink(link: any): void {
    const form = document.createElement('div');
    form.className = 'gf-sd-fields';
    const style = (link.style ?? {}) as Record<string, any>;

    form.appendChild(sectionLabel('Label'));
    form.appendChild(
      ctlTextField('Text', String(link.getLabel?.() ?? ''), (v) =>
        exec(new SetLinkDisplayLabelCommand(link.id, v))
      )
    );

    form.appendChild(sectionLabel('Line'));
    form.appendChild(
      colorField('Colour', toHexColor(style['stroke'], '#999999'), (v) =>
        exec(new UpdateLinkStyleCommand(link.id, { stroke: v }))
      )
    );
    form.appendChild(
      numberField('Width', () => style['strokeWidth'] ?? 2, (n) =>
        exec(new UpdateLinkStyleCommand(link.id, { strokeWidth: Math.max(0, n) }))
      )
    );
    form.appendChild(
      checkField('Dashed', !!style['strokeDasharray'], (c) =>
        exec(new UpdateLinkStyleCommand(link.id, { strokeDasharray: c ? DASH : undefined }))
      )
    );

    form.appendChild(sectionLabel('Arrows'));
    const marker = (slot: 'arrowTail' | 'arrowHead', type: string) => {
      const existing = (style[slot] ?? {}) as Record<string, any>;
      exec(
        new UpdateLinkStyleCommand(link.id, {
          [slot]: { size: 10, filled: true, ...existing, type },
        } as any)
      );
    };
    // The renderer paints an implicit 'arrow' head when none is set — seed the
    // select with what the user SEES, not with the absent key.
    form.appendChild(
      selectField('Start', ARROW_TYPES, String(style['arrowTail']?.type ?? 'none'), (v) =>
        marker('arrowTail', v)
      )
    );
    form.appendChild(
      selectField('End', ARROW_TYPES, String(style['arrowHead']?.type ?? 'arrow'), (v) =>
        marker('arrowHead', v)
      )
    );

    form.appendChild(sectionLabel('Route'));
    form.appendChild(
      selectField('Path', ROUTE_TYPES, String(link.pathType ?? 'smooth'), (v) =>
        exec(new SetLinkPathTypeCommand(link.id, v as any))
      )
    );

    host.appendChild(form);
  }

  // ── multi-selection ───────────────────────────────────────────────────────

  function renderMulti(nodes: any[], links: any[]): void {
    const count = document.createElement('div');
    count.className = 'gf-sd-count';
    count.textContent = `${nodes.length + links.length} shapes`;
    host.appendChild(count);

    // Kit cards keep their kit look — see the single-node Format note.
    const styleNodes = nodes.filter(
      (n) => !(n.getMetadata?.('kitEntity') || n.getMetadata?.('kitClass'))
    );
    if (styleNodes.length + links.length === 0) return;

    const nodeIds = styleNodes.map((n) => n.id);
    const seed = (styleNodes[0] ?? links[0]) as any;
    const seedStyle = (seed?.style ?? {}) as Record<string, any>;

    /** The whole selection restyled as ONE undo entry. */
    const applyAll = (nodePatch: Record<string, unknown> | null, linkPatch: Record<string, unknown> | null) => {
      const cmds: any[] = [];
      if (nodePatch && nodeIds.length > 0) cmds.push(new SetNodeStyleCommand(nodeIds, nodePatch));
      if (linkPatch) for (const l of links) cmds.push(new UpdateLinkStyleCommand(l.id, linkPatch));
      if (cmds.length === 0) return;
      exec(cmds.length === 1 ? cmds[0] : new BatchCommand('Format selection', cmds));
    };

    const form = document.createElement('div');
    form.className = 'gf-sd-fields';
    form.appendChild(sectionLabel('Format'));

    if (nodeIds.length > 0) {
      form.appendChild(
        colorField('Fill', toHexColor(seedStyle['fill'], '#ffffff'), (v) => applyAll({ fill: v }, null))
      );
    }
    form.appendChild(
      colorField('Line', toHexColor(seedStyle['stroke'], '#333333'), (v) =>
        applyAll({ stroke: v }, { stroke: v })
      )
    );
    form.appendChild(
      numberField('Line width', () => seedStyle['strokeWidth'] ?? 1, (n) => {
        const w = Math.max(0, n);
        applyAll({ strokeWidth: w }, { strokeWidth: w });
      })
    );
    form.appendChild(
      checkField('Dashed', !!seedStyle['strokeDasharray'], (c) => {
        const dash = c ? DASH : undefined;
        applyAll({ strokeDasharray: dash }, { strokeDasharray: dash });
      })
    );

    host.appendChild(form);
  }

  /** Table/class properties, plus the selected column's, Visio-style. */
  function renderKitCard(node: any): void {
    const isEr = !!node.getMetadata('kitEntity');
    const spec = node.getMetadata(isEr ? 'kitEntity' : 'kitClass');
    const handle: any = isEr ? erTable(api as any, node.id) : umlClass(api as any, node.id);

    const form = document.createElement('div');
    form.className = 'gf-sd-fields';

    // ── the card itself ──
    form.appendChild(sectionLabel(isEr ? 'Table' : 'Class'));
    form.appendChild(textField('Name', spec?.name ?? node.id, (v) => { void handle.rename(v); }));
    form.appendChild(readOnlyField(isEr ? 'Columns' : 'Members',
      String(isEr ? (spec?.columns?.length ?? 0)
                  : ((spec?.attributes?.length ?? 0) + (spec?.methods?.length ?? 0)))));

    // ── the selected row, if any ──
    const rowHost = document.createElement('div');
    form.appendChild(rowHost);
    const showField = (field: any) => {
      rowHost.innerHTML = '';
      if (!field) {
        rowHost.appendChild(hint('Click a column to edit it.'));
        return;
      }
      // ErField exposes name/type/pk/fk as getters over the live spec.
      rowHost.appendChild(sectionLabel('Column'));
      rowHost.appendChild(textField('Name', field.name ?? '', (v) => { void field.rename(v); }));
      rowHost.appendChild(textField('Type', field.type ?? '', (v) => { void field.setType(v); }));
      if (field.pk || field.fk) {
        rowHost.appendChild(readOnlyField('Key', [field.pk && 'PK', field.fk && 'FK'].filter(Boolean).join(' + ')));
      }
      const del = document.createElement('button');
      del.className = 'gf-sd-danger';
      del.textContent = 'Delete column';
      del.addEventListener('click', () => { void field.remove(); rowHost.innerHTML = ''; });
      rowHost.appendChild(del);
    };
    showField(isEr ? handle.selectedColumn ?? null : null);
    // Live: the panel follows the kit's own row-selection event.
    offRow?.();
    offRow = handle.onRowSelect?.(({ field }: any) => showField(field)) ?? null;

    host.appendChild(form);
  }

  const sectionLabel = (text: string) => {
    const el = document.createElement('div');
    el.className = 'gf-sd-section';
    el.textContent = text;
    return el;
  };
  const hint = (text: string) => {
    const el = document.createElement('div');
    el.className = 'gf-sd-empty';
    el.textContent = text;
    return el;
  };
  const readOnlyField = (label: string, value: string) => {
    const row = document.createElement('label');
    row.className = 'gf-sd-row';
    const l = document.createElement('span'); l.className = 'gf-sd-label'; l.textContent = label;
    const v = document.createElement('input'); v.className = 'gf-sd-input'; v.value = value; v.readOnly = true;
    row.append(l, v); return row;
  };
  const textField = (label: string, value: string, commit: (v: string) => void) => {
    const row = document.createElement('label');
    row.className = 'gf-sd-row';
    const l = document.createElement('span'); l.className = 'gf-sd-label'; l.textContent = label;
    const i = document.createElement('input'); i.className = 'gf-sd-input'; i.value = value;
    i.addEventListener('change', () => commit(i.value));
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e as KeyboardEvent).key === 'Enter') i.blur(); });
    row.append(l, i); return row;
  };

  // ── the NEW controls (gf-sd-ctl, NOT gf-sd-input — see the header note) ──

  const fieldRow = (label: string, field: HTMLElement, inline = false) => {
    const row = document.createElement('label');
    row.className = inline ? 'gf-sd-row gf-sd-inline' : 'gf-sd-row';
    const l = document.createElement('span'); l.className = 'gf-sd-label'; l.textContent = label;
    row.append(l, field);
    return row;
  };

  const ctlTextField = (label: string, value: string, commit: (v: string) => void) => {
    const i = document.createElement('input');
    i.type = 'text';
    i.className = 'gf-sd-ctl';
    i.value = value;
    i.addEventListener('change', () => commit(i.value));
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e as KeyboardEvent).key === 'Enter') i.blur(); });
    return fieldRow(label, i);
  };

  /**
   * Numeric input that CANNOT write garbage: on blur/Enter the value is parsed,
   * and anything unparseable reverts to the model's current value — no NaN ever
   * reaches a command.
   */
  const numberField = (label: string, current: () => number, commit: (n: number) => void) => {
    const i = document.createElement('input');
    i.type = 'number';
    i.className = 'gf-sd-ctl';
    i.step = 'any';
    const seed = () => { i.value = String(Math.round((current() ?? 0) * 100) / 100); };
    seed();
    i.addEventListener('change', () => {
      const n = Number(i.value);
      if (i.value.trim() === '' || !Number.isFinite(n)) { seed(); return; }
      commit(n);
    });
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e as KeyboardEvent).key === 'Enter') i.blur(); });
    return fieldRow(label, i);
  };

  const colorField = (label: string, hex: string, commit: (v: string) => void) => {
    const i = document.createElement('input');
    i.type = 'color';
    i.className = 'gf-sd-color';
    i.value = hex;
    // 'change' fires once when the picker commits — one undo entry per edit.
    i.addEventListener('change', () => commit(i.value));
    return fieldRow(label, i);
  };

  const checkField = (label: string, checked: boolean, commit: (c: boolean) => void) => {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.className = 'gf-sd-check';
    i.checked = checked;
    i.addEventListener('change', () => commit(i.checked));
    return fieldRow(label, i, true);
  };

  const selectField = (label: string, opts: string[], current: string, commit: (v: string) => void) => {
    const sel = document.createElement('select');
    sel.className = 'gf-sd-ctl';
    const values = opts.includes(current) ? opts : [current, ...opts];
    for (const opt of values) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => commit(sel.value));
    return fieldRow(label, sel);
  };

  const pair = (a: HTMLElement, b: HTMLElement) => {
    const wrap = document.createElement('div');
    wrap.className = 'gf-sd-pair';
    wrap.append(a, b);
    return wrap;
  };

  let offRow: (() => void) | null = null;
  const off = api.on('selection:change', () => render());
  render();

  return {
    refresh: render,
    destroy() {
      offRow?.();
      off?.();
      host.classList.remove('gf-shapedata');
      host.innerHTML = '';
    },
  };
}
