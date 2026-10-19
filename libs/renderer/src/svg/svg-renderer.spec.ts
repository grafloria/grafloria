import { SVGRenderer, GRAFLORIA_BASE_STYLE_ID } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { LODFeature } from '@grafloria/engine';
import { LIGHT_THEME, DARK_THEME } from '../themes';
import type { VNode, Rectangle } from '../types';

describe('SVGRenderer', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test Diagram');
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  describe('Initialization', () => {
    test('should create renderer with engine and config', () => {
      renderer = new SVGRenderer(engine, {});

      expect(renderer).toBeDefined();
      expect(renderer.mode).toBe('svg');
    });

    test('should use light theme by default', () => {
      renderer = new SVGRenderer(engine, {});

      expect(renderer.getTheme().name).toBe('Light');
    });

    test('should accept custom theme in constructor', () => {
      renderer = new SVGRenderer(engine, {}, DARK_THEME);

      expect(renderer.getTheme().name).toBe('Dark');
    });

    test('should enable CSS mode by default', () => {
      renderer = new SVGRenderer(engine, {});

      // CSS mode is default - should inject this instance's variable block, plus
      // the shared (theme-independent) rules. The element id is PER-INSTANCE, so
      // two diagrams can no longer overwrite each other's stylesheet.
      const styleElement = document.getElementById(renderer.getStyleElementId());
      expect(styleElement).toBeTruthy();
      expect(styleElement!.id).toContain(renderer.getInstanceId());
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBeTruthy();
    });

    test('should support programmatic mode', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: false });

      // Programmatic mode - no style injection at all
      expect(document.getElementById(renderer.getStyleElementId())).toBeNull();
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBeNull();
    });
  });

  describe('Basic Rendering', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {});
    });

    test('should render empty diagram with root SVG and layers', () => {
      const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      expect(vnode.type).toBe('svg');
      // width/height are CSS-controlled (100%) — the viewBox carries the size
      expect(vnode.props['viewBox']).toBe('0 0 1920 1080');
      // links + nodes + connection preview + paint-server <defs> (appended last)
      expect(vnode.children).toHaveLength(4);
      expect(vnode.children![3].type).toBe('defs');
    });

    test('should create links layer and nodes layer', () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const linksLayer = vnode.children![0];
      const nodesLayer = vnode.children![1];

      expect(linksLayer.type).toBe('g');
      expect(linksLayer.props.className).toContain('links-layer');
      expect(nodesLayer.type).toBe('g');
      expect(nodesLayer.props.className).toContain('nodes-layer');
    });

    test('should return VNode tree for SVG mode', () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const result = renderer.render(viewport, 1.0);

      expect(result).toBeDefined();
      expect((result as VNode).type).toBe('svg');
    });
  });

  describe('Engine Integration - Viewport Virtualization', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {});
    });

    test('should only render visible nodes using engine SpatialIndex', () => {
      // Add nodes: one visible, one outside viewport
      const visibleNode = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 50 }
      });

      const outsideNode = new NodeModel({
        type: 'basic',
        position: { x: -500, y: -500 },
        size: { width: 100, height: 50 }
      });

      diagram.addNode(visibleNode);
      diagram.addNode(outsideNode);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const nodesLayer = vnode.children![1];

      // Only visibleNode should be rendered
      expect(nodesLayer.children).toHaveLength(1);
      expect(nodesLayer.children![0].key).toBe(`node-${visibleNode.id}`);
    });

    test('should render all nodes when viewport is large', () => {
      const node1 = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      const node2 = new NodeModel({ type: 'basic', position: { x: 500, y: 500 } });
      const node3 = new NodeModel({ type: 'basic', position: { x: 1000, y: 1000 } });

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);

      // Large viewport that includes all nodes
      const viewport = { x: 0, y: 0, width: 2000, height: 2000 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const nodesLayer = vnode.children![1];
      expect(nodesLayer.children).toHaveLength(3);
    });

    test('should cull links whose geometry misses the viewport entirely', () => {
      const node1 = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      const node2 = new NodeModel({ type: 'basic', position: { x: 200, y: 200 } });
      // Both far off-screen: the link between them never touches the viewport.
      const far1 = new NodeModel({ type: 'basic', position: { x: -5000, y: -5000 } });
      const far2 = new NodeModel({ type: 'basic', position: { x: -4800, y: -4800 } });

      node1.addPort(new PortModel({ id: 'port1', type: 'output', side: 'right' }));
      node2.addPort(new PortModel({ id: 'port2', type: 'input', side: 'left' }));
      far1.addPort(new PortModel({ id: 'far1-out', type: 'output', side: 'right' }));
      far2.addPort(new PortModel({ id: 'far2-in', type: 'input', side: 'left' }));

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(far1);
      diagram.addNode(far2);

      const visibleLink = new LinkModel('port1', 'port2');
      const offscreenLink = new LinkModel('far1-out', 'far2-in');

      diagram.addLink(visibleLink);
      diagram.addLink(offscreenLink);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const linksLayer = vnode.children![0];

      expect(linksLayer.children).toHaveLength(1);
      expect(linksLayer.children![0].key).toBe(`link-${visibleLink.id}`);
    });

    /**
     * Culling is geometric, not "are both endpoint nodes visible?".
     *
     * A long edge crossing the screen used to VANISH as soon as its two nodes
     * scrolled off — the renderer culled links whose endpoint nodes were not in
     * the viewport, which is exactly the wrong test for an edge that spans it.
     */
    test('should render a link whose endpoints are BOTH off-screen but whose path crosses the viewport', () => {
      // Viewport is (0,0)-(800,600). Both nodes sit outside it, left and right,
      // but the edge between them runs straight through the middle of the screen.
      const left = new NodeModel({
        type: 'basic',
        position: { x: -900, y: 300 },
        size: { width: 100, height: 50 },
      });
      const right = new NodeModel({
        type: 'basic',
        position: { x: 1600, y: 300 },
        size: { width: 100, height: 50 },
      });

      left.addPort(new PortModel({ id: 'left-out', type: 'output', side: 'right' }));
      right.addPort(new PortModel({ id: 'right-in', type: 'input', side: 'left' }));

      diagram.addNode(left);
      diagram.addNode(right);

      const crossingLink = new LinkModel('left-out', 'right-in');
      diagram.addLink(crossingLink);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // Neither endpoint node is visible...
      expect(diagram.getVisibleNodes(viewport)).toHaveLength(0);

      // ...but the edge crosses the viewport, so it must still be drawn.
      const vnode = renderer.render(viewport, 1.0) as VNode;
      const linksLayer = vnode.children![0];

      expect(linksLayer.children).toHaveLength(1);
      expect(linksLayer.children![0].key).toBe(`link-${crossingLink.id}`);
    });

    test('should render a link with only ONE endpoint on-screen', () => {
      const onScreen = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      const offScreen = new NodeModel({ type: 'basic', position: { x: -900, y: -900 } });

      onScreen.addPort(new PortModel({ id: 'on-out', type: 'output', side: 'right' }));
      offScreen.addPort(new PortModel({ id: 'off-in', type: 'input', side: 'left' }));

      diagram.addNode(onScreen);
      diagram.addNode(offScreen);

      const link = new LinkModel('on-out', 'off-in');
      diagram.addLink(link);

      const vnode = renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0) as VNode;

      // The stub leaving the visible node must be drawn, not culled with its node.
      expect(vnode.children![0].children).toHaveLength(1);
      expect(vnode.children![0].children![0].key).toBe(`link-${link.id}`);
    });

    test('should keep culling correct after a node moves (index is not stale)', () => {
      const a = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      const b = new NodeModel({ type: 'basic', position: { x: 300, y: 100 } });
      a.addPort(new PortModel({ id: 'a-out', type: 'output', side: 'right' }));
      b.addPort(new PortModel({ id: 'b-in', type: 'input', side: 'left' }));
      diagram.addNode(a);
      diagram.addNode(b);
      const link = new LinkModel('a-out', 'b-in');
      diagram.addLink(link);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const linkCount = (vp: typeof viewport) =>
        (renderer.render(vp, 1.0) as VNode).children![0].children!.length;

      expect(linkCount(viewport)).toBe(1);

      // Move both nodes far away.
      a.setPosition(5000, 5000);
      b.setPosition(5200, 5000);

      // The link's cull box is the union of its LIVE endpoints and its last routed
      // points, so for one frame it still spans the old route → it is drawn (the
      // safe direction: an over-wide box over-renders, an under-wide one makes
      // edges vanish). Rendering it re-routes it, which re-indexes it...
      renderer.render(viewport, 1.0);

      // ...so from the next frame on it is correctly culled.
      expect(linkCount(viewport)).toBe(0);

      // And it reappears when the viewport follows the nodes.
      expect(linkCount({ x: 4800, y: 4800, width: 800, height: 600 })).toBe(1);
    });
  });

  describe('Engine Integration - Dirty Marking', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, { enableCaching: true });
    });

    test('should cache VNode for clean entities', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // First render - creates VNode
      const vnode1 = renderer.render(viewport, 1.0) as VNode;
      const nodeVNode1 = vnode1.children![1].children![0];

      // Mark clean
      node.markClean();

      // Second render - should use cached VNode (same reference)
      const vnode2 = renderer.render(viewport, 1.0) as VNode;
      const nodeVNode2 = vnode2.children![1].children![0];

      expect(nodeVNode1).toBe(nodeVNode2); // Same object reference = cached
    });

    test('should regenerate VNode for dirty entities', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // First render
      renderer.render(viewport, 1.0);
      node.markClean();

      // Modify node (marks dirty automatically)
      node.setPosition(150, 150);

      // Second render - should regenerate VNode
      const vnode2 = renderer.render(viewport, 1.0) as VNode;
      const nodeVNode2 = vnode2.children![1].children![0];

      // Check that new position is reflected
      expect(nodeVNode2.props.transform).toContain('translate(150');
    });

    test('should skip rendering clean entities when disabled', () => {
      renderer = new SVGRenderer(engine, { enableCaching: false });

      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // First render
      const vnode1 = renderer.render(viewport, 1.0) as VNode;
      node.markClean();

      // Second render - should regenerate even if clean (caching disabled)
      const vnode2 = renderer.render(viewport, 1.0) as VNode;

      expect(vnode1).not.toBe(vnode2); // Different instances
    });
  });

  describe('Engine Integration - LOD System', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {});
    });

    test('should use engine LOD system for zoom levels', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      node.setMetadata('label', 'Test Node');
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // High LOD (zoom > 1.0) - should render labels
      const vnodeHigh = renderer.render(viewport, 1.5) as VNode;
      const nodeHigh = vnodeHigh.children![1].children![0];
      const hasLabel = nodeHigh.children?.some(child => child.type === 'text');
      expect(hasLabel).toBe(true);

      // Low LOD (zoom <= 0.2) - should NOT render labels
      const vnodeLow = renderer.render(viewport, 0.15) as VNode;
      const nodeLow = vnodeLow.children![1].children![0];
      const hasLabelLow = nodeLow.children?.some(child => child.type === 'text');
      expect(hasLabelLow).toBe(false);
    });

    test('should query engine for LOD level', () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // Verify engine LOD system is used
      const lodHigh = diagram.getLODLevel(1.5);
      const lodLow = diagram.getLODLevel(0.15);

      expect(lodHigh).toBe('high');
      expect(lodLow).toBe('low');
    });
  });

  describe('Configurable LOD policy (wave2/rendering)', () => {
    const hasText = (nodeVNode: VNode) =>
      nodeVNode.children?.some((c: VNode) => c.type === 'text') ?? false;
    const hasShadow = (nodeVNode: VNode) =>
      nodeVNode.children?.some(
        (c: VNode) =>
          typeof c.props?.className === 'string' &&
          c.props.className.includes('node-shadow')
      ) ?? false;

    test('a bare custom tier suppresses label + shadow the default tier would draw', () => {
      renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, LIGHT_THEME);
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });
      node.setMetadata('label', 'Test Node');
      diagram.addNode(node);
      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // Default policy @ zoom 1.0 => 'high' => label + shadow both render.
      const def = renderer.render(viewport, 1.0) as VNode;
      const defNode = def.children![1].children![0];
      expect(hasText(defNode)).toBe(true);
      expect(hasShadow(defNode)).toBe(true);

      // Install a single floor tier that renders NO features.
      diagram.setLODConfig({
        tiers: [
          { name: 'bare', minZoom: Number.NEGATIVE_INFINITY, features: new Set<LODFeature>() },
        ],
      });

      const bare = renderer.render(viewport, 1.0) as VNode;
      const bareNode = bare.children![1].children![0];
      expect(hasText(bareNode)).toBe(false);
      expect(hasShadow(bareNode)).toBe(false);
    });

    test('a custom tier can render labels at a zoom the default policy would not', () => {
      renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, LIGHT_THEME);
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });
      node.setMetadata('label', 'Deep Zoom Label');
      diagram.addNode(node);
      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // Default policy @ 0.1 => 'low' => no label.
      const low = renderer.render(viewport, 0.1) as VNode;
      expect(hasText(low.children![1].children![0])).toBe(false);

      // A one-tier policy that always keeps labels on flips that.
      diagram.setLODConfig({
        tiers: [
          {
            name: 'labels-always',
            minZoom: Number.NEGATIVE_INFINITY,
            features: new Set<LODFeature>(['labels']),
          },
        ],
      });

      const deep = renderer.render(viewport, 0.1) as VNode;
      expect(hasText(deep.children![1].children![0])).toBe(true);
    });
  });

  describe('Theme Integration', () => {
    test('should apply theme colors to nodes in CSS mode', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: true }, LIGHT_THEME);

      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const nodeVNode = vnode.children![1].children![0];
      // children[0] is the drop shadow — locate the themed shape
      const rect = nodeVNode.children!.find(
        (c: any) => typeof c.props?.className === 'string' && c.props.className.includes('diagram-node')
      )!;

      // CSS mode - should use CSS classes
      expect(rect).toBeDefined();
      expect(rect.props.className).toContain('diagram-node');
    });

    test('should apply theme colors to nodes in programmatic mode', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: false }, LIGHT_THEME);

      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const nodeVNode = vnode.children![1].children![0];
      // children[0] is the drop shadow; theme colors land in the inline style
      const rect = nodeVNode.children![1];

      // Programmatic mode - should use computed styles
      expect(rect.props.style).toContain(`fill: ${LIGHT_THEME.colors.node.default.fill}`);
      expect(rect.props.style).toContain(`stroke: ${LIGHT_THEME.colors.node.default.stroke}`);
    });

    test('should switch themes dynamically', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: false }, LIGHT_THEME);

      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // Render with light theme (children[0] is the drop shadow)
      let vnode = renderer.render(viewport, 1.0) as VNode;
      let rect = vnode.children![1].children![0].children![1];
      expect(rect.props.style).toContain(`fill: ${LIGHT_THEME.colors.node.default.fill}`);

      // Switch to dark theme
      renderer.setTheme(DARK_THEME);

      // Re-render with dark theme
      vnode = renderer.render(viewport, 1.0) as VNode;
      rect = vnode.children![1].children![0].children![1];
      expect(rect.props.style).toContain(`fill: ${DARK_THEME.colors.node.default.fill}`);
    });

    test('should emit theme changed event', () => {
      renderer = new SVGRenderer(engine, {});

      const spy = jest.fn();
      engine.on('renderer:theme-changed', spy);

      renderer.setTheme(DARK_THEME);

      expect(spy).toHaveBeenCalledWith(DARK_THEME);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      renderer = new SVGRenderer(engine, {});
    });

    test('should return performance metrics', () => {
      const metrics = renderer.getPerformanceMetrics();

      expect(metrics.mode).toBe('svg');
      expect(metrics.nodeCount).toBe(0);
      expect(metrics.linkCount).toBe(0);
      expect(metrics.renderTime).toBeGreaterThanOrEqual(0);
      expect(metrics.fps).toBeGreaterThanOrEqual(0);
    });

    test('should track node and link counts', () => {
      const node1 = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      const node2 = new NodeModel({ type: 'basic', position: { x: 200, y: 200 } });
      diagram.addNode(node1);
      diagram.addNode(node2);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      renderer.render(viewport, 1.0);

      const metrics = renderer.getPerformanceMetrics();
      expect(metrics.nodeCount).toBe(2);
    });

    test('should track render time', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      renderer.render(viewport, 1.0);

      const metrics = renderer.getPerformanceMetrics();
      expect(metrics.renderTime).toBeGreaterThan(0);
    });
  });

  describe('Disposal', () => {
    test('should clean up resources on dispose', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: true }, LIGHT_THEME);

      const styleId = renderer.getStyleElementId();
      expect(document.getElementById(styleId)).toBeTruthy();

      renderer.dispose();

      // This instance's variable block is removed. (The SHARED rules outlive it
      // while any other renderer is still mounted — that lifecycle is pinned in
      // svg-renderer.scoped-theme.spec.ts.)
      expect(document.getElementById(styleId)).toBeNull();
    });

    test('should not throw when disposing twice', () => {
      renderer = new SVGRenderer(engine, {});

      expect(() => {
        renderer.dispose();
        renderer.dispose();
      }).not.toThrow();
    });
  });
});
