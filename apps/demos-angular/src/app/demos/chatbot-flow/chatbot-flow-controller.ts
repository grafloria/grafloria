// The chatbot builder's behaviour — translated line for line from the setup()
// of demos/interaction/chatbot-flow.html. It owns the engine side (repainting a
// card, re-seating its ports, connecting, new steps, the Preview's walk along
// the links); the framework component owns the markup, reads this controller's
// public fields, and re-renders when it calls bump(). Framework-free: the same
// file sits next to the chatbot-flow demo in the React, Vue, Angular and Qwik apps.
import { LinkModel, NodeModel } from '@grafloria/engine';
import {
  FLOW0, URL_BOOK, portKind, lineStyle, cardContent, stripPorts, measure, portList, portModel,
  nodeSpec, edgeSpecs, disposeMeasure, type Step, type Block, type Btn,
} from './chatbot-flow-data';

/** One row of the Preview chat: a bubble, a system line, a row of buttons, the typing dots. */
export interface ChatItem {
  id: number;
  kind: 'msg' | 'sys' | 'btns' | 'typing';
  cls?: string;              // msg: pv-bot / pv-user / pv-img
  text?: string;
  act?: boolean;             // sys: an action ran
  buttons?: Array<{ label: string; chosen: boolean }>;
}
interface Waiting { stepId: string; field: string; ar: boolean }
interface MenuCtx { world: { x: number; y: number }; from: string | null }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isArabic = (s: string) => /[؀-ۿ]/.test(s);
const uid = () => Math.random().toString(36).slice(2, 7);
const VALID: Record<string, RegExp> = { Phone: /^\+?[\d\s()-]{7,}$/, Email: /^\S+@\S+\.\S+$/, Text: /\S/ };

export class ChatbotFlowController {
  // ---- what the template reads ---------------------------------------------
  steps = new Map<string, Step>();
  selected: string | null = null;     // selected step id
  savedText = '✓ Saved';
  dirty = false;
  publishDisabled = true;
  menuOpen = false;
  menuLeft = 0;
  menuTop = 0;
  previewOn = false;
  chat: ChatItem[] = [];
  waiting: Waiting | null = null;
  pvText = '';
  /** The Preview's delays are multiplied by this (0 = instant). */
  pvSpeed = 1;

  /** Re-render the component; set by the framework. */
  bump: () => void = () => {};

  get step(): Step | null { return (this.selected && this.steps.get(this.selected)) || null; }
  get kindLabel(): string {
    const k = this.step?.kind;
    return k === 'trigger' ? 'Trigger' : k === 'actions' ? 'Actions' : 'Send Message';
  }
  get stepCount(): number { return this.steps.size; }
  get linkCount(): number { return this.model ? this.model.getLinks().length : 0; }
  /** "Choose Next Step" shows unless this is a trigger that already leads somewhere. */
  get showNext(): boolean { const s = this.step; return !!s && (s.kind !== 'trigger' || !this.outLink(s.id + '__then')); }
  get waitText(): string { return this.waiting ? `Waiting for your ${this.waiting.field.toLowerCase()}…` : 'Waiting for your reply…'; }
  get inputPlaceholder(): string {
    return this.waiting ? (this.waiting.field === 'Phone' ? '+20 100 123 4567' : 'Type your reply…') : 'Type a message…';
  }
  /** The delay's seconds box shows what was typed; the card shows the clamped value. */
  secsValue(b: Block): string { return this.secsTyped.get(b) ?? String(b.secs); }

  // ---- engine side -----------------------------------------------------------
  private api: any = null;
  private model: any = null;
  private engine: any = null;
  private root!: HTMLElement;     // the stage: #side + #canvas
  private host!: HTMLElement;     // #canvas — the flow and its chrome
  private offs: Array<() => void> = [];
  private seq = 8;                // "Send Message #n" for new steps
  private running: string | null = null;   // the step the Preview is on
  private runningLink: any = null;
  private removed = new Map<string, Step>();
  private menuCtx: MenuCtx | null = null;
  private lastUp: { x: number; y: number } | null = null;
  private panAnim = 0;
  private secsTyped = new WeakMap<Block, string>();
  private P = { token: 0 };
  private chatSeq = 0;
  private btnRows = new Map<number, { stepId: string; buttons: Btn[] }>();

  /** Mount on a fresh instance: `root` holds #side and #canvas. Safe to call again. */
  init(instance: any, root: HTMLElement): void {
    this.teardown();
    this.api = instance;
    this.model = instance.getModel();
    this.engine = instance.getEngine();
    this.root = root;
    this.host = root.querySelector('#canvas') as HTMLElement;
    this.selected = null; this.running = null; this.runningLink = null; this.seq = 8;
    this.savedText = '✓ Saved'; this.dirty = false; this.publishDisabled = true;
    this.menuOpen = false; this.menuCtx = null;
    this.previewOn = false; this.chat = []; this.waiting = null; this.pvText = '';
    this.removed.clear();
    this.btnRows.clear();

    // The cards are measured in the page's CSS, so the flow goes in once the
    // component (and its stylesheet) is on the page.
    const flow = FLOW0();
    this.steps = new Map(flow.steps.map((s) => [s.id, s]));
    instance.setNodes(flow.steps.map((s) => nodeSpec(s)));
    instance.setEdges(edgeSpecs(flow.links));
    const model = this.model;
    // ManyChat keeps a card's words at every zoom: widen every level-of-detail
    // tier to draw everything (a bot is tens of steps, not thousands).
    try {
      const cfg = model.getLODConfig();
      const all = new Set<unknown>();
      for (const t of cfg.tiers) for (const f of t.features) all.add(f);
      for (const t of cfg.tiers) for (const f of all) t.features.add(f);
      model.setLODConfig(cfg);
    } catch { /* an engine without LOD config draws everything anyway */ }
    for (const n of model.getNodes()) n.behavior.resizable = false;

    // The chrome over the canvas keeps its pointer, wheel and double-click.
    const stop = (e: Event) => e.stopPropagation();
    for (const el of Array.from(this.host.querySelectorAll('.cv-top, #cv-fab, .cv-zoom, #mc-menu, #pv'))) {
      for (const t of ['pointerdown', 'wheel', 'dblclick']) {
        el.addEventListener(t, stop);
        this.offs.push(() => el.removeEventListener(t, stop));
      }
    }

    // ---- selection drives the editor -----------------------------------------
    this.offs.push(instance.on('selection:change', ({ nodes }: any) => this.select(nodes.length === 1 ? nodes[0].id : null)));
    // A deleted step keeps its data aside, so an undo brings back a card the
    // editor and the Preview still understand.
    this.offs.push(model.on('node:removed', (n: any) => {
      if (!n || !this.steps.has(n.id)) return;
      this.removed.set(n.id, this.steps.get(n.id)!);
      this.steps.delete(n.id);
      if (this.selected === n.id) this.select(null);
      this.bump();
    }));
    this.offs.push(model.on('node:added', (n: any) => {
      if (n && this.removed.has(n.id)) { this.steps.set(n.id, this.removed.get(n.id)!); this.removed.delete(n.id); this.bump(); }
    }));
    this.offs.push(model.on('link:added', () => { if (!this.selected) this.bump(); }));
    this.offs.push(model.on('link:removed', () => { if (!this.selected) this.bump(); }));

    // ---- the line a button draws: one next step per output --------------------
    this.offs.push(instance.on('connect', ({ link }: any) => setTimeout(() => {
      for (const l of model.getLinks()) if (l !== link && l.sourcePortId === link.sourcePortId) model.removeLink(l.id);
      link.pathType = 'bezier';
      link.updateStyle(lineStyle(link.sourcePortId));
      this.api.renderNow(); this.markDirty();
    }, 0)));

    // Where a dragged line is let go decides what it means. The engine connects
    // a drop ON (or near) an input dot by itself; the page adds ManyChat's two
    // other answers: over a card's BODY, connect to that card; over empty
    // canvas, offer to create the next step right there.
    const onUp = (e: PointerEvent) => { this.lastUp = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointerup', onUp, true);
    this.offs.push(() => window.removeEventListener('pointerup', onUp, true));
    this.offs.push(this.engine.eventBus.on('connection:cancel', (p: any) => setTimeout(() => {
      const src = p?.sourcePort?.id, lastUp = this.lastUp;
      if (!src || !lastUp || portKind(src) === 'in') return;
      const r = this.host.getBoundingClientRect();
      const w = this.api.viewport.clientToWorld(lastUp.x, lastUp.y, r);
      const over = model.getNodes().filter((n: any) => w.x >= n.position.x && w.x <= n.position.x + n.size.width
        && w.y >= n.position.y && w.y <= n.position.y + n.size.height).pop();
      if (!over) { this.openMenu(lastUp.x, lastUp.y, { world: w, from: src }); return; }
      const fromNode = model.getNodeByPortId(src);
      if (over === fromNode || !over.getPort(over.id + '__in')) return;
      this.connect(src, over.id);
      this.api.renderNow(); this.markDirty();
    }, 0)));

    // The next-step menu closes on any press outside it, and on Escape.
    const onDown = (e: PointerEvent) => {
      const menu = this.host.querySelector('#mc-menu');
      if (this.menuOpen && menu && !menu.contains(e.target as Node)) this.closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.closeMenu(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    this.offs.push(() => document.removeEventListener('pointerdown', onDown, true));
    this.offs.push(() => document.removeEventListener('keydown', onKey));

    this.frame();
    this.bump();
  }

  /** Unmount: listeners off, the Preview stopped, the measuring twin removed. */
  destroy(): void {
    this.teardown();
    disposeMeasure();
  }

  private teardown(): void {
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* already gone */ } }
    this.P.token++;
    this.panAnim++;
  }

  // ---- repaint: content, size and ports follow the step's data ------------
  private paint(id: string | null): void {
    const step = id ? this.steps.get(id) : undefined, node = id ? this.model.getNode(id) : undefined;
    if (!step || !node) return;
    const m = measure(step);
    node.setMetadata('html', { content: stripPorts(cardContent(step, { sel: id === this.selected, run: id === this.running })), padding: 0 });
    if (node.size.width !== m.w || node.size.height !== m.h) node.setSize(m.w, m.h);
    const want = portList(step, m), keep = new Set(want.map((p) => p.id));
    for (const port of node.getPorts()) {
      if (keep.has(port.id)) continue;
      for (const l of this.model.getLinks()) if (l.sourcePortId === port.id || l.targetPortId === port.id) this.model.removeLink(l.id);
      node.removePort(port.id);
    }
    for (const p of want) {
      const have = node.getPort(p.id);
      if (!have) { node.addPort(portModel(p)); continue; }
      const a = have.layout && have.layout.args;
      if (!a || a.x !== p.x || a.y !== p.y) {
        // Re-seat a moved port under the SAME id, so its lines stay attached.
        node.removePort(p.id);
        node.addPort(portModel(p));
      }
    }
  }

  private outLink(pid: string): any { return this.model?.getLinks().find((l: any) => l.sourcePortId === pid) || null; }
  private stepOf(l: any): string | undefined { return this.model.getNodeByPortId(l.targetPortId)?.id; }
  private connect(srcPid: string, tgtId: string): any {
    for (const l of this.model.getLinks()) if (l.sourcePortId === srcPid) this.model.removeLink(l.id);
    const l: any = new LinkModel(srcPid, tgtId + '__in', 'bezier' as never);
    l.sourceNodeId = this.model.getNodeByPortId(srcPid)?.id;
    l.targetNodeId = tgtId;
    l.updateStyle(lineStyle(srcPid));
    this.model.addLink(l);
    return l;
  }

  // ---- the top bar, zoom and frame ------------------------------------------
  private markDirty(): void {
    this.savedText = '● Unsaved changes'; this.dirty = true; this.publishDisabled = false;
    this.bump();
  }
  publish(): void {
    this.savedText = '✓ Published'; this.dirty = false; this.publishDisabled = true;
    this.bump();
  }
  private frame(): void { this.api.fitView(60); this.api.renderNow(); }
  zoomIn(): void { this.api.viewport.setZoom(this.api.viewport.getZoom() * 1.2); this.api.renderNow(); }
  zoomOut(): void { this.api.viewport.setZoom(this.api.viewport.getZoom() / 1.2); this.api.renderNow(); }
  async tidy(): Promise<void> {
    await this.engine.layout('dagre', { direction: 'LR', nodeSpacing: 36, rankSpacing: 90 });
    this.frame(); this.markDirty();
  }

  // ---- selection drives the editor -----------------------------------------
  private select(id: string | null): void {
    const prev = this.selected;
    this.selected = id && this.steps.has(id) ? id : null;
    if (prev && prev !== this.selected) this.paint(prev);
    if (this.selected) this.paint(this.selected);
    this.api.renderNow();
    this.secsTyped = new WeakMap();
    this.bump();
  }
  /** Select a step on the canvas (the selection event then opens it on the left). */
  selectStep(id: string | null): void {
    this.model.clearSelection?.();
    const n = id ? this.model.getNode(id) : null;
    if (n) this.model.selectNode(n); else this.select(null);
    this.api.renderNow();
  }

  // ---- new steps -------------------------------------------------------------
  private newStep(kind: string, x: number, y: number): Step {
    const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
    const step: Step = kind === 'actions'
      ? { id, kind, title: 'Actions', x, y, actions: [{ id: 'a1', label: 'Notify assignees', sub: '1 person via e-mail' }] }
      : { id, kind: 'message', title: `Send Message #${this.seq++}`, x, y, blocks: [{ id: 't', kind: 'text', text: '', buttons: [] }] };
    this.steps.set(id, step);
    const spec = nodeSpec(step);
    const node: any = new NodeModel({ id, type: 'rect', position: { x, y }, size: spec.size } as never);
    node.ports.clear();
    for (const p of portList(step, measure(step))) node.addPort(portModel(p));
    for (const [k, v] of Object.entries(spec.metadata)) node.setMetadata(k, v);
    node.setMetadata('shape', spec.shape);
    node.behavior.resizable = false;
    node.style = { ...node.style, ...spec.style };
    this.model.addNode(node);
    this.markDirty();
    return step;
  }

  // ---- "Choose next step": from the sidebar, the + button, or a line let go on empty canvas
  private openMenu(clientX: number, clientY: number, mctx: MenuCtx): void {
    const r = this.host.getBoundingClientRect();
    this.menuCtx = mctx;
    this.menuLeft = Math.min(Math.max(8, clientX - r.left), r.width - 240);
    this.menuTop = Math.min(Math.max(54, clientY - r.top), r.height - 140);
    this.menuOpen = true;
    this.bump();
    const menu = () => this.host.querySelector<HTMLElement>('#mc-menu');
    this.whenRendered(() => !!menu() && !menu()!.hidden, () => menu()!.querySelector('button')?.focus({ preventScroll: true }));
  }
  closeMenu(): void {
    if (!this.menuOpen && !this.menuCtx) return;
    this.menuOpen = false; this.menuCtx = null;
    this.bump();
  }
  pickMenu(kind: 'message' | 'actions'): void {
    if (!this.menuCtx) return;
    const { world, from } = this.menuCtx;
    this.closeMenu();
    const step = this.newStep(kind, Math.round(world.x), Math.round(world.y - 24));
    if (from) this.connect(from, step.id);
    this.api.renderNow();
    this.selectStep(step.id);
  }
  private viewCentre() {
    const r = this.host.getBoundingClientRect();
    return this.api.viewport.clientToWorld(r.left + r.width / 2 - 110, r.top + r.height / 2 - 60, r);
  }
  /** The blue + : a new step in the middle of the view. */
  fab(r: DOMRect): void { this.openMenu(r.left - 236, r.bottom + 8, { world: this.viewCentre(), from: null }); }

  // ---- the step editor -------------------------------------------------------
  private blockOf(step: Step, id?: string): Block | undefined { return step.blocks?.find((b) => b.id === id); }
  private changed(rerenderSide: boolean): void {
    this.paint(this.selected); this.api.renderNow(); this.markDirty();
    if (rerenderSide) this.secsTyped = new WeakMap();
    this.bump();
  }
  /** A keystroke in the editor: `field` as the page names it (title, text, btn, collect, secs, caption, a-label, a-sub). */
  edit(field: string, value: string, blockId?: string, itemId?: string): void {
    const step = this.step;
    if (!step) return;
    const b = this.blockOf(step, blockId);
    if (field === 'title') step.title = value;
    else if (field === 'text' && b) b.text = value;
    else if (field === 'btn' && b) { const x = b.buttons!.find((y) => y.id === itemId); if (x) x.title = value; }
    else if (field === 'collect' && b) b.field = value;
    else if (field === 'secs' && b) { b.secs = Math.max(1, Math.min(20, Number(value) || 1)); this.secsTyped.set(b, value); }
    else if (field === 'caption' && b) b.caption = value;
    else if (field === 'a-label' || field === 'a-sub') {
      const a = step.actions?.find((x) => x.id === itemId);
      if (a) a[field === 'a-label' ? 'label' : 'sub'] = value;
    }
    this.changed(false);
  }
  addButton(blockId: string): void {
    const b = this.step && this.blockOf(this.step, blockId);
    if (!b) return;
    b.buttons!.push({ id: uid(), title: 'Button ' + (b.buttons!.length + 1) });
    this.changed(true);
    const inputs = () => this.root.querySelectorAll<HTMLInputElement>(`#side input[data-block="${b.id}"][data-field="btn"]`);
    this.whenRendered(() => inputs().length === b.buttons!.length, () => { const all = inputs(); all[all.length - 1].select(); });
  }
  removeButton(blockId: string, btnId: string): void {
    const b = this.step && this.blockOf(this.step, blockId);
    if (!b) return;
    b.buttons = b.buttons!.filter((x) => x.id !== btnId);
    this.changed(true);
  }
  toggleUrl(blockId: string, btnId: string): void {
    const x = this.step && this.blockOf(this.step, blockId)?.buttons?.find((y) => y.id === btnId);
    if (!x) return;
    x.url = x.url ? undefined : URL_BOOK;
    this.changed(true);
  }
  removeBlock(blockId: string): void {
    const step = this.step;
    if (!step?.blocks) return;
    step.blocks = step.blocks.filter((x) => x.id !== blockId);
    this.changed(true);
  }
  addBlock(k: 'text' | 'image' | 'delay' | 'collect'): void {
    const step = this.step;
    if (!step?.blocks) return;
    if (k === 'collect' && step.blocks.some((x) => x.kind === 'collect')) return;
    step.blocks.push(k === 'text' ? { id: uid(), kind: 'text', text: '', buttons: [] } : k === 'image' ? { id: uid(), kind: 'image', caption: 'Our office' }
      : k === 'delay' ? { id: uid(), kind: 'delay', secs: 2 } : { id: uid(), kind: 'collect', field: 'Email' });
    this.changed(true);
  }
  addAction(): void { const s = this.step; if (!s?.actions) return; s.actions.push({ id: uid(), label: 'Add tag', sub: 'New lead' }); this.changed(true); }
  removeAction(id: string): void { const s = this.step; if (!s?.actions) return; s.actions = s.actions.filter((x) => x.id !== id); this.changed(true); }
  addTrigger(): void { const s = this.step; if (!s?.triggers) return; s.triggers.push({ label: 'User comments on a post', sub: 'Any post' }); this.changed(true); }
  /** "Choose Next Step": the menu opens beside the button, the new step lands right of the card. */
  chooseNext(r: DOMRect): void {
    const step = this.step;
    if (!step) return;
    const node = this.model.getNode(step.id), from = step.kind === 'trigger' ? step.id + '__then' : step.id + '__next';
    this.openMenu(r.right + 12, r.top - 40, { world: { x: node.position.x + node.size.width + 90, y: node.position.y + 24 }, from });
  }
  /** Through the engine's command stack, so ⌘Z / Ctrl+Z brings the step back. */
  deleteStep(): void {
    const step = this.step;
    if (!step) return;
    this.engine.removeNode(step.id).then(() => { this.api.renderNow(); this.markDirty(); });
  }

  // ---- Preview: the bot, run along the links ---------------------------------
  private push(item: Omit<ChatItem, 'id'>): ChatItem {
    const it = { id: ++this.chatSeq, ...item };
    this.chat = [...this.chat, it];
    this.bump();
    this.scrollSoon();
    return it;
  }
  private scroll(): void {
    const chat = this.host?.querySelector('#pv-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
  private bubble(cls: string, text: string): void { this.push({ kind: 'msg', cls, text }); }
  private sys(text: string, act = false): void { this.push({ kind: 'sys', text, act }); }
  // Pan (briefly animated) until a card sits inside the free part of the canvas.
  private reveal(id: string): void {
    const node = this.model.getNode(id);
    if (!node) return;
    const r = this.host.getBoundingClientRect(), vp = this.api.viewport, z = vp.getZoom();
    const a = vp.worldToClient(node.position.x, node.position.y, r);
    const b = vp.worldToClient(node.position.x + node.size.width, node.position.y + node.size.height, r);
    const free = { left: r.left + 24, right: r.right - (this.previewOn ? 372 : 24), top: r.top + 64, bottom: r.bottom - 24 };
    if (a.x >= free.left && b.x <= free.right && a.y >= free.top && b.y <= free.bottom) return;
    const tx = (free.left + free.right) / 2, ty = Math.min((free.top + free.bottom) / 2, free.top + (b.y - a.y) / 2);
    const dx = ((a.x + b.x) / 2 - tx) / z, dy = ((a.y + b.y) / 2 - ty) / z;
    const from = vp.getViewport(), t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    const job = ++this.panAnim;
    const step = (now: number) => {
      if (job !== this.panAnim) return;
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      vp.setViewport({ ...from, x: from.x + dx * e, y: from.y + dy * e });
      this.api.renderNow();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  private setRunning(id: string | null, link?: any): void {
    const prev = this.running;
    this.running = id;
    if (prev) this.paint(prev);
    if (id) { this.paint(id); this.reveal(id); }
    if (this.runningLink && this.model.getLink?.(this.runningLink.id) !== undefined) this.runningLink.updateStyle(lineStyle(this.runningLink.sourcePortId));
    this.runningLink = link || null;
    if (this.runningLink) this.runningLink.updateStyle(lineStyle(this.runningLink.sourcePortId, true));
    this.api.renderNow();
  }
  private setWaiting(w: Waiting | null): void {
    this.waiting = w;
    this.bump();
    this.scrollSoon();   // the wait bar changes the chat's height
    const box = () => this.host.querySelector<HTMLInputElement>('#pv-input');
    if (w) this.whenRendered(() => !!box() && !box()!.disabled, () => box()!.focus({ preventScroll: true }));
  }
  private async typing(ms: number, t: number): Promise<boolean> {
    const it = this.push({ kind: 'typing' });
    await sleep(ms * this.pvSpeed);
    this.chat = this.chat.filter((x) => x !== it);
    this.bump();
    return t === this.P.token;
  }
  private endFlow(): void { this.sys('— end of this flow —'); }
  private async follow(pid: string, t: number): Promise<boolean> {
    const l = this.outLink(pid);
    if (!l) return false;
    await this.go(this.stepOf(l), t, l);
    return true;
  }
  private async go(id: string | undefined, t: number, link?: any): Promise<void> {
    if (t !== this.P.token) return;
    const step = id ? this.steps.get(id) : undefined;
    if (!step) { this.endFlow(); return; }
    this.setRunning(step.id, link);
    if (step.kind === 'trigger') { if (!(await this.follow(step.id + '__then', t))) this.endFlow(); return; }
    if (step.kind === 'actions') {
      for (const a of step.actions!) this.sys(`⚡ ${a.label} · ${a.sub}`, true);
      await sleep(300 * this.pvSpeed);
      await this.follow(step.id + '__next', t);
      return;
    }
    let waitsForTap = false;
    for (const b of step.blocks!) {
      if (t !== this.P.token) return;
      if (b.kind === 'delay') { if (!(await this.typing(Math.min(1400, b.secs! * 350), t))) return; }
      else if (b.kind === 'image') this.bubble('pv-img', '🖼  ' + (b.caption || 'Image'));
      else if (b.kind === 'text') {
        if (!(await this.typing(420, t))) return;
        if (b.text!.trim()) this.bubble('pv-bot', b.text!);
        if (b.buttons!.length) {
          const row = this.push({ kind: 'btns', buttons: b.buttons!.map((btn) => ({ label: (btn.url ? '↗ ' : '') + (btn.title || 'Button'), chosen: false })) });
          this.btnRows.set(row.id, { stepId: step.id, buttons: [...b.buttons!] });
          if (b.buttons!.some((x) => !x.url)) waitsForTap = true;
        }
      } else if (b.kind === 'collect') {
        this.setWaiting({ stepId: step.id, field: b.field!, ar: step.blocks!.some((x) => x.kind === 'text' && isArabic(x.text!)) });
        return;
      }
    }
    // Next Step fires once the message has gone out.
    if (await this.follow(step.id + '__next', t)) return;
    if (!waitsForTap) this.endFlow();
  }
  /** A button in the chat, tapped: it follows that button's own line. */
  async tap(rowId: number, index: number): Promise<void> {
    const row = this.btnRows.get(rowId), btn = row?.buttons[index];
    if (!row || !btn) return;
    this.chat = this.chat.map((x) => x.id !== rowId ? x
      : { ...x, buttons: x.buttons!.map((b, i) => i === index ? { ...b, chosen: true } : b) });
    this.bubble('pv-user', btn.title || 'Button');
    if (btn.url) { this.sys(`Opens ${btn.url.replace(/^https?:\/\//, '')} in the browser`); return; }
    this.setWaiting(null);
    const tok = ++this.P.token;
    if (!(await this.follow(`${row.stepId}__b_${btn.id}`, tok))) this.endFlow();
  }
  setPvText(v: string): void { this.pvText = v; this.bump(); }
  /** The reply box: an invalid answer is asked again; a valid one runs "on reply", then Next Step. */
  async submit(): Promise<void> {
    const w = this.waiting, text = this.pvText.trim();
    if (!w || !text) return;
    this.pvText = '';
    // Clear the box itself too: a framework that batches renders (Qwik) may
    // never have drawn the typed text, so '' would look unchanged to it.
    const box = this.host.querySelector<HTMLInputElement>('#pv-input');
    if (box) box.value = '';
    this.bubble('pv-user', text);
    const t = this.P.token;
    if (!VALID[w.field].test(text)) {
      if (!(await this.typing(380, t))) return;
      this.bubble('pv-bot', w.ar ? 'يبدو أن هذا ليس رقم هاتف صحيحاً، حاول مرة أخرى.' : `That doesn't look like a valid ${w.field.toLowerCase()} — please try again.`);
      return;
    }
    this.setWaiting(null);
    const reply = this.outLink(w.stepId + '__reply');
    if (reply) await this.go(this.stepOf(reply), t, reply);
    if (t !== this.P.token) return;
    if (!(await this.follow(w.stepId + '__next', t))) this.endFlow();
  }
  /** "No reply (24 h)": follow the red line. */
  async noReply(): Promise<void> {
    const w = this.waiting;
    if (!w) return;
    this.setWaiting(null);
    this.sys('⏱ 24 hours pass with no reply');
    if (!(await this.follow(w.stepId + '__noreply', this.P.token))) this.endFlow();
  }
  /** Restart the conversation from the trigger. */
  start(): Promise<void> {
    const t = ++this.P.token;
    this.chat = [];
    this.btnRows.clear();
    this.setWaiting(null);
    this.bubble('pv-user', 'Hi!');
    return this.go('trigger', t);
  }
  setPreview(on: boolean): Promise<void> | void {
    this.previewOn = on;
    this.bump();
    if (on) return this.start();
    this.P.token++; this.setWaiting(null); this.setRunning(null);
  }
  togglePreview(): void { void this.setPreview(!this.previewOn); }

  // The page did these at once; here the framework draws the state first. Run
  // `fn` ONCE, on the first frame the drawn page is `ready` for it (a second
  // run could select a title the user has already started typing over).
  private whenRendered(ready: () => boolean, fn: () => void, frames = 30): void {
    const attempt = () => { if (ready()) fn(); else if (--frames > 0) requestAnimationFrame(attempt); };
    setTimeout(() => requestAnimationFrame(attempt), 0);
  }
  private scrollSoon(): void {
    setTimeout(() => requestAnimationFrame(() => { this.scroll(); requestAnimationFrame(() => this.scroll()); }), 0);
  }
}
