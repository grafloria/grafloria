// THE DASHBOARD BUILDER'S BOARD — framework-free, so the Qwik demo only paints
// chrome. It is the JS gallery page's own logic (demos/dashboard/dashboard-builder.html):
// a declared three-view board, dashboard() → render(), every edit ONE call on
// `spec.handle` and one undo step, palette drag-in, drag-out-to-remove, and a
// version history whose cards carry real vector thumbnails. The component
// subscribes with `attach(instance, root, listener)` and re-renders from the
// plain-data `BuilderUi` snapshot the listener receives.
import {
  dashboard,
  defaultWidgetRenderer,
  NodeModel,
  type DashboardHandle,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';

/* 1. STATIC SALES DATASET — deterministic (goldens must bless stably). */
const C = { blue: '#3b52d9', sky: '#0ea5e9', teal: '#14b8a6', amber: '#f59e0b', violet: '#8b5cf6', slate: '#64748b' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATA = {
  revenue: [420, 455, 470, 512, 498, 545, 588, 610, 596, 648, 705, 762],
  target: [400, 430, 465, 500, 520, 540, 560, 590, 615, 640, 665, 700],
  regions: [
    { name: 'North America', value: 2860, color: C.blue },
    { name: 'EMEA', value: 1920, color: C.teal },
    { name: 'APAC', value: 1340, color: C.amber },
    { name: 'LATAM', value: 610, color: C.violet },
  ],
  pipeline: [
    { stage: 'Lead', value: 1200 },
    { stage: 'Qualified', value: 820 },
    { stage: 'Proposal', value: 540 },
    { stage: 'Negotiation', value: 360 },
    { stage: 'Closed Won', value: 214 },
  ],
  reps: [
    { name: 'A. Farouk', deals: 38, revenue: '1.24M', quota: 118 },
    { name: 'M. Haddad', deals: 31, revenue: '0.98M', quota: 96 },
    { name: 'J. Okonkwo', deals: 29, revenue: '0.91M', quota: 88 },
    { name: 'S. Nakamura', deals: 24, revenue: '0.77M', quota: 74 },
    { name: 'L. Moretti', deals: 21, revenue: '0.63M', quota: 61 },
  ],
  kpis: {
    revenue: { label: 'Total revenue', value: '$6.81M', delta: +12.4, deltaLabel: 'vs last qtr', spark: [42, 45, 47, 51, 50, 55, 59, 61, 60, 65, 71, 76] },
    customers: { label: 'New customers', value: '1,284', delta: +8.1, deltaLabel: 'vs last qtr', spark: [70, 74, 79, 83, 88, 92, 96, 101, 108, 116, 124, 131] },
    avgDeal: { label: 'Avg deal size', value: '$18.6K', delta: -2.3, deltaLabel: 'vs last qtr', spark: [21, 20, 22, 19, 20, 18, 19, 18, 17, 19, 18, 18] },
    winRate: { label: 'Win rate', value: '27.4%', delta: +3.5, deltaLabel: 'vs last qtr', spark: [22, 23, 24, 24, 25, 25, 26, 26, 27, 27, 27, 28] },
  },
};

/* The dataset, shaped once per BUILT-IN WIDGET CONTRACT. */
const TREND = { series: [{ name: 'Revenue', values: DATA.revenue }, { name: 'Target', values: DATA.target }], labels: MONTHS };
const MIX = { slices: DATA.regions.map((r) => ({ label: r.name, value: r.value, color: r.color })), centerLabel: '$6.73M' };
const BARS = { bars: DATA.regions.map((r) => ({ label: r.name, value: r.value })) };
const STAGES = { stages: DATA.pipeline.map((p) => ({ label: p.stage, value: p.value })) };
const STAGE_MIX = { slices: DATA.pipeline.map((p) => ({ label: p.stage, value: p.value })) };
const REPS = {
  columns: ['Rep', 'Deals', 'Revenue', 'Quota'],
  rows: DATA.reps.map((r) => [r.name, r.deals, `$${r.revenue}`, `${r.quota}%`]),
};

/* 2. THE BOARD — DECLARED. Three views, each a list of widgets. Widgets that
   name no cell flow and wrap; Pipeline mixes ONE explicit cell into the flow. */
export const VIEWS: DashboardViewSpec[] = [
  { id: 'overview', name: 'Overview', widgets: [
    { id: 'kpi-revenue', kind: 'kpi', span: 3, rows: 1, data: DATA.kpis.revenue },
    { id: 'kpi-customers', kind: 'kpi', span: 3, rows: 1, data: DATA.kpis.customers },
    { id: 'kpi-avgdeal', kind: 'kpi', span: 3, rows: 1, data: DATA.kpis.avgDeal },
    { id: 'kpi-winrate', kind: 'kpi', span: 3, rows: 1, data: DATA.kpis.winRate },
    { id: 'trend', kind: 'line', span: 8, rows: 2, title: 'Revenue vs target', data: TREND },
    { id: 'mix', kind: 'donut', span: 4, rows: 2, title: 'Revenue by region', data: MIX },
    { id: 'reps', kind: 'table', span: 12, rows: 2, title: 'Top reps by revenue', data: REPS },
  ] },
  { id: 'sales', name: 'Sales', widgets: [
    { id: 'sales-bar', kind: 'bar', span: 7, rows: 2, title: 'Revenue by region', data: BARS },
    { id: 'sales-mix', kind: 'donut', span: 5, rows: 2, title: 'Region share', data: MIX },
    { id: 'sales-trend', kind: 'line', span: 12, rows: 2, title: 'Monthly revenue trend', data: TREND },
  ] },
  { id: 'pipeline', name: 'Pipeline', widgets: [
    { id: 'pipe-funnel', kind: 'funnel', span: 6, rows: 2, title: 'Conversion funnel', data: STAGES },
    { id: 'pipe-mix', kind: 'donut', span: 6, rows: 1, title: 'Pipeline by stage', data: STAGE_MIX },
    { id: 'pipe-winrate', kind: 'kpi', span: 6, rows: 1, x: 6, y: 1, data: DATA.kpis.winRate },
    { id: 'pipe-reps', kind: 'table', span: 12, rows: 1, title: 'Top reps by revenue', data: REPS },
  ] },
] as DashboardViewSpec[];

const BOARD = { columns: 12, gap: 8, rowHeight: 130, width: 1180, height: 660 };

/** What a palette chip adds — sizes in INTEGER CELLS of the 12-column grid. */
export const PALETTE: Record<string, Omit<DashboardWidgetSpec, 'id'>> = {
  kpi: { kind: 'kpi', span: 3, rows: 1, data: DATA.kpis.revenue },
  line: { kind: 'line', span: 8, rows: 2, title: 'Revenue vs target', data: TREND },
  bar: { kind: 'bar', span: 6, rows: 2, title: 'Revenue by region', data: BARS },
  donut: { kind: 'donut', span: 4, rows: 2, title: 'Revenue share', data: MIX },
  funnel: { kind: 'funnel', span: 4, rows: 2, title: 'Conversion funnel', data: STAGES },
  table: { kind: 'table', span: 12, rows: 2, title: 'Top reps', data: REPS },
};

/** One version card, as plain data the component can render. */
export interface VersionCard {
  id: string; title: string; when: string; auto: boolean; current: boolean;
  thumb: string | null; alt: string; sub: string; delta: string;
}
/** The whole chrome state, as plain data. */
export interface BuilderUi {
  view: string; status: string;
  canUndo: boolean; canRedo: boolean; hasFocus: boolean; focusPinned: boolean;
  sizing: 'fit' | 'grow'; float: boolean; layout: 'grid' | 'split';
  historyOpen: boolean; historyCount: string; versions: VersionCard[];
}

interface Version {
  id: string; n: number; at: number; auto: boolean;
  board: ReturnType<DashboardHandle['toJSON']>; views: DashboardViewSpec[];
  sizing: 'fit' | 'grow'; float: boolean; view: string; thumb: string | null;
}

const HISTORY_KEY = 'grafloria-dashboard-history';
const MAX_VERSIONS = 8;
type Spec = ReturnType<typeof dashboard>;
type Cmd = { canUndo(): boolean; canRedo(): boolean; undo(): Promise<void>; redo(): Promise<void>; clear(): void };

const viewNameOf = (id: string) => VIEWS.find((v) => v.id === id)?.name ?? id;
const widgetCount = (v: Version) => v.views.reduce((s, x) => s + x.widgets.length, 0);
const viewCount = (v: Version) => v.views.find((x) => x.id === v.view)?.widgets.length ?? 0;
const thumbUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function relTime(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** WHAT CHANGED between two versions, per widget. */
function deltaText(newer: Version, older: Version): string {
  const index = (views: DashboardViewSpec[]) => {
    const m = new Map<string, DashboardWidgetSpec>();
    for (const v of views) for (const w of v.widgets) m.set(`${v.id}/${w.id}`, w);
    return m;
  };
  const A = index(newer.views), B = index(older.views);
  let added = 0, removed = 0, moved = 0, resized = 0;
  for (const [k, w] of A) {
    const o = B.get(k);
    if (!o) { added++; continue; }
    if (o.x !== w.x || o.y !== w.y) moved++;
    if (o.span !== w.span || o.rows !== w.rows) resized++;
  }
  for (const k of B.keys()) if (!A.has(k)) removed++;
  const parts: string[] = [];
  if (added) parts.push(`+${added} added`);
  if (removed) parts.push(`−${removed} removed`);
  if (moved) parts.push(`${moved} moved`);
  if (resized) parts.push(`${resized} resized`);
  if (newer.view !== older.view) parts.push(`view → ${viewNameOf(newer.view)}`);
  if (newer.sizing !== older.sizing) parts.push(`mode → ${newer.sizing}`);
  if (newer.float !== older.float) parts.push(`float ${newer.float ? 'on' : 'off'}`);
  return parts.length ? parts.join(' · ') : 'no layout change';
}

const storageOk = (): boolean => {
  try { localStorage.setItem('grafloria-dash-probe', '1'); localStorage.removeItem('grafloria-dash-probe'); return true; }
  catch { return false; }
};

export class DashboardBuilder {
  spec: Spec;
  H: DashboardHandle;
  private instance: DiagramInstance | null = null;
  private root: HTMLElement | null = null;
  private listener: ((ui: BuilderUi) => void) | null = null;
  private ro: ResizeObserver | null = null;
  private sizingMode: 'fit' | 'grow' = 'fit';
  private floatMode = false;
  private layoutMode: 'grid' | 'split' = 'grid';
  private focus: string | null = null;
  private seq = 0;
  private status = '';
  private lastPaletteGestureAt = 0;
  private glideTimer: ReturnType<typeof setTimeout> | undefined;
  private history: Version[] = [];
  private versionSeq = 0;
  private currentVersion: string | null = null;
  private historyOpen = false;
  private lastShed: string | null = null;
  private readonly canStore = storageOk();

  /** render() resolves the painter once, at mount, and Load REPLACES the spec —
   *  so the painter is a LIVE binding to whichever spec is current. */
  readonly renderOptions = {
    renderCustomNode: (n: unknown, host: HTMLElement) =>
      (this.spec as unknown as { renderCustomNode(n: unknown, h: HTMLElement): void }).renderCustomNode(n, host),
  };

  constructor() {
    this.spec = this.buildSpec(VIEWS);
    this.H = this.spec.handle;
    this.restoreHistory();
  }

  /** Called once the kit has rendered: wire the live instance and frame Overview. */
  attach(instance: DiagramInstance, root: HTMLElement, listener: (ui: BuilderUi) => void): void {
    this.instance = instance;
    this.root = root;
    this.listener = listener;
    this.afterMount('overview');
    // Keep the active view framed as the canvas resizes (the drawer narrows it).
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        const r = root.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) this.H.showView(this.H.activeView);
      });
      this.ro.observe(root);
    }
    instance.renderNow();
    this.syncSoon();
  }

  detach(): void { this.ro?.disconnect(); this.ro = null; this.listener = null; }

  // ---- the snapshot the component renders ---------------------------------
  private cmd(): Cmd | null {
    return (this.instance?.getEngine() as unknown as { commandManager: Cmd } | undefined)?.commandManager ?? null;
  }
  snapshot(): BuilderUi {
    const cm = this.cmd();
    const w = this.focus ? this.H.widget(this.focus) : undefined;
    return {
      view: this.H.activeView, status: this.status,
      canUndo: !!cm?.canUndo(), canRedo: !!cm?.canRedo(),
      hasFocus: !!w, focusPinned: w?.pinned === true,
      sizing: this.sizingMode, float: this.floatMode, layout: this.H.getLayout() === 'split' ? 'split' : 'grid',
      historyOpen: this.historyOpen, historyCount: `${this.history.length}/${MAX_VERSIONS}`,
      versions: this.history.map((v, i) => {
        const older = this.history[i + 1];
        const kb = Math.max(1, Math.round((JSON.stringify(v.views).length + (v.thumb?.length ?? 0)) / 1024));
        return {
          id: v.id, title: `Restore ${v.id} — saved ${new Date(v.at).toLocaleTimeString()}`,
          when: relTime(v.at), auto: v.auto, current: v.id === this.currentVersion,
          thumb: v.thumb ? thumbUri(v.thumb) : null,
          alt: `${viewNameOf(v.view)} board, ${widgetCount(v)} widgets`,
          sub: `${viewNameOf(v.view)} · ${viewCount(v)} of ${widgetCount(v)} widgets · ${kb} KB`,
          delta: older ? deltaText(v, older) : 'first version',
        };
      }),
    };
  }
  private notify(): void { this.listener?.(this.snapshot()); }
  /** Commits fire their command without awaiting it, so the undo entry lands
   *  on the NEXT tick: read now AND then. */
  private syncSoon(): void { this.notify(); setTimeout(() => this.notify(), 0); }

  // ---- the widget painter + app chrome on the kit's cards -----------------
  /** dashboard()'s `renderWidget` seam: the LIBRARY draws the chart; the page
   *  adds a pin marker and click-to-focus. */
  private renderWidget = (widget: DashboardWidgetSpec, host: HTMLElement): void => {
    defaultWidgetRenderer(widget, host);
    const card = host.firstElementChild as HTMLElement | null;
    if (!card) return;
    const head = card.querySelector('.axdb-widget-h');
    if (head) head.insertAdjacentHTML('beforeend', '<span class="pin" title="Pinned">📌</span>');
    host.onclick = () => this.setFocus(widget.id);
    this.paintChrome(card, widget.id);
  };
  private cardOf(id: string): HTMLElement | null {
    return this.root?.querySelector(`.grafloria-node-host[data-node-id="${id}"] .axdb-widget`) ?? null;
  }
  private paintChrome(card: HTMLElement | null, id: string): void {
    if (!card) return;
    card.classList.toggle('focused', id === this.focus);
    card.classList.toggle('locked', this.H?.widget(id)?.pinned === true);
  }
  private syncChrome(): void {
    for (const v of this.H.views) for (const w of this.H.widgetsOf(v)) this.paintChrome(this.cardOf(w.id), w.id);
  }
  setFocus(id: string | null): void {
    this.focus = id;
    this.syncChrome();
    this.syncSoon();
  }
  private flash(msg: string): void {
    this.status = `${++this.seq} · ${msg}`;
    this.notify();
  }
  /** Arm the reflow transition for one non-gesture relayout burst. */
  private glide(): void {
    const layer = this.root?.querySelector('.grafloria-html-layer');
    if (!layer) return;
    layer.classList.add('glide');
    clearTimeout(this.glideTimer);
    this.glideTimer = setTimeout(() => layer.classList.remove('glide'), 420);
  }

  // ---- mount ---------------------------------------------------------------
  private buildSpec(views: DashboardViewSpec[]): Spec {
    return dashboard({
      ...BOARD,
      sizing: this.sizingMode,
      float: this.floatMode,
      layout: this.layoutMode,
      views: JSON.parse(JSON.stringify(views)) as DashboardViewSpec[],
      renderWidget: this.renderWidget,
      onLayoutChange: () => this.syncSoon(),
      binder: {
        dragOut: 'remove',
        // Deletion needs INTENT: only a release over the palette removes.
        removeZone: (screen) => {
          const pal = this.root?.ownerDocument.querySelector('.db-palette');
          return !!pal && screen.x <= pal.getBoundingClientRect().right + 8;
        },
        onRemoveRequest: (nodeId, displaced) => this.removeWidget(nodeId, displaced),
        onDropIn: (node, cell, displaced, target) => this.dropIn(node, cell, target, displaced),
        onGesture: (e) => {
          if (e.kind === 'palette') this.lastPaletteGestureAt = Date.now();
          if (e.type === 'commit') {
            this.setFocus(e.nodeId);
            this.flash(e.changed
              ? (e.kind === 'resize' ? 'resize committed — one undoable step' : 'move committed — one undoable step')
              : 'released — nothing changed');
          } else if (e.type === 'cancel' && e.kind !== 'palette') {
            this.flash('cancelled — every tile restored');
          }
          this.syncSoon();
        },
      },
    } as Parameters<typeof dashboard>[0]);
  }
  private afterMount(active: string): void {
    this.showView(this.H.views.includes(active) ? active : this.H.views[0]);
  }

  // ---- toolbar + palette: every edit ONE call on the handle ---------------
  showView(id: string): void {
    this.H.showView(id);
    this.setFocus(this.H.widgetsOf()[0]?.id ?? null);
    this.flash(`view: ${id}`);
  }
  private refresh(): void { this.glide(); this.H.refresh(); this.H.fit(); this.syncChrome(); }
  async undo(): Promise<void> {
    const cm = this.cmd();
    if (cm?.canUndo()) { await cm.undo(); this.refresh(); }
    this.syncSoon(); this.flash('undo');
  }
  async redo(): Promise<void> {
    const cm = this.cmd();
    if (cm?.canRedo()) { await cm.redo(); this.refresh(); }
    this.syncSoon(); this.flash('redo');
  }
  /** ADD: one call — addWidget() creates the node, auto-positions it into the
   *  first free hole and commits node + membership as ONE undoable step. */
  addWidget(kind: string): string | null {
    if (Date.now() - this.lastPaletteGestureAt < 400) return null; // that click was a drag
    const p = PALETTE[kind];
    if (!p) return null;
    const view = this.H.activeView;
    this.glide();
    const w = this.H.addWidget({ ...p } as DashboardWidgetSpec, view);
    if (!w) { this.flash(`no room for a ${p.kind} on ${view} — the fit board is full`); return null; }
    this.setFocus(w.id);
    this.flash(`added ${p.kind} → ${view} (auto-positioned)`);
    return w.id;
  }
  /** Palette DRAG-IN: the kit's beginPaletteDrag on the binder (the documented
   *  escape hatch). The carrier node never enters the model; dropIn() adds. */
  beginPaletteDrag(kind: string, e: PointerEvent, btn: HTMLElement): void {
    if (e.button !== 0) return;
    const p = PALETTE[kind];
    const binder = this.H.binderOf() as unknown as { beginPaletteDrag?(n: NodeModel, o: object, e: PointerEvent): void } | undefined;
    if (!p || !binder?.beginPaletteDrag) return;
    const node = new NodeModel({ type: 'widget', size: { width: 120, height: 90, depth: 0 } } as never);
    (node as unknown as { __palette: Omit<DashboardWidgetSpec, 'id'> }).__palette = p;
    const chip = btn.cloneNode(true) as HTMLElement;
    chip.style.width = `${btn.offsetWidth}px`;
    binder.beginPaletteDrag(node, { w: p.span, h: p.rows, chip }, e);
  }
  private dropIn(node: unknown, cell: { x: number; y: number; w: number; h: number }, target: { boardId?: string } | undefined, displaced: unknown): void {
    const p = (node as { __palette?: Omit<DashboardWidgetSpec, 'id'> }).__palette;
    if (!p) return;
    const boardId = target?.boardId ?? this.H.activeView;
    const w = this.H.addWidget({ ...p, x: cell.x, y: cell.y, span: cell.w, rows: cell.h } as DashboardWidgetSpec, boardId, { displaced } as never);
    if (!w) return;
    this.setFocus(w.id);
    this.flash(`dropped ${p.kind} into ${boardId} at column ${cell.x + 1}, row ${cell.y + 1}`);
  }
  /** REMOVE: ONE undoable batch — membership + node + the survivors' re-pack. */
  removeWidget(id: string, displaced?: unknown): void {
    const w = this.H.widget(id);
    if (!w) return;
    this.glide();
    w.remove(displaced as never);
    this.setFocus(this.focus === id ? null : this.focus);
    this.flash('removed widget (survivors re-packed)');
  }
  private focused(): string | null {
    if (!this.focus) this.flash('focus a tile first');
    return this.focus;
  }
  togglePin(): void {
    const id = this.focused();
    const w = id ? this.H.widget(id) : undefined;
    if (!w) return;
    w.pin();
    this.syncChrome();
    this.syncSoon();
    this.flash(w.pinned ? 'pinned (keeps its cells; drags onto it refused)' : 'unpinned');
  }
  bringToFront(): void { const id = this.focused(); if (id) { this.H.widget(id)?.bringToFront(); this.syncSoon(); this.flash('brought to front'); } }
  sendToBack(): void { const id = this.focused(); if (id) { this.H.widget(id)?.sendToBack(); this.syncSoon(); this.flash('sent to back'); } }
  removeFocused(): void { const id = this.focused(); if (id) this.removeWidget(id); }
  /** RESIZE (toolbar): cycle the focused tile's row span 1→2→3→1. */
  async cycleRows(): Promise<void> {
    const id = this.focused();
    const w = id ? this.H.widget(id) : undefined;
    if (!w?.cell) return;
    const rows = w.cell.h >= 3 ? 1 : w.cell.h + 1;
    const ok = await w.resize(w.cell.w, rows);
    this.syncSoon();
    this.flash(ok ? `resized → ${rows} row${rows > 1 ? 's' : ''} tall (neighbours pushed live)` : 'resize refused (pinned neighbour?)');
  }
  toggleFloat(): void {
    this.floatMode = !this.floatMode;
    this.glide();
    this.H.setFloat(this.floatMode);
    this.flash(this.floatMode ? 'Float ON: widgets stay wherever you put them - gaps are legal' : 'Float OFF: gravity packs widgets upward');
  }
  /** fit keeps every board at its design height and squeezes rows; grow keeps
   *  the 130px row and extends the board downward. */
  toggleSizing(): void {
    this.sizingMode = this.sizingMode === 'fit' ? 'grow' : 'fit';
    this.glide();
    this.H.setSizing(this.sizingMode);
    if (this.sizingMode === 'fit') this.H.fit();
    this.flash(this.sizingMode === 'fit'
      ? 'FIT: boards keep their height — rows squeeze so everything stays visible'
      : 'GROW: rows keep their height — boards extend downward (camera refits)');
  }
  setLayout(mode: 'grid' | 'split'): void {
    this.layoutMode = mode;
    this.H.setLayout(mode);
    this.syncSoon();
    this.flash(mode === 'split'
      ? 'split layout — every widget covers its slot; drag a divider, drop a widget on an edge, add one and it halves the largest'
      : 'grid layout — cells, spans and push');
  }

  // ---- version history: every Save is a version you can go back to --------
  /** A TRUE-VECTOR picture of the visible board, scoped with exportIds(). */
  private thumbOf(): string | null {
    try {
      const { svg } = (this.instance as unknown as { exportSvgString(o: object): { svg: string } })
        .exportSvgString({ includeIds: this.H.exportIds(), padding: 4 });
      return svg;
    } catch { return null; }
  }
  private captureVersion(opts: { auto?: boolean } = {}): Version {
    const s = this.H.toJSON();
    const n = ++this.versionSeq;
    const v: Version = {
      id: `v${n}`, n, at: Date.now(), auto: !!opts.auto,
      board: s, views: s.views, sizing: s.sizing ?? this.sizingMode, float: s.float ?? this.floatMode,
      view: this.H.activeView, thumb: this.thumbOf(),
    };
    this.history.unshift(v);
    if (this.history.length > MAX_VERSIONS) this.history.length = MAX_VERSIONS;
    this.currentVersion = v.id;
    this.persist();
    return v;
  }
  /** Bank only if the board differs from THE VERSION IT CAME FROM. */
  private captureIfChanged(opts: { auto?: boolean }): Version | null {
    const anchor = this.history.find((v) => v.id === this.currentVersion) ?? this.history[0];
    if (anchor && JSON.stringify(anchor.views) === JSON.stringify(this.H.toJSON().views)) return null;
    return this.captureVersion(opts);
  }
  private shedNote(): string {
    const s = this.lastShed;
    this.lastShed = null;
    return s ? ` · ⚠ storage full, dropped the oldest ${s}` : '';
  }
  private persist(): boolean {
    if (!this.canStore) return false;
    const store = () => localStorage.setItem(HISTORY_KEY, JSON.stringify({ seq: this.versionSeq, versions: this.history }));
    try { store(); return true; } catch { /* full — shed and retry */ }
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (!this.history[i].thumb) continue;
      this.history[i].thumb = null;
      try { store(); this.lastShed = 'thumbnails'; return true; } catch { /* keep shedding */ }
    }
    while (this.history.length > 1) {
      this.history.pop();
      try { store(); this.lastShed = 'versions'; return true; } catch { /* keep shedding */ }
    }
    this.lastShed = 'versions';
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* nothing more to do */ }
    return false;
  }
  /** Read the drawer back on boot — silently. */
  private restoreHistory(): void {
    if (!this.canStore) return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { seq?: number; versions?: Version[] };
      if (!Array.isArray(data?.versions)) return;
      this.history = data.versions.filter((v) => v && Array.isArray(v.views) && v.id);
      this.versionSeq = Number(data.seq) || this.history.reduce((m, v) => Math.max(m, v.n || 0), 0);
    } catch { this.history = []; }
  }
  /** Mount a version's data: toJSON() output IS dashboard() input. */
  private applyVersion(v: Version): void {
    if (!this.instance) return;
    this.glide();
    const active = this.H.views.includes(v.view) ? v.view : this.H.activeView;
    this.H.dispose();
    this.sizingMode = v.sizing ?? this.sizingMode;
    this.floatMode = v.float ?? this.floatMode;
    this.layoutMode = (v.board as { layout?: 'grid' | 'split' })?.layout ?? this.layoutMode;
    this.spec = this.buildSpec(v.views);
    this.H = this.spec.handle;
    // Reconcile the model to the rebuilt spec (same ids → the same hosts).
    this.instance.setNodes(this.spec.nodes as never);
    (this.spec as unknown as { finalize(api: unknown): void }).finalize(this.instance);
    this.cmd()?.clear(); // a load is not an undoable edit
    this.afterMount(active);
  }
  restoreVersion(id: string): void {
    const v = this.history.find((x) => x.id === id);
    if (!v) { this.flash('that version is gone'); return; }
    this.captureIfChanged({ auto: true });
    this.applyVersion(v);
    this.currentVersion = v.id;
    this.flash(`restored ${v.id} · ${widgetCount(v)} widgets · saved ${relTime(v.at)}${this.shedNote()}`);
  }
  save(): void {
    const v = this.captureVersion();
    const bytes = JSON.stringify(v.views).length;
    this.flash(`saved ${v.id} · ${widgetCount(v)} widgets · ${bytes.toLocaleString()} bytes${this.shedNote()}`);
  }
  load(): void {
    if (!this.history.length) { this.flash('nothing saved yet'); return; }
    this.restoreVersion(this.history[0].id);
  }
  toggleHistory(on?: boolean): void {
    this.historyOpen = on ?? !this.historyOpen;
    this.H.showView(this.H.activeView);
    this.flash(this.historyOpen ? `versions: ${this.history.length} saved` : 'versions closed');
  }
  clearHistory(): void {
    this.history = [];
    this.currentVersion = null;
    this.persist();
    this.flash('version history cleared');
  }
  get isHistoryOpen(): boolean { return this.historyOpen; }
}
