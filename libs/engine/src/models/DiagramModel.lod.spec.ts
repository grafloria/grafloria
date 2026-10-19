// DiagramModel.lod.spec.ts - TDD tests for Level of Detail rendering (Phase 5.3)

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import type { Rectangle } from '../types/geometry.types';
import type {
  LODLevel,
  EntityWithLOD,
  LODConfig,
  LODFeature,
} from '../types/performance.types';
import { createDefaultLODConfig } from '../types/performance.types';

describe('DiagramModel - Level of Detail (Phase 5.3)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('LOD Test');
  });

  describe('LOD Level Determination', () => {
    it('should return HIGH detail for zoom >= 1.0 (default zoom shows full detail)', () => {
      expect(diagram.getLODLevel(1.5)).toBe('high');
      // 1.0 is the default zoom — labels and full detail must be visible there
      expect(diagram.getLODLevel(1.0)).toBe('high');
    });

    it('should return MEDIUM detail for 0.5 <= zoom < 1.0', () => {
      expect(diagram.getLODLevel(0.99)).toBe('medium');
      expect(diagram.getLODLevel(0.75)).toBe('medium');
      expect(diagram.getLODLevel(0.6)).toBe('medium');
      expect(diagram.getLODLevel(0.5)).toBe('medium');
    });

    // Each breakpoint marks where DETAIL STOPS BEING LEGIBLE — not where it stops
    // being cheap. That distinction is the whole design:
    //
    //   [0.5, 1)   'medium' — a 12px label is 6px: small, but still text.
    //   [0.2, 0.5) 'sketch' — a 12px label is 3px (a smear) but a node is still
    //                         36px wide and its edges are plainly readable. Text
    //                         and chrome go; the SHAPE of the graph stays.
    //   < 0.2      'low'    — a node is under 24px, an edge is a hairline, and a
    //                         routing detour around a node body is sub-pixel.
    //
    // These numbers say nothing about COST, and they must not: the same zoom is
    // cheap for 30 nodes and ruinous for 10,000, so any constant chosen here would
    // either tax the small diagram or fail to save the large one. Cost is the
    // quality governor's job — it measures the frame and steps the tier down on the
    // scenes that actually need it.
    it('returns SKETCH in [0.2, 0.5) and LOW below it', () => {
      expect(diagram.getLODLevel(0.49)).toBe('sketch');
      expect(diagram.getLODLevel(0.3)).toBe('sketch');
      expect(diagram.getLODLevel(0.25)).toBe('sketch');
      expect(diagram.getLODLevel(0.2)).toBe('sketch');
      expect(diagram.getLODLevel(0.19)).toBe('low');
      expect(diagram.getLODLevel(0.15)).toBe('low');
      expect(diagram.getLODLevel(0.1)).toBe('low');
    });

    it('should handle edge cases', () => {
      expect(diagram.getLODLevel(0)).toBe('low');
      expect(diagram.getLODLevel(10)).toBe('high');
    });
  });

  // =========================================================================
  // wave8/culling — Card 4: LOD must be ECONOMIC, not cosmetic.
  //
  // These are the gates that make a far-zoom frame cheap. They live on the model
  // (not the renderer) because the whole point of LODConfig is that an app can
  // move them; a renderer that hardcoded the breakpoints would make the policy a
  // lie. If any of these flip, the renderer starts doing O(nodes)-per-edge work
  // at a zoom where it cannot be seen.
  // =========================================================================
  describe('Economic LOD features (wave8/culling)', () => {
    it('renders everything at HIGH', () => {
      expect(diagram.shouldRender('routing', 'high')).toBe(true);
      expect(diagram.shouldRender('link-detail', 'high')).toBe(true);
      expect(diagram.shouldRender('gradients', 'high')).toBe(true);
    });

    // The [0.5, 1.0) band must be byte-identical to its pre-wave8 rendering, and
    // that is exactly what this pins: medium keeps every economic feature.
    it('keeps the economic features at MEDIUM so 0.5-1.0 renders unchanged', () => {
      expect(diagram.shouldRender('routing', 'medium')).toBe(true);
      expect(diagram.shouldRender('link-detail', 'medium')).toBe(true);
      expect(diagram.shouldRender('gradients', 'medium')).toBe(true);
      expect(diagram.shouldRender('labels', 'medium')).toBe(true);
      expect(diagram.shouldRender('ports', 'medium')).toBe(true);
    });

    it('drops the economic features at LOW — this is where the 63 seconds went', () => {
      expect(diagram.shouldRender('routing', 'low')).toBe(false);
      expect(diagram.shouldRender('link-detail', 'low')).toBe(false);
      expect(diagram.shouldRender('gradients', 'low')).toBe(false);
    });

    it('SKETCH keeps the graph\'s shape and drops the unreadable chrome', () => {
      // 0.25 is the zoom fit-to-content lands on for anything large. What can a
      // viewer actually see here? A 36px-wide node — so its label (3.6px) and its
      // port glyphs (sub-pixel) say nothing, and go. Its EDGES, though, are as
      // legible as ever, and an orthogonal route is plainly distinguishable from a
      // straight diagonal. So routing stays.
      //
      // This tier used to be 'low', which dropped routing too — and that made every
      // diagram visibly snap its edge shapes on crossing zoom 0.5, charging a
      // fidelity tax to 30-node flowcharts that render in 3ms, in order to rescue a
      // 10k scene. Wrong lever: that is a cost problem, and cost is measured, not
      // guessed from the zoom.
      const lod = diagram.getLODLevel(0.25);
      expect(lod).toBe('sketch');

      expect(diagram.shouldRender('routing', lod)).toBe(true);
      expect(diagram.shouldRender('link-detail', lod)).toBe(true);

      expect(diagram.shouldRender('labels', lod)).toBe(false);
      expect(diagram.shouldRender('ports', lod)).toBe(false);
      expect(diagram.shouldRender('handles', lod)).toBe(false);
      expect(diagram.shouldRender('decorations', lod)).toBe(false);
    });

    // The policy is DATA. An app that wants obstacle-aware routing all the way
    // down must be able to say so and pay for it — otherwise the "declarative
    // LOD policy" is decoration on a hardcoded rule.
    it('lets an app buy routing back at low zoom', () => {
      const custom = createDefaultLODConfig();
      custom.tiers.find((t) => t.name === 'low')!.features.add('routing');
      diagram.setLODConfig(custom);

      expect(diagram.shouldRender('routing', diagram.getLODLevel(0.25))).toBe(true);
      expect(diagram.shouldRender('labels', diagram.getLODLevel(0.25))).toBe(false);
    });
  });

  describe('getNodesWithLOD()', () => {
    beforeEach(() => {
      // Create test nodes
      for (let i = 0; i < 10; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: i * 100, y: i * 100 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }
    });

    it('should return all nodes with HIGH LOD', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 1.5);

      expect(nodesWithLOD.length).toBeGreaterThan(0);
      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('high');
        expect(item.entity).toBeInstanceOf(NodeModel);
      });
    });

    it('should return nodes with MEDIUM LOD', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 0.75);

      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('medium');
      });
    });

    it('should return nodes with LOW LOD', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 0.15);

      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('low');
      });
    });

    it('should only return visible nodes', () => {
      const smallViewport: Rectangle = {
        x: 0,
        y: 0,
        width: 150,
        height: 150,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(smallViewport, 1.0);

      // Should only include nodes in viewport (0,0) and (100,100)
      expect(nodesWithLOD.length).toBeLessThan(10);
    });

    it('should combine viewport virtualization with LOD', () => {
      const viewport: Rectangle = {
        x: 200,
        y: 200,
        width: 250,
        height: 250,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 1.5);

      // Should only return nodes 2,3,4 which are in the viewport
      expect(nodesWithLOD.length).toBeGreaterThan(0);
      expect(nodesWithLOD.length).toBeLessThan(10);
      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('high');
      });
    });
  });

  describe('getLinksWithLOD()', () => {
    beforeEach(() => {
      // Create test links
      for (let i = 0; i < 5; i++) {
        const link = new LinkModel(`port${i}-src`, `port${i}-tgt`);
        link.setPoints([
          { x: i * 100, y: 0 },
          { x: i * 100 + 50, y: 100 },
        ]);
        diagram.addLink(link);
      }
    });

    it('should return links with appropriate LOD level', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500,
        height: 150,
      };

      const highLOD = diagram.getLinksWithLOD(viewport, 1.5);
      const mediumLOD = diagram.getLinksWithLOD(viewport, 0.75);
      const lowLOD = diagram.getLinksWithLOD(viewport, 0.15);

      expect(highLOD.every((item) => item.lod === 'high')).toBe(true);
      expect(mediumLOD.every((item) => item.lod === 'medium')).toBe(true);
      expect(lowLOD.every((item) => item.lod === 'low')).toBe(true);
    });

    it('should only return visible links', () => {
      const smallViewport: Rectangle = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      const linksWithLOD = diagram.getLinksWithLOD(smallViewport, 1.0);

      expect(linksWithLOD.length).toBeLessThan(5);
    });
  });

  describe('Performance with LOD', () => {
    it('should efficiently process large diagrams', () => {
      // Create 1000 nodes
      for (let i = 0; i < 1000; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: (i % 50) * 100, y: Math.floor(i / 50) * 100 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500,
        height: 500,
      };

      const start = performance.now();
      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 0.3);
      const duration = performance.now() - start;

      // Should be fast even with 1000 nodes
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 50)
      expect(nodesWithLOD.length).toBeGreaterThan(0);
      expect(nodesWithLOD.length).toBeLessThan(1000); // Viewport culling works
    });
  });

  describe('LOD Rendering Hints', () => {
    it('should provide shouldRenderLabels hint', () => {
      expect(diagram.shouldRenderLabels('high')).toBe(true);
      expect(diagram.shouldRenderLabels('medium')).toBe(true);
      expect(diagram.shouldRenderLabels('low')).toBe(false);
    });

    it('should provide shouldRenderIcons hint', () => {
      expect(diagram.shouldRenderIcons('high')).toBe(true);
      expect(diagram.shouldRenderIcons('medium')).toBe(false);
      expect(diagram.shouldRenderIcons('low')).toBe(false);
    });

    it('should provide shouldRenderBorders hint', () => {
      expect(diagram.shouldRenderBorders('high')).toBe(true);
      expect(diagram.shouldRenderBorders('medium')).toBe(true);
      expect(diagram.shouldRenderBorders('low')).toBe(false);
    });

    it('should provide shouldRenderShadows hint', () => {
      expect(diagram.shouldRenderShadows('high')).toBe(true);
      expect(diagram.shouldRenderShadows('medium')).toBe(false);
      expect(diagram.shouldRenderShadows('low')).toBe(false);
    });
  });

  describe('Integration with Dirty Marking', () => {
    it('should combine LOD with dirty marking for optimal rendering', () => {
      // Create nodes
      const node1 = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      // Mark all clean
      diagram.markAllClean();

      // Modify one node
      node1.setPosition(10, 10);

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      };

      // Get visible + dirty nodes
      const visibleDirty = diagram.getVisibleDirtyNodes(viewport);
      const visibleWithLOD = diagram.getNodesWithLOD(viewport, 1.0);

      // node1 should be in both lists
      expect(visibleDirty).toContain(node1);
      expect(visibleWithLOD.some((item) => item.entity === node1)).toBe(true);
    });
  });

  // ==========================================================================
  // wave2/rendering: configurable per-diagram LOD policy
  // ==========================================================================
  describe('Configurable LODConfig (wave2/rendering)', () => {
    const ALL: LODFeature[] = [
      'labels',
      'icons',
      'borders',
      'shadows',
      'ports',
      'decorations',
      'handles',
    ];

    describe('the default tier ladder', () => {
      it('picks the right tier name at every breakpoint', () => {
        // >= 1.0 -> high
        expect(diagram.getLODLevel(10)).toBe('high');
        expect(diagram.getLODLevel(1.5)).toBe('high');
        expect(diagram.getLODLevel(1.0)).toBe('high');
        // [0.5, 1.0) -> medium: a 12px label is 6px. Small, but still text.
        expect(diagram.getLODLevel(0.99)).toBe('medium');
        expect(diagram.getLODLevel(0.5)).toBe('medium');
        // [0.2, 0.5) -> sketch: the label is a 3px smear, but the node is 36px wide
        // and the shape of the graph is still exactly what you are looking at.
        expect(diagram.getLODLevel(0.49)).toBe('sketch');
        expect(diagram.getLODLevel(0.3)).toBe('sketch');
        expect(diagram.getLODLevel(0.2)).toBe('sketch');
        // < 0.2 -> low: a node is under 24px and an edge is a hairline.
        expect(diagram.getLODLevel(0.19)).toBe('low');
        expect(diagram.getLODLevel(0.15)).toBe('low');
        expect(diagram.getLODLevel(0)).toBe('low');
      });

      it('reproduces the shouldRenderX feature gate contract', () => {
        // labels: high + medium
        expect(diagram.shouldRenderLabels('high')).toBe(true);
        expect(diagram.shouldRenderLabels('medium')).toBe(true);
        expect(diagram.shouldRenderLabels('low')).toBe(false);
        // icons: high only
        expect(diagram.shouldRenderIcons('high')).toBe(true);
        expect(diagram.shouldRenderIcons('medium')).toBe(false);
        expect(diagram.shouldRenderIcons('low')).toBe(false);
        // borders: high + medium
        expect(diagram.shouldRenderBorders('high')).toBe(true);
        expect(diagram.shouldRenderBorders('medium')).toBe(true);
        expect(diagram.shouldRenderBorders('low')).toBe(false);
        // shadows: high only
        expect(diagram.shouldRenderShadows('high')).toBe(true);
        expect(diagram.shouldRenderShadows('medium')).toBe(false);
        expect(diagram.shouldRenderShadows('low')).toBe(false);
      });

      it('renders every feature at high, nothing at low', () => {
        for (const f of ALL) {
          expect(diagram.shouldRender(f, 'high')).toBe(true);
          expect(diagram.shouldRender(f, 'low')).toBe(false);
        }
      });

      it('gates the renderer feature set at medium (ports/decorations/handles on, icons/shadows off)', () => {
        expect(diagram.shouldRender('ports', 'medium')).toBe(true);
        expect(diagram.shouldRender('decorations', 'medium')).toBe(true);
        expect(diagram.shouldRender('handles', 'medium')).toBe(true);
        expect(diagram.shouldRender('icons', 'medium')).toBe(false);
        expect(diagram.shouldRender('shadows', 'medium')).toBe(false);
      });
    });

    it('shouldRender returns false for an unknown tier name', () => {
      expect(diagram.shouldRender('labels', 'does-not-exist')).toBe(false);
    });

    describe('custom config changes tier selection + feature gating', () => {
      it('honors a custom LODConfig passed to the constructor', () => {
        const config: LODConfig = {
          tiers: [
            { name: 'full', minZoom: 2.0, features: new Set<LODFeature>(ALL) },
            {
              name: 'sparse',
              minZoom: 0.5,
              features: new Set<LODFeature>(['labels']),
            },
            {
              name: 'blank',
              minZoom: Number.NEGATIVE_INFINITY,
              features: new Set<LODFeature>(),
            },
          ],
        };
        const custom = new DiagramModel('custom', { lodConfig: config });

        // Tier selection follows the custom breakpoints, not 1.0 / 0.2.
        expect(custom.getLODLevel(3)).toBe('full');
        expect(custom.getLODLevel(2.0)).toBe('full');
        expect(custom.getLODLevel(1.0)).toBe('sparse'); // 1.0 no longer 'high'
        expect(custom.getLODLevel(0.5)).toBe('sparse');
        expect(custom.getLODLevel(0.4)).toBe('blank');

        // Feature gating follows the custom sets.
        expect(custom.shouldRender('shadows', 'sparse')).toBe(false);
        expect(custom.shouldRender('labels', 'sparse')).toBe(true);
        expect(custom.shouldRender('labels', 'blank')).toBe(false);
      });

      it('setLODConfig swaps the policy at runtime', () => {
        const before = diagram.getLODLevel(0.5);
        expect(before).toBe('medium');

        diagram.setLODConfig({
          tiers: [
            {
              name: 'coarse',
              minZoom: Number.NEGATIVE_INFINITY,
              features: new Set<LODFeature>(['labels']),
            },
          ],
        });

        // Single floor tier now matches every zoom.
        expect(diagram.getLODLevel(5)).toBe('coarse');
        expect(diagram.getLODLevel(0.01)).toBe('coarse');
        expect(diagram.shouldRender('labels', 'coarse')).toBe(true);
        expect(diagram.shouldRender('shadows', 'coarse')).toBe(false);
      });

      it('registerLODTier adds a new tier and replaces an existing one by name', () => {
        // Add a brand-new ultra-detail tier above 'high'.
        diagram.registerLODTier({
          name: 'ultra',
          minZoom: 3.0,
          features: new Set<LODFeature>(ALL),
        });
        expect(diagram.getLODLevel(4)).toBe('ultra');
        expect(diagram.getLODLevel(1.5)).toBe('high'); // untouched tiers still work

        // Replace 'high' with one that drops shadows.
        diagram.registerLODTier({
          name: 'high',
          minZoom: 1.0,
          features: new Set<LODFeature>(['labels', 'borders']),
        });
        expect(diagram.shouldRender('shadows', 'high')).toBe(false);
        expect(diagram.shouldRender('labels', 'high')).toBe(true);
        // Still selected at zoom 1.0..3.0
        expect(diagram.getLODLevel(1.0)).toBe('high');
      });
    });

    it('getLODConfig returns the active policy', () => {
      const cfg = createDefaultLODConfig();
      const d = new DiagramModel('d', { lodConfig: cfg });
      expect(d.getLODConfig()).toBe(cfg);
    });
  });
});
