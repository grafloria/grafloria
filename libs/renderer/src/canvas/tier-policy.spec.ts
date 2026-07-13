// Wave 8 — Card 5: what a switch to canvas would COST.
//
// The automatic far-zoom tier this card asked for is gone — measured, refuted, deleted
// (see the header of `tier-policy.ts`). These pin the thing that outlived it: canvas is a
// strictly LESSER surface, and something has to know that before a host switches onto it.

import { canvasSafety, explainHazards, type CanvasHazard } from './tier-policy';

describe('canvasSafety', () => {
  it('is safe when nothing would be lost', () => {
    const s = canvasSafety({ a11yActive: false, focusInside: false, hasForeignObject: false });
    expect(s.safe).toBe(true);
    expect(s.hazards).toEqual([]);
  });

  it('is NOT safe while an assistive-technology surface is live', () => {
    // The one that matters most. Canvas mode has no accessible semantics at all: a screen
    // reader handed a <canvas> gets a blank graphic. Trading a user's entire diagram for
    // frame time is not an optimisation.
    const s = canvasSafety({ a11yActive: true, focusInside: false, hasForeignObject: false });
    expect(s.safe).toBe(false);
    expect(s.hazards).toContain('a11y-active');
  });

  it('is NOT safe while focus is inside the diagram', () => {
    const s = canvasSafety({ a11yActive: false, focusInside: true, hasForeignObject: false });
    expect(s.safe).toBe(false);
    expect(s.hazards).toContain('focus-inside');
  });

  it('is NOT safe while the scene has HTML nodes canvas cannot paint', () => {
    const s = canvasSafety({ a11yActive: false, focusInside: false, hasForeignObject: true });
    expect(s.safe).toBe(false);
    expect(s.hazards).toContain('foreign-object');
  });

  it('reports EVERY hazard, not just the first — a host deserves the whole bill', () => {
    const s = canvasSafety({ a11yActive: true, focusInside: true, hasForeignObject: true });
    expect(s.safe).toBe(false);
    expect(s.hazards).toEqual<CanvasHazard[]>(['a11y-active', 'focus-inside', 'foreign-object']);
  });

  it('explains itself in words a host could put in front of a user', () => {
    const text = explainHazards(['a11y-active', 'foreign-object']);
    expect(text).toMatch(/screen reader/i);
    expect(text).toMatch(/rasterise|rasterize/i);
  });
});
