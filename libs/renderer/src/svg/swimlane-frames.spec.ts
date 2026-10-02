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
