/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The framework-free half of the Visio-style editor port — every line of it
 * is the JS page's own wiring (demos/diagrams/visio-editor.html), moved here so
 * the four framework versions share ONE copy instead of four drifting ones.
 *
 * The framework file owns the chrome — the toolbar, the zoom cluster and the
 * context menu are rendered by React/Vue/Angular/Qwik from `VisioUi` — and this
 * controller owns the engine: interaction config, page grid + minimap, the
 * stencil rail and shape-data panel, the "Fulfilment" container, the marquee
 * tool, the keyboard chords and the commands behind every button. Each state
 * change is handed back through `onChange(ui)` as a fresh plain object.
 *
 * (Copied verbatim next to the demo in each app — keep the copies identical.)
 */
import {
  registerStencils, bindStencilPalette, bindShapeDataPanel,
  AlignCommand, DistributeCommand, registerTool,
  BringNodeToFrontCommand, SendNodeToBackCommand,
  attachCanvasPlugins, GroupModel, AddGroupCommand, RemoveGroupCommand,
} from '@grafloria/element';

// A SCENARIO, not a shape dump: an order-fulfilment flow you could actually
// hand to someone — the flowchart is the process, the container groups the
// fulfilment steps, and the ER table is the data behind it.
export const VISIO_NODES = [
  { id: 'recv', position: { x: 120, y: 120 }, size: { width: 150, height: 56 }, label: 'Order received' },
  { id: 'chk', position: { x: 340, y: 120 }, size: { width: 150, height: 56 }, label: 'Stock check' },
  { id: 'pick', position: { x: 340, y: 330 }, size: { width: 150, height: 56 }, label: 'Pick items' },
  { id: 'ship', position: { x: 340, y: 430 }, size: { width: 150, height: 56 }, label: 'Ship' },
];
export const VISIO_EDGES = [
  { id: 'e1', source: 'recv', target: 'chk' },
  { id: 'e2', source: 'chk', target: 'pick', label: 'in stock' },
  { id: 'e3', source: 'pick', target: 'ship' },
];

export type BarAction =
  | 'left' | 'right' | 'top' | 'bottom' | 'center-y' | 'center-x'
  | 'dist-h' | 'dist-v' | 'duplicate' | 'group' | 'ungroup' | 'undo' | 'redo';
export type ViewToggle = 'grid' | 'snap' | 'minimap';
export type BarItem =
  | { kind: 'sep' }
  | { kind: 'action'; action: BarAction; label: string; title: string }
  | { kind: 'toggle'; toggle: ViewToggle; label: string; title: string };

/** The toolbar, left to right — the JS page's mk/mkN/mkToggle calls, as data. */
export const BAR: BarItem[] = [
  // T3 — the align/distribute toolbar over the live selection.
  { kind: 'action', action: 'left', label: '⇤ Left', title: 'Align left edges (2+ shapes)' },
  { kind: 'action', action: 'right', label: '⇥ Right', title: 'Align right edges (2+ shapes)' },
  { kind: 'action', action: 'top', label: '⤒ Top', title: 'Align top edges (2+ shapes)' },
  { kind: 'action', action: 'bottom', label: '⤓ Bottom', title: 'Align bottom edges (2+ shapes)' },
  { kind: 'action', action: 'center-y', label: '≡ Middle', title: 'Align horizontal middles (2+ shapes)' },
  { kind: 'action', action: 'center-x', label: '‖ Centre', title: 'Align vertical centres (2+ shapes)' },
  { kind: 'sep' },
  { kind: 'action', action: 'dist-h', label: '↔ Distribute', title: 'Equal horizontal gaps (3+ shapes)' },
  { kind: 'action', action: 'dist-v', label: '↕ Distribute', title: 'Equal vertical gaps (3+ shapes)' },
  { kind: 'sep' },
  { kind: 'action', action: 'duplicate', label: '⧉ Duplicate', title: 'Duplicate the selection (Ctrl/⌘+D)' },
  { kind: 'sep' },
  { kind: 'action', action: 'group', label: '⊞ Group', title: 'Group the selection into a container (Ctrl/⌘+G, 2+ shapes)' },
  { kind: 'action', action: 'ungroup', label: '⊟ Ungroup', title: 'Dissolve the selected shape’s group (Ctrl/⌘+Shift+G)' },
  { kind: 'sep' },
  { kind: 'action', action: 'undo', label: '↶ Undo', title: 'Undo the last edit' },
  { kind: 'action', action: 'redo', label: '↷ Redo', title: 'Redo the undone edit (Ctrl/⌘+Y)' },
  { kind: 'sep' },
  // View toggles — pressed-state buttons driving the LIBRARY's own switches.
  { kind: 'toggle', toggle: 'grid', label: '▦ Grid', title: 'Show the page grid' },
  { kind: 'toggle', toggle: 'snap', label: '⌗ Snap', title: 'Snap dragged shapes and edge points to the 20px grid' },
  { kind: 'toggle', toggle: 'minimap', label: '◱ Minimap', title: 'Show the minimap' },
];

export interface MenuEntry { label: string; enabled: boolean }

/** Everything the chrome paints — plain data, safe for any framework's store. */
export interface VisioUi {
  /** How many nodes are selected (drives every "needs N shapes" button). */
  selected: number;
  canUngroup: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The zoom readout, e.g. "100%". */
  zoomPct: string;
  grid: boolean;
  snap: boolean;
  minimap: boolean;
  /** The open context menu, positioned in #vs-canvas-local px, or null. */
  menu: { x: number; y: number; items: MenuEntry[] } | null;
}

export function initialUi(): VisioUi {
  return {
    selected: 0, canUngroup: false, canUndo: false, canRedo: false,
    zoomPct: '100%', grid: true, snap: true, minimap: true, menu: null,
  };
}

/** Each button declares how many shapes it needs; below that it is DISABLED,
 *  not silently inert — an enabled control that does nothing is a bug. */
export function barDisabled(item: BarItem, ui: VisioUi): boolean {
  if (item.kind !== 'action') return false;
  switch (item.action) {
    case 'dist-h': case 'dist-v': return ui.selected < 3;
    case 'duplicate': return ui.selected < 1;
    case 'group': return ui.selected < 2;          // Visio's own minimum
    case 'ungroup': return !ui.canUngroup;
    case 'undo': return !ui.canUndo;
    case 'redo': return !ui.canRedo;
    default: return ui.selected < 2;               // the six aligns
  }
}

const ZOOM_STEP = 1.2;

export interface VisioHosts {
  /** #vs-canvas — wraps the diagram; drop target, menu/zoom positioning box. */
  canvas: HTMLElement;
  /** #vs-rail — the stencil palette paints into it. */
  rail: HTMLElement;
  /** #vs-panel — the shape-data panel paints into it. */
  panel: HTMLElement;
}

export class VisioEditor {
  readonly ui: VisioUi = initialUi();
  readonly diagram: any;
  readonly engine: any;
  /** How many stencil masters the registry took (the JS assert pins 80). */
  registered = 0;
  palette: any = null;
  panel: any = null;
  /** The seeded "Fulfilment" container. */
  box: any = null;

  private plugins: { dispose(): void } | null = null;
  private offs: Array<() => void> = [];
  private menuRuns: Array<() => unknown> = [];
  private disposed = false;

  constructor(
    private readonly api: any,
    private readonly hosts: VisioHosts,
    private readonly onChange: (ui: VisioUi) => void,
  ) {
    this.diagram = api.getModel();
    this.engine = api.getEngine();
  }

  /** The live DiagramInstance (named like the JS page's ctx.instance). */
  get instance(): any { return this.api; }

  async init(): Promise<void> {
    try { await this.setup(); } catch (e) { if (!this.disposed) throw e; }
  }

  private async setup(): Promise<void> {
    const { api, engine, hosts } = this;

    // Every gesture this editor wants — each opt-in at the library level.
    engine.setInteractionConfig({
      enableHelperLines: true,            // T1 + T2: snap guides on drag and resize
      enableGroupMembershipOnDrop: true,  // T8: drop into a container to join it
      enableInPlaceTextEdit: true,        // T10: double-click to rename
      enableGroupDrag: true,
      enableKeyboardNudge: true,          // arrows nudge the selection (Shift = ×10)
      // Draw a connector by dragging from a port and releasing ANYWHERE on the
      // target node; 'alt' keeps a plain body press as MOVE and shift-click as
      // multi-select, while a press on a port glyph always starts a wire.
      enableEasyConnect: true,
      easyConnectModifier: 'alt',
    });

    // GRID — the faint Visio page grid (the Background plugin: an SVG pattern
    // in its own camera-tracked layer). The 20-unit gap equals the snap
    // gridSize: what you see is what you snap to. MINIMAP — the library's live
    // one, slightly smaller than default, nudged above the zoom cluster.
    this.plugins = attachCanvasPlugins(api, {
      background: {
        variant: 'lines', gap: 20, size: 1,
        color: 'rgba(120,130,145,.16)',
        majorEvery: 5, majorColor: 'rgba(120,130,145,.30)',
      },
      minimap: { width: 170, height: 120 },
    } as any);
    const mm = hosts.canvas.querySelector('.grafloria-minimap') as HTMLElement | null;
    if (mm) mm.style.bottom = '76px';   // clear the zoom cluster below it

    // ZOOM — the readout follows the instance's own ViewportController.
    this.offs.push(api.viewport.onChange(() => this.paintPct()));
    this.paintPct();

    // Keyboard chords every canvas product answers (never while typing).
    this.listen('keydown', this.onChord);

    // SNAP-TO-GRID — Visio defaults snap ON, so does this editor.
    this.setSnap(true);

    // T4/T5 — all 8 stencils behind the registry, feeding the palette; T9 —
    // the shape-data panel, driven by each master's dataSchema (or a kit card).
    this.registered = registerStencils(engine.templateRegistry);
    this.palette = bindStencilPalette(api, { palette: hosts.rail, canvas: hosts.canvas }, {
      data: (master: any) => ({ label: master.meta?.name ?? master.id }),
    });
    this.panel = bindShapeDataPanel(api, hosts.panel);

    // A container to drop shapes into (T8). MEMBERSHIP, not just overlap: a
    // frame drawn around two nodes that left them behind on a drag would read
    // as a bug, because the picture says otherwise.
    const box = await engine.addGroup({ name: 'Fulfilment' });
    if (this.disposed) return;
    box.setFrame({ x: 300, y: 290, width: 240, height: 230 });
    await engine.addToGroup(box.id, 'pick');
    await engine.addToGroup(box.id, 'ship');
    if (this.disposed) return;
    this.box = box;

    // MARQUEE — rubber-band select on EMPTY canvas (not inside a container's
    // frame, which drags the container), through the public registerTool seam.
    this.offs.push(registerTool(this.marqueeTool()) as unknown as () => void);

    // CONTEXT MENU — click-away and Escape dismiss it, like every real menu.
    // (A press in the zoom cluster leaves it open: on the JS page that cluster
    // stops pointerdown from propagating, so the dismiss listener never sees it.)
    this.listen('pointerdown', (e: Event) => {
      const t = e.target as Element | null;
      if (!t?.closest?.('#vs-menu, #vs-zoom')) this.closeMenu();
    });
    this.listen('keydown', (e: Event) => { if ((e as KeyboardEvent).key === 'Escape') this.closeMenu(); });

    this.offs.push(api.on('selection:change', () => this.syncBar()));
    this.syncBar();
    api.renderNow();

    // The port's gesture script reads the model through this — the JS page's
    // gate reads the same objects through the shell's window.__demoCtx.
    (globalThis as any).__visioEditor = this;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* instance already gone */ } }
    this.palette?.destroy();
    this.panel?.destroy();
    this.plugins?.dispose();
    if ((globalThis as any).__visioEditor === this) delete (globalThis as any).__visioEditor;
  }

  // ── zoom cluster: −  %  +  fit (each one call into the ViewportController) ──
  zoomIn(): void { this.api.viewport.setZoom(this.api.viewport.getZoom() * ZOOM_STEP); this.api.renderNow(); }
  zoomOut(): void { this.api.viewport.setZoom(this.api.viewport.getZoom() / ZOOM_STEP); this.api.renderNow(); }
  zoomReset(): void { this.api.viewport.setZoom(1); this.api.renderNow(); }
  fit(): void { this.api.fitView(); this.api.renderNow(); }

  // ── the toolbar ──────────────────────────────────────────────────────────
  /** A bar button. Exactly like the JS page's mk(), EVERY action — Undo and
   *  Redo included — runs only while something is selected. */
  async run(action: BarAction): Promise<void> {
    const ids = this.selectedIds();
    const cm = this.engine.commandManager;
    const later = () => setTimeout(() => this.syncBar(), 0);
    if (!ids.length) {
      if (action === 'undo' || action === 'redo') later();
      return;
    }
    switch (action) {
      case 'left': case 'right': case 'top': case 'bottom': case 'center-y': case 'center-x':
        await cm.execute(new AlignCommand(ids, action)); break;
      case 'dist-h': await cm.execute(new DistributeCommand(ids, 'horizontal')); break;
      case 'dist-v': await cm.execute(new DistributeCommand(ids, 'vertical')); break;
      case 'duplicate': await this.engine.duplicate(); break;
      case 'group': await this.groupSelection(); return;
      case 'ungroup': await this.ungroupSelection(); return;
      case 'undo': later(); await cm.undo(); break;
      case 'redo': later(); await cm.redo(); break;
    }
    later();
  }

  /** A view toggle — each drives the LIBRARY's own switch, not a local flag:
   *  Grid flips DiagramStore.gridEnabled (the Background plugin watches it),
   *  Snap the engine's snap-to-grid config, Minimap DiagramStore.showMinimap. */
  toggle(which: ViewToggle): void {
    const on = !this.ui[which];
    this.ui[which] = on;
    if (which === 'grid') this.engine.getStore().set('gridEnabled', on);
    else if (which === 'snap') this.setSnap(on);
    else this.engine.getStore().set('showMinimap', on);
    this.api.renderNow();
    this.emit();
  }

  /** setInteractionConfig merges SHALLOWLY, so patch the nested objects whole.
   *  Alignment guides still win over the grid per axis (computeSnap). */
  setSnap(on: boolean): void {
    const cfg = this.engine.getInteractionConfig();
    this.engine.setInteractionConfig({
      waypointEditor: { ...cfg.waypointEditor, snapToGrid: on },
      controlPointEditor: { ...cfg.controlPointEditor, snapToGrid: on },
    });
  }

  // ── group / ungroup — real containers, ONE undo step each ────────────────
  // The GroupModel is populated (members + fitted frame) BEFORE it enters the
  // diagram, so a single AddGroupCommand carries the whole creation; ungroup's
  // RemoveGroupCommand snapshots the group, so one Ctrl+Z resurrects it whole.
  async groupSelection(): Promise<any> {
    const ids = this.selectedIds();
    if (ids.length < 2) return null;
    const g = new GroupModel({ name: 'Group' } as any);
    for (const id of ids) g.addMember(id);
    g.fitToContents(this.diagram);
    await this.engine.commandManager.execute(new AddGroupCommand(g));
    this.api.renderNow();
    this.syncBar();
    return this.diagram.getGroup(g.id);
  }

  async ungroupSelection(): Promise<string | null> {
    const g = this.groupInScope();
    if (!g) return null;
    await this.engine.commandManager.execute(new RemoveGroupCommand(g.id));
    this.api.renderNow();
    this.syncBar();
    return g.id;
  }

  // ── context menu: node / edge / canvas, every entry an existing command ──
  openMenuAt(clientX: number, clientY: number): void {
    const { api, diagram, engine } = this;
    const rect = this.hosts.canvas.getBoundingClientRect();
    const w = api.viewport.clientToWorld(clientX, clientY, rect);
    const node = diagram.getNodeAtPosition(w.x, w.y);
    const link = node ? null : api.interaction.getLinkAtPosition(w.x, w.y, engine);
    let entries: Array<{ label: string; run: () => unknown; enabled?: boolean }>;
    if (node) {
      // Right-click selects what it targets, so Duplicate/Delete act on the
      // node the user sees lit.
      if (!node.isSelected?.()) { diagram.selectNode(node); api.renderNow(); this.syncBar(); }
      entries = [
        { label: 'Rename', run: () => api.beginLabelEdit({ type: 'node', nodeId: node.id }) },
        { label: 'Duplicate', run: () => engine.duplicate() },
        { label: 'Delete', run: () => engine.removeNode(node.id) },
        { label: 'Bring to front', run: () => engine.commandManager.execute(new BringNodeToFrontCommand(node.id)) },
        { label: 'Send to back', run: () => engine.commandManager.execute(new SendNodeToBackCommand(node.id)) },
      ];
    } else if (link) {
      entries = [
        // Rename edits an EXISTING label (a labels[] entry or the display
        // label); a truly unlabeled edge shows the entry disabled.
        { label: 'Rename label', run: () => api.beginLabelEdit({ type: 'link-label', linkId: link.id, labelIndex: 0 }),
          enabled: (link.labels?.length ?? 0) > 0 || !!link.getLabel?.() },
        { label: 'Delete', run: () => engine.removeLink(link.id) },
      ];
    } else {
      entries = [
        { label: 'Select all', run: () => { diagram.selectAll(); } },
        { label: 'Paste', run: () => engine.paste(), enabled: engine.hasClipboardData?.() === true },
      ];
    }
    this.menuRuns = entries.map((e) => e.run);
    this.ui.menu = {
      x: clientX - rect.left,
      y: clientY - rect.top,
      items: entries.map((e) => ({ label: e.label, enabled: e.enabled !== false })),
    };
    this.emit();
  }

  async runMenuItem(index: number): Promise<void> {
    const run = this.menuRuns[index];
    this.closeMenu();
    if (!run) return;
    await run();
    this.api.renderNow();
    this.syncBar();
  }

  closeMenu(): void {
    if (!this.ui.menu) return;
    this.ui.menu = null;
    this.emit();
  }

  // ── state ────────────────────────────────────────────────────────────────
  syncBar(): void {
    const cm = this.engine.commandManager;
    this.ui.selected = this.selectedIds().length;
    this.ui.canUngroup = !!this.groupInScope();
    this.ui.canUndo = !!cm.canUndo?.();
    this.ui.canRedo = !!cm.canRedo?.();
    this.emit();
  }

  private paintPct(): void {
    this.ui.zoomPct = `${Math.round(this.api.viewport.getZoom() * 100)}%`;
    this.emit();
  }

  private emit(): void {
    if (this.disposed) return;
    const { menu } = this.ui;
    this.onChange({ ...this.ui, menu: menu ? { ...menu, items: menu.items.map((m) => ({ ...m })) } : null });
  }

  private selectedIds(): string[] {
    return this.diagram.getSelectedNodes().map((n: any) => n.id);
  }

  private groupInScope(): any {
    const sel = this.selectedIds();
    if (!sel.length) return null;
    return this.diagram.getGroups().find((g: any) => sel.some((id) => g.members.has(id))) ?? null;
  }

  private listen(type: string, handler: (e: Event) => void): void {
    document.addEventListener(type, handler);
    this.offs.push(() => document.removeEventListener(type, handler));
  }

  /** Ctrl/⌘+= in, Ctrl/⌘+− out, Ctrl/⌘+0 → 100%, Ctrl/⌘+Shift+F → fit,
   *  Ctrl/⌘+G group, +Shift ungroup. preventDefault keeps the BROWSER's
   *  zoom/find out of it. Never while typing in a field. */
  private onChord = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (!(e.ctrlKey || e.metaKey)) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); this.zoomIn(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomOut(); }
    else if (e.key === '0') { e.preventDefault(); this.zoomReset(); }
    else if (e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); this.fit(); }
    else if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      if (e.shiftKey) void this.ungroupSelection();
      else void this.groupSelection();
    }
  };

  /** The rubber band: Shift or Ctrl/⌘ adds; Escape (routed to onCancel by the
   *  binder) removes the band AND rolls the selection back to before the press. */
  private marqueeTool(): any {
    const { api, diagram } = this;
    const host: HTMLElement = api.container;   // the diagram's own box (= #vs-canvas's)
    let overlay: HTMLDivElement | null = null;
    let start: { world: { x: number; y: number }; screen: { x: number; y: number } } | null = null;
    let baseSelection = new Set<string>();
    const showBox = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'vs-marquee';
        overlay.style.cssText =
          'position:absolute;pointer-events:none;z-index:20;border:1px dashed #3B52D9;' +
          'background:rgba(59,82,217,.12);border-radius:2px;';
        host.appendChild(overlay);
      }
      overlay.style.left = Math.min(a.x, b.x) + 'px';
      overlay.style.top = Math.min(a.y, b.y) + 'px';
      overlay.style.width = Math.abs(b.x - a.x) + 'px';
      overlay.style.height = Math.abs(b.y - a.y) + 'px';
    };
    const clearBox = () => { overlay?.remove(); overlay = null; };
    const worldBounds = (n: any) => {
      const p = typeof n.getWorldPosition === 'function' ? n.getWorldPosition() : n.position;
      return { x: p.x, y: p.y, w: n.size.width, h: n.size.height };
    };
    const additiveOf = (ev: any) => ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
    const applySelection = (rect: { ax: number; ay: number; bx: number; by: number }, additive: boolean) => {
      const x1 = Math.min(rect.ax, rect.bx), y1 = Math.min(rect.ay, rect.by);
      const x2 = Math.max(rect.ax, rect.bx), y2 = Math.max(rect.ay, rect.by);
      for (const n of diagram.getNodes()) {
        const b = worldBounds(n);
        const inside = b.x >= x1 && b.y >= y1 && b.x + b.w <= x2 && b.y + b.h <= y2;
        n.setSelected(inside || (additive && baseSelection.has(n.id)));
      }
      api.renderNow();
      this.syncBar();
    };
    const overGroupFrame = (w: { x: number; y: number }) => diagram.getGroups().some((g: any) => {
      const r = g.getOuterBounds?.();
      return r && w.x >= r.x && w.x <= r.x + r.width && w.y >= r.y && w.y <= r.y + r.height;
    });
    return {
      id: 'vs-marquee',
      priority: 1,
      hitTest: (ev: any, hit: any) => !!hit.empty && !overGroupFrame(ev.world),
      onPointerDown: (ev: any) => {
        start = { world: { ...ev.world }, screen: { ...ev.screen } };
        baseSelection = new Set(diagram.getSelectedNodes().map((n: any) => n.id));
        if (!additiveOf(ev)) { diagram.clearSelection(); baseSelection.clear(); }
      },
      onPointerMove: (ev: any) => {
        if (!start) return;
        showBox(start.screen, ev.screen);
        applySelection({ ax: start.world.x, ay: start.world.y, bx: ev.world.x, by: ev.world.y }, additiveOf(ev));
      },
      onPointerUp: (ev: any) => {
        if (start) applySelection({ ax: start.world.x, ay: start.world.y, bx: ev.world.x, by: ev.world.y }, additiveOf(ev));
        start = null;
        clearBox();
      },
      onCancel: () => {
        if (start) {
          for (const n of diagram.getNodes()) n.setSelected(baseSelection.has(n.id));
          api.renderNow();
          this.syncBar();
        }
        start = null;
        clearBox();
      },
    };
  }
}
