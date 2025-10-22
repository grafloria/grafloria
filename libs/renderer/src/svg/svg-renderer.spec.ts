import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel } from '@grafloria/engine';
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

      // CSS mode is default - should inject style element
      const styleElement = document.getElementById(`grafloria-renderer-theme-${LIGHT_THEME.name}`);
      expect(styleElement).toBeTruthy();
    });

    test('should support programmatic mode', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: false });

      // Programmatic mode - no style injection
      const styleElement = document.getElementById(`grafloria-renderer-theme-${LIGHT_THEME.name}`);
      expect(styleElement).toBeNull();
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
      expect(vnode.props.width).toBe(1920);
      expect(vnode.props.height).toBe(1080);
      expect(vnode.children).toHaveLength(2); // links layer + nodes layer
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

    test('should render only links with visible endpoints', () => {
      const node1 = new NodeModel({ type: 'basic', position: { x: 100, y: 100 } });
      const node2 = new NodeModel({ type: 'basic', position: { x: 200, y: 200 } });
      const node3 = new NodeModel({ type: 'basic', position: { x: -500, y: -500 } }); // Outside

      node1.addPort({ id: 'port1', type: 'output' } as any);
      node2.addPort({ id: 'port2', type: 'input' } as any);
      node3.addPort({ id: 'port3', type: 'output' } as any);

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);

      const visibleLink = new LinkModel('port1', 'port2');
      const outsideLink = new LinkModel('port1', 'port3');

      diagram.addLink(visibleLink);
      diagram.addLink(outsideLink);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0) as VNode;

      const linksLayer = vnode.children![0];

      // Only visibleLink should be rendered (both endpoints visible)
      expect(linksLayer.children).toHaveLength(1);
      expect(linksLayer.children![0].key).toBe(`link-${visibleLink.id}`);
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
      const rect = nodeVNode.children![0];

      // CSS mode - should use CSS classes
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
      const rect = nodeVNode.children![0];

      // Programmatic mode - should use computed styles
      expect(rect.props.fill).toBe(LIGHT_THEME.colors.node.default.fill);
      expect(rect.props.stroke).toBe(LIGHT_THEME.colors.node.default.stroke);
    });

    test('should switch themes dynamically', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: false }, LIGHT_THEME);

      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 }
      });
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };

      // Render with light theme
      let vnode = renderer.render(viewport, 1.0) as VNode;
      let rect = vnode.children![1].children![0].children![0];
      expect(rect.props.fill).toBe(LIGHT_THEME.colors.node.default.fill);

      // Switch to dark theme
      renderer.setTheme(DARK_THEME);

      // Re-render with dark theme
      vnode = renderer.render(viewport, 1.0) as VNode;
      rect = vnode.children![1].children![0].children![0];
      expect(rect.props.fill).toBe(DARK_THEME.colors.node.default.fill);
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

      const styleElement = document.getElementById(`grafloria-renderer-theme-${LIGHT_THEME.name}`);
      expect(styleElement).toBeTruthy();

      renderer.dispose();

      // Style element should be removed
      const styleElementAfter = document.getElementById(`grafloria-renderer-theme-${LIGHT_THEME.name}`);
      expect(styleElementAfter).toBeNull();
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
