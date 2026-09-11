/**
 * zones — the recursive resolve of the tile-first drag model (step 2).
 *
 * One pure function decides what a pointer over the canvas MEANS for a
 * dragged tile: a plain cell on some board, a tab slot in a strip, or a
 * place beside a container. It walks the boards' membership tree from the
 * roots inward — a container is a tile of its parent's board and a board for
 * its children — and every rule below is pinned here before the binder uses
 * it, with hand-built boards so the geometry is the whole story.
 *
 *   root (0,0 1200×600)
 *   ├── 'side'  tab container  frame (900,0 300×480), strip 30, active page 'p1' (908,38 284×434)
 *   │     └── 'sec' section inside the page, frame (920,200 260×120) with its own board
 *   └── 'ops'   section        frame (0,420 880×160), whole body = into
 */
import { BESIDE_BAND, BESIDE_STAY, bandOf, resolve, resolveTabZone, stripUnder, type TabZoneInput, type Zone, type ZoneBoard, type ZoneContainer } from './zones';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** A board ref over a frame, with one extra row of grace below it. */
const board = (id: string, frame: Rect, depth: number, children: () => ZoneContainer[], ref?: unknown): ZoneBoard => ({
  id,
  depth,
  ref: ref ?? id,
  contains: (x, y) => inRect(frame, x, y),
  containsExtended: (x, y) => inRect({ ...frame, height: frame.height + 60 }, x, y),
  children,
});

const SEC_FRAME = { x: 920, y: 200, width: 260, height: 120 };
const SIDE_FRAME = { x: 900, y: 0, width: 300, height: 480 };
const PAGE_FRAME = { x: 908, y: 38, width: 284, height: 434 };
const OPS_FRAME = { x: 0, y: 420, width: 880, height: 160 };

function tree(opts: { sideStatic?: boolean; secStatic?: boolean } = {}): ZoneBoard[] {
  const secBoard = board('sec', SEC_FRAME, 2, () => []);
  const sec: ZoneContainer = { id: 'sec', layout: 'grid', static: opts.secStatic ?? false, frame: SEC_FRAME, stripHeight: 0, band: 0, inner: secBoard };
  const page = board('p1', PAGE_FRAME, 1, () => [sec]);
  const side: ZoneContainer = { id: 'side', layout: 'tabs', static: opts.sideStatic ?? false, frame: SIDE_FRAME, stripHeight: 30, band: BESIDE_BAND, inner: page };
  const opsBoard = board('ops', OPS_FRAME, 1, () => []);
  const ops: ZoneContainer = { id: 'ops', layout: 'grid', static: false, frame: OPS_FRAME, stripHeight: 0, band: 0, inner: opsBoard };
  const root = board('root', { x: 0, y: 0, width: 1200, height: 600 }, 0, () => [side, ops]);
  return [root];
}

const at = (x: number, y: number, extra: Partial<Parameters<typeof resolve>[0]> = {}): Zone =>
  resolve({ x, y, roots: tree(), strip: null, prev: null, maxDepth: 2, ghostDepth: 0, ghostSubtree: new Set(), gap: 10, homeChain: new Set(), ...extra });

describe('zones — bandOf: the outer fifth of a container, sides first', () => {
  const f = { x: 0, y: 0, width: 300, height: 480 };
  it('the strip rows are nobody\'s band, the middle is null, the fifths are sides', () => {
    expect(bandOf(f, 30, 150, 10)).toBeNull(); // in the strip
    expect(bandOf(f, 30, 150, 240)).toBeNull(); // the middle
    expect(bandOf(f, 30, 20, 240)).toBe('left');
    expect(bandOf(f, 30, 280, 240)).toBe('right');
    expect(bandOf(f, 30, 150, 40)).toBe('top');
    expect(bandOf(f, 30, 150, 470)).toBe('bottom');
    expect(bandOf(f, 30, 400, 240)).toBeNull(); // outside
  });
  it('a top and bottom band can be a FIXED DEPTH instead of a fifth of the body', () => {
    // A fifth is the wrong unit for a tall container: the taller the panel the
    // more of its page means "above the whole panel", and on the fluid demo's
    // 1,110 px panel that was 216 px of what reads as content, starting right
    // under the tabs. The sides keep the fifth — that is how a widget gets
    // beside a full-height panel, and nobody has found it surprising.
    expect(bandOf(f, 30, 150, 60)).toBe('top'); // the fraction, which a tab's SPLIT still uses
    expect(bandOf(f, 30, 150, 45, BESIDE_BAND, 30)).toBe('top');
    expect(bandOf(f, 30, 150, 65, BESIDE_BAND, 30)).toBeNull(); // 35 px under the strip: the page
    expect(bandOf(f, 30, 150, 470, BESIDE_BAND, 30)).toBe('bottom');
    expect(bandOf(f, 30, 150, 440, BESIDE_BAND, 30)).toBeNull();
    expect(bandOf(f, 30, 20, 240, BESIDE_BAND, 30)).toBe('left'); // the sides are untouched
    expect(bandOf(f, 30, 290, 45, BESIDE_BAND, 30)).toBe('right'); // …and still take the corners
  });
  it('the left and right bands win the corners (VS Code\'s precedence)', () => {
    expect(bandOf(f, 30, 290, 35)).toBe('right'); // top-right corner → right, not top
    expect(bandOf(f, 30, 10, 475)).toBe('left'); // bottom-left corner → left
  });
  it('a wider band is the stickiness for a hand already in it', () => {
    expect(bandOf(f, 30, 66, 240)).toBeNull(); // rx .22: not in the fifth
    expect(bandOf(f, 30, 66, 240, BESIDE_BAND + BESIDE_STAY)).toBe('left'); // but inside the sticky quarter
  });
});

describe('zones — resolve: the walk from the roots inward', () => {
  it('a pointer over empty root space is a plain cell on the root', () => {
    expect(at(300, 100)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'root' }), grace: false });
  });
  it('outside every board is off; one row of grace under a board is a plain cell with grace, the deepest board\'s grace winning', () => {
    expect(at(300, 900)).toEqual({ kind: 'off' });
    expect(at(1000, 630)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'root' }), grace: true }); // only the root's grace row holds it
    expect(at(300, 630)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'ops' }), grace: true }); // the section's grace row too, and it is deeper
  });
  it('a strip hit wins over every board', () => {
    expect(at(950, 15, { strip: { containerId: 'side', index: 1 } })).toEqual({ kind: 'strip', containerId: 'side', index: 1 });
  });
  it('the outer fifth of a tab container is beside it, on the container\'s OWN board', () => {
    expect(at(912, 240)).toEqual({ kind: 'beside', board: expect.objectContaining({ id: 'root' }), containerId: 'side', side: 'left', kept: false }); // (912: left of the nested section, which starts at 920)
    expect(at(1190, 240)).toMatchObject({ kind: 'beside', containerId: 'side', side: 'right' });
    expect(at(1050, 40)).toMatchObject({ kind: 'beside', containerId: 'side', side: 'top' });
    expect(at(1190, 40)).toMatchObject({ kind: 'beside', containerId: 'side', side: 'right' }); // the corner
  });
  it('with a fixed band depth, the rows just under the strip are the PAGE, not "above the container"', () => {
    const roots = tree();
    const side = roots[0].children()[0] as ZoneContainer;
    side.bandY = 30;
    expect(at(1050, 80, { roots })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) }); // 50 px under the strip
    expect(at(1050, 50, { roots })).toMatchObject({ kind: 'beside', containerId: 'side', side: 'top' }); // the first 30 px still mean above it
  });
  it('the middle of a tab container descends into its ACTIVE page: a plain cell on the page\'s board', () => {
    expect(at(1050, 120)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'p1', depth: 1 }), grace: false });
  });
  it('a section has no bands: its whole body is into, at any depth', () => {
    expect(at(400, 500)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'ops', depth: 1 }), grace: false });
    expect(at(1050, 260)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'sec', depth: 2 }), grace: false }); // inside the page, inside the section
  });
  it('a band does not reach THROUGH a nested container: over the section inside the page, the walk descends', () => {
    // the section 'sec' (920..1180) lies under the tab container's right band (1140..1200): a hand over the section is in the page
    expect(at(1170, 260)).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'sec' }), grace: false });
    // above the section, the same x is the band
    expect(at(1170, 120)).toMatchObject({ kind: 'beside', containerId: 'side', side: 'right' });
  });
  it('a container\'s band does not apply to a widget that lives INSIDE it: leaving its page through the fifth is a move within the page', () => {
    expect(at(912, 100)).toMatchObject({ kind: 'beside', containerId: 'side', side: 'left' });
    expect(at(912, 100, { homeChain: new Set(['side']) })).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }), grace: false });
  });
  it('the margin of a tab container — inside its frame, outside its page — is a plain cell on the PARENT board', () => {
    // just under the strip, in the 8-px inset above the page
    expect(at(1050, 34)).toMatchObject({ kind: 'beside', side: 'top' }); // the top band starts at the strip's bottom
    // the right inset between the page's edge and the frame, in the middle rows (the band is 0.2 → 60 px; the inset is 8 px, so it is band)
    expect(at(1195, 240)).toMatchObject({ kind: 'beside', side: 'right' });
  });
});

describe('zones — policy: depth, static and the ghost\'s own subtree make a container opaque', () => {
  it('a container deeper than the policy allows is never entered: the pointer means a plain cell on its parent board', () => {
    expect(at(1050, 260, { maxDepth: 1 })).toEqual({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }), grace: false });
    // the page itself is at depth 1: still entered at maxDepth 1
    expect(at(1050, 120, { maxDepth: 1 })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) });
    // a container ghost of depth 1 dropped into the page would reach depth 2: refused at maxDepth 1 → plain on the root, over the container
    expect(at(1050, 120, { maxDepth: 1, ghostDepth: 1 })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'root' }) });
  });
  it('a static container is opaque: no into, but its bands still say beside', () => {
    const roots = tree({ sideStatic: true });
    expect(at(1050, 120, { roots })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'root' }) });
    expect(at(912, 240, { roots })).toMatchObject({ kind: 'beside', containerId: 'side', side: 'left' });
  });
  it('a container in the ghost\'s own subtree is never entered (a container cannot be dropped into its descendant)', () => {
    expect(at(1050, 260, { ghostSubtree: new Set(['sec']) })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) });
    // THE GHOST IS GLASS (4b-ii): a container carried by hand has its own frame under the pointer at every step. Read as a
    // hit it answered "plain on the root" before the walk looked at the page beneath — a section could never enter a page.
    const carried: ZoneContainer = { id: 'carried', layout: 'grid', static: false, frame: { x: 1000, y: 200, width: 150, height: 100 }, stripHeight: 0, band: 0, inner: board('carried', { x: 1000, y: 200, width: 150, height: 100 }, 1, () => []) };
    const roots = tree();
    const rootKids = roots[0].children;
    roots[0].children = () => [carried, ...rootKids()]; // the ghost's frame is listed FIRST, over the page's body
    expect(resolve({ x: 1050, y: 260, roots, strip: null, prev: null, maxDepth: 5, ghostDepth: 0, ghostSubtree: new Set(['carried']), gap: 10, homeChain: new Set() })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'sec' }) }); // through the page to the section under the pointer
    // A CONTAINER THE GHOST PUSHED IS READ AT REST (4b-ii): the side panel pushed 300 px down by a group ghost's intent is
    // still "there" for the hand at its rest frame, its page tested at the same displacement — so the group can enter it.
    const pushed = tree();
    const kids = pushed[0].children();
    const sidePushed: ZoneContainer = { ...kids[0], frame: { ...SIDE_FRAME, y: SIDE_FRAME.y + 300 }, inner: board('p1', { ...PAGE_FRAME, y: PAGE_FRAME.y + 300 }, 1, () => []) };
    pushed[0].children = () => [sidePushed, kids[1]];
    const restFrames = new Map([['side', SIDE_FRAME]]);
    expect(resolve({ x: 1050, y: 150, roots: pushed, strip: null, prev: null, maxDepth: 5, ghostDepth: 1, ghostSubtree: new Set(['carried']), gap: 10, homeChain: new Set(), restFrames })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) });
    // without the rest frames the hand over that spot is empty root space
    expect(resolve({ x: 1050, y: 150, roots: pushed, strip: null, prev: null, maxDepth: 5, ghostDepth: 1, ghostSubtree: new Set(['carried']), gap: 10, homeChain: new Set() })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'root' }) });
    // …and a widget ghost (no subtree) over that same container is a hit on it, as before
    expect(resolve({ x: 1050, y: 260, roots, strip: null, prev: null, maxDepth: 5, ghostDepth: 0, ghostSubtree: new Set(), gap: 10, homeChain: new Set() })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'carried' }) });
  });
});

describe('zones — stickiness: a beside the hand already holds', () => {
  const prev = { containerId: 'side', side: 'right' as const, frame0: SIDE_FRAME, vacated: { x: 1120, y: 0, width: 80, height: 60 } };
  it('the same band, a little wider, keeps the beside even though the container has moved away', () => {
    // the container shifted left: its live frame no longer holds the point, but the original frame's sticky right band does
    const roots = tree();
    (roots[0].children()[0] as ZoneContainer).frame = { ...SIDE_FRAME, x: 820 };
    expect(at(1145, 240, { roots, prev })).toEqual({ kind: 'beside', board: expect.objectContaining({ id: 'root' }), containerId: 'side', side: 'right', kept: true });
  });
  it('over the cell the widget took — the vacated cell — the beside is kept too', () => {
    expect(at(1160, 30, { prev })).toMatchObject({ kind: 'beside', side: 'right', kept: true });
  });
  it('a beside with NO vacated cell is held by its band alone', () => {
    // A vertical band is only MARKED since 0.4.61: nothing moved, so there is
    // no cell the widget took. The cell it WOULD take is the container's own —
    // for a widget the size of its container that is the whole panel, and
    // borrowing it as the vacated rect held the band everywhere inside (L105).
    const mark = { containerId: 'side', side: 'top' as const, frame0: SIDE_FRAME };
    expect(at(1050, 50, { prev: mark })).toMatchObject({ kind: 'beside', side: 'top', kept: true }); // in the band
    expect(at(1050, 160, { prev: mark })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) }); // past the band: into the page
  });
  it('a DIFFERENT band of the original frame wins over the vacated cell (a widget as wide as the container)', () => {
    const wide = { ...prev, side: 'top' as const, vacated: SIDE_FRAME };
    expect(at(1190, 40, { prev: wide })).toMatchObject({ kind: 'beside', side: 'right', kept: false });
  });
  it('the container the hand holds is read AT REST: pushed down by a top band, its corner is still its corner (0.4.48\'s corner)', () => {
    const roots = tree();
    const side = roots[0].children()[0] as ZoneContainer;
    side.frame = { ...SIDE_FRAME, y: 70 }; // the top band pushed it down a row; its page and the section inside moved with it
    const page = side.inner as ZoneBoard;
    page.contains = (x, y) => inRect({ ...PAGE_FRAME, y: PAGE_FRAME.y + 70 }, x, y);
    const sec = page.children()[0];
    sec.frame = { ...SEC_FRAME, y: SEC_FRAME.y + 70 };
    (sec.inner as ZoneBoard).contains = (x, y) => inRect(sec.frame, x, y);
    const top = { ...prev, side: 'top' as const, vacated: { x: 900, y: 0, width: 80, height: 60 } };
    // the corner of the ORIGINAL frame: right, a fresh beside — the live frame no longer holds the point at all
    expect(at(1190, 40, { roots, prev: top })).toMatchObject({ kind: 'beside', containerId: 'side', side: 'right', kept: false });
    // the middle of the original frame (past the sticky top band): into the page, tested where the page IS now
    expect(at(1050, 160, { roots, prev: top })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) });
  });
  it('the middle of the original frame is a zone change: into the page, not the band', () => {
    const bottom = { ...prev, side: 'bottom' as const, vacated: { x: 900, y: 480, width: 80, height: 60 } };
    expect(at(1050, 120, { prev: bottom })).toMatchObject({ kind: 'plain', board: expect.objectContaining({ id: 'p1' }) }); // (a point of the page outside the nested section)
  });
});

describe('zones — stripUnder: the strip is a target where the container RESTS', () => {
  const probe = (x: number, y: number, extra: Partial<Parameters<typeof stripUnder>[0]> = {}) =>
    stripUnder({ x, y, roots: tree(), held: null, stay: 0, ...extra });
  it('the strip rows answer with the container; its body does not', () => {
    expect(probe(1050, 10)).toEqual({ containerId: 'side' });
    expect(probe(1050, 29)).toEqual({ containerId: 'side' });
    expect(probe(1050, 200)).toBeNull(); // the page
    expect(probe(400, 10)).toBeNull(); // the board beside it
  });
  it('a container the gesture PUSHED answers at its rest rows — the rows it is painted in are not a target', () => {
    // The user's report: a widget aimed at the header pushed the group down,
    // the strip travelled under the hand, and the answer flickered every frame
    // between a tab and above the group.
    const roots = tree();
    const side = roots[0].children()[0] as ZoneContainer;
    side.frame = { ...SIDE_FRAME, y: 76 }; // pushed a row down by the top band
    const restFrames = new Map([['side', SIDE_FRAME]]);
    expect(probe(1050, 20, { roots, restFrames })).toEqual({ containerId: 'side' }); // where it rests
    expect(probe(1050, 90, { roots, restFrames })).toBeNull(); // where it is drawn
  });
  it('the strip the hand already holds is widened by the stay, and only that one', () => {
    expect(probe(1050, 36)).toBeNull();
    expect(probe(1050, 36, { held: 'side', stay: 9 })).toEqual({ containerId: 'side' });
    expect(probe(1050, 36, { held: 'other', stay: 9 })).toBeNull();
  });
  it('a strip deeper in the tree wins over its ancestor\'s', () => {
    const roots = tree();
    const page = (roots[0].children()[0] as ZoneContainer).inner as ZoneBoard;
    const nested = page.children()[0];
    nested.layout = 'tabs';
    nested.stripHeight = 30;
    expect(probe(1050, 210, { roots })).toEqual({ containerId: 'sec' });
  });
});

describe('zones — resolveTabZone: a torn-out page, the same order on a grid and on a split board', () => {
  const T = { id: 't', frame: { x: 600, y: 0, width: 300, height: 400 }, stripHeight: 30 };
  const base = (over: Partial<TabZoneInput> = {}): TabZoneInput => ({
    x: 750, y: 200, clientInside: true, ownStrip: null, stripOf: () => null, root: null, target: null,
    home: null, homeBand: 0, band: BESIDE_BAND, canSplit: () => true, pane: false, foreign: false, ...over,
  });
  it('off the canvas is off, whatever the world point says', () => {
    expect(resolveTabZone(base({ clientInside: false, target: T }))).toEqual({ kind: 'off' });
  });
  it('a strip is the most precise target: the target\'s wins, the source\'s own is a reorder', () => {
    expect(resolveTabZone(base({ target: T, stripOf: (id) => (id === 't' ? 2 : null), root: { side: 'top' } }))).toEqual({ kind: 'strip', targetId: 't', index: 2 });
    expect(resolveTabZone(base({ ownStrip: 1, home: { x: 0, y: 0, width: 300, height: 400 }, x: 100, y: 10 }))).toEqual({ kind: 'reorder', index: 1 });
  });
  it('the board\'s own edge band beats the group against it', () => {
    expect(resolveTabZone(base({ target: T, root: { side: 'right' }, x: 890, y: 200 }))).toEqual({ kind: 'root', side: 'right' });
  });
  it('a target\'s middle joins it; its outer fifth splits it, the sides taking the corners; a split it cannot take joins', () => {
    expect(resolveTabZone(base({ target: T, x: 750, y: 200 }))).toEqual({ kind: 'join', targetId: 't' });
    expect(resolveTabZone(base({ target: T, x: 620, y: 200 }))).toEqual({ kind: 'split', targetId: 't', side: 'left' });
    expect(resolveTabZone(base({ target: T, x: 750, y: 50 }))).toEqual({ kind: 'split', targetId: 't', side: 'top' });
    expect(resolveTabZone(base({ target: T, x: 890, y: 40 }))).toEqual({ kind: 'split', targetId: 't', side: 'right' }); // the corner
    expect(resolveTabZone(base({ target: T, x: 750, y: 10 }))).toEqual({ kind: 'join', targetId: 't' }); // the strip rows without a strip hit: the body's business
    expect(resolveTabZone(base({ target: T, x: 620, y: 200, canSplit: () => false }))).toEqual({ kind: 'join', targetId: 't' });
    // a fifth, not a third: rx .3 is the middle now
    expect(resolveTabZone(base({ target: T, x: 690, y: 200 }))).toEqual({ kind: 'join', targetId: 't' });
  });
  it('home is the source\'s frame — whole on a grid board, its middle on a split board where its edges mean a pane beside itself', () => {
    const H = { x: 0, y: 0, width: 300, height: 400 };
    expect(resolveTabZone(base({ home: H, x: 20, y: 200 }))).toEqual({ kind: 'home' });
    expect(resolveTabZone(base({ home: H, homeBand: BESIDE_BAND, x: 20, y: 200, pane: true }))).toEqual({ kind: 'pane' });
    expect(resolveTabZone(base({ home: H, homeBand: BESIDE_BAND, x: 150, y: 200, pane: true }))).toEqual({ kind: 'home' });
  });
  it('past all of that: a pane where one exists, a foreign board where one lies under the pointer, else this board', () => {
    expect(resolveTabZone(base({ pane: true }))).toEqual({ kind: 'pane' });
    expect(resolveTabZone(base({ foreign: true }))).toEqual({ kind: 'board', foreign: true });
    expect(resolveTabZone(base())).toEqual({ kind: 'board', foreign: false });
  });
});
