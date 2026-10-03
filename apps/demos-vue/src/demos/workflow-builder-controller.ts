// The workflow builder's behaviour — translated line for line from the setup()
// of demos/interaction/workflow-builder.html. It owns the engine side (painting
// a step from its data, the page's undo steps, the sticky-note layer, the tidy
// re-arrangement, the "+" buttons and the pointer, Save / Load / New), with
// five parts beside it: the sticky-note layer (workflow-builder-notes.ts), the
// panel as data (-panel.ts), the add-step menu (-menu.ts), Test workflow
// (-run.ts) and the navigator card (-navigator.ts). The framework component owns the markup — the top bar, the
// property panel, the menu, the run card, the navigator card, the toast —
// reads this controller's public fields, and re-renders when it calls
// onUpdate(). Framework-free: the same file sits next to the workflow-builder
// demo in the React, Vue, Angular and Qwik apps.
//
// The library workarounds the JS page carries, carried here too:
//   • icons are page-CSS classes with data-URI backgrounds (HTML node content
//     strips <svg> and url(): see workflow-builder-icons.ts);
//   • a CAPTURING window keydown, armed BEFORE the canvas mounts (armKeys()),
//     owns Delete, so the engine's own Delete never skips the chain-healing;
//   • the tidy layout is one undo step: a DocCommand whose first execute() is
//     a no-op (the model already shows the edit);
//   • notes are drawn on a div UNDER the SVG that copies
//     viewport.getHtmlLayerTransform();
//   • a note keeps its frame while a step is dragged (the engine decides on
//     drop, by that frame, whether the step left or joined it).
import { NodeModel, LinkModel, PortModel, GroupModel, Command, DiagramSerializer } from '@grafloria/engine';
import { iconCss } from './workflow-builder-icons';
import { ACTIONS, PLACEHOLDER, outputsOf, newStepData, sampleWorkflow, type StepData, type WorkflowDoc } from './workflow-builder-catalog';
import { layoutFlow, visualBox } from './workflow-builder-layout';
import {
  TILE, kindOf, portIdOf, geomOf, stepContent, portList, portConfig, DARK, lineStyle, type PortSpec,
} from './workflow-builder-steps';
import { panelView, selectionExists, type PanelView, type Sel } from './workflow-builder-panel';
import { StepMenu } from './workflow-builder-menu';
import { TestRun, type RunHost } from './workflow-builder-run';
import { Navigator } from './workflow-builder-navigator';
import { NoteLayer } from './workflow-builder-notes';

interface MenuCtx { mode: 'insert' | 'branch' | 'trigger'; port?: string; nodeId?: string; world?: { x: number; y: number } | null }

const portModel = (p: PortSpec) => new PortModel({ ...portConfig(p), isConnectableStart: p.type === 'output', isConnectableEnd: p.type === 'input',
  allowSelfLink: false, allowDuplicateLinks: false } as any);

const FRAME_STYLE = { fill: 'none', stroke: 'none', color: 'transparent', labelPlacement: 'top-left' };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const newId = () => 's' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1296).toString(36);
const isTextEntry = (t: any) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
const sameDoc = (a: WorkflowDoc, b: WorkflowDoc) => JSON.stringify(a) === JSON.stringify(b);
const KEY = 'grafloria-demo-workflow-builder';
const ICON_STYLE_ID = 'wf-icon-css';
/** One undo step for a page edit: the workflow before and after. */
class DocCommand extends Command {
  before: WorkflowDoc;
  after: WorkflowDoc;
  apply: (doc: WorkflowDoc) => void;
  fresh: boolean;
  constructor(name: string, before: WorkflowDoc, after: WorkflowDoc, apply: (doc: WorkflowDoc) => void) {
    super(name); this.before = before; this.after = after; this.apply = apply; this.fresh = true;
  }
  execute() { if (this.fresh) { this.fresh = false; return; } this.apply(this.after); }
  undo() { this.apply(this.before); }
  redo() { this.apply(this.after); }
  serialize() { return { id: this.id, name: this.name, timestamp: this.timestamp, data: { before: this.before, after: this.after } }; }
}

export class WorkflowBuilderController {
  // ---- what the templates read ---------------------------------------------------
  title = '';
  stateText = 'Not saved yet';
  dirty = false;
  canUndo = false;
  canRedo = false;
  /** The add-step menu: its search, its sections, its highlight, its place. */
  readonly menu = new StepMenu();
  /** Test workflow: the run card's state, and the walk itself. */
  readonly test = new TestRun(this.runHost());
  /** The navigator card: minimap, zoom slider, Fit, Fit width. */
  readonly nav = new Navigator(() => this.changed());
  // the toast
  toastText = '';
  toastOn = false;
  /** The tidy re-arrangement's duration (ms). */
  animMs = 380;
  /** The step the last "+" / menu pick added. */
  lastInserted: string | null = null;

  /** Re-render the component; set by the framework. */
  onUpdate: () => void = () => {};
  /** Bumped on every change: the panel view is recomputed once per version. */
  ver = 0;

  /** The right-hand panel as data (recomputed once per change). */
  get panel(): PanelView {
    if (!this.panelCache || this.panelVer !== this.ver) { this.panelCache = panelView(this.model, this.sel, this.typed); this.panelVer = this.ver; }
    return this.panelCache;
  }
  /** Narrow stages slide the panel away while nothing is selected. */
  get panelIdle(): boolean { return !this.sel || !selectionExists(this.model, this.sel); }

  // ---- engine side -------------------------------------------------------------------
  private api: any = null;
  private model: any = null;
  private engine: any = null;
  private cm: any = null;
  private root!: HTMLElement;        // #stage
  private host!: HTMLElement;        // #canvas: the flow and its chrome
  private offs: Array<() => void> = [];
  private keyOff: (() => void) | null = null;
  private keysReady = false;
  private sel: Sel = null;
  private editBefore: WorkflowDoc | null = null;
  private savedAt: number | null = null;
  /** What a number box shows while it is typed in (the step keeps the number). */
  private typed = new Map<string, string>();
  private panelCache: PanelView | null = null;
  private panelVer = -1;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private notes = new NoteLayer();
  private frameRaf = 0;
  private tween: { to: Map<string, { x: number; y: number }>; resolve: () => void; raf: number } | null = null;
  private layoutDone: Promise<void> = Promise.resolve();
  private menuCtx: MenuCtx | null = null;
  private plusDown: string | null = null;
  private press: { x: number; y: number; w: { x: number; y: number }; onSomething: boolean } | null = null;
  private lastUp: { x: number; y: number; t: number } | null = null;
  private panJob = 0;

  private changed(): void { this.ver++; this.onUpdate(); }
  /** What Test workflow needs from the canvas. */
  private runHost(): RunHost {
    const c = this;
    return {
      get model() { return c.model; },
      paint: (id) => c.paint(id),
      reveal: (id) => c.reveal(id),
      renderNow: () => c.api?.renderNow(),
      miniRefresh: () => c.nav.refresh(),
      scrollLog: () => requestAnimationFrame(() => { const el = c.host?.querySelector('.rn-log'); if (el) el.scrollTop = el.scrollHeight; }),
      changed: () => c.changed(),
    };
  }

  // ---- keyboard: Delete through the page (one undo step, with re-arrangement) ------------
  /**
   * Arm the keyboard BEFORE the canvas mounts: a key event dispatched AT window
   * runs window's listeners in registration order, and the engine's own Delete
   * must not run first (it would skip the chain-healing and the re-arrangement).
   * Safe to call again.
   */
  armKeys(): void {
    if (this.keyOff) return;
    const onKey = (e: KeyboardEvent) => {
      if (!this.keysReady || isTextEntry(e.target)) return;
      if (e.key === 'Escape') { this.lastUp = null; if (this.menu.open) { this.closeMenu(); e.stopImmediatePropagation(); } return; }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const model = this.model, sel = this.sel;
      const nodes = model.getSelectedNodes(), link = model.getLinks().find((l: any) => l.state === 'selected');
      if (sel?.type === 'note') this.deleteNote(sel.id);
      else if (nodes.length) this.deleteSteps(nodes.map((n: any) => n.id));
      else if (link) this.deleteLink(link.id);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    this.keyOff = () => window.removeEventListener('keydown', onKey, true);
  }

  /** Mount on a fresh instance: `root` is #stage (top bar, #canvas, #panel). Safe to call again. */
  init(instance: any, root: HTMLElement): void {
    this.teardown();
    this.armKeys();
    const api = (this.api = instance);
    const model = (this.model = instance.getModel());
    const engine = (this.engine = instance.getEngine());
    this.cm = engine.commandManager;
    this.root = root;
    this.host = root.querySelector('#canvas') as HTMLElement;
    const host = this.host;
    api.animations?.updateConfig?.({ respectBatteryStatus: false, batterySavingMode: false });
    // Labels and "+" buttons stay drawn at every zoom: widen every LOD tier.
    try {
      const cfg = model.getLODConfig(), all = new Set<unknown>();
      for (const t of cfg.tiers) for (const f of t.features) all.add(f);
      for (const t of cfg.tiers) for (const f of all) t.features.add(f);
      model.setLODConfig(cfg);
    } catch { /* an engine without LOD config draws everything anyway */ }

    // The icons: one stylesheet of data-URI classes in <head>.
    if (!document.getElementById(ICON_STYLE_ID)) {
      const st = document.createElement('style');
      st.id = ICON_STYLE_ID;
      st.textContent = iconCss();
      document.head.appendChild(st);
    }
    // ---- chrome over the canvas keeps its pointer, wheel and double-click -------
    const stop = (e: Event) => e.stopPropagation();
    for (const el of Array.from(host.querySelectorAll('.wf-menu, .wf-run, .wf-nav'))) {
      for (const t of ['pointerdown', 'mousedown', 'wheel', 'dblclick']) {
        el.addEventListener(t, stop);
        this.offs.push(() => el.removeEventListener(t, stop));
      }
    }

    this.sel = null; this.editBefore = null; this.typed.clear();
    this.test.clear();
    this.menu.open = false; this.menuCtx = null;

    for (const ev of ['command:executed', 'command:undone', 'command:redone', 'command:history:cleared']) {
      this.offs.push(engine.eventBus.on(ev, (p: any) => {
        this.syncHistory();
        if (ev === 'command:history:cleared') return;
        this.markDirty();
        const native = !(p?.command instanceof DocCommand);
        if (native) this.scheduleFrames();
        // An undo/redo, or an engine gesture (reconnect, membership) the panel shows.
        if (ev !== 'command:executed' || (native && this.sel?.type !== 'step')) this.renderPanel();
      }));
    }

    // ---- sticky notes: the layer under the diagram ------------------------------
    this.notes.mount(api, host.querySelector('.grafloria-diagram-root') as HTMLElement);
    const frames = () => this.scheduleFrames();
    for (const ev of ['node:changed', 'group:changed', 'node:removed', 'link:added', 'link:removed']) this.offs.push(model.on(ev, frames));
    this.offs.push(api.on('viewport:change', ({ zoom }: { zoom: number }) => {
      this.notes.follow();
      this.nav.zoomed(zoom);
    }));

    // ---- selection ----------------------------------------------------------------
    this.offs.push(api.on('selection:change', ({ nodes, edges }: any) => {
      if (nodes.length === 1) {
        this.setSel({ type: 'step', id: nodes[0].id });
        if (nodes[0].data?.action === PLACEHOLDER) this.openMenuAtStep(nodes[0].id, { mode: 'trigger', nodeId: nodes[0].id });
      } else if (nodes.length > 1) this.setSel({ type: 'multi', ids: nodes.map((n: any) => n.id) });
      else if (edges.length === 1) this.setSel({ type: 'link', id: edges[0].id });
      else if (this.sel?.type !== 'note') this.setSel(null);
    }));

    // An edit is committed (one undo step) when its field fires `change`, as on
    // the JS page. Listened to natively: React's onChange is the INPUT event.
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.id === 'wf-title') this.commitEdit('Rename');
      else if (t.closest?.('#panel')) this.commitEdit('Edit properties');
    };
    root.addEventListener('change', onChange);
    this.offs.push(() => root.removeEventListener('change', onChange));

    // A line someone drew by hand: style it like the others.
    this.offs.push(api.on('connect', ({ link }: any) => setTimeout(() => {
      if (model.getLink(link.id) && !this.test.running) { link.pathType = 'bezier'; link.updateStyle(lineStyle()); }
      api.renderNow();
    }, 0)));

    // The add-step menu closes on a press anywhere outside it.
    const onDocDown = (e: PointerEvent) => {
      const menu = host.querySelector('#wf-menu'), t = e.target as Element;
      if (this.menu.open && menu && !menu.contains(t) && !t.closest?.('[data-act="add-after"]')) this.closeMenu();
    };
    document.addEventListener('pointerdown', onDocDown, true);
    this.offs.push(() => document.removeEventListener('pointerdown', onDocDown, true));

    // ---- pointer: the "+" buttons, note clicks, a line let go on empty canvas ---------------
    const toWorld = (cx: number, cy: number) => api.viewport.clientToWorld(cx, cy, host.getBoundingClientRect());
    const plusPort = (el: any): string | null => [...(el?.closest?.('.wf-plus')?.classList ?? [])].find((c: string) => c.startsWith('wfp-'))?.slice(4) ?? null;
    const onDown = (e: PointerEvent) => {
      this.settle();
      const pid = plusPort(e.target);
      if (pid) { e.stopPropagation(); e.preventDefault(); this.plusDown = pid; return; }
      const w = toWorld(e.clientX, e.clientY);
      const onSomething = !!model.getNodeAtPosition(w.x, w.y) || !!api.interaction.getState().hoveredPort
        || !!api.interaction.getLinkAtPosition(w.x, w.y, engine) || !!(e.target as Element).closest?.('.wf-label, [data-node-id] foreignObject *');
      this.press = { x: e.clientX, y: e.clientY, w, onSomething };
    };
    const onMouse = (e: Event) => { if (plusPort(e.target)) e.stopPropagation(); };
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('mousedown', onMouse, true);
    host.addEventListener('click', onMouse, true);
    const onUp = (e: PointerEvent) => {
      this.lastUp = { x: e.clientX, y: e.clientY, t: performance.now() };
      const pid = this.plusDown && plusPort(document.elementFromPoint(e.clientX, e.clientY) || e.target) === this.plusDown ? this.plusDown : null;
      this.plusDown = null;
      if (pid) {
        e.stopPropagation();
        const r = document.querySelector(`.wfp-${CSS.escape(pid)}`)?.getBoundingClientRect();
        this.openMenu((r?.right ?? e.clientX) + 6, (r?.top ?? e.clientY) - 12, { mode: 'insert', port: pid });
        return;
      }
      const p = this.press;
      this.press = null;
      if (!p || p.onSomething || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4 || !host.contains(e.target as Node)) return;
      const note = model.getGroups().find((g: any) => {
        if (!g.getMetadata('note')) return false;
        const f = g.getOuterBounds();
        return p.w.x >= f.x && p.w.x <= f.x + f.width && p.w.y >= f.y && p.w.y <= f.y + f.height;
      });
      if (note) this.selectNote(note.id);
      else if (this.sel?.type === 'note') this.setSel(null);
    };
    window.addEventListener('pointerup', onUp, true);
    this.offs.push(() => {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('mousedown', onMouse, true);
      host.removeEventListener('click', onMouse, true);
      window.removeEventListener('pointerup', onUp, true);
    });
    this.offs.push(engine.eventBus.on('connection:cancel', (p: any) => setTimeout(() => {
      const src = p?.sourcePort?.id, lastUp = this.lastUp;
      if (!src || !lastUp || performance.now() - lastUp.t > 400 || !src.includes('__') || src.endsWith('__in')) return;
      const w = toWorld(lastUp.x, lastUp.y);
      const r = host.getBoundingClientRect();
      if (lastUp.x < r.left || lastUp.x > r.right || lastUp.y < r.top || lastUp.y > r.bottom) return;
      const over = model.getNodes().filter((n: any) => { const b = visualBox(this.boxOf(n)); return w.x >= b.x0 && w.x <= b.x1 && w.y >= b.y0 && w.y <= b.y1; }).pop();
      const fromNode = model.getNodeByPortId(src);
      if (over && over !== fromNode && over.getPort(`${over.id}__in`)) {
        if (!model.getLinks().some((l: any) => l.sourcePortId === src && l.targetPortId === `${over.id}__in`)) {
          void engine.addLink({ sourcePortId: src, targetPortId: `${over.id}__in`, type: 'bezier' }).then((l: any) => { l?.updateStyle?.(lineStyle()); api.renderNow(); }).catch(() => {});
        }
        return;
      }
      if (!over) this.openMenu(lastUp.x + 6, lastUp.y - 12, { mode: 'branch', port: src, world: { x: w.x, y: w.y - 28 } });
    }, 0)));

    // ---- navigator: the minimap ------------------------------------------------------
    this.nav.mount(api, host, host.querySelector('#wf-mm') as HTMLElement, this.test.status);
    const onDark = () => { for (const l of model.getLinks()) if (!this.test.status.size) l.updateStyle(lineStyle()); this.nav.refresh(); api.renderNow(); };
    DARK.addEventListener?.('change', onDark);
    this.offs.push(() => DARK.removeEventListener?.('change', onDark));

    this.keysReady = true;
    this.reset();
  }

  /** Unmount: listeners off, runs and animations stopped, the measuring twin and the icon sheet removed. */
  destroy(): void {
    this.teardown();
    this.keyOff?.();
    this.keyOff = null;
    this.notes.dispose();
    document.getElementById(ICON_STYLE_ID)?.remove();
  }

  private teardown(): void {
    this.keysReady = false;
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* already gone */ } }
    if (this.tween) { cancelAnimationFrame(this.tween.raf); this.tween = null; }
    this.test.clear();
    this.panJob++;
    clearTimeout(this.toastTimer);
    cancelAnimationFrame(this.frameRaf); this.frameRaf = 0;
    this.nav.dispose();
    this.notes.unmount();
  }

  toast(text: string): void {
    this.toastText = text; this.toastOn = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastOn = false; this.changed(); }, 2600);
    this.changed();
  }

  // ---- painting a step: content, size and ports follow node.data ----------------
  private paint(id: string): void {
    const model = this.model, node = model.getNode(id);
    if (!node || !node.data?.action) return;
    const data = node.data, g = geomOf(data);
    const sel = this.sel;
    node.setMetadata('html', { content: stepContent(id, data, { sel: sel?.type === 'step' && sel.id === id, status: this.test.status.get(id) }), padding: 0, style: { overflow: 'visible' } });
    if (node.size.width !== g.w || node.size.height !== g.h) node.setSize(g.w, g.h);
    const want = portList(id, data), keep = new Set(want.map((p) => p.id));
    for (const port of [...node.getPorts()]) {
      if (keep.has(port.id)) continue;
      for (const l of model.getLinks()) if (l.sourcePortId === port.id || l.targetPortId === port.id) model.removeLink(l.id);
      node.removePort(port.id);
    }
    for (const p of want) {
      const have = node.getPort(p.id), a = have?.layout?.args;
      if (have && a && a.x === p.x && a.y === p.y) continue;
      if (have) node.removePort(p.id);   // re-seat under the SAME id: its lines stay on it
      node.addPort(portModel(p));
    }
  }
  private paintAll(): void { for (const n of this.model.getNodes()) this.paint(n.id); }
  private buildNode(step: { id: string; x: number; y: number; data: StepData }): any {
    const g = geomOf(step.data);
    const node: any = new NodeModel({ id: step.id, type: 'rect', position: { x: step.x, y: step.y }, size: { width: g.w, height: g.h } } as any);
    node.ports.clear();
    node.data = clone(step.data);
    node.setMetadata('shape', { type: 'rect' });
    node.behavior.resizable = false;
    node.style = { ...node.style, selection: 'border' };
    return node;
  }
  private addLink(id: string, s: string, t: string): any {
    const model = this.model, src = model.getNodeByPortId(s), tgt = model.getNodeByPortId(t);
    if (!src || !tgt) return null;
    const l: any = new LinkModel(s, t, 'bezier' as any);
    l.id = id;
    l.sourceNodeId = src.id; l.targetNodeId = tgt.id;
    l.updateStyle(lineStyle());
    model.addLink(l);
    return l;
  }

  // ---- the document: the workflow as plain data ---------------------------------
  private docOf(m: any, title: string): WorkflowDoc {
    return {
      v: 1, title,
      steps: m.getNodes().filter((n: any) => n.data?.action).map((n: any) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), data: clone(n.data) })),
      links: m.getLinks().map((l: any) => ({ id: l.id, s: l.sourcePortId, t: l.targetPortId })),
      notes: m.getGroups().filter((g: any) => g.getMetadata('note')).map((g: any) => ({ id: g.id, ...clone(g.getMetadata('note')),
        members: [...g.members].filter((id) => m.getNode(id)), frame: { ...g.getOuterBounds() } })),
    };
  }
  private docFromModel(): WorkflowDoc { return this.docOf(this.model, this.title); }

  private applyDoc(doc: WorkflowDoc): void {
    const model = this.model;
    this.cancelTween();
    this.test.stop(true);
    this.closeMenu();
    const wantLinks = new Map(doc.links.map((l) => [l.id, l]));
    for (const l of [...model.getLinks()]) {
      const w = wantLinks.get(l.id);
      if (!w || w.s !== l.sourcePortId || w.t !== l.targetPortId) model.removeLink(l.id);
    }
    const wantSteps = new Set(doc.steps.map((s) => s.id));
    for (const n of [...model.getNodes()]) if (!wantSteps.has(n.id)) model.removeNode(n.id);
    for (const s of doc.steps) {
      const node = model.getNode(s.id);
      if (!node) model.addNode(this.buildNode(s));
      else {
        node.data = clone(s.data);
        if (node.position.x !== s.x || node.position.y !== s.y) node.setPosition(s.x, s.y);
      }
      this.paint(s.id);
    }
    for (const l of doc.links) if (!model.getLink(l.id)) this.addLink(l.id, l.s, l.t);
    const wantNotes = new Map(doc.notes.map((n) => [n.id, n]));
    for (const g of [...model.getGroups()]) if (!wantNotes.has(g.id)) model.removeGroup(g.id);
    for (const nt of doc.notes) {
      let g = model.getGroup(nt.id);
      if (!g) {
        g = new GroupModel({ id: nt.id, name: nt.title } as any);
        g.headerHeight = 0;
        model.addGroup(g);
        g.setMetadata('frameStyle', { ...FRAME_STYLE });
      }
      g.name = nt.title;
      g.setMetadata('note', { title: nt.title, text: nt.text });
      for (const m of [...g.members]) if (!nt.members.includes(m as string)) g.removeMember(m, model);
      for (const m of nt.members) if (model.getNode(m) && !g.members.has(m)) g.addMember(m, model);
      if (nt.frame && !nt.members.length) g.setFrame(nt.frame);
    }
    this.title = doc.title ?? this.title;
    if (this.sel && !selectionExists(this.model, this.sel)) this.sel = null;
    this.typed.clear();
    this.refreshFrames();
    this.paintAll();
    this.api.renderNow();
    this.renderPanel();
    this.syncHistory();
  }

  private commit(name: string, before: WorkflowDoc, after: WorkflowDoc = this.docFromModel()): void {
    if (sameDoc(before, after)) return;
    void this.cm.execute(new DocCommand(name, before, after, (d) => this.applyDoc(d))).then(() => this.syncHistory());
    this.markDirty();
  }
  private markDirty(): void { this.dirty = true; this.stateText = 'Unsaved changes'; this.changed(); }
  private syncHistory(): void {
    const u = this.cm.canUndo(), r = this.cm.canRedo();
    if (u !== this.canUndo || r !== this.canRedo) { this.canUndo = u; this.canRedo = r; this.changed(); }
  }

  // ---- sticky notes (workflow-builder-notes.ts draws them) -------------------------
  private boxOf(node: any) { return { ...geomOf(node.data), x: node.position.x, y: node.position.y, id: node.id }; }
  private noteSel(): string | null { return this.sel?.type === 'note' ? this.sel.id : null; }
  private refreshFrames(): void { this.notes.fit(this.noteSel()); this.nav.refresh(); }
  private renderNotes(): void { this.notes.render(this.noteSel()); }
  private scheduleFrames(): void {
    if (this.frameRaf) return;
    this.frameRaf = requestAnimationFrame(() => { this.frameRaf = 0; this.refreshFrames(); });
  }

  // ---- the automatic left-to-right arrangement -----------------------------------
  private computeLayout(): Map<string, { x: number; y: number }> {
    const model = this.model;
    const nodes = model.getNodes().filter((n: any) => n.data?.action).map((n: any) => ({ ...this.boxOf(n), first: ['trigger', 'placeholder'].includes(kindOf(n.data)) }));
    const links = model.getLinks().map((l: any, i: number) => {
      const src = model.getNodeByPortId(l.sourcePortId);
      const outIdx = src?.data ? outputsOf(src.data).findIndex((o) => portIdOf(src.id, src.data, o) === l.sourcePortId) : 0;
      return { from: l.sourceNodeId, to: l.targetNodeId, order: Math.max(0, outIdx) * 1000 + i };
    });
    const notes = model.getGroups().filter((g: any) => g.getMetadata('note')).map((g: any) => ({ id: g.id, members: [...g.members] as string[], header: this.notes.header(g.getMetadata('note')) }));
    return layoutFlow({ nodes, links, notes }).pos;
  }
  private cancelTween(): void { if (!this.tween) return; cancelAnimationFrame(this.tween.raf); const t = this.tween; this.tween = null; t.resolve(); }
  private settle(): void {
    if (!this.tween) return;
    const t = this.tween;
    for (const [id, p] of t.to) this.model.getNode(id)?.setPosition(p.x, p.y);
    this.cancelTween();
    this.refreshFrames();
  }
  private animateTo(target: Map<string, { x: number; y: number }>): Promise<void> {
    this.cancelTween();
    const model = this.model;
    const from = new Map<string, { x: number; y: number }>(), to = new Map<string, { x: number; y: number }>();
    for (const [id, p] of target) {
      const n = model.getNode(id);
      if (!n) continue;
      from.set(id, { x: n.position.x, y: n.position.y });
      to.set(id, p);
    }
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : this.animMs;
    if (!ms) { for (const [id, p] of to) model.getNode(id).setPosition(p.x, p.y); this.refreshFrames(); this.api.renderNow(); return (this.layoutDone = Promise.resolve()); }
    this.layoutDone = new Promise<void>((resolve) => {
      const t0 = performance.now();
      this.tween = { to, resolve, raf: 0 };
      const step = (now: number) => {
        if (!this.tween || this.tween.to !== to) return;
        const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        for (const [id, p] of to) {
          const a = from.get(id)!, n = model.getNode(id);
          if (n) n.setPosition(Math.round(a.x + (p.x - a.x) * e), Math.round(a.y + (p.y - a.y) * e));
        }
        this.refreshFrames();
        if (k < 1) this.tween.raf = requestAnimationFrame(step);
        else { this.tween = null; resolve(); }
      };
      this.tween.raf = requestAnimationFrame(step);
    });
    return this.layoutDone;
  }
  /** Commit an edit already applied to the model, then slide the flow into its new arrangement. */
  private commitWithLayout(name: string, before: WorkflowDoc): Promise<void> {
    const target = this.computeLayout();
    const doc = this.docFromModel();
    this.commit(name, before, { ...doc, steps: doc.steps.map((s) => (target.has(s.id) ? { ...s, x: target.get(s.id)!.x, y: target.get(s.id)!.y } : s)) });
    return this.animateTo(target);
  }

  // ---- selection -----------------------------------------------------------------
  private setSel(next: Sel): void {
    const prev = this.sel;
    this.sel = next;
    this.typed.clear();
    if (prev?.type === 'step') this.paint(prev.id);
    if (next?.type === 'step') this.paint(next.id);
    this.renderNotes();
    this.api.renderNow();
    if (this.editBefore) { this.commit('Edit', this.editBefore); this.editBefore = null; }
    this.renderPanel();
  }
  private selectStep(id: string): void {
    const model = this.model;
    model.clearSelection();
    for (const l of model.getLinks()) if (l.state === 'selected') l.setState('default');
    const n = model.getNode(id);
    if (n) model.selectNode(n);
    this.api.renderNow();
  }
  private selectNote(id: string): void {
    const prev = this.sel, model = this.model;
    this.sel = { type: 'note', id };
    if (prev?.type === 'step') this.paint(prev.id);
    model.clearSelection();
    for (const l of model.getLinks()) if (l.state === 'selected') l.setState('default');
    this.setSel({ type: 'note', id });
  }

  // ---- the property panel ------------------------------------------------------------
  private renderPanel(): void { this.changed(); }
  /** Typing in a step's field: the canvas label follows on every keystroke. */
  editField(key: string, value: string): void {
    const sel = this.sel;
    if (!sel) return;
    if (!this.editBefore) this.editBefore = this.docFromModel();
    if (sel.type !== 'step') return;
    const node = this.model.getNode(sel.id);
    if (!node) return;
    const data = node.data, f = ACTIONS[data.action].fields.find((x) => x.key === key);
    data.props[key] = f?.type === 'number' ? Number(value) : value;
    if (f?.type === 'number') this.typed.set('k:' + key, value);
    this.afterEdit(node.id);
    // A select fires `change` together with `input`: its edit is one undo step
    // at once (React reports a select's change after the page's own listener).
    if (f?.type === 'select') this.commitEdit('Edit properties');
  }
  /** Typing in a Switch output: its name, or its rule's metric / operator / value. */
  editOut(i: number, which: 'label' | 'metric' | 'op' | 'value', value: string): void {
    const sel = this.sel;
    if (!sel) return;
    if (!this.editBefore) this.editBefore = this.docFromModel();
    if (sel.type !== 'step') return;
    const node = this.model.getNode(sel.id);
    const o = node?.data.outputs?.[i];
    if (!o) return;
    if (which === 'label') o.label = value;
    else if (o.rule) { (o.rule as any)[which] = which === 'value' ? Number(value) : value; if (which === 'value') this.typed.set('o:' + i, value); }
    this.afterEdit(node.id);
    if (which === 'metric' || which === 'op') this.commitEdit('Edit properties');   // selects: see editField
  }
  /** Typing in the selected note's title or text. */
  editNote(which: 'title' | 'text', value: string): void {
    const sel = this.sel;
    if (!sel) return;
    if (!this.editBefore) this.editBefore = this.docFromModel();
    if (sel.type !== 'note') return;
    const g = this.model.getGroup(sel.id);
    if (!g) return;
    g.setMetadata('note', { ...g.getMetadata('note'), [which]: value });
    if (which === 'title') g.name = value;
    this.refreshFrames();
    this.changed();
  }
  private commitEdit(name: string): void {
    if (this.editBefore) { this.commit(name, this.editBefore); this.editBefore = null; }
  }
  private afterEdit(id: string): void {
    this.paint(id);
    this.scheduleFrames();
    this.api.renderNow();
    this.changed();
  }
  /** A panel button: `act` is the JS page's data-act. */
  panelAct(act: string, arg?: string | number, rect?: DOMRect): void {
    const sel = this.sel;
    this.commitEdit('Edit properties');
    if (act === 'pick-trigger' && sel?.type === 'step') this.replacePlaceholder(sel.id, String(arg));
    else if (act === 'add-after' && rect) this.openMenu(rect.left - 310, rect.top, { mode: 'insert', port: String(arg) });
    else if (act === 'del-step' && sel?.type === 'step') this.deleteSteps([sel.id]);
    else if (act === 'del-link' && sel?.type === 'link') this.deleteLink(sel.id);
    else if (act === 'del-note' && sel?.type === 'note') this.deleteNote(sel.id);
    else if ((act === 'add-out' || act === 'rm-out') && sel?.type === 'step') {
      const node = this.model.getNode(sel.id), before = this.docFromModel(), outs = node.data.outputs;
      if (act === 'add-out') outs.splice(outs.length - 1, 0, { id: 'o' + Math.random().toString(36).slice(2, 6), label: `output ${outs.length}`, rule: { metric: 'latency_p95', op: '>', value: 1500 } });
      else if (outs.filter((o: any) => o.rule).length > 1) outs.splice(Number(arg), 1);
      this.typed.clear();
      this.paint(node.id);
      void this.commitWithLayout(act === 'add-out' ? 'Add output' : 'Remove output', before);
      this.renderPanel();
    }
  }

  // ---- edits ------------------------------------------------------------------------
  private stepNode(id: string, data: StepData, x: number, y: number): any { const n = this.buildNode({ id, x, y, data }); this.model.addNode(n); this.paint(id); return n; }
  private noteOfStep(id: string): any { return this.model.getGroups().find((g: any) => g.getMetadata('note') && g.members.has(id)); }
  /** "+" (splice: the new step takes over the port's lines) or a line dropped on canvas (a new branch). */
  private insertAfter(portId: string, action: string, { splice = true, world = null as { x: number; y: number } | null } = {}): string | null {
    this.settle(); this.test.stop(true);
    const model = this.model, src = model.getNodeByPortId(portId);
    if (!src) return null;
    const before = this.docFromModel();
    const id = newId(), data = newStepData(action);
    const at = world ?? { x: src.position.x + src.size.width + 90, y: src.position.y };
    this.stepNode(id, data, Math.round(at.x), Math.round(at.y));
    const old = splice ? model.getLinks().filter((l: any) => l.sourcePortId === portId) : [];
    for (const l of old) model.removeLink(l.id);
    this.addLink(newId(), portId, `${id}__in`);
    const firstOut = outputsOf(data)[0];
    for (const l of old) if (firstOut) this.addLink(newId(), portIdOf(id, data, firstOut), l.targetPortId);
    this.noteOfStep(src.id)?.addMember(id, model);
    this.lastInserted = id;
    this.selectStep(id);
    void this.commitWithLayout(`Add ${ACTIONS[action].app}`, before).then(() => this.reveal(id));
    return id;
  }
  private replacePlaceholder(phId: string, action: string): void {
    this.settle(); this.test.stop(true);
    const model = this.model, ph = model.getNode(phId);
    if (!ph) return;
    const before = this.docFromModel(), id = newId(), data = newStepData(action);
    this.stepNode(id, data, ph.position.x, ph.position.y);
    for (const l of model.getLinks().filter((x: any) => x.sourceNodeId === phId)) this.addLink(newId(), `${id}__out`, l.targetPortId);
    model.removeNode(phId);
    this.closeMenu();
    this.selectStep(id);
    void this.commitWithLayout(`Choose ${ACTIONS[action].app}`, before);
  }
  private deleteSteps(ids: string[]): void {
    this.settle(); this.test.stop(true);
    const model = this.model, before = this.docFromModel();
    for (const id of ids) {
      const node = model.getNode(id);
      if (!node) continue;
      const kind = kindOf(node.data);
      const ins = model.getLinks().filter((l: any) => l.targetNodeId === id);
      const outs = model.getLinks().filter((l: any) => l.sourceNodeId === id);
      // A one-in, one-out step heals the chain: its predecessor takes its lines.
      if (kind === 'app' && ins.length === 1) for (const l of outs) this.addLink(newId(), ins[0].sourcePortId, l.targetPortId);
      // The trigger leaves a "Choose a trigger" step that keeps its lines.
      if (kind === 'trigger') {
        const ph = newId();
        this.stepNode(ph, { action: PLACEHOLDER, props: {} }, node.position.x, node.position.y);
        for (const l of outs) this.addLink(newId(), `${ph}__out`, l.targetPortId);
      }
      for (const g of model.getGroups()) g.members.has(id) && g.removeMember(id, model);
      model.removeNode(id);
    }
    if (!model.getNodes().length) this.stepNode(newId(), { action: PLACEHOLDER, props: {} }, 0, 0);
    this.setSel(null);
    void this.commitWithLayout(ids.length > 1 ? `Delete ${ids.length} steps` : 'Delete step', before);
  }
  private deleteLink(id: string): void {
    this.settle(); this.test.stop(true);
    const before = this.docFromModel();
    this.model.removeLink(id);
    this.setSel(null);
    this.commit('Delete line', before);
    this.api.renderNow();
  }
  private deleteNote(id: string): void {
    this.settle();
    const before = this.docFromModel();
    this.model.removeGroup(id);
    this.setSel(null);
    this.commit('Delete note', before);
    this.refreshFrames();
  }

  // ---- the action menu ----------------------------------------------------------------
  private openMenu(clientX: number, clientY: number, mctx: MenuCtx): void {
    const host = this.host, menu = this.menu;
    this.menuCtx = mctx; menu.on = 0; menu.query = '';
    menu.build(mctx.mode === 'trigger');
    menu.open = true;
    menu.place(host.getBoundingClientRect(), clientX, clientY, (host.querySelector('#wf-menu') as HTMLElement | null)?.offsetWidth || 300);
    this.changed();
    // The framework shows the menu on its next render: focus the search then.
    let tries = 12;
    const focus = () => {
      const s = host.querySelector('#mn-search') as HTMLInputElement | null;
      if (!menu.open) return;
      if (s && s.offsetParent) s.focus({ preventScroll: true });
      else if (tries-- > 0) requestAnimationFrame(focus);
    };
    focus();
  }
  private openMenuAtStep(stepId: string, mctx: MenuCtx): void {
    const n = this.model.getNode(stepId), r = this.host.getBoundingClientRect();
    const c = this.api.viewport.worldToClient(n.position.x + n.size.width + 24, n.position.y, r);
    this.openMenu(c.x, c.y, mctx);
  }
  closeMenu(): void {
    if (!this.menu.open && !this.menuCtx) return;
    this.menu.open = false; this.menuCtx = null;
    this.changed();
  }
  /** A menu row was picked (clicked, or Enter on the highlighted one). */
  pick(action: string): void {
    const m = this.menuCtx;
    this.closeMenu();
    if (!m || !ACTIONS[action]) return;
    if (m.mode === 'trigger') this.replacePlaceholder(m.nodeId!, action);
    else this.insertAfter(m.port!, action, { splice: m.mode === 'insert', world: m.world ?? null });
  }
  /** Typing in the menu's search box. */
  menuSearch(q: string): void { this.menu.query = q; this.menu.on = 0; this.menu.build(this.menuCtx?.mode === 'trigger'); this.changed(); }
  /** A key in the menu's search box: ↑ / ↓ move the highlight, Enter picks, Escape closes. */
  menuKey(key: string): void {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      this.menu.move(key === 'ArrowDown' ? 1 : -1);
      this.changed();
      requestAnimationFrame(() => this.host.querySelector('.mn-item.on')?.scrollIntoView({ block: 'nearest' }));
    } else if (key === 'Enter' && this.menu.current) this.pick(this.menu.current);
    else if (key === 'Escape') this.closeMenu();
  }

  // ---- Test workflow (workflow-builder-run.ts walks the links) --------------------------
  /** Test workflow / Run again. */
  runWorkflow(): void {
    this.settle();
    this.closeMenu();
    void this.test.start();
  }
  // Pan (briefly animated) until a step sits inside the free part of the canvas.
  private reveal(id: string): void {
    const n = this.model?.getNode(id);
    if (!n) return;
    const r = this.host.getBoundingClientRect(), vp = this.api.viewport, z = vp.getZoom(), b = visualBox(this.boxOf(n));
    const a = vp.worldToClient(b.x0, b.y0, r), c = vp.worldToClient(b.x1, b.y1, r);
    const free = { left: r.left + 24, right: r.right - 24, top: r.top + 24, bottom: r.bottom - 24 };
    if (a.x >= free.left && c.x <= free.right && a.y >= free.top && c.y <= free.bottom) return;
    const dx = ((a.x + c.x) / 2 - (free.left + free.right) / 2) / z, dy = ((a.y + c.y) / 2 - (free.top + free.bottom) / 2) / z;
    const from = vp.getViewport(), t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300, job = ++this.panJob;
    const step = (now: number) => {
      if (job !== this.panJob) return;
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      vp.setViewport({ ...from, x: from.x + dx * e, y: from.y + dy * e });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- top bar -------------------------------------------------------------------------
  private stepCount(): number { return this.model.getNodes().filter((n: any) => n.data?.action && n.data.action !== PLACEHOLDER).length; }
  async undo(): Promise<void> { this.settle(); await this.engine.undo(); this.syncHistory(); this.api.renderNow(); }
  async redo(): Promise<void> { this.settle(); await this.engine.redo(); this.syncHistory(); this.api.renderNow(); }
  save(): void {
    this.settle();
    const json = JSON.stringify({ title: this.title, savedAt: Date.now(), diagram: this.engine.serialize() });
    try { localStorage.setItem(KEY, json); } catch { this.toast('Your browser refused to store it (private mode?)'); return; }
    this.dirty = false;
    this.savedAt = Date.now();
    this.stateText = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    this.toast(`Saved “${this.title}” · ${this.stepCount()} steps`);
  }
  load(): void {
    this.settle();
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
    if (!saved?.diagram) { this.toast('Nothing saved yet: press Save first'); return; }
    const temp = new DiagramSerializer().deserialize(saved.diagram);
    const doc = this.docOf(temp, saved.title || 'Untitled workflow');
    const before = this.docFromModel();
    this.setSel(null);
    this.applyDoc(doc);
    this.commit('Load', before, doc);
    this.nav.frame();
    this.toast(`Loaded “${doc.title}” · ${doc.steps.filter((s) => s.data.action !== PLACEHOLDER).length} steps`);
  }
  newWorkflow(): void {
    this.settle();
    const before = this.docFromModel();
    this.setSel(null);
    const doc: WorkflowDoc = { v: 1, title: 'Untitled workflow', steps: [{ id: newId(), x: 0, y: 0, data: { action: PLACEHOLDER, props: {} } }], links: [], notes: [] };
    this.applyDoc(doc);
    this.commit('New workflow', before, doc);
    const vp = this.api.viewport;
    vp.setZoom(1);
    const c = vp.getViewport();
    vp.setViewport({ ...c, x: TILE / 2 - c.width / 2, y: TILE / 2 + 20 - c.height / 2 });
    this.toast('A blank workflow: click “Choose a trigger” to start');
  }
  /** Typing in the workflow's name (committed as "Rename" on change). */
  titleInput(v: string): void { if (!this.editBefore) this.editBefore = this.docFromModel(); this.title = v; this.changed(); }
  publish(): void {
    this.settle();
    const n = this.stepCount();
    this.toast(n ? `Published “${this.title}” · ${n} step${n === 1 ? '' : 's'} are live` : 'Nothing to publish yet: choose a trigger first');
  }

  // ---- a fresh sample -------------------------------------------------------------------
  private reset(): void {
    this.settle(); this.test.stop(true);
    this.test.open = false;
    this.closeMenu();
    this.model.clearSelection();
    this.sel = null; this.editBefore = null;
    const doc = sampleWorkflow();
    this.applyDoc(doc);
    const pos = this.computeLayout();
    for (const [id, p] of pos) this.model.getNode(id).setPosition(p.x, p.y);
    this.refreshFrames();
    this.cm.clear();
    this.syncHistory();
    this.nav.frame();
    this.renderPanel();
    this.dirty = false;
    if (!this.savedAt) this.stateText = 'Not saved yet';
    this.nav.zoomed(this.api.viewport.getZoom());
    this.changed();
  }
}
