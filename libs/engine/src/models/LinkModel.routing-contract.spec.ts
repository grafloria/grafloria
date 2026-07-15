// Wave 5 (Edge routing) — Card 0: the per-link router × connector contract.
//
// `pathType` conflated two independent choices: WHERE the line goes (routing
// geometry) and HOW the polyline is drawn (connector rendering). These specs pin
// the split: explicit fields win, absent fields derive EXACTLY the legacy
// behaviour, and serialization only carries what was explicitly set — so a
// legacy document round-trips byte-identically.

import { LinkModel } from './LinkModel';

describe('LinkModel — router × connector contract (Card 0)', () => {
  describe('derivation (legacy pathType shorthand)', () => {
    it.each([
      ['direct', 'straight', 'straight'],
      ['orthogonal', 'orthogonal', 'rounded'],
      ['smooth', 'straight', 'smooth'],
      ['bezier', 'straight', 'bezier'],
    ] as const)('pathType %s → router %s + connector %s', (pathType, router, connector) => {
      const link = new LinkModel('p1', 'p2', pathType);
      expect(link.effectiveRouter()).toBe(router);
      expect(link.effectiveConnector()).toBe(connector);
    });

    it('an explicitly axis-aligned router implies rounded rendering (screenshot-audit fix)', () => {
      // The old contract kept the pathType connector, so `router: 'avoid'` on
      // the default pathType drew a smooth SPLINE through Manhattan waypoints —
      // a route that dodged the obstacle rendered as a curve that could re-cross
      // it, under a readout saying "orthogonal". Asking for an axis-aligned
      // router IS asking for axis-aligned rendering.
      for (const router of ['orthogonal', 'manhattan', 'avoid', 'elk'] as const) {
        const link = new LinkModel('p1', 'p2', 'smooth');
        link.setRouter(router);
        expect(link.effectiveRouter()).toBe(router);
        expect(link.effectiveConnector()).toBe('rounded');
        expect(link.pathType).toBe('smooth'); // untouched — the rung is resolution-only
      }
    });

    it('a smooth line routed around obstacles is still expressible — with an explicit connector', () => {
      const link = new LinkModel('p1', 'p2', 'smooth');
      link.setRouter('avoid');
      link.setConnector('smooth');
      expect(link.effectiveRouter()).toBe('avoid');
      expect(link.effectiveConnector()).toBe('smooth');
    });

    it('a custom router name does not imply a connector (falls through to pathType)', () => {
      const link = new LinkModel('p1', 'p2', 'smooth');
      link.setRouter('my-team-router');
      expect(link.effectiveConnector()).toBe('smooth');
    });

    it('an explicit connector wins without touching the router', () => {
      const link = new LinkModel('p1', 'p2', 'orthogonal');
      link.setConnector('straight'); // hard corners on an elbow route
      expect(link.effectiveRouter()).toBe('orthogonal');
      expect(link.effectiveConnector()).toBe('straight');
    });

    it('custom registered router names pass through verbatim', () => {
      const link = new LinkModel('p1', 'p2');
      link.setRouter('my-team-router');
      expect(link.effectiveRouter()).toBe('my-team-router');
    });
  });

  describe('route-cache semantics', () => {
    it('setRouter clears the cached route (the old polyline belongs to the old router)', () => {
      const link = new LinkModel('p1', 'p2', 'orthogonal');
      link.points = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }];
      link.setMetadata('hasManualWaypoints', true);
      link.setRouter('manhattan');
      expect(link.points).toEqual([]);
      expect(link.getMetadata('hasManualWaypoints')).toBe(false);
    });

    it('setConnector does NOT clear the route — the geometry is still valid, only the drawing changes', () => {
      const link = new LinkModel('p1', 'p2', 'orthogonal');
      link.points = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }];
      link.setConnector('smooth');
      expect(link.points).toHaveLength(3);
    });

    it('setting the same value is a no-op (no cache clear, no change tracked)', () => {
      const link = new LinkModel('p1', 'p2');
      link.setRouter('avoid');
      link.points = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      const version = link.version;
      link.setRouter('avoid');
      expect(link.points).toHaveLength(2);
      expect(link.version).toBe(version);
    });
  });

  describe('serialization', () => {
    it('legacy links serialize WITHOUT router/connector keys — byte-stability for old documents', () => {
      const link = new LinkModel('p1', 'p2', 'orthogonal');
      const json = link.serialize();
      expect('router' in json).toBe(false);
      expect('connector' in json).toBe(false);
    });

    it('explicit settings round-trip losslessly', () => {
      const link = new LinkModel('p1', 'p2', 'smooth');
      link.setRouter('manhattan');
      link.setConnector('rounded');
      const restored = LinkModel.fromJSON(link.serialize());
      expect(restored.effectiveRouter()).toBe('manhattan');
      expect(restored.effectiveConnector()).toBe('rounded');
      // and the invariant the suite enforces globally, locally:
      expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(link.serialize()));
    });

    it('undo-shaped change tracking: router/connector changes are tracked with old + new values', () => {
      const link = new LinkModel('p1', 'p2');
      link.setRouter('avoid');
      link.setConnector('bezier');
      const log = link.getChangeLog();
      const routerChange = log.find((c) => c.property === 'router');
      const connectorChange = log.find((c) => c.property === 'connector');
      expect(routerChange).toMatchObject({ oldValue: undefined, newValue: 'avoid' });
      expect(connectorChange).toMatchObject({ oldValue: undefined, newValue: 'bezier' });
    });
  });
});
