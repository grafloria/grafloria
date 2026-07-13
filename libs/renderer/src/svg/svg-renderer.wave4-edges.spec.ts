// SVGRenderer — Wave 4 (Edges & links): the END-TO-END wiring
//
// link-fanout.spec / edge-optimizer.spec pin the geometry and the incremental
// contract in isolation. These pin that the RENDERER actually calls them:
//
//   Card 4 — parallel links fan; self-loops route as loops; a lone link is
//            untouched (the no-regression guarantee).
//   Card 5 — a link template replaces the link's visuals but not its contract.
//   Card 7 — the optimizer feeds jumps and label offsets into the emitted VNode,
//            and the link VNode cache is SOUND with respect to both.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { clearEdgeTemplates, registerLinkTemplate } from './edge-templates';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };

function findVNodeByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findVNodeByKey(child, key);
    if (found) return found;
  }
  return undefined;
}

function linkGroup(root: VNode, link: LinkModel): any {
  return findVNodeByKey(root, `link-${link.id}`);
}

/** The VISIBLE link path `d` (the wide transparent hit area is skipped). */
function linkPathData(root: VNode, link: LinkModel): string {
  const group = linkGroup(root, link);
  const path = (group?.children ?? []).find(
    (c: any) => c?.type === 'path' && c.props?.className !== 'link-hit-area'
  );
  return (path?.props?.d as string) ?? '';
}

describe('SVGRenderer — Wave 4 (Edges & links)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4')!;
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
    clearEdgeTemplates();
  });

  function node(
    x: number,
    y: number,
    ports: Array<{ id: string; side: 'left' | 'right' | 'top' | 'bottom' }>
  ): NodeModel {
    const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    for (const p of ports) {
      n.addPort(new PortModel({ id: p.id, type: p.side === 'right' ? 'output' : 'input', side: p.side }));
    }
    diagram.addNode(n);
    return n;
  }

  const render = (): VNode => renderer.render(VIEWPORT, 1.0) as VNode;

  // =========================================================================
  // Card 4 — parallel links
  // =========================================================================
  describe('Card 4: parallel links', () => {
    function pair(pathType: 'direct' | 'smooth' | 'orthogonal', count: number): LinkModel[] {
      node(100, 100, [{ id: 'a', side: 'right' }]);
      node(500, 100, [{ id: 'b', side: 'left' }]);
      return Array.from({ length: count }, () => {
        const link = new LinkModel('a', 'b', pathType);
        diagram.addLink(link);
        return link;
      });
    }

    it('leaves a LONE link between a pair exactly as it was — a straight 2-point route', () => {
      // The no-regression guarantee: a single link gets lane offset 0 and is
      // never touched by the separation code.
      const [only] = pair('direct', 1);
      render();

      expect(only.points).toHaveLength(2);
      expect(only.points[0].y).toBeCloseTo(only.points[1].y);
    });

    it('fans three parallel links onto three different lanes', () => {
      const links = pair('direct', 3);
      render();

      const midY = links.map(l => l.points[Math.floor(l.points.length / 2)].y);
      expect(new Set(midY.map(y => Math.round(y))).size).toBe(3);
    });

    it('spaces the lanes by the configured spacing', () => {
      renderer.dispose();
      renderer = new SVGRenderer(engine, { parallelSpacing: 30 });

      const links = pair('direct', 2);
      render();

      // 2 links, spacing 30 ⇒ lanes at -15 and +15 ⇒ 30 apart.
      const bows = links.map(l => l.points[1].y);
      expect(Math.abs(bows[0] - bows[1])).toBeCloseTo(30, 0);
    });

    it('keeps EVERY fanned link on its ports — the endpoints never move', () => {
      const links = pair('smooth', 3);
      render();

      const starts = links.map(l => l.points[0]);
      const ends = links.map(l => l.points[l.points.length - 1]);
      for (let i = 1; i < 3; i++) {
        expect(starts[i]).toEqual(starts[0]);
        expect(ends[i]).toEqual(ends[0]);
      }
    });

    it('fans a BIDIRECTIONAL pair apart (A→B and B→A are one bundle)', () => {
      node(100, 100, [{ id: 'a', side: 'right' }]);
      node(500, 100, [{ id: 'b', side: 'left' }]);
      const forward = new LinkModel('a', 'b', 'direct');
      const backward = new LinkModel('b', 'a', 'direct');
      diagram.addLink(forward);
      diagram.addLink(backward);

      render();

      // If each link derived its bundle normal from its OWN source→target, the
      // two opposite lane offsets would cancel and both would land on the same
      // centre line. The normal has to be canonical for the PAIR.
      const f = forward.points[1];
      const b = backward.points[1];
      expect(Math.abs(f.y - b.y)).toBeGreaterThan(8);
    });

    it('keeps a fanned ORTHOGONAL route orthogonal', () => {
      const links = pair('orthogonal', 3);
      render();

      for (const link of links) {
        for (let i = 0; i < link.points.length - 1; i++) {
          const dx = Math.abs(link.points[i + 1].x - link.points[i].x);
          const dy = Math.abs(link.points[i + 1].y - link.points[i].y);
          expect(dx < 0.01 || dy < 0.01).toBe(true);
        }
      }
    });

    it('does not fan when `parallelLinks: false`', () => {
      renderer.dispose();
      renderer = new SVGRenderer(engine, { parallelLinks: false });

      const links = pair('direct', 3);
      render();

      const paths = links.map(l => JSON.stringify(l.points));
      expect(new Set(paths).size).toBe(1); // all three identical again
    });

    it('honours a per-link opt-out', () => {
      const links = pair('direct', 2);
      links[0].updateStyle({ parallel: { enabled: false } });
      render();

      // The opted-out link keeps the un-separated 2-point route…
      expect(links[0].points).toHaveLength(2);
      // …while its sibling still moves onto its lane.
      expect(links[1].points.length).toBeGreaterThan(2);
    });
  });

  // =========================================================================
  // Card 4 — self-loops
  // =========================================================================
  describe('Card 4: self-loops', () => {
    function selfLoop(
      pathType: 'direct' | 'smooth' | 'orthogonal',
      sides: ['left' | 'right' | 'top' | 'bottom', 'left' | 'right' | 'top' | 'bottom'] = ['right', 'right']
    ): { link: LinkModel; n: NodeModel } {
      const n = node(200, 200, [
        { id: 'p1', side: sides[0] },
        { id: 'p2', side: sides[1] },
      ]);
      const link = new LinkModel('p1', 'p2', pathType);
      diagram.addLink(link);
      return { link, n };
    }

    it('routes a self-loop as a LOOP, not a stub inside the node body', () => {
      const { link, n } = selfLoop('orthogonal');
      render();

      expect(link.isSelfLoop()).toBe(true);
      expect(link.points.length).toBeGreaterThanOrEqual(4);

      // It reaches clear of the node — a router-produced "route" from a node back
      // to itself could not, because every router excludes the link's own nodes
      // from its obstacle set.
      const right = n.position.x + n.size.width;
      expect(Math.max(...link.points.map(p => p.x))).toBeGreaterThan(right + 20);
    });

    it('emits a real path for every path type', () => {
      for (const pathType of ['direct', 'smooth', 'orthogonal'] as const) {
        engine.destroy();
        engine = new DiagramEngine();
        diagram = engine.createDiagram('loop')!;
        renderer.dispose();
        renderer = new SVGRenderer(engine, {});

        const { link } = selfLoop(pathType);
        const root = render();
        const d = linkPathData(root, link);

        expect(d.length).toBeGreaterThan(10);
        expect(d).not.toContain('NaN');
      }
    });

    it('nests several self-loops on one node instead of stacking them', () => {
      const n = node(200, 200, [{ id: 'p', side: 'right' }]);
      const loops = [0, 1, 2].map(() => {
        const link = new LinkModel('p', 'p', 'orthogonal');
        diagram.addLink(link);
        return link;
      });

      render();

      const reach = loops.map(l => Math.max(...l.points.map(p => p.x)));
      expect(reach[0]).toBeLessThan(reach[1]);
      expect(reach[1]).toBeLessThan(reach[2]);
      void n;
    });

    it('honours a per-link loop size', () => {
      const { link, n } = selfLoop('orthogonal');
      link.updateStyle({ selfLoop: { size: 90 } });
      render();

      const right = n.position.x + n.size.width;
      expect(Math.max(...link.points.map(p => p.x)) - right).toBeCloseTo(90, 0);
    });

    it('handles perpendicular and opposite port sides', () => {
      for (const sides of [['right', 'top'], ['right', 'left'], ['top', 'bottom']] as const) {
        engine.destroy();
        engine = new DiagramEngine();
        diagram = engine.createDiagram('loop')!;
        renderer.dispose();
        renderer = new SVGRenderer(engine, {});

        const { link } = selfLoop('orthogonal', sides as any);
        render();

        expect(link.points.length).toBeGreaterThanOrEqual(4);
        expect(link.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      }
    });

    it('is NOT also lane-offset as a parallel bundle — loops NEST, they do not FAN', () => {
      // Two self-loops on one node share a node-pair key of (A, A). If the bundle
      // grouping counted them, they would be displaced TWICE: once by nesting and
      // again by a lane offset. The guard is that self-loops are excluded from the
      // pair map entirely — so their routes are identical whether or not parallel
      // separation is switched on.
      node(200, 200, [{ id: 'p', side: 'right' }]);
      const loops = [0, 1].map(() => {
        const link = new LinkModel('p', 'p', 'orthogonal');
        diagram.addLink(link);
        return link;
      });

      render();
      const withSeparation = loops.map(l => JSON.stringify(l.points));

      renderer.dispose();
      renderer = new SVGRenderer(engine, { parallelLinks: false });
      render();
      const withoutSeparation = loops.map(l => JSON.stringify(l.points));

      expect(withoutSeparation).toEqual(withSeparation);
      // …and they still nest.
      expect(withSeparation[0]).not.toBe(withSeparation[1]);
    });
  });

  // =========================================================================
  // Card 5 — link templates
  // =========================================================================
  describe('Card 5: link templates', () => {
    function templatedLink(name: string): LinkModel {
      node(100, 100, [{ id: 'a', side: 'right' }]);
      node(500, 300, [{ id: 'b', side: 'left' }]);
      const link = new LinkModel('a', 'b', 'smooth');
      link.updateStyle({ template: name });
      diagram.addLink(link);
      return link;
    }

    it('replaces the link\'s visuals with the template\'s VNodes', () => {
      registerLinkTemplate('double', ctx => [
        { type: 'path', props: { d: ctx.pathData, className: 'under' } },
        { type: 'path', props: { d: ctx.pathData, className: 'over' } },
      ]);

      const link = templatedLink('double');
      const group = linkGroup(render(), link);

      const classes = (group.children ?? []).map((c: any) => c.props?.className);
      expect(classes).toContain('under');
      expect(classes).toContain('over');
      expect(group.props.className).toContain('link-group-templated');
    });

    it('KEEPS the hit area and the data-link-id — a template must not be able to break selection or the edge toolbar', () => {
      registerLinkTemplate('bare', () => ({ type: 'circle', props: {} }));

      const link = templatedLink('bare');
      const group = linkGroup(render(), link);

      expect(group.props['data-link-id']).toBe(link.id);
      expect((group.children ?? []).some((c: any) => c.props?.className === 'link-hit-area')).toBe(true);
    });

    it('hands the template the ROUTED points and the real path string', () => {
      let seen: any = null;
      registerLinkTemplate('probe', ctx => {
        seen = { points: ctx.points, pathData: ctx.pathData, selected: ctx.selected };
        return { type: 'g', props: {} };
      });

      templatedLink('probe');
      render();

      expect(seen.points.length).toBeGreaterThanOrEqual(2);
      expect(seen.pathData).toContain('M');
      expect(seen.selected).toBe(false);
    });

    it('falls back to the built-in rendering when the template returns null', () => {
      registerLinkTemplate('optout', () => null);

      const link = templatedLink('optout');
      const group = linkGroup(render(), link);

      expect(group.props.className).toBe('link-group');
      expect(linkPathData(render(), link)).toContain('M');
    });

    it('falls back to the built-in rendering for an UNREGISTERED template name', () => {
      const link = templatedLink('never-registered');
      const group = linkGroup(render(), link);

      expect(group.props.className).toBe('link-group');
    });
  });

  // =========================================================================
  // Card 7 — the optimizer, wired
  // =========================================================================
  describe('Card 7: the diagram-wide edge pass', () => {
    function crossing(): { main: LinkModel } {
      node(100, 200, [{ id: 'a', side: 'right' }]);
      node(500, 200, [{ id: 'b', side: 'left' }]);
      node(280, 60, [{ id: 'c', side: 'bottom' }]);
      node(280, 380, [{ id: 'd', side: 'top' }]);

      const main = new LinkModel('a', 'b', 'direct');
      main.updateStyle({
        jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
      });
      diagram.addLink(main);
      diagram.addLink(new LinkModel('c', 'd', 'direct'));
      return { main };
    }

    it('feeds jump arcs into the emitted path', () => {
      const { main } = crossing();
      render();           // frame 1 populates every link's points
      const d = linkPathData(render(), main);

      expect(d).toContain('A'); // an arc — the jump
    });

    it('produces the SAME jumps with the optimizer off (the fallback path still works)', () => {
      const { main } = crossing();
      render();
      const withOptimizer = linkPathData(render(), main);

      renderer.dispose();
      renderer = new SVGRenderer(engine, { edgeOptimizer: false });
      render();
      const withoutOptimizer = linkPathData(render(), main);

      expect(withoutOptimizer).toBe(withOptimizer);
    });

    it('places an autoOffset label clear of a node, and leaves a pinned one alone', () => {
      node(100, 200, [{ id: 'a', side: 'right' }]);
      node(500, 200, [{ id: 'b', side: 'left' }]);
      // An obstacle straddling the path's midpoint.
      diagram.addNode(
        new NodeModel({ type: 'basic', position: { x: 260, y: 200 }, size: { width: 120, height: 50 } })
      );

      const link = new LinkModel('a', 'b', 'direct');
      diagram.addLink(link);
      link.addLabel({ id: 'auto', text: 'auto', position: 0.5, offset: { x: 0, y: 0 }, autoOffset: true });
      link.addLabel({ id: 'pinned', text: 'pinned', position: 0.5, offset: { x: 0, y: 0 } });

      render();
      const root = render();
      const group = linkGroup(root, link);

      const transformOf = (labelId: string) =>
        String(findVNodeByKey(group, `link-label-${labelId}`)?.props?.transform ?? '');

      // The pinned label sits exactly on its anchor (offset {0,0}).
      const pinnedY = parseFloat(transformOf('pinned').split(',')[1]);
      const autoY = parseFloat(transformOf('auto').split(',')[1]);

      expect(Math.abs(autoY - pinnedY)).toBeGreaterThan(10);
    });

    it('marks a link dirty when a NEIGHBOUR moves, so the VNode cache cannot serve stale geometry', () => {
      // Latent bug: link VNodes are cached on `!link.isDirty`, but nothing marked
      // a link dirty when its endpoint node moved, or when the links crossing it
      // did. A cached link kept drawing yesterday's route and yesterday's jump arcs.
      const { main } = crossing();
      render();
      const before = linkPathData(render(), main);

      // Move the crossing link's node out of the way — `main` itself is untouched.
      const c = diagram.getNodes().find(n => !!n.getPort('c'))!;
      c.setPosition(900, 60);
      const d2 = diagram.getNodes().find(n => !!n.getPort('d'))!;
      d2.setPosition(900, 380);

      render();
      const after = linkPathData(render(), main);

      expect(after).not.toBe(before);
      expect(after).not.toContain('A'); // the jump arc is gone with the crossing
    });
  });
});
