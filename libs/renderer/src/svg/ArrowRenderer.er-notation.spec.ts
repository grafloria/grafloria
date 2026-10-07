// ER / UML cardinality markers against STANDARD notation, at BOTH ends of a link.
//
// The docs review found the crow's foot drawn as a plain arrowhead: three lines
// meeting ON the entity's edge and spreading away from it. In crow's-foot
// (Information Engineering) notation it is the other way round — the prongs fan
// out AT the entity, the foot touches it, and they meet a little way out along
// the line. The symbol nearest the entity is the maximum cardinality (foot =
// many, bar = one); the symbol beyond it is the minimum (circle = zero, bar = one).
//
// These specs render a real link through the SVGRenderer and measure each marker
// in WORLD coordinates, so they cover the rotation and tip-offset the renderer
// applies at the target end and (reversed) at the source end.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { ArrowStyle } from '@grafloria/engine';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };
const SIZE = 10;

type Pt = { x: number; y: number };
interface Prims {
  lines: Array<[Pt, Pt]>;
  circles: Array<{ c: Pt; r: number }>;
  polys: Pt[][];
}

function parseTransform(t: string): { tx: number; ty: number; deg: number } {
  const tr = /translate\(\s*([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/.exec(t);
  const rot = /rotate\(\s*([-\d.e]+)\s*\)/.exec(t);
  return { tx: tr ? +tr[1] : 0, ty: tr ? +tr[2] : 0, deg: rot ? +rot[1] : 0 };
}

/** Every primitive of a marker VNode, mapped to world coordinates. */
function worldPrims(marker: VNode): Prims {
  const { tx, ty, deg } = parseTransform(String((marker.props as any)?.transform ?? ''));
  const a = (deg * Math.PI) / 180;
  const w = (x: number, y: number): Pt => ({
    x: tx + x * Math.cos(a) - y * Math.sin(a),
    y: ty + x * Math.sin(a) + y * Math.cos(a),
  });
  const out: Prims = { lines: [], circles: [], polys: [] };
  const visit = (n: VNode) => {
    const p: any = n.props ?? {};
    if (n.type === 'line') out.lines.push([w(+p.x1, +p.y1), w(+p.x2, +p.y2)]);
    if (n.type === 'circle') out.circles.push({ c: w(+p.cx, +p.cy), r: +p.r });
    if (n.type === 'polygon' || n.type === 'polyline') {
      out.polys.push(String(p.points).trim().split(/\s+/).map(s => {
        const [x, y] = s.split(',').map(Number);
        return w(x, y);
      }));
    }
    for (const c of (n.children ?? []) as VNode[]) visit(c);
  };
  visit(marker);
  return out;
}

function findAll(v: any, pred: (n: any) => boolean, acc: any[] = []): any[] {
  if (!v || typeof v !== 'object') return acc;
  if (pred(v)) acc.push(v);
  for (const c of v.children ?? []) findAll(c, pred, acc);
  return acc;
}

describe('ArrowRenderer — ER and UML markers follow standard notation at both ends', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let source: NodeModel;
  let target: NodeModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('er-notation')!;
    renderer = new SVGRenderer(engine, {});
    // Source A spans x 100..200, target B spans x 500..600; both y 100..150.
    source = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 50 } });
    source.addPort(new PortModel({ id: 'a', type: 'output', side: 'right' }));
    target = new NodeModel({ type: 'basic', position: { x: 500, y: 100 }, size: { width: 100, height: 50 } });
    target.addPort(new PortModel({ id: 'b', type: 'input', side: 'left' }));
    diagram.addNode(source);
    diagram.addNode(target);
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  /**
   * Render one link with `type` at the chosen end and return that marker's
   * primitives plus a `dist` function: how far a world point lies OUTSIDE the
   * entity at that end (0 = on its edge, negative = inside it).
   */
  function markerAt(end: 'head' | 'tail', type: ArrowStyle['type']) {
    const link = new LinkModel('a', 'b', 'direct');
    const style: ArrowStyle = { type, size: SIZE, filled: false, color: '#000' };
    link.updateStyle(end === 'head'
      ? { arrowHead: style }
      : { arrowHead: { type: 'none', size: 0, filled: false }, arrowTail: style });
    diagram.addLink(link);
    const root = renderer.render(VIEWPORT, 1.0) as VNode;
    const cls = `arrow-${type === 'generalization' ? 'generalization' : type}`;
    const markers = findAll(root, n => typeof n.props?.className === 'string'
      && n.props.className.split(/\s+/).includes(cls));
    expect(markers).toHaveLength(1);
    const prims = worldPrims(markers[0]);
    const entityEdge = end === 'head' ? target.position.x : source.position.x + source.size.width;
    const endpoint = end === 'head' ? link.points[link.points.length - 1] : link.points[0];
    // Distance along the line, measured away from the entity at this end.
    const dist = (p: Pt) => (end === 'head' ? entityEdge - p.x : p.x - entityEdge);
    return { prims, dist, endpointDist: dist(endpoint), lineY: endpoint.y };
  }

  /**
   * The three prongs of a crow's foot, checked against the notation: they fan
   * out where they touch the entity (at the link's endpoint) and meet at ONE
   * point on the line, out from the entity. Returns that meeting point.
   */
  function foot(prims: Prims, dist: (p: Pt) => number, endpointDist: number, lineY: number): Pt {
    // A prong is a slanted or axial line whose ends sit at two different distances.
    const prongs = prims.lines.filter(([p, q]) => Math.abs(dist(p) - dist(q)) > SIZE / 2);
    expect(prongs).toHaveLength(3);
    const near = prongs.map(([p, q]) => (dist(p) < dist(q) ? p : q));
    const far = prongs.map(([p, q]) => (dist(p) < dist(q) ? q : p));

    // The foot touches the entity: every near end sits on the link's endpoint…
    for (const p of near) expect(dist(p)).toBeCloseTo(endpointDist, 5);
    // …and the three prongs are spread across the line there (not one point).
    const spread = Math.max(...near.map(p => p.y)) - Math.min(...near.map(p => p.y));
    expect(spread).toBeGreaterThanOrEqual(SIZE);

    // They meet at ONE point, on the line, out from the entity.
    for (const p of far) {
      expect(p.x).toBeCloseTo(far[0].x, 5);
      expect(p.y).toBeCloseTo(lineY, 5);
    }
    expect(dist(far[0])).toBeGreaterThan(endpointDist + SIZE / 2);
    return far[0];
  }

  const bars = (prims: Prims, dist: (p: Pt) => number) =>
    // A bar crosses the line: both ends at the same distance, spread across it.
    prims.lines.filter(([p, q]) => Math.abs(dist(p) - dist(q)) < 0.01 && Math.abs(p.y - q.y) > 1);

  for (const end of ['head', 'tail'] as const) {
    describe(`at the ${end === 'head' ? 'target' : 'source'} end`, () => {
      it("crow-foot: the prongs fan out AT the entity and meet away from it", () => {
        const { prims, dist, endpointDist, lineY } = markerAt(end, 'crow-foot');
        foot(prims, dist, endpointDist, lineY);
        // A plain crow's foot (many, minimum unstated) has nothing else.
        expect(prims.lines).toHaveLength(3);
        expect(prims.circles).toHaveLength(0);
      });

      it('one-or-many: a foot at the entity and a bar beyond it', () => {
        const { prims, dist, endpointDist, lineY } = markerAt(end, 'one-or-many');
        const meet = foot(prims, dist, endpointDist, lineY);
        const b = bars(prims, dist);
        expect(b).toHaveLength(1);
        // The bar (the minimum, one) lies beyond where the prongs meet.
        expect(dist(b[0][0])).toBeGreaterThan(dist(meet));
      });

      it('zero-or-many: a foot at the entity and a circle beyond it', () => {
        const { prims, dist, endpointDist, lineY } = markerAt(end, 'zero-or-many');
        const meet = foot(prims, dist, endpointDist, lineY);
        expect(prims.circles).toHaveLength(1);
        const c = prims.circles[0];
        // The whole circle (the minimum, zero) lies beyond where the prongs meet.
        expect(dist(c.c) - c.r).toBeGreaterThan(dist(meet));
      });

      it('zero-or-one: a bar near the entity (off its edge) and a circle beyond it', () => {
        const { prims, dist, endpointDist } = markerAt(end, 'zero-or-one');
        const b = bars(prims, dist);
        expect(b).toHaveLength(1);
        expect(prims.circles).toHaveLength(1);
        const c = prims.circles[0];
        // The bar must not sit ON the entity's border, where the border hides it.
        expect(dist(b[0][0])).toBeGreaterThanOrEqual(endpointDist + 2);
        expect(dist(c.c) - c.r).toBeGreaterThan(dist(b[0][0]));
      });

      it('one: a bar across the line, clear of the entity border', () => {
        const { prims, dist, endpointDist } = markerAt(end, 'one');
        const b = bars(prims, dist);
        expect(b).toHaveLength(1);
        expect(dist(b[0][0])).toBeGreaterThanOrEqual(endpointDist + 2);
      });

      it('no ER marker reaches inside its entity', () => {
        for (const type of ['crow-foot', 'one', 'zero-or-one', 'zero-or-many', 'one-or-many'] as const) {
          renderer.dispose();
          diagram.getLinks().forEach(l => diagram.removeLink(l.id));
          renderer = new SVGRenderer(engine, {});
          const { prims, dist } = markerAt(end, type);
          const pts = [...prims.lines.flat(), ...prims.polys.flat()];
          for (const p of pts) expect(dist(p)).toBeGreaterThanOrEqual(-0.5);
          for (const c of prims.circles) expect(dist(c.c) - c.r).toBeGreaterThanOrEqual(-0.5);
        }
      });

      it('UML generalization: the hollow triangle points AT the entity', () => {
        const { prims, dist, endpointDist } = markerAt(end, 'generalization');
        const tri = prims.polys[0];
        const nearest = Math.min(...tri.map(dist));
        // The tip touches the entity; the base is out along the line.
        expect(nearest).toBeCloseTo(endpointDist, 5);
        expect(tri.filter(p => Math.abs(dist(p) - nearest) < 0.01)).toHaveLength(1);
        expect(Math.max(...tri.map(dist))).toBeGreaterThan(endpointDist + SIZE / 2);
      });

      for (const type of ['hollow-diamond', 'filled-diamond'] as const) {
        it(`UML ${type}: one point of the diamond touches the entity`, () => {
          const { prims, dist, endpointDist } = markerAt(end, type);
          const d = prims.polys[0];
          const nearest = Math.min(...d.map(dist));
          expect(nearest).toBeCloseTo(endpointDist, 5);
          expect(d.filter(p => Math.abs(dist(p) - nearest) < 0.01)).toHaveLength(1);
        });
      }
    });
  }

  it('bar and dot markers paint through style, so a var() colour applies', () => {
    // A presentation attribute cannot hold var(); the browser drops it and the
    // marker paints nothing. Every other marker already paints through style.
    const { ArrowRenderer } = require('./ArrowRenderer');
    const r = new ArrowRenderer();
    const color = 'var(--grafloria-link-stroke, #333)';
    const bar = r.renderArrow({ type: 'bar', size: 10, filled: false, color }, '');
    const dot = r.renderArrow({ type: 'dot', size: 6, filled: true, color }, '');
    expect(bar.props.style?.stroke).toBe(color);
    expect(bar.props.stroke).toBeUndefined();
    expect(dot.props.style?.fill).toBe(color);
    expect(dot.props.fill).toBeUndefined();
  });
});
