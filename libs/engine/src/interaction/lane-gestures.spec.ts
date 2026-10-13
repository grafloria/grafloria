// Lane gestures — the handles a hand finds on a pool, and what dragging each does.
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { SwimlaneService } from './SwimlaneService';
import { laneHandleAt, laneHandleCursor, LaneGesture, LANE_TITLE_SIZE } from './lane-gestures';

/** 3 lanes in a 1000×480 pool at (60, 60), header 40: Customer 160, Sales 160, Warehouse 160. */
function setup(diagram: DiagramModel, orientation: 'horizontal' | 'vertical' = 'horizontal') {
  const made = new SwimlaneService(diagram).createPool({
    name: 'Orders', orientation,
    bounds: orientation === 'horizontal' ? { x: 60, y: 60, width: 1000, height: 480 } : { x: 60, y: 60, width: 480, height: 1000 },
    lanes: [{ name: 'Customer' }, { name: 'Sales' }, { name: 'Warehouse' }],
    headerSize: 40,
  });
  made.lanes.forEach((lane, i) => {
    const b = lane.getInnerBounds();
    diagram.addNode(new NodeModel({ id: `s${i}`, type: 'rect', position: { x: b.x + 200, y: b.y + 60 }, size: { width: 100, height: 40, depth: 0 } }));
    lane.addMember(`s${i}`, diagram);
  });
  return made;
}
const names = (diagram: DiagramModel, pool: { laneConfig?: { laneOrder?: string[] } }) =>
  (pool.laneConfig!.laneOrder ?? []).map((id) => diagram.getGroup(id)!.name);

describe('laneHandleAt', () => {
  const d = new DiagramModel();
  setup(d);
  it.each([
    ['the line between Customer and Sales', 500, 220, 'border', 'Customer'],
    ['a hair above that line', 500, 217, 'border', 'Customer'],
    ['the pool bottom (after the last lane)', 500, 540, 'border', 'Warehouse'],
    ["Sales's title band", 500, 220 + LANE_TITLE_SIZE - 4, 'title', 'Sales'],
    ['the pool right edge', 1060, 300, 'pool-edge', undefined],
    ['the middle of a lane (the pool drags)', 500, 300, null, undefined],
    ['outside the pool', 1200, 300, null, undefined],
  ])('%s', (_what, x, y, kind, laneName) => {
    const h = laneHandleAt(d, x, y, 5);
    expect(h?.kind ?? null).toBe(kind);
    if (laneName) expect((h as { lane: { name: string } }).lane.name).toBe(laneName);
  });
  it('cursors say which way it moves', () => {
    expect(laneHandleCursor(laneHandleAt(d, 500, 220, 5)!)).toBe('row-resize');
    expect(laneHandleCursor(laneHandleAt(d, 1060, 300, 5)!)).toBe('col-resize');
    expect(laneHandleCursor(laneHandleAt(d, 500, 230, 5)!)).toBe('grab');
  });
});

describe('LaneGesture', () => {
  it('a border drag sizes the lane before it; the pool grows and the others keep their size', () => {
    const d = new DiagramModel();
    const { pool, lanes } = setup(d);
    const g = new LaneGesture(d, laneHandleAt(d, 500, 220, 5)!, 500, 220);
    g.move(500, 260);
    g.move(500, 300);
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([240, 160, 160]);
    expect(pool.getOuterBounds().height).toBe(560);
    expect(g.end()).not.toBeNull();
  });

  it('the pool edge makes every lane longer; never shorter than the minimum', () => {
    const d = new DiagramModel();
    const { lanes } = setup(d);
    const g = new LaneGesture(d, laneHandleAt(d, 1060, 300, 5)!, 1060, 300);
    g.move(1260, 300);
    expect(lanes.map((l) => l.getOuterBounds().width)).toEqual([1160, 1160, 1160]);
    g.move(-2000, 300);
    expect(lanes[0]!.getOuterBounds().width).toBeGreaterThanOrEqual(160);
  });

  it('a title drag carries the lane to another slot, steps and all, without flipping back and forth', () => {
    const d = new DiagramModel();
    const { pool, lanes } = setup(d);
    new SwimlaneService(d).setLaneSize(pool, lanes[2]!.id, 300); // lanes of different sizes
    const s0 = { ...d.getNode('s0')!.position };
    const g = new LaneGesture(d, laneHandleAt(d, 500, 70, 5)!, 500, 70); // Customer's title
    const seen: string[] = [];
    for (let y = 70; y <= 640; y += 10) {
      g.move(500, y);
      const order = names(d, pool).join(',');
      if (seen[seen.length - 1] !== order) seen.push(order);
    }
    expect(seen).toEqual(['Customer,Sales,Warehouse', 'Sales,Customer,Warehouse', 'Sales,Warehouse,Customer']);
    expect(d.getNode('s0')!.position.y).toBeGreaterThan(s0.y + 400);
    expect(g.end()).not.toBeNull();
  });

  it('a vertical pool: a border drag widens the column before it', () => {
    const d = new DiagramModel();
    const { lanes } = setup(d, 'vertical');
    const g = new LaneGesture(d, laneHandleAt(d, 220, 500, 5)!, 220, 500);
    g.move(280, 500);
    expect(lanes.map((l) => l.getOuterBounds().width)).toEqual([220, 160, 160]);
  });

  it('a press that does not move records nothing; cancel puts the pool back', () => {
    const d = new DiagramModel();
    const { pool, lanes } = setup(d);
    expect(new LaneGesture(d, laneHandleAt(d, 500, 220, 5)!, 500, 220).end()).toBeNull();
    const g = new LaneGesture(d, laneHandleAt(d, 500, 220, 5)!, 500, 220);
    g.move(500, 300);
    g.cancel();
    expect(lanes[0]!.getOuterBounds().height).toBe(160);
    expect(pool.getOuterBounds().height).toBe(480);
  });

  it('the end is ONE undo step that takes the whole drag back', async () => {
    const engine = new DiagramEngine();
    const d = engine.createDiagram('d');
    const { lanes } = setup(d);
    const g = new LaneGesture(d, laneHandleAt(d, 500, 220, 5)!, 500, 220);
    for (let y = 230; y <= 320; y += 10) g.move(500, y);
    await engine.commandManager.execute(g.end()!);
    expect(lanes[0]!.getOuterBounds().height).toBe(260);
    await engine.undo();
    expect(lanes[0]!.getOuterBounds().height).toBe(160);
    expect(engine.commandManager.canUndo()).toBe(false);
    engine.destroy();
  });
});
