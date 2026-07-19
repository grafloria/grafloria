/**
 * @jest-environment jsdom
 */

// B — THE ITEM CONFIGS ARE LIVE.
//
// `FlexItemConfig` / `GridItemConfig` were dead metadata: `SetFlexItemCommand` and
// `SetGridItemCommand` wrote them, and the ONLY readers of `getFlexItem()` /
// `getGridItem()` were those same commands snapshotting their own undo values. No
// layout pass ever looked at them — `applyGridLayout` placed by ARRAY INDEX and
// `applyFlexboxLayout` implemented exactly two of its container options.
//
// These tests pin the item configs (and the container options they need) as the
// thing that actually decides where a child lands.

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { GroupModel } from './GroupModel';

function box(width: number, height: number): NodeModel {
  return new NodeModel({
    type: 'box',
    position: { x: 0, y: 0 },
    size: { width, height, depth: 0 },
  });
}

describe('GroupModel — live item configs (B)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('layout-items');
  });

  function container(width: number, height: number): GroupModel {
    const g = new GroupModel({ name: 'C' });
    g.size = { width, height, depth: 0 };
    diagram.addGroup(g);
    // Opt out of push so each test drives ONE explicit applyLayout and reads a
    // single settled state.
    g.setMetadata('autoLayout', false);
    return g;
  }

  function member(g: GroupModel, n: NodeModel): NodeModel {
    diagram.addNode(n);
    g.addMember(n.id);
    return n;
  }

  // ---------------------------------------------------------------------------
  // GRID — explicit cell placement (GridItemConfig), not array order
  // ---------------------------------------------------------------------------
  describe('grid: GridItemConfig drives placement', () => {
    function grid(g: GroupModel, over: Partial<Record<string, unknown>> = {}): void {
      g.setLayout('grid', {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'repeat(3, 1fr)',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
        padding: 0,
        ...(over as object),
      } as never);
    }

    it('places a node at an EXPLICIT column/row line instead of its array index', () => {
      const g = container(320, 320);
      grid(g);

      // Track width: (320 - 2*10) / 3 = 100. Track height: same.
      const first = member(g, box(50, 50));
      const pinned = member(g, box(50, 50));

      // Array order would put `pinned` in cell (row 0, col 1). Pin it to (2,3).
      pinned.setGridItem({ columnStart: 3, rowStart: 2 });

      g.applyLayout(diagram);

      expect(first.position).toMatchObject({ x: 0, y: 0 });
      // col 3 → x = 2 * (100 + 10) = 220 ; row 2 → y = 1 * (100 + 10) = 110
      expect(pinned.position).toMatchObject({ x: 220, y: 110 });
    });

    it('spans cells via columnEnd/rowEnd and sizes the item to the span', () => {
      const g = container(320, 320);
      grid(g, { justifyItems: 'stretch', alignItems: 'stretch' });

      const wide = member(g, box(10, 10));
      wide.setGridItem({ columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 2 });

      g.applyLayout(diagram);

      // 2 columns wide: 2*100 + 1*10 gap = 210. 1 row tall: 100.
      expect(wide.size.width).toBe(210);
      expect(wide.size.height).toBe(100);
      expect(wide.position).toMatchObject({ x: 0, y: 0 });
    });

    it('auto-placed items skip cells already claimed by explicit placement', () => {
      const g = container(320, 320);
      grid(g);

      const pinned = member(g, box(50, 50));
      pinned.setGridItem({ columnStart: 1, rowStart: 1 });
      const auto = member(g, box(50, 50));

      g.applyLayout(diagram);

      expect(pinned.position).toMatchObject({ x: 0, y: 0 });
      // (1,1) is taken, so `auto` lands in (1,2) → x = 110.
      expect(auto.position).toMatchObject({ x: 110, y: 0 });
    });

    it('keeps metadata columnSpan working as a fallback span', () => {
      const g = container(320, 320);
      grid(g, { justifyItems: 'stretch' });

      const wide = member(g, box(10, 10));
      wide.setMetadata('columnSpan', 2);
      const after = member(g, box(10, 10));

      g.applyLayout(diagram);

      expect(wide.size.width).toBe(210);
      // `after` cannot fit in the 1 remaining column of row 1? It can (span 1).
      expect(after.position).toMatchObject({ x: 220, y: 0 });
    });

    it('flows column-major when autoFlow is "column"', () => {
      const g = container(320, 320);
      grid(g, { autoFlow: 'column' });

      const a = member(g, box(50, 50));
      const b = member(g, box(50, 50));

      g.applyLayout(diagram);

      expect(a.position).toMatchObject({ x: 0, y: 0 });
      expect(b.position).toMatchObject({ x: 0, y: 110 }); // next ROW, same column
    });
  });

  // ---------------------------------------------------------------------------
  // FLEX — item order / alignSelf / flexGrow, and the container options they need
  // ---------------------------------------------------------------------------
  describe('flex: FlexItemConfig drives order, alignment and growth', () => {
    function flex(g: GroupModel, over: Record<string, unknown> = {}): void {
      g.setLayout('flexbox', {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
        ...over,
      } as never);
    }

    it('honours FlexItemConfig.order', () => {
      const g = container(600, 200);
      flex(g);

      const first = member(g, box(100, 50));
      const second = member(g, box(100, 50));
      // Reverse them by order alone.
      first.setFlexItem({ order: 2 });
      second.setFlexItem({ order: 1 });

      g.applyLayout(diagram);

      expect(second.position.x).toBe(0);
      expect(first.position.x).toBe(100);
    });

    it('honours FlexItemConfig.alignSelf over the container alignItems', () => {
      const g = container(600, 200);
      flex(g, { alignItems: 'start' });

      const top = member(g, box(100, 50));
      const bottom = member(g, box(100, 50));
      bottom.setFlexItem({ alignSelf: 'end' });

      g.applyLayout(diagram);

      expect(top.position.y).toBe(0);
      expect(bottom.position.y).toBe(150); // 200 - 50
    });

    it('grows items by FlexItemConfig.flexGrow to consume free main-axis space', () => {
      const g = container(600, 200);
      flex(g);

      const fixed = member(g, box(100, 50));
      const grower = member(g, box(100, 50));
      grower.setFlexItem({ flexGrow: 1 });

      g.applyLayout(diagram);

      // Free space = 600 - 200 = 400, all of it to `grower`.
      expect(fixed.size.width).toBe(100);
      expect(grower.size.width).toBe(500);
      expect(grower.position.x).toBe(100);
    });

    it('splits free space between competing flexGrow factors', () => {
      const g = container(600, 200);
      flex(g);

      const one = member(g, box(100, 50));
      const three = member(g, box(100, 50));
      one.setFlexItem({ flexGrow: 1 });
      three.setFlexItem({ flexGrow: 3 });

      g.applyLayout(diagram);

      expect(one.size.width).toBe(200); // 100 + 400/4
      expect(three.size.width).toBe(400); // 100 + 3*400/4
    });
  });

  describe('flex: container options that were unimplemented', () => {
    function flex(g: GroupModel, over: Record<string, unknown> = {}): void {
      g.setLayout('flexbox', {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
        ...over,
      } as never);
    }

    it('justifyContent: end', () => {
      const g = container(600, 200);
      flex(g, { justifyContent: 'end' });
      const a = member(g, box(100, 50));
      const b = member(g, box(100, 50));

      g.applyLayout(diagram);

      expect(a.position.x).toBe(400);
      expect(b.position.x).toBe(500);
    });

    it('justifyContent: space-between', () => {
      const g = container(600, 200);
      flex(g, { justifyContent: 'space-between' });
      const a = member(g, box(100, 50));
      const b = member(g, box(100, 50));
      const c = member(g, box(100, 50));

      g.applyLayout(diagram);

      // 300px of items, 300px free, 2 gaps of 150.
      expect(a.position.x).toBe(0);
      expect(b.position.x).toBe(250);
      expect(c.position.x).toBe(500);
    });

    it('alignItems: stretch fills the cross axis', () => {
      const g = container(600, 200);
      flex(g, { alignItems: 'stretch' });
      const a = member(g, box(100, 50));

      g.applyLayout(diagram);

      expect(a.size.height).toBe(200);
      expect(a.position.y).toBe(0);
    });

    it('wrap: breaks a line that overflows the container and stacks the next one', () => {
      const g = container(250, 400);
      flex(g, { wrap: 'wrap' });
      const a = member(g, box(100, 60));
      const b = member(g, box(100, 60));
      const c = member(g, box(100, 60));

      g.applyLayout(diagram);

      // 100 + 100 fits in 250; the third breaks to a new line.
      expect(a.position).toMatchObject({ x: 0, y: 0 });
      expect(b.position).toMatchObject({ x: 100, y: 0 });
      expect(c.position).toMatchObject({ x: 0, y: 60 });
    });

    it('nowrap keeps everything on one line even when it overflows', () => {
      const g = container(250, 400);
      flex(g, { wrap: 'nowrap' });
      const a = member(g, box(100, 60));
      const b = member(g, box(100, 60));
      const c = member(g, box(100, 60));

      g.applyLayout(diagram);

      expect(c.position).toMatchObject({ x: 200, y: 0 });
    });
  });
});
