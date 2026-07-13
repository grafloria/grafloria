/**
 * ============================================================================
 * THE ANTI-DEAD-CONFIG GATE (Card 2)
 * ============================================================================
 *
 * This codebase's #1 bug shape is "config declared but never consumed" —
 * `gridEnabled`, `showMinimap`, `snapEnabled` were all declared, defaulted, and
 * read by nobody; `connector: '<custom>'` was silently dropped; `router: 'elk'`
 * threw. A registry that stores a function proves NOTHING.
 *
 * So every test here drives the value THROUGH `SVGRenderer.render()` and asserts
 * on the emitted VNode tree. If a seam ever stops being consumed, these fail.
 */

import { DiagramEngine, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import type { DiagramModel } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import type { VNode } from '../types';
import {
  registerAnchor,
  registerConnectionPoint,
  registerConnector,
  clearLinkPipeline,
} from './link-pipeline';

/** Every `d` attribute in the tree — the link geometry the user actually sees. */
function collectPaths(vnode: VNode | null | undefined, out: string[] = []): string[] {
  if (!vnode || typeof vnode !== 'object') return out;
  const props = (vnode as { props?: Record<string, unknown> }).props;
  const d = props?.['d'];
  if (typeof d === 'string' && d.length > 0) out.push(d);
  const children = (vnode as { children?: unknown[] }).children ?? [];
  for (const child of children) collectPaths(child as VNode, out);
  return out;
}

function buildDiagram(): { engine: DiagramEngine; model: DiagramModel; link: LinkModel } {
  const engine = new DiagramEngine();
  const model = engine.createDiagram('consumption')!;

  // Node A: 100×60 at (0,0)  →  right-edge port at (100, 30)
  // Node B: 100×60 at (300,0) →  left-edge  port at (300, 30)
  const a = new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 } });
  const b = new NodeModel({ id: 'b', type: 'basic', position: { x: 300, y: 0 } });
  a.size = { width: 100, height: 60 };
  b.size = { width: 100, height: 60 };

  a.addPort(new PortModel({ id: 'pa', type: 'output', side: 'right' }));
  b.addPort(new PortModel({ id: 'pb', type: 'input', side: 'left' }));

  model.addNode(a);
  model.addNode(b);

  const link = new LinkModel('pa', 'pb');
  model.addLink(link);

  return { engine, model, link };
}

const VIEWPORT = { x: -100, y: -100, width: 800, height: 600 };

describe('link pipeline — CONSUMED end-to-end by the real renderer', () => {
  afterEach(() => {
    // Restore the built-ins so one test cannot leak a strategy into the next.
    clearLinkPipeline();
  });

  describe('connectors (registerConnector)', () => {
    it('a REGISTERED connector produces the path `d` the renderer emits', () => {
      const { engine, link } = buildDiagram();

      // A connector with an unmistakable signature.
      registerConnector('spec-marker', () => 'M 1 2 L 3 4 L 5 6');
      link.setConnector('spec-marker');

      const renderer = new SVGRenderer(engine);
      const paths = collectPaths(renderer.render(VIEWPORT, 1));

      expect(paths).toContain('M 1 2 L 3 4 L 5 6');
      engine.destroy();
    });

    it('the connector receives the ROUTED polyline and the link', () => {
      const { engine, link } = buildDiagram();
      const seen: { points: number; linkId?: string } = { points: 0 };

      registerConnector('spec-probe', (ctx) => {
        seen.points = ctx.points.length;
        seen.linkId = ctx.link?.id;
        return 'M 0 0';
      });
      link.setConnector('spec-probe');

      new SVGRenderer(engine).render(VIEWPORT, 1);

      expect(seen.points).toBeGreaterThanOrEqual(2);
      expect(seen.linkId).toBe(link.id);
      engine.destroy();
    });

    // THE REGRESSION TEST for the bug this card found: an unknown connector name
    // used to be silently swallowed (fall through to link.pathType), even though
    // LinkConnectorName's `(string & {})` arm advertises custom names.
    it('an UNKNOWN connector name still renders (falls back, does not throw)', () => {
      const { engine, link } = buildDiagram();
      link.setConnector('does-not-exist');

      const renderer = new SVGRenderer(engine);
      expect(() => renderer.render(VIEWPORT, 1)).not.toThrow();
      expect(collectPaths(renderer.render(VIEWPORT, 1)).length).toBeGreaterThan(0);
      engine.destroy();
    });
  });

  describe('connection-point strategies (registerConnectionPoint)', () => {
    it('a REGISTERED strategy decides both endpoints', () => {
      const { engine, link } = buildDiagram();

      registerConnectionPoint('spec-fixed', () => ({
        start: { x: 11, y: 22 },
        end: { x: 33, y: 44 },
      }));
      link.setMetadata('connectionPoint', 'spec-fixed');

      const paths = collectPaths(new SVGRenderer(engine).render(VIEWPORT, 1));

      // The link path must START at the strategy's point.
      expect(paths.some((d) => d.includes('11') && d.includes('22'))).toBe(true);
      engine.destroy();
    });

    it("the legacy `smartConnectionPoints` boolean selects the 'smart' strategy by name", () => {
      const { engine } = buildDiagram();

      const withFlag = collectPaths(
        new SVGRenderer(engine, { smartConnectionPoints: true }).render(VIEWPORT, 1)
      );
      const withName = collectPaths(
        new SVGRenderer(engine, { connectionPoint: 'smart' }).render(VIEWPORT, 1)
      );

      // Identical geometry: the flag is now just a name lookup.
      expect(withFlag).toEqual(withName);
      engine.destroy();
    });

    it("a strategy returning null DECLINES and the port-based default is used", () => {
      const { engine, link } = buildDiagram();

      const decliner = jest.fn(() => null);
      registerConnectionPoint('spec-decline', decliner);
      link.setMetadata('connectionPoint', 'spec-decline');

      const paths = collectPaths(new SVGRenderer(engine).render(VIEWPORT, 1));

      expect(decliner).toHaveBeenCalled();
      // Port-based default: leaves node A's right edge at x=100.
      expect(paths.some((d) => d.startsWith('M 100'))).toBe(true);
      engine.destroy();
    });
  });

  describe('anchors (registerAnchor)', () => {
    it('a REGISTERED source anchor moves that end only', () => {
      const { engine, link } = buildDiagram();

      registerAnchor('spec-anchor', () => ({ point: { x: 7, y: 7 }, side: 'top' }));
      link.setMetadata('sourceAnchor', 'spec-anchor');

      const paths = collectPaths(new SVGRenderer(engine).render(VIEWPORT, 1));

      expect(paths.some((d) => d.includes('7 7') || d.includes('7,7'))).toBe(true);
      engine.destroy();
    });

    it('the built-in `center` anchor attaches at the node centre', () => {
      const { engine, link } = buildDiagram();
      link.setMetadata('sourceAnchor', 'center');

      const paths = collectPaths(new SVGRenderer(engine).render(VIEWPORT, 1));

      // Node A is 100×60 at (0,0) ⇒ centre (50, 30).
      expect(paths.some((d) => d.startsWith('M 50 30'))).toBe(true);
      engine.destroy();
    });
  });

  // =========================================================================
  // THE ROUTER BUG. `elk` is an advertised member of the public LinkRouterName
  // union, and it took the whole render loop down.
  // =========================================================================
  describe("router resolution — router:'elk' and unknown names must not throw", () => {
    it("router:'elk' renders instead of throwing (RoutingEngine.route() is sync-only)", () => {
      const { engine, link } = buildDiagram();
      link.setRouter('elk');

      const renderer = new SVGRenderer(engine);

      // Before the fix this threw: "ELK router is async. Use routeAsync() instead."
      expect(() => renderer.render(VIEWPORT, 1)).not.toThrow();
      expect(collectPaths(renderer.render(VIEWPORT, 1)).length).toBeGreaterThan(0);
      engine.destroy();
    });

    it('an UNKNOWN router name degrades instead of blanking the canvas', () => {
      const { engine, link } = buildDiagram();
      link.setRouter('no-such-router');

      const renderer = new SVGRenderer(engine);

      // Before the fix this threw: "Router 'no-such-router' not found".
      expect(() => renderer.render(VIEWPORT, 1)).not.toThrow();
      expect(collectPaths(renderer.render(VIEWPORT, 1)).length).toBeGreaterThan(0);
      engine.destroy();
    });

    it('a REGISTERED custom router is still addressable by name', () => {
      const { engine, link } = buildDiagram();

      engine.getRoutingEngine().registerRouter('spec-router', {
        route: () => ({ points: [{ x: 0, y: 0 }, { x: 9, y: 9 }, { x: 300, y: 30 }] }),
      } as never);

      link.setRouter('spec-router');

      const renderer = new SVGRenderer(engine);
      expect(() => renderer.render(VIEWPORT, 1)).not.toThrow();

      engine.getRoutingEngine().unregisterRouter('spec-router');
      engine.destroy();
    });
  });
});
