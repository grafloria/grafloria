import { useEffect, useReducer, useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';
import { mountCodeEditor } from '../code-editor';
import {
  DataModelingController, DIALECTS, ENGINES, ON_DELETE, ICON, RESULT_IDLE, type ResultView,
} from './data-modeling-controller';

/**
 * A data modeling studio on the Grafloria engine: design a database on the
 * board and read its SQL as you go.
 *
 *   • The SCHEMA is plain data (tables, columns, relationships, groups, notes).
 *     The board is a projection of it: every edit — a rename, a UQ switch, a
 *     new foreign key, a hidden group, an import — is ONE Command on the
 *     engine's own undo stack that swaps the schema for its next version and
 *     reconciles the board. Dragging cards is the engine's own undoable move,
 *     so Ctrl/⌘+Z walks both kinds of step in order.
 *   • A table card is the page's own HTML tree (UQ / NN switches, a footer,
 *     a grip on each row's edges) that keeps the diagram kit's class contract,
 *     so the kit's live join guidance tints the rows while a key is dragged.
 *   • Each row has two ports — the grips. Dragging one onto a column of another
 *     table makes a foreign key; the engine draws the wire while you aim.
 *   • Group zones are nodes behind their tables: drag one and its tables come
 *     along, hide one and its tables fold away (their keys then point at it).
 *   • The DDL panel regenerates on every change, per dialect; Run SQL loads
 *     sql.js or PGlite on demand and runs your query against real rows.
 *
 * The SQL writer, the DDL parser, the seed rows and the in-browser engines live
 * in data-modeling-sql.ts / -db.ts, the cards in data-modeling-cards.ts, and the
 * engine side (the schema's undoable step, the board, the grip drag, the keys,
 * the editors and menus ON the cards) in DataModelingController. This component
 * owns the markup around the board — toolbar, side panel, import dialog — and
 * re-renders on the controller's bump(). The three code boxes (DDL, query,
 * import) are bound textareas that the gallery's Monaco editor colours.
 *
 * Next to the JS page: the studio is full-bleed (this app has no gallery header),
 * and the page's test hooks (ctx.state(), ctx.ddl(), ctx.lastRun …) are not
 * exposed — what a visitor sees and does is the same.
 */

const NO_NODES: never[] = [];
const INTERACTION = { portVisibility: 'on-hover' };
const RENDERER = { colorMode: 'system' };
const FLOW_STYLE = { display: 'block', width: '100%', height: '100%' };
const ENGINE_KINDS = ['sqlite', 'postgresql'] as const;

const DialectIcon = ({ k }: { k: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[k]} /></svg>;

/** The result box under the query: idle, loading an engine, an error, or the rows. */
function Result({ r }: { r: ResultView }) {
  if (r.kind === 'idle') return <div className="idle">{RESULT_IDLE}</div>;
  if (r.kind === 'loading') return <div className="idle"><span className="bar"></span>Loading the database engine — {r.lib} from {r.host}. This happens once per visit; after that every run is instant.</div>;
  if (r.kind === 'error') return <div className="err"><b>{r.title}</b><code>{r.msg}</code></div>;
  return (
    <>
      <div className="meta"><b>{r.head}</b>{r.rest}</div>
      {!r.columns.length ? <div className="idle">The statement ran and returned no rows.</div> : (
        <table>
          <thead><tr>{r.columns.map((col, i) => <th key={i}>{col}</th>)}</tr></thead>
          <tbody>{r.rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j} className={cell.cls || undefined} title={cell.title || undefined}>{cell.text}</td>)}</tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

export default function DataModelingDemo() {
  const ctl = useRef<DataModelingController | null>(null);
  if (!ctl.current) ctl.current = new DataModelingController();
  const c = ctl.current;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  c.bump = bump;
  c.mountCode = mountCodeEditor;
  const studio = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const sqlTa = useRef<HTMLTextAreaElement>(null);
  const runTa = useRef<HTMLTextAreaElement>(null);
  const impTa = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => c.destroy(), [c]);

  const onInit = (instance: DiagramInstance) => {
    void c.init(instance, {
      studio: studio.current!, board: board.current!, layer: layer.current!,
      sqlTa: sqlTa.current!, runTa: runTa.current!, impTa: impTa.current!,
    }).then((done) => { if (done) markReady(); });
  };

  const pane = c.view.pane;
  return (
    <>
      <style>{CSS}</style>
      <div id="dm-studio" ref={studio}>
        <div className="dm-bar" role="toolbar" aria-label="Data modeling tools">
          <button className="tb" id="tb-table" title="Add a table (T)" onClick={() => c.addTable()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5"/><path d="M1.5 5.5h10M5 5.5v6"/><path d="M13 9.5v5M10.5 12h5" strokeLinecap="round"/></svg><span className="lbl">Table</span><kbd>T</kbd></button>
          <button className="tb" id="tb-group" title="Add a group (G) — wraps the selected tables" onClick={() => c.addGroup()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 1.8"><rect x="1.5" y="2.5" width="13" height="11" rx="3"/></svg><span className="lbl">Group</span><kbd>G</kbd></button>
          <button className="tb" id="tb-note" title="Add a note (N)" onClick={() => c.addNote()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M2.5 2.5h11v7l-4 4h-7z"/><path d="M9.5 13.5v-4h4M5 6h6M5 8.5h3"/></svg><span className="lbl">Note</span><kbd>N</kbd></button>
          <span className="tb-sep"></span>
          <button className="tb icon" id="tb-undo" title="Undo (Ctrl/⌘ Z)" aria-label="Undo" disabled={!c.canUndo} onClick={() => c.undo()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H7"/></svg></button>
          <button className="tb icon" id="tb-redo" title="Redo (Ctrl/⌘ ⇧ Z)" aria-label="Redo" disabled={!c.canRedo} onClick={() => c.redo()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H9"/></svg></button>
          <span className="tb-sep"></span>
          <label className="tb-search" title="Search tables and columns — Enter jumps to the next match"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><input id="tb-search" type="search" placeholder="Search tables, columns" autoComplete="off" spellCheck={false}
            value={c.search} onChange={(e) => c.setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); c.searchKey(e.key); }} /><span className="n" id="tb-search-n">{c.searchCount}</span></label>
          <button className="tb icon" id="tb-fit" title="Fit the schema in view" aria-label="Fit" onClick={() => c.fit()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5.5V2h3.5M14 5.5V2h-3.5M2 10.5V14h3.5M14 10.5V14h-3.5"/></svg></button>
          <span className="tb-sp"></span>
          <div className="dialects" role="tablist" aria-label="SQL dialect" id="tb-dialects">
            {Object.values(DIALECTS).map((d) => (
              <button key={d.id} role="tab" className={d.id} data-dialect={d.id} aria-selected={d.id === c.view.dialect} title={`Write the SQL for ${d.label}`}
                onClick={() => c.setDialect(d.id)}><DialectIcon k={d.id} />{d.label}</button>
            ))}
          </div>
          <span className="tb-sep"></span>
          <button className="tb" id="tb-import" title="Import CREATE TABLE statements" onClick={() => c.openImport()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M2.5 11v2.5h11V11"/></svg><span className="lbl">Import</span></button>
          <button className="tb" id="tb-export" title="Download the DDL as a .sql file" onClick={() => c.exportDDL()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 10V2M5 5l3-3 3 3"/><path d="M2.5 11v2.5h11V11"/></svg><span className="lbl">Export</span></button>
          <button className="tb primary" id="tb-run" title="Build the schema in a real in-browser database and run the query" onClick={() => void c.runQuery()}><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8v10.4L13 8z"/></svg>Run SQL</button>
        </div>
        <div className={'dm-main' + (c.sideOpen ? '' : ' side-off')}>
          <div id="dm-board" ref={board}>
            <GrafloriaFlow defaultNodes={NO_NODES} defaultEdges={NO_NODES} interaction={INTERACTION} rendererConfig={RENDERER}
              style={FLOW_STYLE} onInit={onInit} />
            <div className={'dm-toast' + (c.toastShow ? ' show' : '')} id="dm-toast" role="status" aria-live="polite">{c.toastMsg}</div>
            <button className="dm-side-show" id="side-show" title="Show the SQL, relationships and query runner" onClick={() => c.setSide(true)}>‹ SQL</button>
          </div>
          <aside id="dm-side" aria-label="SQL, relationships and the query runner">
            <div className="dm-tabs" role="tablist">
              <button role="tab" id="tab-sql" data-pane="sql" aria-selected={pane === 'sql'} onClick={() => c.showPane('sql')}>SQL</button>
              <button role="tab" id="tab-rels" data-pane="rels" aria-selected={pane === 'rels'} onClick={() => c.showPane('rels')}>Relationships <span className="pill" id="rels-n">{c.relCount}</span></button>
              <button role="tab" id="tab-run" data-pane="run" aria-selected={pane === 'run'} onClick={() => c.showPane('run')}>Run SQL</button>
              <span className="sp"></span><button className="dm-side-x" id="side-hide" title="Hide the panel — more room for the board" aria-label="Hide the side panel" onClick={() => c.setSide(false)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>
            </div>
            <section className="dm-pane" id="pane-sql" hidden={pane !== 'sql'}>
              <div className="dm-pane-head"><span id="sql-head"><b>{c.sqlHead.label}</b>{c.sqlHead.rest}</span><span className="sp"></span><button className="sb" id="sql-copy" title="Copy the DDL" onClick={() => c.copySQL()}>Copy</button></div>
              <div className="dm-code"><textarea id="sql-text" ref={sqlTa} spellCheck={false} readOnly aria-label="Generated DDL" value={c.sql} /></div>
            </section>
            <section className="dm-pane" id="pane-rels" hidden={pane !== 'rels'}>
              <div className="dm-pane-head"><span>Every foreign key — click one to find it on the board.</span></div>
              <div className="dm-rels" id="rels-list" onClick={(e) => c.relsClick(e.target)}>
                {!c.rels.length ? <div className="empty">No foreign keys yet. Hover a table and drag the blue grip at a row's edge onto a column of another table.</div> : c.rels.map((r) => (
                  <div key={r.id} className={'dm-rel' + (r.selected ? ' sel' : '')} data-rel={r.id}>
                    <div className="dm-rel-line"><span className="dm-rel-txt"><span className="t">{r.ft}</span>.<span className="c">{r.fc}</span>{' → '}<span className="t">{r.tt}</span>.<span className="c">{r.tc}</span>{' '}<span className="card">({r.card})</span></span>
                      <button className="act" data-ract="edit" title="Edit cardinality and ON DELETE" aria-label={`Edit ${r.name}`}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg></button>
                      <button className="act del" data-ract="del" title="Delete this foreign key" aria-label={`Delete ${r.name}`}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.6h10M6.4 4.6V3h3.2v1.6M4.6 4.6l.7 8.4h5.4l.7-8.4"/></svg></button></div>
                    <div className="dm-rel-sub">{r.sub}</div>
                    {r.editing ? (
                      <div className="dm-rel-edit">
                        <label htmlFor={`rc-${r.id}`}>Cardinality</label><select id={`rc-${r.id}`} data-rfield="card" value={r.card} onChange={(e) => c.relChange(r.id, 'card', e.target.value)}><option value="N:1">Many to one (N:1)</option><option value="1:1">One to one (1:1)</option></select>
                        <label htmlFor={`rd-${r.id}`}>On delete</label><select id={`rd-${r.id}`} data-rfield="onDelete" value={r.onDelete} onChange={(e) => c.relChange(r.id, 'onDelete', e.target.value)}>{ON_DELETE.map((o) => <option key={o}>{o}</option>)}</select>
                        {r.warn && <span className="dm-warn">{r.warn}</span>}
                      </div>
                    ) : r.warn ? <div className="dm-rel-sub"><span className="dm-warn">{r.warn}</span></div> : null}
                  </div>
                ))}
              </div>
            </section>
            <section className="dm-pane dm-run" id="pane-run" hidden={pane !== 'run'}>
              <div className="dm-run-top">
                <div className="dm-engines" id="run-engines">
                  {ENGINE_KINDS.map((k) => (
                    <button key={k} className={k} data-engine={k} aria-pressed={c.runEng === k} title={`Run on ${ENGINES[k].label} (${ENGINES[k].lib})`}
                      onClick={() => c.pickEngine(k)}><DialectIcon k={k} />{ENGINES[k].label}</button>
                  ))}
                </div>
                <div className="dm-note-mysql" id="run-mysql" hidden={!c.mysqlNote}><span><b>MySQL has no in-browser engine.</b> Your schema can run on SQLite or PostgreSQL instead — same tables, same keys, each in its own SQL:</span>
                  <div><button className="sb" data-run-on="sqlite" onClick={() => c.runOn('sqlite')}>Run on SQLite</button><button className="sb" data-run-on="postgresql" onClick={() => c.runOn('postgresql')}>Run on PostgreSQL</button></div></div>
                <div className={'dm-status ' + c.status.cls} id="run-status"><i></i><span>{c.status.text}</span></div>
              </div>
              <div className="dm-q"><textarea id="run-query" ref={runTa} spellCheck={false} aria-label="Your query" value={c.query} onChange={(e) => c.setQuery(e.target.value)} /></div>
              <div className="dm-run-actions"><button className="sb primary" id="run-go" disabled={c.runGoDisabled} onClick={() => void c.runQuery()}>▶ Run</button><button className="sb" id="run-sample" title="Put the sample query back" onClick={() => c.sampleQuery()}>Sample query</button><span className="hint" id="run-hint">{c.runHint}</span></div>
              <div className="dm-result" id="run-result"><Result r={c.result} /></div>
            </section>
          </aside>
        </div>
        <div className="dm-modal" id="dm-import" hidden={!c.impOpen} onPointerDown={(e) => { if (e.target === e.currentTarget) c.closeImport(); }}>
          <div className="dm-dialog" role="dialog" aria-modal="true" aria-labelledby="imp-title">
            <header><h2 id="imp-title">Import DDL</h2><p>Paste CREATE TABLE statements from SQLite, PostgreSQL or MySQL. Primary keys, UNIQUE, NOT NULL, REFERENCES and FOREIGN KEY become cards and lines.</p></header>
            <div className="box"><textarea id="imp-text" ref={impTa} spellCheck={false} aria-label="DDL to import" value={c.impText} onChange={(e) => c.setImpText(e.target.value)} /></div>
            <div className="opts"><label><input type="radio" name="imp-mode" value="replace" checked={c.impMode === 'replace'} onChange={() => c.setImpMode('replace')} /> Replace the current schema</label><label><input type="radio" name="imp-mode" value="add" checked={c.impMode === 'add'} onChange={() => c.setImpMode('add')} /> Add next to it</label></div>
            <div className={'msg' + (c.impBad ? ' bad' : '')} id="imp-msg">{c.impMsg}</div>
            <footer><button className="sb" id="imp-cancel" onClick={() => c.closeImport()}>Cancel</button><button className="sb primary" id="imp-go" onClick={() => void c.importGo()}>Import</button></footer>
          </div>
        </div>
        {/* The board's popovers and inline editors — the controller's, so this stays empty here. */}
        <div className="dm-layer" ref={layer} />
      </div>
    </>
  );
}

const CSS = `
/* The JS page's stylesheet, verbatim — its :root tokens and #canvas rules scoped
   to #dm-studio (one gallery app serves every demo), the studio full-bleed (the
   app has no page header), plus the gallery shell's box model and smoothing,
   which the JS page inherits from demo.css and this app does not. */
#dm-studio, #dm-studio *, #dm-studio *::before, #dm-studio *::after { box-sizing: border-box; }
#dm-studio { -webkit-font-smoothing: antialiased; }
/* The board's popovers and inline editors go in this empty layer (fixed-positioned). */
.dm-layer { display: contents; }
  /* ---- tokens: one palette for the chrome, the cards and the lines ---------- */
  #dm-studio {
    --dm-bg: #f4f6fb; --dm-panel: #ffffff; --dm-line: #e3e7f0; --dm-ink: #1c2333; --dm-mut: #687186; --dm-faint: #a5adbf;
    --dm-accent: #3b52d9; --dm-accent-deep: #2a3ca8; --dm-accent-soft: #eef1fe;
    --dm-card: #ffffff; --dm-card-line: #d7dce8; --dm-row-line: #eef1f6; --dm-head: #f8f9fc; --dm-row-hover: #f4f6ff;
    --dm-pk: #d97706; --dm-fk: #3b52d9; --dm-uq-bg: #efe9ff; --dm-uq: #6d28d9; --dm-nn-bg: #dff5ee; --dm-nn: #047857;
    --dm-hit: #f59e0b; --dm-match-bg: #fff3c4; --dm-danger: #dc2626; --dm-ok: #059669;
    --dm-mono: Menlo, Consolas, "DejaVu Sans Mono", monospace;
    --dm-shadow: 0 1px 2px rgba(20, 30, 60, .06), 0 4px 14px rgba(20, 30, 60, .07);
    /* icons (our own strokes), painted through CSS masks so they take any colour */
    --ic-key: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round'><circle cx='5.2' cy='10.8' r='3'/><path d='M7.4 8.6 13.4 2.6M11.3 4.7l1.9 1.9M9.5 6.5l1.4 1.4'/></svg>");
    --ic-link: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round'><path d='M6.6 9.4l2.8-2.8M5.3 7.4 3.9 8.8a2.4 2.4 0 0 0 3.4 3.4l1.4-1.4M10.7 8.6l1.4-1.4a2.4 2.4 0 0 0-3.4-3.4L7.3 5.2'/></svg>");
    --ic-x: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round'><path d='M4.5 4.5l7 7M11.5 4.5l-7 7'/></svg>");
    --ic-trash: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3 4.6h10M6.4 4.6V3h3.2v1.6M4.6 4.6l.7 8.4h5.4l.7-8.4'/></svg>");
    --ic-dots: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='black'><circle cx='3.5' cy='8' r='1.4'/><circle cx='8' cy='8' r='1.4'/><circle cx='12.5' cy='8' r='1.4'/></svg>");
    --ic-eye: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linejoin='round'><path d='M1.6 8S4 3.8 8 3.8 14.4 8 14.4 8 12 12.2 8 12.2 1.6 8 1.6 8Z'/><circle cx='8' cy='8' r='2'/></svg>");
    --ic-eye-off: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M1.6 8S4 3.8 8 3.8 14.4 8 14.4 8 12 12.2 8 12.2 1.6 8 1.6 8Z'/><path d='M2.5 2.5l11 11'/></svg>");
  }
  @media (prefers-color-scheme: dark) {
    #dm-studio {
      --dm-bg: #0f131c; --dm-panel: #151a26; --dm-line: #272e3e; --dm-ink: #e5e9f3; --dm-mut: #9aa3b8; --dm-faint: #5f687b;
      --dm-accent: #8b9cf2; --dm-accent-deep: #a9b6f5; --dm-accent-soft: rgba(139, 156, 242, .14);
      --dm-card: #1a2030; --dm-card-line: #2f374a; --dm-row-line: #242b3b; --dm-head: #1e2536; --dm-row-hover: #222a3d;
      --dm-pk: #fbbf24; --dm-fk: #a5b4fc; --dm-uq-bg: rgba(167, 139, 250, .18); --dm-uq: #c4b5fd; --dm-nn-bg: rgba(52, 211, 153, .15); --dm-nn: #6ee7b7;
      --dm-match-bg: rgba(245, 158, 11, .2); --dm-danger: #f87171; --dm-ok: #34d399;
      --dm-shadow: 0 1px 2px rgba(0, 0, 0, .35), 0 6px 18px rgba(0, 0, 0, .3);
    }
  }

  /* ---- the studio: toolbar on top, the board + a side panel below ----------- */
  #dm-studio { height: 100vh; min-height: 560px; display: flex; flex-direction: column; background: var(--dm-bg);
    color: var(--dm-ink); font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .dm-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 7px 12px;
    background: var(--dm-panel); border-bottom: 1px solid var(--dm-line); position: relative; z-index: 5; }
  .tb { height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px;
    background: transparent; color: var(--dm-ink); font: 500 12.5px/1 system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .tb:hover:not(:disabled) { background: var(--dm-accent-soft); color: var(--dm-accent-deep); }
  .tb svg { width: 16px; height: 16px; flex: none; }
  .tb kbd { font: 600 10px/1 var(--dm-mono); padding: 2px 5px; border-radius: 4px; border: 1px solid var(--dm-line); color: var(--dm-mut); background: var(--dm-bg); }
  .tb.icon { width: 32px; padding: 0; justify-content: center; }
  .tb:disabled { opacity: .35; cursor: default; }
  .tb.primary { background: var(--dm-accent); color: #fff; padding: 0 13px; }
  .tb.primary:hover { background: var(--dm-accent-deep); color: #fff; }
  @media (prefers-color-scheme: dark) { .tb.primary { color: #10142a; } .tb.primary:hover { color: #10142a; } }
  .tb-sep { width: 1px; height: 22px; background: var(--dm-line); margin: 0 3px; }
  .tb-sp { flex: 1; }
  .tb-search { display: inline-flex; align-items: center; gap: 6px; height: 32px; border: 1px solid var(--dm-line); border-radius: 8px;
    padding: 0 8px; background: var(--dm-bg); color: var(--dm-mut); }
  .tb-search:focus-within { border-color: var(--dm-accent); }
  .tb-search svg { width: 15px; height: 15px; flex: none; }
  .tb-search input { border: 0; outline: 0; background: transparent; color: var(--dm-ink); font: 12.5px system-ui, sans-serif; width: 150px; }
  .tb-search .n { font-size: 11px; white-space: nowrap; }
  .dialects { display: inline-flex; padding: 3px; gap: 2px; border-radius: 9px; background: var(--dm-bg); border: 1px solid var(--dm-line); }
  .dialects button { height: 26px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 6px;
    background: transparent; color: var(--dm-mut); font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
  .dialects button:hover { color: var(--dm-ink); }
  .dialects button[aria-selected="true"] { background: var(--dm-panel); color: var(--dm-ink); box-shadow: 0 1px 2px rgba(20, 30, 60, .14); }
  .dialects svg { width: 14px; height: 14px; }
  .dialects .sqlite svg { fill: #0f80cc; } .dialects .postgresql svg { fill: #4169e1; } .dialects .mysql svg { fill: #00758f; }
  @media (prefers-color-scheme: dark) { .dialects .sqlite svg { fill: #5cb8f0; } .dialects .postgresql svg { fill: #8ea8ff; } .dialects .mysql svg { fill: #4fc1d9; } }

  .dm-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) clamp(320px, 30%, 420px); }
  .dm-main.side-off { grid-template-columns: minmax(0, 1fr); }
  .dm-main.side-off #dm-side { display: none; }
  .dm-side-x { margin: 0 0 4px; width: 28px; height: 28px; align-self: center; border: 0; border-radius: 7px; background: none; color: var(--dm-mut);
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .dm-side-x:hover { background: var(--dm-accent-soft); color: var(--dm-accent-deep); }
  .dm-side-x svg { width: 16px; height: 16px; }
  .dm-tabs .sp { flex: 1; }
  .dm-side-show { position: absolute; top: 12px; right: 12px; z-index: 6; height: 30px; padding: 0 12px; border: 1px solid var(--dm-line); border-radius: 8px;
    background: var(--dm-panel); color: var(--dm-accent-deep); font: 600 12px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 8px rgba(20, 30, 60, .1); }
  .dm-main:not(.side-off) .dm-side-show { display: none; }
  /* a narrow studio (gallery menu + how-to panel open) keeps the toolbar on one line */
  #dm-studio { container-type: inline-size; }
  @container (max-width: 1180px) { .tb kbd { display: none; } .tb-search input { width: 120px; } }
  @container (max-width: 1020px) { .tb .lbl { display: none; } .tb:not(.primary) { padding: 0 8px; } .dialects button { padding: 0 8px; } .tb-search input { width: 96px; } }
  @container (max-width: 940px) { .dialects svg { display: none; } .tb-sep { margin: 0 1px; } }
  #dm-board { position: relative; overflow: hidden; min-width: 0; min-height: 0; }
  #dm-side { border-left: 1px solid var(--dm-line); background: var(--dm-panel); display: flex; flex-direction: column; min-height: 0; min-width: 0; }

  /* ---- the board's own chrome -------------------------------------------------- */
  #dm-board foreignObject { overflow: visible; }
  #dm-board .grafloria-html-node { overflow: visible !important; }
  #dm-board .selection-highlight { display: none; }
  #dm-board rect.diagram-node { fill: transparent !important; stroke: transparent !important; }
  #dm-board rect.node-shadow { display: none; }   /* the cards cast their own CSS shadow */
  .dm-toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 30; max-width: min(560px, 80%);
    background: #1c2333; color: #f3f5fb; padding: 8px 14px; border-radius: 9px; font: 12.5px/1.4 system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(10, 15, 30, .25); pointer-events: none; opacity: 0; transition: opacity .18s; text-align: center; }
  .dm-toast.show { opacity: 1; }
  @media (prefers-color-scheme: dark) { .dm-toast { background: #e5e9f3; color: #151a26; } }

  /* ---- table cards (inside each node's foreignObject) -------------------------- */
  .dm-card { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--dm-card);
    border: 1px solid var(--dm-card-line); border-radius: 10px; box-shadow: var(--dm-shadow); color: var(--dm-ink);
    font: 12px/1 system-ui, sans-serif; user-select: none; -webkit-user-select: none; overflow: hidden; }
  g.node-group[data-selected="true"] .dm-card { border-color: var(--dm-accent); box-shadow: 0 0 0 2px var(--dm-accent), var(--dm-shadow); }
  .dm-card.dm-dim > * { opacity: .3; }
  .dm-card.dm-hit { box-shadow: 0 0 0 2px var(--dm-hit), var(--dm-shadow); }
  .dm-head { flex: none; height: 36px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 12px;
    background: var(--dm-head); border-bottom: 1px solid var(--dm-card-line); }
  .dm-tdot { width: 8px; height: 8px; border-radius: 2px; flex: none; background: var(--dm-faint); }
  .dm-tdot[class*="dm-zc-"] { background: var(--zc); }
  .dm-tname { flex: 1; min-width: 0; font: 600 13px/1 var(--dm-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; }
  .dm-tname:hover, .dm-cname:hover { text-decoration: underline dotted var(--dm-faint); text-underline-offset: 3px; }
  .dm-hl { background: var(--dm-match-bg); color: inherit; border-radius: 2px; font-weight: inherit; }
  .dm-tdel, .dm-cdel, .dm-ndel { width: 18px; height: 18px; flex: none; border-radius: 5px; cursor: pointer; opacity: 0; position: relative; }
  .dm-tdel::before, .dm-cdel::before, .dm-ndel::before { content: ""; position: absolute; inset: 2px; background: var(--dm-mut);
    -webkit-mask: var(--ic-trash) center / 14px no-repeat; mask: var(--ic-trash) center / 14px no-repeat; }
  .dm-cdel::before, .dm-ndel::before { -webkit-mask-image: var(--ic-x); mask-image: var(--ic-x); }
  .dm-head:hover .dm-tdel, .dm-row:hover .dm-cdel, .dm-nhead:hover .dm-ndel { opacity: 1; }
  .dm-tdel:hover::before, .dm-cdel:hover::before, .dm-ndel:hover::before { background: var(--dm-danger); }
  .dm-body { flex: 1; min-height: 0; }
  .dm-row { height: 24px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; padding: 0 6px 0 10px; border-top: 1px solid var(--dm-row-line); }
  .dm-row:first-child { border-top-color: transparent; }
  .dm-row:hover { background: var(--dm-row-hover); }
  .dm-row.dm-match { background: var(--dm-match-bg); }
  .dm-key { width: 16px; height: 16px; flex: none; cursor: pointer; background: var(--dm-faint); opacity: .0;
    -webkit-mask: var(--ic-key) center / 14px no-repeat; mask: var(--ic-key) center / 14px no-repeat; }
  .dm-row:hover .dm-key { opacity: .55; }
  .dm-row.dm-fk .dm-key { opacity: 1; background: var(--dm-fk); -webkit-mask-image: var(--ic-link); mask-image: var(--ic-link); }
  .dm-row.dm-pk .dm-key { opacity: 1; background: var(--dm-pk); -webkit-mask-image: var(--ic-key); mask-image: var(--ic-key); }
  .dm-cname { flex: 1; min-width: 0; font: 12px/1 var(--dm-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; }
  .dm-row.dm-pk .dm-cname { font-weight: 600; }
  .dm-ctype { flex: none; font: 11px/1 var(--dm-mono); color: var(--dm-mut); cursor: pointer; padding: 3px 3px; border-radius: 4px; white-space: nowrap; }
  .dm-ctype:hover { background: var(--dm-accent-soft); color: var(--dm-accent-deep); }
  .dm-badge { flex: none; width: 24px; height: 16px; box-sizing: border-box; border-radius: 4px; display: inline-flex; align-items: center;
    justify-content: center; font: 700 9px/1 var(--dm-mono); letter-spacing: .02em; color: var(--dm-faint); border: 1px solid transparent; cursor: pointer; }
  .dm-badge:hover { border-color: var(--dm-card-line); color: var(--dm-mut); }
  .dm-badge.dm-uq.on { background: var(--dm-uq-bg); color: var(--dm-uq); }
  .dm-badge.dm-nn.on { background: var(--dm-nn-bg); color: var(--dm-nn); }
  .dm-badge.implied { opacity: .55; cursor: default; }
  .dm-cdel { width: 14px; height: 14px; }
  .dm-foot { flex: none; height: 28px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 0 10px;
    border-top: 1px solid var(--dm-card-line); background: var(--dm-head); }
  .dm-count { font-size: 11px; color: var(--dm-mut); }
  .dm-add { font: 600 11.5px/1 system-ui, sans-serif; color: var(--dm-accent); cursor: pointer; padding: 4px 6px; border-radius: 5px; }
  .dm-add:hover { background: var(--dm-accent-soft); }
  /* the kit's join guidance tints rows while a foreign key is dragged */
  .dm-row.axk-match-top .dm-cname { font-weight: 700; }

  /* ---- column grips: the board's ports, a short bar on each row's edge ---------- */
  #dm-board rect.port[data-port-id*="::"] { fill: var(--dm-accent) !important; stroke: var(--dm-card) !important; stroke-width: 1.5px !important;
    opacity: .45; transition: opacity .12s !important; }
  #dm-board rect.port[data-port-id*="::"]:hover, #dm-board rect.port.port-highlighted[data-port-id*="::"] { opacity: 1; }

  /* ---- group zones -------------------------------------------------------------- */
  .dm-zc-blue { --zc: #3b82f6; } .dm-zc-green { --zc: #10b981; } .dm-zc-amber { --zc: #f59e0b; }
  .dm-zc-violet { --zc: #8b5cf6; } .dm-zc-rose { --zc: #f43f5e; } .dm-zc-teal { --zc: #14b8a6; }
  .dm-zone { box-sizing: border-box; width: 100%; height: 100%; border-radius: 16px; border: 1.5px solid color-mix(in srgb, var(--zc) 38%, transparent);
    background: color-mix(in srgb, var(--zc) 6%, transparent); color: var(--dm-ink); font: 13px/1 system-ui, sans-serif; user-select: none; }
  g.node-group[data-selected="true"] .dm-zone { border-color: var(--zc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--zc) 25%, transparent); }
  .dm-zone.dm-zone-match { box-shadow: 0 0 0 2px var(--dm-hit); }
  .dm-zone-hidden { border-style: dashed; background: color-mix(in srgb, var(--zc) 12%, var(--dm-panel)); }
  .dm-zhead { height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 7px 0 14px; }
  .dm-zdot { width: 9px; height: 9px; border-radius: 50%; background: var(--zc); flex: none; }
  .dm-ztitle { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; min-width: 0; }
  .dm-zcount { font-size: 11.5px; color: var(--dm-mut); white-space: nowrap; }
  .dm-zsp { flex: 1; }
  .dm-zbtn { position: relative; width: 26px; height: 26px; border-radius: 7px; cursor: pointer; flex: none; }
  .dm-zbtn::before { content: ""; position: absolute; inset: 5px; background: var(--dm-mut); -webkit-mask: var(--ic) center / 16px no-repeat; mask: var(--ic) center / 16px no-repeat; }
  .dm-zbtn:hover { background: color-mix(in srgb, var(--zc) 16%, transparent); }
  .dm-zbtn:hover::before { background: var(--dm-ink); }
  .dm-zmenu { --ic: var(--ic-dots); } .dm-zeye { --ic: var(--ic-eye); } .dm-zeye.off { --ic: var(--ic-eye-off); }

  /* ---- sticky notes ------------------------------------------------------------- */
  .dm-note { box-sizing: border-box; width: 100%; height: 100%; border-radius: 10px; background: #fff8d8; border: 1px solid #ecd585;
    box-shadow: 0 2px 10px rgba(120, 90, 10, .1); padding: 9px 12px; color: #5a4a1f; font: 12px/1.55 system-ui, sans-serif; overflow: hidden; user-select: none; }
  g.node-group[data-selected="true"] .dm-note { border-color: #d4a72c; box-shadow: 0 0 0 2px #e9b949; }
  .dm-nhead { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .dm-ntitle { flex: 1; font-weight: 700; font-size: 13px; color: #3e3110; }
  .dm-ntext { white-space: pre-wrap; overflow-wrap: anywhere; }
  @media (prefers-color-scheme: dark) {
    .dm-note { background: #2b2614; border-color: #5d4e1c; color: #e3d6a8; box-shadow: 0 2px 10px rgba(0, 0, 0, .3); }
    .dm-ntitle { color: #f4e7b8; }
  }

  /* ---- popovers: inline editor, type menu, group menu ---------------------------- */
  .dm-edit { position: fixed; z-index: 2147483000; box-sizing: border-box; border: 1.5px solid var(--dm-accent); border-radius: 5px; padding: 0 6px;
    background: var(--dm-panel); color: var(--dm-ink); font: 12px/1 var(--dm-mono); outline: none; box-shadow: 0 4px 14px rgba(20, 30, 60, .18); }
  textarea.dm-edit { font: 12px/1.55 system-ui, sans-serif; padding: 8px 10px; resize: none; }
  .dm-pop { position: fixed; z-index: 2147482990; min-width: 180px; background: var(--dm-panel); border: 1px solid var(--dm-line); border-radius: 10px;
    box-shadow: 0 14px 36px rgba(15, 20, 35, .2); padding: 6px; display: grid; gap: 2px; font: 12.5px/1.3 system-ui, sans-serif; color: var(--dm-ink); }
  .dm-pop[hidden] { display: none; }
  .dm-pop input { box-sizing: border-box; width: 100%; height: 30px; border: 1px solid var(--dm-line); border-radius: 7px; padding: 0 8px; margin-bottom: 4px;
    background: var(--dm-bg); color: var(--dm-ink); font: 12px var(--dm-mono); outline: none; }
  .dm-pop input:focus { border-color: var(--dm-accent); }
  .dm-pop button { display: flex; align-items: center; gap: 8px; border: 0; background: none; text-align: left; padding: 6px 8px; border-radius: 6px;
    cursor: pointer; color: inherit; font: inherit; }
  .dm-pop button:hover, .dm-pop button.on { background: var(--dm-accent-soft); }
  .dm-pop .opt { font-family: var(--dm-mono); font-size: 12px; }
  .dm-pop .opt small { margin-left: auto; color: var(--dm-mut); font: 10.5px system-ui, sans-serif; }
  .dm-pop .opts { display: grid; gap: 1px; max-height: 260px; overflow-y: auto; }
  .dm-pop .sep { height: 1px; background: var(--dm-line); margin: 4px 2px; }
  .dm-pop .swatches { display: flex; gap: 6px; padding: 4px 8px; }
  .dm-pop .swatches button { width: 20px; height: 20px; padding: 0; border-radius: 50%; background: var(--zc); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .5); }
  .dm-pop .swatches button.on { box-shadow: 0 0 0 2px var(--dm-panel), 0 0 0 4px var(--zc); }
  .dm-pop .danger { color: var(--dm-danger); }

  /* ---- side panel: SQL · Relationships · Run SQL --------------------------------- */
  .dm-tabs { flex: none; display: flex; gap: 2px; padding: 6px 10px 0; border-bottom: 1px solid var(--dm-line); }
  .dm-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px 9px; border: 0; border-bottom: 2px solid transparent;
    background: none; color: var(--dm-mut); font: 600 12.5px/1 system-ui, sans-serif; cursor: pointer; margin-bottom: -1px; }
  .dm-tabs button:hover { color: var(--dm-ink); }
  .dm-tabs button[aria-selected="true"] { color: var(--dm-accent); border-bottom-color: var(--dm-accent); }
  .dm-tabs .pill { font: 600 10.5px/1 system-ui, sans-serif; padding: 2px 6px; border-radius: 999px; background: var(--dm-accent-soft); color: var(--dm-accent); }
  .dm-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .dm-pane[hidden] { display: none; }
  .dm-pane-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: 12px; color: var(--dm-mut); }
  .dm-pane-head b { color: var(--dm-ink); font-weight: 600; }
  .dm-pane-head .sp { flex: 1; }
  .sb { height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid var(--dm-line); border-radius: 7px;
    background: var(--dm-panel); color: var(--dm-ink); font: 500 12px/1 system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .sb:hover:not(:disabled) { border-color: var(--dm-accent); color: var(--dm-accent-deep); }
  .sb:disabled { opacity: .45; cursor: default; }
  .sb.primary { background: var(--dm-accent); border-color: var(--dm-accent); color: #fff; }
  .sb.primary:hover:not(:disabled) { background: var(--dm-accent-deep); color: #fff; }
  @media (prefers-color-scheme: dark) { .sb.primary, .sb.primary:hover:not(:disabled) { color: #10142a; } }
  .dm-code { flex: 1; min-height: 0; margin: 0 12px 12px; border: 1px solid var(--dm-line); border-radius: 10px; overflow: hidden; position: relative; }
  .dm-code textarea { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; resize: none; padding: 10px 12px; outline: none;
    background: var(--dm-bg); color: var(--dm-ink); font: 12px/1.55 var(--dm-mono); white-space: pre; }
  .dm-rels { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 12px 12px; display: grid; gap: 6px; align-content: start; }
  .dm-rels .empty { color: var(--dm-mut); font-size: 12.5px; line-height: 1.5; padding: 8px 2px; }
  .dm-rel { border: 1px solid var(--dm-line); border-radius: 10px; padding: 7px 8px 7px 10px; display: grid; gap: 3px; background: var(--dm-panel); cursor: pointer; }
  .dm-rel:hover { border-color: color-mix(in srgb, var(--dm-accent) 45%, var(--dm-line)); }
  .dm-rel.sel { border-color: var(--dm-accent); box-shadow: 0 0 0 2px var(--dm-accent-soft); }
  .dm-rel-line { display: flex; align-items: center; gap: 4px; }
  .dm-rel-txt { flex: 1; min-width: 0; font: 12px/1.45 var(--dm-mono); overflow-wrap: anywhere; color: var(--dm-mut); }
  .dm-rel-txt .t { color: var(--dm-ink); font-weight: 600; }
  .dm-rel-txt .c { color: var(--dm-accent-deep); }
  .dm-rel-txt .card { color: var(--dm-mut); }
  .dm-rel .act { width: 26px; height: 26px; flex: none; border: 1px solid transparent; border-radius: 7px; background: none; cursor: pointer; color: var(--dm-mut);
    display: inline-flex; align-items: center; justify-content: center; padding: 0; }
  .dm-rel .act svg { width: 15px; height: 15px; }
  .dm-rel .act:hover { background: var(--dm-accent-soft); color: var(--dm-accent-deep); }
  .dm-rel .act.del:hover { background: rgba(220, 38, 38, .1); color: var(--dm-danger); }
  .dm-rel-sub { font-size: 11px; color: var(--dm-mut); }
  .dm-rel-edit { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; padding-top: 7px; margin-top: 3px;
    border-top: 1px dashed var(--dm-line); font-size: 12px; cursor: default; }
  .dm-rel-edit select, .dm-run select { height: 28px; border: 1px solid var(--dm-line); border-radius: 7px; background: var(--dm-bg); color: var(--dm-ink);
    font: 12px system-ui, sans-serif; padding: 0 6px; }
  .dm-warn { color: #b45309; font-size: 11.5px; grid-column: 1 / -1; }
  @media (prefers-color-scheme: dark) { .dm-warn { color: #fbbf24; } }
  .dm-run-top { flex: none; padding: 8px 12px 6px; display: grid; gap: 8px; }
  .dm-engines { display: flex; gap: 6px; }
  .dm-engines button { flex: 1; height: 32px; border: 1px solid var(--dm-line); border-radius: 8px; background: var(--dm-panel); color: var(--dm-mut);
    font: 600 12px/1 system-ui, sans-serif; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .dm-engines button svg { width: 14px; height: 14px; }
  .dm-engines button[aria-pressed="true"] { border-color: var(--dm-accent); color: var(--dm-ink); background: var(--dm-accent-soft); }
  .dm-engines .sqlite svg { fill: #0f80cc; } .dm-engines .postgresql svg { fill: #4169e1; }
  .dm-status { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; color: var(--dm-mut); line-height: 1.35; }
  .dm-status i { width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; background: var(--dm-faint); flex: none; }
  .dm-status.ready i { background: var(--dm-ok); }
  .dm-status.loading i { background: #f59e0b; animation: dmpulse 1s ease-in-out infinite; }
  .dm-status.error i { background: var(--dm-danger); }
  @keyframes dmpulse { 50% { opacity: .3; } }
  .dm-note-mysql { border: 1px solid color-mix(in srgb, #f59e0b 45%, var(--dm-line)); background: color-mix(in srgb, #f59e0b 9%, var(--dm-panel));
    border-radius: 9px; padding: 8px 10px; font-size: 12px; line-height: 1.45; display: grid; gap: 7px; }
  .dm-note-mysql[hidden] { display: none; }
  .dm-note-mysql div { display: flex; gap: 6px; }
  .dm-q { flex: none; height: 178px; margin: 0 12px; border: 1px solid var(--dm-line); border-radius: 10px; overflow: hidden; }
  .dm-q textarea { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; resize: none; padding: 10px 12px; outline: none;
    background: var(--dm-bg); color: var(--dm-ink); font: 12px/1.55 var(--dm-mono); }
  .dm-run-actions { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
  .dm-run-actions .hint { font-size: 11.5px; color: var(--dm-mut); line-height: 1.35; }
  .dm-result { flex: 1; min-height: 90px; overflow: auto; margin: 0 12px 12px; border: 1px solid var(--dm-line); border-radius: 10px; background: var(--dm-panel); }
  .dm-result .meta { position: sticky; left: 0; padding: 7px 10px; font-size: 11.5px; color: var(--dm-mut); border-bottom: 1px solid var(--dm-line); }
  .dm-result .meta b { color: var(--dm-ink); }
  .dm-result table { border-collapse: collapse; font: 11.5px/1.3 var(--dm-mono); min-width: 100%; }
  .dm-result th { position: sticky; top: 0; background: var(--dm-head); text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--dm-line); font-weight: 600; white-space: nowrap; }
  .dm-result td { padding: 5px 10px; border-bottom: 1px solid var(--dm-row-line); white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
  .dm-result td.num { text-align: right; } .dm-result td.null { color: var(--dm-faint); font-style: italic; }
  .dm-result .idle { padding: 14px; color: var(--dm-mut); font-size: 12.5px; line-height: 1.5; }
  .dm-result .bar { display: block; height: 3px; margin-bottom: 10px; border-radius: 2px; background: linear-gradient(90deg, transparent, var(--dm-accent), transparent)
    no-repeat; background-size: 40% 100%; animation: dmbar 1.1s linear infinite; }
  @keyframes dmbar { from { background-position: -60% 0; } to { background-position: 160% 0; } }
  @media (prefers-reduced-motion: reduce) { .dm-result .bar, .dm-status.loading i { animation: none; } }
  /* the zoom controls take the studio's palette */
  #dm-board .grafloria-controls { background: var(--dm-line) !important; box-shadow: 0 1px 3px rgba(20, 30, 60, .12); border-radius: 7px !important; }
  #dm-board .grafloria-controls button { background: var(--dm-panel) !important; color: var(--dm-ink) !important; }
  #dm-board .grafloria-controls button:hover { background: var(--dm-accent-soft) !important; color: var(--dm-accent-deep) !important; }
  .dm-result .err { padding: 12px 14px; color: #b91c1c; font: 12px/1.5 system-ui, sans-serif; }
  .dm-result .err b { display: block; margin-bottom: 4px; }
  .dm-result .err code { font: 12px/1.5 var(--dm-mono); white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) { .dm-result .err { color: #fca5a5; } }

  /* ---- Import dialog ------------------------------------------------------------ */
  .dm-modal { position: fixed; inset: 0; z-index: 2147482900; background: rgba(15, 20, 35, .4); display: grid; place-items: center; }
  .dm-modal[hidden] { display: none; }
  .dm-dialog { width: min(720px, 94vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--dm-panel); color: var(--dm-ink);
    border-radius: 14px; box-shadow: 0 24px 60px rgba(10, 15, 30, .35); overflow: hidden; font: 13px/1.45 system-ui, sans-serif; }
  .dm-dialog header { all: unset; display: block; padding: 14px 18px 4px; }
  .dm-dialog h2 { margin: 0 0 3px; font-size: 16px; }
  .dm-dialog p { margin: 0; color: var(--dm-mut); font-size: 12.5px; }
  .dm-dialog .box { height: 300px; margin: 10px 18px 6px; border: 1px solid var(--dm-line); border-radius: 10px; overflow: hidden; }
  .dm-dialog .box textarea { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; resize: none; padding: 10px 12px; outline: none;
    background: var(--dm-bg); color: var(--dm-ink); font: 12px/1.55 var(--dm-mono); }
  .dm-dialog .opts { display: flex; gap: 16px; padding: 4px 18px; font-size: 12.5px; }
  .dm-dialog .msg { padding: 2px 18px; font-size: 12px; min-height: 18px; color: var(--dm-mut); }
  .dm-dialog .msg.bad { color: var(--dm-danger); }
  .dm-dialog footer { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 18px 16px; }
`;
