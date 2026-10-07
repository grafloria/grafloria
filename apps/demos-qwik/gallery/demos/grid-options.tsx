import { component$, $, noSerialize, useSignal, useStyles$, useOnWindow, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaDiagram, type DiagramInstance } from '@grafloria/qwik';
import { dashboard, type DashboardOptions, type DashboardViewSpec, type DashboardWidgetSpec } from '@grafloria/element';
import { markReady } from '../ready';

/** THE OPTIONS PAGE. dashboard-builder is deliberately plain — one flat
 *  12-column grid. This page is where the ADVANCED grid constructs live, each a
 *  labelled tab so a reader can see which option produces which behaviour:
 *  gravity packing, float mode, right-to-left boards, responsive columns and
 *  pinned widgets — all through the same [options] the kit exposes. */
const tile = (id: string, label: string, span: number, rows = 1, pinned = false): DashboardWidgetSpec =>
  ({ id, kind: 'tile', span, rows, pinned, title: label, data: { label } });
/** A tile carrying the JS page's note line (and tone), at explicit cells when given. */
const noted = (id: string, label: string, note: string, cell: { x?: number; y?: number; w: number; h: number },
  opts: { pinned?: boolean; tone?: 'fixed' | 'strip' } = {}): DashboardWidgetSpec =>
  ({ id, kind: 'tile', span: cell.w, rows: cell.h, ...(cell.x !== undefined ? { x: cell.x, y: cell.y } : {}),
     pinned: opts.pinned ?? false, title: label, data: { label, note, tone: opts.tone } });

const VIEWS: DashboardViewSpec[] = [
  { id: 'pack', name: 'Gravity pack', widgets: [
    tile('p1', 'A · span 6', 6, 2), tile('p2', 'B · span 3', 3),
    tile('p3', 'C · span 3', 3), tile('p4', 'D · span 4', 4),
    tile('p5', 'E · span 8', 8), tile('p6', 'F · span 12', 12),
  ]},
  { id: 'wide', name: 'Wide cells', columns: 6, widgets: [
    tile('w1', 'half', 3, 2), tile('w2', 'half', 3),
    tile('w3', 'third', 2), tile('w4', 'two-thirds', 4),
    tile('w5', 'full', 6),
  ]},
  { id: 'pinned', name: 'Pinned', widgets: [
    tile('k1', 'PINNED — survives reflow', 4, 2, true),
    tile('k2', 'flows', 4), tile('k3', 'flows', 4),
    tile('k4', 'flows', 6), tile('k5', 'flows', 6),
  ]},
  { id: 'dense', name: 'Dense mix', widgets: [
    tile('d1', 'lead', 8, 2), tile('d2', 'side', 4),
    tile('d3', 'side', 4), tile('d4', 'q', 3), tile('d5', 'q', 3),
    tile('d6', 'q', 3), tile('d7', 'q', 3),
  ]},
  // The JS page's boards ① + ② + ④, as data: two SECTIONS side by side are two
  // grids on one board — drag a tile from A into B and B adopts it live, the
  // crossing ONE undo. B holds one tile at EXPLICIT cells; the rest auto-flow.
  // (Span 5 each: the responsive rule gives this canvas ~11 columns, and two
  // span-6 sections would wrap one under the other.)
  { id: 'boards', name: 'Two boards', widgets: [
    { id: 'sec-a', title: 'Board A', span: 5, rows: 2, columns: 6, caption: { subtitle: 'drag a tile into board B — the crossing is ONE undo' }, widgets: [
      noted('a1', 'A · one', 'drag me into board B', { x: 0, y: 0, w: 3, h: 1 }),
      noted('a2', 'A · two', 'an ordinary tile', { x: 3, y: 0, w: 3, h: 1 }),
      noted('a3', 'A · pinned', 'locked — never pushed, drags onto it refused', { x: 0, y: 1, w: 3, h: 1 }, { pinned: true }),
      noted('a4', 'A · three', 'an ordinary tile', { x: 3, y: 1, w: 3, h: 1 }),
    ] },
    { id: 'sec-b', title: 'Board B', span: 5, rows: 2, columns: 6, caption: { subtitle: 'the green tile holds fixed cells; the rest auto-flow' }, widgets: [
      noted('b0', 'B · fixed cells', 'x 2–3 · y 0–1', { x: 2, y: 0, w: 2, h: 2 }, { tone: 'fixed' }),
      noted('b1', 'B · one', 'no cells — auto-placed', { w: 2, h: 1 }),
      noted('b2', 'B · two', 'no cells — auto-placed', { w: 2, h: 1 }),
      noted('b3', 'B · three', 'no cells — auto-placed', { w: 2, h: 1 }),
    ] },
  ]},
  // Board ③: a BOUNDED section (maxRows: 1) nested in a normal 12-column board.
  // Pull a strip tile's corner down and the section grows a row for THAT tile.
  { id: 'section', name: 'Bounded section', widgets: [
    { id: 'strip', title: 'Bounded strip', span: 12, rows: 1, columns: 4, maxRows: 1, widgets:
      ['A', 'B', 'C', 'D'].map((n, i) => noted(`s${n}`, `Strip ${n}`, i === 0 ? 'pull my corner down' : 'maxRows: 1', { x: i, y: 0, w: 1, h: 1 }, { tone: 'strip' })) },
    noted('c1', 'Trend panel', 'an ordinary member of board C', { x: 0, y: 1, w: 8, h: 2 }),
    noted('c2', 'Share panel', 'an ordinary member of board C', { x: 8, y: 1, w: 4, h: 2 }),
    noted('c3', 'Detail table', 'an ordinary member of board C', { x: 0, y: 3, w: 12, h: 1 }),
  ]},
];

// The board's callbacks are plain functions the kit calls; a module-level
// function cannot reach the component's signals, so each one re-dispatches as
// a window event the component listens to (useOnWindow).
const emit = (type: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(type, { detail }));
const esc = (v: unknown) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const OPTIONS: Partial<DashboardOptions> = {
  columns: 12,
  gap: 8,
  sizing: 'grow',
  rowHeight: 96,
  float: false,
  responsive: { columnWidth: 96 },
  // The JS page's plain labelled tile: a title, an optional note, a pin marker.
  renderWidget: (w, host) => {
    const d = (w.data ?? {}) as { label?: string; note?: string; tone?: string };
    host.innerHTML =
      `<div class="gt${d.tone ? ` gt-${d.tone}` : ''}${w.pinned ? ' locked' : ''}">` +
      `<div class="gt-h">${esc(d.label ?? w.title ?? 'Tile')}<span class="pin" title="Pinned">📌</span></div>` +
      (d.note ? `<div class="gt-n">${esc(d.note)}</div>` : '') + '</div>';
  },
  onSelect: () => emit('gochanged'),
  onLayoutChange: () => emit('gochanged'),
  // Option ⑥: drag a tile OUT and release over the palette to remove it — the
  // kit asks (onRemoveRequest) rather than deletes, with the survivors' re-pack.
  binder: {
    dragOut: 'remove',
    removeZone: (screen: { x: number; y: number }) => {
      const side = document.querySelector('.go-side');
      return !!side && screen.x <= side.getBoundingClientRect().right + 8;
    },
    onRemoveRequest: (nodeId: string, displaced: unknown[]) => { emit('goremove', { nodeId, displaced }); },
  } as DashboardOptions['binder'],
};

/** dashboard() → the spec GrafloriaDiagram renders. A fresh copy of the views
 *  each time, so "Reset boards" really re-seeds them. */
function buildBoard() {
  return dashboard({ ...OPTIONS, views: JSON.parse(JSON.stringify(VIEWS)) as DashboardViewSpec[] });
}
type Board = ReturnType<typeof buildBoard>;

const PALETTE = {
  tile: { label: 'Tile (2×1)', span: 2 },
  wide: { label: 'Wide tile (4×1)', span: 4 },
} as const;

const CSS = `
  .go-page { height: 100vh; display: flex; flex-direction: column; }
  .go-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 20px;
    border-bottom: 1px solid rgba(127,127,127,.22); background: #fbfbfd; }
  .go-tabs { display: flex; gap: 4px; margin-right: auto; }
  .go-tab { border: 1px solid transparent; background: none; cursor: pointer;
    font: 600 13px/1.2 system-ui, sans-serif; color: #5b6270; padding: 7px 14px; border-radius: 8px; }
  .go-tab:hover { background: rgba(127,127,127,.09); color: #2d2e3a; }
  .go-tab[aria-selected="true"] { background: #eef2ff; color: #3b52d9; border-color: #d6def9; }
  .go-tool { border: 1px solid #d8dce6; background: #fff; cursor: pointer;
    font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; padding: 7px 10px; border-radius: 7px; }
  .go-tool:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .go-tool:disabled { opacity: .42; cursor: default; }
  .go-sep { width: 1px; height: 22px; background: rgba(127,127,127,.24); margin: 0 4px; }
  .go-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 214px 1fr; }
  .go-side { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 20px; overflow-y: auto; background: #fafbfd; }
  .go-title { font: 700 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #8a91a2; margin: 2px 2px 9px; }
  .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 8px 9px;
    border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
    font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
  .pal-item:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .pal-glyph { width: 24px; height: 24px; border-radius: 7px; flex: none; display: flex; align-items: center;
    justify-content: center; font-size: 13px; color: #fff; background: #3b52d9; }
  .go-note { margin: 10px 2px 16px; font: 11px/1.5 system-ui, sans-serif; color: #949bab; }
  .go-canvas { position: relative; overflow: hidden; height: 100%; background-color: #f1f3f7;
    background-image: radial-gradient(circle, rgba(120,128,145,.16) 1px, transparent 1px); background-size: 26px 26px; }
  .go-status { position: absolute; left: 14px; bottom: 12px; z-index: 6; max-width: 74%;
    padding: 6px 11px; border-radius: 8px; background: rgba(20,24,33,.86); color: #eef1f7;
    font: 500 11.5px/1.35 ui-monospace, SFMono-Regular, monospace; pointer-events: none;
    box-shadow: 0 3px 10px rgba(15,23,42,.2); opacity: 0; transition: opacity .18s; }
  .go-status.show { opacity: 1; }
  .gt { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column;
    background: #fff; border: 1px solid #e7eaf1; border-radius: 3px; padding: 11px 13px; overflow: hidden;
    font-family: system-ui, sans-serif; cursor: pointer; box-shadow: 0 1px 2px rgba(16,24,40,.05); }
  .gt:hover { border-color: #c4ccdb; }
  .gt-h { display: flex; align-items: center; gap: 6px; font: 650 14px/1.25 system-ui, sans-serif; color: #1f2430; }
  .gt-h .pin { margin-left: auto; font-size: 13px; opacity: 0; }
  .gt.locked { border-color: #e2b467; background: #fffaf0; }
  .gt.locked .gt-h .pin { opacity: 1; }
  .gt-n { margin-top: 5px; font: 11.5px/1.4 system-ui, sans-serif; color: #7a8496; }
  .gt-strip { background: #eef2ff; border-color: #d6def9; }
  .gt-fixed { background: #eefaf4; border-color: #bfe6d4; }
  @media (prefers-color-scheme: dark) {
    .gt { background: #1a1d25; border-color: #2b3040; } .gt-h { color: #eceef4; } .gt-n { color: #98a1b4; }
    .gt.locked { background: #2a2418; } .gt-strip { background: #1e2440; } .gt-fixed { background: #16261f; }
    .go-bar { background: #171a21; } .go-side { background: #14161c; }
    .go-canvas { background-color: #0f1116; background-image: radial-gradient(circle, rgba(150,160,180,.14) 1px, transparent 1px); }
    .go-tab { color: #9aa2b2; } .go-tab:hover { color: #e6e9f0; }
    .go-tab[aria-selected="true"] { background: #23294a; color: #b7c2ff; border-color: #33407a; }
    .go-tool, .pal-item { background: #1c1f27; border-color: #333a49; color: #cbd2df; }
    .go-tool:hover, .pal-item:hover { background: #232734; }
  }
`;

export default component$(() => {
  useStyles$(CSS);
  // The dashboard() spec and the live instance are not data: noSerialize.
  const board = useSignal<NoSerialize<Board>>(() => noSerialize(buildBoard()));
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const mount = useSignal(0);
  const tab = useSignal('pack');
  const canUndo = useSignal(false);
  const canRedo = useSignal(false);
  const selected = useSignal<string | undefined>(undefined);
  const pinned = useSignal(false);
  const float = useSignal(false);
  const sizing = useSignal<'fit' | 'grow'>('grow');
  const rtl = useSignal(false);
  const columns = useSignal(12);
  const status = useSignal('');
  const seq = useSignal(0);

  /** Read the live board back into the toolbar. */
  const sync = $(() => {
    const H = board.value?.handle;
    const cm = instance.value?.getEngine().commandManager;
    if (!H) return;
    canUndo.value = !!cm?.canUndo();
    canRedo.value = !!cm?.canRedo();
    const sel = H.getSelectedWidget();
    selected.value = sel && H.widget(sel) ? sel : undefined;
    pinned.value = selected.value ? H.widget(selected.value)?.pinned === true : false;
    float.value = H.getFloat();
    sizing.value = H.getSizing();
    rtl.value = H.getRtl();
    columns.value = H.getColumns(tab.value);
  });
  // A monotonic seq makes every action CHANGE the status line.
  const flash = $((msg: string) => { seq.value++; status.value = `${seq.value} · ${msg}`; });

  useOnWindow('gochanged', $(() => sync()));
  // A drag released over the palette: ONE undoable remove, survivors re-packed.
  useOnWindow('goremove', $(async (e: Event) => {
    const { nodeId, displaced } = (e as CustomEvent<{ nodeId: string; displaced?: never }>).detail;
    board.value?.handle.widget(nodeId)?.remove(displaced);
    await sync();
    await flash('removed by dragging out over the palette — one undo puts it back');
  }));

  const sel = selected.value;
  return (
    <div class="go-page">
      <div class="go-bar">
        <div class="go-tabs" role="tablist" aria-label="Grid options">
          {VIEWS.map((v) => (
            <button key={v.id} class="go-tab" role="tab" data-tab={v.id} aria-selected={(tab.value === v.id) ? 'true' : 'false'}
              onClick$={() => {
                tab.value = v.id;
                board.value?.handle.showView(v.id);
                return Promise.all([sync(), flash(`view: ${v.name}`)]);
              }}>{v.name}</button>
          ))}
        </div>
        <button class="go-tool" id="o-undo" disabled={!canUndo.value} title="Undo (one step per gesture)" onClick$={async () => {
          const cm = instance.value?.getEngine().commandManager;
          if (cm?.canUndo()) { await cm.undo(); board.value?.handle.refresh(); }
          await sync(); await flash('undo');
        }}>↶ Undo</button>
        <button class="go-tool" id="o-redo" disabled={!canRedo.value} title="Redo" onClick$={async () => {
          const cm = instance.value?.getEngine().commandManager;
          if (cm?.canRedo()) { await cm.redo(); board.value?.handle.refresh(); }
          await sync(); await flash('redo');
        }}>↷ Redo</button>
        <span class="go-sep" />
        <button class="go-tool" id="o-pin" disabled={!sel} title="Pin / unpin the selected tile" onClick$={async () => {
          const w = selected.value ? board.value?.handle.widget(selected.value) : undefined;
          if (!w) return;
          w.pin();
          await sync();
          await flash(w.pinned ? 'pinned (keeps its cells; drags onto it refused)' : 'unpinned');
        }}>{pinned.value ? '📌 Unpin' : '📌 Pin'}</button>
        <button class="go-tool" id="o-remove" disabled={!sel} title="Remove the selected tile" onClick$={async () => {
          const w = selected.value ? board.value?.handle.widget(selected.value) : undefined;
          if (!w) return;
          w.remove();
          board.value?.handle.selectWidget(undefined);
          await sync(); await flash('removed widget (survivors re-packed)');
        }}>🗑 Remove</button>
        <span class="go-sep" />
        <button class="go-tool" id="o-float" title="Float OFF packs tiles upward; ON lets them sit anywhere, gaps legal" onClick$={async () => {
          board.value?.handle.setFloat(!float.value);
          await sync();
          await flash(float.value ? 'Float ON: tiles stay wherever you put them — gaps are legal' : 'Float OFF: gravity packs tiles upward');
        }}>Float: {float.value ? 'on' : 'off'}</button>
        <button class="go-tool" id="o-mode" title="fit holds the board's height and squeezes rows; grow keeps the row height and extends the board" onClick$={async () => {
          const H = board.value?.handle;
          if (!H) return;
          const next = sizing.value === 'fit' ? 'grow' : 'fit';
          H.setSizing(next);
          if (next === 'fit') H.fit();
          await sync();
          await flash(next === 'fit' ? 'FIT: the board keeps its height — rows squeeze' : 'GROW: rows keep their height — the board extends');
        }}>Mode: {sizing.value}</button>
        <button class="go-tool" id="o-rtl" title="RTL: column 0 renders at the RIGHT edge — only the pixels mirror" onClick$={async () => {
          board.value?.handle.setRtl(!rtl.value);
          await sync();
          await flash(rtl.value ? 'RTL on: the same cells, mirrored' : 'RTL off');
        }}>RTL: {rtl.value ? 'on' : 'off'}</button>
        <button class="go-tool" id="o-cols" title="Set this view's column count — the layout cache restores the wide layout when you come back" onClick$={async () => {
          const H = board.value?.handle;
          if (!H) return;
          const ladder = [12, 6, 3];
          const next = ladder[(ladder.indexOf(columns.value) + 1) % ladder.length] ?? 12;
          H.setColumns(next, undefined, tab.value);
          await sync();
          await flash(`${columns.value} columns on this view — widening back restores the cached layout`);
        }}>Columns: {columns.value}</button>
        <span class="go-sep" />
        <button class="go-tool" id="o-reset" title="Re-seed every board" onClick$={async () => {
          board.value = noSerialize(buildBoard());
          mount.value++;
          tab.value = 'pack';
          await flash('boards re-seeded');
        }}>⟲ Reset boards</button>
      </div>
      <div class="go-body">
        <aside class="go-side">
          <div class="go-title">Palette</div>
          {(Object.keys(PALETTE) as Array<keyof typeof PALETTE>).map((kind) => (
            <button key={kind} class="pal-item" data-add={kind} onClick$={async () => {
              const H = board.value?.handle;
              if (!H) return;
              const p = PALETTE[kind];
              const id = `${kind}-${seq.value + 1}`;
              const w = H.addWidget({ id, kind: 'tile', span: p.span, rows: 1, title: p.label, data: { label: p.label } }, tab.value);
              if (w) H.selectWidget(w.id);
              await sync();
              await flash(w ? `added ${p.label} → ${tab.value} (auto-positioned)` : 'refused: no room on this board');
            }}><span class="pal-glyph">{kind === 'tile' ? '▫' : '▭'}</span>{PALETTE[kind].label}</button>
          ))}
          <div class="go-note">Click to add a tile to the board on show. Drag any tile OUT and release{' '}
            <b>over this panel</b> to remove it — one undo puts it back with its neighbours. Click a tile to select
            it, then Pin or Remove it. "Two boards" crosses a drag between two grids; "Bounded section" grows a row
            for a tile pulled past it; RTL mirrors the pixels; Columns sets this view's column count.</div>
        </aside>
        <div class="go-canvas">
          <GrafloriaDiagram key={mount.value} spec={board.value!}
            onReady$={$((api: DiagramInstance) => {
              instance.value = noSerialize(api);
              board.value?.handle.showView(tab.value);
              // The undo buttons follow the command stack, gestures included.
              for (const ev of ['command:executed', 'command:undone', 'command:redone']) {
                api.getEngine().eventBus.on(ev, () => { void sync(); });
              }
              void sync();
              markReady();
            })} />
          <div class={['go-status', status.value ? 'show' : ''].join(' ')}>{status.value}</div>
        </div>
      </div>
    </div>
  );
});
