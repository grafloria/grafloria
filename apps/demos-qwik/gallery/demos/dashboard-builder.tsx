import { component$, $, noSerialize, useSignal, useStyles$, useOnWindow, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaDiagram, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';
import { DashboardBuilder, PALETTE, VIEWS, type BuilderUi } from './dashboard-builder-board';

// The palette chips: label, glyph and glyph colour per widget kind.
const CHIPS: Array<{ kind: keyof typeof PALETTE; label: string; glyph: string; color: string }> = [
  { kind: 'kpi', label: 'KPI stat', glyph: '#', color: '#3b52d9' },
  { kind: 'line', label: 'Line / area', glyph: '∿', color: '#0ea5e9' },
  { kind: 'bar', label: 'Bar chart', glyph: '▊', color: '#14b8a6' },
  { kind: 'donut', label: 'Donut', glyph: '◕', color: '#f59e0b' },
  { kind: 'funnel', label: 'Funnel', glyph: '▽', color: '#8b5cf6' },
  { kind: 'table', label: 'Table', glyph: '▤', color: '#64748b' },
];

// App chrome only — the widget cards are the kit's. Same rules as the JS page.
const CSS = `
  .db-page { height: 100vh; display: flex; flex-direction: column; }
  .db-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 20px;
    border-bottom: 1px solid rgba(127,127,127,.22); background: var(--db-bar-bg, #fbfbfd); }
  .db-tabs { display: flex; gap: 4px; margin-right: auto; }
  .db-tab { border: 1px solid transparent; background: none; cursor: pointer;
    font: 600 13px/1.2 system-ui, sans-serif; color: #5b6270; padding: 7px 14px; border-radius: 8px; }
  .db-tab:hover { background: rgba(127,127,127,.09); color: #2d2e3a; }
  .db-tab[aria-selected="true"] { background: #eef2ff; color: #3b52d9; border-color: #d6def9; }
  .db-tool { border: 1px solid #d8dce6; background: #fff; cursor: pointer;
    font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; padding: 7px 10px; border-radius: 7px; }
  .db-tool:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .db-tool:disabled { opacity: .42; cursor: default; }
  .db-sep { width: 1px; height: 22px; background: rgba(127,127,127,.24); margin: 0 4px; }
  .db-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 172px 1fr auto; }
  .db-palette { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 16px; overflow-y: auto; background: var(--db-pal-bg, #fafbfd); }
  .pal-title { font: 700 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #8a91a2; margin: 2px 2px 9px; }
  .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 8px 9px;
    border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
    font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
  .pal-item:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .pal-glyph { width: 26px; height: 26px; border-radius: 7px; flex: none; display: flex; align-items: center;
    justify-content: center; font-size: 15px; color: #fff; }
  .pal-note { margin: 12px 2px 0; font: 11px/1.5 system-ui, sans-serif; color: #949bab; }
  .pal-layout { display: flex; gap: 8px; }
  .pal-item.pal-half { width: auto; flex: 1; justify-content: center; }
  .pal-item[aria-pressed="true"] { background: rgba(59, 82, 217, .12); border-color: #3b52d9; color: #2c3fb0; }
  .db-canvas { --axdb-rs-radius: 3px; position: relative; overflow: hidden; height: 100%;
    background-color: var(--db-canvas-bg, #f1f3f7);
    background-image: radial-gradient(circle, rgba(120,128,145,.16) 1px, transparent 1px); background-size: 26px 26px; }
  .db-status { position: absolute; left: 14px; bottom: 12px; z-index: 6; max-width: 72%; padding: 6px 11px; border-radius: 8px;
    background: rgba(20,24,33,.86); color: #eef1f7; font: 500 11.5px/1.35 ui-monospace, SFMono-Regular, monospace;
    pointer-events: none; box-shadow: 0 3px 10px rgba(15,23,42,.2); opacity: 0; transition: opacity .18s; }
  .db-status.show { opacity: 1; }
  .db-history { display: flex; flex-direction: column; width: 272px; overflow: hidden;
    border-left: 1px solid rgba(127,127,127,.2); background: var(--db-pal-bg, #fafbfd); }
  .hist-head { display: flex; align-items: center; gap: 6px; padding: 12px 12px 8px; }
  .hist-title { font: 700 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #8a91a2; }
  .hist-count { font: 500 10.5px/1.4 ui-monospace, SFMono-Regular, monospace; color: #a9b0be; margin-right: auto; }
  .hist-btn { border: 1px solid #d8dce6; background: #fff; cursor: pointer; color: #5b6270;
    font: 500 11px/1.2 system-ui, sans-serif; padding: 4px 7px; border-radius: 6px; }
  .hist-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 2px; }
  .hist-item { display: block; width: 100%; margin: 0 0 8px; padding: 7px; text-align: left;
    border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
  .hist-item:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .hist-item.current { border-color: #3b52d9; background: #eef2ff; }
  .hist-thumb { display: block; width: 100%; height: auto; border: 1px solid #edeff4; border-radius: 5px; background: var(--db-canvas-bg, #f1f3f7); }
  .hist-thumb-none { display: flex; align-items: center; justify-content: center; height: 74px;
    font: 500 10.5px/1.2 system-ui, sans-serif; color: #b3b9c6; }
  .hist-row { display: flex; align-items: baseline; gap: 6px; margin: 7px 1px 0; }
  .hist-id { font: 700 11.5px/1.2 ui-monospace, SFMono-Regular, monospace; color: #2d2e3a; }
  .hist-when { font: 500 11px/1.2 system-ui, sans-serif; color: #8a91a2; margin-right: auto; }
  .hist-tag { font: 600 9.5px/1.6 system-ui, sans-serif; letter-spacing: .3px; text-transform: uppercase;
    padding: 1px 5px; border-radius: 4px; background: #eef0f5; color: #7c8494; }
  .hist-tag.now { background: #3b52d9; color: #fff; }
  .hist-sub { margin: 3px 1px 0; font: 500 11px/1.35 system-ui, sans-serif; color: #5b6270; }
  .hist-delta { margin: 1px 1px 0; font: 11px/1.35 system-ui, sans-serif; color: #949bab; }
  .hist-empty { padding: 8px 2px; font: 11.5px/1.55 system-ui, sans-serif; color: #949bab; }
  .hist-note { padding: 9px 12px 12px; border-top: 1px solid rgba(127,127,127,.14); font: 11px/1.5 system-ui, sans-serif; color: #949bab; }
  /* App chrome on top of the kit's widget cards: clickable tiles, the FOCUSED
     one ringed (the toolbar's target), PINNED ones marked. */
  .db-canvas .axdb-widget { cursor: pointer; transition: box-shadow .14s, border-color .14s; }
  .db-canvas .axdb-widget:hover { border-color: #c4ccdb; }
  .db-canvas .axdb-widget.focused { border-color: #3b52d9; box-shadow: 0 0 0 2px rgba(59,82,217,.28), 0 3px 12px rgba(59,82,217,.14); }
  .db-canvas .axdb-widget .pin { margin-left: auto; font-size: 12px; opacity: 0; }
  .db-canvas .axdb-widget.locked .pin { opacity: 1; color: #d0912a; }
  .db-canvas .grafloria-html-layer.glide > .grafloria-node-host {
    transition: left .28s cubic-bezier(.2, 0, .2, 1), top .28s cubic-bezier(.2, 0, .2, 1),
                width .28s cubic-bezier(.2, 0, .2, 1), height .28s cubic-bezier(.2, 0, .2, 1); }
  @media (prefers-color-scheme: dark) {
    .db-bar { --db-bar-bg: #171a21; } .db-palette, .db-history { --db-pal-bg: #14161c; }
    .db-canvas { --db-canvas-bg: #0f1116; background-image: radial-gradient(circle, rgba(150,160,180,.14) 1px, transparent 1px); }
    .db-tab { color: #9aa2b2; } .db-tab:hover { color: #e6e9f0; }
    .db-tab[aria-selected="true"] { background: #23294a; color: #b7c2ff; border-color: #33407a; }
    .db-tool, .pal-item, .hist-btn, .hist-item { background: #1c1f27; border-color: #333a49; color: #cbd2df; }
    .db-tool:hover, .pal-item:hover, .hist-item:hover { background: #232734; }
    .hist-item.current { background: #23294a; border-color: #33407a; }
    .hist-id { color: #e6e9f0; } .hist-sub { color: #aab2c2; }
  }
`;

/** A dashboard-builder app on the kit's DATA-FIRST API: three tabbed views
 *  declared as plain data, every chart drawn by the kit's built-in renderers.
 *  One 12-column pack grid per view — drag a tile and neighbours slide out of
 *  the way, resize from the corner, pinned tiles refuse the mover; palette
 *  drag-in and drag-out-to-remove; fit/grow, float, grid/split; Save / Load
 *  and a version drawer with real vector thumbnails — every gesture ONE
 *  undoable step. The `dashboard()` spec is hosted by GrafloriaDiagram, which
 *  hands back the live instance the toolbar's Undo/Redo and the thumbnails need. */
export default component$(() => {
  useStyles$(CSS);
  // The board controller and its spec are not data: noSerialize.
  const board = useSignal<NoSerialize<DashboardBuilder>>(() => noSerialize(new DashboardBuilder()));
  // The FIRST spec mounts the canvas; after that the board owns it (Load
  // rebuilds its spec and reconciles the live instance itself), so the host is
  // never handed a replacement — GrafloriaDiagram would remount on one.
  const mount = useSignal(() => noSerialize({ spec: board.value!.spec, options: board.value!.renderOptions }));
  const canvas = useSignal<HTMLElement>();
  const ui = useSignal<BuilderUi>(() => board.value!.snapshot());

  // Esc closes the version drawer (only when it is open, so the binder's own
  // mid-gesture Esc is untouched).
  useOnWindow('keydown', $((e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape' && board.value?.isHistoryOpen) board.value.toggleHistory(false);
  }));

  const u = ui.value;
  const split = u.layout === 'split';
  return (
    <div class="db-page">
      <div class="db-bar">
        <div class="db-tabs" role="tablist" aria-label="Dashboard views">
          {VIEWS.map((v) => (
            <button key={v.id} class="db-tab" role="tab" data-tab={v.id} aria-selected={(u.view === v.id) ? 'true' : 'false'}
              onClick$={() => board.value?.showView(v.id)}>{v.name}</button>
          ))}
        </div>
        <button class="db-tool" id="t-undo" title="Undo (⌘Z)" disabled={!u.canUndo} onClick$={() => board.value?.undo()}>↶ Undo</button>
        <button class="db-tool" id="t-redo" title="Redo (⌘⇧Z)" disabled={!u.canRedo} onClick$={() => board.value?.redo()}>↷ Redo</button>
        <span class="db-sep" />
        <button class="db-tool" id="t-pin" title="Pin / unpin the focused tile" disabled={!u.hasFocus} onClick$={() => board.value?.togglePin()}>{u.focusPinned ? '📌 Unpin' : '📌 Pin'}</button>
        <button class="db-tool" id="t-front" title="Bring focused tile to front" disabled={!u.hasFocus} onClick$={() => board.value?.bringToFront()}>⤒ Front</button>
        <button class="db-tool" id="t-back" title="Send focused tile to back" disabled={!u.hasFocus} onClick$={() => board.value?.sendToBack()}>⤓ Back</button>
        <button class="db-tool" id="t-grow" title="Cycle the focused tile's row span (live push)" disabled={!u.hasFocus} onClick$={() => board.value?.cycleRows()}>⇕ Resize</button>
        <button class="db-tool" id="t-remove" title="Remove the focused tile" disabled={!u.hasFocus} onClick$={() => board.value?.removeFocused()}>🗑 Remove</button>
        <span class="db-sep" />
        <button class="db-tool" id="t-mode" disabled={split} title="Sizing mode: fit keeps the board height and squeezes rows; grow keeps row height and extends the board"
          onClick$={() => board.value?.toggleSizing()}>Mode: {u.sizing}</button>
        <button class="db-tool" id="t-float" disabled={split} title="Float: on lets widgets sit anywhere with gaps (no gravity); off packs upward"
          onClick$={() => board.value?.toggleFloat()}>Float: {u.float ? 'on' : 'off'}</button>
        <span class="db-sep" />
        <button class="db-tool" id="t-save" title="Serialize the dashboard" onClick$={() => board.value?.save()}>💾 Save</button>
        <button class="db-tool" id="t-load" title="Rebuild from the last save" onClick$={() => board.value?.load()}>⟲ Load</button>
        <button class="db-tool" id="t-history" aria-expanded={(u.historyOpen) ? 'true' : 'false'} title="Version history — every Save is a version you can go back to"
          onClick$={() => board.value?.toggleHistory()}>🕘 Versions</button>
      </div>
      <div class="db-body">
        <aside class="db-palette">
          <div class="pal-title">Add widget</div>
          {CHIPS.map((c) => (
            <button key={c.kind} class="pal-item" data-add={c.kind}
              onPointerDown$={(e, el) => board.value?.beginPaletteDrag(c.kind, e, el)}
              onClick$={() => { board.value?.addWidget(c.kind); }}>
              <span class="pal-glyph" style={{ background: c.color }}>{c.glyph}</span>{c.label}
            </button>
          ))}
          <div class="pal-title" style={{ marginTop: '14px' }}>Layout</div>
          <div class="pal-layout">
            <button class="pal-item pal-half" id="t-layout-grid" aria-pressed={(!split) ? 'true' : 'false'} title="The cell grid: columns, spans, push"
              onClick$={() => board.value?.setLayout('grid')}>Grid</button>
            <button class="pal-item pal-half" id="t-layout-split" aria-pressed={(split) ? 'true' : 'false'} title="The splitter tree: the board is always covered, dividers are percentages"
              onClick$={() => board.value?.setLayout('split')}>Split</button>
          </div>
          <div class="pal-note">Click to add, or DRAG onto the board — it makes room live from the moment the cursor enters.
            On the board: drag tiles (neighbours slide out of the way around the dashed placeholder), resize from a tile's
            corner, drag OUT to remove. Click a tile to focus it, then use the toolbar.</div>
        </aside>
        <div class="db-canvas" ref={canvas}>
          <GrafloriaDiagram spec={mount.value!.spec} options={mount.value!.options}
            onReady$={$((api: DiagramInstance) => {
              board.value?.attach(api, canvas.value!, (s) => { ui.value = s; });
              markReady();
            })} />
          <div class={['db-status', u.status ? 'show' : ''].join(' ')}>{u.status}</div>
        </div>
        {u.historyOpen && (
          <aside class="db-history" aria-label="Version history">
            <div class="hist-head">
              <span class="hist-title">Versions</span>
              <span class="hist-count">{u.historyCount}</span>
              <button class="hist-btn" title="Forget every saved version" onClick$={() => board.value?.clearHistory()}>Clear</button>
              <button class="hist-btn" title="Close (Esc)" onClick$={() => board.value?.toggleHistory(false)}>✕</button>
            </div>
            <div class="hist-list">
              {u.versions.length === 0 ? (
                <div class="hist-empty">No versions yet. Press 💾 Save and this fills with real, vector thumbnails of the board — one per save.</div>
              ) : u.versions.map((v) => (
                <button key={v.id} class={['hist-item', v.current ? 'current' : ''].join(' ')} data-version={v.id} title={v.title}
                  onClick$={() => board.value?.restoreVersion(v.id)}>
                  {v.thumb ? <img class="hist-thumb" src={v.thumb} alt={v.alt} width={248} height={140} /> : <div class="hist-thumb hist-thumb-none">no preview</div>}
                  <div class="hist-row">
                    <span class="hist-id">{v.id}</span>
                    <span class="hist-when">{v.when}</span>
                    {v.auto && <span class="hist-tag" title="banked automatically before a restore">auto</span>}
                    {v.current && <span class="hist-tag now">current</span>}
                  </div>
                  <div class="hist-sub">{v.sub}</div>
                  <div class="hist-delta">{v.delta}</div>
                </button>
              ))}
            </div>
            <div class="hist-note">Every 💾 Save banks a version, thumbnail and all. Click one to restore it — the board you were
              on is banked first, so a restore is never a one-way door.</div>
          </aside>
        )}
      </div>
    </div>
  );
});
