/**
 * THE TAB TEAR-OUT (tile first, step 4b-iii: out of the binder).
 *
 * A press that TRAVELLED on a tab drags the whole page onto this board, the
 * way dragging a VS Code tab out of its group makes a group of its own. The
 * page is a GROUP, so it rides the same `adopt` leg a widget uses — entry at
 * the bottom, `placeNear` under the pointer, the dashed placeholder drawn
 * from the live cell — and the commit is one batch: the cell and frame it
 * landed on, out of the container, into this board, plus every tile this
 * board had to push aside.
 *
 * Like VS Code, the page itself does not follow the pointer; a chip carrying
 * the tab's label does, and the placeholder shows where the drop will land.
 */
import { AddToGroupCommand, RemoveFromGroupCommand, type Command, type GroupModel } from '@grafloria/engine';
import { cellToRect, rowHeightFor, sizeToSpan, type CellRect, type WorldRect } from './grid-mapping';
import { BESIDE_BAND, resolveTabZone } from './zones';
import { type BoardCtx, EDGE_GRACE } from './board-ctx';
import { STRIP_STAY } from './grid-binder';
import type { AdoptedLeg, AdoptOptions, BinderPeer, TearOutPlan } from './grid-binder';

/** A torn-out page never arrives shorter than this: a strip with no room under it is not a group. */
export const TEAR_OUT_MIN_ROWS = 2;

export interface TearOutDeps {
  /** The columns this board is bound at NOW (a responsive board changes it). */
  columns(): number;
  /** This binder's own adoption leg — the page enters this board through it. */
  adopt(node: { id: string }, world: { x: number; y: number }, pxSize: { width: number; height: number }, opts?: AdoptOptions): AdoptedLeg | null;
  boardArea(): number;
  /** The boards registered on this canvas, and this binder's own peer among them. */
  peersOnCanvas(): Set<BinderPeer>;
  selfPeer(): BinderPeer;
  worldInsideBoard(x: number, y: number): boolean;
  worldInsideGroup(g: GroupModel, x: number, y: number): boolean;
  frameOfGroup(g: GroupModel): WorldRect;
  /** One undoable batch; false when there was nothing to do. */
  execute(name: string, commands: Command[]): boolean;
  project(): void;
  hidePlaceholder(): void;
  armGlide(): void;
  disarmGlideSoon(): void;
  enforceBoardHeight(): void;
  persistLayouts(): void;
  /** A tile or slab gesture of this board is running: a tab press starts nothing. */
  busy(): boolean;
  /** The page this board is tearing out right now (one at a time). */
  tearing(): string | null;
  setTearing(pageId: string | null): void;
}

export function createTearOut(ctx: BoardCtx, deps: TearOutDeps) {
  const { api, group, diagram, options, gap } = ctx;
  const { adopt, boardArea, execute, frameOfGroup, persistLayouts, project, hidePlaceholder, armGlide, disarmGlideSoon, enforceBoardHeight, busy, tearing, setTearing } = deps;
  const eng = () => ctx.engine();
  const frame = () => ctx.frame();
  const geom = () => ctx.geom();
  const rows = () => ctx.rows();
  const columns = () => deps.columns();
  const isStatic = () => ctx.isStatic();
  const disposed = () => ctx.disposed();
  const htmlLayer = () => ctx.htmlLayer();
  const sizeOf = ctx.sizeOf;
  const peersOnCanvas = () => deps.peersOnCanvas();
  const selfPeer = deps.selfPeer;
  const worldInsideBoard = (x: number, y: number) => deps.worldInsideBoard(x, y);
  const worldInsideGroup = (g: GroupModel, x: number, y: number) => deps.worldInsideGroup(g, x, y);

  const beginTearOut = (pageId: string, fromGroupId: string, ev: PointerEvent, plan: TearOutPlan): boolean => {
    if (disposed() || busy() || isStatic() || tearing()) return false;
    const from = diagram.getGroup(fromGroupId);
    if (!from || !diagram.getGroup(pageId) || !eng().getItem(fromGroupId)) return false;
    const toWorld = (cx: number, cy: number): { x: number; y: number } => {
      const rect = api.container.getBoundingClientRect();
      return api.viewport?.clientToWorld ? api.viewport.clientToWorld(cx, cy, rect) : { x: cx - rect.left, y: cy - rect.top };
    };
    // The board holds the NEW group, not the bare page: it is adopted under the
    // group's id, sized for the page plus its strip, taking the room under the
    // pointer with its top edge at the pointer — the tab is what the pointer
    // holds, the page hangs below it. NOT at the press: a ghost in the engine
    // costs rows, and on a fit board every tile squeezes the moment it enters,
    // so the ghost enters only when the pointer is over free board space, and
    // leaves whenever it is over a strip, a group or an edge. A full board that
    // refuses the ghost still lets the page join, reorder or split.
    let leg: AdoptedLeg | null = null;
    /** The board holding the leg: null = this one, else the foreign peer under the pointer. */
    let legPeer: BinderPeer | null = null;
    const ensureLeg = (world: { x: number; y: number }, peer: BinderPeer | null = null): AdoptedLeg | null => {
      // The page TRAVELS at most half the board tall (the dock's measure): at
      // its natural height — a page fills its container, eight rows on the
      // demo — the ghost crossing the KPI row tore the whole dashboard apart
      // on its way to a cell (identification round, D1 03–08).
      const capPx = dockSpan.h * (rowHeightFor(geom(), rows()) + gap) - gap;
      const size = { width: plan.size.width, height: Math.min(plan.size.height, capPx) };
      // A different board under the pointer takes the leg over, the old one
      // back to its pre-entry layout first. An INNER tab used to know only
      // the board owning its container — over the main board the chip dimmed
      // and the release did nothing (identification round, L2).
      if (leg && legPeer !== peer) {
        leg.abort();
        leg = null;
      }
      if (!leg) {
        leg = peer ? peer.adopt({ id: plan.arrivingId }, world, size, { fit: 'shrink', anchor: 'top' }) : adopt({ id: plan.arrivingId }, world, size, { fit: 'shrink', anchor: 'top' });
        legPeer = leg ? peer : null;
      }
      return leg;
    };
    /** The deepest OTHER board under the point that may take the page — never one of the page's own boards. */
    const foreignAt = (wx: number, wy: number): BinderPeer | null => {
      let best: BinderPeer | null = null;
      for (const p of peersOnCanvas()) {
        if (p === selfPeer() || plan.ownBoards.includes(p.group.id)) continue;
        if (!p.containsWorld(wx, wy)) continue;
        if (!best || p.frameArea() < best.frameArea()) best = p;
      }
      return best;
    };
    const naturalSpan = ((): { w: number; h: number } => {
      const sp = sizeToSpan(plan.size.width, plan.size.height, frame(), geom(), rows());
      return { w: Math.max(1, Math.min(columns(), sp.w)), h: Math.max(TEAR_OUT_MIN_ROWS, sp.h) };
    })();
    // A DOCKED group takes at most HALF the board — VS Code's edge drop splits
    // the area in two. A page as tall as the container it left would
    // otherwise shove the whole dashboard out of view. Half of the board as
    // it stood at the press, and of what the canvas shows, whichever is less.
    const dockSpan = ((): { w: number; h: number } => {
      const rows0 = rows();
      const rect = api.container.getBoundingClientRect();
      const rh = rowHeightFor(geom(), rows0) + gap;
      const visible = rect.height > 0 && rh > 0 ? Math.max(1, Math.floor((rect.height + gap) / rh)) : rows0;
      const halfRows = Math.max(TEAR_OUT_MIN_ROWS, Math.ceil(Math.min(rows0, visible) / 2));
      const halfCols = Math.max(1, Math.ceil(columns() / 2));
      return { w: Math.min(naturalSpan.w, halfCols), h: Math.min(naturalSpan.h, halfRows) };
    })();

    setTearing(pageId);
    const doc = api.container.ownerDocument ?? document;
    const chip = doc.createElement('div');
    chip.className = 'axdb-drag-chip axdb-tab-chip';
    chip.textContent = plan.label;
    doc.body.appendChild(chip);
    const moveChip = (cx: number, cy: number): void => {
      chip.style.left = `${cx + 6}px`;
      chip.style.top = `${cy + 6}px`;
    };
    moveChip(ev.clientX, ev.clientY);
    armGlide();
    api.render();

    // -- the drop model: where the pointer is decides what the release does --------
    // Over ANOTHER tab container: its strip joins at a slot; the centre third of
    // its body joins on the end; an outer third SPLITS it — the target keeps one
    // half of its cell, the page takes the other (Lumino's thirds, VS Code's
    // feel). Over the board's own edges the page DOCKS against the whole board.
    // Over its own strip it reorders; over its own body it goes home. Deepest
    // target wins, so a group inside the container the page came from is a
    // target, not "home".
    type Side = 'left' | 'right' | 'top' | 'bottom';
    type Zone =
      | { kind: 'strip'; target: GroupModel; index: number }
      | { kind: 'join'; target: GroupModel }
      | { kind: 'split'; target: GroupModel; side: Side; keep: CellRect; born: CellRect }
      | { kind: 'root'; side: Side; cell: CellRect }
      | { kind: 'reorder'; index: number }
      | { kind: 'home' }
      /** Free board space — this board's, or a FOREIGN board's when one lies under the pointer (deeper than this one, or outside it). */
      | { kind: 'board'; peer?: BinderPeer }
      /** Outside the visible canvas (plus grace): nothing lands, whatever the world point under the pointer says. */
      | { kind: 'off' };
    const layer = htmlLayer();
    const area = (g: GroupModel): number => {
      const sz = sizeOf(g);
      return sz.width * sz.height;
    };
    const targets = plan.joinTargets
      .map((id) => diagram.getGroup(id))
      .filter((g): g is GroupModel => !!g && g.id !== fromGroupId)
      .sort((a, b) => area(a) - area(b));
    // GEOMETRY MUST NOT MOVE WITH THE GHOST. On a fit board the rows squeeze
    // while the ghost occupies some and relax when it leaves, so a target's
    // frame changes with the very decision being made about it: a join makes
    // the ghost leave, the frame grows, and the same pointer now reads as a
    // split. The target and its frame are therefore anchored when the pointer
    // enters it and kept until it leaves; the board frame is the one at press.
    let anchor: { g: GroupModel; frame: WorldRect; stripH: number } | null = null;
    const inRect = (r: WorldRect, wx: number, wy: number): boolean => wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height;
    const targetAt = (wx: number, wy: number): GroupModel | null => {
      if (anchor && inRect(anchor.frame, wx, wy)) return anchor.g;
      const t = targets.find((x) => worldInsideGroup(x, wx, wy)) ?? null;
      if (t) leg?.leave(); // the ghost leaves first, so the frame anchored is the relaxed one
      anchor = t ? { g: t, frame: frameOfGroup(t), stripH: plan.stripHeight(t.id) } : null;
      return t;
    };
    // THE BANDS ARE ON THE SCREEN. Dockview measures its container edges on
    // the element, and so must we: the camera moves during the drag (the
    // board glides, the ghost adds rows a bounded scroll answers to), so a
    // band fixed in world space at the press drifts away from the edge the
    // user sees. The frame is mapped to client space through the live
    // camera and clipped to the canvas, so a scrolled board's bands sit at
    // its VISIBLE edges.
    const ROOT_TOP = 20;
    const ROOT_BOTTOM = 20;
    const ROOT_SIDE = 40;
    // THE EDGE BANDS ARE A FIFTH OF THE BODY — Dockview's activation size, not
    // VS Code's third. Two thirds of every group read as "beside" under the
    // thirds, and the user, putting a page back into the panel it came from,
    // never found the "into": "close to the edge means beside it, the content
    // area means inside, the header means a new tab" (0.4.42).
    const EDGE_BAND = BESIDE_BAND; // one band for a tab's split and a widget's beside (zones.ts)
    const visibleFrame = (): { left: number; top: number; right: number; bottom: number } => {
      const rect = api.container.getBoundingClientRect();
      const o = toWorld(rect.left, rect.top);
      const u = toWorld(rect.left + 100, rect.top + 100);
      const sx = 100 / (u.x - o.x || 100);
      const sy = 100 / (u.y - o.y || 100);
      const f = frame();
      const left = rect.left + (f.x - o.x) * sx;
      const top = rect.top + (f.y - o.y) * sy;
      const right = left + f.width * sx;
      const bottom = top + f.height * sy;
      if (rect.width <= 0 || rect.height <= 0) return { left, top, right, bottom }; // unlaid-out: nothing to clip to
      return { left: Math.max(left, rect.left), top: Math.max(top, rect.top), right: Math.min(right, rect.right), bottom: Math.min(bottom, rect.bottom) };
    };
    /** Inside the VISIBLE canvas plus the grace band, on the screen — a camera that moved must not turn a pointer outside the canvas into a world point inside the board. */
    const clientInsideCanvasGrace = (cx: number, cy: number): boolean => {
      // The CANVAS, not this board's frame: a nested page's binder runs the
      // tear-out of the tabs inside it, and its pages must still land on the
      // boards around it. An unmeasurable container (no layout) is never off.
      const rect = api.container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return true;
      return cx >= rect.left - EDGE_GRACE && cx <= rect.right + EDGE_GRACE && cy >= rect.top - EDGE_GRACE && cy <= rect.bottom + EDGE_GRACE;
    };
    /**
     * The board's rows for a dock: as they stood BEFORE the ghost entered.
     * Read live, the ghost's own pushing inflated them on every re-entry —
     * side docks 14, 21, 104 rows tall, a bottom dock landing at row 29.
     */
    const baseRows = (): number => {
      const b = leg?.baseline();
      if (!b) return rowsWithout(plan.arrivingId);
      let r = 0;
      for (const c of b.values()) r = Math.max(r, c.y + c.h);
      return r;
    };
    const worldToClient = (wx: number, wy: number): { x: number; y: number } => {
      const rect = api.container.getBoundingClientRect();
      const o = toWorld(rect.left, rect.top);
      const u = toWorld(rect.left + 100, rect.top + 100);
      return { x: rect.left + (wx - o.x) * (100 / (u.x - o.x || 100)), y: rect.top + (wy - o.y) * (100 / (u.y - o.y || 100)) };
    };
    /**
     * Would the page land where the user cannot see it? A cell whose room
     * lies below the fold (the only cell left under a locked section — D1
     * hold3) used to take the drop a screen away. Hidden = not one pixel of
     * the cell inside the visible canvas: a landing whose top edge shows,
     * the rest below the fold of a small canvas, is a landing the user can
     * see and a grow board scrolls to (lab L61 dropped at the canvas foot).
     */
    const landingHidden = (): boolean => {
      const r = leg?.rect();
      const rect = api.container.getBoundingClientRect();
      if (!r || rect.width <= 0 || rect.height <= 0) return false;
      const tl = worldToClient(r.x, r.y);
      const br = worldToClient(r.x + r.width, r.y + r.height);
      return tl.y >= rect.bottom || br.y <= rect.top || tl.x >= rect.right || br.x <= rect.left;
    };
    const rootAt = (cx: number, cy: number): Zone | null => {
      // The bands reach a little OUTSIDE the frame too: a pointer that
      // overshoots the board's top edge by a few pixels means "the top".
      const v = visibleFrame();
      if (cx < v.left - ROOT_SIDE || cx > v.right + ROOT_SIDE || cy < v.top - ROOT_TOP || cy > v.bottom + ROOT_BOTTOM) return null;
      const rows = Math.max(TEAR_OUT_MIN_ROWS, baseRows());
      const w = dockSpan.w;
      const h = dockSpan.h;
      if (cy - v.top <= ROOT_TOP) return { kind: 'root', side: 'top', cell: { x: 0, y: 0, w: columns(), h } };
      if (cx - v.left <= ROOT_SIDE) return { kind: 'root', side: 'left', cell: { x: 0, y: 0, w, h: rows } };
      if (v.right - cx <= ROOT_SIDE) return { kind: 'root', side: 'right', cell: { x: Math.max(0, columns() - w), y: 0, w, h: rows } };
      if (v.bottom - cy <= ROOT_BOTTOM) return { kind: 'root', side: 'bottom', cell: { x: 0, y: rows, w: columns(), h } };
      return null;
    };
    const rowsWithout = (id: string): number => {
      let r = 0;
      for (const it of eng().getItems()) if (it.id !== id) r = Math.max(r, it.y + it.h);
      return r;
    };
    /** A split being previewed: the target shrunk to its half, to be restored when the pointer leaves. */
    let split: { id: string; before: CellRect; frameBefore: WorldRect; keep: CellRect } | null = null;
    const halves = (target: GroupModel, side: Side): { keep: CellRect; born: CellRect } | null => {
      // The cell to halve is the target's own — not the half it is already
      // shrunk to while a split is being previewed.
      const live = eng().getItem(target.id);
      const it = split && split.id === target.id ? split.before : live;
      if (!it || !live) return null; // a group on another board: no cell of ours to halve
      if (side === 'left' || side === 'right') {
        if (it.w < 2) return null;
        const a = Math.ceil(it.w / 2);
        const b = it.w - a;
        return side === 'right'
          ? { keep: { x: it.x, y: it.y, w: a, h: it.h }, born: { x: it.x + a, y: it.y, w: b, h: it.h } }
          : { keep: { x: it.x + b, y: it.y, w: a, h: it.h }, born: { x: it.x, y: it.y, w: b, h: it.h } };
      }
      if (it.h < 2 * TEAR_OUT_MIN_ROWS) return null;
      const a = Math.ceil(it.h / 2);
      const b = it.h - a;
      return side === 'bottom'
        ? { keep: { x: it.x, y: it.y, w: it.w, h: a }, born: { x: it.x, y: it.y + a, w: it.w, h: b } }
        : { keep: { x: it.x, y: it.y + b, w: it.w, h: a }, born: { x: it.x, y: it.y, w: it.w, h: b } };
    };
    const zoneAt = (cx: number, cy: number, world: { x: number; y: number }): Zone => {
      // A pointer OUTSIDE the visible canvas is off, full stop: a camera that
      // moved can map it to a world point inside a group, and that group
      // took a join or a split from a release in the page header. The
      // target is looked up (and anchored) only inside it.
      const clientInside = clientInsideCanvasGrace(cx, cy);
      const target = clientInside ? targetAt(world.x, world.y) : null;
      const root = clientInside ? rootAt(cx, cy) : null;
      const foreign = foreignAt(world.x, world.y);
      // The ORDER is zones.ts's, shared with the split board: a strip, the
      // board's own edges, the target's fifth or middle, home, then a board.
      const tz = resolveTabZone({
        x: world.x,
        y: world.y,
        clientInside,
        // A page dragged along its own strip, or over another's, keeps that
        // strip through a small overshoot too (STRIP_STAY): the zone under a
        // strip moves the container, and a pixel must not toggle it.
        ownStrip: plan.stripIndex(fromGroupId, cx, cy, zone.kind === 'reorder' ? STRIP_STAY : 0),
        stripOf: (id) => plan.stripIndex(id, cx, cy, zone.kind === 'strip' && zone.target.id === id ? STRIP_STAY : 0),
        root: root && root.kind === 'root' ? { side: root.side } : null,
        target: target
          ? {
              id: target.id,
              frame: anchor && anchor.g === target ? anchor.frame : frameOfGroup(target),
              stripHeight: anchor && anchor.g === target ? anchor.stripH : plan.stripHeight(target.id),
            }
          : null,
        home: worldInsideGroup(from, world.x, world.y) ? frameOfGroup(from) : null,
        homeBand: 0, // on a grid board the whole source frame is home
        band: EDGE_BAND,
        canSplit: (_id, side) => !!target && !!halves(target, side),
        pane: false,
        foreign: !!foreign && (!worldInsideBoard(world.x, world.y) || foreign.frameArea() < boardArea()),
      });
      switch (tz.kind) {
        case 'off':
          return { kind: 'off' };
        case 'strip':
          return { kind: 'strip', target: target as GroupModel, index: tz.index };
        case 'reorder':
          return { kind: 'reorder', index: tz.index };
        case 'root':
          return root as Zone;
        case 'join':
          return { kind: 'join', target: target as GroupModel };
        case 'split': {
          const h = halves(target as GroupModel, tz.side);
          return h ? { kind: 'split', target: target as GroupModel, side: tz.side, ...h } : { kind: 'join', target: target as GroupModel };
        }
        case 'home':
          return { kind: 'home' };
        default:
          return tz.kind === 'board' && tz.foreign && foreign ? { kind: 'board', peer: foreign } : { kind: 'board' };
      }
    };
    const zoneKey = (z: Zone): string => JSON.stringify(z, (k, v) => (k === 'target' ? (v as GroupModel).id : k === 'peer' ? (v as BinderPeer).group.id : v));

    // A TOP DOCK INSERTS ROWS. The engine's push cascade resolves the band's
    // collisions one tile at a time and scrambles what stood beneath it (the
    // demo's KPI row came apart, two of its tiles under the chart). VS Code
    // shoves the whole area down intact, so after the ghost takes the band
    // every tile that stood at or below it is put back at its own column,
    // exactly the band's height lower — a translation of a layout without
    // overlaps has none — and comes back the same way when the pointer leaves.
    // The layout translated is the one from BEFORE the ghost entered (the
    // leg's baseline), not the engine's mid-gesture state: the adoption
    // itself pushes tiles about, and a snapshot taken after it would carry
    // that cascade into the insert.
    let inserted: Map<string, CellRect> | null = null;
    const insertRows = (cell: CellRect, l: AdoptedLeg): void => {
      if (cell.w < columns()) return; // a side dock has no whole rows to insert
      const base = l.baseline();
      inserted = base;
      for (const [id, c] of base) {
        const it = eng().getItem(id);
        if (!it) continue;
        it.x = c.x;
        it.y = c.y >= cell.y ? c.y + cell.h : c.y;
      }
    };
    const undoInsertRows = (): void => {
      if (!inserted) return;
      leg?.leave(); // the ghost frees its rows first
      for (const [id, c] of inserted) {
        const it = eng().getItem(id);
        if (it) {
          it.x = c.x;
          it.y = c.y;
        }
      }
      inserted = null;
      project();
    };

    let joinEl: HTMLElement | null = null;
    const showOverlay = (r: WorldRect): void => {
      if (!layer) return;
      if (!joinEl) {
        joinEl = doc.createElement('div');
        joinEl.className = 'axdb-join';
        layer.prepend(joinEl);
      }
      joinEl.style.left = `${r.x}px`;
      joinEl.style.top = `${r.y}px`;
      joinEl.style.width = `${r.width}px`;
      joinEl.style.height = `${r.height}px`;
    };
    const hideOverlay = (): void => {
      joinEl?.remove();
      joinEl = null;
    };
    const undoSplitPreview = (): void => {
      if (!split) return;
      const it = eng().getItem(split.id);
      leg?.leave(); // the born half must be free before the target grows back into it
      if (it) {
        if (it.x !== split.before.x || it.y !== split.before.y) eng().moveCheck(split.id, split.before.x, split.before.y, { gate: false });
        if (it.w !== split.before.w || it.h !== split.before.h) eng().resizeCheck(split.id, split.before.w, split.before.h);
      }
      split = null;
      project();
    };
    const previewSplit = (z: Extract<Zone, { kind: 'split' }>, world: { x: number; y: number }): boolean => {
      const it = eng().getItem(z.target.id);
      if (!it) return false;
      // The target's cell AT REST is the one the commit restores — read it
      // BEFORE the leg enters: the arriving ghost is placed under the pointer
      // first, and a target that is a tile like any other is pushed by it
      // for a moment (tile first, step 3) until it takes its half below.
      const before = { x: it.x, y: it.y, w: it.w, h: it.h };
      const frameBefore = frameOfGroup(z.target);
      const l = ensureLeg(world, null);
      if (!l) return false;
      split = { id: z.target.id, before, frameBefore, keep: z.keep };
      if (it.w !== z.keep.w || it.h !== z.keep.h) eng().resizeCheck(z.target.id, z.keep.w, z.keep.h);
      const now = eng().getItem(z.target.id);
      if (now && (now.x !== z.keep.x || now.y !== z.keep.y)) eng().moveCheck(z.target.id, z.keep.x, z.keep.y, { gate: false });
      const ok = l.place(z.born);
      project();
      hidePlaceholder(); // the accent overlay says which half; the grey placeholder under it is noise
      return ok;
    };
    /** The band a dock is promised: the cell it takes — a BOTTOM dock's lies past the last row, so its tint sits on the board's last rows instead. */
    const dockOverlayRect = (z: Extract<Zone, { kind: 'root' }>): WorldRect => {
      const cell = z.side === 'bottom' ? { ...z.cell, y: Math.max(0, z.cell.y - z.cell.h) } : z.cell;
      return cellToRect(cell, frame(), geom(), rows());
    };
    /** The dock, applied for real at the release: the ghost takes the band, every member group is pushed, a top dock inserts rows. */
    const realizeDock = (z: Extract<Zone, { kind: 'root' }>, world: { x: number; y: number }): boolean => {
      const l = ensureLeg(world, null);
      if (!l) return false;
      l.place(z.cell, true); // DOCKING PUSHES SECTIONS: everything below the band moves down, solid or not
      insertRows(z.cell, l);
      project();
      hidePlaceholder();
      return true;
    };
    let zone: Zone = { kind: 'board' };
    let key = zoneKey(zone);
    const applyZone = (z: Zone, world: { x: number; y: number }): void => {
      const k = zoneKey(z);
      const same = k === key;
      key = k;
      zone = z;
      if (same) {
        if (z.kind === 'board') ensureLeg(world, z.peer ?? null)?.move(world);
        return;
      }
      undoSplitPreview();
      undoInsertRows();
      plan.markDrop(null, null);
      hideOverlay();
      // A PREVIEW IS AN OVERLAY. A split and a dock used to be applied LIVE
      // while the pointer hovered — the target halved and moved to its other
      // half, a top dock shoved every tile down — so the very group the user
      // was entering jumped away from under the pointer (the fluid demo's
      // side panel went off the screen in one frame as a page came back to
      // it). VS Code, Dockview and Golden Layout tint the half or the band and
      // move nothing until the drop; so does this now: the layout stays where
      // the user sees it, and the halving or the row insert happens on release.
      switch (z.kind) {
        case 'strip':
          leg?.leave();
          showOverlay(frameOfGroup(z.target));
          plan.markDrop(z.target.id, z.index);
          break;
        case 'join':
          leg?.leave();
          showOverlay(frameOfGroup(z.target));
          break;
        case 'split':
          leg?.leave(); // the ghost leaves first, so the half is measured on the relaxed board
          showOverlay(cellToRect(z.born, frame(), geom(), rows()));
          break;
        case 'root':
          leg?.leave();
          showOverlay(dockOverlayRect(z));
          break;
        case 'reorder':
          leg?.leave();
          plan.markDrop(fromGroupId, z.index);
          break;
        case 'home':
        case 'off':
          leg?.leave();
          break;
        case 'board': {
          const l = ensureLeg(world, z.peer ?? null);
          l?.enter(world);
          break;
        }
      }
    };

    let last = { x: ev.clientX, y: ev.clientY };
    const detach = (): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
    };
    const onMove = (e: PointerEvent): void => {
      if (disposed()) return detach();
      last = { x: e.clientX, y: e.clientY };
      moveChip(e.clientX, e.clientY);
      const world = toWorld(e.clientX, e.clientY);
      const z = zoneAt(e.clientX, e.clientY, world);
      applyZone(z, world);
      // Dimmed = a release here does nothing: home, off the board, or a board
      // that refused the ghost (bounded and full).
      chip.classList.toggle('axdb-out', zone.kind === 'home' || zone.kind === 'off' || (zone.kind === 'board' && (!leg || landingHidden())));
      api.render();
    };
    const done = (changed: boolean, kind: 'commit' | 'cancel'): void => {
      disarmGlideSoon();
      enforceBoardHeight();
      persistLayouts();
      api.renderNow();
      options.onGesture?.({ type: kind, kind: 'move', nodeId: pageId, changed });
    };
    const finish = (commit: boolean): void => {
      detach();
      chip.remove();
      hideOverlay();
      plan.markDrop(null, null);
      setTearing(null);
      if (disposed()) return;
      const world = toWorld(last.x, last.y);
      const z: Zone = commit ? zoneAt(last.x, last.y, world) : { kind: 'home' };
      if (z.kind !== 'root') undoInsertRows();
      if (!commit || z.kind === 'home' || z.kind === 'off' || (z.kind === 'root' && !ensureLeg(world, null)) || (z.kind === 'board' && (!ensureLeg(world, z.peer ?? null) || landingHidden()))) {
        undoSplitPreview();
        leg?.abort();
        done(false, 'cancel');
        return;
      }
      if (z.kind === 'reorder') {
        undoSplitPreview();
        leg?.abort();
        const cmds = plan.reorder(z.index);
        const changed = cmds.length > 0 ? execute('Reorder tab', cmds) : false;
        done(changed, changed ? 'commit' : 'cancel');
        return;
      }
      if (z.kind === 'strip' || z.kind === 'join') {
        // JOIN: no cell on this board — the leg is abandoned (its displaced
        // tiles are already home) and the page becomes the target's tab.
        undoSplitPreview();
        const index = z.kind === 'strip' ? z.index : plan.dropIndex(z.target.id, last.x, last.y);
        leg?.abort();
        const planned = plan.join(z.target.id, index, group.id);
        done(execute('Move tab', [...planned.move, ...planned.collapse]), 'commit');
        return;
      }
      if (z.kind === 'split') {
        // SPLIT: the target keeps one half of its cell, the page's new group the
        // other. The hover only tinted the half; the halving happens NOW.
        hideOverlay();
        plan.markDrop(null, null);
        if (!previewSplit(z, world)) {
          // The half cannot be taken (a bounded board with no room for the
          // ghost): the page joins the target instead, as it would have had
          // the target been too small to halve.
          leg?.abort();
          const planned = plan.join(z.target.id, plan.dropIndex(z.target.id, last.x, last.y), group.id);
          done(execute('Move tab', [...planned.move, ...planned.collapse]), 'commit');
          return;
        }
        const fin = leg?.finalize() ?? null;
        const halved = !!split && !!eng().getItem(z.target.id);
        split = null;
        if (!fin || !halved) {
          leg?.abort();
          done(false, 'cancel');
          return;
        }
        const planned = plan.commands(fin.cell, fin.rect, group.id);
        // The target's halving is in the leg's own deltas: its cell at rest was
        // snapshotted when the ghost entered, and its half is where it stands now.
        const changed = execute('Split group', [...fin.commands, ...planned.move, ...planned.collapse]);
        done(changed, 'commit');
        return;
      }
      // ROOT DOCK: the hover only tinted the band; the ghost takes it NOW. A
      // free cell on the board: the leg already sits where it will land.
      if (z.kind === 'root') realizeDock(z, world);
      else if (zoneKey(zone) !== zoneKey(z)) applyZone(z, world);
      hideOverlay(); // a re-applied zone repaints its preview; the release is not a preview
      plan.markDrop(null, null);
      const fin = leg?.finalize() ?? null;
      if (!fin) {
        done(false, 'cancel');
        return;
      }
      const planned = plan.commands(fin.cell, fin.rect, leg?.groupId ?? group.id);
      done(execute(z.kind === 'root' ? 'Dock tab' : 'Move tab out', [...fin.commands, ...planned.move, ...planned.collapse]), 'commit');
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
    return true;
  };

  return beginTearOut;
}
