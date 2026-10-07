// Real in-browser databases for the Data modeling studio's query runner.
//
// Nothing here loads with the page. The first Run on an engine downloads it:
//   SQLite      — sql.js 1.10.3 (SQLite compiled to WebAssembly), from cdnjs
//   PostgreSQL  — PGlite (Postgres compiled to WebAssembly), an ES module from jsDelivr
// MySQL has no in-browser build, so the runner offers the other two instead.
//
// Each run builds the schema from scratch, inserts the seed rows and runs the
// visitor's query, and reports which of those three steps failed, if one did.

const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
const PGLITE_URL = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js';

export const ENGINES = {
  sqlite: { label: 'SQLite', lib: 'sql.js 1.10.3', size: 'about 1 MB', host: 'cdnjs' },
  postgresql: { label: 'PostgreSQL', lib: 'PGlite', size: 'about 3 MB', host: 'jsDelivr' },
};

const loads = {};   // kind → Promise<engine>
const ready = {};   // kind → engine, once loaded

const withTimeout = (p, ms, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} did not arrive within ${Math.round(ms / 1000)} s — check the network`)), ms)),
]);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

export const isLoaded = (kind) => !!ready[kind];

/** Load (once) and return the engine for `kind`: 'sqlite' | 'postgresql'. */
export function loadEngine(kind, timeoutMs = 60000) {
  if (loads[kind]) return loads[kind];
  let p;
  if (kind === 'sqlite') {
    p = (async () => {
      if (!window.initSqlJs) await loadScript(SQLJS_BASE + 'sql-wasm.js');
      const SQL = await window.initSqlJs({ locateFile: (file) => SQLJS_BASE + file });
      const probe = new SQL.Database();
      const version = probe.exec('select sqlite_version()')[0]?.values?.[0]?.[0] ?? '';
      probe.close();
      return { kind, version: `SQLite ${version}`, SQL };
    })();
  } else if (kind === 'postgresql') {
    p = (async () => {
      const mod = await import(/* @vite-ignore */ PGLITE_URL);
      const db = new mod.PGlite();
      await db.waitReady;
      const v = await db.query('select version()');
      const version = String(Object.values(v.rows[0] ?? {})[0] ?? 'PostgreSQL').split(' on ')[0].split(',')[0];
      return { kind, version, db };
    })();
  } else {
    return Promise.reject(new Error(`no in-browser engine for ${kind}`));
  }
  loads[kind] = withTimeout(p, timeoutMs, `The ${ENGINES[kind].label} engine (${ENGINES[kind].lib})`)
    .then((e) => { ready[kind] = e; return e; })
    .catch((e) => { delete loads[kind]; throw e; });   // a failed load can be retried
  return loads[kind];
}

class StepError extends Error {
  constructor(phase, cause) { super(cause && cause.message ? cause.message : String(cause)); this.phase = phase; }
}

const cell = (v) => (v instanceof Uint8Array ? `‹${v.length} bytes›` : v);

/**
 * Build `ddl`, insert `seed`, run `query` on a fresh database. Resolves to
 * { columns, rows, ms, statements } for the query's last result set, or
 * rejects with an Error whose `.phase` is 'schema' | 'seed' | 'query'.
 */
export async function runScript(engine, { ddl, seed, query }) {
  const t0 = performance.now();
  if (engine.kind === 'sqlite') {
    const db = new engine.SQL.Database();
    try {
      try { db.exec(ddl); } catch (e) { throw new StepError('schema', e); }
      try { if (seed.trim()) db.exec(seed); } catch (e) { throw new StepError('seed', e); }
      let res;
      try { res = db.exec(query); } catch (e) { throw new StepError('query', e); }
      const last = res[res.length - 1];
      return {
        columns: last ? last.columns : [],
        rows: last ? last.values.map((r) => r.map(cell)) : [],
        ms: performance.now() - t0,
        statements: res.length,
      };
    } finally {
      db.close();
    }
  }
  // PostgreSQL: one long-lived PGlite, a fresh public schema per run.
  const db = engine.db;
  try { await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'); } catch (e) { throw new StepError('schema', e); }
  try { await db.exec(ddl); } catch (e) { throw new StepError('schema', e); }
  try { if (seed.trim()) await db.exec(seed); } catch (e) { throw new StepError('seed', e); }
  let results;
  try { results = await db.exec(query, { rowMode: 'array' }); } catch (e) { throw new StepError('query', e); }
  const last = [...results].reverse().find((r) => r.fields && r.fields.length) ?? results[results.length - 1];
  const columns = last?.fields?.map((f) => f.name) ?? [];
  const rows = (last?.rows ?? []).map((r) => (Array.isArray(r) ? r : columns.map((c) => r[c])).map((v) =>
    v instanceof Date ? v.toISOString().replace('T', ' ').replace(/\.000Z$/, 'Z') : v !== null && typeof v === 'object' && !(v instanceof Uint8Array) ? JSON.stringify(v) : cell(v)));
  return { columns, rows, ms: performance.now() - t0, statements: results.length };
}
