// Wave 7 (Auto-layout) — Card 6: mental-map-preserving incremental layout.
//
// The claim under test: after an edit, the diagram does NOT rearrange itself. That
// is the differentiator — Mermaid re-renders from scratch on every edit and
// destroys the user's spatial memory of their own diagram.
//
// Every assertion here would have failed before Card 5, because the four scaffolded
// strategies (pin-existing, fix-anchors, proximity-aware, minimal-shift) all emitted
// constraints for a system that CLAMPED positions after an unconstrained run: it
// laid new nodes on top of the existing ones, then snapped the existing ones back
// on top of the new ones.

import { DiagramEngine } from '../../engine/DiagramEngine';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { PortModel } from '../../models/PortModel';
import { alignToPrevious, measureMovement, planTween, affectedRegion, type Positions } from './mental-map';

function addNode(engine: DiagramEngine, id: string): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  engine.getDiagram()!.addNode(n);
  return n;
}

function addLink(engine: DiagramEngine, s: string, t: string): void {
  const l = new LinkModel(`${s}-out`, `${t}-in`, 'orthogonal');
  (l as unknown as { id: string }).id = `${s}->${t}`;
  engine.getDiagram()!.addLink(l);
}

const snapshot = (engine: DiagramEngine): Positions =>
  new Map(engine.getDiagram()!.getNodes().map((n) => [n.id, { x: n.position.x, y: n.position.y }]));

describe('Card 6 — mental-map preservation', () => {
  it('adding a node does NOT rearrange the diagram', async () => {
    const engine = new DiagramEngine();
    engine.createDiagram('mm');
    for (const id of ['a', 'b', 'c', 'd']) addNode(engine, id);
    addLink(engine, 'a', 'b');
    addLink(engine, 'b', 'c');
    addLink(engine, 'c', 'd');

    await engine.layout();
    const before = snapshot(engine);

    // the edit: a new node hanging off `a`
    addNode(engine, 'new');
    addLink(engine, 'a', 'new');

    const result = await engine.layoutIncremental({ changed: ['new'], radius: 1 });

    // the new node was placed…
    expect(result.nodePositions.has('new')).toBe(true);

    // …and the graph OUTSIDE the affected region did not budge at all. This is the
    // contract, and it is the right one to assert: `a` is adjacent to the change, so
    // it is inside the region and MAY move (it now has two children and recentres
    // over them — that is a correct layout, not a disturbance). `c` and `d` are 2 and
    // 3 hops away and must be exactly where the user left them.
    for (const id of ['c', 'd']) {
      const b = before.get(id)!;
      const a = result.nodePositions.get(id)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1);
    }
    expect(result.movement.unmoved).toBeGreaterThanOrEqual(2);

    // no overlaps were created — the anchors were real obstacles, not corrections
    const after = snapshot(engine);
    const ids = [...after.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p = after.get(ids[i])!;
        const q = after.get(ids[j])!;
        const overlap = p.x < q.x + 100 && p.x + 100 > q.x && p.y < q.y + 50 && p.y + 50 > q.y;
        expect(overlap).toBe(false);
      }
    }
    engine.destroy();
  });

  it("'pin-existing' really pins: every pre-existing node is exactly where it was", async () => {
    const engine = new DiagramEngine();
    engine.createDiagram('mm');
    for (const id of ['a', 'b', 'c']) addNode(engine, id);
    addLink(engine, 'a', 'b');
    addLink(engine, 'b', 'c');

    await engine.layout();
    const before = snapshot(engine);

    addNode(engine, 'new');
    addLink(engine, 'a', 'new');

    const result = await engine.layoutIncremental({ strategy: 'pin-existing', changed: ['new'] });

    // THE assertion. Under the old system this failed: the layout ran as if the
    // pins did not exist, and the "pinned" nodes were snapped back afterwards on
    // top of whatever had been placed there.
    for (const id of ['a', 'b', 'c']) {
      const b = before.get(id)!;
      const a = result.nodePositions.get(id)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1);
    }
    expect(result.movement.moved).toBe(0);
    engine.destroy();
  });

  it('reports movement against an explicit budget (measured, not asserted)', async () => {
    const engine = new DiagramEngine();
    engine.createDiagram('mm');
    for (const id of ['a', 'b']) addNode(engine, id);
    addLink(engine, 'a', 'b');
    await engine.layout();

    addNode(engine, 'new');
    addLink(engine, 'a', 'new');

    const generous = await engine.layoutIncremental({
      changed: ['new'],
      budget: { maxPerNode: 10000 },
    });
    expect(generous.movement.withinBudget).toBe(true);
    expect(generous.movement).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        average: expect.any(Number),
        max: expect.any(Number),
        moved: expect.any(Number),
        unmoved: expect.any(Number),
      })
    );

    const impossible = await engine.layoutIncremental({
      changed: ['new'],
      budget: { maxPerNode: -1 }, // nothing can satisfy this
    });
    expect(impossible.movement.withinBudget).toBe(false);
    engine.destroy();
  });
});

describe('Card 6 — the pieces', () => {
  describe('alignToPrevious — the cheapest large win', () => {
    it('cancels a pure translation entirely (the layout is unchanged, so nothing should "move")', () => {
      // A layered layout is only defined up to translation: one new node widening
      // rank 0 shifts the whole drawing. Every node then "moves" although the
      // PICTURE is identical, the movement budget blows, and a naive implementation
      // starts fighting its own layout with constraints.
      const before: Positions = new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 100, y: 0 }],
      ]);
      const shifted: Positions = new Map([
        ['a', { x: 300, y: 40 }],
        ['b', { x: 400, y: 40 }],
      ]);

      const naive = measureMovement(before, shifted, undefined);
      expect(naive.total).toBeGreaterThan(500); // every node "moved"

      const { positions } = alignToPrevious(shifted, before);
      const aligned = measureMovement(before, positions, undefined);
      expect(aligned.total).toBeLessThan(0.001); // …and actually nothing did
    });

    it('is a no-op when there are no shared nodes', () => {
      const next: Positions = new Map([['x', { x: 5, y: 5 }]]);
      const { positions, shift } = alignToPrevious(next, new Map());
      expect(shift).toEqual({ x: 0, y: 0 });
      expect(positions.get('x')).toEqual({ x: 5, y: 5 });
    });
  });

  describe('affectedRegion', () => {
    it('grows the changed set by k hops and stops', () => {
      const engine = new DiagramEngine();
      engine.createDiagram('r');
      for (const id of ['a', 'b', 'c', 'd']) addNode(engine, id);
      addLink(engine, 'a', 'b');
      addLink(engine, 'b', 'c');
      addLink(engine, 'c', 'd');

      expect([...affectedRegion(engine.getDiagram()!, ['a'], 0)].sort()).toEqual(['a']);
      expect([...affectedRegion(engine.getDiagram()!, ['a'], 1)].sort()).toEqual(['a', 'b']);
      expect([...affectedRegion(engine.getDiagram()!, ['a'], 2)].sort()).toEqual(['a', 'b', 'c']);
      engine.destroy();
    });
  });

  describe('planTween', () => {
    it('interpolates existing nodes and does NOT fly new ones in from nowhere', () => {
      const before: Positions = new Map([['a', { x: 0, y: 0 }]]);
      const after: Positions = new Map([
        ['a', { x: 100, y: 0 }],
        ['new', { x: 500, y: 500 }],
      ]);
      const plan = planTween(before, after);

      expect(plan.movingIds).toEqual(['a']);

      // at t=0 the existing node has not moved…
      expect(plan.at(0).get('a')).toEqual({ x: 0, y: 0 });
      // …and the NEW node is already where it belongs. Interpolating it from (0,0)
      // would fly it across the diagram, which is exactly the disorientation this
      // card exists to prevent.
      expect(plan.at(0).get('new')).toEqual({ x: 500, y: 500 });

      expect(plan.at(1).get('a')).toEqual({ x: 100, y: 0 });
      // eased: halfway through TIME is halfway through DISTANCE for this curve
      expect(plan.at(0.5).get('a')!.x).toBeCloseTo(50, 5);
    });

    it('clamps t outside [0,1] rather than extrapolating past the target', () => {
      const before: Positions = new Map([['a', { x: 0, y: 0 }]]);
      const after: Positions = new Map([['a', { x: 100, y: 0 }]]);
      const plan = planTween(before, after);
      expect(plan.at(-1).get('a')).toEqual({ x: 0, y: 0 });
      expect(plan.at(2).get('a')).toEqual({ x: 100, y: 0 });
    });
  });
});
