/**
 * ER diagram kit — typed builders for database entity-relationship diagrams.
 *
 * The packaged form of what demos/diagrams/table-er.html and er-advanced.html
 * hand-composed: HTML "table" cards (header, typed columns, PK/FK badges),
 * crow's-foot cardinality edges, and field-level FK→PK connections via
 * absolute-layout ports. An embedder writes data:
 *
 * ```ts
 * const spec = erDiagram({
 *   entities: [
 *     { id: 'CUSTOMER', columns: [{ name: 'id', type: 'int', pk: true }, …] },
 *     { id: 'ORDER',    columns: [{ name: 'customer_id', type: 'int', fk: true }, …] },
 *   ],
 *   relationships: [
 *     { from: 'CUSTOMER', to: 'ORDER', label: 'places' },              // table-level
 *     { from: 'ORDER.customer_id', to: 'CUSTOMER.id' },                // field-level
 *   ],
 * });
 * render(spec, container);
 * ```
 */
import { ensureDiagramKitStyles } from './styles';
import { bindRowInteractions } from './rows';
import { entityCardContent, entityAutoHeight, erRowCenterY, ER_ROW_H, ER_HEAD_H } from './card';
import { bindCardEditing } from './editing';

// Layout constants + the row-centre helper live in card.ts now (the ONE source
// of truth shared with update.ts). Re-exported here so `import … from './er'`
// keeps working.
export { erRowCenterY, ER_ROW_H, ER_HEAD_H };

const DEFAULT_WIDTH = 190;

export interface ErColumn {
  name: string;
  type?: string;
  pk?: boolean;
  fk?: boolean;
}

export interface ErEntitySpec {
  id: string;
  /** Header text. Defaults to the id. */
  name?: string;
  columns: ErColumn[];
  position?: { x: number; y: number };
  width?: number;
  /**
   * Fixed card height. When smaller than the computed height the column list
   * SCROLLS (the kit body is overflow-y:auto, and the canvas yields the wheel
   * to it). Omit for auto-height from the column count.
   */
  height?: number;
}

export type ErCardinality =
  | 'one-to-many'
  | 'one-to-one'
  | 'many-to-many'
  | 'one-to-zero-or-many'
  | 'one-to-one-or-many';

export type ErSide = 'left' | 'right' | 'top' | 'bottom';

export interface ErRelationshipSpec {
  /** Entity id, or `ENTITY.column` to attach at that column's row. */
  from: string;
  to: string;
  label?: string;
  /** Named cardinality (default one-to-many) or explicit marker types. */
  cardinality?: ErCardinality | { tail: string; head: string };
  fromSide?: ErSide;
  toSide?: ErSide;
  color?: string;
  id?: string;
}

export interface ErDiagramOptions {
  entities: ErEntitySpec[];
  relationships?: ErRelationshipSpec[];
  /**
   * Rows are selectable by default: click a column to select it (painted with
   * .axk-row-selected; axk:row-click / axk:row-select CustomEvents fire on the
   * container). Set false to opt out.
   */
  rowSelection?: boolean;
  /**
   * In-canvas editing (opt-in, default false — read-only diagrams are
   * unchanged). When true the card grows editing chrome: double-click the
   * header to rename the table, double-click a column name to rename it, an
   * "add column" affordance and a per-row delete control. Every change routes
   * through {@link updateEntity} as ONE undoable step.
   */
  editable?: boolean;
}

const CARDINALITY: Record<ErCardinality, { tail: string; head: string }> = {
  'one-to-many': { tail: 'one', head: 'crow-foot' },
  'one-to-one': { tail: 'one', head: 'one' },
  'many-to-many': { tail: 'crow-foot', head: 'crow-foot' },
  'one-to-zero-or-many': { tail: 'one', head: 'zero-or-many' },
  'one-to-one-or-many': { tail: 'one', head: 'one-or-many' },
};

interface ParsedEnd {
  entity: ErEntitySpec;
  column?: string;
  rowIndex?: number;
}

function parseEnd(ref: string, byId: Map<string, ErEntitySpec>): ParsedEnd {
  const dot = ref.indexOf('.');
  const entityId = dot === -1 ? ref : ref.slice(0, dot);
  const entity = byId.get(entityId);
  if (!entity) throw new Error(`erDiagram: unknown entity "${entityId}" in relationship end "${ref}"`);
  if (dot === -1) return { entity };
  const column = ref.slice(dot + 1);
  const rowIndex = entity.columns.findIndex((c) => c.name === column);
  if (rowIndex === -1) {
    throw new Error(`erDiagram: entity "${entityId}" has no column "${column}" (relationship end "${ref}")`);
  }
  return { entity, column, rowIndex };
}

/**
 * Build a render() spec for an ER diagram.
 *
 * Entities become HTML table cards; relationships become orthogonal edges with
 * crow's-foot cardinality. A `TABLE.column` end pins the edge to that row via
 * an absolute-layout port (the FK→PK look). Two edges landing on the same
 * column are automatically spread apart.
 */
export function erDiagram(options: ErDiagramOptions): {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  finalize: (api: unknown) => void;
} {
  ensureDiagramKitStyles();

  const byId = new Map(options.entities.map((e) => [e.id, e]));
  // Field-level ports are accumulated per entity while walking relationships.
  const portsByEntity = new Map<string, Array<Record<string, unknown>>>();
  // How many edges already landed on a given entity row+side — drives the
  // spread (dy) so shared columns (a PK referenced twice) don't stack.
  const rowLandings = new Map<string, number>();

  const width = (e: ErEntitySpec) => e.width ?? DEFAULT_WIDTH;

  const fieldPort = (end: ParsedEnd, side: ErSide): string => {
    const entity = end.entity;
    const key = `${entity.id}#${end.rowIndex}#${side}`;
    const landing = rowLandings.get(key) ?? 0;
    rowLandings.set(key, landing + 1);
    // Spread repeat landings ±5px around the row centre: 0, -5, +5, -10, …
    const dy = landing === 0 ? 0 : (landing % 2 === 1 ? -1 : 1) * Math.ceil(landing / 2) * 5;
    const id = `${entity.id}__${end.column}__${side}__${landing}`;
    const w = width(entity);
    const port = {
      id,
      side,
      visible: false,
      layout: {
        strategy: 'absolute',
        args: {
          units: 'px',
          x: side === 'right' ? w : side === 'left' ? 0 : w / 2,
          y: erRowCenterY(end.rowIndex!),
          dy,
        },
      },
    };
    const bucket = portsByEntity.get(entity.id) ?? [];
    bucket.push(port);
    portsByEntity.set(entity.id, bucket);
    return id;
  };

  const edges = (options.relationships ?? []).map((rel, i) => {
    const from = parseEnd(rel.from, byId);
    const to = parseEnd(rel.to, byId);
    const fromSide = rel.fromSide ?? 'right';
    const toSide = rel.toSide ?? 'left';
    const markers =
      typeof rel.cardinality === 'object'
        ? rel.cardinality
        : CARDINALITY[rel.cardinality ?? 'one-to-many'];

    return {
      id: rel.id ?? `er-rel-${i + 1}`,
      source: from.entity.id,
      target: to.entity.id,
      label: rel.label,
      type: 'orthogonal',
      sourceHandle: from.column !== undefined ? fieldPort(from, fromSide) : fromSide,
      targetHandle: to.column !== undefined ? fieldPort(to, toSide) : toSide,
      style: {
        stroke: rel.color ?? '#64748b',
        strokeWidth: 1.5,
        arrowTail: { type: markers.tail, size: 8, filled: false },
        arrowHead: { type: markers.head, size: 9, filled: false },
      },
    };
  });

  const editable = options.editable === true;
  const nodes = options.entities.map((entity, i) => ({
    id: entity.id,
    position: entity.position ?? { x: 60 + (i % 3) * 340, y: 60 + Math.floor(i / 3) * 280 },
    size: { width: width(entity), height: entityAutoHeight(entity, editable) },
    // interactive: rows are real DOM targets (hover, row selection, inline
    // editing) — node drag/select stay geometric in the binder.
    metadata: {
      html: { content: entityCardContent(entity, editable), interactive: true },
      kitEntity: entity,
      kitEditable: editable,
      // Only the OPT-OUT is recorded. A loader has to know not to re-bind row
      // selection, but stamping the default on every card would change the bytes
      // of every existing document for a value that is already the default.
      ...(options.rowSelection === false ? { kitRowSelection: false } : {}),
    },
    // The card draws its own border — the node's default rectangle is hidden
    // (and re-suppressed on selection by the kit stylesheet).
    shape: { type: 'rect', fill: 'none', stroke: 'none' },
    style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
    ...(portsByEntity.has(entity.id) ? { ports: portsByEntity.get(entity.id) } : {}),
  }));

  return {
    nodes,
    edges,
    finalize: (api: unknown) => {
      const a = api as { container?: HTMLElement; getModel?: () => { getNode: (id: string) => { setBehavior?: (b: { resizable: boolean }) => void } | undefined } };
      // The card draws its OWN selection ring — suppress the node resize handles
      // on the live model (they'd frame the card in a SECOND rectangle). Set here
      // because the render-input path does not honour a spec-level `behavior`.
      const model = a?.getModel?.();
      if (model) for (const e of options.entities) model.getNode?.(e.id)?.setBehavior?.({ resizable: false });
      if (options.rowSelection !== false && a?.container) bindRowInteractions(a as never);
      // Editing chrome (dbl-click rename, add/delete column) — opt-in, and safe
      // to run alongside row selection (it claims control clicks in the capture
      // phase before the selection handler sees them).
      if (editable && a?.container) bindCardEditing(a as never);
    },
  };
}
