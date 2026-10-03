/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The marketing automation studio's behaviour — translated line for line from
 * the setup() of demos/interaction/marketing-automation.html, so the React,
 * Vue, Angular and Qwik versions share ONE copy instead of four drifting ones.
 *
 * This controller owns the engine side: the computed layout and its animated
 * re-flow, the cards, lines and branch chips, the world-space "+" buttons, the
 * snapshot history on the engine's own CommandManager, the keyboard, the card
 * pan, the navigator's minimap, and the Test flow's token, ticks and clock.
 * The framework file owns the chrome — the top bar, the property panel, the
 * step menu, the dialogs, the toast and the navigator's controls — and renders
 * it from `MaUi`, a fresh plain object handed over through `onChange(ui)` on
 * every change.
 *
 * The library workarounds the JS page needs are kept here, each where it bites:
 * a keydown listener registered BEFORE the diagram (hookKeys) owns Delete;
 * edge ids encode both endpoints, so an edge id never changes endpoints; a
 * port that moved is removed and re-added under the same id; resizing is
 * switched off after every setNodes; a straight line gets a collinear midpoint
 * as a manual waypoint so the router never detours it; chip label fractions
 * are recomputed every frame; an undo awaits the last commandManager.execute;
 * the minimap is standalone, refreshed from model events, moved into the card.
 *
 * (Copied verbatim next to the demo in each app — keep the copies identical.)
 */
import { Command, PortModel } from '@grafloria/engine';
import { createMiniMap, createViewportPortal } from '@grafloria/element';
import * as M from './marketing-automation-model';
import type { Automation, Box, Contact, Kind, LayoutEdge, Layout, Pt, RunEvent, RunPlan, Slot, Step } from './marketing-automation-model';
import {
  injectIconCss, ico, esc, lineStyle, chipStyle, cardContent, noteContent, measure, disposeMeasure,
  portsFor, FIELDS, SUBTITLE, type FieldDef, type PortSpec,
} from './marketing-automation-view';

const { G, KINDS } = M;
const STORE_KEY = 'grafloria.marketing-automation.v1';
const NOTE = 'note';
const darkQuery = () => matchMedia('(prefers-color-scheme: dark)');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- the diagram's options (the JS page's render() call) -----------------------
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;
export const INTERACTION = {
  portVisibility: 'hidden', enableLinkReconnection: false, showLinkEndpointHandles: false, enableWaypointEditing: false,
  enableControlPointEditing: false, enableInPlaceTextEdit: false, enableSmartAutoConnect: false, enableProximityConnect: false,
};
// Branch paths SHARE their horizontal run under the Branch on purpose —
// nudging them onto separate lanes would undo the fan-out.
export const RENDERER = { channelNudging: false, parallelLinks: false };
/** The same three, as one render() options object (Angular's <grafloria-diagram>). */
export const RENDER_OPTIONS = { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, interaction: INTERACTION, renderer: RENDERER };

// ---- what the chrome paints: plain data, safe for any framework's store --------
export interface MenuItemUi { key: string; label: string; desc: string; icon: string; tone: string; search: string; hidden: boolean; active: boolean }
export interface MenuGroupUi { group: string; hidden: boolean; items: MenuItemUi[] }
export interface MenuUi { mode: 'steps' | 'criteria'; placeholder: string; q: string; groups: MenuGroupUi[]; empty: boolean; left: number; top: number }
export interface PickUi { armId: string; label: string; sub: string }
export type DialogUi =
  | { kind: 'delete'; stepId: string; title: string; text: string; picks: PickUi[]; allLabel: string }
  | { kind: 'new' }
  | { kind: 'test'; picked: string; contacts: Contact[] };
export interface FieldUi {
  key: string; label: string; type: 'select' | 'text' | 'number' | 'textarea'; value: string;
  options: Array<[string, string]>; min?: number; placeholder?: string; hint: string;
}
export interface ArmUi { id: string; label: string; isDefault: boolean; value: string; options: Array<[string, string]>; removable: boolean }
export interface LogRowUi { n: number; kind: string; icon: string; tone: string; clock: string; text: string }
export type PanelUi =
  | { view: 'none'; rev: number }
  | { view: 'overview'; rev: number; steps: number; paths: number; wait: string; description: FieldUi }
  | {
      view: 'step'; rev: number; stepId: string; tone: string; icon: string; name: string; sub: string; sec: string;
      fields: FieldUi[]; delay: { amount: string; unit: string } | null; arms: ArmUi[] | null; del: string | null;
    }
  | { view: 'run'; rev: number; contact: Contact; clock: string; state: string; done: boolean; log: LogRowUi[] };
export interface MaUi {
  /** The automation's name in the top bar. */
  title: string;
  status: string;
  live: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The zoom, in percent (the navigator's slider and readout). */
  zoom: number;
  mapShown: boolean;
  menu: MenuUi | null;
  dialog: DialogUi | null;
  toast: string | null;
  /** `rev` changes whenever the JS page would re-render the panel's HTML. */
  panel: PanelUi;
}
export function initialUi(): MaUi {
  return { title: '', status: 'Draft', live: false, canUndo: false, canRedo: false, zoom: 100, mapShown: true,
    menu: null, dialog: null, toast: null, panel: { view: 'none', rev: 0 } };
}
export const DELAY_UNITS = M.DELAY_UNITS;

interface Plus {
  key: string; portal: any; btn: HTMLButtonElement; x: number; y: number;
  kind?: 'insert' | 'add'; slot?: Slot; edge?: LayoutEdge; anchor?: string; branchId?: string;
}
interface MenuDef { key: string; label: string; desc: string; icon: string; tone: string; search: string }
interface MenuCtx {
  mode: 'steps' | 'criteria'; anchorEl: HTMLElement; slot?: Slot; at?: Pt;
  groups: Array<{ group: string; list: MenuDef[] }>; q: string; active: string | null; left: number; top: number;
}
interface Run {
  token: number; active: boolean; status: Record<string, string>; wait: Record<string, string>; links: Record<string, string>;
  arms: Set<string>; path: string[]; contact: Contact | null; plan: RunPlan | null; ticks: number; speed: number; log: RunEvent[];
  clock: number; state: { text: string; done: boolean }; tokenAt?: { x: number; y: number; edge: string };
}
const freshRun = (): Run => ({ token: 0, active: false, status: {}, wait: {}, links: {}, arms: new Set(), path: [], contact: null, plan: null,
  ticks: 0, speed: 1, log: [], clock: 9 * 60, state: { text: 'Running…', done: false } });
const LOG_ICON: Record<string, [string, string]> = { trigger: ['flag', 'indigo'], end: ['check', 'green'] };
const UNIT: Record<string, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };

/** Every edit is ONE snapshot command on the engine's own stack. */
class SnapshotCommand extends Command {
  private fresh = true;
  constructor(private owner: MarketingAutomation, name: string, readonly before: Automation, readonly after: Automation) { super(name); }
  execute(): void { if (this.fresh) { this.fresh = false; return; } this.owner.applySnapshot(this.after); }
  undo(): void { this.owner.applySnapshot(this.before); }
  redo(): void { this.owner.applySnapshot(this.after); }
  serialize() { return { id: this.id, name: this.name, timestamp: this.timestamp, data: { before: this.before, after: this.after } }; }
}

export class MarketingAutomation {
  /** The chrome's state as of the last change. */
  ui: MaUi = initialUi();
  /** Called with a fresh `MaUi` on every change; set by the framework. */
  onChange: (ui: MaUi) => void = () => {};

  // ---- engine side -------------------------------------------------------------
  private api: any = null;
  private model: any = null;
  private engine: any = null;
  private cm: any = null;
  private stage!: HTMLElement;   // #stage — the top bar, #canvas and #ma-panel
  private host!: HTMLElement;    // #canvas — the diagram and the chrome over it
  private htmlLayer!: HTMLElement;
  private offs: Array<() => void> = [];
  private gen = 0;               // every init/teardown bumps it; older async work stops

  // ---- the automation and its drawing -----------------------------------------------
  private state: Automation = M.sampleAutomation();
  private noteCollapsed = false;
  private L: Layout | null = null;           // the last computed layout
  private cur: Record<string, Box> = {};     // id → box as drawn right now (mid-animation too)
  private target: Record<string, Box> = {};  // id → box where the layout wants it
  private tween: { raf: number } | null = null;
  private fresh = new Set<string>();         // cards that just appeared (a short fade-in)
  private idleWaiters: Array<() => void> = [];
  private pluses = new Map<string, Plus>();
  private lastExec: Promise<unknown> = Promise.resolve();
  private live: { name: string; before: Automation } | null = null;
  private published = false;
  private statusText = 'Draft';
  private statusLive = false;
  private selectedId: string | null = null;
  private testView = false;
  private panelRev = 0;
  private panelCache: { key: string; ui: PanelUi } | null = null;
  private menuCtx: MenuCtx | null = null;
  private dialog: DialogUi | null = null;
  private toastText: string | null = null;
  private toastTimer: any = 0;
  private cardPan: { x: number; y: number; moving: boolean } | null = null;
  private panned = false;
  private mini: any = null;
  private miniQueued = false;
  private mapShown = true;
  private zoomPct = 100;
  private RUN: Run = freshRun();
  private tokenPortal: any = null;
  private lastTick: any = null;
  private panJob = 0;
  private pickedContact = M.CONTACTS[0].id;

  private box = (id: string): Box => this.cur[id] || this.target[id];
  private heightOf = (s: Step): number => (s.kind === 'trigger' ? measure(cardContent(s), G.TRIGGER_W) : G.CARD_H);
  private $ = (id: string): HTMLElement | null => this.stage?.querySelector(`#${id}`) ?? null;

  // ---- keyboard: registered BEFORE the diagram -----------------------------------
  /**
   * A key event dispatched on window itself runs its listeners in REGISTRATION
   * order (capture or not), and the engine's own Delete must never run before
   * the tree has had its say — so the framework calls this before the diagram
   * mounts. Returns the unhook.
   */
  hookKeys(): () => void {
    const on = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }

  /** Mount on a fresh instance: `stage` holds the top bar, #canvas and #ma-panel. Safe to call again. */
  init(instance: any, stage: HTMLElement): Promise<void> {
    this.teardown();
    const gen = this.gen;
    injectIconCss();
    this.api = instance;
    this.model = instance.getModel();
    this.engine = instance.getEngine();
    this.cm = this.engine.commandManager;
    this.stage = stage;
    this.host = stage.querySelector('#canvas') as HTMLElement;
    this.state = M.sampleAutomation();
    this.noteCollapsed = false;
    this.L = null; this.cur = {}; this.target = {}; this.tween = null;
    this.fresh.clear(); this.pluses.clear(); this.idleWaiters = [];
    this.lastExec = Promise.resolve(); this.live = null;
    this.published = false; this.statusText = 'Draft'; this.statusLive = false;
    this.selectedId = null; this.testView = false; this.menuCtx = null; this.dialog = null; this.toastText = null; this.panelCache = null;
    this.RUN = freshRun(); this.lastTick = null; this.pickedContact = M.CONTACTS[0].id;
    const api = instance, model = this.model, host = this.host;

    // The run animates lines — battery saver must not still them.
    api.animations.updateConfig({ respectBatteryStatus: false, batterySavingMode: false });
    // A builder keeps its words at every zoom: widen every LOD tier to draw everything.
    try {
      const cfg = model.getLODConfig();
      const all = new Set<unknown>();
      for (const t of cfg.tiers) for (const f of t.features) all.add(f);
      for (const t of cfg.tiers) for (const f of all) t.features.add(f);
      model.setLODConfig(cfg);
    } catch { /* an engine without LOD config draws everything anyway */ }
    this.htmlLayer = host.querySelector('.grafloria-html-layer') as HTMLElement;

    // ---- the chrome over the canvas keeps its pointer, wheel and double-click ----
    const stop = (e: Event) => e.stopPropagation();
    for (const el of Array.from(host.querySelectorAll('.ma-nav, #ma-menu, #ma-dialog, #ma-toast'))) {
      for (const t of ['pointerdown', 'mousedown', 'wheel', 'dblclick']) {
        el.addEventListener(t, stop);
        this.offs.push(() => el.removeEventListener(t, stop));
      }
    }

    // ---- history: the toolbar follows the engine's stack ---------------------------
    for (const ev of ['command:executed', 'command:undone', 'command:redone', 'command:history-cleared']) {
      this.track(this.engine.eventBus.on(ev, () => setTimeout(() => { if (gen === this.gen) this.refreshUndo(); }, 0)));
    }

    // ---- selection drives the panel -----------------------------------------------
    this.track(api.on('selection:change', ({ nodes }: any) => {
      const id = nodes.length === 1 && this.state.steps[nodes[0].id] ? nodes[0].id : null;
      if (id === this.selectedId) return;
      this.commitLive();
      this.selectedId = id;
      if (!this.testView) this.renderPanel();
    }));

    // The step menu closes on any press outside it (and its "+").
    this.listen(document, 'pointerdown', (e: Event) => {
      const menu = this.$('ma-menu'), t = e.target as Node;
      if (this.menuCtx && menu && !menu.contains(t) && !this.menuCtx.anchorEl.contains(t)) this.closeMenu();
    }, true);

    // The layout owns where cards go, so a drag that starts ON a card pans the
    // canvas (a drag on empty canvas already does).
    this.listen(host, 'pointerdown', (e: Event) => {
      const pe = e as PointerEvent;
      this.panned = false;
      if (pe.button !== 0 || !(pe.target instanceof Element)) return;
      const g = pe.target.closest('[data-node-id]');
      this.cardPan = g && g.closest('svg.grafloria-diagram') ? { x: pe.clientX, y: pe.clientY, moving: false } : null;
    });
    this.listen(window, 'pointermove', (e: Event) => {
      const pe = e as PointerEvent, cp = this.cardPan;
      if (!cp) return;
      if (!(pe.buttons & 1)) { this.cardPan = null; return; }
      if (!cp.moving && Math.hypot(pe.clientX - cp.x, pe.clientY - cp.y) < 5) return;
      cp.moving = this.panned = true;
      api.viewport.panByScreenDelta(cp.x - pe.clientX, cp.y - pe.clientY);
      cp.x = pe.clientX; cp.y = pe.clientY;
      api.renderNow();
    });
    this.listen(window, 'pointerup', () => { this.cardPan = null; });

    // Clicks inside cards: the trigger's chip × and "Add criteria", the note's chevron.
    this.listen(host, 'click', (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || this.panned) return;
      const x = t.closest('.ma-chip-x');
      if (x) {
        const key = Array.from(x.classList).find((c) => c.startsWith('ma-x-'))?.slice(5);
        if (key && M.CRITERIA[key]) this.edit(`Remove criterion: ${M.CRITERIA[key].label}`, (s) => { s.steps[s.rootId].props[key] = ''; });
        return;
      }
      const add = t.closest('.ma-addcrit') as HTMLElement | null;
      if (add) { this.openMenu('criteria', add, {}); return; }
      if (t.closest('.ma-note-head')) { this.noteCollapsed = !this.noteCollapsed; this.sync({ animate: true }); }
    });

    // ---- the navigator: a standalone minimap, moved into the card -------------------
    const dark = darkQuery().matches;
    const root = host.querySelector('.grafloria-diagram-root') as HTMLElement;
    const mini = createMiniMap(root, api.viewport, () => model, {
      placement: 'none', showLinks: true, padding: 60, ariaLabel: 'Minimap — click or drag to move the view',
      linkColor: dark ? 'rgba(150,160,185,.55)' : 'rgba(120,130,150,.6)',
      maskColor: dark ? 'rgba(139,156,242,.16)' : 'rgba(59,82,217,.1)', maskStroke: dark ? '#8b9cf2' : '#3b52d9',
      nodeColor: (n: any) => {
        const s = this.state.steps[n.id];
        if (n.id === NOTE) return dark ? '#343a64' : '#dfe3fb';
        if (!s) return 'transparent';
        if (this.RUN.status[n.id] === 'done') return dark ? '#3ccf7e' : '#7fd3a2';
        return s.kind === 'branch' ? (dark ? '#6a5321' : '#f0cf8e') : n.isSelected() ? '#3b52d9' : (dark ? '#4a5266' : '#c3cad8');
      },
    } as any);
    this.mini = mini;
    (host.querySelector('.ma-nav-mini') ?? host.querySelector('#ma-nav-map'))?.appendChild(mini.portal.element);
    const refreshMini = () => {
      if (this.miniQueued) return;
      this.miniQueued = true;
      requestAnimationFrame(() => { this.miniQueued = false; if (gen === this.gen) mini.refresh(); });
    };
    for (const ev of ['node:added', 'node:removed', 'node:changed', 'link:added', 'link:removed', 'selection:changed']) this.track(model.on(ev, refreshMini));
    this.track(api.viewport.onChange(() => this.showZoom()));
    // A narrow canvas (the gallery's side panels open) starts with the map folded.
    this.mapShown = host.getBoundingClientRect().width >= 720;

    // ---- the Test flow's token: a world-space portal that rides the lines -----------
    this.tokenPortal = createViewportPortal(this.htmlLayer, { className: 'ma-token-host' });
    this.tokenPortal.element.innerHTML = '<div class="ma-token"></div>';
    this.tokenPortal.element.style.pointerEvents = 'none';
    this.tokenPortal.element.hidden = true;

    // ---- the scheme can flip live: model styles follow it ------------------------------
    const mq = darkQuery();
    const onScheme = () => { if (this.L) this.sync({ animate: false }); };
    mq.addEventListener?.('change', onScheme);
    this.offs.push(() => mq.removeEventListener?.('change', onScheme));

    this.sync({ animate: false });
    this.showZoom(false);
    this.frameView();
    this.renderPanel();
    this.refreshUndo();
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }

  /** Unmount: listeners off, the run stopped, the portals and the measuring twin gone. */
  destroy(): void {
    this.teardown();
    this.api = null;
    disposeMeasure();
  }

  private teardown(): void {
    this.gen++;
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* already gone */ } }
    cancelAnimationFrame(this.tween?.raf ?? 0);
    this.tween = null;
    this.RUN.token++;
    this.panJob++;
    clearTimeout(this.toastTimer);
    for (const p of this.pluses.values()) { try { p.portal.dispose(); } catch { /* the layer went with the diagram */ } }
    this.pluses.clear();
    try { this.tokenPortal?.dispose(); } catch { /* idem */ }
    try { this.lastTick?.dispose(); } catch { /* idem */ }
    try { this.mini?.dispose(); } catch { /* idem */ }
    this.tokenPortal = null; this.lastTick = null; this.mini = null;
  }
  private track(off: unknown): void { if (typeof off === 'function') this.offs.push(off as () => void); }
  private listen(target: EventTarget, type: string, fn: (e: Event) => void, capture = false): void {
    target.addEventListener(type, fn, capture);
    this.offs.push(() => target.removeEventListener(type, fn, capture));
  }
  /** Run `fn` once the framework has painted what `ready()` waits for (a few frames at most). */
  private whenReady(ready: () => boolean, fn: () => void, tries = 90): void {
    const gen = this.gen;
    const tick = (n: number) => {
      if (gen !== this.gen) return;
      if (ready()) fn();
      else if (n > 0) requestAnimationFrame(() => tick(n - 1));
    };
    tick(tries);
  }
  /** Run `fn` once the panel shows its latest render. */
  private afterPanel(fn: (panel: HTMLElement) => void): void {
    const want = String(this.panelRev);
    this.whenReady(() => this.$('ma-panel')?.querySelector('.ma-p-head')?.getAttribute('data-rev') === want, () => fn(this.$('ma-panel')!));
  }

  // ---- what the chrome paints ------------------------------------------------------
  private emit(): void {
    if (!this.api) return;
    this.ui = {
      title: this.state.title,
      status: this.statusText,
      live: this.statusLive,
      canUndo: !!this.cm?.canUndo(),
      canRedo: !!this.cm?.canRedo(),
      zoom: this.zoomPct,
      mapShown: this.mapShown,
      menu: this.menuCtx ? this.menuUi(this.menuCtx) : null,
      dialog: this.dialog,
      toast: this.toastText,
      panel: this.panelUi(),
    };
    this.onChange(this.ui);
  }
  private toast(text: string): void {
    this.toastText = text;
    this.emit();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastText = null; this.emit(); }, 2600);
  }

  // ---- layout + the animated re-flow -------------------------------------------------
  /** The note sits left of the trigger, clear of everything on the rows it spans. */
  private placeNote(lay: Layout): Box {
    const state = this.state;
    const h = measure(noteContent(state, this.noteCollapsed), G.NOTE_W);
    const trig = lay.boxes[state.rootId];
    const y0 = trig.y - 6, y1 = y0 + h;
    let minX = trig.x;
    const span = (top: number, bottom: number) => bottom > y0 - 24 && top < y1 + 24;
    for (const b of Object.values(lay.boxes)) if (span(b.y, b.y + b.h)) minX = Math.min(minX, b.x);
    for (const e of lay.edges) {
      const pts = M.routeOf(e, (id) => lay.boxes[id]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i];
        if (span(Math.min(a.y, c.y), Math.max(a.y, c.y))) minX = Math.min(minX, a.x, c.x);
      }
      if (e.kind === 'arm') { const m = M.armMarks(e, (id) => lay.boxes[id]); if (span(m.chip.y - 12, m.chip.y + 12)) minX = Math.min(minX, m.chip.x - 60); }
    }
    return { x: minX - G.NOTE_GAP - G.NOTE_W, y: y0, w: G.NOTE_W, h };
  }

  private nodeSpec(id: string, b: Box, pos: { x: number; y: number }): any {
    const s = this.state.steps[id];
    const base = { id, position: { x: pos.x, y: pos.y }, size: { width: b.w, height: b.h }, draggable: false };
    if (s) {
      return { ...base, selectable: true, shape: { type: 'rect', cornerRadius: 12 }, style: { selection: 'border' },
        metadata: { html: { content: cardContent(s, this.RUN.status[id], { fresh: this.fresh.has(id), wait: this.RUN.wait[id] }), padding: 0, interactive: s.kind === 'trigger' } },
        ports: portsFor(id, s.kind, b.w, b.h) };
    }
    if (id === NOTE) {
      return { ...base, selectable: false, shape: { type: 'rect', cornerRadius: 14 },
        metadata: { html: { content: noteContent(this.state, this.noteCollapsed), padding: 0, interactive: true } }, ports: [] };
    }
    return { ...base, selectable: false, shape: { type: 'rect', cornerRadius: 12 }, ports: portsFor(id, 'anchor', b.w, b.h) };
  }
  // Ports are built once per node; a card that changed height re-seats its
  // ports under the SAME ids, so its lines stay attached.
  private seatPorts(node: any, specs: PortSpec[]): void {
    for (const p of specs) {
      const have = node.getPort(p.id);
      const a = have?.layout?.args;
      if (have && a && a.x === p.layout.args.x && a.y === p.layout.args.y) continue;
      if (have) node.removePort(p.id);
      node.addPort(new PortModel({ id: p.id, type: p.type, side: p.side, shape: p.shape, layout: p.layout, isConnectableStart: false, isConnectableEnd: false } as any));
    }
  }
  private classesFor(id: string): string[] {
    const s = this.state.steps[id];
    if (s) return ['ma-n', `ma-n-${s.kind}`, ...(this.RUN.status[id] ? [`ma-s-${this.RUN.status[id]}`] : [])];
    return id === NOTE ? ['ma-n-note'] : ['ma-n-anchor'];
  }
  private setClasses(node: any, want: string[]): void {
    const have = [...(node.classes || [])];
    if (have.join(' ') !== want.join(' ')) node.setClasses(want);
  }

  /**
   * Draw the state: lay the tree out, reconcile the model's nodes and lines
   * (setNodes / setEdges), then glide everything to its new place.
   */
  private sync(opts: { animate?: boolean; spawn?: Pt } = {}): void {
    const api = this.api, model = this.model, state = this.state;
    const L = (this.L = M.computeLayout(state, this.heightOf));
    const noteBox = this.placeNote(L);
    const target = (this.target = { ...L.boxes, [NOTE]: noteBox });
    const order = [...M.orderedIds(state).filter((id) => id !== state.rootId), ...L.anchors.map((a) => a.id), NOTE, state.rootId];
    const animate = !!opts.animate && !reduced();
    const startOf = (id: string): { x: number; y: number } => {
      if (animate && this.cur[id]) return this.cur[id];
      const t = target[id];
      if (animate && opts.spawn && state.steps[id]) return { x: opts.spawn.x - t.w / 2, y: opts.spawn.y - t.h / 2 };
      return t;
    };
    const gen = this.gen;
    for (const id of order) {
      if (!model.getNode(id) && state.steps[id] && animate) {
        this.fresh.add(id);
        setTimeout(() => { if (gen !== this.gen) return; this.fresh.delete(id); this.paintStep(id); }, 420);
      }
    }
    const specs = order.map((id) => this.nodeSpec(id, target[id], startOf(id)));
    api.setNodes(specs);
    specs.forEach((sp) => {
      const n = model.getNode(sp.id);
      if (!n) return;
      n.behavior.resizable = false;   // the layout sizes the cards
      this.seatPorts(n, sp.ports);
      this.setClasses(n, this.classesFor(sp.id));
    });
    api.setEdges(L.edges.map((e) => ({ id: e.id, source: e.from, target: e.to,
      sourceHandle: e.kind === 'add' ? `${e.from}__add` : `${e.from}__out`, targetHandle: `${e.to}__in`,
      type: 'orthogonal', style: lineStyle(e.kind, this.RUN.links[e.id]) })));
    this.syncPluses();
    const next: Record<string, Box> = {};
    for (const id of order) next[id] = { ...startOf(id), w: target[id].w, h: target[id].h };
    this.cur = next;
    if (animate) this.tweenTo();
    else { cancelAnimationFrame(this.tween?.raf ?? 0); this.tween = null; this.cur = { ...target }; this.frame(); for (const r of this.idleWaiters.splice(0)) r(); }
    this.refreshUndo();
  }

  private tweenTo(): void {
    cancelAnimationFrame(this.tween?.raf ?? 0);
    const from: Record<string, Pt> = {};
    for (const [id, b] of Object.entries(this.cur)) from[id] = { x: b.x, y: b.y };
    const t0 = performance.now(), dur = 320;
    const me = (this.tween = { raf: 0 });
    const step = (now: number) => {
      if (this.tween !== me) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      for (const [id, to] of Object.entries(this.target)) {
        const f = from[id] || to;
        this.cur[id] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e, w: to.w, h: to.h };
      }
      try { this.frame(); } finally {
        if (k < 1) me.raf = requestAnimationFrame(step);
        else { this.tween = null; for (const r of this.idleWaiters.splice(0)) r(); }
      }
    };
    step(t0);
  }
  /** Resolves once the re-flow animation (if any) has landed. */
  idle(): Promise<void> { return this.tween ? new Promise((r) => this.idleWaiters.push(r)) : Promise.resolve(); }

  /** One frame: nodes to their drawn boxes; lines, chips, "+" and the note follow. */
  private frame(): void {
    const model = this.model, L = this.L!;
    for (const [id, b] of Object.entries(this.cur)) {
      const n = model.getNode(id);
      if (n && (n.position.x !== b.x || n.position.y !== b.y)) n.setPosition(b.x, b.y);
    }
    for (const e of L.edges) {
      const link = model.getLink(e.id);
      if (!link) continue;
      const pts = M.routeOf(e, this.box);
      // Always an explicit route: a bare two-point line would go to the
      // obstacle router, which happily detours a dashed stub round its own card.
      const drawn = pts.length > 2 ? pts : [pts[0], { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, pts[1]];
      link.setPoints(drawn);
      link.setMetadata('hasManualWaypoints', true);
      if (e.kind === 'arm') {
        const m = M.armMarks(e, this.box);
        link.setLabels([{ id: 'chip', text: e.label, position: M.fractionAt(pts, m.chip), offset: { x: 0, y: 0 }, style: chipStyle(this.RUN.arms.has(e.id)) }]);
      }
    }
    for (const p of this.pluses.values()) this.placePlus(p);
    this.api.renderNow();
  }

  // ---- the "+" buttons: world-space portals, keyed by the slot they insert at --
  private syncPluses(): void {
    const L = this.L!;
    const slotKey = (slot: Slot) => `${slot.parentId}|${slot.armId || ''}`;
    const want = new Map<string, Partial<Plus>>();
    for (const e of L.edges) {
      if (e.kind === 'spine') want.set(slotKey(e.slot!), { kind: 'insert', slot: e.slot, edge: e });
      else if (e.kind === 'arm' && !e.toEnd) want.set(slotKey(e.slot!), { kind: 'insert', slot: e.slot, edge: e });
    }
    for (const a of L.anchors) {
      if (a.role === 'end') want.set(slotKey(a.slot!), { kind: 'insert', slot: a.slot, anchor: a.id });
      else want.set(`add|${a.branchId}`, { kind: 'add', branchId: a.branchId, anchor: a.id });
    }
    for (const [key, p] of this.pluses) if (!want.has(key)) { p.portal.dispose(); this.pluses.delete(key); }
    for (const [key, w] of want) {
      let p = this.pluses.get(key);
      if (!p) {
        const portal = createViewportPortal(this.htmlLayer, { className: 'ma-plus-host' });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ma-plus';
        btn.innerHTML = ico('plus');
        // It opens a picker (or adds a path) for whatever slot it holds NOW.
        btn.setAttribute('data-gate-inert', '');
        portal.element.appendChild(btn);
        for (const t of ['pointerdown', 'mousedown', 'dblclick']) portal.element.addEventListener(t, (ev: Event) => ev.stopPropagation());
        const made: Plus = { key, portal, btn, x: 0, y: 0 };
        btn.addEventListener('click', () => this.onPlus(made));
        this.pluses.set(key, made);
        p = made;
      }
      // A slot can change shape (an empty path's end "+" becomes a line's "+"):
      // drop what the last layout said before taking this one's word for it.
      p.anchor = undefined; p.edge = undefined; p.slot = undefined; p.branchId = undefined;
      Object.assign(p, w);
      p.btn.classList.toggle('add', w.kind === 'add');
      p.btn.dataset['slot'] = key;
      const label = w.kind === 'add' ? 'Add another path to this Branch' : 'Insert a step here';
      p.btn.title = label;
      p.btn.setAttribute('aria-label', label);
    }
  }
  private placePlus(p: Plus): void {
    let pt: Pt | null;
    if (p.anchor) { const b = this.box(p.anchor); if (!b) return; pt = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
    else if (p.edge!.kind === 'arm') pt = M.armMarks(p.edge!, this.box).plus;
    else { const a = this.box(p.edge!.from), b = this.box(p.edge!.to); pt = { x: b.x + b.w / 2, y: (a.y + a.h + b.y) / 2 }; }
    if (!pt) return;
    p.x = pt.x; p.y = pt.y;
    p.portal.setPosition(pt.x - 11, pt.y - 11);
  }

  // ---- history: every edit is ONE snapshot command on the engine's stack ------
  /** Put a snapshot back (an undo, a redo). */
  applySnapshot(snap: Automation): void {
    this.state = M.clone(snap);
    this.stopRun(true);
    this.sync({ animate: true });
    this.markDirty();
    this.renderPanel();
  }
  private record(name: string, before: Automation): boolean {
    const after = M.clone(this.state);
    if (JSON.stringify(after) === JSON.stringify(before)) return false;
    this.markDirty();
    this.lastExec = Promise.resolve(this.cm.execute(new SnapshotCommand(this, name, before, after))).catch(() => {});
    return true;
  }
  // The command lands on the stack a few microtasks after execute() is called;
  // an undo pressed right after an edit must wait for it, or it would undo the
  // edit BEFORE that one.
  private async undoRedo(redo: boolean): Promise<void> {
    this.commitLive();
    await this.lastExec;
    await (redo ? this.engine.redo() : this.engine.undo());
    this.refreshUndo();
  }
  undo(): void { void this.undoRedo(false); }
  redo(): void { void this.undoRedo(true); }
  /** Mutate the state as ONE undoable edit, then re-flow. */
  private edit<T>(name: string, mutate: (s: Automation) => T, syncOpts: { spawn?: Pt } = {}): T {
    this.commitLive();
    const before = M.clone(this.state);
    const result = mutate(this.state);
    if (this.record(name, before)) { this.stopRun(true); this.sync({ animate: true, ...syncOpts }); this.renderPanel(); }
    return result;
  }
  private refreshUndo(): void { this.emit(); }

  // Live edits (typing in the panel) paint the card as you type and land in the
  // history as one step when the field is committed (blur / Enter / a pick).
  private liveEdit(name: string, mutate: (s: Automation) => void): void {
    if (!this.live) this.live = { name, before: M.clone(this.state) };
    mutate(this.state);
    this.stopRun(true);
    this.sync({ animate: false });
  }
  /** Land the field being typed in as one history step (blur / Enter / a pick). */
  commitLive(): void {
    if (!this.live) return;
    const { name, before } = this.live;
    this.live = null;
    this.record(name, before);
  }
  private markDirty(): void {
    this.statusText = this.published ? 'Unpublished changes' : 'Draft';
    this.statusLive = false;
  }

  // ---- selection drives the panel ---------------------------------------------
  private select(id: string | null): void {
    const model = this.model;
    model.clearSelection?.();
    const n = id && model.getNode(id);
    if (n) model.selectNode(n);
    this.selectedId = n ? id : null;
    this.api.renderNow();
    if (!this.testView) this.renderPanel();
  }
  private renderPanel(): void { this.panelRev++; this.emit(); }

  // ---- the step menu (the "+" and "Add criteria") -------------------------------
  private openMenu(mode: 'steps' | 'criteria', anchorEl: HTMLElement, mctx: { slot?: Slot; at?: Pt }): void {
    this.closeMenu();
    const root = this.state.steps[this.state.rootId];
    const groups = mode === 'criteria'
      ? [{ group: 'Add criteria', list: Object.entries(M.CRITERIA).filter(([k]) => { const v = root.props[k]; return v === '' || v == null; })
          .map(([k, c]) => ({ key: k, label: c.label, desc: 'Only enroll contacts that match', icon: 'flag', tone: 'indigo' })) }]
      : M.MENU_GROUPS.map((g) => ({ group: g, list: (Object.entries(KINDS) as Array<[Kind, M.KindInfo]>).filter(([, k]) => k.group === g)
          .map(([key, k]) => ({ key, label: k.label, desc: k.desc!, icon: k.icon, tone: k.tone })) }));
    const withSearch = groups.map((g) => ({ group: g.group, list: g.list.map((it) => ({ ...it, search: (it.label + ' ' + it.desc + ' ' + g.group).toLowerCase() })) }));
    const ctx: MenuCtx = { mode, ...mctx, anchorEl, groups: withSearch, q: '', active: null, left: -10000, top: 0 };
    this.menuCtx = ctx;
    this.filterMenu();
    anchorEl.setAttribute('aria-expanded', 'true');
    this.emit();
    // Placed beside its anchor once the framework has painted it (its size decides).
    const count = withSearch.reduce((n, g) => n + g.list.length, 0);
    this.whenReady(() => { const m = this.$('ma-menu'); return !!m && !m.hidden && m.querySelectorAll('.ma-mi').length === count; }, () => {
      if (this.menuCtx !== ctx) return;
      const menu = this.$('ma-menu')!;
      const hr = this.host.getBoundingClientRect(), r = anchorEl.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      let left = r.right - hr.left + 10;
      const top = r.top - hr.top - 18;
      if (left + mw > hr.width - 10) left = r.left - hr.left - mw - 10;
      ctx.left = Math.max(10, left);
      ctx.top = Math.max(10, Math.min(top, hr.height - mh - 10));
      menu.style.left = ctx.left + 'px';
      menu.style.top = ctx.top + 'px';
      this.emit();
      (this.$('ma-menu-q') as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
  }
  closeMenu(): void {
    if (!this.menuCtx) return;
    this.menuCtx.anchorEl.removeAttribute('aria-expanded');
    this.menuCtx = null;
    this.emit();
  }
  private visibleMenuKeys(ctx: MenuCtx): string[] {
    const q = ctx.q.trim().toLowerCase();
    return ctx.groups.flatMap((g) => g.list.filter((it) => !q || it.search.includes(q)).map((it) => it.key));
  }
  private filterMenu(): void {
    const ctx = this.menuCtx;
    if (ctx) ctx.active = this.visibleMenuKeys(ctx)[0] ?? null;
  }
  private menuUi(ctx: MenuCtx): MenuUi {
    const q = ctx.q.trim().toLowerCase();
    const groups = ctx.groups.map((g) => {
      const items = g.list.map((it) => ({ ...it, hidden: !!q && !it.search.includes(q), active: it.key === ctx.active }));
      return { group: g.group, hidden: items.every((i) => i.hidden), items };
    });
    return { mode: ctx.mode, placeholder: ctx.mode === 'criteria' ? 'Search criteria…' : 'Search steps…', q: ctx.q, groups,
      empty: groups.every((g) => g.hidden), left: ctx.left, top: ctx.top };
  }
  /** The menu's search box was typed in. */
  setMenuQuery(q: string): void {
    if (!this.menuCtx) return;
    this.menuCtx.q = q;
    this.filterMenu();
    this.emit();
  }
  /** ↑ / ↓ walk the visible steps, Enter picks, Escape closes (the search box's keydown). */
  menuKey(e: { key: string; preventDefault(): void }): void {
    const ctx = this.menuCtx;
    if (!ctx) return;
    const vis = this.visibleMenuKeys(ctx);
    const at = ctx.active ? vis.indexOf(ctx.active) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!vis.length) return;
      ctx.active = vis[(at + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length];
      this.emit();
      const key = ctx.active;
      this.whenReady(() => !!this.$('ma-menu')?.querySelector(`.ma-mi.active[data-key="${key}"]`),
        () => this.$('ma-menu')?.querySelector('.ma-mi.active')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (vis[at]) this.pickMenu(vis[at]);
    } else if (e.key === 'Escape') { e.preventDefault(); this.closeMenu(); }
  }
  /** A step (or a criterion) was picked in the menu. */
  pickMenu(key: string): void {
    const m = this.menuCtx;
    if (!m) return;
    this.closeMenu();
    if (m.mode === 'criteria') {
      this.edit(`Add criterion: ${M.CRITERIA[key].label}`, (s) => { s.steps[s.rootId].props[key] = M.CRITERIA[key].fallback; });
      this.select(this.state.rootId);
      this.afterPanel((panel) => (panel.querySelector(`[data-k="${key}"]`) as HTMLElement | null)?.focus());
      return;
    }
    if (!M.slotExists(this.state, m.slot!)) return;
    const id = this.edit(`Insert ${KINDS[key as Kind].label}`, (s) => M.insertStep(s, m.slot!, key as Kind), { spawn: m.at });
    if (id) this.select(id);
  }
  private onPlus(p: Plus): void {
    if (p.kind === 'add') {
      const armId = this.edit('Add a path', (s) => M.addArm(s, p.branchId!));
      this.select(p.branchId!);
      this.afterPanel((panel) => (panel.querySelector(`input[data-arm="${armId}"]`) as HTMLInputElement | null)?.select());
      return;
    }
    if (this.menuCtx && this.menuCtx.anchorEl === p.btn) { this.closeMenu(); return; }
    this.openMenu('steps', p.btn, { slot: p.slot, at: { x: p.x, y: p.y } });
  }

  // ---- dialogs -------------------------------------------------------------------
  private openDialog(d: DialogUi): void {
    this.dialog = d;
    this.emit();
    this.whenReady(() => { const el = this.$('ma-dialog'); return !!el && !el.hidden && el.querySelector('.ma-dlg')?.getAttribute('data-kind') === d.kind; },
      () => (this.$('ma-dialog')?.querySelector('[data-focus]') as HTMLElement | null)?.focus({ preventScroll: true }));
  }
  closeDialog(): void { if (!this.dialog) return; this.dialog = null; this.emit(); }
  /** A button in the open dialog: `act` is its data-act, `arg` the path / contact it names. */
  dialogAct(act: string, arg?: string): void {
    const d = this.dialog;
    if (!d) return;
    if (d.kind === 'delete') {
      if (act === 'cancel') { this.closeDialog(); return; }
      if (act === 'keep' || act === 'all') {
        this.closeDialog();
        const keep = act === 'keep' ? arg ?? null : null;
        this.edit(keep ? 'Delete Branch (keep a path)' : 'Delete Branch and its paths', (st) => M.deleteStep(st, d.stepId, keep));
        this.select(null);
      }
    } else if (d.kind === 'new') {
      this.closeDialog();
      if (act === 'new') this.startNew();
    } else if (d.kind === 'test') {
      if (act === 'cancel') this.closeDialog();
      else if (act === 'pick' && arg) { this.pickedContact = arg; this.dialog = { ...d, picked: arg }; this.emit(); }
      else if (act === 'run') { this.closeDialog(); void this.runTest(M.CONTACTS.find((c) => c.id === this.pickedContact)!); }
    }
  }

  // ---- delete --------------------------------------------------------------------
  private requestDelete(id: string): void {
    const state = this.state, s = state.steps[id];
    if (!s) return;
    if (s.kind === 'trigger') { this.toast('The trigger starts the automation — press New to start over.'); return; }
    if (s.kind !== 'branch') {
      this.edit(`Delete ${KINDS[s.kind].label}`, (st) => M.deleteStep(st, id));
      this.select(null);
      return;
    }
    const below = M.subtreeIds(state, id).length - 1;
    this.openDialog({
      kind: 'delete', stepId: id, title: s.title,
      text: `This Branch has ${s.arms!.length} paths and ${below} step${below === 1 ? '' : 's'} below it. Keep one path in its place, or delete everything below.`,
      picks: s.arms!.map((a) => {
        const n = M.subtreeIds(state, a.next).length;
        return { armId: a.id, label: a.label, sub: n ? `${n} step${n === 1 ? ' moves' : 's move'} up into its place` : 'an empty path' };
      }),
      allLabel: below ? `Delete it and the ${below} step${below === 1 ? '' : 's'} below` : 'Delete the Branch',
    });
  }

  // Keyboard: Delete / Backspace remove the selected step. Undo / Redo stay with
  // the engine's own binding (they reach the same command stack). Copy, paste,
  // cut and duplicate are refused: the layout owns where steps go.
  private onKey(e: KeyboardEvent): void {
    if (!this.api) return;
    const t = e.target;
    if (t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    if (e.key === 'Escape') { if (this.menuCtx) this.closeMenu(); if (this.dialog) this.closeDialog(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Never the engine's own delete: the tree decides what a delete means.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.dialog) return;
      const ids = this.model.getSelectedNodes().map((n: any) => n.id).filter((id: string) => this.state.steps[id]);
      if (ids.length === 1) this.requestDelete(ids[0]);
      else if (ids.length > 1) this.toast('Select one step to delete it.');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'd'].includes(e.key.toLowerCase())) e.stopImmediatePropagation();
    // ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Shift+Z, Ctrl+Y: the same engine undo stack the
    // engine's own binding drives — taken here so a just-made edit lands first.
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      void this.undoRedo(e.key.toLowerCase() === 'y' || e.shiftKey);
    }
  }

  // ---- the property panel ---------------------------------------------------------
  private longestWait(id: string | null, acc = 0): number {
    let best = acc;
    while (id) {
      const s: Step = this.state.steps[id];
      if (s.kind === 'delay') acc += (Number(s.props['amount']) || 0) * (UNIT[s.props['unit']] || 1440);
      best = Math.max(best, acc);
      if (s.kind === 'branch') { for (const a of s.arms!) best = Math.max(best, this.longestWait(a.next, acc)); break; }
      id = s.next;
    }
    return best;
  }
  /**
   * The panel as of its last render. Like the JS page's innerHTML, a form's
   * field values are written when the panel renders (`rev`), never while you
   * type — only its header line, and the test run's log and clock, are live.
   */
  private panelUi(): PanelUi {
    const RUN = this.RUN;
    if (this.testView && RUN.contact) return this.computePanel();
    const key = `${this.panelRev}|${this.selectedId ?? ''}`;
    if (this.panelCache?.key !== key) this.panelCache = { key, ui: this.computePanel() };
    const ui = this.panelCache.ui;
    if (ui.view !== 'step') return ui;
    const s = this.state.steps[ui.stepId];
    return s ? { ...ui, sec: s.kind === 'trigger' ? (M.TRIGGER_EVENTS[s.props['event']] || 'Trigger') : M.stepTitle(s) } : ui;
  }
  private computePanel(): PanelUi {
    const rev = this.panelRev, state = this.state, RUN = this.RUN;
    const field = (f: FieldDef, v: unknown): FieldUi => ({
      key: f.key, label: f.label, type: f.type, value: v == null ? '' : String(v),
      options: (f.options || []).map((o) => (Array.isArray(o) ? [String(o[0]), String(o[1])] : [String(o), String(o)]) as [string, string]),
      min: f.min, placeholder: f.placeholder, hint: f.hint,
    });
    if (this.testView && RUN.contact) {
      return { view: 'run', rev, contact: RUN.contact, clock: M.clockText(RUN.clock), state: RUN.state.text, done: RUN.state.done,
        log: RUN.log.map((ev, n) => {
          const [icon, tone] = LOG_ICON[ev.kind] || [KINDS[ev.kind as Kind].icon, KINDS[ev.kind as Kind].tone];
          return { n, kind: ev.kind, icon, tone, clock: M.clockText(ev.clock), text: ev.text };
        }) };
    }
    const s = this.selectedId ? state.steps[this.selectedId] : null;
    if (!s) {
      const steps = Object.keys(state.steps).length - 1;
      // Paths = the ends a contact can reach (every path ends in a "+").
      const ends = (id: string | null): number => {
        while (id) { const st: Step = state.steps[id]; if (st.kind === 'branch') return st.arms!.reduce((n, a) => n + ends(a.next), 0); id = st.next; }
        return 1;
      };
      const wait = this.longestWait(state.rootId);
      const waitText = !wait ? '—' : wait >= 1440 ? `${Math.round(wait / 144) / 10} d` : wait >= 60 ? `${Math.round(wait / 6) / 10} h` : `${wait} min`;
      return { view: 'overview', rev, steps, paths: ends(state.rootId), wait: waitText,
        description: field({ key: 'description', label: 'What it does', type: 'textarea', hint: 'Shown in the workflow description on the canvas.' }, state.description) };
    }
    const k = KINDS[s.kind];
    const fields: FieldUi[] = [];
    if (k.named) fields.push(field({ key: 'title', label: s.kind === 'branch' ? 'Question' : 'Step name', type: 'text', hint: 'Shown as the title on the card.' }, s.title));
    if (s.kind !== 'delay') for (const f of FIELDS[s.kind] || []) fields.push(field(f, s.props[f.key]));
    let arms: ArmUi[] | null = null;
    if (s.kind === 'branch') {
      const prop = M.BRANCH_PROPS[s.props['property']];
      arms = s.arms!.map((a) => ({
        id: a.id, label: a.label, isDefault: !!a.isDefault, value: a.value, removable: s.arms!.length > 1,
        options: [...(prop?.values || []), ...(prop?.values.some(([v]) => v === a.value) ? [] : [[a.value, a.value] as [string, string]])],
      }));
    }
    return {
      view: 'step', rev, stepId: s.id, tone: k.tone, icon: k.icon,
      name: s.kind === 'trigger' ? 'Trigger' : k.label, sub: SUBTITLE[s.kind],
      sec: s.kind === 'trigger' ? (M.TRIGGER_EVENTS[s.props['event']] || 'Trigger') : M.stepTitle(s),
      fields, arms,
      delay: s.kind === 'delay' ? { amount: String(s.props['amount'] ?? ''), unit: String(s.props['unit']) } : null,
      del: s.kind !== 'trigger' ? `Delete ${s.kind === 'branch' ? 'Branch' : 'step'}` : null,
    };
  }

  private editName(s: Step, key: string): string {
    return key === 'title' ? `Rename ${KINDS[s.kind].label}` : key === 'description' ? 'Edit description' : `Edit ${KINDS[s.kind].label}`;
  }
  /**
   * A field in the panel changed: `committed` is false while typing (an
   * `input` event) and true when it is committed (a `change` event).
   */
  panelInput(target: EventTarget | null, committed: boolean): void {
    const t = target as HTMLInputElement | null;
    if (!t || !(t instanceof Element) || !this.api) return;
    const stepId = (t.closest('[data-step]') as HTMLElement | null)?.dataset['step'];
    const s = stepId ? this.state.steps[stepId] : null;
    const k = t.dataset['k'], armId = t.dataset['arm'];
    if (k === 'description' && !s) {
      this.liveEdit('Edit description', (st) => { st.description = t.value; });
    } else if (s && k === 'property') {
      if (!committed) return;      // a structural pick: one step, then the rows redraw
      this.edit('Change what the Branch splits on', (st) => M.setBranchProperty(st, s.id, t.value));
      return;
    } else if (s && k) {
      const v: any = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
      if (k === 'amount' && s.kind === 'delay' && (v === '' || v < 1)) return;
      this.liveEdit(this.editName(s, k), (st) => { if (k === 'title') st.steps[s.id].title = v; else st.steps[s.id].props[k] = v; });
    } else if (s && armId) {
      const ak = t.dataset['ak'] as 'label' | 'value';
      this.liveEdit('Edit a path', (st) => { const a = st.steps[s.id].arms!.find((x) => x.id === armId); if (a) a[ak] = t.value; });
      if (ak === 'value' && committed) {
        // Picking a value names the path after it, unless it was renamed by hand.
        const b = this.state.steps[s.id];
        const a = b.arms!.find((x) => x.id === armId);
        const prop = M.BRANCH_PROPS[b.props['property']];
        const lab = prop?.values.find(([v]) => v === t.value)?.[1];
        const inp = this.$('ma-panel')?.querySelector(`input[data-arm="${armId}"]`) as HTMLInputElement | null;
        if (a && lab && inp && prop.values.some(([, l]) => l === a.label)) { this.liveEdit('Edit a path', () => { a.label = lab; }); inp.value = lab; }
      }
    } else return;
    if (committed) this.commitLive();
  }
  /** A button in the panel: `act` is its data-act, `arm` the path it names. */
  panelAct(act: string, arm?: string): void {
    const s = this.selectedId ? this.state.steps[this.selectedId] : null;
    if (act === 'delete' && s) this.requestDelete(s.id);
    else if (act === 'add-arm' && s) {
      const armId = this.edit('Add a path', (st) => M.addArm(st, s.id));
      this.afterPanel((panel) => (panel.querySelector(`input[data-arm="${armId}"]`) as HTMLInputElement | null)?.select());
    }
    else if (act === 'rm-arm' && s && arm) this.edit('Remove a path', (st) => M.removeArm(st, s.id, arm));
    else if (act === 'run-again' && this.RUN.contact) void this.runTest(this.RUN.contact);
    else if (act === 'run-pick') this.openTestDialog();
    else if (act === 'run-exit') this.exitTest();
  }
  /** The automation's name, typed in the top bar. */
  renameTitle(value: string): void { this.liveEdit('Rename the automation', (st) => { st.title = value; }); }

  // ---- Save / Load / New / Publish ---------------------------------------------------
  save(): void {
    this.commitLive();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ format: 'grafloria-marketing-automation', version: 1, savedAt: new Date().toISOString(), automation: this.state }));
      this.toast(`Saved “${this.state.title}” in this browser.`);
    } catch { this.toast('This browser refused to save (private mode?).'); }
  }
  load(): boolean {
    this.commitLive();
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { saved = null; }
    if (!saved || !M.isAutomation(saved.automation)) { this.toast('Nothing saved yet — press Save first.'); return false; }
    const before = M.clone(this.state);
    this.state = M.clone(saved.automation);
    this.record('Load the saved automation', before);
    this.stopRun(true);
    this.sync({ animate: true });
    this.select(null);
    const at = new Date(saved.savedAt);
    this.toast(`Loaded the version saved at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    return true;
  }
  private startNew(): void {
    this.commitLive();
    const before = M.clone(this.state);
    this.state = M.blankAutomation();
    this.record('New automation', before);
    this.stopRun(true);
    this.exitTest(false);
    this.select(null);
    this.sync({ animate: false });
    this.frameView();
    this.toast('Started over from a trigger — Undo brings the last one back.');
  }
  /** New: asks first (Undo brings the old one back). */
  askNew(): void { this.openDialog({ kind: 'new' }); }
  publish(): void {
    this.commitLive();
    this.published = true;
    this.statusText = 'Live';
    this.statusLive = true;
    this.toast(`Published — ${Object.keys(this.state.steps).length - 1} steps are live for new contacts.`);
  }

  // ---- the navigator: minimap + fit + zoom ---------------------------------------------
  private showZoom(emit = true): void {
    const z = Math.round(this.api.viewport.getZoom() * 100);
    if (z === this.zoomPct) return;
    this.zoomPct = z;
    if (emit) this.emit();
  }
  /** The zoom slider moved (percent). */
  setZoom(pct: number): void { this.api.viewport.setZoom(pct / 100); this.api.renderNow(); }
  toggleMap(): void {
    this.mapShown = !this.mapShown;
    this.emit();
    if (this.mapShown) this.whenReady(() => this.$('ma-nav-map')?.hidden === false, () => this.mini?.refresh());
  }
  contentBounds(): { x: number; y: number; width: number; height: number } {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of Object.values(this.target)) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  /** Put world (wx, wy) at the canvas centre at zoom z. */
  private centerView(wx: number, wy: number, z?: number): void {
    const vp = this.api.viewport;
    if (z) vp.setZoom(z);
    const v = vp.getViewport();
    vp.setViewport({ x: wx - v.width / 2, y: wy - v.height / 2, width: v.width, height: v.height });
    this.api.renderNow();
  }
  fitAll(): void { const b = this.contentBounds(); this.api.viewport.fitToBounds(b, 40, { maxZoom: 1 }); this.api.renderNow(); }
  fitWidth(maxZ = 1, minZ = 0.2): void {
    const b = this.contentBounds(), v = this.api.viewport.getViewport();
    const z = Math.max(minZ, Math.min(maxZ, (v.width - 60) / b.width));
    this.centerView(b.x + b.width / 2, b.y - 28 / z + v.height / z / 2, z);
  }
  // First look: the width of the flow from the top, never tiny — and when it
  // cannot all fit, the spine (trigger first) stays in the middle.
  private frameView(): void {
    this.fitWidth(0.95, 0.5);
    const b = this.contentBounds(), v = this.api.viewport.getViewport(), z = this.api.viewport.getZoom();
    if (b.width * z > v.width - 40) {
      const t = this.target[this.state.rootId];
      this.centerView(t.x + t.w / 2, b.y - 28 / z + v.height / z / 2, z);
    }
  }

  // ---- Test flow: plan the contact's run, then animate it ---------------------------------
  private paintStep(id: string): void {
    const s = this.state.steps[id], n = this.model.getNode(id);
    if (!s || !n) return;
    n.setMetadata('html', { content: cardContent(s, this.RUN.status[id], { fresh: this.fresh.has(id), wait: this.RUN.wait[id] }), padding: 0, interactive: s.kind === 'trigger' });
    this.setClasses(n, this.classesFor(id));
  }
  private markLink(id: string, mark: string | null): void {
    if (mark) this.RUN.links[id] = mark; else delete this.RUN.links[id];
    const e = this.L?.edges.find((x) => x.id === id), link = this.model.getLink(id);
    if (e && link) link.updateStyle(lineStyle(e.kind, mark ?? undefined));
  }
  /** Clear the last run's marks (a new run, an edit, leaving the test). */
  private stopRun(clearMarks: boolean): void {
    const RUN = this.RUN;
    RUN.token++;
    if (RUN.active) this.setRunState('Stopped — the flow changed', false);
    RUN.active = false;
    if (this.tokenPortal) this.tokenPortal.element.hidden = true;
    if (!clearMarks) return;
    const had = Object.keys(RUN.status).length || Object.keys(RUN.links).length;
    RUN.status = {}; RUN.wait = {}; RUN.arms.clear();
    for (const id of Object.keys(RUN.links)) this.markLink(id, null);
    RUN.links = {};
    if (had) { for (const id of Object.keys(this.state.steps)) this.paintStep(id); if (this.L) this.frame(); }
    if (had && !RUN.active && RUN.state.done) this.setRunState('Out of date — the flow changed', false);
  }
  private setRunState(text: string, done: boolean): void {
    this.RUN.state = { text, done };
    this.emit();
  }
  private setStatus(id: string, st: string | null, wait?: string): void {
    if (st) this.RUN.status[id] = st; else delete this.RUN.status[id];
    if (wait) this.RUN.wait[id] = wait; else delete this.RUN.wait[id];
    this.paintStep(id);
    this.api.renderNow();
  }
  /** Pan (animated) until a card is inside the free part of the canvas. */
  private reveal(id: string): void {
    const b = this.box(id);
    if (!b) return;
    const api = this.api, vp = api.viewport, vb = vp.getViewBox(), z = vp.getZoom();
    const m = 40 / z;
    const navH = 190 / z;
    if (b.x >= vb.x + m && b.x + b.w <= vb.x + vb.width - m && b.y >= vb.y + m && b.y + b.h <= vb.y + vb.height - navH) return;
    const from = vp.getViewport();
    const dx = (b.x + b.w / 2) - (vb.x + vb.width / 2), dy = (b.y + b.h / 2) - (vb.y + vb.height * 0.42);
    const t0 = performance.now(), dur = reduced() || this.RUN.speed < 0.2 ? 0 : 380, job = ++this.panJob;
    const f = (now: number) => {
      if (job !== this.panJob) return;
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      vp.setViewport({ ...from, x: from.x + dx * e, y: from.y + dy * e });
      api.renderNow();
      if (k < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
  private travel(edgeId: string, my: number): Promise<void> {
    const RUN = this.RUN;
    const e = this.L?.edges.find((x) => x.id === edgeId);
    if (!e) return Promise.resolve();
    this.markLink(edgeId, 'run');
    this.tokenPortal.element.hidden = false;
    const len = M.polyLength(M.routeOf(e, this.box));
    const dur = Math.max(260, Math.min(950, len * 2.4)) * RUN.speed;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const f = (now: number) => {
        if (my !== RUN.token || RUN !== this.RUN) return resolve();
        const k = dur ? Math.min(1, (now - t0) / dur) : 1;
        const p = M.pointAlong(M.routeOf(e, this.box), k);
        this.tokenPortal.setPosition(p.x - 7, p.y - 7);
        RUN.tokenAt = { x: p.x, y: p.y, edge: edgeId };
        if (k < 1) requestAnimationFrame(f);
        else { this.markLink(edgeId, 'done'); RUN.path.push(edgeId); resolve(); }
      };
      requestAnimationFrame(f);
    });
  }
  private showTick(id: string, text: string): void {
    const b = this.box(id);
    if (!b) return;
    try { this.lastTick?.dispose(); } catch { /* gone */ }
    const p = (this.lastTick = createViewportPortal(this.htmlLayer, { className: 'ma-tick-host' }));
    p.element.style.pointerEvents = 'none';
    p.element.innerHTML = `<div class="ma-tick">${ico('ff')}${esc(text)}</div>`;
    p.setPosition(b.x + b.w + 10, b.y + 14);
    this.RUN.ticks++;
    setTimeout(() => { try { p.dispose(); } catch { /* gone */ } if (this.lastTick === p) this.lastTick = null; }, reduced() ? 600 : 1150);
  }
  private logRow(ev: RunEvent): void {
    this.RUN.log.push(ev);
    this.emit();
    // The panel scrolls, never the page.
    const n = this.RUN.log.length;
    this.whenReady(() => (this.$('ma-log')?.children.length ?? 0) >= n, () => { const p = this.$('ma-panel'); if (p) p.scrollTop = p.scrollHeight; });
  }
  private async runTest(contact: Contact, opts: { holdAt?: string } = {}): Promise<Run> {
    this.commitLive();
    this.closeMenu();
    this.stopRun(true);
    const RUN = this.RUN;
    const my = ++RUN.token;
    RUN.active = true;
    RUN.contact = contact;
    RUN.path = []; RUN.log = []; RUN.ticks = 0; RUN.clock = 9 * 60;
    RUN.state = { text: 'Running…', done: false };
    RUN.plan = M.planRun(this.state, contact);
    this.testView = true;
    this.select(null);
    this.renderPanel();
    for (const ev of RUN.plan.events) {
      if (my !== RUN.token) return RUN;
      if (ev.via) { await this.travel(ev.via, my); if (my !== RUN.token) return RUN; }
      if (ev.kind === 'end') { this.tokenPortal.element.hidden = true; this.logRow(ev); break; }
      this.setStatus(ev.id, 'run');
      this.reveal(ev.id);
      RUN.clock = ev.clock;     // a delay fast-forwards the clock right away
      this.logRow(ev);
      if (ev.wait) {
        this.setStatus(ev.id, 'wait', ev.wait);
        this.showTick(ev.id, ev.wait);
        if (ev.id === opts.holdAt) return RUN;   // the camera's frame: hold right here
        await sleep(900 * RUN.speed);
      } else {
        if (ev.id === opts.holdAt) return RUN;
        await sleep(380 * RUN.speed);
      }
      if (my !== RUN.token) return RUN;
      if (ev.armId) { const ae = this.L!.edges.find((x) => x.from === ev.id && x.armId === ev.armId); if (ae) { RUN.arms.add(ae.id); this.frame(); } }
      this.setStatus(ev.id, ev.ok === false ? 'fail' : 'done');
    }
    if (my !== RUN.token) return RUN;
    RUN.active = false;
    this.tokenPortal.element.hidden = true;
    const steps = RUN.plan.events.filter((e) => e.kind !== 'trigger' && e.kind !== 'end').length;
    this.setRunState(RUN.plan.enrolled ? `Done · ${steps} step${steps === 1 ? '' : 's'}` : 'Not enrolled', true);
    return RUN;
  }
  private exitTest(repaint = true): void {
    this.stopRun(true);
    this.testView = false;
    this.RUN.contact = null; this.RUN.plan = null;
    if (repaint) this.renderPanel();
  }
  /** Test flow: pick a sample contact, then Run test. */
  openTestDialog(): void {
    this.commitLive();
    this.openDialog({ kind: 'test', picked: this.pickedContact, contacts: M.CONTACTS });
  }
}
