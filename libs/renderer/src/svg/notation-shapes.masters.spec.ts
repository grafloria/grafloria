// Stencil-master notation glyphs (master-sheet audit, findings 2 & 4).
//
// A BPMN gateway's identity is its inner MARKER (exclusive ✕ / inclusive ◯ /
// parallel ＋), an intermediate event is a DOUBLE ring, and a UML final node is
// a BULLS-EYE — none of which a plain diamond/circle can say. These pin the
// path geometry: marker subpaths present, sized around the centre, and — the
// part that broke silently before — ports/link attachment still resolve to the
// BASE silhouette, not the marker.

import { registerNotationShapes } from './notation-shapes';
import { getShape, hasShape } from './shape-registry';

registerNotationShapes();

/** All `M x y` subpath starts of a path `d`. */
const subpaths = (d: string): string[] => d.split(/(?=M )/).map((s) => s.trim()).filter(Boolean);

describe('notation shapes — BPMN gateway markers', () => {
  it.each([
    ['gateway-xor', 3], // diamond + 2 stroke lines of the ✕
    ['gateway-or', 2],  // diamond + ring circle
    ['gateway-and', 3], // diamond + 2 stroke lines of the ＋
  ])('%s paints the diamond plus its marker subpaths', (type, minSubpaths) => {
    expect(hasShape(type)).toBe(true);
    const spec = getShape(type).outline(50, 50);
    expect(spec.el).toBe('path');
    const d = String(spec.geom['d']);
    expect(subpaths(d).length).toBeGreaterThanOrEqual(minSubpaths);
    // first subpath is the diamond: starts at the top vertex
    expect(subpaths(d)[0]).toMatch(/^M 25[, ]0/);
  });

  it('the ✕ marker is centred and glyph-sized (not touching the diamond edges)', () => {
    const d = String(getShape('gateway-xor').outline(50, 50).geom['d']);
    const [, l1] = subpaths(d);
    // 0.18 * 50 = 9 → stroke from (16,16) to (34,34)
    expect(l1.replace(/,/g, ' ')).toBe('M 16 16 L 34 34');
  });

  it('gateway ports anchor on the DIAMOND outline, not the marker', () => {
    const withMarker = getShape('gateway-xor');
    const plain = getShape('diamond');
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(withMarker.portAnchor(50, 50, side, 0, 1)).toEqual(plain.portAnchor(50, 50, side, 0, 1));
    }
  });
});

describe('notation shapes — BPMN event rings', () => {
  it('event-intermediate is a double ring around one centre', () => {
    const d = String(getShape('event-intermediate').outline(36, 36).geom['d']);
    const parts = subpaths(d);
    expect(parts.length).toBe(2); // outer circle + inner circle
    // outer ring spans x=0…36; inner ring is inset ≥3px
    expect(parts[0]).toMatch(/^M 0[, ]18/);
    const innerStart = Number(parts[1].match(/^M ([\d.]+)/)?.[1]);
    expect(innerStart).toBeGreaterThanOrEqual(3);
  });

  it('event ports anchor on the outer circle', () => {
    const ring = getShape('event-intermediate');
    const plain = getShape('circle');
    expect(ring.portAnchor(36, 36, 'right', 0, 1)).toEqual(plain.portAnchor(36, 36, 'right', 0, 1));
  });
});
