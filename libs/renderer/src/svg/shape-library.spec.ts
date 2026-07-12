// Extended figure library tests (Wave-2 nodes & shapes).
//
// Card 1: ~20 flowchart / BPMN / UML / ERD shapes that used to silently render
// as plain rectangles now each carry a real ShapeDefinition in the registry.
// These tests prove, for every new figure, that it (a) renders a body VNode
// with real geometry, (b) positions ports, and (c) yields a boundary point —
// plus a few exact-geometry checks and a real end-to-end render.

import {
  getShape,
  hasShape,
  listShapes,
  getInnerRect,
  buildShapeBody,
  buildShapeSelection,
  buildShapeShadow,
  type ShapeSide,
} from './shape-registry';
import { getPortPositionForShape } from './port-positioning';
import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, NodeModel, PortModel } from '@grafloria/engine';

// The extended library's canonical figure names (aliases resolve to these).
const FIGURES = [
  'parallelogram',
  'parallelogram-top',
  'trapezoid',
  'trapezoid-bottom',
  'triangle',
  'triangle-down',
  'package',
  'cube',
  'document',
  'cylinder',
  'cloud',
  'predefined-process',
  'component',
  'note',
  'terminal',
  'actor',
];

const SIDES: ShapeSide[] = ['left', 'right', 'top', 'bottom'];

describe('Extended figure library (Card 1)', () => {
  it('registers the full flowchart/BPMN/UML/ERD figure set (~20+ incl. aliases)', () => {
    for (const name of FIGURES) {
      expect(hasShape(name)).toBe(true);
    }
    // aliases resolve to a canonical figure
    for (const alias of ['database', 'stadium', 'data', 'subroutine', 'folder', 'comment']) {
      expect(hasShape(alias)).toBe(true);
    }
    // 5 built-ins + 16 figures + aliases → comfortably north of 20 registrations
    expect(listShapes().length).toBeGreaterThanOrEqual(20);
  });

  // ── Contract coverage: every figure renders + positions ports + boundary. ──
  describe.each(FIGURES)('%s — geometry contract', (name) => {
    const def = getShape(name);
    const W = 100;
    const H = 80;

    it('renders a body VNode with real geometry (not a bare rect)', () => {
      const spec = def.outline(W, H);
      expect(['polygon', 'path', 'rect']).toContain(spec.el);
      if (spec.el === 'polygon') {
        expect(typeof spec.geom['points']).toBe('string');
        expect((spec.geom['points'] as string).length).toBeGreaterThan(0);
      } else if (spec.el === 'path') {
        expect(typeof spec.geom['d']).toBe('string');
        expect((spec.geom['d'] as string).length).toBeGreaterThan(0);
      } else {
        expect(spec.geom['width']).toBe(W);
      }

      // buildShapeBody hoists fill/stroke into the inline style like the built-ins
      const body = buildShapeBody(def, W, H, undefined, {
        fill: '#abcdef',
        stroke: '#123',
        strokeWidth: 2,
      });
      expect(body.type).toBe(spec.el);
      expect(body.props.style).toContain('fill: #abcdef');
    });

    it('positions ports on every side (single + multi) with finite coords', () => {
      for (const side of SIDES) {
        for (const [rank, count] of [
          [0, 1],
          [1, 3],
        ] as const) {
          const p = def.portAnchor(W, H, side, rank, count);
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
          // Anchors sit on/inside the outline box (allow a hair of float slack).
          expect(p.x).toBeGreaterThanOrEqual(-0.001);
          expect(p.x).toBeLessThanOrEqual(W + 0.001);
          expect(p.y).toBeGreaterThanOrEqual(-0.001);
          expect(p.y).toBeLessThanOrEqual(H + 0.001);
        }
      }
    });

    it('yields a boundary point (a ShapePoint or null bbox-fallback), never throws', () => {
      for (const side of SIDES) {
        const cross = side === 'top' || side === 'bottom' ? W / 2 : H / 2;
        const bp = def.boundaryPoint({ x: 0, y: 0, w: W, h: H }, side, cross);
        if (bp !== null) {
          expect(Number.isFinite(bp.x)).toBe(true);
          expect(Number.isFinite(bp.y)).toBe(true);
        }
      }
    });

    it('exposes an inner label rect inside the bounding box', () => {
      const ir = getInnerRect(def, W, H);
      expect(ir.w).toBeGreaterThan(0);
      expect(ir.h).toBeGreaterThan(0);
      expect(ir.x).toBeGreaterThanOrEqual(-0.001);
      expect(ir.y).toBeGreaterThanOrEqual(-0.001);
      expect(ir.x + ir.w).toBeLessThanOrEqual(W + 0.001);
      expect(ir.y + ir.h).toBeLessThanOrEqual(H + 0.001);
    });

    it('grows for selection and offsets for shadow (transform drives both)', () => {
      const body = def.outline(W, H).geom;
      const sel = buildShapeSelection(def, W, H, 3, { fill: 'none' }).props;
      const shad = buildShapeShadow(def, W, H, 3, 4, { fill: '#000' }).props;
      const key = body['points'] !== undefined ? 'points' : body['d'] !== undefined ? 'd' : 'x';
      // Selection (grow) and shadow (offset) must differ from the body geometry.
      expect(sel[key]).not.toEqual(body[key]);
      expect(shad[key]).not.toEqual(body[key]);
    });
  });

  // ── Exact geometry for the parameterized figures. ──
  describe('exact geometry', () => {
    it('parallelogram / -top lean opposite ways (skew 25%)', () => {
      expect(getShape('parallelogram').outline(100, 60).geom['points']).toBe('25,0 100,0 75,60 0,60');
      expect(getShape('parallelogram-top').outline(100, 60).geom['points']).toBe(
        '0,0 75,0 100,60 25,60'
      );
    });

    it('trapezoid narrows the top; trapezoid-bottom narrows the base', () => {
      expect(getShape('trapezoid').outline(100, 60).geom['points']).toBe('25,0 75,0 100,60 0,60');
      expect(getShape('trapezoid-bottom').outline(100, 60).geom['points']).toBe(
        '0,0 100,0 75,60 25,60'
      );
    });

    it('triangle up = apex-top; triangle-down = apex-bottom', () => {
      expect(getShape('triangle').outline(100, 80).geom['points']).toBe('50,0 100,80 0,80');
      expect(getShape('triangle-down').outline(100, 80).geom['points']).toBe('0,0 100,0 50,80');
    });

    it('package is a 7-vertex folder polygon (tab top-left)', () => {
      expect(getShape('package').outline(100, 60).geom['points']).toBe(
        '0,12 0,0 40,0 40,12 100,12 100,60 0,60'
      );
    });

    it('terminal / stadium is a fully rounded rect (rx = ry = h/2)', () => {
      const g = getShape('terminal').outline(120, 40).geom;
      expect(g).toEqual({ x: 0, y: 0, width: 120, height: 40, rx: 20, ry: 20 });
      // stadium alias resolves to the same definition
      expect(getShape('stadium').outline(120, 40).geom['rx']).toBe(20);
    });

    it('document draws a rect with a Q-curve wavy bottom', () => {
      expect(getShape('document').outline(100, 60).geom['d']).toBe(
        'M 0,0 L 100,0 L 100,52.8 Q 75,45.6 50,52.8 Q 25,60 0,52.8 Z'
      );
    });

    it('cylinder draws elliptical top/bottom rims (arc commands)', () => {
      const d = getShape('cylinder').outline(100, 60).geom['d'] as string;
      expect(d.startsWith('M 0,')).toBe(true);
      expect(d).toContain('a 50,'); // rx = 50 arc rim
      expect((d.match(/a /g) || []).length).toBe(3); // top (2 arcs) + bottom front
    });

    it('cube draws front face + two interior 3D edges (3 subpaths)', () => {
      const d = getShape('cube').outline(100, 80).geom['d'] as string;
      expect((d.match(/M /g) || []).length).toBe(3);
      expect(d).toContain('Z');
    });

    it('note has a folded top-right corner', () => {
      const d = getShape('note').outline(100, 80).geom['d'] as string;
      expect(d).toContain('M 80,0 L 80,20 L 100,20'); // the fold triangle
    });

    it('predefined-process has inset bars on both sides', () => {
      const d = getShape('predefined-process').outline(100, 60).geom['d'] as string;
      expect(d).toContain('M 10,0 L 10,60');
      expect(d).toContain('M 90,0 L 90,60');
    });

    it('actor is a stick figure (head arc + limbs)', () => {
      const d = getShape('actor').outline(100, 80).geom['d'] as string;
      expect(d).toContain('a '); // head circle arcs
      expect(d).toContain('L'); // torso / arms / legs
    });

    it('cloud is a bumpy bezier silhouette', () => {
      expect(getShape('cloud').outline(100, 60).geom['d']).toContain('C ');
    });
  });

  // ── End-to-end through the real renderer + port positioning. ──
  describe('through the real SVGRenderer', () => {
    it('renders a cylinder body as a <path> (no switch edits)', () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('T')!;
      const renderer = new SVGRenderer(engine);
      try {
        const node = new NodeModel({
          type: 'db',
          position: { x: 40, y: 40 },
          size: { width: 100, height: 80 },
        });
        node.setMetadata('shape', { type: 'cylinder', fill: '#eef' });
        diagram.addNode(node);

        const vnode = renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0);
        const path = findBodyByType(findByKey(vnode, `node-${node.id}`), 'path');
        expect(path).toBeDefined();
        expect(typeof path.props.d).toBe('string');
        expect(path.props.style).toContain('fill: #eef');
      } finally {
        renderer.dispose();
      }
    });

    it('renders a triangle body as a <polygon> and positions its ports', () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('T')!;
      const renderer = new SVGRenderer(engine);
      try {
        const node = new NodeModel({
          type: 'tri',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 80 },
        });
        node.getPorts().forEach((p) => node.removePort(p.id));
        node.setMetadata('shape', { type: 'triangle' });
        const top = new PortModel({ id: 't', type: 'output', side: 'top' });
        const left = new PortModel({ id: 'l', type: 'input', side: 'left' });
        node.addPort(top);
        node.addPort(left);
        diagram.addNode(node);

        const vnode = renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0);
        const poly = findBodyByType(findByKey(vnode, `node-${node.id}`), 'polygon');
        expect(poly.props.points).toBe('50,0 100,80 0,80');

        expect(getPortPositionForShape(top, node)).toEqual({ x: 50, y: 0 }); // apex
        expect(getPortPositionForShape(left, node)).toEqual({ x: 25, y: 40 });
      } finally {
        renderer.dispose();
      }
    });
  });
});

// Find a child of `type` skipping the drop-shadow twin (same element type).
function findBodyByType(vnode: any, type: string): any {
  if (!vnode || !vnode.children) return undefined;
  for (const child of vnode.children) {
    const isShadow =
      typeof child?.props?.className === 'string' && child.props.className.includes('node-shadow');
    if (child.type === type && !isShadow) return child;
    const found = findBodyByType(child, type);
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
