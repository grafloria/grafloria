// Cards for the Data modeling studio (data-modeling.html): the sample schema,
// the card geometry, and the HTML trees a table, a group zone and a note paint.
// Pure data in, pure data out — no DOM except text measuring — so a React / Vue
// / Angular / Qwik port renders the very same cards.
//
// A table card keeps the diagram kit's class contract (.axk-entity / .axk-row /
// .axk-col / .axk-ty) so the kit's live join guidance (bindJoinGuidance) can
// tint its rows while a foreign key is being dragged. It is the page's own tree
// because the kit card has no UQ / NN switches, no footer and no row grips.

/** Card geometry. Every row is exactly ROW px tall, so a port can sit on its centre. */
export const GEO = { HEAD: 36, ROW: 24, FOOT: 28, MIN_W: 240, MAX_W: 400 };
/** Node-local y of column `i`'s centre (the +1 is the card's top border). */
export const rowY = (i) => 1 + GEO.HEAD + i * GEO.ROW + GEO.ROW / 2;
export const tableHeight = (t) => 2 + GEO.HEAD + t.columns.length * GEO.ROW + GEO.FOOT;

/** Zone frame: header band + padding around the tables it holds. */
export const ZONE = { HEAD: 48, PAD: 18, HIDDEN_H: 42, EMPTY_W: 340, EMPTY_H: 220 };
export const ZONE_COLORS = ['blue', 'green', 'amber', 'violet', 'rose', 'teal'];
export const ZONE_HEX = { blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', violet: '#8b5cf6', rose: '#f43f5e', teal: '#14b8a6' };

export const NOTE_W = 290;

// The monospace stack the card CSS uses — measured with the same fonts.
export const MONO = 'Menlo, Consolas, "DejaVu Sans Mono", monospace';
let ctx2d;
const measure = (text, font) => {
  if (ctx2d === undefined) { try { ctx2d = document.createElement('canvas').getContext('2d'); } catch { ctx2d = null; } }
  if (!ctx2d) return String(text).length * 7.2;
  ctx2d.font = font;
  return ctx2d.measureText(String(text)).width;
};

/** Card width from its content: the longest name + type + the switches. */
export function tableWidth(t) {
  let w = 12 + 8 + 8 + measure(t.name, `600 13px ${MONO}`) + 8 + 18 + 10;
  for (const c of t.columns) {
    // padding 10+8 · key 16 · gaps · name · type · UQ 24 · NN 24 · delete 14 · borders
    w = Math.max(w, 18 + 16 + 6 + measure(c.name, `${c.pk ? 600 : 400} 12px ${MONO}`) + 10 + measure(c.type, `11px ${MONO}`) + 8 + 24 + 3 + 24 + 4 + 14 + 2);
  }
  return Math.min(GEO.MAX_W, Math.max(GEO.MIN_W, Math.ceil(w + 6)));
}
export const tableSize = (t) => ({ w: tableWidth(t), h: tableHeight(t) });

// ---------------------------------------------------------------------------
// The sample: a small online shop, in three groups
// ---------------------------------------------------------------------------

let seq = 0;
const C = (name, type, f = '') => ({ id: `c${++seq}`, name, type, pk: f.includes('pk'), uq: f.includes('uq'), nn: f.includes('nn') || f.includes('pk') });

/** The schema the page opens on. Fresh objects every call (reset = a new copy). */
export function sampleSchema() {
  seq = 0;
  const tables = [
    { id: 'customers', name: 'customers', columns: [C('id', 'uuid', 'pk'), C('email', 'varchar(255)', 'uq nn'), C('full_name', 'varchar(120)', 'nn'), C('phone', 'varchar(32)'), C('created_at', 'timestamp', 'nn')] },
    { id: 'addresses', name: 'addresses', columns: [C('id', 'uuid', 'pk'), C('customer_id', 'uuid', 'nn'), C('line1', 'varchar(200)', 'nn'), C('city', 'varchar(80)', 'nn'), C('country', 'char(2)', 'nn'), C('postal_code', 'varchar(16)')] },
    { id: 'orders', name: 'orders', columns: [C('id', 'uuid', 'pk'), C('customer_id', 'uuid', 'nn'), C('address_id', 'uuid'), C('status', 'varchar(20)', 'nn'), C('total', 'decimal(10,2)', 'nn'), C('placed_at', 'timestamp', 'nn')] },
    { id: 'order_items', name: 'order_items', columns: [C('id', 'serial', 'pk'), C('order_id', 'uuid', 'nn'), C('product_id', 'uuid', 'nn'), C('quantity', 'integer', 'nn'), C('unit_price', 'decimal(10,2)', 'nn')] },
    { id: 'payments', name: 'payments', columns: [C('id', 'uuid', 'pk'), C('order_id', 'uuid', 'uq nn'), C('provider', 'varchar(30)', 'nn'), C('amount', 'decimal(10,2)', 'nn'), C('paid_at', 'timestamp')] },
    { id: 'categories', name: 'categories', columns: [C('id', 'serial', 'pk'), C('name', 'varchar(80)', 'nn'), C('slug', 'varchar(80)', 'uq nn')] },
    { id: 'products', name: 'products', columns: [C('id', 'uuid', 'pk'), C('category_id', 'integer'), C('sku', 'varchar(32)', 'uq nn'), C('name', 'varchar(160)', 'nn'), C('price', 'decimal(10,2)', 'nn'), C('in_stock', 'boolean', 'nn'), C('created_at', 'timestamp', 'nn')] },
  ];
  const col = (t, n) => tables.find((x) => x.id === t).columns.find((c) => c.name === n).id;
  let r = 0;
  const R = (ft, fc, tt, tc, onDelete = 'NO ACTION', card = 'N:1') => ({ id: `r${++r}`, from: { t: ft, c: col(ft, fc) }, to: { t: tt, c: col(tt, tc) }, card, onDelete });
  const rels = [
    R('addresses', 'customer_id', 'customers', 'id', 'CASCADE'),
    R('orders', 'customer_id', 'customers', 'id', 'RESTRICT'),
    R('orders', 'address_id', 'addresses', 'id', 'SET NULL'),
    R('order_items', 'order_id', 'orders', 'id', 'CASCADE'),
    R('order_items', 'product_id', 'products', 'id', 'RESTRICT'),
    R('payments', 'order_id', 'orders', 'id', 'CASCADE', '1:1'),
    R('products', 'category_id', 'categories', 'id', 'SET NULL'),
  ];
  // Three columns of tables, one group each; the note fills the gap under Customers.
  const byId = new Map(tables.map((t) => [t.id, t]));
  const columns = [['customers', 'addresses'], ['orders', 'order_items', 'payments'], ['categories', 'products']];
  let x = 0;
  const groups = [];
  const names = ['Customers', 'Orders', 'Catalog'], colors = ['blue', 'amber', 'green'];
  columns.forEach((ids, k) => {
    const w = Math.max(...ids.map((id) => tableWidth(byId.get(id))));
    let y = ZONE.HEAD;
    for (const id of ids) { const t = byId.get(id); t.x = x + ZONE.PAD; t.y = y; y += tableHeight(t) + 24; }
    groups.push({ id: `g${k + 1}`, name: names[k], color: colors[k], x, y: 0, w: w + 2 * ZONE.PAD, h: y - 24 + ZONE.PAD, hidden: false });
    x += w + 2 * ZONE.PAD + 76;
  });
  const cust = groups[0];
  const notes = [{
    id: 'n1', x: cust.x, y: cust.h + 36, w: Math.max(NOTE_W, cust.w),
    text: 'Start here\nThis online shop is drawn as tables you can edit; the SQL on the right follows every change.\n· T, G and N add a table, a group and a note\n· Click any name or type to change it — UQ, NN and the key are switches\n· Pull the blue grip at a row\'s edge onto a column of another table to add a foreign key\n· ▶ Run SQL builds it all in a real database inside your browser',
  }];
  return { tables, rels, groups, notes };
}

// ---------------------------------------------------------------------------
// HTML trees (the renderer's structured, sanitised html layer)
// ---------------------------------------------------------------------------

/** `text` split around every case-insensitive hit of `q`, hits wrapped in <b class="dm-hl">. */
export function highlight(text, q) {
  const s = String(text);
  if (!q) return [{ tag: 'span', text: s }];
  const out = [];
  const lower = s.toLowerCase();
  let i = 0;
  for (;;) {
    const j = lower.indexOf(q, i);
    if (j < 0) break;
    if (j > i) out.push({ tag: 'span', text: s.slice(i, j) });
    out.push({ tag: 'b', className: 'dm-hl', text: s.slice(j, j + q.length) });
    i = j + q.length;
  }
  if (i < s.length || !out.length) out.push({ tag: 'span', text: s.slice(i) });
  return out;
}

/**
 * A table card. `view`: { fk: Set<colId> (referencing columns), q: search
 * text (lower-case), color: the group's colour name or '' }.
 */
export function tableContent(t, view) {
  const q = view.q || '';
  const tableHit = !!q && t.name.toLowerCase().includes(q);
  const colHit = (c) => !!q && (c.name.toLowerCase().includes(q) || String(c.type).toLowerCase().includes(q));
  const anyHit = tableHit || t.columns.some(colHit);
  const pkCount = t.columns.filter((c) => c.pk).length;
  const rows = t.columns.map((c) => {
    const fk = view.fk.has(c.id);
    const implied = c.pk && pkCount === 1;   // a single-column key is unique and not null by definition
    return {
      tag: 'div',
      className: `axk-row dm-row dm-c-${c.id}${c.pk ? ' dm-pk' : ''}${fk ? ' dm-fk' : ''}${colHit(c) ? ' dm-match' : ''}`,
      children: [
        { tag: 'span', className: 'dm-key', attrs: { title: c.pk ? 'Primary key — click to unset' : pkCount ? 'Click to add this column to the primary key' : 'Click to make this the primary key' } },
        { tag: 'span', className: 'axk-col dm-cname', children: highlight(c.name, q) },
        { tag: 'span', className: 'axk-ty dm-ctype', attrs: { title: 'Change the type' }, children: highlight(c.type, q) },
        { tag: 'span', className: `dm-badge dm-uq${c.uq || implied ? ' on' : ''}${implied ? ' implied' : ''}`, text: 'UQ', attrs: { title: implied ? 'Unique — implied by the primary key' : c.uq ? 'Unique — click to allow duplicates' : 'Click to make values unique' } },
        { tag: 'span', className: `dm-badge dm-nn${c.nn || implied ? ' on' : ''}${implied ? ' implied' : ''}`, text: 'NN', attrs: { title: implied ? 'Not null — implied by the primary key' : c.nn ? 'Not null — click to allow NULL' : 'Click to forbid NULL' } },
        { tag: 'span', className: 'dm-cdel', attrs: { title: 'Delete column' } },
      ],
    };
  });
  return {
    tag: 'div',
    className: `axk-entity dm-card${q ? (anyHit ? ' dm-hit' : ' dm-dim') : ''}`,
    children: [
      { tag: 'div', className: 'axk-entity-head dm-head', children: [
        { tag: 'span', className: `dm-tdot${view.color ? ` dm-zc-${view.color}` : ''}` },
        { tag: 'span', className: 'dm-tname', attrs: { title: 'Rename the table' }, children: highlight(t.name, q) },
        { tag: 'span', className: 'dm-tdel', attrs: { title: 'Delete table' } },
      ] },
      { tag: 'div', className: 'axk-entity-body dm-body', children: rows },
      { tag: 'div', className: 'dm-foot', children: [
        { tag: 'span', className: 'dm-count', text: `${t.columns.length} column${t.columns.length === 1 ? '' : 's'}` },
        { tag: 'span', className: 'dm-add', text: '+ Add column' },
      ] },
    ],
  };
}

/** A group zone: coloured dot, title, table count, the ⋯ menu and the hide/show eye. */
export function zoneContent(g, view) {
  const n = view.count;
  const label = g.hidden ? `${n} table${n === 1 ? '' : 's'} hidden` : n ? `${n} table${n === 1 ? '' : 's'}` : 'drop tables here';
  return {
    tag: 'div',
    className: `dm-zone dm-zc-${g.color}${g.hidden ? ' dm-zone-hidden' : ''}${view.match ? ' dm-zone-match' : ''}`,
    children: [
      { tag: 'div', className: 'dm-zhead', children: [
        { tag: 'span', className: 'dm-zdot' },
        { tag: 'span', className: 'dm-ztitle', attrs: { title: 'Rename the group' }, text: g.name },
        { tag: 'span', className: 'dm-zcount', text: label },
        { tag: 'span', className: 'dm-zsp' },
        { tag: 'span', className: 'dm-zbtn dm-zmenu', attrs: { title: 'Group menu' } },
        { tag: 'span', className: `dm-zbtn dm-zeye${g.hidden ? ' off' : ''}`, attrs: { title: g.hidden ? 'Show its tables' : 'Hide its tables' } },
      ] },
    ],
  };
}

/** A sticky note: the first line is its title. */
export function noteContent(n) {
  const [title, ...rest] = String(n.text || '').split('\n');
  return {
    tag: 'div',
    className: 'dm-note',
    children: [
      { tag: 'div', className: 'dm-nhead', children: [
        { tag: 'span', className: 'dm-ntitle', text: title || 'Note' },
        { tag: 'span', className: 'dm-ndel', attrs: { title: 'Delete note' } },
      ] },
      { tag: 'div', className: 'dm-ntext', text: rest.join('\n') },
    ],
  };
}

/** Port ids: `<table>::<column>::l|r` on a table, `<group>::zone::l|r` on a hidden group. */
export const portId = (owner, part, side) => `${owner}::${part}::${side}`;
export function parsePortId(pid) {
  const m = /^(.+?)::(.+?)::([lr])$/.exec(pid || '');
  return m ? { t: m[1], c: m[2], side: m[3] } : null;
}
