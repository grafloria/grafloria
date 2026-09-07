/**
 * SPLIT BINDER — a board laid out as a splitter tree (see split-layout.ts),
 * bound to a group the way `bindDashboardGrid` binds a grid: it implements the
 * same `DashboardGridHandle`, so `dashboard()`, `fromDocument()` and the
 * history plumbing drive it without knowing which layout a view runs.
 *
 * THE MODEL (measured on the DevExpress designer, 6 Sep 2026):
 *  - the board is always covered: one widget fills it, the next halves the
 *    largest one along its longer axis, a removed widget's slot goes to its
 *    siblings;
 *  - a DIVIDER between two siblings drags as a PERCENTAGE of their group; a
 *    widget alone in its group has no divider on that axis;
 *  - a DRAG lifts the widget out at once (its siblings take the slot live), an
 *    INSERTION LINE on the nearest edge of the widget under the pointer says
 *    where it will land, and the drop splits that widget's slot on that side.
 *
 * THE UNDO STORY is one command: `SetSplitTreeCommand` swaps the whole tree
 * (plain JSON on the group as `dashboardTree`). A gesture, a keyboard step, an
 * add and a removal are each one tree write, so one undo is always one thing.
 *
 * Sizing is always 'fit': the tree is a division of the frame. On a fluid
 * board the frame follows the container (both axes); on a fixed board it is
 * the authored size.
 */

import { Command, type DiagramModel, type GroupModel, type NodeModel } from '@grafloria/engine';
import { LiveRegionController, registerTool, type CanvasTool, type ToolPointerEvent } from '@grafloria/renderer';
import type { DashboardGridApi, DashboardGridHandle, DashboardGridOptions } from './grid-binder';
import { cellFromGridItem, type CellRect, type WorldRect } from './grid-mapping';
import {
  addSplitLeaf,
  cellsFromSplit,
  cloneSplit,
  dividersOf,
  groupRectsOf,
  insertSplitLeaf,
  moveSplitDivider,
  normalizeSplit,
  pathToLeaf,
  projectSplit,
  removeSplitLeaf,
  splitFromCells,
  splitLeaves,
  type SplitDivider,
  type SplitNode,
  type SplitSide,
} from './split-layout';
import { ensureDashboardKitStyles } from './styles';

/** Group metadata key the tree persists under. */
export const SPLIT_TREE_KEY = 'dashboardTree';

export interface DashboardSplitOptions
  extends Pick<
    DashboardGridOptions,
    | 'columns'
    | 'gap'
    | 'padding'
    | 'rtl'
    | 'fluid'
    | 'static'
    | 'designHeight'
    | 'baseRowHeight'
    | 'dragOut'
    | 'removeZone'
    | 'onRemoveRequest'
    | 'onDropIn'
    | 'onGesture'
  > {
  /** An authored tree. Default: the persisted one, else derived from the members' cells. */
  tree?: SplitNode | null;
}

/** The split handle is the grid handle plus the tree itself. */
export interface DashboardSplitHandle extends DashboardGridHandle {
  getSplitTree(): SplitNode | null;
  /** Replace the tree through the history (one undoable step). */
  setSplitTree(tree: SplitNode | null): Promise<void>;
}

/**
 * Undoable whole-tree write. Everything a split board does to its layout is
 * one of these — a gesture, a keyboard step, an add, a removal — so one undo
 * is always exactly one thing, and a batch that removes a node can fold the
 * tree-without-it in beside the node removal.
 */
export class SetSplitTreeCommand extends Command {
  constructor(
    private readonly groupId: string,
    private readonly before: SplitNode | null,
    private readonly after: SplitNode | null
  ) {
    super('Lay out board');
  }

  private apply(context: { diagram?: unknown }, tree: SplitNode | null): void {
    const diagram = context.diagram as DiagramModel | undefined;
    const grp = diagram?.getGroup(this.groupId);
    if (!grp) return;
    grp.setMetadata(SPLIT_TREE_KEY, tree ? cloneSplit(tree) : null);
  }

  override execute(context: { diagram?: unknown }): void {
    this.apply(context, this.after);
  }

  override undo(context: { diagram?: unknown }): void {
    this.apply(context, this.before);
  }

  override serialize() {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { groupId: this.groupId, before: this.before, after: this.after },
    };
  }
}

const LIVE_REGIONS = new WeakMap<HTMLElement, LiveRegionController>();
function liveRegionFor(container: HTMLElement): LiveRegionController {
  let live = LIVE_REGIONS.get(container);
  if (!live) {
    live = new LiveRegionController(container);
    LIVE_REGIONS.set(container, live);
  }
  return live;
}

const DRAG_THRESHOLD = 4;
/** The divider's hit zone, px — the gap is 10; a 24-px target is what WCAG 2.5.8 asks. */
const DIVIDER_HIT = 24;
/** A keyboard divider step, as a fraction of the group. */
const KEY_STEP = 0.05;

let binderSeq = 0;

interface Gesture {
  kind: 'move' | 'divider' | 'palette';
  id: string;
  node: NodeModel | null;
  started: boolean;
  downClient: { x: number; y: number };
  downWorld: { x: number; y: number };
  grab: { dx: number; dy: number };
  startTree: SplitNode | null;
  liveTree: SplitNode | null;
  /** Divider gesture: which one. */
  divider: SplitDivider | null;
  /** Move / palette gesture: where the drop would land — a widget's edge, or a whole group's outer edge. */
  target: { id: string; side: SplitSide } | { path: number[]; side: SplitSide } | null;
  out: boolean;
  chip: HTMLElement | null;
  esc: ((e: KeyboardEvent) => void) | null;
  hostEl: HTMLElement | null;
  /** The pointer captured on the container, so a release outside the canvas still arrives. */
  pointerId: number | null;
}

export function bindDashboardSplit(api: DashboardGridApi, group: GroupModel, options: DashboardSplitOptions = {}): DashboardSplitHandle {
  const diagram = api.getModel();
  ensureDashboardKitStyles(api.container.ownerDocument ?? document);

  const columns = options.columns ?? 12;
  const gap = options.gap ?? 12;
  const padding = options.padding ?? gap;
  const baseRowHeight = options.baseRowHeight ?? 110;
  const fluid = options.fluid === true;
  let rtl = options.rtl === true;
  let isStatic = options.static === true;
  let designH = options.designHeight ?? group.size?.height ?? 0;
  let designW = group.size?.width ?? 0;
  let disposed = false;
  let gesture: Gesture | null = null;
  let focusedId: string | undefined;
  const live = liveRegionFor(api.container);

  // -- geometry ---------------------------------------------------------------

  const frame = (): WorldRect => ({
    x: group.position.x,
    y: group.position.y,
    width: group.size?.width ?? designW,
    height: group.size?.height ?? designH,
  });

  const containerBox = (): { w: number; h: number } => ({
    w: api.container.clientWidth || 0,
    h: api.container.clientHeight || 0,
  });

  /** Reentrancy guard: our own frame write must not re-project through bounds:changed. */
  let writing = false;

  /** FLUID: the frame is the container, both axes. Returns true when it changed. */
  const applyFluidFrame = (): boolean => {
    if (!fluid || disposed) return false;
    const box = containerBox();
    if (box.w <= 0) return false;
    const f = frame();
    const height = box.h > 0 ? box.h : f.height;
    if (Math.abs(f.width - box.w) < 0.5 && Math.abs(f.height - height) < 0.5) return false;
    designW = box.w;
    designH = height;
    writing = true;
    try {
      diagram.runSystemWrite(() => group.setFrame({ x: f.x, y: f.y, width: box.w, height }));
    } finally {
      writing = false;
    }
    return true;
  };

  // -- the tree ---------------------------------------------------------------

  const members = (): string[] =>
    [...(group.members ?? [])].filter((id) => !!diagram.getNode(id) || !!diagram.getGroup(id));

  const readTree = (): SplitNode | null => {
    const t = group.getMetadata(SPLIT_TREE_KEY) as SplitNode | null | undefined;
    return t ? cloneSplit(t) : null;
  };

  const writeTree = (tree: SplitNode | null): void => {
    diagram.runSystemWrite(() => group.setMetadata(SPLIT_TREE_KEY, tree ? cloneSplit(tree) : null));
  };

  /** A member's cell from its persisted gridItem, for the first tree of a grid-authored board. */
  const persistedCell = (id: string): CellRect | undefined => {
    const n = diagram.getNode(id);
    const raw = n
      ? (n.getMetadata?.('gridItem') as Parameters<typeof cellFromGridItem>[0] | undefined)
      : (diagram.getGroup(id)?.getMetadata('gridItem') as Parameters<typeof cellFromGridItem>[0] | undefined);
    return (raw ? cellFromGridItem(raw) : undefined) ?? undefined;
  };

  /**
   * The tree the board should show: the persisted one, reconciled with LIVE
   * membership — a member the tree does not know is added (halving the
   * largest leaf, the DevExpress rule), a leaf whose member is gone is removed.
   * A board with no tree yet gets one from its members' cells (a grid-authored
   * spec keeps its proportions) or, failing that, by adding them in order.
   */
  const reconcile = (): SplitNode | null => {
    const ids = members();
    let tree = readTree();
    const known = new Set(splitLeaves(tree));
    let changed = false;
    if (!tree && ids.length) {
      const cells = new Map<string, CellRect>();
      for (const id of ids) {
        const c = persistedCell(id);
        if (c) cells.set(id, c);
      }
      tree = cells.size === ids.length ? splitFromCells(cells) : null;
      if (!tree) for (const id of ids) tree = addSplitLeaf(tree, id, frame(), gap, padding);
      changed = true;
      for (const id of ids) known.add(id);
    }
    for (const id of [...known]) {
      if (!ids.includes(id)) {
        tree = removeSplitLeaf(tree, id);
        known.delete(id);
        changed = true;
      }
    }
    for (const id of ids) {
      if (!known.has(id)) {
        tree = addSplitLeaf(tree, id, frame(), gap, padding);
        known.add(id);
        changed = true;
      }
    }
    if (changed) writeTree(tree);
    return tree;
  };

  const rectsOf = (tree: SplitNode | null): Map<string, WorldRect> => projectSplit(tree, frame(), gap, padding, rtl);

  // -- projection -------------------------------------------------------------

  const htmlLayer = (): HTMLElement | null => api.container.querySelector('.grafloria-html-layer');
  const hostOf = (id: string): HTMLElement | null => {
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    return api.container.querySelector(`.grafloria-node-host[data-node-id="${esc}"]`);
  };

  const writeRect = (id: string, r: WorldRect): void => {
    const node = diagram.getNode(id);
    if (node) {
      if (
        Math.abs(node.position.x - r.x) > 0.25 ||
        Math.abs(node.position.y - r.y) > 0.25 ||
        Math.abs(node.size.width - r.width) > 0.25 ||
        Math.abs(node.size.height - r.height) > 0.25
      ) {
        diagram.runSystemWrite(() => {
          node.setPosition(r.x, r.y);
          node.setSize(r.width, r.height, node.size.depth ?? 0);
        });
      }
      return;
    }
    const grp = diagram.getGroup(id);
    if (grp) diagram.runSystemWrite(() => grp.setFrame({ ...r }));
  };

  /** The tree currently PAINTED — the gesture's live tree while one runs. */
  const paintedTree = (): SplitNode | null => (gesture?.started ? gesture.liveTree : readTree());

  const project = (tree: SplitNode | null = paintedTree()): void => {
    const rects = rectsOf(tree);
    for (const [id, r] of rects) {
      if (gesture?.started && gesture.kind !== 'divider' && id === gesture.id) continue; // the ghost follows the pointer
      writeRect(id, r);
    }
    syncDividers(tree);
    syncA11y();
  };

  // -- chrome: dividers + insertion line -------------------------------------

  const dividerEls: HTMLElement[] = [];
  let insertion: HTMLElement | null = null;

  const syncDividers = (tree: SplitNode | null): void => {
    const layer = htmlLayer();
    for (const el of dividerEls) el.remove();
    dividerEls.length = 0;
    if (!layer || isStatic || disposed) return;
    const divs = dividersOf(tree, frame(), gap, padding, rtl);
    divs.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = `axdb-div axdb-div--${d.dir}`;
      el.setAttribute('data-divider', String(i));
      const grow = Math.max(0, DIVIDER_HIT - (d.dir === 'row' ? d.rect.width : d.rect.height)) / 2;
      const x = d.dir === 'row' ? d.rect.x - grow : d.rect.x;
      const y = d.dir === 'row' ? d.rect.y : d.rect.y - grow;
      const w = d.dir === 'row' ? d.rect.width + 2 * grow : d.rect.width;
      const h = d.dir === 'row' ? d.rect.height : d.rect.height + 2 * grow;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.setAttribute('aria-hidden', 'true');
      layer.appendChild(el);
      dividerEls.push(el);
    });
    liveDividers = divs;
  };
  let liveDividers: SplitDivider[] = [];

  const showInsertion = (rect: WorldRect | null): void => {
    const layer = htmlLayer();
    if (!rect || !layer) {
      insertion?.remove();
      insertion = null;
      return;
    }
    if (!insertion || insertion.parentElement !== layer) {
      insertion?.remove();
      insertion = document.createElement('div');
      insertion.className = 'axdb-ins';
      layer.appendChild(insertion);
    }
    insertion.style.left = `${rect.x}px`;
    insertion.style.top = `${rect.y}px`;
    insertion.style.width = `${rect.width}px`;
    insertion.style.height = `${rect.height}px`;
  };

  /** The insertion line for a drop on `side` of the leaf painted at `r`. */
  const insertionRect = (r: WorldRect, side: SplitSide): WorldRect => {
    const t = 4;
    switch (side) {
      case 'left':
        return { x: r.x - t / 2, y: r.y, width: t, height: r.height };
      case 'right':
        return { x: r.x + r.width - t / 2, y: r.y, width: t, height: r.height };
      case 'top':
        return { x: r.x, y: r.y - t / 2, width: r.width, height: t };
      default:
        return { x: r.x, y: r.y + r.height - t / 2, width: r.width, height: t };
    }
  };

  /**
   * Where a drop at the world point lands. Near the OUTER edge of a group —
   * within GROUP_BAND px, the outermost such group winning — the target is the
   * whole group ("under all of these columns", DevExpress's group indicator);
   * otherwise it is the widget under the pointer, on its nearest edge.
   */
  const GROUP_BAND = 18;
  type DropTarget = ({ id: string } | { path: number[] }) & { side: SplitSide; rect: WorldRect };
  const dropTargetAt = (tree: SplitNode | null, wx: number, wy: number, exclude?: string): DropTarget | null => {
    let leaf: { id: string; rect: WorldRect } | null = null;
    for (const [id, r] of rectsOf(tree)) {
      if (id === exclude) continue;
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) {
        leaf = { id, rect: r };
        break;
      }
    }
    if (!leaf) return null;
    const leafPath = pathToLeaf(tree, leaf.id) ?? [];
    // Ancestors first (the root is path []), outermost wins.
    const groups = groupRectsOf(tree, frame(), gap, padding, rtl)
      .filter((g) => g.path.length < leafPath.length && g.path.every((i, k) => leafPath[k] === i))
      .sort((a, b) => a.path.length - b.path.length);
    for (const g of groups) {
      const r = g.rect;
      const d: Record<SplitSide, number> = { left: wx - r.x, right: r.x + r.width - wx, top: wy - r.y, bottom: r.y + r.height - wy };
      const side = (Object.keys(d) as SplitSide[]).reduce((a, b) => (d[b] < d[a] ? b : a));
      if (d[side] <= GROUP_BAND) return { path: g.path, side, rect: r };
    }
    const r = leaf.rect;
    const d = { left: wx - r.x, right: r.x + r.width - wx, top: wy - r.y, bottom: r.y + r.height - wy };
    // Normalise by the axis length so a wide, short tile still has a usable top / bottom band.
    const n = { left: d.left / r.width, right: d.right / r.width, top: d.top / r.height, bottom: d.bottom / r.height };
    const side = (Object.keys(n) as SplitSide[]).reduce((a, b) => (n[b] < n[a] ? b : a));
    return { id: leaf.id, side, rect: r };
  };
  const targetOf = (t: DropTarget): { id: string; side: SplitSide } | { path: number[]; side: SplitSide } =>
    'id' in t ? { id: t.id, side: t.side } : { path: t.path, side: t.side };
  const targetRef = (t: { id: string } | { path: number[] }): string | { path: number[] } => ('id' in t ? t.id : { path: t.path });
  const targetName = (t: { id: string } | { path: number[] }): string => ('id' in t ? nameOf(t.id) : 'the group');

  const worldInsideBoard = (x: number, y: number): boolean => {
    const f = frame();
    return x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height;
  };

  // -- a11y -------------------------------------------------------------------

  const nameOf = (id: string): string => {
    const node = diagram.getNode(id);
    const title = node?.getMetadata?.('widgetTitle');
    if (typeof title === 'string' && title) return title;
    const label = (node?.getMetadata?.('widgetData') as { label?: unknown } | undefined)?.label;
    if (typeof label === 'string' && label) return label;
    const kind = node?.getMetadata?.('widgetKind');
    return typeof kind === 'string' && kind ? `${kind} widget` : id;
  };

  const describeSlot = (id: string, tree: SplitNode | null): string => {
    const r = rectsOf(tree).get(id);
    const f = frame();
    if (!r || f.width <= 0 || f.height <= 0) return '';
    return `${Math.round((r.width / f.width) * 100)} percent wide, ${Math.round((r.height / f.height) * 100)} percent tall`;
  };

  const syncA11y = (): void => {
    if (disposed) return;
    const order = splitLeaves(paintedTree()).filter((id) => !!diagram.getNode(id));
    // No corner handles on a split board: size comes from the dividers. A host
    // that carried the grid's handle (a board switched live) sheds it here.
    for (const id of order) hostOf(id)?.querySelector(':scope > .axdb-rs')?.remove();
    if (focusedId && !order.includes(focusedId)) focusedId = undefined;
    const stop = focusedId ?? order[0];
    order.forEach((id, i) => {
      const node = diagram.getNode(id);
      const host = hostOf(id);
      if (!node || !host) return;
      const bits = [nameOf(id), `${i + 1} of ${order.length}`, describeSlot(id, paintedTree())];
      if (node.state?.locked === true) bits.push('pinned');
      host.setAttribute('role', 'group');
      host.setAttribute('aria-roledescription', 'dashboard widget');
      host.setAttribute('aria-label', bits.filter(Boolean).join(', '));
      host.setAttribute('tabindex', id === stop ? '0' : '-1');
    });
  };

  // -- commit -----------------------------------------------------------------

  const execCommand = (cmd: Command): Promise<unknown> | unknown => {
    try {
      const r = api.getEngine().commandManager.execute(cmd) as { catch?: (f: () => void) => void };
      r?.catch?.(() => undefined);
      return r;
    } catch {
      return undefined;
    }
  };

  const commitTree = (before: SplitNode | null, after: SplitNode | null): Promise<unknown> | unknown => {
    const norm = normalizeSplit(after);
    return execCommand(new SetSplitTreeCommand(group.id, before, norm));
  };

  const fire = (e: Parameters<NonNullable<DashboardGridOptions['onGesture']>>[0]): void => {
    try {
      options.onGesture?.(e);
    } catch {
      /* a page hook must not break the board */
    }
  };

  // -- gestures ---------------------------------------------------------------

  const toWorld = (cx: number, cy: number): { x: number; y: number } => {
    const rect = api.container.getBoundingClientRect();
    return api.viewport?.clientToWorld ? api.viewport.clientToWorld(cx, cy, rect) : { x: cx - rect.left, y: cy - rect.top };
  };

  const armEscape = (g: Gesture): void => {
    g.esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && gesture === g) {
        e.preventDefault();
        cancelActiveGesture();
      }
    };
    window.addEventListener('keydown', g.esc, true);
  };

  const capturePointer = (g: Gesture): void => {
    if (g.pointerId === null) return;
    try {
      api.container.setPointerCapture?.(g.pointerId);
    } catch {
      /* a pointer that already ended cannot be captured — the release still arrives on the canvas */
    }
  };

  const teardownGesture = (g: Gesture): void => {
    if (g.pointerId !== null) {
      try {
        api.container.releasePointerCapture?.(g.pointerId);
      } catch {
        /* already released */
      }
    }
    if (g.esc) window.removeEventListener('keydown', g.esc, true);
    g.chip?.remove();
    showInsertion(null);
    g.hostEl?.classList.remove('axdb-ghost', 'axdb-out');
    for (const el of dividerEls) el.classList.remove('axdb-active');
    api.container.style.cursor = '';
  };

  const beginMoveVisuals = (g: Gesture): void => {
    g.started = true;
    g.liveTree = removeSplitLeaf(g.startTree, g.id); // the siblings take the slot at once
    g.hostEl = hostOf(g.id);
    g.hostEl?.classList.add('axdb-ghost');
    project(g.liveTree);
    api.render();
  };

  const onToolMove = (ev: ToolPointerEvent): void => {
    const g = gesture;
    if (!g || g.kind === 'palette') return;
    if (!g.started) {
      if (Math.abs(ev.screen.x - g.downClient.x) + Math.abs(ev.screen.y - g.downClient.y) < DRAG_THRESHOLD) return;
      if (g.kind === 'move') beginMoveVisuals(g);
      else {
        g.started = true;
        dividerEls[liveDividers.indexOf(g.divider!)]?.classList.add('axdb-active');
      }
      capturePointer(g);
      armEscape(g);
    }
    if (g.kind === 'divider' && g.divider) {
      const d = g.divider;
      const delta = d.dir === 'row' ? ev.world.x - g.downWorld.x : ev.world.y - g.downWorld.y;
      const signed = d.dir === 'row' && rtl ? -delta : delta;
      g.liveTree = moveSplitDivider(g.startTree as SplitNode, d.path, d.index, d.length > 0 ? signed / d.length : 0);
      project(g.liveTree);
      api.render();
      return;
    }
    // MOVE: the ghost follows the pointer; the target is the nearest edge under it.
    if (g.node) {
      const x = ev.world.x - g.grab.dx;
      const y = ev.world.y - g.grab.dy;
      diagram.runSystemWrite(() => g.node!.setPosition(x, y));
    }
    const inside = worldInsideBoard(ev.world.x, ev.world.y);
    const t = inside ? dropTargetAt(g.liveTree, ev.world.x, ev.world.y, g.id) : null;
    g.target = t ? targetOf(t) : null;
    showInsertion(t ? insertionRect(t.rect, t.side) : null);
    const out =
      !inside &&
      options.dragOut === 'remove' &&
      (!options.removeZone || options.removeZone({ x: ev.screen.x, y: ev.screen.y }, { x: ev.world.x, y: ev.world.y }));
    g.out = out;
    g.hostEl?.classList.toggle('axdb-out', out);
    api.render();
  };

  const onToolUp = (): void => {
    const g = gesture;
    if (!g || g.kind === 'palette') return;
    gesture = null;
    teardownGesture(g);
    if (!g.started) {
      api.render();
      return;
    }
    if (g.kind === 'divider') {
      const changed = JSON.stringify(g.liveTree) !== JSON.stringify(g.startTree);
      if (changed) commitTree(g.startTree, g.liveTree);
      project(readTree());
      api.renderNow();
      fire({ type: changed ? 'commit' : 'cancel', kind: 'resize', nodeId: g.id, changed });
      return;
    }
    if (g.out && options.onRemoveRequest) {
      const without = g.liveTree;
      void options.onRemoveRequest(g.id, [new SetSplitTreeCommand(group.id, g.startTree, normalizeSplit(without))]);
      fire({ type: 'remove', kind: 'move', nodeId: g.id, changed: true });
      return;
    }
    if (g.target) {
      const side = rtl && (g.target.side === 'left' || g.target.side === 'right') ? (g.target.side === 'left' ? 'right' : 'left') : g.target.side;
      const after = insertSplitLeaf(g.liveTree, g.id, targetRef(g.target), side);
      const changed = JSON.stringify(normalizeSplit(after)) !== JSON.stringify(normalizeSplit(g.startTree));
      if (changed) commitTree(g.startTree, after);
      else project(g.startTree);
      project(readTree());
      api.renderNow();
      if (changed) live.announce(`${nameOf(g.id)} moved ${side === 'left' || side === 'top' ? 'before' : 'after'} ${targetName(g.target)}`, 'polite', true);
      fire({ type: changed ? 'commit' : 'cancel', kind: 'move', nodeId: g.id, changed });
      return;
    }
    // Released nowhere: the widget snaps home.
    project(g.startTree);
    api.renderNow();
    fire({ type: 'cancel', kind: 'move', nodeId: g.id, changed: false });
  };

  const cancelActiveGesture = (): void => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    teardownGesture(g);
    if (g.kind === 'palette') {
      api.renderNow();
      fire({ type: 'cancel', kind: 'palette', nodeId: g.id, changed: false });
      return;
    }
    project(g.startTree);
    api.renderNow();
    if (g.started) fire({ type: 'cancel', kind: g.kind === 'divider' ? 'resize' : 'move', nodeId: g.id, changed: false });
  };

  const tool: CanvasTool = {
    id: `dashboard-split:${group.id}:${++binderSeq}`,
    priority: 2,
    hitTest(ev, hit) {
      if (disposed) return false;
      if (gesture) return true;
      if (hit.node) return (group.members ?? new Set<string>()).has(hit.node.id);
      return worldInsideBoard(ev.world.x, ev.world.y);
    },
    onPointerDown(ev, hit) {
      if (gesture) return;
      const target = (ev.source?.target ?? null) as Element | null;
      const dividerEl = target?.closest?.('.axdb-div') as HTMLElement | null;
      if (dividerEl && !isStatic) {
        const d = liveDividers[Number(dividerEl.getAttribute('data-divider'))];
        if (!d) return;
        const tree = readTree();
        gesture = {
          kind: 'divider',
          id: `divider:${d.path.join('.')}:${d.index}`,
          node: null,
          started: false,
          downClient: { x: ev.screen.x, y: ev.screen.y },
          downWorld: { x: ev.world.x, y: ev.world.y },
          grab: { dx: 0, dy: 0 },
          startTree: tree,
          liveTree: tree,
          divider: d,
          target: null,
          out: false,
          chip: null,
          esc: null,
          hostEl: null,
          pointerId: typeof PointerEvent !== 'undefined' && ev.source instanceof PointerEvent ? ev.source.pointerId : null,
        };
        api.container.style.cursor = d.dir === 'row' ? 'col-resize' : 'row-resize';
        return;
      }
      if (!hit.node) {
        (diagram as { clearSelection?: () => void }).clearSelection?.();
        api.render();
        return;
      }
      const node = diagram.getNode(hit.node.id);
      if (!node || node.state?.locked === true || isStatic) return;
      if (node.getMetadata?.('widgetMovable') === false) return;
      const tree = readTree();
      gesture = {
        kind: 'move',
        id: node.id,
        node,
        started: false,
        downClient: { x: ev.screen.x, y: ev.screen.y },
        downWorld: { x: ev.world.x, y: ev.world.y },
        grab: { dx: ev.world.x - node.position.x, dy: ev.world.y - node.position.y },
        startTree: tree,
        liveTree: tree,
        divider: null,
        target: null,
        out: false,
        chip: null,
        esc: null,
        hostEl: null,
        pointerId: typeof PointerEvent !== 'undefined' && ev.source instanceof PointerEvent ? ev.source.pointerId : null,
      };
    },
    onPointerMove(ev) {
      onToolMove(ev);
    },
    onPointerUp() {
      onToolUp();
    },
    onCancel() {
      cancelActiveGesture();
    },
  };
  const unregisterTool = registerTool(tool);

  // -- palette drag-in --------------------------------------------------------

  const beginPaletteDrag = (node: NodeModel, spec: { w: number; h: number; chip?: HTMLElement }, event: PointerEvent): void => {
    if (disposed || gesture || isStatic) return;
    const chip = spec.chip ?? null;
    if (chip) {
      chip.classList.add('axdb-drag-chip');
      document.body.appendChild(chip);
      chip.style.left = `${event.clientX + 6}px`;
      chip.style.top = `${event.clientY + 6}px`;
    }
    const tree = readTree();
    const g: Gesture = {
      kind: 'palette',
      id: node.id,
      node,
      started: true,
      downClient: { x: event.clientX, y: event.clientY },
      downWorld: { x: 0, y: 0 },
      grab: { dx: 0, dy: 0 },
      startTree: tree,
      liveTree: tree,
      divider: null,
      target: null,
      out: false,
      chip,
      esc: null,
      hostEl: null,
      pointerId: null,
    };
    gesture = g;
    armEscape(g);
    const detach = (): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    };
    const onMove = (e: PointerEvent): void => {
      if (gesture !== g) return detach();
      if (chip) {
        chip.style.left = `${e.clientX + 6}px`;
        chip.style.top = `${e.clientY + 6}px`;
      }
      const w = toWorld(e.clientX, e.clientY);
      const t = worldInsideBoard(w.x, w.y) ? dropTargetAt(g.liveTree, w.x, w.y) : null;
      g.target = t ? targetOf(t) : null;
      showInsertion(t ? insertionRect(t.rect, t.side) : null);
      chip?.classList.toggle('axdb-out', !t && !!g.liveTree);
      api.render();
    };
    const onUp = (): void => {
      detach();
      if (gesture !== g) return;
      gesture = null;
      teardownGesture(g);
      const tree = g.liveTree;
      const after = g.target
        ? insertSplitLeaf(tree, node.id, targetRef(g.target), g.target.side)
        : tree
          ? null
          : addSplitLeaf(null, node.id, frame(), gap, padding);
      if (!after) {
        api.renderNow();
        fire({ type: 'cancel', kind: 'palette', nodeId: node.id, changed: false });
        return;
      }
      const cells = cellsFromSplit(after, columns, rowsGuess());
      const cell = cells.get(node.id) ?? { x: 0, y: 0, w: Math.max(1, spec.w), h: Math.max(1, spec.h) };
      const displaced: Command[] = [new SetSplitTreeCommand(group.id, tree, normalizeSplit(after))];
      void options.onDropIn?.(node, cell, displaced);
      fire({ type: 'drop-in', kind: 'palette', nodeId: node.id, changed: true });
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  };

  // -- keyboard ---------------------------------------------------------------

  const memberHostAt = (target: EventTarget | null): { id: string; host: HTMLElement } | null => {
    const host = (target as Element | null)?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host) return null;
    const id = host.getAttribute('data-node-id') ?? '';
    if (!(group.members ?? new Set<string>()).has(id) || !diagram.getNode(id)) return null;
    return { id, host };
  };

  const onFocusIn = (e: FocusEvent): void => {
    const hit = memberHostAt(e.target);
    if (!hit || disposed) return;
    if (focusedId !== hit.id) {
      focusedId = hit.id;
      syncA11y();
    }
  };

  /** The divider on `side` of leaf `id`: the nearest ancestor group running that way. */
  const dividerBeside = (tree: SplitNode | null, id: string, side: SplitSide): { path: number[]; index: number } | null => {
    const path = pathToLeaf(tree, id);
    if (!path || !tree) return null;
    const dir = side === 'left' || side === 'right' ? 'row' : 'column';
    for (let depth = path.length - 1; depth >= 0; depth--) {
      const groupPath = path.slice(0, depth);
      let node: SplitNode | null = tree;
      for (const i of groupPath) node = (node as { children: SplitNode[] }).children[i];
      const grp = node as { dir: 'row' | 'column'; children: SplitNode[] };
      if (grp.dir !== dir) continue;
      const i = path[depth];
      const after = side === 'right' || side === 'bottom';
      const index = after ? i : i - 1;
      if (index >= 0 && index < grp.children.length - 1) return { path: groupPath, index };
      return null;
    }
    return null;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (disposed || gesture) return;
    const hit = memberHostAt(e.target);
    const order = splitLeaves(readTree()).filter((id) => !!diagram.getNode(id) && !!hostOf(id));
    if (!hit) {
      const el = e.target as Element | null;
      const onRoot = !!el && el.tagName?.toLowerCase() === 'svg' && el.classList?.contains('grafloria-diagram');
      if (onRoot && (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ')) {
        const target = focusedId && order.includes(focusedId) ? focusedId : order[0];
        if (target && handle.focusWidget(target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      const id = e.key === 'Home' ? order[0] : order[order.length - 1];
      if (id) handle.focusWidget(id);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const side = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' } as Record<string, SplitSide>)[e.key];
    if (!side) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.shiftKey) {
      // Plain arrows walk the widgets in reading order.
      const i = order.indexOf(hit.id);
      const next = order[side === 'left' || side === 'top' ? i - 1 : i + 1];
      if (next) handle.focusWidget(next);
      return;
    }
    if (isStatic) return;
    const name = nameOf(hit.id);
    const tree = readTree();
    const d = dividerBeside(tree, hit.id, side);
    if (!d || !tree) {
      live.announceError(`${name} has no divider on its ${side === 'top' ? 'top' : side === 'bottom' ? 'bottom' : side} side`);
      return;
    }
    // Shift+arrow grows the widget towards that side: the divider moves away from it.
    const grows = side === 'right' || side === 'bottom' ? KEY_STEP : -KEY_STEP;
    const after = moveSplitDivider(tree, d.path, d.index, grows);
    const r = commitTree(tree, after);
    void Promise.resolve(r).then(() => {
      if (disposed) return;
      project(readTree());
      api.renderNow();
      live.announce(`${name} resized to ${describeSlot(hit.id, readTree())}`, 'polite', true);
      syncA11y();
      hostOf(hit.id)?.focus?.({ preventScroll: true });
    });
  };
  api.container.addEventListener('focusin', onFocusIn);
  api.container.addEventListener('keydown', onKey);

  // -- observers --------------------------------------------------------------

  // THE GROUP'S FRAME IS THE BOARD. When it moves — a view parked off-camera by
  // showView, a container re-slotted by its parent, an external resize — the
  // widgets must follow, exactly as the grid binder's do. Without this the
  // parked view's hosts stayed on camera under the shown view (the Angular
  // conformance drive: the sales cards bleeding through the ops tab). Member
  // churn re-reconciles the tree the same way.
  const groupSubs: Array<() => void> = [
    group.on('bounds:changed', (() => {
      if (disposed || writing) return;
      project();
      api.render();
    }) as (...args: unknown[]) => void),
    group.on('member:added', (() => {
      if (disposed) return;
      project(reconcile());
      api.render();
    }) as (...args: unknown[]) => void),
    group.on('member:removed', (() => {
      if (disposed) return;
      project(reconcile());
      api.render();
    }) as (...args: unknown[]) => void),
  ];

  const containerObserver =
    fluid && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (disposed) return;
          if (applyFluidFrame()) {
            project();
            api.renderNow();
          }
        })
      : null;
  containerObserver?.observe(api.container);

  // A repainted host loses its a11y attributes: put them back when hosts land.
  const hostObserver =
    typeof MutationObserver !== 'undefined'
      ? new MutationObserver((records) => {
          if (disposed) return;
          const landed = records.some((r) => Array.from(r.addedNodes).some((n) => (n as Element).classList?.contains('grafloria-node-host')));
          if (landed) syncA11y();
        })
      : null;
  const layerEl = htmlLayer();
  if (layerEl && hostObserver) hostObserver.observe(layerEl, { childList: true });

  // -- the handle -------------------------------------------------------------

  const rowsGuess = (): number => Math.max(1, Math.round(frame().height / (baseRowHeight + gap)));

  const handle: DashboardSplitHandle = {
    sync(): void {
      if (disposed) return;
      applyFluidFrame();
      const tree = reconcile();
      project(tree);
      api.renderNow();
    },
    setSizing(): void {
      /* a split board is always 'fit' — the tree divides the frame */
    },
    getSizing: () => 'fit',
    setFloat(): void {
      /* no gravity in a tree */
    },
    getFloat: () => false,
    setColumns: () => false,
    getColumns: () => columns,
    setRtl(on): void {
      if (on === rtl) return;
      rtl = on;
      project();
      api.renderNow();
    },
    getRtl: () => rtl,
    setStatic(on): void {
      if (on === isStatic) return;
      cancelActiveGesture();
      isStatic = on;
      project();
      api.renderNow();
    },
    getStatic: () => isStatic,
    focusWidget(id): boolean {
      if (!(group.members ?? new Set<string>()).has(id) || !diagram.getNode(id)) return false;
      focusedId = id;
      syncA11y();
      hostOf(id)?.focus?.({ preventScroll: true });
      return true;
    },
    getFocusedWidget: () => focusedId,
    saveLayout() {
      return { columns, cells: cellsFromSplit(readTree(), columns, rowsGuess()) };
    },
    metrics() {
      const f = frame();
      return {
        columns,
        maxColumns: columns,
        rtl,
        responsive: false,
        fluid,
        static: isStatic,
        capacity: undefined,
        gap,
        padding,
        sizing: 'fit',
        rows: rowsGuess(),
        rowHeight: rowsGuess() > 0 ? (f.height - 2 * padding - (rowsGuess() - 1) * gap) / rowsGuess() : 0,
        columnUnit: columns > 0 ? (f.width - 2 * padding - (columns - 1) * gap) / columns : 0,
        boardHeight: f.height,
        frame: f,
      };
    },
    willItFit: () => true,
    cellOf(id) {
      return cellsFromSplit(readTree(), columns, rowsGuess()).get(id);
    },
    cellRectOf(id) {
      // The PAINTED tree: mid-gesture a caller sees what the user sees — and
      // the lifted widget, which has no slot while in flight, is its ghost.
      const r = rectsOf(paintedTree()).get(id);
      if (r) return r;
      const n = diagram.getNode(id);
      return n ? { x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height } : undefined;
    },
    planRemoval(id) {
      const tree = readTree();
      if (!pathToLeaf(tree, id)) return [];
      return [new SetSplitTreeCommand(group.id, tree, normalizeSplit(removeSplitLeaf(tree, id)))];
    },
    async moveTo(id, x, y) {
      // A cell address on a split board: drop `id` on the side of the leaf whose
      // cell holds (x, y) that the address points at.
      const tree = readTree();
      if (!pathToLeaf(tree, id)) return false;
      const cells = cellsFromSplit(tree, columns, rowsGuess());
      let targetId: string | undefined;
      for (const [tid, c] of cells) {
        if (tid !== id && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) targetId = tid;
      }
      if (!targetId) return false;
      const mine = cells.get(id)!;
      const side: SplitSide = mine.x + mine.w <= cells.get(targetId)!.x ? 'left' : mine.x >= cells.get(targetId)!.x + cells.get(targetId)!.w ? 'right' : mine.y < cells.get(targetId)!.y ? 'top' : 'bottom';
      const after = insertSplitLeaf(tree, id, targetId, side);
      await commitTree(tree, after);
      project(readTree());
      api.renderNow();
      return true;
    },
    async resizeTo(id, w, h) {
      // Grow / shrink towards the right, then the bottom, by whole-cell fractions.
      const tree = readTree();
      const cells = cellsFromSplit(tree, columns, rowsGuess());
      const mine = cells.get(id);
      if (!tree || !mine) return false;
      let next: SplitNode | null = tree;
      const dw = w - mine.w;
      const dh = h - mine.h;
      const dx = dividerBeside(next, id, 'right');
      if (dw && dx) next = moveSplitDivider(next as SplitNode, dx.path, dx.index, dw / columns);
      const dy = dividerBeside(next, id, 'bottom');
      if (dh && dy) next = moveSplitDivider(next as SplitNode, dy.path, dy.index, dh / rowsGuess());
      if (JSON.stringify(next) === JSON.stringify(tree)) return false;
      await commitTree(tree, next);
      project(readTree());
      api.renderNow();
      return true;
    },
    beginPaletteDrag,
    getSplitTree: () => readTree(),
    async setSplitTree(tree) {
      const before = readTree();
      await commitTree(before, tree);
      project(readTree());
      api.renderNow();
    },
    dispose(): void {
      if (disposed) return;
      cancelActiveGesture();
      disposed = true;
      unregisterTool();
      api.container.removeEventListener('focusin', onFocusIn);
      api.container.removeEventListener('keydown', onKey);
      containerObserver?.disconnect();
      hostObserver?.disconnect();
      for (const off of groupSubs) off();
      for (const el of dividerEls) el.remove();
      dividerEls.length = 0;
      insertion?.remove();
      insertion = null;
      api.container.style.cursor = '';
    },
  };

  // Boot: an authored tree wins, then the persisted one, then the members' cells.
  if (options.tree !== undefined) writeTree(options.tree);
  applyFluidFrame();
  project(reconcile());
  api.renderNow();

  return handle;
}
