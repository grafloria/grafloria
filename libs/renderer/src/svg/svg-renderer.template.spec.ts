// SVGRenderer Template Integration Tests (Phase 3)

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine } from '@grafloria/engine';
import { NodeModel, PortModel, DiagramModel } from '@grafloria/engine';

describe('SVGRenderer - Template Integration (Phase 3)', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;
  let diagram: DiagramModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.getDiagram();
    renderer = new SVGRenderer(engine);
  });

  afterEach(() => {
    renderer.dispose();
  });

  describe('Port Visibility with Template Configuration', () => {
    it('should use port effective visibility over global config', () => {
      // Create node with template config
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      // Create port with visibility config
      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      // Set rendering config for 'always' visibility
      port.setRenderingConfig({
        visibility: 'always',
      });

      node.addPort(port);
      diagram.addNode(node);

      // Set global config to 'never' - port should override this
      const interactionConfig = engine.getInteractionConfig();
      interactionConfig.portVisibility = 'never';

      // Render diagram
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should be visible despite global config being 'never'
      // because port's effective visibility is 'always'
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeDefined();
    });

    it('should respect "never" visibility from port config', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      // Set rendering config for 'never' visibility
      port.setRenderingConfig({
        visibility: 'never',
      });

      node.addPort(port);
      diagram.addNode(node);

      // Set global config to 'always'
      const interactionConfig = engine.getInteractionConfig();
      interactionConfig.portVisibility = 'always';

      // Render diagram
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should NOT be visible
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeUndefined();
    });

    it('should use node metadata for visibility if port config absent', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      // Set node-level visibility via metadata
      node.setMetadata('portVisibility', 'always');

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      node.addPort(port);
      diagram.addNode(node);

      // Set global config to 'never'
      const interactionConfig = engine.getInteractionConfig();
      interactionConfig.portVisibility = 'never';

      // Render diagram
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should be visible due to node metadata
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeDefined();
    });

    it('should fall back to global config if no template config', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      node.addPort(port);
      diagram.addNode(node);

      // Set global config to 'always'
      const interactionConfig = engine.getInteractionConfig();
      interactionConfig.portVisibility = 'always';

      // Render diagram
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should be visible via global config
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeDefined();
    });
  });

  describe('Port Rendering Mode', () => {
    it('should render SVG ports as circles (default mode)', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      // Explicitly set SVG mode
      port.setRenderingConfig({
        mode: 'svg',
        visibility: 'always',
      });

      node.addPort(port);
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should be rendered as SVG circle
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeDefined();
      expect(portVNode?.type).toBe('circle');
    });

    it('should skip HTML mode ports in SVGRenderer', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      // Set HTML rendering mode
      port.setRenderingConfig({
        mode: 'html',
        visibility: 'always',
      });

      node.addPort(port);
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should NOT be rendered in SVG layer
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeUndefined();
    });

    it('should auto-detect rendering mode based on node HTML layer flag', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      // Mark node as using HTML layer
      node.setMetadata('useHTMLLayer', true);

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      // Set auto mode - should detect HTML layer
      port.setRenderingConfig({
        mode: 'auto',
        visibility: 'always',
      });

      node.addPort(port);
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should NOT be rendered in SVG layer (auto-detected HTML mode)
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should render ports without template config using existing logic', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      const port = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });

      node.addPort(port);
      diagram.addNode(node);

      // Use default global config
      const interactionConfig = engine.getInteractionConfig();
      interactionConfig.portVisibility = 'always';

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Port should render with existing logic
      const portVNode = findVNodeByType(vnode, 'circle', `port-${port.id}`);
      expect(portVNode).toBeDefined();
    });
  });
});

/**
 * Helper to find a VNode by type and key (recursively)
 */
function findVNodeByType(vnode: any, type: string, key: string): any | undefined {
  if (!vnode) return undefined;

  // Check current node
  if (vnode.type === type && vnode.key === key) {
    return vnode;
  }

  // Recursively check children
  if (vnode.children && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findVNodeByType(child, type, key);
      if (found) return found;
    }
  }

  return undefined;
}
