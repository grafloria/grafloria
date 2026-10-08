import { Component, ViewEncapsulation } from '@angular/core';
import { GrafloriaDashboardComponent, GrafloriaWidgetDefDirective } from '@grafloria/angular';
import type { DashboardHandle, DashboardOptions, DashboardWidgetSpec } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** KANBAN BOARD — the twin of demos/dashboard/kanban-board.html. Every
 *  column is a one-column section with gravity: cards stack, a gap closes when
 *  a card leaves, a card dragged into another column is adopted live. Cards are
 *  `autoHeight` and painted by an Angular template (`grafloriaWidget="card"`),
 *  so the kit measures framework-rendered content. Column headers are plain DOM
 *  painted through `options.renderCaption` — hence ViewEncapsulation.None and
 *  styles scoped under `.kb-ng`. */

const ROW = 8;        // row unit, px
const HEAD_ROWS = 2;  // the column header spans this many parent row units
const GAP = 8;
const EMPTY_ROWS = 30; // a stage's inner height in rows when its cards need less: room to drop into
const GUESS = 4;      // a card's first row guess — autoHeight measures it

interface Column { id: string; name: string; wip?: number; tint: string }
interface CardData { title: string; desc?: string; tag?: string; who?: string }

const COLUMNS: Column[] = [
  { id: 'backlog', name: 'Backlog', tint: 'var(--kb-st-backlog, #eceff5)' },
  { id: 'doing',   name: 'In progress', wip: 3, tint: 'var(--kb-st-doing, #e6eefc)' },
  { id: 'review',  name: 'Review',      wip: 2, tint: 'var(--kb-st-review, #fbf1df)' },
  { id: 'done',    name: 'Done', tint: 'var(--kb-st-done, #e4f3ea)' },
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
const NEW_TITLES = ['Follow up with the design review', 'Fix the flaky timing test', 'Write the release notes', 'Try a 6-column board on a phone'];

@Component({
  standalone: true,
  imports: [GrafloriaDashboardComponent, GrafloriaWidgetDefDirective],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="kb-ng">
      <grafloria-dashboard [widgets]="widgets" [options]="options"
        (ready)="onReady($event)" (layoutChange)="updateCounts()"
        style="display:block; width:100%; height:100vh; min-height:560px">
        <ng-template grafloriaWidget="card" let-data="data">
          <div class="kb-card">
            <div class="t">{{ data['title'] }}</div>
            @if (data['desc']) { <div class="d">{{ data['desc'] }}</div> }
            <div class="m">
              <span class="tag">{{ data['tag'] ?? 'task' }}</span>
              <span class="who">{{ data['who'] ?? '?' }}</span>
            </div>
          </div>
        </ng-template>
      </grafloria-dashboard>
    </div>
  `,
  styles: [`
    .kb-ng .kb-card { box-sizing: border-box; height: 100%; padding: 8px 10px; border-radius: 8px;
      background: var(--kb-card, #fff); border: 1px solid var(--kb-line, #dfe3ea);
      font: 13px/1.35 system-ui, sans-serif; color: var(--kb-ink, #1d2330); overflow: hidden; }
    .kb-ng .kb-card .t { font-weight: 600; margin-bottom: 4px; }
    .kb-ng .kb-card .d { color: var(--kb-muted, #5d6576); font-size: 12px; margin-bottom: 6px; }
    .kb-ng .kb-card .m { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--kb-muted, #5d6576); }
    .kb-ng .kb-card .tag { padding: 1px 6px; border-radius: 999px; background: var(--kb-tag, #eef1fb); color: #3b52d9; }
    .kb-ng .kb-card .who { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
      background: #3b52d9; color: #fff; font-size: 10px; font-weight: 600; }

    .kb-ng .kb-head { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 6px; white-space: nowrap; overflow: hidden;
      font: 600 13px system-ui, sans-serif; color: var(--kb-ink, #1d2330); }
    .kb-ng .kb-head .n { font-weight: 500; color: var(--kb-muted, #5d6576); font-variant-numeric: tabular-nums; }
    .kb-ng .kb-head .n.over { color: #c2410c; font-weight: 700; }
    .kb-ng .kb-head > span:first-child { overflow: hidden; text-overflow: ellipsis; }
    .kb-ng .kb-head button { flex: none; margin-left: auto; border: 1px solid var(--kb-line, #dfe3ea); background: transparent; color: inherit;
      border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit; font-weight: 500; }
    .kb-ng .kb-head button[hidden] { display: none; }

    @media (prefers-color-scheme: dark) {
      .kb-ng { --kb-st-backlog: #1e222a; --kb-st-doing: #1a2436; --kb-st-review: #2b2417; --kb-st-done: #18271f; --kb-card: #1f232b; --kb-line: #353b47; --kb-ink: #e6e9ef; --kb-muted: #9aa3b5; --kb-tag: #27305a; }
    }
  `],
})
export class KanbanBoardComponent {
  private seq = 0;
  private H?: DashboardHandle;
  private readonly heads = new Map<string, { n: HTMLElement; add: HTMLButtonElement }>();

  private readonly cardSpec = (d: CardData): DashboardWidgetSpec =>
    ({ id: `card-${++this.seq}`, kind: 'card', span: 1, rows: GUESS, resizable: false, data: d as unknown as Record<string, unknown> });

  // A section's inner rows are squeezed into its slab, so the slab is sized in
  // the PARENT's rows: a header of HEAD_ROWS × (ROW + GAP) and inner + HEAD_ROWS
  // parent rows give inner rows of exactly ROW. `maxRows` is the empty column's
  // height; cards measured taller grow the slab, and give the rows back.
  readonly widgets: DashboardWidgetSpec[] = COLUMNS.map((c) => {
    const inner = Math.max(EMPTY_ROWS, CARDS[c.id].length * GUESS);
    return {
      id: c.id, title: c.name, span: 3, rows: inner + HEAD_ROWS, columns: 1, pinned: true, movable: 'row', resizable: false,
    background: c.tint, stack: true, // a stage only trades places with the others; a tinted list
      caption: { text: c.name, height: HEAD_ROWS * (ROW + GAP), background: 'transparent' },
      maxRows: EMPTY_ROWS,
      widgets: CARDS[c.id].map(this.cardSpec),
    } as DashboardWidgetSpec;
  });

  readonly options: Partial<DashboardOptions> = {
    columns: 12,
    gap: GAP,
    sizing: 'grow',
    rowHeight: ROW,
    float: false,
    autoHeight: true,
    canDrop: ({ to }) => COLUMNS.some((c) => c.id === to) && !this.isFull(to),
    renderCaption: (w, host) => this.paintHead(w.id, host),
  };

  onReady(h: DashboardHandle): void {
    this.H = h;
    (window as unknown as { __lab?: unknown }).__lab = { H: h };   // lab probes, as the JS page
    this.updateCounts();
    // The first measure lands within two frames; then the gate may look.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.updateCounts();
      markReady();
    }));
  }

  /* ---- column headers: painted as plain DOM, so counts update without an undo step */
  private paintHead(sectionId: string, host: HTMLElement): void {
    const col = COLUMNS.find((c) => c.id === sectionId);
    if (!col) return;
    host.replaceChildren();
    const el = document.createElement('div'); el.className = 'kb-head';
    const name = document.createElement('span'); name.textContent = col.name;
    const n = document.createElement('span'); n.className = 'n';
    const add = document.createElement('button'); add.textContent = '+ Add'; add.dataset['axdbPass'] = '';
    add.title = `Add a card to ${col.name}`;
    add.addEventListener('click', (e) => { e.stopPropagation(); this.addCard(col.id); });
    el.append(name, n, add); host.append(el);
    this.heads.set(sectionId, { n, add });
    this.updateCounts();
  }

  private countsNow(): Record<string, number> {
    const out: Record<string, number> = {};
    const view = this.H?.toJSON().views[0];
    for (const c of COLUMNS) out[c.id] = (view?.widgets.find((w) => w.id === c.id)?.widgets ?? []).length;
    return out;
  }

  updateCounts(): void {
    if (!this.H) return;
    const counts = this.countsNow();
    for (const c of COLUMNS) {
      const h = this.heads.get(c.id);
      if (!h) continue;
      const full = !!c.wip && counts[c.id] >= c.wip;
      h.n.textContent = c.wip ? `${counts[c.id]} / ${c.wip}${full ? ' · full' : ''}` : String(counts[c.id]);
      h.n.classList.toggle('over', full);
      h.add.hidden = full;   // a full column takes no new card — the count says why
    }
  }

  private isFull(columnId: string): boolean {
    const c = COLUMNS.find((x) => x.id === columnId);
    return !!c?.wip && this.countsNow()[columnId] >= c.wip;
  }

  private addCard(columnId: string): void {
    if (!this.H || this.isFull(columnId)) return;
    const d: CardData = { title: NEW_TITLES[this.seq % NEW_TITLES.length], tag: 'new', who: 'RO' };
    // No cell given: the kit auto-positions — with gravity that is the bottom of the list.
    this.H.addWidget(this.cardSpec(d), columnId);
    this.updateCounts();
  }
}
