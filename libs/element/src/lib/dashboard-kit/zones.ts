/**
 * zones — where a dragged tile lands, decided once, recursively (tile first,
 * step 2).
 *
 * Every board is an engine; every container is a tile of its parent's board
 * and a board for its own children. `resolve` walks that tree from the roots
 * inward and answers, for a pointer, one of four things:
 *
 *   - `strip`  — a tab slot in a container's strip (the client-space hit the
 *                binder supplies wins over every board, as it always has);
 *   - `beside` — the outer fifth of a container: a cell next to it on the
 *                board the container itself sits on;
 *   - `plain`  — a cell on the deepest board under the pointer that can be
 *                entered; "into a container" is nothing more than descending
 *                one level, so it needs no kind of its own;
 *   - `off`    — outside every board.
 *
 * A container is OPAQUE — never entered, its bands still answering — when it
 * is static, when entering it would exceed the depth policy, or when it is
 * part of the dragged subtree (a container cannot be dropped into its own
 * descendant). The strip rows of a tab container are nobody's band, and its
 * margin (inside the frame, outside the page) is a plain cell on the parent.
 *
 * `stripUnder` walks the same tree for the strip itself, so a tab slot and a
 * band are decided on one set of frames — the ones the containers REST in,
 * never the ones a preview pushed them to.
 *
 * This module is pure geometry: no DOM, no engine, no model. The binder
 * builds the tree for each move from its peers and the model, and acts on
 * the answer.
 */

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BesideSide = 'left' | 'right' | 'top' | 'bottom';

/** A board in the walk: the binder's peer behind it rides in `ref`. */
export interface ZoneBoard {
  id: string;
  /** Roots are 0; a container's inner board is its board's depth + 1. */
  depth: number;
  ref?: unknown;
  contains(x: number, y: number): boolean;
  /** Containment plus the one-row grace under the board (gridstack's extra drag row). */
  containsExtended(x: number, y: number): boolean;
  children(): ZoneContainer[];
}

/** A container as the walk sees it: a frame on its board, a layout, and the board inside it. */
export interface ZoneContainer {
  id: string;
  layout: 'grid' | 'split' | 'tabs';
  static: boolean;
  frame: ZoneRect;
  /** The rows at the top that belong to the strip: never a band. 0 for a section. */
  stripHeight: number;
  /** The outer fraction of the body that means "beside"; 0 for a container whose whole body is "into" (a section). */
  band: number;
  /** The TOP and BOTTOM depth in world units, when it is a fixed depth rather than `band` of the body. */
  bandY?: number;
  /** The board a descent enters: a tab container's ACTIVE page, a section's own board. Null: nothing to enter. */
  inner: ZoneBoard | null;
}

export interface StripHit {
  containerId: string;
  index: number;
}

/** The beside the hand already holds, with the container's frame AT REST and the cell the widget took. */
export interface BesideMemory {
  containerId: string;
  side: BesideSide;
  frame0: ZoneRect;
  /**
   * The cell the widget TOOK, when it took one. A beside that is only MARKED
   * (a vertical band since 0.4.61 — nothing moves until release) has none, and
   * must not borrow one: the cell a mark would take is the container's own, so
   * for a widget the size of its container that rect covers the whole panel
   * and the band would then hold the hand everywhere inside it (lab L105).
   */
  vacated?: ZoneRect;
}

export interface ResolveInput {
  x: number;
  y: number;
  roots: ZoneBoard[];
  strip: StripHit | null;
  prev: BesideMemory | null;
  /** The deepest board a drop may enter (a root is 0). */
  maxDepth: number;
  /** The depth of the dragged subtree: 0 for a widget, 1 for a section, 2 for a section holding a section. */
  ghostDepth: number;
  /** The groups inside the dragged tile: never entered. */
  ghostSubtree: ReadonlySet<string>;
  /** The board's gap, the tolerance around the vacated cell. */
  gap: number;
  /**
   * The containers the dragged tile's OWN board sits in, innermost first or
   * in any order: their bands do not apply to it. A widget leaving its page
   * through the page's left fifth is moving within the page, not asking to
   * be put beside the container it is still inside.
   */
  homeChain: ReadonlySet<string>;
  /**
   * Containers of the source board as they stood when the gesture began. The
   * hand over a pushed container's rest frame still means that container —
   * its zones, its page tested at the displacement — or the target flees the
   * hand that is aiming at it: a group could never enter a container its own
   * body reaches first (0.4.44), and a widget aimed at a tab strip chased a
   * strip its own preview kept shoving away (0.4.60). The engine's memory
   * brings the pushed container home when the ghost leaves the board.
   */
  restFrames?: ReadonlyMap<string, ZoneRect>;
}

export type Zone =
  | { kind: 'off' }
  | { kind: 'plain'; board: ZoneBoard; grace: boolean }
  | { kind: 'strip'; containerId: string; index: number }
  | { kind: 'beside'; board: ZoneBoard; containerId: string; side: BesideSide; kept: boolean };

/** The outer fifth of a container's body is beside it — the bands a tab's split uses. */
export const BESIDE_BAND = 0.2;
/** How much wider a band is for a hand ALREADY in it: a hand resting on the line must not flicker. */
export const BESIDE_STAY = 0.05;

const inRect = (r: ZoneRect, x: number, y: number, tol = 0): boolean =>
  x >= r.x - tol && x <= r.x + r.width + tol && y >= r.y - tol && y <= r.y + r.height + tol;

/**
 * The band of a container frame a point is in: null in the strip rows, in
 * the middle, or outside. The left and right bands take the corners (VS
 * Code's precedence): a one-row widget carried along the top of a tall panel
 * to its far right means "after it", not "above it".
 *
 * `bandY` is the TOP and BOTTOM depth in world units. A fraction is the wrong
 * unit there: it grows with the container, so the taller and more useful the
 * panel, the more of its page means "above the whole panel" — 216 px of the
 * fluid demo's panel, starting right under its tabs, which is exactly where a
 * hand aiming into the page lands (0.4.62). The SIDES keep the fraction: that
 * is how a widget gets beside a full-height panel, and a tab's split bands
 * are a fifth on all four edges by design.
 */
export function bandOf(f: ZoneRect, stripHeight: number, x: number, y: number, band = BESIDE_BAND, bandY?: number): BesideSide | null {
  if (band <= 0 || !inRect(f, x, y)) return null;
  const bodyY = f.y + stripHeight;
  const bodyH = Math.max(1, f.height - stripHeight);
  const rx = (x - f.x) / Math.max(1, f.width);
  const ry = (y - bodyY) / bodyH;
  if (ry < 0) return null; // the strip: a new tab, the strip's own business
  if (rx < band) return 'left';
  if (rx > 1 - band) return 'right';
  const depth = bandY !== undefined && bandY > 0 ? Math.min(bandY, bodyH / 2) : band * bodyH;
  if (y - bodyY < depth) return 'top';
  if (bodyY + bodyH - y < depth) return 'bottom';
  return null;
}

export interface StripProbe {
  x: number;
  y: number;
  roots: ZoneBoard[];
  /** The container whose strip the gesture already holds: its rows are widened by `stay`, and it wins over a neighbour's. */
  held: string | null;
  /** The stickiness around the held strip, in world units. */
  stay: number;
  /** Containers the gesture has displaced, at the frames they rest in. */
  restFrames?: ReadonlyMap<string, ZoneRect>;
}

/**
 * The tab strip under a pointer — WHERE THE CONTAINER RESTS, read from the
 * same tree at the same frames as `resolve`.
 *
 * A strip is painted at the top of its container, so it travels with it: a
 * beside shifts the container, a refusal pushes it, and it GLIDES home
 * afterwards. Hit-testing the painted box therefore makes the strip a target
 * at wherever the preview happened to put it — and a box in the air sweeps
 * under a hand that is not moving at all and steals the zone. That is a
 * closed loop: the tab claims the hand, the container comes home, the band
 * under the hand claims it back, the container is pushed away, and the strip
 * flies through the pointer again. The user met it as "it flickers between a
 * tab and above the group; I have to go very slowly".
 *
 * So the rows are the container's own, at rest, on the model's frames. What
 * a hand means never depends on what the preview did with it.
 */
export function stripUnder(p: StripProbe): { containerId: string } | null {
  const { x, y } = p;
  // Plain locals, not one object: a `let` assigned only inside the closure
  // narrows to `never` at the return.
  let bestId: string | null = null;
  let bestDepth = -1;
  let bestHeld = false;
  const visit = (b: ZoneBoard, dx: number, dy: number): void => {
    for (const c of b.children()) {
      const rest = p.restFrames?.get(c.id);
      const atRest = rest && inRect(rest, x, y) ? rest : null;
      const frame = atRest ?? c.frame;
      const tx = atRest ? x : x + dx;
      const ty = atRest ? y : y + dy;
      const held = c.id === p.held;
      const pad = held ? p.stay : 0;
      if (c.stripHeight > 0 && inRect({ x: frame.x, y: frame.y, width: frame.width, height: c.stripHeight }, tx, ty, pad)) {
        if (bestId === null || held || (!bestHeld && b.depth >= bestDepth)) {
          bestId = c.id;
          bestDepth = b.depth;
          bestHeld = held;
        }
      }
      if (c.inner && inRect(frame, tx, ty, pad)) visit(c.inner, atRest ? c.frame.x - atRest.x : dx, atRest ? c.frame.y - atRest.y : dy);
    }
  };
  for (const r of p.roots) visit(r, 0, 0);
  return bestId === null ? null : { containerId: bestId };
}

export interface ContainerProbe {
  x: number;
  y: number;
  roots: ZoneBoard[];
  /** Containers the gesture has displaced, at the frames they rest in. */
  restFrames?: ReadonlyMap<string, ZoneRect>;
  /** The groups inside the dragged tile: never a target, so never lit. */
  ghostSubtree?: ReadonlySet<string>;
  /** The containers the dragged tile's own board sits in: their bands do not apply to it, so they are not lit either. */
  homeChain?: ReadonlySet<string>;
}

/** A container's edges, for showing a hand what they mean. */
export interface ContainerBands {
  containerId: string;
  frame: ZoneRect;
  stripHeight: number;
  band: number;
  bandY?: number;
}

/**
 * The deepest container under a pointer whose EDGES mean something — the one
 * whose bands a drag should be shown while it is held there.
 *
 * `bandOf` decides; this only reports where the decision lives, on the same
 * tree and the same frames, so a painted lane and the zone it stands for can
 * never disagree. Without it the bands are invisible: 0.4.62 made the top and
 * bottom a fixed 30 px, which is a fine target and an impossible guess — to
 * put a widget ABOVE a panel you point just BELOW its header, inside what
 * reads as page content. ("Nothing moves it any more, but how can I drag
 * something on top of the tab group?")
 */
export function containerUnder(p: ContainerProbe): ContainerBands | null {
  const { x, y } = p;
  let best: ContainerBands | null = null;
  let bestDepth = -1;
  const visit = (b: ZoneBoard, dx: number, dy: number): void => {
    for (const c of b.children()) {
      if (p.ghostSubtree?.has(c.id)) continue;
      const rest = p.restFrames?.get(c.id);
      const atRest = rest && inRect(rest, x, y) ? rest : null;
      const frame = atRest ?? c.frame;
      const tx = atRest ? x : x + dx;
      const ty = atRest ? y : y + dy;
      if (!inRect(frame, tx, ty)) continue;
      if (c.band > 0 && !p.homeChain?.has(c.id) && b.depth >= bestDepth) {
        best = { containerId: c.id, frame, stripHeight: c.stripHeight, band: c.band, ...(c.bandY === undefined ? {} : { bandY: c.bandY }) };
        bestDepth = b.depth;
      }
      if (c.inner) visit(c.inner, atRest ? c.frame.x - atRest.x : dx, atRest ? c.frame.y - atRest.y : dy);
    }
  };
  for (const r of p.roots) visit(r, 0, 0);
  return best;
}

/** Where a container's four bands are, in the same world units as its frame. */
export function bandRects(c: ContainerBands): { side: BesideSide; rect: ZoneRect }[] {
  const bodyY = c.frame.y + c.stripHeight;
  const bodyH = Math.max(1, c.frame.height - c.stripHeight);
  const w = Math.max(1, c.frame.width);
  const side = w * c.band;
  const depth = c.bandY !== undefined && c.bandY > 0 ? Math.min(c.bandY, bodyH / 2) : c.band * bodyH;
  return [
    { side: 'left', rect: { x: c.frame.x, y: bodyY, width: side, height: bodyH } },
    { side: 'right', rect: { x: c.frame.x + w - side, y: bodyY, width: side, height: bodyH } },
    // the sides take the corners (bandOf tests rx first), so top and bottom stop short of them
    { side: 'top', rect: { x: c.frame.x + side, y: bodyY, width: w - 2 * side, height: depth } },
    { side: 'bottom', rect: { x: c.frame.x + side, y: bodyY + bodyH - depth, width: w - 2 * side, height: depth } },
  ];
}

/** The board a container sits on, found by id through the tree. */
function boardOf(roots: ZoneBoard[], containerId: string): ZoneBoard | null {
  const visit = (b: ZoneBoard): ZoneBoard | null => {
    for (const c of b.children()) {
      if (c.id === containerId) return b;
      const deeper = c.inner ? visit(c.inner) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  for (const r of roots) {
    const found = visit(r);
    if (found) return found;
  }
  return null;
}

export function resolve(input: ResolveInput): Zone {
  const { x, y } = input;
  if (input.strip) return { kind: 'strip', containerId: input.strip.containerId, index: input.strip.index };

  // The beside the hand already holds: the same band of the container's
  // ORIGINAL frame (a little wider), or the cell the widget took, keeps it —
  // the container is what moved, and its live frame is no guide. A different
  // band of that frame is a zone change and wins over the vacated cell; the
  // middle of it is a zone change too (into the page).
  if (input.prev) {
    const p = input.prev;
    const c0 = containerOf(input.roots, p.containerId);
    const stripH = c0?.stripHeight ?? 0;
    const depth = c0?.bandY;
    const stay = bandOf(p.frame0, stripH, x, y, BESIDE_BAND + BESIDE_STAY, depth === undefined ? undefined : depth * (1 + BESIDE_STAY / BESIDE_BAND));
    const other = bandOf(p.frame0, stripH, x, y, BESIDE_BAND, depth);
    const onVacated = !!p.vacated && inRect(p.vacated, x, y, input.gap);
    const held = stay === p.side || (!(other !== null && other !== p.side) && onVacated);
    if (held) {
      const board = boardOf(input.roots, p.containerId);
      if (board) return { kind: 'beside', board, containerId: p.containerId, side: p.side, kept: true };
    }
  }

  // A static container and a container too deep for the ghost are obstacles:
  // the hand over them means a cell on their parent board. The GHOST'S OWN
  // subtree is not an obstacle but glass: a container carried by hand has its
  // frame under the pointer at every step, and reading it as a hit answered
  // "plain on the parent" before the walk ever looked at the page beneath.
  const opaque = (board: ZoneBoard, c: ZoneContainer): boolean =>
    c.static || board.depth + 1 + input.ghostDepth > input.maxDepth;

  // The container the hand holds is read at REST: its live frame is where the
  // beside pushed or shifted it, and a hand crossing from its top band to its
  // corner would otherwise find it gone from under the pointer (0.4.48's
  // corner). Its subtree moved with it, so those boards are tested at the
  // same displacement.
  const held = input.prev;
  const descend = (board: ZoneBoard, dx: number, dy: number): Zone => {
    const px = x + dx;
    const py = y + dy;
    for (const c of board.children()) {
      if (input.ghostSubtree.has(c.id)) continue; // the carried container itself, and the boards inside it: glass
      // the held container at rest — unless the hand has left that frame for the live one;
      // and any container the ghost pushed, at rest the same way
      const rest = input.restFrames?.get(c.id);
      const atRest = rest && inRect(rest, x, y) ? rest : held && c.id === held.containerId && inRect(held.frame0, x, y) ? held.frame0 : null;
      const frame = atRest ?? c.frame;
      const tx = atRest ? x : px;
      const ty = atRest ? y : py;
      if (!inRect(frame, tx, ty)) continue;
      // A band does not reach THROUGH a nested container: a hand over a
      // section inside the page is inside the page, wherever the outer
      // container's fifth falls (the inset margin is what remains of the
      // band there). The page's plain widgets do not stop it.
      const ndx0 = atRest ? c.frame.x - atRest.x : dx;
      const ndy0 = atRest ? c.frame.y - atRest.y : dy;
      const overNested = !!c.inner && c.inner.children().some((cc) => inRect(cc.frame, x + ndx0, y + ndy0));
      const side = overNested || input.homeChain.has(c.id) ? null : bandOf(frame, c.stripHeight, tx, ty, c.band, c.bandY);
      if (side) return { kind: 'beside', board, containerId: c.id, side, kept: false };
      if (opaque(board, c) || !c.inner) return { kind: 'plain', board, grace: false };
      if (!c.inner.contains(x + ndx0, y + ndy0)) return { kind: 'plain', board, grace: false }; // the margin: the container's own frame
      return descend(c.inner, ndx0, ndy0);
    }
    return { kind: 'plain', board, grace: false };
  };

  for (const root of input.roots) if (root.contains(x, y)) return descend(root, 0, 0);

  // Nothing strict matched: the deepest board whose grace row holds the point.
  let deepest: ZoneBoard | null = null;
  const visit = (b: ZoneBoard): void => {
    if (b.containsExtended(x, y) && (!deepest || b.depth > deepest.depth)) deepest = b;
    for (const c of b.children()) if (c.inner) visit(c.inner);
  };
  for (const root of input.roots) visit(root);
  return deepest ? { kind: 'plain', board: deepest, grace: true } : { kind: 'off' };
}

/** The container with this id, anywhere in the tree — its strip rows and its band depth. */
function containerOf(roots: ZoneBoard[], containerId: string): ZoneContainer | null {
  const visit = (b: ZoneBoard): ZoneContainer | null => {
    for (const c of b.children()) {
      if (c.id === containerId) return c;
      const deeper = c.inner ? visit(c.inner) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  for (const r of roots) {
    const c = visit(r);
    if (c) return c;
  }
  return null;
}

// -- TAB drags: a page torn out of its strip, over the same tree ------------

/** A join target as the walk sees it: another tab container, its frame anchored by the binder while the pointer is inside it. */
export interface TabTarget {
  id: string;
  frame: ZoneRect;
  stripHeight: number;
}

export interface TabZoneInput {
  x: number;
  y: number;
  /** Inside the visible canvas plus its grace, in CLIENT space: off otherwise, whatever the world point says. */
  clientInside: boolean;
  /** The source strip's slot under the pointer (client space), else null. */
  ownStrip: number | null;
  /** A target strip's slot under the pointer (client space), else null. */
  stripOf(targetId: string): number | null;
  /** The board's own edge band under the pointer (client space) — a dock; null on boards that have none. */
  root: { side: BesideSide } | null;
  /** The join target whose frame holds the point, or null. */
  target: TabTarget | null;
  /** The source group's frame, when the pointer is inside it. */
  home: ZoneRect | null;
  /** The source group's own band: 0 keeps its whole frame "home", a fifth lets its edges mean "beside myself". */
  homeBand: number;
  /** The outer fraction of a target's body that splits it (Dockview's fifth). */
  band: number;
  /** Whether the target can be halved on that side (a grid target too small refuses; a pane always can). */
  canSplit(targetId: string, side: BesideSide): boolean;
  /** A pane insertion exists under the pointer (split boards). */
  pane: boolean;
  /** A foreign board lies under the pointer and takes the drop (grid boards). */
  foreign: boolean;
}

export type TabZone =
  | { kind: 'off' }
  | { kind: 'reorder'; index: number }
  | { kind: 'strip'; targetId: string; index: number }
  | { kind: 'root'; side: BesideSide }
  | { kind: 'join'; targetId: string }
  | { kind: 'split'; targetId: string; side: BesideSide }
  | { kind: 'home' }
  | { kind: 'pane' }
  | { kind: 'board'; foreign: boolean };

/**
 * What a pointer means for a TORN-OUT PAGE, in the one order both binders
 * use: off the canvas, then a strip (the most precise target there is —
 * a target's, or the source's own for a reorder), then the board's own
 * edges (Dockview's container edges beat the groups against them), then the
 * target under the pointer — its outer fifth splits it on that side, the
 * sides taking the corners, its middle joins it — then home, then a pane, a
 * foreign board, or this board.
 */
export function resolveTabZone(input: TabZoneInput): TabZone {
  if (!input.clientInside) return { kind: 'off' };
  const { x, y } = input;
  if (input.target) {
    const idx = input.stripOf(input.target.id);
    if (idx !== null) return { kind: 'strip', targetId: input.target.id, index: idx };
  } else if (input.ownStrip !== null) return { kind: 'reorder', index: input.ownStrip };
  if (input.root) return { kind: 'root', side: input.root.side };
  if (input.target) {
    const t = input.target;
    const side = bandOf(t.frame, t.stripHeight, x, y, input.band);
    if (side && input.canSplit(t.id, side)) return { kind: 'split', targetId: t.id, side };
    return { kind: 'join', targetId: t.id };
  }
  if (input.home && inRect(input.home, x, y) && !bandOf(input.home, 0, x, y, input.homeBand)) return { kind: 'home' };
  if (input.pane) return { kind: 'pane' };
  return { kind: 'board', foreign: input.foreign };
}
