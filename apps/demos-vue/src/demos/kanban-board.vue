<script setup lang="ts">
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { GrafloriaDashboard } from '@grafloria/vue';
import type { DashboardHandle, DashboardOptions, DashboardWidgetSpec } from '@grafloria/element';
import { markReady } from '../ready';

// KANBAN BOARD. Every column is a CONTAINER with `columns: 1` and gravity
// on (float off), so its cards stack top-down, close the gap a card leaves, and
// reorder by push. Cards are `autoHeight`: the kit measures what the Vue slot
// painted and takes whole rows. `canDrop` keeps cards inside columns and refuses
// a column at its WIP limit. Column headers are painted by `renderCaption`.

interface CardData { title: string; desc?: string; tag?: string; who?: string }
interface Column { id: string; name: string; wip?: number }

const ROW = 8;        // row unit, px — small, so a card's height rounds up by at most ROW + GAP
const HEAD_ROWS = 2;  // the column header spans this many parent row units (2 × 16 = 32 px)
const GAP = 8;
const EMPTY_ROWS = 8; // an empty column's inner height in rows
const COLUMNS: Column[] = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'doing',   name: 'In progress', wip: 3 },
  { id: 'review',  name: 'Review',      wip: 2 },
  { id: 'done',    name: 'Done' },
];
const CARDS: Record<string, CardData[]> = {
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

/* ---- the card: a real Vue component, mounted through the #widget-card slot ---- */
const KanbanCard = defineComponent({
  name: 'KanbanCard',
  props: { card: { type: Object as PropType<CardData>, required: true } },
  setup(props) {
    return () => h('div', { class: 'kb-card' }, [
      h('div', { class: 't' }, props.card.title),
      props.card.desc ? h('div', { class: 'd' }, props.card.desc) : null,
      h('div', { class: 'm' }, [
        h('span', { class: 'tag' }, props.card.tag ?? 'task'),
        h('span', { class: 'who' }, props.card.who ?? '?'),
      ]),
    ]);
  },
});

let seq = 0;
// `rows` is only the first guess: the dashboard's `autoHeight` measures the card.
const GUESS = 4;
const cardSpec = (d: CardData): DashboardWidgetSpec =>
  ({ id: `card-${++seq}`, kind: 'card', span: 1, rows: GUESS, resizable: false, data: d as unknown as Record<string, unknown> });

/* ---- column headers: painted by the page, so counts update without an undo step - */
let H: DashboardHandle | null = null;
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

function countsNow(): Record<string, number> {
  const out: Record<string, number> = {};
  const view = H?.toJSON().views[0];
  for (const c of COLUMNS) out[c.id] = (view?.widgets.find((w) => w.id === c.id)?.widgets ?? []).length;
  return out;
}
function updateCounts() {
  if (!H) return;
  const counts = countsNow();
  for (const c of COLUMNS) {
    const hd = heads.get(c.id);
    if (!hd) continue;
    const full = !!c.wip && counts[c.id] >= c.wip;
    hd.n.textContent = c.wip ? `${counts[c.id]} / ${c.wip}${full ? ' · full' : ''}` : String(counts[c.id]);
    hd.n.classList.toggle('over', full);
    hd.add.hidden = full;   // a full column takes no new card — the count says why
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
  const d: CardData = { title: NEW_TITLES[seq % NEW_TITLES.length], tag: 'new', who: 'RO' };
  // No cell given: the kit auto-positions — with gravity that is the bottom of the list.
  const w = H.addWidget(cardSpec(d), columnId);
  updateCounts();
  return w;
}

/* ---- the board ------------------------------------------------------------------ */
// A section's inner rows are squeezed into its slab, so the slab is sized in the
// PARENT's rows: a header of HEAD_ROWS × (ROW + GAP) and inner + HEAD_ROWS parent
// rows give inner rows of exactly ROW. `maxRows` is the empty column's height;
// cards measured taller grow the slab, and give the rows back.
const widgets: DashboardWidgetSpec[] = COLUMNS.map((c) => {
  const inner = Math.max(EMPTY_ROWS, CARDS[c.id].length * GUESS);
  return {
    id: c.id, title: c.name, span: 3, rows: inner + HEAD_ROWS, columns: 1, pinned: true, movable: false, resizable: false,
    caption: { text: c.name, height: HEAD_ROWS * (ROW + GAP) },
    maxRows: EMPTY_ROWS,
    widgets: CARDS[c.id].map(cardSpec),
  } as DashboardWidgetSpec;
});
const options = {
  columns: 12,
  gap: GAP,
  sizing: 'grow',
  rowHeight: ROW,
  float: false,
  autoHeight: true,
  canDrop,
  renderCaption: (w: DashboardWidgetSpec, host: HTMLElement) => paintHead(w.id, host),
} as unknown as Partial<DashboardOptions>;

function onReady(handle: DashboardHandle) {
  H = handle;
  (window as unknown as { __lab?: unknown }).__lab = { H: handle };   // lab probes
  updateCounts();
}

onMounted(() => {
  // The first measure lands after two frames; read the counts then mark ready.
  requestAnimationFrame(() => requestAnimationFrame(() => { updateCounts(); markReady(); }));
});
</script>

<template>
  <div class="kanban-demo" style="height:100vh">
    <GrafloriaDashboard :widgets="widgets" :options="options" @ready="onReady" @layout-change="updateCounts()">
      <template #widget-card="{ data }">
        <KanbanCard :card="data" />
      </template>
    </GrafloriaDashboard>
  </div>
</template>

<style>
/* Unscoped on purpose (the caption is plain DOM the kit paints), so every rule
   is under .kanban-demo: Vue demo <style> blocks stay in <head> after SPA
   navigation and must not leak into the next demo. */
.kanban-demo .kb-card { box-sizing: border-box; height: 100%; padding: 8px 10px; border-radius: 8px;
  background: var(--kb-card, #fff); border: 1px solid var(--kb-line, #dfe3ea);
  font: 13px/1.35 system-ui, sans-serif; color: var(--kb-ink, #1d2330); overflow: hidden; }
.kanban-demo .kb-card .t { font-weight: 600; margin-bottom: 4px; }
.kanban-demo .kb-card .d { color: var(--kb-muted, #5d6576); font-size: 12px; margin-bottom: 6px; }
.kanban-demo .kb-card .m { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--kb-muted, #5d6576); }
.kanban-demo .kb-card .tag { padding: 1px 6px; border-radius: 999px; background: var(--kb-tag, #eef1fb); color: #3b52d9; }
.kanban-demo .kb-card .who { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
  background: #3b52d9; color: #fff; font-size: 10px; font-weight: 600; }

.kanban-demo .kb-head { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 6px; white-space: nowrap; overflow: hidden;
  font: 600 13px system-ui, sans-serif; color: var(--kb-ink, #1d2330); }
.kanban-demo .kb-head .n { font-weight: 500; color: var(--kb-muted, #5d6576); font-variant-numeric: tabular-nums; }
.kanban-demo .kb-head .n.over { color: #c2410c; font-weight: 700; }
.kanban-demo .kb-head > span:first-child { overflow: hidden; text-overflow: ellipsis; }
.kanban-demo .kb-head button { flex: none; margin-left: auto; border: 1px solid var(--kb-line, #dfe3ea); background: transparent; color: inherit;
  border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit; font-weight: 500; }

@media (prefers-color-scheme: dark) {
  .kanban-demo { --kb-card: #1f232b; --kb-line: #353b47; --kb-ink: #e6e9ef; --kb-muted: #9aa3b5; --kb-tag: #27305a; }
}
</style>
