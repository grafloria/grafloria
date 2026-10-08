import { component$, $, noSerialize, useSignal, useStyles$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaDiagram } from '@grafloria/qwik';
import { dashboard, type DashboardHandle, type DashboardWidgetSpec } from '@grafloria/element';
import { markReady } from '../ready';

/** THE KANBAN BOARD — the JS page demos/dashboard/kanban-board.html. Every
 *  column is a CONTAINER with `columns: 1` and gravity on (float off), so its
 *  cards stack top-down, close the gap a card leaves, and reorder by push. Cards
 *  are `autoHeight`: the kit measures them and takes whole rows. `canDrop` keeps
 *  cards inside columns and refuses a column at its WIP limit.
 *
 *  Hosted like grid-options: the dashboard() spec goes to GrafloriaDiagram, so
 *  the spec's own renderWidget / renderCaption / onLayoutChange are the kit's
 *  callbacks exactly as on the JS page (GrafloriaDashboard replaces
 *  renderWidget and onLayoutChange with its own). Cards and headers are plain
 *  DOM painted by module functions — no Qwik handler lives inside the board. */

const ROW = 8;        // row unit, px — small, so a card's height rounds up by at most ROW + GAP
const HEAD_ROWS = 2;  // the column header spans this many parent row units (2 × 16 = 32 px)
const GAP = 8;
const EMPTY_ROWS = 30; // a stage's inner height in rows when its cards need less: room to drop into
interface Column { id: string; name: string; wip?: number; tint: string }
interface Card { title: string; desc?: string; tag?: string; who?: string }
const COLUMNS: Column[] = [
  { id: 'backlog', name: 'Backlog', tint: 'var(--kb-st-backlog, #eceff5)' },
  { id: 'doing',   name: 'In progress', wip: 3, tint: 'var(--kb-st-doing, #e6eefc)' },
  { id: 'review',  name: 'Review',      wip: 2, tint: 'var(--kb-st-review, #fbf1df)' },
  { id: 'done',    name: 'Done', tint: 'var(--kb-st-done, #e4f3ea)' },
];
const CARDS: Record<string, Card[]> = {
  backlog: [
    { title: 'Export the board as PDF', tag: 'export', who: 'RO' },
    { title: 'Keyboard shortcuts for moving a card between columns', desc: 'Ctrl+← / Ctrl+→ moves the focused card; the screen reader announces the new column and position.', tag: 'a11y', who: 'MS' },
    { title: 'Swimlanes by assignee', tag: 'idea', who: 'LK' },
  ],
  doing: [
    { title: 'Content-driven card height', desc: 'Cards measure their content and take whole rows.', tag: 'kit', who: 'RO' },
    { title: 'WIP limits per column', tag: 'kit', who: 'MS' },
  ],
  review: [
    { title: 'Undo a cross-column move in one step', tag: 'kit', who: 'LK' },
  ],
  done: [],
};

/* ---- cards: paint + measure ---------------------------------------------------- */
function paintCard(el: HTMLElement, d: Card) {
  el.className = 'kb-card';
  el.innerHTML = '';
  const t = document.createElement('div'); t.className = 't'; t.textContent = d.title; el.append(t);
  if (d.desc) { const p = document.createElement('div'); p.className = 'd'; p.textContent = d.desc; el.append(p); }
  const m = document.createElement('div'); m.className = 'm';
  const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = d.tag ?? 'task';
  const who = document.createElement('span'); who.className = 'who'; who.textContent = d.who ?? '?';
  m.append(tag, who); el.append(m);
}
let seq = 0;
// `rows` is only the first guess: the dashboard's `autoHeight` measures the card.
const GUESS = 4;
const cardSpec = (d: Card): DashboardWidgetSpec =>
  ({ id: `card-${++seq}`, kind: 'card', span: 1, rows: GUESS, resizable: false, data: d as unknown as Record<string, unknown> }) as DashboardWidgetSpec;

/* ---- column headers: painted by the page, so counts update without an undo step - */
const heads = new Map<string, { n: HTMLElement; add: HTMLButtonElement }>();
function paintHead(sectionId: string, host: HTMLElement) {
  const col = COLUMNS.find((c) => c.id === sectionId);
  if (!col) return;
  host.replaceChildren();
  const el = document.createElement('div'); el.className = 'kb-head';
  const name = document.createElement('span'); name.textContent = col.name;
  const n = document.createElement('span'); n.className = 'n';
  const add = document.createElement('button'); add.textContent = '+ Add'; add.dataset.axdbPass = '';
  add.title = `Add a card to ${col.name}`;
  add.addEventListener('click', (e) => { e.stopPropagation(); addCard(col.id); });
  el.append(name, n, add); host.append(el);
  heads.set(sectionId, { n, add });
  updateCounts();
}

// The live handle — set once the board is mounted (as the JS page sets it after render()).
let H: DashboardHandle | undefined;
interface ViewJSON { widgets: Array<{ id: string; widgets?: unknown[] }> }
function countsNow(): Record<string, number> {
  const out: Record<string, number> = {};
  const view = H?.toJSON().views[0] as ViewJSON | undefined;
  for (const c of COLUMNS) out[c.id] = (view?.widgets.find((w) => w.id === c.id)?.widgets ?? []).length;
  return out;
}
function updateCounts() {
  if (!H) return;
  const counts = countsNow();
  for (const c of COLUMNS) {
    const h = heads.get(c.id);
    if (!h) continue;
    const full = !!c.wip && counts[c.id] >= c.wip;
    h.n.textContent = c.wip ? `${counts[c.id]} / ${c.wip}${full ? ' · full' : ''}` : String(counts[c.id]);
    h.n.classList.toggle('over', full);
    h.add.hidden = full;   // a full column takes no new card — the count says why
  }
}
const isFull = (columnId: string) => {
  const c = COLUMNS.find((x) => x.id === columnId);
  return !!c?.wip && countsNow()[columnId] >= c.wip;
};
/** The drop policy: cards live in columns, and a column at its WIP limit takes no more. */
function canDrop({ to }: { to?: string | null }) {
  return COLUMNS.some((c) => c.id === to) && !isFull(to as string);
}

const NEW_TITLES = ['Follow up with the design review', 'Fix the flaky timing test', 'Write the release notes', 'Try a 6-column board on a phone'];
function addCard(columnId: string) {
  if (!H || isFull(columnId)) return undefined;
  const d: Card = { title: NEW_TITLES[seq % NEW_TITLES.length], tag: 'new', who: 'RO' };
  // No cell given: the kit auto-positions — with gravity that is the bottom of the list.
  const w = H.addWidget(cardSpec(d), columnId);
  updateCounts();
  return w;
}

/* ---- the board ------------------------------------------------------------------ */
function buildBoard() {
  seq = 0; heads.clear(); H = undefined;   // a fresh mount starts from the seed
  return dashboard({
    columns: 12,
    gap: GAP,
    sizing: 'grow',
    rowHeight: ROW,
    float: false,
    autoHeight: true,
    canDrop,
    widgets: COLUMNS.map((c) => {
      // A section's inner rows are squeezed into its slab, so the slab is sized in
      // the PARENT's rows: a header of HEAD_ROWS × (ROW + GAP) and inner + HEAD_ROWS
      // parent rows give inner rows of exactly ROW. `maxRows` is the empty column's
      // height; cards measured taller grow the slab, and give the rows back.
      const inner = Math.max(EMPTY_ROWS, CARDS[c.id].length * GUESS);
      return {
        id: c.id, title: c.name, span: 3, rows: inner + HEAD_ROWS, columns: 1, pinned: true, movable: 'row', resizable: false,
    background: c.tint, stack: true, // a stage only trades places with the others; a tinted list
        caption: { text: c.name, height: HEAD_ROWS * (ROW + GAP), background: 'transparent' },
        maxRows: EMPTY_ROWS,
        widgets: CARDS[c.id].map(cardSpec),
      };
    }) as DashboardWidgetSpec[],
    // Paint INTO a child: the host carries the kit's own classes (grafloria-node-host,
    // axdb-ghost while dragged) — overwriting host.className drops the drag z-raise.
    renderWidget: (w, host) => { if (w.kind === 'card') { const el = document.createElement('div'); paintCard(el, w.data as unknown as Card); host.replaceChildren(el); } },
    renderCaption: (w, host) => paintHead(w.id, host),
    onLayoutChange: () => updateCounts(),
  } as Parameters<typeof dashboard>[0]);
}
type Board = ReturnType<typeof buildBoard>;

/** Called from onReady$: the handle goes live, then the first measure settles. */
function boardReady(board: Board | undefined) {
  H = board?.handle;
  requestAnimationFrame(() => requestAnimationFrame(() => { updateCounts(); markReady(); }));
}

const CSS = `
  .kbq-page { height: 100vh; width: 100%; background: var(--kb-bg, #fff); }
  .kbq-page .kb-card { box-sizing: border-box; height: 100%; padding: 8px 10px; border-radius: 8px;
    background: var(--kb-card, #fff); border: 1px solid var(--kb-line, #dfe3ea);
    font: 13px/1.35 system-ui, sans-serif; color: var(--kb-ink, #1d2330); overflow: hidden; }
  .kbq-page .kb-card .t { font-weight: 600; margin-bottom: 4px; }
  .kbq-page .kb-card .d { color: var(--kb-muted, #5d6576); font-size: 12px; margin-bottom: 6px; }
  .kbq-page .kb-card .m { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--kb-muted, #5d6576); }
  .kbq-page .kb-card .tag { padding: 1px 6px; border-radius: 999px; background: var(--kb-tag, #eef1fb); color: #3b52d9; }
  .kbq-page .kb-card .who { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
    background: #3b52d9; color: #fff; font-size: 10px; font-weight: 600; }

  .kbq-page .kb-head { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 6px; white-space: nowrap; overflow: hidden;
    font: 600 13px system-ui, sans-serif; color: var(--kb-ink, #1d2330); }
  .kbq-page .kb-head .n { font-weight: 500; color: var(--kb-muted, #5d6576); font-variant-numeric: tabular-nums; }
  .kbq-page .kb-head .n.over { color: #c2410c; font-weight: 700; }
  .kbq-page .kb-head > span:first-child { overflow: hidden; text-overflow: ellipsis; }
  .kbq-page .kb-head button { flex: none; margin-left: auto; border: 1px solid var(--kb-line, #dfe3ea); background: transparent; color: inherit;
    border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit; font-weight: 500; }
  .kbq-page .kb-head button[hidden] { display: none; }

  @media (prefers-color-scheme: dark) {
    .kbq-page { --kb-st-backlog: #1e222a; --kb-st-doing: #1a2436; --kb-st-review: #2b2417; --kb-st-done: #18271f; --kb-card: #1f232b; --kb-line: #353b47; --kb-ink: #e6e9ef; --kb-muted: #9aa3b5; --kb-tag: #27305a; --kb-bg: transparent; }
  }
`;

export default component$(() => {
  useStyles$(CSS);
  // The dashboard() spec carries functions — not data: noSerialize.
  const board = useSignal<NoSerialize<Board>>(() => noSerialize(buildBoard()));
  return (
    <div class="kbq-page">
      <GrafloriaDiagram spec={board.value!} onReady$={$(() => boardReady(board.value))} />
    </div>
  );
});
