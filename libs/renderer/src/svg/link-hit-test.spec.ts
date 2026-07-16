// link-hit-test.spec.ts
// Wave 1 (Edges & links) — part-aware link hit-testing primitive.

import type { Point } from '@grafloria/engine';
import {
  hitTestLink,
  pointAtPositionOnPolyline,
  linkBodyHitTolerance,
  linkHitAreaWidth,
  DEFAULT_ENDPOINT_RADIUS,
  DEFAULT_ARROW_RADIUS,
  DEFAULT_LINK_HIT_TOLERANCE,
  type LinkHitTestOptions,
} from './link-hit-test';

describe('link-hit-test (Wave 1 — part-aware link hit-testing)', () => {
  // A simple horizontal 3-point polyline: (0,0) -> (100,0) -> (200,0).
  // Total length 200, so t=0.5 is at x=100.
  const horizontal: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ];

  describe('pointAtPositionOnPolyline', () => {
    it('returns null for < 2 points... but the single point for exactly one', () => {
      expect(pointAtPositionOnPolyline([], 0.5)).toBeNull();
      expect(pointAtPositionOnPolyline([{ x: 3, y: 4 }], 0.5)).toEqual({ x: 3, y: 4 });
    });

    it('interpolates by arc length across segments', () => {
      expect(pointAtPositionOnPolyline(horizontal, 0)).toEqual({ x: 0, y: 0 });
      expect(pointAtPositionOnPolyline(horizontal, 0.5)).toEqual({ x: 100, y: 0 });
      expect(pointAtPositionOnPolyline(horizontal, 0.25)).toEqual({ x: 50, y: 0 });
      expect(pointAtPositionOnPolyline(horizontal, 1)).toEqual({ x: 200, y: 0 });
    });

    it('clamps t to [0, 1]', () => {
      expect(pointAtPositionOnPolyline(horizontal, -1)).toEqual({ x: 0, y: 0 });
      expect(pointAtPositionOnPolyline(horizontal, 2)).toEqual({ x: 200, y: 0 });
    });
  });

  describe('body hits', () => {
    it('reports a body hit with the 0-1 position along the whole path', () => {
      const result = hitTestLink({ points: horizontal }, { x: 100, y: 0 }, 5);
      expect(result).not.toBeNull();
      expect(result!.part).toBe('body');
      expect(result!.t).toBeCloseTo(0.5, 6);
    });

    it('resolves t on the second segment', () => {
      const result = hitTestLink({ points: horizontal }, { x: 150, y: 2 }, 5);
      expect(result!.part).toBe('body');
      expect(result!.t).toBeCloseTo(0.75, 6);
    });

    it('returns null when the point is outside tolerance of the path', () => {
      const result = hitTestLink({ points: horizontal }, { x: 100, y: 50 }, 5);
      expect(result).toBeNull();
    });

    it('does not report a body for a degenerate single-point link', () => {
      const result = hitTestLink({ points: [{ x: 10, y: 10 }], sourceEndpoint: null, targetEndpoint: null }, { x: 10, y: 10 }, 5);
      expect(result).toBeNull();
    });
  });

  describe('endpoint hits', () => {
    it('reports the source endpoint near points[0]', () => {
      const result = hitTestLink({ points: horizontal }, { x: 2, y: 2 }, 5);
      expect(result!.part).toBe('source-endpoint');
    });

    it('reports the target endpoint near the last point', () => {
      const result = hitTestLink({ points: horizontal }, { x: 200, y: 3 }, 5);
      expect(result!.part).toBe('target-endpoint');
    });

    it('endpoints win over the body when both are within reach', () => {
      // Query sits on the path (body) AND within the endpoint radius.
      const result = hitTestLink({ points: horizontal }, { x: 0, y: 0 }, 5);
      expect(result!.part).toBe('source-endpoint');
    });

    it('honours a custom endpoint radius', () => {
      const opts: LinkHitTestOptions = { points: horizontal, endpointRadius: 3 };
      // 4px from the source endpoint — outside the shrunk radius, so it falls
      // through to the body instead of the endpoint.
      const result = hitTestLink(opts, { x: 4, y: 0 }, 5);
      expect(result!.part).toBe('body');
    });

    it('can be disabled by passing null', () => {
      const result = hitTestLink(
        { points: horizontal, sourceEndpoint: null },
        { x: 0, y: 0 },
        5
      );
      // With the source endpoint disabled, the on-path point resolves to body.
      expect(result!.part).toBe('body');
      expect(result!.t).toBeCloseTo(0, 6);
    });
  });

  describe('arrow hits', () => {
    // Arrow anchors sit inset from the endpoints, off the body line so they are
    // distinguishable from an endpoint / body hit.
    const withArrows: LinkHitTestOptions = {
      points: horizontal,
      sourceArrow: { x: 12, y: -20 },
      targetArrow: { x: 188, y: -20 },
    };

    it('reports the source arrow near its anchor', () => {
      const result = hitTestLink(withArrows, { x: 12, y: -20 }, 5);
      expect(result!.part).toBe('source-arrow');
    });

    it('reports the target arrow near its anchor', () => {
      const result = hitTestLink(withArrows, { x: 188, y: -22 }, 5);
      expect(result!.part).toBe('target-arrow');
    });

    it('does not fire an arrow hit when no arrow anchor was supplied', () => {
      const result = hitTestLink({ points: horizontal }, { x: 12, y: -20 }, 5);
      expect(result).toBeNull();
    });
  });

  describe('label hits', () => {
    // Label centred at t=0.5 (x=100) then offset up by 30px.
    const withLabel: LinkHitTestOptions = {
      points: horizontal,
      labels: [{ position: 0.5, offset: { x: 0, y: -30 }, width: 40, height: 18 }],
    };

    it('reports a label hit with its index inside the box', () => {
      const result = hitTestLink(withLabel, { x: 100, y: -30 }, 5);
      expect(result!.part).toBe('label');
      expect(result!.labelIndex).toBe(0);
    });

    it('reports a label hit near the box corner (within half-extent)', () => {
      const result = hitTestLink(withLabel, { x: 118, y: -22 }, 5);
      expect(result!.part).toBe('label');
      expect(result!.labelIndex).toBe(0);
    });

    it('misses the label when the query is outside the box', () => {
      // Well above the label box and away from the path -> null.
      const result = hitTestLink(withLabel, { x: 100, y: -60 }, 5);
      expect(result).toBeNull();
    });

    it('labels win over the body but lose to endpoints', () => {
      // A label placed right on the body line (no offset).
      const onBody: LinkHitTestOptions = {
        points: horizontal,
        labels: [{ position: 0.5, offset: { x: 0, y: 0 }, width: 40, height: 18 }],
      };
      const bodyQuery = hitTestLink(onBody, { x: 100, y: 0 }, 5);
      expect(bodyQuery!.part).toBe('label');

      const endpointQuery = hitTestLink(onBody, { x: 0, y: 0 }, 5);
      expect(endpointQuery!.part).toBe('source-endpoint');
    });

    it('returns the topmost (last-drawn) label when boxes overlap', () => {
      const overlapping: LinkHitTestOptions = {
        points: horizontal,
        labels: [
          { position: 0.5, offset: { x: 0, y: -30 }, width: 40, height: 18 },
          { position: 0.5, offset: { x: 0, y: -30 }, width: 40, height: 18 },
        ],
      };
      const result = hitTestLink(overlapping, { x: 100, y: -30 }, 5);
      expect(result!.part).toBe('label');
      expect(result!.labelIndex).toBe(1);
    });
  });

  describe('precedence — nearest handle wins within the handle tier', () => {
    it('picks the closer of two endpoints', () => {
      // Short 2-point link so both endpoints are within radius of the midpoint,
      // but the query leans toward the target.
      const shortLink: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ];
      const result = hitTestLink({ points: shortLink }, { x: 8, y: 0 }, 5);
      expect(result!.part).toBe('target-endpoint');
    });
  });

  describe('exported defaults', () => {
    it('exposes sane default radii', () => {
      expect(DEFAULT_ENDPOINT_RADIUS).toBeGreaterThan(0);
      expect(DEFAULT_ARROW_RADIUS).toBeGreaterThan(0);
    });
  });

  // The painted invitation and the accepted press must be the SAME geometry.
  // The SVG renderer strokes a transparent hit-area `linkHitAreaWidth(sw)`
  // wide; the interaction layer used to accept only a flat 5 — the ring in
  // between was DEAD: the DOM caught the pointer (cursor change, native focus
  // → "a rectangle around the line", live report) while the press selected
  // nothing. One formula now feeds both.
  describe('linkBodyHitTolerance — grab distance == painted hit-area reach', () => {
    it('default link (2px stroke): tolerance is half the 12px hit-area, not the 5px floor', () => {
      expect(linkHitAreaWidth(2)).toBe(12);
      expect(linkBodyHitTolerance(2)).toBe(6);
    });

    it('fat stroke: the +8 grab margin scales the reach with it', () => {
      expect(linkHitAreaWidth(10)).toBe(18);
      expect(linkBodyHitTolerance(10)).toBe(9);
    });

    it('never drops below the cross-backend floor', () => {
      expect(linkBodyHitTolerance(0, 0)).toBe(DEFAULT_LINK_HIT_TOLERANCE);
    });

    it('a press inside the painted hit-area but past the old flat floor NOW hits the body', () => {
      const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
      const query = { x: 50, y: 5.9 }; // inside 6 (painted reach), outside 5 (old floor)
      expect(hitTestLink({ points }, query, DEFAULT_LINK_HIT_TOLERANCE)).toBeNull();
      expect(hitTestLink({ points }, query, linkBodyHitTolerance(2))?.part).toBe('body');
    });
  });
});
