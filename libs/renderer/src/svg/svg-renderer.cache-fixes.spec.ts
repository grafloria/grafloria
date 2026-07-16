// Wave 1 rendering foundation — cache-correctness fixes:
//  FIX 1: link vnode cache key includes the LOD tier (was `link-${id}`),
//         so a clean link crossing an LOD threshold on zoom serves a FRESH
//         vnode instead of a stale wrong-LOD one.
//  FIX 2: the vnode cache is a bounded LRU honoring config.maxCacheSize
//         (was an unbounded Map).

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { VNode, Rectangle } from '../types';

const VIEWPORT: Rectangle = { x: 0, y: 0, width: 800, height: 600 };

describe('SVGRenderer - cache-correctness fixes', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Cache Fix Test');
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function addConnectedPair(): LinkModel {
    const n1 = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } });
    const n2 = new NodeModel({ type: 'basic', position: { x: 300, y: 100 }, size: { width: 100, height: 60 } });
    n1.addPort(new PortModel({ id: 'src', type: 'output', side: 'right' }));
    n2.addPort(new PortModel({ id: 'dst', type: 'input', side: 'left' }));
    diagram.addNode(n1);
    diagram.addNode(n2);

    const link = new LinkModel('src', 'dst');
    link.setMetadata('label', 'edge');
    diagram.addLink(link);
    return link;
  }

  function linkVNodeFrom(root: VNode): VNode {
    const linksLayer = root.children![0];
    expect(linksLayer.props.className).toContain('links-layer');
    return linksLayer.children![0];
  }

  describe('FIX 1 — LOD-keyed link cache', () => {
    test('a clean link crossing an LOD threshold serves a fresh, correct-LOD vnode', () => {
      renderer = new SVGRenderer(engine, { enableCaching: true });
      const link = addConnectedPair();

      // High LOD (zoom >= 1.0): arrows + label rendered.
      const high = linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode);
      // Link is now clean (renderLink marked it clean after caching).
      expect(link.isDirty).toBe(false);

      // Low LOD (zoom <= 0.2) WITHOUT re-dirtying: must NOT reuse the cached
      // high-LOD vnode. With the old `link-${id}` key this returned the SAME
      // object (arrows/label included) — the stale-serve bug.
      const low = linkVNodeFrom(renderer.render(VIEWPORT, 0.15) as VNode);

      expect(low).not.toBe(high); // fresh object, not the stale high-LOD one
      // Low LOD strips arrows and labels, so it has strictly fewer children.
      expect(low.children!.length).toBeLessThan(high.children!.length);
    });

    test('re-rendering at the same LOD still returns the cached vnode (caching intact)', () => {
      renderer = new SVGRenderer(engine, { enableCaching: true });
      addConnectedPair();

      const first = linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode);
      const second = linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode);

      expect(second).toBe(first); // same LOD -> same cached object
    });

    test('returning to the original LOD serves a correct-LOD vnode again', () => {
      renderer = new SVGRenderer(engine, { enableCaching: true });
      addConnectedPair();

      const high1 = linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode);
      const low = linkVNodeFrom(renderer.render(VIEWPORT, 0.15) as VNode);
      const high2 = linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode);

      // Coming back to high LOD yields the richer vnode again (not the low one).
      expect(high2.children!.length).toBe(high1.children!.length);
      expect(high2.children!.length).toBeGreaterThan(low.children!.length);
    });
  });

  describe('FIX 2 — bounded LRU vnode cache (maxCacheSize enforced)', () => {
    test('cache never grows beyond maxCacheSize', () => {
      const maxCacheSize = 3;
      renderer = new SVGRenderer(engine, { enableCaching: true, maxCacheSize });

      // Add many distinct nodes so the cache would blow past capacity if
      // eviction were not enforced.
      for (let i = 0; i < 25; i++) {
        diagram.addNode(
          new NodeModel({
            type: 'basic',
            position: { x: (i % 5) * 120, y: Math.floor(i / 5) * 90 },
            size: { width: 80, height: 50 },
          })
        );
      }

      renderer.render({ x: 0, y: 0, width: 2000, height: 2000 }, 1.0);

      const cacheSize = (renderer as unknown as { vnodeCache: { size: number } }).vnodeCache.size;
      expect(cacheSize).toBeLessThanOrEqual(maxCacheSize);
    });

    test('respects a custom maxCacheSize across repeated renders', () => {
      const maxCacheSize = 5;
      renderer = new SVGRenderer(engine, { enableCaching: true, maxCacheSize });

      for (let i = 0; i < 40; i++) {
        diagram.addNode(
          new NodeModel({
            type: 'basic',
            position: { x: (i % 8) * 100, y: Math.floor(i / 8) * 80 },
            size: { width: 70, height: 40 },
          })
        );
      }

      const bigViewport = { x: 0, y: 0, width: 4000, height: 4000 };
      renderer.render(bigViewport, 1.0);
      renderer.render(bigViewport, 1.0);

      const cacheSize = (renderer as unknown as { vnodeCache: { size: number } }).vnodeCache.size;
      expect(cacheSize).toBeLessThanOrEqual(maxCacheSize);
    });
  });

  // FIX 3: FIX 1 keyed the cache per LOD, but a SINGLE dirty flag guarded all
  // of an entity's per-LOD entries: rebuilding one tier and marking the entity
  // clean left every OTHER tier's entry stale, so a geometry change resurfaced
  // its PRE-change picture on the next LOD flip. Live report: "click force
  // then dagre — the diagram is destroyed" — the painted edges after each
  // layout+fitView (fitView flips the LOD tier) were the PREVIOUS layout's
  // routes. The cache write now evicts the entity's whole key set whenever it
  // rebuilds a dirty entity.
  describe('FIX 3 — a dirty rebuild evicts the entity across ALL LOD tiers', () => {
    const dOf = (linkVNode: VNode): string => {
      const walk = (vn: VNode): string | null => {
        if (vn.props?.d && String(vn.props.className ?? '').includes('diagram-link')) return vn.props.d as string;
        for (const c of vn.children ?? []) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      return walk(linkVNode) ?? '';
    };

    test('a moved link does not resurface its old geometry on an LOD flip', () => {
      renderer = new SVGRenderer(engine, { enableCaching: true });
      const link = addConnectedPair();

      // Populate BOTH tiers' cache entries at the original geometry.
      const highBefore = dOf(linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode));
      const lowBefore = dOf(linkVNodeFrom(renderer.render(VIEWPORT, 0.15) as VNode));

      // Move the target node far enough that every tier's route must change.
      diagram.getNode(link.targetNodeId!)!.setPosition(600, 400);

      // Rebuild at ONE tier (this cleans the link)…
      const highAfter = dOf(linkVNodeFrom(renderer.render(VIEWPORT, 1.5) as VNode));
      expect(highAfter).not.toBe(highBefore);
      expect(link.isDirty).toBe(false);

      // …then flip tiers while CLEAN: the old code served lowBefore verbatim
      // (the stale pre-move route); the eviction makes this a rebuild.
      const lowAfter = dOf(linkVNodeFrom(renderer.render(VIEWPORT, 0.15) as VNode));
      expect(lowAfter).not.toEqual(lowBefore);
    });

    test('a moved node does not resurface its old geometry on an LOD flip', () => {
      renderer = new SVGRenderer(engine, { enableCaching: true });
      const node = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } });
      diagram.addNode(node);

      const nodeVNodeFrom = (root: VNode): VNode => {
        const walk = (vn: VNode): VNode | null => {
          if (String(vn.key ?? '').startsWith('node-')) return vn;
          for (const c of vn.children ?? []) { const hit = walk(c); if (hit) return hit; }
          return null;
        };
        return walk(root)!;
      };
      const transformOf = (vn: VNode): string => String(vn.props?.transform ?? '');

      renderer.render(VIEWPORT, 1.5);
      const lowBefore = transformOf(nodeVNodeFrom(renderer.render(VIEWPORT, 0.15) as VNode));

      node.setPosition(500, 300);
      renderer.render(VIEWPORT, 1.5); // rebuild at high, cleans the node

      const lowAfter = transformOf(nodeVNodeFrom(renderer.render(VIEWPORT, 0.15) as VNode));
      expect(lowAfter).not.toEqual(lowBefore);
      expect(lowAfter).toContain('500');
    });
  });
});
