// Shape registry / geometry contract tests (Nodes & shapes foundation)
//
// Two jobs:
//   1. CHARACTERIZE the 5 built-in shapes' outline / boundary / port geometry
//      with concrete expected values, so the "unify the switches" refactor is
//      pinned to the exact same rendered output as before.
//   2. Prove the PAYOFF: a brand-new custom shape registered via registerShape
//      renders and positions ports through the real engine + renderer + the
//      port-positioning utility WITHOUT touching any switch statement.

import {
  getShape,
  hasShape,
  registerShape,
  buildShapeBody,
  buildShapeSelection,
  buildShapeShadow,
  type ShapeDefinition,
} from './shape-registry';
import { getPortPositionForShape } from './port-positioning';
import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, NodeModel, PortModel } from '@grafloria/engine';

describe('Shape registry — geometry contract (Nodes & shapes)', () => {
  describe('Registry API', () => {
    it('resolves the five built-ins', () => {
      for (const type of ['rect', 'circle', 'ellipse', 'diamond', 'hexagon']) {
        expect(hasShape(type)).toBe(true);
        expect(getShape(type).type).toBe(type);
      }
    });

    it('falls back to rect for unknown / undefined types', () => {
      expect(getShape('no-such-shape').type).toBe('rect');
      expect(getShape(undefined).type).toBe('rect');
      expect(hasShape('no-such-shape')).toBe(false);
    });
  });

  // ── Built-in outline geometry: body (identity), selection (grow=3),
  //    shadow (offset=3) — the exact numbers the old render helpers produced.
  describe('Built-in outline geometry (characterization)', () => {
    it('rect body / selection / shadow', () => {
      // body: no corner radius requested → no rx/ry (matches original truthy check)
      expect(getShape('rect').outline(100, 60, { radiusY: true }).geom).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 60,
      });
      // body with explicit corner radius → rx + ry
      expect(getShape('rect').outline(100, 60, { radius: 12, radiusY: true }).geom).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 60,
        rx: 12,
        ry: 12,
      });
      // selection: grown by 3, fixed rx/ry 6
      expect(
        getShape('rect').outline(100, 60, { grow: 3, radius: 6, radiusY: true }).geom
      ).toEqual({ x: -3, y: -3, width: 106, height: 66, rx: 6, ry: 6 });
      // shadow: offset by 3, rx only (radiusAlways, no ry)
      expect(
        getShape('rect').outline(100, 60, { dx: 3, dy: 3, radius: 4, radiusAlways: true }).geom
      ).toEqual({ x: 3, y: 3, width: 100, height: 60, rx: 4 });
    });

    it('circle body / selection / shadow', () => {
      expect(getShape('circle').outline(100, 100).geom).toEqual({ cx: 50, cy: 50, r: 50 });
      expect(getShape('circle').outline(120, 80).geom).toEqual({ cx: 60, cy: 40, r: 40 });
      expect(getShape('circle').outline(100, 100, { grow: 3 }).geom).toEqual({
        cx: 50,
        cy: 50,
        r: 53,
      });
      expect(getShape('circle').outline(100, 100, { dx: 3, dy: 3 }).geom).toEqual({
        cx: 53,
        cy: 53,
        r: 50,
      });
    });

    it('ellipse body / selection / shadow', () => {
      expect(getShape('ellipse').outline(150, 80).geom).toEqual({
        cx: 75,
        cy: 40,
        rx: 75,
        ry: 40,
      });
      expect(getShape('ellipse').outline(150, 80, { grow: 3 }).geom).toEqual({
        cx: 75,
        cy: 40,
        rx: 78,
        ry: 43,
      });
      expect(getShape('ellipse').outline(150, 80, { dx: 3, dy: 3 }).geom).toEqual({
        cx: 78,
        cy: 43,
        rx: 75,
        ry: 40,
      });
    });

    it('diamond body / selection / shadow points', () => {
      expect(getShape('diamond').outline(120, 120).geom['points']).toBe('60,0 120,60 60,120 0,60');
      expect(getShape('diamond').outline(120, 120, { grow: 3 }).geom['points']).toBe(
        '60,-3 123,60 60,123 -3,60'
      );
      expect(getShape('diamond').outline(120, 120, { dx: 3, dy: 3 }).geom['points']).toBe(
        '63,3 123,63 63,123 3,63'
      );
    });

    it('hexagon body / selection / shadow points', () => {
      expect(getShape('hexagon').outline(120, 100).geom['points']).toBe(
        '30,0 90,0 120,50 90,100 30,100 0,50'
      );
      expect(getShape('hexagon').outline(120, 100, { grow: 3 }).geom['points']).toBe(
        '27,-3 93,-3 123,50 93,103 27,103 -3,50'
      );
      expect(getShape('hexagon').outline(120, 100, { dx: 3, dy: 3 }).geom['points']).toBe(
        '33,3 93,3 123,53 93,103 33,103 3,53'
      );
    });
  });

  // ── boundaryPoint (smart-connection outline point). rect returns null
  //    (bbox-edge fallback); ellipse/circle project; polygon shapes intersect.
  describe('Built-in boundaryPoint (characterization)', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };

    it('rect returns null so the caller uses the bbox edge', () => {
      expect(getShape('rect').boundaryPoint(rect, 'right', 40)).toBeNull();
    });

    it('circle projects analytically onto the circumference', () => {
      expect(getShape('circle').boundaryPoint(rect, 'right', 50)).toEqual({ x: 100, y: 50 });
      expect(getShape('circle').boundaryPoint(rect, 'top', 50)).toEqual({ x: 50, y: 0 });
      const p = getShape('circle').boundaryPoint({ x: 0, y: 0, w: 100, h: 100 }, 'right', 30)!;
      expect(p.y).toBe(30);
      expect(p.x).toBeCloseTo(50 + 50 * Math.sqrt(0.84), 6); // ≈ 95.826
    });

    it('ellipse projects with independent radii', () => {
      const p = getShape('ellipse').boundaryPoint({ x: 0, y: 0, w: 150, h: 80 }, 'right', 40)!;
      expect(p).toEqual({ x: 150, y: 40 });
    });

    it('diamond intersects the outline polygon', () => {
      const d = { x: 0, y: 0, w: 120, h: 120 };
      expect(getShape('diamond').boundaryPoint(d, 'right', 60)).toEqual({ x: 120, y: 60 });
      // upper-right edge at cross=30 → x=90
      expect(getShape('diamond').boundaryPoint(d, 'right', 30)).toEqual({ x: 90, y: 30 });
    });

    it('hexagon intersects the outline polygon', () => {
      const h = { x: 0, y: 0, w: 120, h: 100 };
      expect(getShape('hexagon').boundaryPoint(h, 'right', 50)).toEqual({ x: 120, y: 50 });
    });
  });

  // ── portAnchor: the local-space positions the port-positioning switch used.
  describe('Built-in portAnchor (characterization)', () => {
    it('rect spreads along the edge (single port = midpoint)', () => {
      expect(getShape('rect').portAnchor(100, 60, 'left', 0, 1)).toEqual({ x: 0, y: 30 });
      expect(getShape('rect').portAnchor(100, 60, 'top', 0, 1)).toEqual({ x: 50, y: 0 });
    });

    it('circle sits on the circumference', () => {
      const p = getShape('circle').portAnchor(100, 100, 'right', 0, 1);
      expect(p.x).toBeCloseTo(100, 6);
      expect(p.y).toBeCloseTo(50, 6);
    });

    it('diamond anchors at vertices', () => {
      expect(getShape('diamond').portAnchor(120, 120, 'top', 0, 1)).toEqual({ x: 60, y: 0 });
      expect(getShape('diamond').portAnchor(120, 120, 'right', 0, 1)).toEqual({ x: 120, y: 60 });
    });

    it('hexagon spreads along the flat top/bottom edges', () => {
      expect(getShape('hexagon').portAnchor(120, 100, 'top', 0, 1)).toEqual({ x: 60, y: 0 });
      expect(getShape('hexagon').portAnchor(120, 100, 'right', 0, 1)).toEqual({ x: 120, y: 50 });
    });
  });

  // ── The payoff: a shape registered at runtime, exercised through the real
  //    renderer + port-positioning util, WITHOUT editing any switch.
  describe('registerShape — custom shape needs no switch edits', () => {
    // Upward triangle: apex top-center, base along the bottom.
    const Triangle: Omit<ShapeDefinition, 'type'> = {
      styleMode: 'inline',
      outline(width, height, t = {}) {
        const grow = t.grow ?? 0;
        const dx = t.dx ?? 0;
        const dy = t.dy ?? 0;
        const verts = [
          { x: width / 2 + dx, y: -grow + dy },
          { x: width + grow + dx, y: height + grow + dy },
          { x: -grow + dx, y: height + grow + dy },
        ];
        return {
          el: 'polygon',
          geom: { points: verts.map((v) => `${v.x},${v.y}`).join(' ') },
          verts,
        };
      },
      boundaryPoint(rect) {
        // Distinctive marker: the apex in world coords.
        return { x: rect.x + rect.w / 2, y: rect.y };
      },
      portAnchor(width, height, side) {
        switch (side) {
          case 'top':
            return { x: width / 2, y: 0 };
          case 'left':
            return { x: 0, y: height };
          case 'right':
            return { x: width, y: height };
          default:
            return { x: width / 2, y: height };
        }
      },
    };

    beforeAll(() => registerShape('test-triangle', Triangle));

    it('is resolvable and carries its registered type', () => {
      expect(hasShape('test-triangle')).toBe(true);
      expect(getShape('test-triangle').type).toBe('test-triangle');
    });

    it('renders a body VNode through buildShapeBody', () => {
      const vnode = buildShapeBody(getShape('test-triangle'), 100, 80, undefined, {
        fill: '#abcdef',
        stroke: '#111',
        strokeWidth: 2,
      });
      expect(vnode.type).toBe('polygon');
      expect(vnode.props['points']).toBe('50,0 100,80 0,80');
      // inline style mode hoists fill/stroke/strokeWidth like the built-ins
      expect(vnode.props.style).toContain('fill: #abcdef');
      expect(vnode.props.style).toContain('stroke: #111');
    });

    it('drives selection + shadow via the same outline', () => {
      const sel = buildShapeSelection(getShape('test-triangle'), 100, 80, 3, { fill: 'none' });
      expect(sel.props['points']).toBe('50,-3 103,83 -3,83');
      const shad = buildShapeShadow(getShape('test-triangle'), 100, 80, 3, 4, { fill: '#000' });
      expect(shad.props['points']).toBe('53,3 103,83 3,83');
    });

    it('renders inside the real SVGRenderer with only shape metadata', () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('Test')!;
      const renderer = new SVGRenderer(engine);
      try {
        const node = new NodeModel({
          type: 'custom-node',
          position: { x: 100, y: 100 },
          size: { width: 100, height: 80 },
        });
        node.setMetadata('shape', { type: 'test-triangle', fill: '#00ff00' });
        diagram.addNode(node);

        const vnode = renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0);
        const polygon = findChildByType(findByKey(vnode, `node-${node.id}`), 'polygon');
        expect(polygon).toBeDefined();
        expect(polygon.props.points).toBe('50,0 100,80 0,80');
      } finally {
        renderer.dispose();
      }
    });

    it('positions ports via getPortPositionForShape (custom anchors)', () => {
      const node = new NodeModel({
        type: 'custom-node',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 80 },
      });
      node.getPorts().forEach((p) => node.removePort(p.id));
      node.setMetadata('shape', { type: 'test-triangle' });

      const topPort = new PortModel({ id: 'top', type: 'input', side: 'top' });
      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });
      node.addPort(topPort);
      node.addPort(leftPort);

      expect(getPortPositionForShape(topPort, node)).toEqual({ x: 50, y: 0 });
      expect(getPortPositionForShape(leftPort, node)).toEqual({ x: 0, y: 80 });
    });
  });
});

// Skip the drop-shadow twin so we assert on the SHAPE body geometry.
function findChildByType(vnode: any, type: string): any {
  if (!vnode || !vnode.children) return undefined;
  for (const child of vnode.children) {
    const isShadow =
      typeof child?.props?.className === 'string' && child.props.className.includes('node-shadow');
    if (child.type === type && !isShadow) return child;
    const found = findChildByType(child, type);
    if (found) return found;
  }
  return undefined;
}

function findByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findByKey(child, key);
      if (found) return found;
    }
  }
  return undefined;
}
