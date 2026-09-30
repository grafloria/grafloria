// A database cylinder stretched WIDE keeps a thin rim — a drum, not a lens.
//
// The rim's depth grew with the width (ry = w/2 / (2.5 + w/h) → h/2), so a
// cylinder filling a wide block-beta cell (280 × 56) was two-thirds rim: its
// front seam fell at 37 px and the label, centred at 30 px, was drawn across
// it ("SQL database" struck through). The rim is now capped at a fifth of the
// height (a cylinder up to 5 : 3 — the default 120 × 80 among them — keeps its
// rim), and the label sits on the body below the seam, not on a fixed 28–78 %
// band that began above it.

import { getShape, getInnerRect } from './shape-registry';

const def = getShape('cylinder');
/** The rim's front seam at the middle: where the body's visible top edge is. */
const seam = (w: number, h: number) => def.portAnchor(w, h, 'top', 0, 1).y;

describe('cylinder rim', () => {
  it('a default cylinder is drawn as before (120 × 80: the seam at 2·15)', () => {
    expect(seam(120, 80)).toBeCloseTo(30, 5);
  });

  it('a wide cylinder keeps a thin rim: the seam within the top two-fifths', () => {
    for (const [w, h] of [[280, 56], [600, 56], [160, 40], [1000, 60]] as const) {
      expect([w, h, seam(w, h) <= 0.4 * h + 1e-9]).toEqual([w, h, true]);
    }
  });

  it("the label sits ON THE BODY: from the rim's seam down to where the base meets the sides", () => {
    for (const [w, h] of [[120, 80], [129, 56], [280, 56], [600, 56], [60, 120]] as const) {
      const ir = getInnerRect(def, w, h);
      const s = seam(w, h), ry = s / 2;
      expect([w, h, Math.round(ir.y * 100), Math.round((ir.y + ir.h) * 100)]).toEqual([w, h, Math.round(s * 100), Math.round((h - ry) * 100)]);
      // its middle clear of the seam by a fifth of the height at least — room for a line's caps
      expect([w, h, ir.y + ir.h / 2 - s >= 0.2 * h - 1e-9]).toEqual([w, h, true]);
    }
  });

  it('the outline and the anchors agree on the rim (one radius)', () => {
    const d = String(def.outline(280, 56).geom['d']);
    const ry = Number(/a [\d.]+,([\d.]+)/.exec(d)![1]);
    expect(seam(280, 56)).toBeCloseTo(2 * ry, 2);
  });
});
