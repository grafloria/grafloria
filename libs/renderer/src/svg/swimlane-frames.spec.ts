/**
 * A pool's border is drawn ONCE, by the pool, and its lanes must not paint over
 * it. Each lane's label band and wash were drawn edge to edge AFTER the pool, so
 * they covered the inner half of the pool's 1.5px stroke: the swimlanes demo
 * showed a notch at the right end of every lane's title strip (and a thinner top
 * border over the first lane).
 */
import { DiagramEngine, SwimlaneService } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import type { VNode } from '../types/vnode.types';

function all(v: VNode, pred: (x: VNode) => boolean, out: VNode[] = []): VNode[] {
  if (pred(v)) out.push(v);
  for (const c of v.children ?? []) if (c && typeof c === 'object' && 'type' in (c as VNode)) all(c as VNode, pred, out);
  return out;
}

it('no lane band or wash reaches into the pool border', () => {
  const engine = new DiagramEngine();
  const model = engine.createDiagram();
  const { pool, lanes } = new SwimlaneService(model).createPool({
    name: 'Delivery', orientation: 'horizontal',
    bounds: { x: 60, y: 60, width: 1000, height: 480 },
    lanes: [{ name: 'Backlog' }, { name: 'In progress', weight: 2 }, { name: 'Done' }],
    headerSize: 40,
  });
  const tree = new SVGRenderer(engine).render({ x: 0, y: 0, width: 1400, height: 900 }, 1);
  const p = pool.getOuterBounds();
  const half = 0.75; // half the pool's 1.5px stroke
  for (const lane of lanes) {
    const g = all(tree, (v) => v.props?.['data-group-id'] === lane.id)[0]!;
    for (const r of all(g, (v) => v.type === 'rect' && /group-frame-(band|rect)/.test(String(v.props?.className)))) {
      const x = Number(r.props!['x']), y = Number(r.props!['y']), w = Number(r.props!['width']), h = Number(r.props!['height']);
      expect(x + w).toBeLessThanOrEqual(p.x + p.width - half);
      expect(y).toBeGreaterThanOrEqual(p.y + half - 1e-6);
      expect(x).toBeGreaterThanOrEqual(p.x + half - 1e-6);
      expect(y + h).toBeLessThanOrEqual(p.y + p.height - half);
    }
  }
});

it("a folded lane of a VERTICAL pool reads down its band: its title turns to fit the column", async () => {
  // The title used to start at the 44px column's top-left and run across the
  // next lanes ("Finance" printed over Sales).
  const { GroupCollapseService } = await import('@grafloria/engine');
  const engine = new DiagramEngine();
  const model = engine.createDiagram();
  const { lanes } = new SwimlaneService(model).createPool({
    name: 'Orders', orientation: 'vertical',
    bounds: { x: 0, y: 0, width: 480, height: 700 },
    lanes: [{ name: 'Customer' }, { name: 'Finance' }, { name: 'Sales' }],
    headerSize: 40,
  });
  new GroupCollapseService(model).collapse(lanes[1]!);
  const tree = new SVGRenderer(engine).render({ x: 0, y: 0, width: 1400, height: 900 }, 1);
  const g = all(tree, (v) => v.props?.['data-group-id'] === lanes[1]!.id)[0]!;
  const label = all(g, (v) => v.type === 'text')[0]!;
  const b = lanes[1]!.getOuterBounds();
  expect(String(label.props!['transform'])).toMatch(/^rotate\(-90/);
  expect(Number(label.props!['x'])).toBeCloseTo(b.x + b.width / 2);
  expect(Number(label.props!['y'])).toBeCloseTo(b.y + b.height / 2);
  // …while a folded lane of a HORIZONTAL pool keeps its title flat at the band's start
  const h = new DiagramEngine();
  const hm = h.createDiagram();
  const made = new SwimlaneService(hm).createPool({
    name: 'Orders', orientation: 'horizontal', bounds: { x: 0, y: 0, width: 700, height: 480 },
    lanes: [{ name: 'Customer' }, { name: 'Finance' }], headerSize: 40,
  });
  new GroupCollapseService(hm).collapse(made.lanes[1]!);
  const ht = new SVGRenderer(h).render({ x: 0, y: 0, width: 1400, height: 900 }, 1);
  const hl = all(all(ht, (v) => v.props?.['data-group-id'] === made.lanes[1]!.id)[0]!, (v) => v.type === 'text')[0]!;
  expect(hl.props!['transform']).toBeUndefined();
});

it("a SPLIT lane carries its title in a strip at its start, turned, with a divider against its sub-lanes", () => {
  const engine = new DiagramEngine();
  const model = engine.createDiagram();
  const svc = new SwimlaneService(model);
  const { pool, lanes } = svc.createPool({
    name: 'Orders', orientation: 'horizontal', bounds: { x: 0, y: 0, width: 1000, height: 480 },
    lanes: [{ name: 'Sales' }, { name: 'Warehouse' }, { name: 'Finance' }], headerSize: 40,
  });
  svc.splitLane(pool, lanes[1]!.id, [{ name: 'Picking' }, { name: 'Dispatch' }]);
  const tree = new SVGRenderer(engine).render({ x: 0, y: 0, width: 1400, height: 900 }, 1);
  const g = all(tree, (v) => v.props?.['data-group-id'] === lanes[1]!.id)[0]!;
  const label = all(g, (v) => v.type === 'text')[0]!;
  const b = lanes[1]!.getOuterBounds();
  expect(String(label.props!['transform'])).toMatch(/^rotate\(-90/);
  expect(Number(label.props!['x'])).toBeCloseTo(b.x + 15);
  const divider = all(g, (v) => /group-frame-header-divider/.test(String(v.props?.className)))[0]!;
  expect(Number(divider.props!['x1'])).toBeCloseTo(b.x + 30);
});

it("a pool's PHASES: a header band with a named cell each, and the line after each phase across every lane", () => {
  const engine = new DiagramEngine();
  const model = engine.createDiagram();
  const svc = new SwimlaneService(model);
  const { pool, lanes } = svc.createPool({
    name: 'Orders', orientation: 'horizontal', bounds: { x: 0, y: 0, width: 1000, height: 400 },
    lanes: [{ name: 'Sales' }, { name: 'Warehouse' }], headerSize: 40,
    phases: [{ name: 'Order', size: 300 }, { name: 'Fulfil', size: 360 }, { name: 'Bill' }],
  });
  // the lanes start under the 28px phase header
  expect(lanes[0]!.getOuterBounds().y).toBe(28);
  const tree = new SVGRenderer(engine).render({ x: 0, y: 0, width: 1400, height: 900 }, 1);
  const poolFrame = all(tree, (v) => v.props?.['data-group-id'] === pool.id)[0]!;
  const labels = all(poolFrame, (v) => /group-phase-label/.test(String(v.props?.className))).map((v) => v.props!['textContent']);
  expect(labels).toEqual(['Order', 'Fulfil', 'Bill']);
  for (const lane of lanes) {
    const g = all(tree, (v) => v.props?.['data-group-id'] === lane.id)[0]!;
    const xs = all(g, (v) => /group-phase-line/.test(String(v.props?.className))).map((v) => Number(v.props!['x1']));
    expect(xs).toEqual([340, 700]);
  }
});
