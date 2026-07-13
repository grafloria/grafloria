// Card 2 — arbitrary SVG-path custom geometry.
//
// Proves that a userland `registerPathShape(...)` gives a brand-new silhouette
// the SAME first-class treatment as the built-ins: it renders a real <path>
// body, and its smart-connection boundary + port anchors are derived from the
// path's true outline (not the bounding box) — with an override seam for exact
// analytic anchors.

import {
  registerPathShape,
  getShape,
  hasShape,
  buildShapeBody,
  buildShapeSelection,
  type ShapeSide,
} from './shape-registry';
import {
  sampleOutlineFromData,
  fitCmdsToBox,
  serializePathCmds,
  translateCmds,
} from './path-outline';
import { parsePath } from '../canvas/path-geometry';
import { getPortPositionForShape } from './port-positioning';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

// A diamond authored as a path, so we can compare its sampled geometry against
// the analytic diamond the registry already ships.
const diamondPath = (w: number, h: number) =>
  `M ${w / 2},0 L ${w},${h / 2} L ${w / 2},${h} L 0,${h / 2} Z`;

describe('Card 2 — registerPathShape (parametric generator)', () => {
  beforeAll(() => {
    registerPathShape('test-path-diamond', diamondPath);
  });

  it('registers and renders a <path> body scaled to the node size', () => {
    expect(hasShape('test-path-diamond')).toBe(true);
    const def = getShape('test-path-diamond');
    const spec = def.outline(100, 60);
    expect(spec.el).toBe('path');
    // A diamond's four vertices for a 100×60 box.
    expect(spec.geom['d']).toContain('M 50,0');
    expect(spec.geom['d']).toContain('L 100,30');
    expect(spec.geom['d']).toContain('L 50,60');
    expect(spec.geom['d']).toContain('L 0,30');
  });

  it('grows for the selection outline and offsets for the shadow', () => {
    const def = getShape('test-path-diamond');
    // grow = 6 → box becomes 112×72 anchored at (-6,-6): top vertex at
    // (112/2, 0) then translated by (-6,-6) → (50,-6); right vertex → (106,30).
    const sel = buildShapeSelection(def, 100, 60, 6, {});
    expect(String(sel.props.d)).toContain('M 50,-6');
    expect(String(sel.props.d)).toContain('L 106,30');
    // Shadow-style translate: body offset by (3,3).
    const shadow = def.outline(100, 60, { dx: 3, dy: 3 });
    expect(String(shadow.geom['d'])).toContain('M 53,3');
  });

  it('derives geometry-true port anchors from the sampled outline', () => {
    const def = getShape('test-path-diamond');
    // Single port per side → the mid-edge sample lands on the diamond vertex.
    const top = def.portAnchor(100, 60, 'top', 0, 1);
    const right = def.portAnchor(100, 60, 'right', 0, 1);
    expect(top.x).toBeCloseTo(50, 0);
    expect(top.y).toBeCloseTo(0, 0);
    expect(right.x).toBeCloseTo(100, 0);
    expect(right.y).toBeCloseTo(30, 0);
  });

  it('projects the smart-connection boundary onto the real edge, not the bbox', () => {
    const def = getShape('test-path-diamond');
    const rect = { x: 0, y: 0, w: 100, h: 60 };
    // Attaching on the right at cross-y = 15 (a quarter down): on a diamond the
    // right edge at y=15 is at x=75 — NOT the bbox edge x=100.
    const pt = def.boundaryPoint(rect, 'right' as ShapeSide, 15);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(75, 0);
    expect(pt!.y).toBeCloseTo(15, 0);
  });

  it('positions ports through the real port-positioning utility + engine', () => {
    const engine = new DiagramEngine();
    engine.createDiagram();
    const node = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size: { width: 100, height: 60 } });
    node.setMetadata('shape', { type: 'test-path-diamond' });
    engine.getDiagram()!.addNode(node);

    const rightPort = node.getPortBySide('right')!;
    const pos = getPortPositionForShape(rightPort, node);
    expect(pos.x).toBeCloseTo(100, 0);
    expect(pos.y).toBeCloseTo(30, 0);
  });
});

describe('Card 2 — registerPathShape (static string + viewBox)', () => {
  it('rescales a static path from its authoring viewBox to the node box', () => {
    registerPathShape('test-static-tri', 'M12,2 L22,22 L2,22 Z', {
      viewBox: { x: 0, y: 0, w: 24, h: 24 },
    });
    const def = getShape('test-static-tri');
    const spec = def.outline(48, 48); // 2× the 24×24 art box
    expect(spec.geom['d']).toContain('M 24,4'); // 12,2 → 24,4
    expect(spec.geom['d']).toContain('L 44,44'); // 22,22 → 44,44
  });

  it('honors an analytic anchor override seam', () => {
    registerPathShape('test-override', diamondPath, {
      portAnchor: (w, h, side) => (side === 'top' ? { x: 7, y: 7 } : { x: 0, y: 0 }),
    });
    const def = getShape('test-override');
    expect(def.portAnchor(100, 60, 'top', 0, 1)).toEqual({ x: 7, y: 7 });
  });
});

describe('Card 2 — path-outline sampler primitives', () => {
  it('samples a closed outline into a vertex ring without the duplicated close', () => {
    const pts = sampleOutlineFromData('M 0,0 L 10,0 L 10,10 L 0,10 Z');
    // 4 corners, closing vertex de-duplicated.
    expect(pts.length).toBe(4);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
  });

  it('fit + translate round-trips through the serializer', () => {
    const cmds = parsePath('M0,0 L1,0 L1,1 Z');
    const fitted = fitCmdsToBox(cmds, { x: 0, y: 0, w: 1, h: 1 }, 40, 20);
    const moved = translateCmds(fitted, 5, 5);
    const d = serializePathCmds(moved);
    expect(d).toBe('M 5,5 L 45,5 L 45,25 Z');
  });

  it('returns [] for empty / unparseable data (caller falls back to bbox)', () => {
    expect(sampleOutlineFromData('')).toEqual([]);
  });
});
