// Wave 6 (Ports & connections) — renderer seam.
//
// The contract under test, over and over: a port that sets NONE of the new
// config must render byte-identically to what Grafloria emitted before wave 6.

import { NodeModel, PortModel, setNodePortGroups } from '@grafloria/engine';
import { glyphHalfExtents, renderPortGlyph } from './port-glyph';
import { nudgePortLabels, portLabelGeometry, renderPortLabel, resolveRotation } from './port-label';
import { getPortPositionForShape } from './port-positioning';
import { compensateForRotation, portLayoutNames, runPortLayout } from './port-layout';
import { applySpread, assignSpreadLanes, resolveSpot, spreadOffsets } from './port-spots';
import type { VNode } from '../types/vnode.types';

function makeNode(id: string, shape = 'rect', width = 100, height = 60): NodeModel {
  const node = new NodeModel({
    type: 'rect',
    position: { x: 0, y: 0 },
    size: { width, height },
  } as any);
  (node as any).id = id;
  node.ports.clear(); // drop NodeModel's four default bi ports
  node.setMetadata('shape', { type: shape });
  return node;
}

// ===========================================================================
// Card 0 — glyphs
// ===========================================================================

describe('port glyphs (Card 0)', () => {
  const props = { fill: '#fff', stroke: '#000' };

  it('an unshaped port is the SAME <circle cx cy r> it always was', () => {
    const glyph = renderPortGlyph({ x: 10, y: 20, radius: 6, props });

    expect(glyph.type).toBe('circle');
    expect(glyph.props).toEqual({ cx: 10, cy: 20, r: 6, fill: '#fff', stroke: '#000' });
    // No rotation attribute is emitted for an unrotated glyph.
    expect(glyph.props).not.toHaveProperty('transform');
  });

  it('square', () => {
    const glyph = renderPortGlyph({ x: 10, y: 20, radius: 6, shape: { shape: 'square', size: 10 }, props });
    expect(glyph.type).toBe('rect');
    expect(glyph.props).toMatchObject({ x: 5, y: 15, width: 10, height: 10 });
  });

  it('diamond is a polygon on its four extreme points', () => {
    const glyph = renderPortGlyph({ x: 10, y: 20, radius: 6, shape: { shape: 'diamond', size: 8 }, props });
    expect(glyph.type).toBe('polygon');
    expect(glyph.props!['points']).toBe('10,16 14,20 10,24 6,20');
  });

  it('triangle points UP by default and `rotation` aims it', () => {
    const up = renderPortGlyph({ x: 0, y: 0, radius: 6, shape: { shape: 'triangle', size: 10 }, props });
    expect(up.type).toBe('polygon');
    expect(up.props!['points']).toBe('0,-5 5,5 -5,5');
    expect(up.props).not.toHaveProperty('transform');

    const right = renderPortGlyph({
      x: 0,
      y: 0,
      radius: 6,
      shape: { shape: 'triangle', size: 10, rotation: 90 },
      props,
    });
    expect(right.props!['transform']).toBe('rotate(90 0 0)');
  });

  it('a custom path glyph is translated onto the anchor', () => {
    const glyph = renderPortGlyph({
      x: 12,
      y: 8,
      radius: 6,
      shape: { shape: 'path', path: 'M -4 -4 L 4 0 L -4 4 Z' },
      props,
    });
    expect(glyph.type).toBe('path');
    expect(glyph.props!['d']).toBe('M -4 -4 L 4 0 L -4 4 Z');
    expect(glyph.props!['transform']).toBe('translate(12 8)');
  });

  it('a path glyph with no `d` degrades to a circle rather than emitting an unhittable empty path', () => {
    const glyph = renderPortGlyph({ x: 0, y: 0, radius: 6, shape: { shape: 'path' }, props });
    expect(glyph.type).toBe('circle');
  });

  it('per-port style overrides win over the theme props (this was DEAD config)', () => {
    // Exactly what SVGRenderer.renderPort does: build the theme's props, then
    // Object.assign the port's resolved style over the top.
    const themed: Record<string, unknown> = { fill: '#fff', stroke: '#000', strokeWidth: 1 };
    Object.assign(themed, { fill: 'hotpink', strokeWidth: 3 });

    const glyph = renderPortGlyph({ x: 0, y: 0, radius: 6, props: themed });
    expect(glyph.props!['fill']).toBe('hotpink');
    expect(glyph.props!['strokeWidth']).toBe(3);
    expect(glyph.props!['stroke']).toBe('#000'); // untouched keys survive
  });

  it('size is a DIAMETER for a circle (so size:12 === the legacy radius 6)', () => {
    const glyph = renderPortGlyph({ x: 0, y: 0, radius: 99, shape: { shape: 'circle', size: 12 }, props });
    expect(glyph.props!['r']).toBe(6);
  });

  it('half-extents fall back to the interaction radius', () => {
    expect(glyphHalfExtents(undefined, 6)).toEqual({ hw: 6, hh: 6 });
    expect(glyphHalfExtents({ shape: 'square', size: 20 }, 6)).toEqual({ hw: 10, hh: 10 });
    expect(glyphHalfExtents({ shape: 'square', width: 20, height: 8 }, 6)).toEqual({ hw: 10, hh: 4 });
  });
});

// ===========================================================================
// Card 1 — labels
// ===========================================================================

describe('port labels (Card 1)', () => {
  const base = { x: 100, y: 30, hw: 6, hh: 6, width: 100, height: 60, fontSize: 11 };

  it('outside pushes the label AWAY from the node, clearing the glyph', () => {
    const g = portLabelGeometry({ ...base, spec: { text: 'A' }, side: 'right' });
    expect(g.x).toBe(100 + 6 + 6); // anchor + glyph half-extent + default offset
    expect(g.y).toBe(30);
    expect(g.align).toBe('start'); // grows rightward, away from the port
  });

  it('inside pulls the label INTO the node and flips the anchor', () => {
    const g = portLabelGeometry({ ...base, spec: { text: 'A', layout: 'inside' }, side: 'right' });
    expect(g.x).toBe(100 - 12);
    expect(g.align).toBe('end');
  });

  it('orthogonal offsets perpendicular to the outward normal', () => {
    const g = portLabelGeometry({ ...base, spec: { text: 'A', layout: 'orthogonal' }, side: 'right' });
    expect(g.x).toBe(100); // no movement along the normal
    expect(g.y).toBe(30 + 12); // moved along the edge instead
  });

  it('radial offsets along the ray from the node CENTRE — the layout circles need', () => {
    // Port at the node's bottom-right on the 45° diagonal.
    const g = portLabelGeometry({
      ...base,
      x: 90,
      y: 55,
      spec: { text: 'A', layout: 'radial' },
      side: 'right',
    });
    // Direction is (90-50, 55-30) normalised — both components positive.
    expect(g.x).toBeGreaterThan(90);
    expect(g.y).toBeGreaterThan(55);
  });

  it('offset is honoured', () => {
    const g = portLabelGeometry({ ...base, spec: { text: 'A', offset: 20 }, side: 'right' });
    expect(g.x).toBe(100 + 6 + 20);
  });

  it('keep-upright flips a label that would read upside-down', () => {
    // 170° would be upside-down → flipped to -10°.
    expect(resolveRotation({ text: 'A', angle: 170 }, { x: 1, y: 0 })).toBe(-10);
    // 45° reads fine → untouched.
    expect(resolveRotation({ text: 'A', angle: 45 }, { x: 1, y: 0 })).toBe(45);
    // Opting out keeps the upside-down angle.
    expect(resolveRotation({ text: 'A', angle: 170, keepUpright: false }, { x: 1, y: 0 })).toBe(170);
  });

  it('an unrotated label is a bare <text>; a rotated one is wrapped in a transformed <g>', () => {
    const plain = renderPortLabel({ ...base, spec: { text: 'A' }, side: 'right' });
    expect(plain.type).toBe('text');

    const rotated = renderPortLabel({ ...base, spec: { text: 'A', angle: 30 }, side: 'right' });
    expect(rotated.type).toBe('g');
    expect(rotated.props!['transform']).toContain('rotate(30');
  });

  it('a label never eats the port\'s pointer events', () => {
    const label = renderPortLabel({ ...base, spec: { text: 'A' }, side: 'right' });
    expect(label.props!['pointerEvents']).toBe('none');
  });

  it('uses the SHARED text-block engine — a long label wraps into tspans', () => {
    const label = renderPortLabel({
      ...base,
      spec: { text: 'a very long port label indeed', maxWidth: 40 },
      side: 'right',
    }) as VNode;
    expect(label.children!.length).toBeGreaterThan(1);
    expect(label.children![0]!.type).toBe('tspan');
  });

  describe('collision-aware nudging', () => {
    it('leaves a lone label alone', () => {
      expect(nudgePortLabels([10], [12])).toEqual([0]);
    });

    it('leaves well-separated labels alone', () => {
      expect(nudgePortLabels([0, 40, 80], [12, 12, 12])).toEqual([0, 0, 0]);
    });

    it('pushes crowded labels apart', () => {
      const nudges = nudgePortLabels([20, 22, 24], [12, 12, 12]);
      const resolved = [20 + nudges[0]!, 22 + nudges[1]!, 24 + nudges[2]!];

      // Every adjacent pair now clears its neighbour.
      expect(resolved[1]! - resolved[0]!).toBeGreaterThanOrEqual(12);
      expect(resolved[2]! - resolved[1]!).toBeGreaterThanOrEqual(12);
    });

    it('keeps the stack centred on its original centroid — it must not drift off the node', () => {
      const centres = [20, 22, 24];
      const nudges = nudgePortLabels(centres, [12, 12, 12]);
      const before = centres.reduce((a, b) => a + b, 0) / 3;
      const after = centres.map((c, i) => c + nudges[i]!).reduce((a, b) => a + b, 0) / 3;
      expect(after).toBeCloseTo(before, 6);
    });
  });
});

// ===========================================================================
// Card 4 — the pluggable layout engine
// ===========================================================================

describe('port layout engine (Card 4)', () => {
  it('ships the named strategies the card asks for', () => {
    expect(portLayoutNames()).toEqual(
      expect.arrayContaining(['shape', 'absolute', 'line', 'sideLinear', 'ellipse', 'ellipseSpread'])
    );
  });

  const box = { width: 100, height: 60, side: 'right' as const, rank: 0, count: 1, shapeType: 'rect' };

  it('the DEFAULT strategy is `shape` — the registry anchor, unchanged', () => {
    const viaDefault = runPortLayout(undefined, box);
    const viaShape = runPortLayout({ strategy: 'shape' }, box);
    expect(viaDefault).toEqual(viaShape);
    expect(viaDefault).toEqual({ x: 100, y: 30 }); // right edge, midpoint
  });

  it('an unknown strategy name falls back to `shape` rather than throwing', () => {
    expect(runPortLayout({ strategy: 'nonsense' as any }, box)).toEqual({ x: 100, y: 30 });
  });

  it('absolute — fractions by default, px on request', () => {
    expect(runPortLayout({ strategy: 'absolute', args: { x: 0.25, y: 0.5 } }, box)).toEqual({ x: 25, y: 30 });
    expect(runPortLayout({ strategy: 'absolute', args: { x: 25, y: 5, units: 'px' } }, box)).toEqual({
      x: 25,
      y: 5,
    });
  });

  it('line — divides the segment evenly', () => {
    const args = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    expect(runPortLayout({ strategy: 'line', args }, { ...box, rank: 0, count: 3 })).toEqual({ x: 25, y: 0 });
    expect(runPortLayout({ strategy: 'line', args }, { ...box, rank: 1, count: 3 })).toEqual({ x: 50, y: 0 });
    expect(runPortLayout({ strategy: 'line', args }, { ...box, rank: 2, count: 3 })).toEqual({ x: 75, y: 0 });
  });

  it('line with `step` — a fixed pitch, so adding a port does not shuffle the others', () => {
    const args = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, step: 12 };
    expect(runPortLayout({ strategy: 'line', args }, { ...box, rank: 0, count: 3 })).toEqual({ x: 0, y: 0 });
    expect(runPortLayout({ strategy: 'line', args }, { ...box, rank: 2, count: 3 })).toEqual({ x: 24, y: 0 });
    // Same positions with a 4th port added — the pitch does not depend on `count`.
    expect(runPortLayout({ strategy: 'line', args }, { ...box, rank: 2, count: 4 })).toEqual({ x: 24, y: 0 });
  });

  it('sideLinear — spreads along the edge, inset by padding', () => {
    const spec = { strategy: 'sideLinear' as const, args: { padding: 10 } };
    expect(runPortLayout(spec, { ...box, side: 'left', rank: 0, count: 1 })).toEqual({ x: 0, y: 30 });
    expect(runPortLayout(spec, { ...box, side: 'left', rank: 0, count: 3 })).toEqual({ x: 0, y: 20 });
    expect(runPortLayout(spec, { ...box, side: 'left', rank: 2, count: 3 })).toEqual({ x: 0, y: 40 });
  });

  it('ellipse — one fixed angle on the inscribed ellipse', () => {
    const p = runPortLayout({ strategy: 'ellipse', args: { angle: 0 } }, { ...box, width: 100, height: 100 });
    expect(p.x).toBeCloseTo(100); // 0° = +x
    expect(p.y).toBeCloseTo(50);
  });

  it('ellipseSpread — a FULL ring divides by count, so first and last do not collide', () => {
    const spec = { strategy: 'ellipseSpread' as const, args: { angle: 0, sweep: 360 } };
    const square = { ...box, width: 100, height: 100 };

    const first = runPortLayout(spec, { ...square, rank: 0, count: 4 });
    const last = runPortLayout(spec, { ...square, rank: 3, count: 4 });

    expect(first.x).toBeCloseTo(100);
    expect(first.y).toBeCloseTo(50);
    // 3 × 90° = 270° → straight up.
    expect(last.x).toBeCloseTo(50);
    expect(last.y).toBeCloseTo(0);
  });

  it('ellipseSpread — a PARTIAL arc puts ports ON both ends', () => {
    const spec = { strategy: 'ellipseSpread' as const, args: { angle: 0, sweep: 90 } };
    const square = { ...box, width: 100, height: 100 };

    const first = runPortLayout(spec, { ...square, rank: 0, count: 3 });
    const last = runPortLayout(spec, { ...square, rank: 2, count: 3 });

    expect(first.x).toBeCloseTo(100); // 0°
    expect(last.y).toBeCloseTo(100); // 90°
  });

  it('dx/dy nudge applies after the strategy', () => {
    expect(runPortLayout({ strategy: 'shape', args: { dx: 5, dy: -3 } }, box)).toEqual({ x: 105, y: 27 });
  });

  it('compensateRotation counter-rotates about the node centre', () => {
    // Node centre (50,30); the right-edge port sits at +50 on x. Counter-rotating
    // by -90° swings it to straight UP, so that when the node's own +90° transform
    // is applied the port lands back on the world's right — which is the point.
    const p = compensateForRotation({ x: 100, y: 30 }, 100, 60, 90);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(-20);

    // Round trip: compensating by -d then rotating by +d is the identity.
    const back = compensateForRotation(p, 100, 60, -90);
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(30);

    // No rotation → no movement, and no floating-point drift.
    expect(compensateForRotation({ x: 100, y: 30 }, 100, 60, 0)).toEqual({ x: 100, y: 30 });
  });
});

// ===========================================================================
// port-positioning — group scoping + byte-stability
// ===========================================================================

describe('port positioning (wave 6 wiring)', () => {
  it('an ungrouped port keeps the SIDE scope — identical geometry to before', () => {
    const node = makeNode('n1');
    const a = new PortModel({ id: 'a', type: 'output', side: 'right', index: 0 });
    const b = new PortModel({ id: 'b', type: 'output', side: 'right', index: 1 });
    node.addPort(a);
    node.addPort(b);

    // Two ports on the right edge → 1/3 and 2/3 down it.
    expect(getPortPositionForShape(a, node)).toEqual({ x: 100, y: 20 });
    expect(getPortPositionForShape(b, node)).toEqual({ x: 100, y: 40 });
  });

  it('a GROUP is the layout scope — an ungrouped port on the same side does not steal a slot', () => {
    const node = makeNode('n1');
    setNodePortGroups(node, { in: { id: 'in', side: 'left' } });

    const g0 = new PortModel({ id: 'g0', type: 'input', group: 'in', index: 0 });
    const g1 = new PortModel({ id: 'g1', type: 'input', group: 'in', index: 1 });
    const loner = new PortModel({ id: 'loner', type: 'input', side: 'left' });
    node.addPort(g0);
    node.addPort(g1);
    node.addPort(loner);

    // The group's two members split the left edge between themselves…
    expect(getPortPositionForShape(g0, node)).toEqual({ x: 0, y: 20 });
    expect(getPortPositionForShape(g1, node)).toEqual({ x: 0, y: 40 });
    // …and the ungrouped port is alone in the SIDE scope, so it sits at the midpoint.
    expect(getPortPositionForShape(loner, node)).toEqual({ x: 0, y: 30 });
  });

  it('shape-aware anchors still win when no layout is declared (circle ≠ bounding box)', () => {
    const node = makeNode('n1', 'circle', 100, 100);
    const port = new PortModel({ id: 'p', type: 'output', side: 'right' });
    node.addPort(port);

    const p = getPortPositionForShape(port, node);
    // On the circle's PERIMETER, which for a single right-side port is the
    // rightmost point — and crucially NOT something the layout engine invented.
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });

  it('a declared layout strategy overrides the shape anchor', () => {
    const node = makeNode('n1', 'circle', 100, 100);
    const port = new PortModel({
      id: 'p',
      type: 'output',
      side: 'right',
      layout: { strategy: 'absolute', args: { x: 0.5, y: 0.5 } },
    });
    node.addPort(port);

    expect(getPortPositionForShape(port, node)).toEqual({ x: 50, y: 50 });
  });
});

// ===========================================================================
// Card 5 — spots + spreading
// ===========================================================================

describe('attachment spots and spreading (Card 5)', () => {
  const input = { x: 100, y: 30, hw: 6, hh: 6, side: 'right' as const };

  it('no spot → the glyph CENTRE and the port side: the pre-wave-6 endpoint', () => {
    const { point, direction } = resolveSpot(undefined, input);
    expect(point).toEqual({ x: 100, y: 30 });
    expect(direction).toBe('right');
  });

  it('a named spot lands on the glyph box', () => {
    expect(resolveSpot({ spot: 'topRight' }, input).point).toEqual({ x: 106, y: 24 });
    expect(resolveSpot({ spot: 'bottom' }, input).point).toEqual({ x: 100, y: 36 });
  });

  it('a spot can aim the link somewhere other than the outward normal', () => {
    expect(resolveSpot({ spot: 'center', direction: 'bottom' }, input).direction).toBe('bottom');
  });

  it('distance stands the attachment off along the travel direction', () => {
    expect(resolveSpot({ spot: 'center', distance: 10 }, input).point).toEqual({ x: 110, y: 30 });
  });

  describe('multi-link spreading', () => {
    it('ONE link never moves — the byte-stability guarantee', () => {
      expect(spreadOffsets(1, 10)).toEqual([0]);
    });

    it('lanes are centred on the port', () => {
      expect(spreadOffsets(2, 10)).toEqual([-5, 5]);
      expect(spreadOffsets(3, 10)).toEqual([-10, 0, 10]);
    });

    it('the max cap folds outer links back onto the outermost lane', () => {
      expect(spreadOffsets(5, 10, 3)).toEqual([-10, 0, 10, 10, 10]);
    });

    it('spread slides along the EDGE (the tangent), so the link still touches the port', () => {
      // A right-side port's tangent is vertical: the fan runs DOWN the edge, and
      // the x — which is what keeps the endpoint ON the node — never changes.
      expect(applySpread({ x: 100, y: 30 }, 'right', 8)).toEqual({ x: 100, y: 38 });
      // A top-side port's tangent is horizontal: the fan runs ACROSS the edge and
      // y is the coordinate that must not move.
      expect(applySpread({ x: 50, y: 0 }, 'top', 8)).toEqual({ x: 58, y: 0 });
      // Lane 0 is a strict no-op — the byte-stability guarantee.
      expect(applySpread({ x: 100, y: 30 }, 'right', 0)).toEqual({ x: 100, y: 30 });
    });

    it('a disabled spread gives every link lane 0', () => {
      const lanes = assignSpreadLanes(
        [
          { linkId: 'l1', sortKey: 'a' },
          { linkId: 'l2', sortKey: 'b' },
        ],
        { enabled: false }
      );
      expect(lanes.get('l1')).toBe(0);
      expect(lanes.get('l2')).toBe(0);
    });

    it('lanes are STABLE — ordered by the other endpoint, not by insertion', () => {
      const spec = { enabled: true, spacing: 10 };

      const first = assignSpreadLanes(
        [
          { linkId: 'l2', sortKey: 'z' },
          { linkId: 'l1', sortKey: 'a' },
        ],
        spec
      );
      // Same links, opposite insertion order → same lanes.
      const second = assignSpreadLanes(
        [
          { linkId: 'l1', sortKey: 'a' },
          { linkId: 'l2', sortKey: 'z' },
        ],
        spec
      );

      expect(first.get('l1')).toBe(-5);
      expect(first.get('l2')).toBe(5);
      expect(second.get('l1')).toBe(first.get('l1'));
      expect(second.get('l2')).toBe(first.get('l2'));
    });
  });
});
