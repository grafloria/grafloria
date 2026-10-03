// Real in-browser databases for the Data modeling studio's query runner —
// demos/diagrams/data-modeling-db.js, verbatim, with types. The React, Vue,
// Angular and Qwik versions each keep an identical copy next to their demo file.
//
// Nothing here loads with the page. The first Run on an engine downloads it:
//   SQLite      — sql.js 1.10.3 (SQLite compiled to WebAssembly), from cdnjs
//   PostgreSQL  — PGlite (Postgres compiled to WebAssembly), an ES module from jsDelivr
// MySQL has no in-browser build, so the runner offers the other two instead.
//
// Each run builds the schema from scratch, inserts the seed rows and runs the
// visitor's query, and reports which of those three steps failed, if one did.
/* eslint-disable @typescript-eslint/no-explicit-any */

const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
const PGLITE_URL: string = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js';

export type EngineKind = 'sqlite' | 'postgresql';
export const ENGINES: Record<EngineKind, { label: string; lib: string; size: string; host: string }> = {
  sqlite: { label: 'SQLite', lib: 'sql.js 1.10.3', size: 'about 1 MB', host: 'cdnjs' },
  postgresql: { label: 'PostgreSQL', lib: 'PGlite', size: 'about 3 MB', host: 'jsDelivr' },
};

/** A loaded engine: sql.js's module (`SQL`) or a PGlite database (`db`). */
export interface Engine { kind: EngineKind; version: string; SQL?: any; db?: any }
export interface RunResult { columns: string[]; rows: unknown[][]; ms: number; statements: number }

const loads: Partial<Record<string, Promise<Engine>>> = {};   // kind → Promise<engine>
const ready: Partial<Record<string, Engine>> = {};            // kind → engine, once loaded

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> => Promise.race([
  p,
  new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} did not arrive within ${Math.round(ms / 1000)} s — check the network`)), ms)),
]);

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

export const isLoaded = (kind: string) => !!ready[kind];

/** PGlite's FS bundle, fetched and read up front, in the Blob-like shape its `fsBundle` option takes. */
async function readFsBundle() {
  const buf = await (await fetch(new URL('pglite.data', PGLITE_URL))).arrayBuffer();
  return { arrayBuffer: () => ({ then: (ok: (b: ArrayBuffer) => void) => ok(buf) }) };
}

/** Load (once) and return the engine for `kind`: 'sqlite' | 'postgresql'. */
export function loadEngine(kind: EngineKind, timeoutMs = 60000): Promise<Engine> {
  if (loads[kind]) return loads[kind]!;
  let p: Promise<Engine>;
  if (kind === 'sqlite') {
    p = (async () => {
      const w = window as any;
      if (!w.initSqlJs) await loadScript(SQLJS_BASE + 'sql-wasm.js');
      const SQL = await w.initSqlJs({ locateFile: (file: string) => SQLJS_BASE + file });
      const probe = new SQL.Database();
      const version = probe.exec('select sqlite_version()')[0]?.values?.[0]?.[0] ?? '';
      probe.close();
      return { kind, version: `SQLite ${version}`, SQL };
    })();
  } else if (kind === 'postgresql') {
    p = (async () => {
      const mod = await import(/* @vite-ignore */ PGLITE_URL);
      // (Port note) Under zone.js — the Angular app — native Promise#then is
      // patched, and PGlite keeps its FS bundle from a then() callback it never
      // awaits: that callback then runs AFTER PGlite has started and asked for the
      // bundle (`undefined.byteLength`). There PGlite gets the bundle already read,
      // through a then() that answers at once. Elsewhere: exactly the JS page.
      const db = (window as any).Zone ? new mod.PGlite({ fsBundle: await readFsBundle() }) : new mod.PGlite();
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
  return loads[kind]!;
}

class StepError extends Error {
  phase: string;
  constructor(phase: string, cause: any) { super(cause && cause.message ? cause.message : String(cause)); this.phase = phase; }
}

const cell = (v: unknown) => (v instanceof Uint8Array ? `‹${v.length} bytes›` : v);

/**
 * Build `ddl`, insert `seed`, run `query` on a fresh database. Resolves to
 * { columns, rows, ms, statements } for the query's last result set, or
 * rejects with an Error whose `.phase` is 'schema' | 'seed' | 'query'.
 */
export async function runScript(engine: Engine, { ddl, seed, query }: { ddl: string; seed: string; query: string }): Promise<RunResult> {
  const t0 = performance.now();
  if (engine.kind === 'sqlite') {
    const db = new engine.SQL.Database();
    try {
      try { db.exec(ddl); } catch (e) { throw new StepError('schema', e); }
      try { if (seed.trim()) db.exec(seed); } catch (e) { throw new StepError('seed', e); }
      let res: any[];
      try { res = db.exec(query); } catch (e) { throw new StepError('query', e); }
      const last = res[res.length - 1];
      return {
        columns: last ? last.columns : [],
        rows: last ? last.values.map((r: unknown[]) => r.map(cell)) : [],
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
  let results: any[];
  try { results = await db.exec(query, { rowMode: 'array' }); } catch (e) { throw new StepError('query', e); }
  const last = [...results].reverse().find((r) => r.fields && r.fields.length) ?? results[results.length - 1];
  const columns: string[] = last?.fields?.map((f: any) => f.name) ?? [];
  const rows = (last?.rows ?? []).map((r: any) => (Array.isArray(r) ? r : columns.map((c) => r[c])).map((v: any) =>
    v instanceof Date ? v.toISOString().replace('T', ' ').replace(/\.000Z$/, 'Z') : v !== null && typeof v === 'object' && !(v instanceof Uint8Array) ? JSON.stringify(v) : cell(v)));
  return { columns, rows, ms: performance.now() - t0, statements: results.length };
}
