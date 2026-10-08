import { useEffect, useRef } from 'react';
import { GrafloriaDashboard, type WidgetProps } from '@grafloria/react';
import type { DashboardHandle, DashboardOptions, DashboardViewSpec, DashboardWidgetSpec } from '@grafloria/element';
import { markReady } from '../ready';

// KANBAN BOARD. Every column is a CONTAINER with `columns: 1` and gravity
// on (float off), so its cards stack top-down, close the gap a card leaves, and
// reorder by push. Cards are `autoHeight` and rendered by a React component
// (widgetTypes): the kit re-measures when the portal content arrives. `canDrop`
// keeps cards inside columns and refuses a column at its WIP limit.

const ROW = 8;        // row unit, px
const HEAD_ROWS = 2;  // the column header spans this many parent row units
const GAP = 8;
const EMPTY_ROWS = 30; // a stage's inner height in rows when its cards need less: room to drop into
const GUESS = 4;      // a card's first-guess rows; autoHeight measures it
interface Col { id: string; name: string; wip?: number; tint: string }
interface Card { title: string; desc?: string; tag?: string; who?: string }
const COLUMNS: Col[] = [
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
const NEW_TITLES = ['Follow up with the design review', 'Fix the flaky timing test', 'Write the release notes', 'Try a 6-column board on a phone'];

const CSS = `
.kb-card { box-sizing: border-box; height: 100%; padding: 8px 10px; border-radius: 8px;
  background: var(--kb-card, #fff); border: 1px solid var(--kb-line, #dfe3ea);
  font: 13px/1.35 system-ui, sans-serif; color: var(--kb-ink, #1d2330); overflow: hidden; }
.kb-card .t { font-weight: 600; margin-bottom: 4px; }
.kb-card .d { color: var(--kb-muted, #5d6576); font-size: 12px; margin-bottom: 6px; }
.kb-card .m { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--kb-muted, #5d6576); }
.kb-card .tag { padding: 1px 6px; border-radius: 999px; background: var(--kb-tag, #eef1fb); color: #3b52d9; }
.kb-card .who { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
  background: #3b52d9; color: #fff; font-size: 10px; font-weight: 600; }
.kb-head { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 6px; white-space: nowrap; overflow: hidden;
  font: 600 13px system-ui, sans-serif; color: var(--kb-ink, #1d2330); }
.kb-head .n { font-weight: 500; color: var(--kb-muted, #5d6576); font-variant-numeric: tabular-nums; }
.kb-head .n.over { color: #c2410c; font-weight: 700; }
.kb-head > span:first-child { overflow: hidden; text-overflow: ellipsis; }
.kb-head button { flex: none; margin-left: auto; border: 1px solid var(--kb-line, #dfe3ea); background: transparent; color: inherit;
  border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit; font-weight: 500; }
@media (prefers-color-scheme: dark) {
  :root { --kb-st-backlog: #1e222a; --kb-st-doing: #1a2436; --kb-st-review: #2b2417; --kb-st-done: #18271f; --kb-card: #1f232b; --kb-line: #353b47; --kb-ink: #e6e9ef; --kb-muted: #9aa3b5; --kb-tag: #27305a; }
}`;

/** A card — a real React component, portal-mounted into the kit's host. */
function KanbanCard({ data }: WidgetProps) {
  const d = data as unknown as Card;
  return (
    <div className="kb-card">
      <div className="t">{d.title}</div>
      {d.desc ? <div className="d">{d.desc}</div> : null}
      <div className="m">
        <span className="tag">{d.tag ?? 'task'}</span>
        <span className="who">{d.who ?? '?'}</span>
      </div>
    </div>
  );
}
const widgetTypes = { card: KanbanCard };

let seq = 0;
const cardSpec = (d: Card): DashboardWidgetSpec =>
  ({ id: `card-${++seq}`, kind: 'card', span: 1, rows: GUESS, resizable: false, data: d as unknown as Record<string, unknown> });

export default function KanbanBoardDemo() {
  const handleRef = useRef<DashboardHandle | null>(null);
  const heads = useRef(new Map<string, { n: HTMLElement; add: HTMLButtonElement }>());

  // Built once per mount: the board, its policy and its header painter share
  // the handle through refs, exactly as the JS page shares `H`.
  const board = useRef<{ views: DashboardViewSpec[]; options: Partial<DashboardOptions>; updateCounts: () => void } | null>(null);
  if (!board.current) {
    seq = 0;
    const countsNow = (): Record<string, number> => {
      const out: Record<string, number> = {};
      const view = handleRef.current?.toJSON().views[0];
      for (const c of COLUMNS) out[c.id] = (view?.widgets.find((w) => w.id === c.id)?.widgets ?? []).length;
      return out;
    };
    const isFull = (columnId: string) => {
      const c = COLUMNS.find((x) => x.id === columnId);
      return !!c?.wip && countsNow()[columnId] >= c.wip;
    };
    const updateCounts = () => {
      if (!handleRef.current) return;
      const counts = countsNow();
      for (const c of COLUMNS) {
        const h = heads.current.get(c.id);
        if (!h) continue;
        const full = !!c.wip && counts[c.id] >= c.wip;
        h.n.textContent = c.wip ? `${counts[c.id]} / ${c.wip}${full ? ' · full' : ''}` : String(counts[c.id]);
        h.n.classList.toggle('over', full);
        h.add.hidden = full; // a full column takes no new card — the count says why
      }
    };
    const addCard = (columnId: string) => {
      const H = handleRef.current;
      if (!H || isFull(columnId)) return undefined;
      const d: Card = { title: NEW_TITLES[seq % NEW_TITLES.length], tag: 'new', who: 'RO' };
      // No cell given: the kit auto-positions — with gravity that is the bottom of the list.
      const w = H.addWidget(cardSpec(d), columnId);
      updateCounts();
      return w;
    };
    const paintHead = (sectionId: string, host: HTMLElement) => {
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
      heads.current.set(sectionId, { n, add });
      updateCounts();
    };
    board.current = {
      views: [{
        id: 'main',
        widgets: COLUMNS.map((c) => {
          // A section's slab is sized in the PARENT's rows: a header of
          // HEAD_ROWS × (ROW + GAP) and inner + HEAD_ROWS parent rows give inner
          // rows of exactly ROW. `maxRows` is the empty column's height.
          const inner = Math.max(EMPTY_ROWS, CARDS[c.id].length * GUESS);
          return {
            id: c.id, title: c.name, span: 3, rows: inner + HEAD_ROWS, columns: 1, pinned: true, movable: 'row', resizable: false,
    background: c.tint, stack: true, // a stage only trades places with the others; a tinted list
            caption: { text: c.name, height: HEAD_ROWS * (ROW + GAP), background: 'transparent' },
            maxRows: EMPTY_ROWS,
            widgets: CARDS[c.id].map(cardSpec),
          } as DashboardWidgetSpec;
        }),
      }],
      options: {
        columns: 12,
        gap: GAP,
        sizing: 'grow',
        rowHeight: ROW,
        float: false,
        autoHeight: true,
        // The drop policy: cards live in columns, and a column at its WIP limit takes no more.
        canDrop: ({ to }) => COLUMNS.some((c) => c.id === to) && !isFull(to),
        renderCaption: (w, host) => paintHead(w.id, host),
      },
      updateCounts,
    };
  }
  const { updateCounts } = board.current;

  useEffect(() => {
    // The first measure needs two frames after mount; markReady adds two more.
    let alive = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!alive) return;
      updateCounts();
      markReady();
    }));
    return () => { alive = false; };
  }, [updateCounts]);

  return (
    <div style={{ height: '100vh', minHeight: 560 }}>
      <style>{CSS}</style>
      <GrafloriaDashboard
        views={board.current.views}
        options={board.current.options}
        widgetTypes={widgetTypes}
        onReady={(h) => {
          handleRef.current = h;
          (window as unknown as { __lab?: unknown }).__lab = { H: h };
          updateCounts();
        }}
        onLayoutChange={() => updateCounts()}
      />
    </div>
  );
}
