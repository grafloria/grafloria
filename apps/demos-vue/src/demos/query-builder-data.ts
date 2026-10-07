// The framework-free half of the query-builder demo, verbatim from
// demos/diagrams/query-builder.html: the four tables, the card tree (a skin over
// the diagram kit's .axk-* classes), the per-column ports, the join pill, join
// adoption and the SQL generator. The React, Vue, Angular and Qwik versions each
// keep an identical copy next to their demo file.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeModel, PortModel } from '@grafloria/element';

export const ACCENT = '#2080e8';
export const CARD_W = 220;
export const HEAD_H = 34;   // header row (8px padding + 13px/700 line)
export const ROW_H = 28;    // 5px padding + 13px line + top border, border-box
const rowCenterY = (i: number) => 1 + HEAD_H + i * ROW_H + ROW_H / 2; // +1 = card top border

export interface Column { name: string; pk?: boolean; fk?: boolean }
export interface Table { id: string; columns: Column[] }

export const cardHeight = (t: Table) => 2 + HEAD_H + t.columns.length * ROW_H; // both borders

export const TABLES: Table[] = [
  { id: 'customers', columns: [
    { name: 'id', pk: true }, { name: 'name' }, { name: 'email' }, { name: 'country' } ] },
  { id: 'orders', columns: [
    { name: 'id', pk: true }, { name: 'customer_id', fk: true }, { name: 'order_date' }, { name: 'total' } ] },
  { id: 'order_items', columns: [
    { name: 'id', pk: true }, { name: 'order_id', fk: true }, { name: 'product_id', fk: true },
    { name: 'quantity' }, { name: 'price' } ] },
  { id: 'products', columns: [
    { name: 'id', pk: true }, { name: 'sku' }, { name: 'name' }, { name: 'unit_price' } ] },
];
export const tableOf = (id: string) => TABLES.find((t) => t.id === id);

/** Column-check state (drives the card DOM AND the SELECT list): table → ticked columns. */
export type Checked = Map<string, Set<string>>;
/** The seed ticks: customers.name, orders.order_date, orders.total. */
export const seedChecked = (): Checked => new Map(TABLES.map((t) => [t.id, new Set(
  t.id === 'customers' ? ['name'] : t.id === 'orders' ? ['order_date', 'total'] : [])]));

// ---- the card, as a SKIN over the kit's .axk-* classes --------------------
// The kit's entityCardContent has no seam for a per-row checkbox (and the html
// layer's allow-list has no form controls), so the TREE is demo-local — but it
// keeps the kit's class contract (.axk-entity/.axk-row/.axk-col) and stamps
// metadata.kitEntity, so bindJoinGuidance and the erTable handles see a
// perfectly ordinary kit card.
export function cardContent(t: Table, cols: Set<string>) {
  const all = cols.size === t.columns.length && t.columns.length > 0;
  const rows = t.columns.map((c) => ({
    tag: 'div',
    className: 'axk-row' + (cols.has(c.name) ? ' qb-on' : ''),
    children: [
      { tag: 'span', className: 'qb-check' + (cols.has(c.name) ? ' on' : ''), attrs: { title: 'include in SELECT' } },
      { tag: 'span', className: 'axk-col', text: c.name },
      ...(c.pk ? [{ tag: 'span', className: 'qb-badge pk', text: 'PK' }]
        : c.fk ? [{ tag: 'span', className: 'qb-badge fk', text: 'FK' }] : []),
    ],
  }));
  return { tag: 'div', className: 'axk-entity qb-card', children: [
    { tag: 'div', className: 'axk-entity-head', children: [
      { tag: 'span', className: 'qb-check qb-head-check qb-all' + (all ? ' on' : ''), attrs: { title: 'select all columns' } },
      { tag: 'span', className: 'qb-title', text: t.id },
    ] },
    { tag: 'div', className: 'axk-entity-body', children: rows },
  ] };
}

// per-column ports on BOTH sides: '<table>.<col>-in' (left target) and
// '<table>.<col>-out' (right source), pinned to the row centres
export const portSpecs = (t: Table) => t.columns.flatMap((c, i) => [
  { id: `${t.id}.${c.name}-in`, side: 'left' as const, type: 'input',
    shape: { shape: 'circle', size: 9 },
    layout: { strategy: 'absolute', args: { units: 'px', x: 0, y: rowCenterY(i) } } },
  { id: `${t.id}.${c.name}-out`, side: 'right' as const, type: 'output',
    shape: { shape: 'circle', size: 9 },
    layout: { strategy: 'absolute', args: { units: 'px', x: CARD_W, y: rowCenterY(i) } } },
]);

export const nodeSpec = (t: Table, position: { x: number; y: number }, cols: Set<string>) => ({
  id: t.id,
  position,
  size: { width: CARD_W, height: cardHeight(t) },
  metadata: {
    html: { content: cardContent(t, cols), interactive: true, padding: 0 },
    kitEntity: { id: t.id, name: t.id, columns: t.columns },
  },
  shape: { type: 'rect', fill: 'none', stroke: 'none' },
  style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
  ports: portSpecs(t),
});

/** A table dropped from the rail: the same card, built as a live NodeModel. */
export function tableNode(t: Table, position: { x: number; y: number }, cols: Set<string>) {
  const node = new NodeModel({ id: t.id, type: 'rect', position, size: { width: CARD_W, height: cardHeight(t) } } as any);
  node.ports.clear();
  for (const spec of portSpecs(t)) node.addPort(new PortModel({ ...spec, visible: true } as any));
  node.setMetadata('html', { content: cardContent(t, cols), interactive: true, padding: 0 });
  node.setMetadata('kitEntity', { id: t.id, name: t.id, columns: t.columns });
  node.setMetadata('shape', { type: 'rect', fill: 'none', stroke: 'none' });
  node.style = { ...node.style, fill: 'transparent', stroke: 'transparent', strokeWidth: 0 } as any;
  (node as any).setBehavior?.({ resizable: false });
  return node;
}

/** 2px accent, no arrowheads. */
export const JOIN_STYLE = { stroke: ACCENT, strokeWidth: 2, arrowHead: { type: 'none' }, arrowTail: { type: 'none' } };

/** The seed: customers + orders, one INNER join, a few columns ticked. */
export function seedSpec() {
  const checked = seedChecked();
  return {
    nodes: [
      nodeSpec(tableOf('customers')!, { x: 60, y: 80 }, checked.get('customers')!),
      nodeSpec(tableOf('orders')!, { x: 430, y: 250 }, checked.get('orders')!),
    ],
    edges: [{
      id: 'join-1', source: 'customers', target: 'orders',
      sourceHandle: 'customers.id-out', targetHandle: 'orders.customer_id-in',
      type: 'orthogonal',
      style: JOIN_STYLE,
    }],
  };
}

export const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL'];
export const pillLabel = (type: string) => ({
  id: 'join-type', text: type, position: 0.5, offset: { x: 0, y: 0 },
  style: { fontSize: 10, color: '#fff', background: ACCENT, padding: 6, borderRadius: 999, border: '#fff' },
});
export const parsePort = (pid: string | undefined) => {
  const m = /^([^.]+)\.(.+)-(in|out)$/.exec(pid || '');
  return m ? { table: m[1]!, column: m[2]! } : null;
};
export const joinType = (link: any): string => (link.labels?.[0]?.text ?? 'INNER').toUpperCase();

// ---- join adoption: every link that lands becomes a JOIN ---------------
// (seeded edges AND interactively drawn ones — including a link re-added by
// redo/undo, which re-fires link:added; adoption is idempotent)
export function adoptJoin(link: any): boolean {
  const s = parsePort(link.sourcePortId);
  const t = parsePort(link.targetPortId);
  if (!s || !t) return false;
  if (!link.getMetadata('qbJoin')) link.setMetadata('qbJoin', { source: s, target: t });
  // 2px accent, no arrowheads — set ON the link (the production tool lost
  // this to a CSS specificity fight; the element's own style cannot lose)
  link.updateStyle(JOIN_STYLE);
  if (!link.labels || link.labels.length === 0) link.setLabels([pillLabel('INNER')]);
  return true;
}

/** True when the two tables already share a join (the validator's pair rule). */
export const alreadyJoined = (model: any, a: string, b: string): boolean => model.getLinks().some((l: any) => {
  const j = l.getMetadata('qbJoin');
  return j && ((j.source.table === a && j.target.table === b) || (j.source.table === b && j.target.table === a));
});

/** The join's equation, as the inspector shows it. */
export const joinEquation = (link: any): string => {
  const j = link.getMetadata('qbJoin');
  return `${j.source.table}.${j.source.column} = ${j.target.table}.${j.target.column}`;
};

// ---- the SQL generator (honest: creation-ordered joins, no aliases) ----
export function generateSql(model: any, checked: Checked): string {
  const placed = TABLES.filter((t) => !!model.getNode(t.id));
  if (placed.length === 0) return 'SELECT *';
  const joins = model.getLinks()
    .map((link: any) => ({ link, j: link.getMetadata('qbJoin') }))
    .filter((x: any) => !!x.j);
  const chain = [placed[0]!.id];
  const joinLines: string[] = [];
  for (const { link, j } of joins) {
    const other = chain.includes(j.source.table) ? j.target.table : j.source.table;
    if (!chain.includes(other)) chain.push(other);
    joinLines.push(`${joinType(link)} JOIN ${other} ON ${j.source.table}.${j.source.column} = ${j.target.table}.${j.target.column}`);
  }
  const cols: string[] = [];
  for (const t of placed) {
    if (!chain.includes(t.id)) continue;   // unjoined tables are not in the query
    for (const c of t.columns) if (checked.get(t.id)!.has(c.name)) cols.push(`${t.id}.${c.name}`);
  }
  const select = cols.length
    ? 'SELECT\n' + cols.map((c) => `  ${c}`).join(',\n')
    : 'SELECT *';
  return [`${select}`, `FROM ${chain[0]}`, ...joinLines].join('\n');
}
