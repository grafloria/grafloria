// wave10/whiteboard — the stroke entity.

import {
  StrokeModel,
  DEFAULT_SIMPLIFY_EPSILON,
  hasPressure,
  segmentDistance,
  type StrokePoint,
} from './StrokeModel';
import { DiagramModel } from './DiagramModel';
import { getMutationEpoch } from './DiagramEntity';

/** A realistic raw pointer trace: a smooth arc, sampled densely, with sensor jitter. */
function rawTrace(count = 500): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Deterministic pseudo-jitter — a real trace is never perfectly smooth, and a
    // simplifier that only works on clean input is not a simplifier.
    const jitter = Math.sin(i * 12.9898) * 0.25;
    points.push({
      x: 100 + t * 400 + jitter,
      y: 200 + Math.sin(t * Math.PI) * 120 + jitter,
      pressure: 0.2 + Math.sin(t * Math.PI) * 0.7,
    });
  }
  return points;
}

describe('StrokeModel', () => {
  describe('simplification (the 500-point bug)', () => {
    it('a 500-point raw trace does NOT serialise as 500 points', () => {
      const raw = rawTrace(500);
      const stroke = StrokeModel.fromRawPoints(raw);

      // The brief calls this out by name: "A 500-point stroke that serialises as 500
      // points is a bug." The engine's own PathSimplifier (Douglas-Peucker) does it.
      expect(raw.length).toBe(500);
      expect(stroke.pointCount).toBeLessThan(100);
      expect(stroke.serialize().points.length).toBe(stroke.pointCount);
    });

    it('keeps the SHAPE: every discarded point is within epsilon of the kept polyline', () => {
      // The real contract is not "fewer points" — it is "fewer points AND the same
      // curve". A simplifier that returned [first, last] would pass a count assertion
      // and destroy the drawing.
      const raw = rawTrace(400);
      const stroke = StrokeModel.fromRawPoints(raw, { color: '#000', width: 1 });
      const kept = stroke.getPoints();

      for (const p of raw) {
        let best = Infinity;
        for (let i = 0; i < kept.length - 1; i++) {
          best = Math.min(best, pointToSegment(p, kept[i], kept[i + 1]));
        }
        // + quantization slack (coords are rounded to 2dp at construction)
        expect(best).toBeLessThanOrEqual(DEFAULT_SIMPLIFY_EPSILON + 0.02);
      }
    });

    it('PRESERVES PRESSURE on the points it keeps', () => {
      // Douglas-Peucker SELECTS points, it never interpolates new ones — so the
      // pressure riding on each retained sample survives. That is a property of the
      // algorithm, not luck, and if it ever grows an interpolating mode this breaks
      // silently. Hence the pin.
      const raw = rawTrace(300);
      const stroke = StrokeModel.fromRawPoints(raw);

      expect(hasPressure(stroke.getPoints())).toBe(true);
      for (const kept of stroke.getPoints()) {
        const source = raw.find(
          (r) => Math.abs(r.x - kept.x) < 0.01 && Math.abs(r.y - kept.y) < 0.01
        );
        expect(source).toBeDefined();
        expect(kept.pressure).toBeCloseTo(source!.pressure!, 2);
      }
    });

    it('does not choke on 2-point or 1-point traces', () => {
      expect(StrokeModel.fromRawPoints([{ x: 1, y: 1 }]).pointCount).toBe(1);
      expect(
        StrokeModel.fromRawPoints([
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ]).pointCount
      ).toBe(2);
      expect(StrokeModel.fromRawPoints([]).pointCount).toBe(0);
    });

    it('drops non-finite samples instead of poisoning the bounds with NaN', () => {
      const stroke = StrokeModel.fromRawPoints([
        { x: 0, y: 0 },
        { x: NaN, y: 5 },
        { x: 10, y: 10 },
      ] as StrokePoint[]);
      expect(stroke.pointCount).toBe(2);
      const b = stroke.getBounds();
      expect(Number.isFinite(b.x) && Number.isFinite(b.width)).toBe(true);
    });
  });

  describe('geometry', () => {
    it('bounds are inflated by the half-width, so a horizontal line is not zero-height', () => {
      // A perfectly horizontal 1px line with un-inflated bounds has height 0, and every
      // viewport-overlap test then culls it out of a viewport it is plainly inside.
      const s = new StrokeModel(
        [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
        { color: '#000', width: 8 }
      );
      const b = s.getBounds();
      expect(b.height).toBe(8);
      expect(b.y).toBe(46);
      expect(b.width).toBe(108);
    });

    it('hitTest measures distance to the SEGMENT, not the infinite line', () => {
      const s = new StrokeModel(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        { color: '#000', width: 2 }
      );
      expect(s.hitTest(50, 0, 0)).toBe(true);
      expect(s.hitTest(50, 20, 0)).toBe(false);
      expect(s.hitTest(50, 20, 25)).toBe(true); // within tolerance

      // A point far off the END of the segment, but exactly on the infinite line it
      // lies along. An unclamped projection reports a hit here — 900 units from any ink.
      expect(s.hitTest(1000, 0, 5)).toBe(false);
    });

    it('intersectsSegment catches a stroke the pointer LEAPT over between samples', () => {
      // The eraser's real problem: at 60Hz a fast flick lands samples 80px apart. A
      // point-based test misses a stroke the user visibly swept through.
      const s = new StrokeModel(
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
        { color: '#000', width: 2 }
      );

      // Neither endpoint is near the ink; the segment between them crosses it head-on.
      expect(s.hitTest(0, 50, 4)).toBe(false);
      expect(s.hitTest(100, 50, 4)).toBe(false);
      expect(s.intersectsSegment({ x: 0, y: 50 }, { x: 100, y: 50 }, 4)).toBe(true);
    });

    it('segmentDistance is 0 for crossing segments and correct for parallel ones', () => {
      expect(
        segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })
      ).toBe(0);
      expect(
        segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 3 }, { x: 10, y: 3 })
      ).toBeCloseTo(3);
    });
  });

  describe('as a first-class DiagramEntity', () => {
    it('adding a stroke BUMPS THE MUTATION EPOCH (or the frame gate would skip the frame)', () => {
      // This is the line that makes ink visible at all. Both frame gates
      // (svg-renderer + create-diagram) skip a frame when the epoch has not moved. A
      // stroke held in a plain array would change the picture without moving it, and
      // you would draw and see nothing.
      const d = new DiagramModel('ink');
      const before = getMutationEpoch();
      d.addStroke(new StrokeModel([{ x: 1, y: 1 }, { x: 2, y: 2 }]));
      expect(getMutationEpoch()).toBeGreaterThan(before);

      const afterAdd = getMutationEpoch();
      d.removeStroke(d.getStrokes()[0].id);
      expect(getMutationEpoch()).toBeGreaterThan(afterAdd);
    });

    it('emits a structural change on the diagram for add and remove', () => {
      const d = new DiagramModel('ink');
      const seen: Array<{ property: string; had: boolean; got: boolean }> = [];
      d.on('change', (e: { property: string; oldValue: unknown; newValue: unknown }) => {
        if (e.property === 'strokes') {
          seen.push({ property: e.property, had: !!e.oldValue, got: !!e.newValue });
        }
      });

      const s = new StrokeModel([{ x: 0, y: 0 }, { x: 1, y: 1 }], { color: '#000', width: 1 });
      d.addStroke(s);
      d.removeStroke(s.id);

      // (null → stroke) = add, (stroke → null) = remove. This is exactly the vocabulary
      // OpCapture already speaks for nodes/links/groups, which is why strokes needed no
      // parallel capture path.
      expect(seen).toEqual([
        { property: 'strokes', had: false, got: true },
        { property: 'strokes', had: true, got: false },
      ]);
    });

    it('getStrokesAlongSegment finds every stroke under an eraser sweep', () => {
      const d = new DiagramModel('ink');
      for (let i = 0; i < 5; i++) {
        d.addStroke(
          new StrokeModel(
            [
              { x: i * 20, y: 0 },
              { x: i * 20, y: 100 },
            ],
            { color: '#000', width: 2 },
            { id: `s${i}` }
          )
        );
      }
      // A horizontal wipe across all five verticals.
      const hit = d.getStrokesAlongSegment({ x: -10, y: 50 }, { x: 200, y: 50 }, 2);
      expect(hit.map((s) => s.id).sort()).toEqual(['s0', 's1', 's2', 's3', 's4']);

      // A wipe that passes above every one of them hits nothing.
      expect(d.getStrokesAlongSegment({ x: -10, y: -50 }, { x: 200, y: -50 }, 2)).toEqual([]);
    });

    it('getVisibleStrokes culls to the viewport', () => {
      const d = new DiagramModel('ink');
      d.addStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 10, y: 10 }], undefined, { id: 'near' }));
      d.addStroke(
        new StrokeModel([{ x: 9000, y: 9000 }, { x: 9010, y: 9010 }], undefined, { id: 'far' })
      );
      const visible = d.getVisibleStrokes({ x: -50, y: -50, width: 200, height: 200 });
      expect(visible.map((s) => s.id)).toEqual(['near']);
    });

    it('clear() removes ink, and does so through removeStroke (so peers are told)', () => {
      const d = new DiagramModel('ink');
      const removed: string[] = [];
      d.on('change', (e: { property: string; oldValue: unknown; newValue: unknown }) => {
        if (e.property === 'strokes' && e.oldValue && !e.newValue) removed.push('x');
      });
      d.addStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 1, y: 1 }]));
      d.addStroke(new StrokeModel([{ x: 2, y: 2 }, { x: 3, y: 3 }]));
      d.clear();

      expect(d.getStrokes()).toEqual([]);
      // A bare `strokes.clear()` would leave this at 0 — the ink would vanish locally
      // and the other peers would never hear about it.
      expect(removed.length).toBe(2);
    });
  });
});

function pointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
