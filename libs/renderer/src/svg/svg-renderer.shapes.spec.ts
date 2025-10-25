// SVGRenderer Shape Rendering Tests (Phase 3.1 - TDD)

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

describe('SVGRenderer - Shape Rendering (Phase 3.1)', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;
  let diagram: any;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.getDiagram();
    renderer = new SVGRenderer(engine);
  });

  afterEach(() => {
    renderer.dispose();
  });

  describe('Rectangle Shape', () => {
    it('should render rectangle by default (no shape config)', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      // Find the node's shape element
      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      expect(nodeShape).toBeDefined();

      // Should have a rect child
      const rect = findChildVNodeByType(nodeShape, 'rect');
      expect(rect).toBeDefined();
      expect(rect?.props.width).toBe(100);
      expect(rect?.props.height).toBe(60);
    });

    it('should render rectangle with explicit shape config', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 150, height: 80 },
      });

      node.setMetadata('shape', {
        type: 'rect',
        fill: '#f5f5f5',
        stroke: '#333',
        strokeWidth: 2,
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const rect = findChildVNodeByType(nodeShape, 'rect');

      expect(rect).toBeDefined();
      expect(rect?.props.fill).toBe('#f5f5f5');
      expect(rect?.props.stroke).toBe('#333');
      expect(rect?.props.strokeWidth).toBe(2);
    });

    it('should render rectangle with corner radius', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      node.setMetadata('shape', {
        type: 'rect',
        cornerRadius: 12,
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const rect = findChildVNodeByType(nodeShape, 'rect');

      expect(rect).toBeDefined();
      expect(rect?.props.rx).toBe(12);
      expect(rect?.props.ry).toBe(12);
    });
  });

  describe('Circle Shape', () => {
    it('should render circle shape', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 100 },
      });

      node.setMetadata('shape', {
        type: 'circle',
        fill: '#e3f2fd',
        stroke: '#1976d2',
        strokeWidth: 2,
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const circle = findChildVNodeByType(nodeShape, 'circle');

      expect(circle).toBeDefined();
      expect(circle?.props.cx).toBe(50); // center x = width / 2
      expect(circle?.props.cy).toBe(50); // center y = height / 2
      expect(circle?.props.r).toBe(50); // radius = min(width, height) / 2
      expect(circle?.props.fill).toBe('#e3f2fd');
      expect(circle?.props.stroke).toBe('#1976d2');
    });

    it('should render circle with correct radius for non-square nodes', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 80 }, // Non-square
      });

      node.setMetadata('shape', {
        type: 'circle',
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const circle = findChildVNodeByType(nodeShape, 'circle');

      expect(circle).toBeDefined();
      expect(circle?.props.r).toBe(40); // min(120, 80) / 2 = 40
      expect(circle?.props.cx).toBe(60); // width / 2
      expect(circle?.props.cy).toBe(40); // height / 2
    });
  });

  describe('Diamond Shape', () => {
    it('should render diamond shape as polygon', () => {
      const node = new NodeModel({
        type: 'decision-node',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 120 },
      });

      node.setMetadata('shape', {
        type: 'diamond',
        fill: '#fff9c4',
        stroke: '#f57f17',
        strokeWidth: 2,
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const polygon = findChildVNodeByType(nodeShape, 'polygon');

      expect(polygon).toBeDefined();
      expect(polygon?.props.points).toBeDefined();
      expect(polygon?.props.fill).toBe('#fff9c4');
      expect(polygon?.props.stroke).toBe('#f57f17');

      // Diamond points should be: top, right, bottom, left
      const points = polygon?.props.points as string;
      expect(points).toContain('60,0'); // top center
      expect(points).toContain('120,60'); // right center
      expect(points).toContain('60,120'); // bottom center
      expect(points).toContain('0,60'); // left center
    });
  });

  describe('Ellipse Shape', () => {
    it('should render ellipse shape', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 150, height: 80 },
      });

      node.setMetadata('shape', {
        type: 'ellipse',
        fill: '#e8f5e9',
        stroke: '#4caf50',
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const ellipse = findChildVNodeByType(nodeShape, 'ellipse');

      expect(ellipse).toBeDefined();
      expect(ellipse?.props.cx).toBe(75); // width / 2
      expect(ellipse?.props.cy).toBe(40); // height / 2
      expect(ellipse?.props.rx).toBe(75); // width / 2
      expect(ellipse?.props.ry).toBe(40); // height / 2
      expect(ellipse?.props.fill).toBe('#e8f5e9');
    });
  });

  describe('Hexagon Shape', () => {
    it('should render hexagon shape as polygon', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 100 },
      });

      node.setMetadata('shape', {
        type: 'hexagon',
        fill: '#fce4ec',
        stroke: '#e91e63',
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const polygon = findChildVNodeByType(nodeShape, 'polygon');

      expect(polygon).toBeDefined();
      expect(polygon?.props.points).toBeDefined();
      expect(polygon?.props.fill).toBe('#fce4ec');
      expect(polygon?.props.stroke).toBe('#e91e63');

      // Hexagon should have 6 vertices
      const points = (polygon?.props.points as string).split(' ');
      expect(points.length).toBe(6);
    });
  });

  describe('Shape Opacity', () => {
    it('should apply opacity to shape', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 100 },
      });

      node.setMetadata('shape', {
        type: 'circle',
        opacity: 0.7,
      });

      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const circle = findChildVNodeByType(nodeShape, 'circle');

      expect(circle?.props.opacity).toBe(0.7);
    });
  });

  describe('Backward Compatibility', () => {
    it('should render as rectangle when no shape config provided', () => {
      const node = new NodeModel({
        type: 'legacy-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      // No shape metadata set
      diagram.addNode(node);

      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const vnode = renderer.render(viewport, 1.0);

      const nodeShape = findVNodeByKey(vnode, `node-${node.id}`);
      const rect = findChildVNodeByType(nodeShape, 'rect');

      expect(rect).toBeDefined();
      expect(rect?.type).toBe('rect');
    });
  });
});

/**
 * Helper to find VNode by key
 */
function findVNodeByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;

  if (vnode.children && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findVNodeByKey(child, key);
      if (found) return found;
    }
  }

  return undefined;
}

/**
 * Helper to find child VNode by type
 */
function findChildVNodeByType(vnode: any, type: string): any {
  if (!vnode || !vnode.children) return undefined;

  for (const child of vnode.children) {
    if (child.type === type) return child;

    // Recursive search
    const found = findChildVNodeByType(child, type);
    if (found) return found;
  }

  return undefined;
}
