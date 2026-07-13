// Wave 3 (Edges & links), Card A — LinkStyle.curvature is no longer dead.
//
// `curvature` has been declared on LinkStyle since Phase 4 and read by NOBODY:
// generateSmoothPath hardcoded a 0.5 factor and the SVG renderer hardcoded
// `Math.min(distance / 2, 100)`. Both now read the knob, with 0.5 as the
// default so every existing link keeps the exact curve it had.

import { LinkModel } from './LinkModel';

describe('LinkModel — smooth-curve curvature (Wave 3, Card A)', () => {
  function smooth(curvature?: number): LinkModel {
    const link = new LinkModel('src', 'tgt', 'smooth');
    if (curvature !== undefined) {
      link.style.curvature = curvature;
    }
    return link;
  }

  it('defaults to 0.5 — the historical hardcoded control-point factor', () => {
    const link = smooth();
    link.generatePath({ x: 0, y: 0 }, { x: 200, y: 100 });

    // controlOffset = |dx| * 0.5 = 100
    expect(link.getCurvature()).toBe(0.5);
    expect(link.segments[0].control1).toEqual({ x: 100, y: 0 });
    expect(link.segments[0].control2).toEqual({ x: 100, y: 100 });
  });

  it('a per-link curvature changes the control-point offset', () => {
    const link = smooth(1);
    link.generatePath({ x: 0, y: 0 }, { x: 200, y: 100 });

    // controlOffset = |dx| * 1 = 200 (double the default bulge)
    expect(link.segments[0].control1).toEqual({ x: 200, y: 0 });
    expect(link.segments[0].control2).toEqual({ x: 0, y: 100 });
  });

  it('curvature 0 collapses the curve onto its chord', () => {
    const link = smooth(0);
    link.generatePath({ x: 0, y: 0 }, { x: 200, y: 100 });

    expect(link.getCurvature()).toBe(0);
    expect(link.segments[0].control1).toEqual({ x: 0, y: 0 });
    expect(link.segments[0].control2).toEqual({ x: 200, y: 100 });
  });

  it('ignores nonsense values (negative, NaN) and falls back to the default', () => {
    expect(smooth(-1).getCurvature()).toBe(0.5);
    expect(smooth(NaN).getCurvature()).toBe(0.5);
    expect(smooth(Infinity).getCurvature()).toBe(0.5);
  });

  it('round-trips through serialize/fromJSON with cornerRadius (style is spread wholesale)', () => {
    const link = smooth(0.75);
    link.style.cornerRadius = 24;

    const restored = LinkModel.fromJSON(link.serialize());

    expect(restored.style.curvature).toBe(0.75);
    expect(restored.style.cornerRadius).toBe(24);
    expect(restored.getCurvature()).toBe(0.75);
  });

  it('leaves non-smooth path types alone', () => {
    const link = new LinkModel('src', 'tgt', 'direct');
    link.style.curvature = 5;
    link.generatePath({ x: 0, y: 0 }, { x: 200, y: 100 });

    // A direct link is two points and a straight segment — no control points.
    expect(link.segments[0].type).toBe('line');
    expect(link.segments[0].control1).toBeUndefined();
  });
});
