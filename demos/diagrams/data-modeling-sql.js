// SQL helpers for the Data modeling studio (data-modeling.html). Plain functions
// over plain data, no DOM and no diagram, so every framework port reuses them:
//
//   sqlType(type, dialect)        a canonical column type → the dialect's spelling
//   generateDDL(schema, dialect)  the whole schema as CREATE TABLE statements
//   parseDDL(text)                CREATE TABLE / ALTER TABLE … FOREIGN KEY → tables + relationships
//   seedSQL(schema, dialect)      a few believable INSERT rows per table, FK-consistent
//   layoutTables(tables, rels)    referenced tables left, referencing tables right
//
// The schema shape (also the page's undo snapshot):
//   tables: [{ id, name, x, y, columns: [{ id, name, type, pk, uq, nn }] }]
//   rels:   [{ id, from: { t, c }, to: { t, c }, card: 'N:1' | '1:1', onDelete }]
// `from` is the referencing (foreign key) column, `to` the referenced one.

export const DIALECTS = {
  sqlite: { id: 'sqlite', label: 'SQLite' },
  postgresql: { id: 'postgresql', label: 'PostgreSQL' },
  mysql: { id: 'mysql', label: 'MySQL' },
};

/** The types the card's type menu offers, in the order a schema author reaches for them. */
export const COMMON_TYPES = [
  'uuid', 'integer', 'bigint', 'serial', 'decimal(10,2)', 'real',
  'varchar(255)', 'text', 'boolean', 'date', 'timestamp', 'json',
];

export const ON_DELETE = ['NO ACTION', 'CASCADE', 'SET NULL', 'RESTRICT'];

/** `varchar(255)` → { base: 'varchar', args: ['255'] }. */
export function parseType(type) {
  const m = /^\s*([a-z_][a-z0-9_ ]*?)\s*(?:\(([^)]*)\))?\s*$/i.exec(String(type || ''));
  if (!m) return { base: String(type || '').toLowerCase().trim(), args: [] };
  return { base: m[1].toLowerCase().replace(/\s+/g, ' '), args: m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [] };
}

const AUTO = new Set(['serial', 'bigserial', 'smallserial']);
/** An auto-numbered integer — AUTOINCREMENT / IDENTITY / AUTO_INCREMENT depending on the dialect. */
export const isAutoType = (type) => AUTO.has(parseType(type).base);
const INTEGERISH = new Set(['int', 'integer', 'int4', 'bigint', 'int8', 'smallint', 'serial', 'bigserial', 'smallserial']);
export const isIntegerType = (type) => INTEGERISH.has(parseType(type).base);

const pick = (d, sqlite, postgresql, mysql) => ({ sqlite, postgresql, mysql })[d];

/** A canonical type, spelled the way `dialect` wants it. Unknown types pass through upper-cased. */
export function sqlType(type, d) {
  const { base, args } = parseType(type);
  const a = (fallback) => `(${(args.length ? args : fallback).join(',')})`;
  switch (base) {
    case 'uuid': return pick(d, 'TEXT', 'UUID', 'CHAR(36)');
    case 'int': case 'integer': case 'int4': return pick(d, 'INTEGER', 'INTEGER', 'INT');
    case 'bigint': case 'int8': return pick(d, 'INTEGER', 'BIGINT', 'BIGINT');
    case 'smallint': return pick(d, 'INTEGER', 'SMALLINT', 'SMALLINT');
    case 'serial': case 'smallserial': return pick(d, 'INTEGER', 'INTEGER', 'INT');
    case 'bigserial': return pick(d, 'INTEGER', 'BIGINT', 'BIGINT');
    case 'decimal': case 'numeric': return pick(d, 'NUMERIC', `NUMERIC${a(['10', '2'])}`, `DECIMAL${a(['10', '2'])}`);
    case 'real': case 'float': case 'double': case 'double precision': return pick(d, 'REAL', 'DOUBLE PRECISION', 'DOUBLE');
    case 'varchar': return pick(d, 'TEXT', `VARCHAR${a(['255'])}`, `VARCHAR${a(['255'])}`);
    case 'char': return pick(d, 'TEXT', `CHAR${a(['1'])}`, `CHAR${a(['1'])}`);
    case 'text': return 'TEXT';
    case 'boolean': case 'bool': return pick(d, 'INTEGER', 'BOOLEAN', 'TINYINT(1)');
    case 'date': return pick(d, 'TEXT', 'DATE', 'DATE');
    case 'time': return pick(d, 'TEXT', 'TIME', 'TIME');
    case 'timestamp': case 'timestamptz': case 'datetime': return pick(d, 'TEXT', 'TIMESTAMPTZ', 'DATETIME');
    case 'json': case 'jsonb': return pick(d, 'TEXT', 'JSONB', 'JSON');
    case 'blob': case 'bytea': return pick(d, 'BLOB', 'BYTEA', 'BLOB');
    default: return String(type || 'TEXT').toUpperCase();
  }
}

/** Quote an identifier: "name" for SQLite and PostgreSQL, `name` for MySQL. */
export function quoteIdent(name, d) {
  const s = String(name);
  return d === 'mysql' ? '`' + s.replace(/`/g, '``') + '`' : '"' + s.replace(/"/g, '""') + '"';
}


/**
 * Tables in creation order: a referenced table before the tables that point at
 * it (stable — ties keep the schema's own order). Returns the order plus the
 * set of FKs that point FORWARD (a cycle), which PostgreSQL / MySQL add after
 * every table exists, with ALTER TABLE.
 */
export function creationOrder(schema) {
  const ids = schema.tables.map((t) => t.id);
  const deps = new Map(ids.map((id) => [id, new Set()]));
  for (const r of schema.rels) if (r.from.t !== r.to.t && deps.has(r.from.t) && deps.has(r.to.t)) deps.get(r.from.t).add(r.to.t);
  const done = new Set(), order = [];
  while (order.length < ids.length) {
    const next = ids.find((id) => !done.has(id) && [...deps.get(id)].every((p) => done.has(p)))
      ?? ids.find((id) => !done.has(id));   // a cycle: take the next one in schema order
    done.add(next); order.push(next);
  }
  const pos = new Map(order.map((id, i) => [id, i]));
  const forward = new Set(schema.rels.filter((r) => r.from.t !== r.to.t && pos.get(r.to.t) > pos.get(r.from.t)).map((r) => r.id));
  return { order, forward };
}

/** The whole schema as DDL in `d`'s dialect. */
export function generateDDL(schema, d) {
  const T = new Map(schema.tables.map((t) => [t.id, t]));
  const col = (tid, cid) => T.get(tid)?.columns.find((c) => c.id === cid);
  const rels = schema.rels.filter((r) => col(r.from.t, r.from.c) && col(r.to.t, r.to.c));
  const q = (n) => quoteIdent(n, d);
  const { order, forward } = creationOrder({ tables: schema.tables, rels });
  const label = DIALECTS[d].label;
  const out = [
    `-- ${label} · Grafloria data modeling studio`,
    `-- ${schema.tables.length} table${schema.tables.length === 1 ? '' : 's'} · ${rels.length} foreign key${rels.length === 1 ? '' : 's'}`,
    '',
  ];
  if (d === 'sqlite') out.push('PRAGMA foreign_keys = ON;', '');
  if (!schema.tables.length) { out.push('-- An empty schema: add a table (T) to start.'); return out.join('\n'); }
  const later = [];
  for (const tid of order) {
    const t = T.get(tid);
    if (!t.columns.length) { out.push(`-- ${q(t.name)} has no columns yet, so it is not created.`, ''); continue; }
    const pks = t.columns.filter((c) => c.pk);
    const single = pks.length === 1;
    const oneToOne = new Set(rels.filter((r) => r.from.t === tid && r.card === '1:1').map((r) => r.from.c));
    const lines = t.columns.map((c) => {
      const auto = isAutoType(c.type);
      const parts = [q(c.name), sqlType(c.type, d)];
      const isSinglePk = c.pk && single;
      if (d === 'postgresql' && auto) parts.push('GENERATED BY DEFAULT AS IDENTITY');
      if (d === 'mysql' && auto) parts.push('AUTO_INCREMENT');
      if (isSinglePk) {
        // SQLite: AUTOINCREMENT is only legal on an INTEGER PRIMARY KEY.
        parts.push(d === 'sqlite' && auto && isIntegerType(c.type) ? 'PRIMARY KEY AUTOINCREMENT' : 'PRIMARY KEY');
      }
      // PRIMARY KEY implies NOT NULL — except in SQLite, where only an INTEGER key does.
      const nn = c.nn || c.pk;
      const impliedNN = isSinglePk && (d !== 'sqlite' || (auto && isIntegerType(c.type)));
      if (nn && !impliedNN) parts.push('NOT NULL');
      if ((c.uq || oneToOne.has(c.id)) && !isSinglePk) parts.push('UNIQUE');
      return '  ' + parts.join(' ');
    });
    if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => q(c.name)).join(', ')})`);
    for (const r of rels.filter((x) => x.from.t === tid)) {
      const fc = col(r.from.t, r.from.c), tt = T.get(r.to.t), tc = col(r.to.t, r.to.c);
      // Two short lines per key, so the DDL reads in a narrow panel.
      const onDel = r.onDelete && r.onDelete !== 'NO ACTION' ? `ON DELETE ${r.onDelete}` : '';
      const head = `FOREIGN KEY (${q(fc.name)})`, refs = `REFERENCES ${q(tt.name)} (${q(tc.name)})`;
      if (forward.has(r.id) && d !== 'sqlite') later.push(`ALTER TABLE ${q(t.name)} ADD ${head}\n  ${refs}${onDel ? `\n  ${onDel}` : ''};`);
      else lines.push(`  ${head}\n    ${refs}${onDel ? `\n    ${onDel}` : ''}`);
    }
    out.push(`CREATE TABLE ${q(t.name)} (`, lines.join(',\n'), d === 'mysql' ? ') ENGINE=InnoDB;' : ');', '');
  }
  if (later.length) out.push('-- These tables point at each other, so the circular keys come last:', ...later, '');
  return out.join('\n').replace(/\n+$/, '\n');
}

// ---------------------------------------------------------------------------
// Import: a small, forgiving CREATE TABLE parser
// ---------------------------------------------------------------------------

/** Tokens: words, quoted identifiers, strings, numbers and punctuation — comments dropped. */
function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '\n') { line++; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '#' ) { while (i < n && src[i] !== '\n') i++; continue; }   // MySQL comment
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    if (ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let j = i + 1, v = '';
      while (j < n) {
        if (src[j] === close) { if (src[j + 1] === close && close !== ']') { v += close; j += 2; continue; } break; }
        v += src[j++];
      }
      toks.push({ k: 'id', v, line }); i = j + 1; continue;
    }
    if (ch === "'") {
      let j = i + 1, v = '';
      while (j < n) { if (src[j] === "'") { if (src[j + 1] === "'") { v += "'"; j += 2; continue; } break; } v += src[j++]; }
      toks.push({ k: 'str', v, line }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ k: 'word', v: src.slice(i, j), line }); i = j; continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1]))) {
      let j = i; while (j < n && /[0-9.eE]/.test(src[j])) j++;
      toks.push({ k: 'num', v: src.slice(i, j), line }); i = j; continue;
    }
    toks.push({ k: 'p', v: ch, line }); i++;
  }
  return toks;
}

/** Canonical type from what a DDL said (`INT AUTO_INCREMENT` → serial, `CHAR(36)` → uuid …). */
export function normalizeType(raw, { auto = false } = {}) {
  const { base, args } = parseType(raw);
  const withArgs = (b) => (args.length ? `${b}(${args.join(',')})` : b);
  if (auto) return /big/.test(base) ? 'bigserial' : 'serial';
  switch (base) {
    case 'int': case 'integer': case 'int4': case 'mediumint': case 'int unsigned': case 'integer unsigned': return 'integer';
    case 'bigint': case 'int8': case 'bigint unsigned': return 'bigint';
    case 'smallint': case 'int2': return 'smallint';
    case 'tinyint': return args[0] === '1' ? 'boolean' : 'smallint';
    case 'serial': case 'serial4': return 'serial';
    case 'bigserial': case 'serial8': return 'bigserial';
    case 'uuid': return 'uuid';
    case 'char': case 'character': case 'nchar': return args[0] === '36' ? 'uuid' : withArgs('char');
    case 'varchar': case 'character varying': case 'nvarchar': case 'varchar2': return withArgs('varchar');
    case 'text': case 'mediumtext': case 'longtext': case 'tinytext': case 'clob': case 'string': return 'text';
    case 'decimal': case 'numeric': case 'money': return withArgs('decimal');
    case 'real': case 'float': case 'float4': case 'float8': case 'double': case 'double precision': return 'real';
    case 'bool': case 'boolean': case 'bit': return 'boolean';
    case 'date': return 'date';
    case 'time': case 'time without time zone': case 'time with time zone': return 'time';
    case 'timestamp': case 'timestamptz': case 'datetime': case 'timestamp with time zone': case 'timestamp without time zone': return 'timestamp';
    case 'json': case 'jsonb': return 'json';
    case 'blob': case 'bytea': case 'binary': case 'varbinary': case 'longblob': return 'blob';
    default: return withArgs(base || 'text');
  }
}

const KW = (t, ...words) => t && t.k === 'word' && words.includes(t.v.toUpperCase());

/**
 * Parse CREATE TABLE statements (plus ALTER TABLE … ADD FOREIGN KEY / PRIMARY
 * KEY). Returns names, not ids: { tables: [{ name, columns: [{ name, type, pk,
 * uq, nn }] }], rels: [{ from: [table, col], to: [table, col], onDelete }],
 * warnings: [string], skipped: n }.
 */
export function parseDDL(text) {
  const toks = tokenize(String(text || ''));
  const tables = [], rels = [], warnings = [];
  let skipped = 0, i = 0;
  const peek = (o = 0) => toks[i + o];
  const isP = (t, v) => t && t.k === 'p' && t.v === v;
  const name = () => {
    const t = toks[i];
    if (!t || (t.k !== 'word' && t.k !== 'id')) throw new Error(`expected a name near line ${t ? t.line : 'end'}`);
    i++;
    let v = t.v;
    while (isP(toks[i], '.') && toks[i + 1] && (toks[i + 1].k === 'word' || toks[i + 1].k === 'id')) { v = toks[i + 1].v; i += 2; }   // schema.table → table
    return v;
  };
  const skipStatement = () => { let depth = 0; while (i < toks.length) { const t = toks[i++]; if (isP(t, '(')) depth++; else if (isP(t, ')')) depth--; else if (isP(t, ';') && depth <= 0) return; } };
  const skipParens = () => { if (!isP(peek(), '(')) return; let depth = 0; do { const t = toks[i++]; if (isP(t, '(')) depth++; else if (isP(t, ')')) depth--; } while (i < toks.length && depth > 0); };
  const nameList = () => { const out = []; if (!isP(peek(), '(')) return out; i++; while (i < toks.length && !isP(peek(), ')')) { if (isP(peek(), ',')) { i++; continue; } out.push(name()); while (KW(peek(), 'ASC', 'DESC')) i++; if (isP(peek(), '(')) skipParens(); } i++; return out; };
  const refAction = () => {
    let onDelete = 'NO ACTION';
    for (;;) {
      if (KW(peek(), 'ON') && KW(peek(1), 'DELETE', 'UPDATE')) {
        const which = peek(1).v.toUpperCase(); i += 2;
        let act;
        if (KW(peek(), 'SET') && KW(peek(1), 'NULL', 'DEFAULT')) { act = 'SET ' + peek(1).v.toUpperCase(); i += 2; }
        else if (KW(peek(), 'NO') && KW(peek(1), 'ACTION')) { act = 'NO ACTION'; i += 2; }
        else { act = (peek() && peek().v || '').toUpperCase(); i++; }
        if (which === 'DELETE') onDelete = act === 'SET DEFAULT' ? 'NO ACTION' : act;
      } else if (KW(peek(), 'MATCH')) i += 2;
      else if (KW(peek(), 'DEFERRABLE')) i++;
      else if (KW(peek(), 'NOT') && KW(peek(1), 'DEFERRABLE')) i += 2;
      else if (KW(peek(), 'INITIALLY')) i += 2;
      else return onDelete;
    }
  };
  const skipExpr = () => {   // a DEFAULT / CHECK expression: one token, or a balanced (…) / call(…)
    if (isP(peek(), '(')) { skipParens(); return; }
    if (isP(peek(), '-') || isP(peek(), '+')) i++;
    i++;
    if (isP(peek(), '(')) skipParens();
    while (isP(peek(), ':') && isP(peek(1), ':')) { i += 2; i++; if (isP(peek(), '(')) skipParens(); }   // 'x'::text
  };

  const parseCreate = () => {
    i++;   // CREATE
    while (KW(peek(), 'TEMP', 'TEMPORARY', 'UNLOGGED')) i++;
    if (!KW(peek(), 'TABLE')) { skipped++; skipStatement(); return; }
    i++;
    if (KW(peek(), 'IF')) i += 3;   // IF NOT EXISTS
    const table = { name: name(), columns: [] };
    if (!isP(peek(), '(')) { warnings.push(`${table.name}: CREATE TABLE … AS is not supported, skipped`); skipStatement(); return; }
    i++;
    const pkLater = [], uqLater = [];
    while (i < toks.length && !isP(peek(), ')')) {
      if (isP(peek(), ',')) { i++; continue; }
      if (KW(peek(), 'CONSTRAINT')) { i++; name(); }
      const t = peek();
      if (KW(t, 'PRIMARY')) { i += 2; pkLater.push(...nameList()); continue; }
      if (KW(t, 'UNIQUE')) { i++; if (KW(peek(), 'KEY', 'INDEX')) i++; if (!isP(peek(), '(')) name(); const cols = nameList(); if (cols.length === 1) uqLater.push(cols[0]); continue; }
      if (KW(t, 'FOREIGN')) {
        i += 2;   // FOREIGN KEY
        if (!isP(peek(), '(')) name();
        const from = nameList();
        if (!KW(peek(), 'REFERENCES')) throw new Error(`${table.name}: FOREIGN KEY without REFERENCES near line ${t.line}`);
        i++;
        const target = name();
        const to = nameList();
        const onDelete = refAction();
        from.forEach((c, k) => rels.push({ from: [table.name, c], to: [target, to[k] ?? null], onDelete }));
        if (from.length > 1) warnings.push(`${table.name}: a ${from.length}-column foreign key became ${from.length} single-column ones`);
        continue;
      }
      if (KW(t, 'CHECK', 'EXCLUDE')) { i++; skipParens(); continue; }
      if (KW(t, 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL')) {   // MySQL inline indexes
        while (i < toks.length && !isP(peek(), ',') && !isP(peek(), ')')) { if (isP(peek(), '(')) skipParens(); else i++; }
        continue;
      }
      // A column: name, type words (+ args), then constraints.
      const c = { name: name(), type: '', pk: false, uq: false, nn: false };
      const typeWords = [];
      while (peek() && peek().k === 'word' && !KW(peek(), 'PRIMARY', 'NOT', 'NULL', 'UNIQUE', 'DEFAULT', 'REFERENCES', 'CHECK',
        'CONSTRAINT', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'GENERATED', 'COLLATE', 'COMMENT', 'ON', 'IDENTITY', 'KEY')) {
        typeWords.push(peek().v); i++;
        if (isP(peek(), '(')) { const s = i; skipParens(); typeWords[typeWords.length - 1] += '(' + toks.slice(s + 1, i - 1).map((x) => x.v).join('') + ')'; }
      }
      if (isP(peek(), '[') ) i++;   // int[] — keep the base type
      let auto = false;
      while (i < toks.length && !isP(peek(), ',') && !isP(peek(), ')')) {
        const k = peek();
        if (KW(k, 'CONSTRAINT')) { i++; name(); continue; }
        if (KW(k, 'PRIMARY')) { i += 2; c.pk = true; while (KW(peek(), 'ASC', 'DESC')) i++; if (KW(peek(), 'AUTOINCREMENT')) { auto = true; i++; } continue; }
        if (KW(k, 'NOT') && KW(peek(1), 'NULL')) { c.nn = true; i += 2; continue; }
        if (KW(k, 'NULL')) { i++; continue; }
        if (KW(k, 'UNIQUE')) { c.uq = true; i++; if (KW(peek(), 'KEY')) i++; continue; }
        if (KW(k, 'KEY')) { c.pk = true; i++; continue; }   // MySQL: … KEY
        if (KW(k, 'AUTO_INCREMENT', 'AUTOINCREMENT')) { auto = true; i++; continue; }
        if (KW(k, 'GENERATED')) {
          i++;
          while (KW(peek(), 'ALWAYS', 'BY', 'DEFAULT', 'AS')) i++;
          if (KW(peek(), 'IDENTITY')) { auto = true; i++; skipParens(); }
          else if (isP(peek(), '(')) { skipParens(); while (KW(peek(), 'STORED', 'VIRTUAL')) i++; }
          continue;
        }
        if (KW(k, 'IDENTITY')) { auto = true; i++; skipParens(); continue; }
        if (KW(k, 'DEFAULT')) { i++; skipExpr(); continue; }
        if (KW(k, 'CHECK')) { i++; skipParens(); continue; }
        if (KW(k, 'COLLATE', 'COMMENT')) { i += 2; continue; }
        if (KW(k, 'ON') && KW(peek(1), 'UPDATE')) { i += 2; skipExpr(); continue; }
        if (KW(k, 'REFERENCES')) {
          i++;
          const target = name();
          const to = nameList();
          const onDelete = refAction();
          rels.push({ from: [table.name, c.name], to: [target, to[0] ?? null], onDelete });
          continue;
        }
        i++;   // anything else (UNSIGNED, CHARACTER SET x …) is not schema shape
      }
      const raw = typeWords.join(' ') || 'text';
      c.type = normalizeType(raw, { auto: auto && /int|serial|^$/i.test(raw) });
      if (/serial/i.test(raw)) c.nn = true;
      table.columns.push(c);
    }
    i++;   // ')'
    for (const p of pkLater) { const c = table.columns.find((x) => x.name.toLowerCase() === p.toLowerCase()); if (c) c.pk = true; }
    for (const u of uqLater) { const c = table.columns.find((x) => x.name.toLowerCase() === u.toLowerCase()); if (c) c.uq = true; }
    for (const c of table.columns) if (c.pk) c.nn = true;
    skipStatement();   // table options (ENGINE=…, WITHOUT ROWID …) up to ';'
    if (tables.some((x) => x.name.toLowerCase() === table.name.toLowerCase())) warnings.push(`${table.name} is defined twice — kept the first`);
    else tables.push(table);
  };

  const parseAlter = () => {
    i++;   // ALTER
    if (!KW(peek(), 'TABLE')) { skipped++; skipStatement(); return; }
    i++;
    if (KW(peek(), 'ONLY')) i++;
    if (KW(peek(), 'IF')) i += 2;
    const tname = name();
    if (!KW(peek(), 'ADD')) { skipped++; skipStatement(); return; }
    i++;
    if (KW(peek(), 'CONSTRAINT')) { i++; name(); }
    if (KW(peek(), 'FOREIGN')) {
      i += 2;
      const from = nameList();
      if (KW(peek(), 'REFERENCES')) {
        i++;
        const target = name(); const to = nameList(); const onDelete = refAction();
        from.forEach((c, k) => rels.push({ from: [tname, c], to: [target, to[k] ?? null], onDelete }));
      }
    } else if (KW(peek(), 'PRIMARY')) {
      i += 2;
      const cols = nameList();
      const t = tables.find((x) => x.name.toLowerCase() === tname.toLowerCase());
      for (const n of cols) { const c = t?.columns.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (c) { c.pk = true; c.nn = true; } }
    } else skipped++;
    skipStatement();
  };

  while (i < toks.length) {
    const t = peek();
    try {
      if (isP(t, ';')) { i++; continue; }
      if (KW(t, 'CREATE')) parseCreate();
      else if (KW(t, 'ALTER')) parseAlter();
      else { skipped++; skipStatement(); }
    } catch (e) {
      warnings.push(e.message);
      skipStatement();
    }
  }

  // Resolve each relationship against the parsed tables (case-insensitive);
  // `REFERENCES t` with no column means t's primary key.
  const find = (n) => tables.find((x) => x.name.toLowerCase() === String(n).toLowerCase());
  const resolved = [];
  for (const r of rels) {
    const ft = find(r.from[0]), tt = find(r.to[0]);
    if (!ft || !tt) { if (ft) warnings.push(`${r.from[0]}.${r.from[1]} references ${r.to[0]}, which is not in this DDL — skipped`); continue; }
    const fc = ft.columns.find((c) => c.name.toLowerCase() === String(r.from[1]).toLowerCase());
    const tc = r.to[1] ? tt.columns.find((c) => c.name.toLowerCase() === String(r.to[1]).toLowerCase())
      : (tt.columns.filter((c) => c.pk).length === 1 ? tt.columns.find((c) => c.pk) : null);
    if (!fc || !tc) { warnings.push(`${r.from[0]}.${r.from[1]} → ${r.to[0]}.${r.to[1] ?? '?'}: column not found — skipped`); continue; }
    resolved.push({ from: [ft.name, fc.name], to: [tt.name, tc.name], onDelete: r.onDelete || 'NO ACTION', card: (fc.uq || (fc.pk && ft.columns.filter((c) => c.pk).length === 1)) ? '1:1' : 'N:1' });
  }
  return { tables, rels: resolved, warnings, skipped };
}

// ---------------------------------------------------------------------------
// Layout for imported tables: referenced tables to the left
// ---------------------------------------------------------------------------

/**
 * Place tables in layers: a table that references nobody is layer 0, every
 * other one sits one layer right of the furthest table it points at. Mutates
 * each table's x/y. `size(t)` returns { w, h }.
 */
export function layoutTables(tables, rels, size, origin = { x: 0, y: 0 }, gap = { x: 140, y: 44 }) {
  const ids = new Set(tables.map((t) => t.id));
  const parents = new Map(tables.map((t) => [t.id, new Set()]));
  for (const r of rels) if (ids.has(r.from.t) && ids.has(r.to.t) && r.from.t !== r.to.t) parents.get(r.from.t).add(r.to.t);
  const layer = new Map();
  const depth = (id, seen = new Set()) => {
    if (layer.has(id)) return layer.get(id);
    if (seen.has(id)) return 0;   // a cycle
    seen.add(id);
    let d = 0;
    for (const p of parents.get(id)) d = Math.max(d, depth(p, seen) + 1);
    layer.set(id, d);
    return d;
  };
  for (const t of tables) depth(t.id);
  const cols = [];
  for (const t of tables) { const l = layer.get(t.id); (cols[l] ??= []).push(t); }
  let x = origin.x;
  for (const col of cols.filter(Boolean)) {
    let y = origin.y, w = 0;
    for (const t of col) { const s = size(t); t.x = Math.round(x); t.y = Math.round(y); y += s.h + gap.y; w = Math.max(w, s.w); }
    x += w + gap.x;
  }
}

// ---------------------------------------------------------------------------
// Seed rows for the query runner
// ---------------------------------------------------------------------------

const PEOPLE = ['Ava Thompson', 'Noah Patel', 'Mia Chen', 'Liam García', 'Zoe Okafor', 'Omar Haddad', 'Lena Novak', 'Kai Morita', 'Ines Duarte', 'Theo Laurent'];
const CITIES = ['Lisbon', 'Toronto', 'Cairo', 'Osaka', 'Austin', 'Leeds', 'Porto', 'Lyon', 'Accra', 'Perth'];
const COUNTRIES = ['PT', 'CA', 'EG', 'JP', 'US', 'GB', 'PT', 'FR', 'GH', 'AU'];
const STREETS = ['12 Harbour Road', '48 Elm Street', '3 Rue Cler', '7-2 Sakura Dori', '901 Congress Ave', '22 Mill Lane', '5 Rua Nova', '18 Quai Bon', '40 Ring Road', '9 Bay View'];
const PRODUCTS = ['Wireless earbuds', 'Paperback notebook', 'Desk lamp', 'Trail bottle', 'Ceramic mug', 'Canvas tote', 'Phone stand', 'Wool socks', 'Tea sampler', 'USB-C cable'];
const CATEGORIES = ['Audio', 'Stationery', 'Home', 'Outdoors', 'Kitchen', 'Bags', 'Gadgets', 'Apparel', 'Pantry', 'Cables'];
const STATUSES = ['paid', 'shipped', 'pending', 'delivered', 'refunded'];
const PROVIDERS = ['stripe', 'paypal', 'adyen', 'stripe', 'paypal'];
const AMOUNTS = [19.9, 54, 7.5, 129, 32.25, 64.8, 12, 89.99, 45.5, 23.4];

const hash = (s) => {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;   // avalanche: "…0" and "…1" land far apart
  return h >>> 0;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function sampleValue(t, c, i) {
  const n = c.name.toLowerCase(), tn = t.name.toLowerCase();
  const { base, args } = parseType(c.type);
  const person = PEOPLE[i % PEOPLE.length];
  if (base === 'uuid') return `${hash(t.name).toString(16).padStart(8, '0').slice(0, 8)}-${(hash(c.name) & 0xffff).toString(16).padStart(4, '0')}-4000-8000-${String(i + 1).padStart(12, '0')}`;
  if (INTEGERISH.has(base)) {
    if (c.pk) return i + 1;
    if (/qty|quantity|count/.test(n)) return 1 + (i % 3);
    if (/rating|score|stars/.test(n)) return 5 - (i % 3);
    if (/year/.test(n)) return 2020 + (i % 6);
    return (hash(t.name + c.name + i) % 90) + 10;
  }
  if (base === 'decimal' || base === 'numeric' || base === 'real' || base === 'float' || base === 'double') return AMOUNTS[(i + n.length) % AMOUNTS.length];
  if (base === 'boolean' || base === 'bool') return i % 3 !== 2;
  if (base === 'timestamp' || base === 'datetime' || base === 'timestamptz') return `2026-09-${String(10 + (i % 18)).padStart(2, '0')} ${String(9 + (i % 9)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`;
  if (base === 'date') return `2026-09-${String(10 + (i % 18)).padStart(2, '0')}`;
  if (base === 'time') return `${String(9 + (i % 9)).padStart(2, '0')}:30:00`;
  if (base === 'json' || base === 'jsonb') return '{"source":"web"}';
  if (base === 'blob' || base === 'bytea') return null;
  // text-like: lean on the column name
  let s;
  if (/email/.test(n)) s = person.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com';
  else if (/phone|mobile/.test(n)) s = `+1 555 01${String(i).padStart(2, '0')}`;
  else if (/country/.test(n)) s = COUNTRIES[i % COUNTRIES.length];
  else if (/city|town/.test(n)) s = CITIES[i % CITIES.length];
  else if (/line|street|address/.test(n)) s = STREETS[i % STREETS.length];
  else if (/postal|zip|post_code/.test(n)) s = `${1000 + i * 37}-1${String(i).padStart(2, '0')}`;
  else if (/status|state/.test(n)) s = STATUSES[i % STATUSES.length];
  else if (/provider|gateway|method/.test(n)) s = PROVIDERS[i % PROVIDERS.length];
  else if (/sku|code/.test(n)) s = `SKU-${1001 + i}`;
  else if (/currency/.test(n)) s = ['USD', 'EUR', 'GBP'][i % 3];
  else if (/slug/.test(n)) s = slug((/categor/.test(tn) ? CATEGORIES : PRODUCTS)[i % 10]);
  else if (/url|link|website/.test(n)) s = `https://example.com/${slug(t.name)}/${i + 1}`;
  else if (/color|colour/.test(n)) s = ['teal', 'amber', 'slate', 'rose'][i % 4];
  else if (/(^|_)(full_)?name$|^title$|^label$/.test(n)) s = /categor|tag|group|team/.test(tn) ? CATEGORIES[i % 10] : /product|item|book|course/.test(tn) ? PRODUCTS[i % 10] : person;
  else if (/body|comment|note|description|text|bio|summary/.test(n)) s = ['Arrived quickly, works well.', 'Lovely quality.', 'Smaller than expected.', 'Would buy again.'][i % 4];
  else if (/role/.test(n)) s = ['owner', 'admin', 'member', 'viewer'][i % 4];
  else s = `${c.name} ${i + 1}`;
  if (base === 'char' && args[0]) s = String(s).padEnd(Number(args[0]), 'X').slice(0, Number(args[0]));
  else if (base === 'varchar' && args[0]) s = String(s).slice(0, Number(args[0]));
  return s;
}

function literal(v, d) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return d === 'postgresql' ? (v ? 'TRUE' : 'FALSE') : (v ? '1' : '0');
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * INSERT statements that fill every table with a few rows (more in tables that
 * point at others, so a GROUP BY has something to count). Foreign keys always
 * hold a value the referenced table really has; UNIQUE / PRIMARY KEY columns
 * never repeat. Returns { sql, rows }.
 */
export function seedSQL(schema, d) {
  const T = new Map(schema.tables.map((t) => [t.id, t]));
  const { order } = creationOrder(schema);
  const depthOf = new Map();
  const depth = (tid, seen = new Set()) => {
    if (depthOf.has(tid)) return depthOf.get(tid);
    if (seen.has(tid)) return 0;
    seen.add(tid);
    let dd = 0;
    for (const r of schema.rels) if (r.from.t === tid && r.to.t !== tid && T.has(r.to.t)) dd = Math.max(dd, depth(r.to.t, seen) + 1);
    depthOf.set(tid, dd);
    return dd;
  };
  const values = new Map();   // tableId → [{ colId: value }]
  const q = (n) => quoteIdent(n, d);
  const out = [];
  let total = 0;
  for (const tid of order) {
    const t = T.get(tid);
    if (!t.columns.length) continue;
    const fks = schema.rels.filter((r) => r.from.t === tid && T.get(r.to.t)?.columns.some((c) => c.id === r.to.c));
    let n = Math.min(4 + 2 * depth(tid), 10);
    // A unique foreign key can use each parent row once.
    for (const r of fks) {
      const fc = t.columns.find((c) => c.id === r.from.c);
      const parentRows = r.to.t === tid ? n : (values.get(r.to.t)?.length ?? 0);
      if (fc && (fc.uq || fc.pk || r.card === '1:1') && parentRows) n = Math.min(n, parentRows);
    }
    const rows = [];
    // A composite primary key is unique as a TUPLE, not per column — only a
    // single-column key (or a UNIQUE column) is kept from repeating.
    const singlePk = t.columns.filter((c) => c.pk).length === 1;
    const seen = new Map(t.columns.filter((c) => c.uq || (c.pk && singlePk)).map((c) => [c.id, new Set()]));
    for (let i = 0; i < n; i++) {
      const row = {};
      for (const c of t.columns) {
        const fk = fks.find((r) => r.from.c === c.id);
        let v;
        if (fk) {
          const parent = fk.to.t === tid ? rows : (values.get(fk.to.t) ?? []);
          const unique = c.uq || c.pk || fk.card === '1:1';
          if (fk.to.t === tid) v = i === 0 ? null : parent[(i - 1) % parent.length]?.[fk.to.c] ?? null;   // self-reference: point at an earlier row
          else if (!parent.length) v = null;
          // A unique key uses each parent once; otherwise a skewed pick, so some
          // parents have several children and some none (a GROUP BY has a story).
          else v = parent[unique ? i % parent.length : Math.min(parent.length - 1, Math.floor(parent.length * Math.pow((hash(`${t.name}.${c.name}.${i}`) % 997) / 997, 1.15)))][fk.to.c];
          if (v === null && (c.nn || c.pk) && fk.to.t === tid) v = sampleValue(t, c, i);
        } else v = sampleValue(t, c, i);
        const set = seen.get(c.id);
        if (set && v !== null) {
          let k = 2;
          while (set.has(String(v))) v = typeof v === 'number' ? v + 1000 : `${String(v).replace(/-\d+$/, '')}-${k++}`;
          set.add(String(v));
        }
        row[c.id] = v;
      }
      rows.push(row);
    }
    values.set(tid, rows);
    total += rows.length;
    out.push(`INSERT INTO ${q(t.name)} (${t.columns.map((c) => q(c.name)).join(', ')}) VALUES\n` +
      rows.map((row) => '  (' + t.columns.map((c) => literal(row[c.id], d)).join(', ') + ')').join(',\n') + ';');
  }
  return { sql: out.join('\n\n'), rows: total };
}
