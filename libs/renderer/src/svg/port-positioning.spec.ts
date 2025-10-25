// Shape-Aware Port Positioning Tests (Phase 3.2 - TDD)

import { NodeModel, PortModel } from '@grafloria/engine';

describe('Shape-Aware Port Positioning (Phase 3.2)', () => {
  describe('Rectangle Port Positioning', () => {
    it('should position ports on rectangle edges', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      node.setMetadata('shape', { type: 'rect' });

      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });
      const rightPort = new PortModel({ id: 'right', type: 'output', side: 'right' });
      const topPort = new PortModel({ id: 'top', type: 'input', side: 'top' });
      const bottomPort = new PortModel({ id: 'bottom', type: 'output', side: 'bottom' });

      node.addPort(leftPort);
      node.addPort(rightPort);
      node.addPort(topPort);
      node.addPort(bottomPort);

      // Expected positions (relative to node)
      // Left: x=0, y=30 (center of left edge)
      // Right: x=100, y=30 (center of right edge)
      // Top: x=50, y=0 (center of top edge)
      // Bottom: x=50, y=60 (center of bottom edge)

      const leftPos = getPortPositionForShape(leftPort, node);
      expect(leftPos.x).toBe(0);
      expect(leftPos.y).toBe(30);

      const rightPos = getPortPositionForShape(rightPort, node);
      expect(rightPos.x).toBe(100);
      expect(rightPos.y).toBe(30);

      const topPos = getPortPositionForShape(topPort, node);
      expect(topPos.x).toBe(50);
      expect(topPos.y).toBe(0);

      const bottomPos = getPortPositionForShape(bottomPort, node);
      expect(bottomPos.x).toBe(50);
      expect(bottomPos.y).toBe(60);
    });
  });

  describe('Circle Port Positioning', () => {
    it('should position ports on circle circumference', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 100 },
      });

      node.setMetadata('shape', { type: 'circle' });

      const topPort = new PortModel({ id: 'top', type: 'input', side: 'top' });
      const rightPort = new PortModel({ id: 'right', type: 'output', side: 'right' });
      const bottomPort = new PortModel({ id: 'bottom', type: 'output', side: 'bottom' });
      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });

      node.addPort(topPort);
      node.addPort(rightPort);
      node.addPort(bottomPort);
      node.addPort(leftPort);

      // Circle: radius = 50, center = (50, 50)
      // Top: center + (0, -radius) = (50, 0)
      // Right: center + (radius, 0) = (100, 50)
      // Bottom: center + (0, radius) = (50, 100)
      // Left: center + (-radius, 0) = (0, 50)

      const topPos = getPortPositionForShape(topPort, node);
      expect(topPos.x).toBe(50);
      expect(topPos.y).toBe(0);

      const rightPos = getPortPositionForShape(rightPort, node);
      expect(rightPos.x).toBe(100);
      expect(rightPos.y).toBe(50);

      const bottomPos = getPortPositionForShape(bottomPort, node);
      expect(bottomPos.x).toBe(50);
      expect(bottomPos.y).toBe(100);

      const leftPos = getPortPositionForShape(leftPort, node);
      expect(leftPos.x).toBe(0);
      expect(leftPos.y).toBe(50);
    });

    it('should handle non-square circles (use smaller dimension)', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 80 }, // Non-square
      });

      node.setMetadata('shape', { type: 'circle' });

      const rightPort = new PortModel({ id: 'right', type: 'output', side: 'right' });
      node.addPort(rightPort);

      // Radius = min(120, 80) / 2 = 40
      // Center = (60, 40)
      // Right port: center + (radius, 0) = (60 + 40, 40) = (100, 40)

      const rightPos = getPortPositionForShape(rightPort, node);
      expect(rightPos.x).toBe(100);
      expect(rightPos.y).toBe(40);
    });
  });

  describe('Diamond Port Positioning', () => {
    it('should position ports at diamond vertices', () => {
      const node = new NodeModel({
        type: 'decision-node',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 120 },
      });

      node.setMetadata('shape', { type: 'diamond' });

      const topPort = new PortModel({ id: 'top', type: 'input', side: 'top' });
      const rightPort = new PortModel({ id: 'right', type: 'output', side: 'right' });
      const bottomPort = new PortModel({ id: 'bottom', type: 'output', side: 'bottom' });
      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });

      node.addPort(topPort);
      node.addPort(rightPort);
      node.addPort(bottomPort);
      node.addPort(leftPort);

      // Diamond vertices (cx, cy are center points):
      // Top: (60, 0)
      // Right: (120, 60)
      // Bottom: (60, 120)
      // Left: (0, 60)

      const topPos = getPortPositionForShape(topPort, node);
      expect(topPos.x).toBe(60);
      expect(topPos.y).toBe(0);

      const rightPos = getPortPositionForShape(rightPort, node);
      expect(rightPos.x).toBe(120);
      expect(rightPos.y).toBe(60);

      const bottomPos = getPortPositionForShape(bottomPort, node);
      expect(bottomPos.x).toBe(60);
      expect(bottomPos.y).toBe(120);

      const leftPos = getPortPositionForShape(leftPort, node);
      expect(leftPos.x).toBe(0);
      expect(leftPos.y).toBe(60);
    });
  });

  describe('Ellipse Port Positioning', () => {
    it('should position ports on ellipse perimeter', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 150, height: 80 },
      });

      node.setMetadata('shape', { type: 'ellipse' });

      const topPort = new PortModel({ id: 'top', type: 'input', side: 'top' });
      const rightPort = new PortModel({ id: 'right', type: 'output', side: 'right' });
      const bottomPort = new PortModel({ id: 'bottom', type: 'output', side: 'bottom' });
      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });

      node.addPort(topPort);
      node.addPort(rightPort);
      node.addPort(bottomPort);
      node.addPort(leftPort);

      // Ellipse: rx = 75, ry = 40, center = (75, 40)
      // Top: (75, 0)
      // Right: (150, 40)
      // Bottom: (75, 80)
      // Left: (0, 40)

      const topPos = getPortPositionForShape(topPort, node);
      expect(topPos.x).toBe(75);
      expect(topPos.y).toBe(0);

      const rightPos = getPortPositionForShape(rightPort, node);
      expect(rightPos.x).toBe(150);
      expect(rightPos.y).toBe(40);

      const bottomPos = getPortPositionForShape(bottomPort, node);
      expect(bottomPos.x).toBe(75);
      expect(bottomPos.y).toBe(80);

      const leftPos = getPortPositionForShape(leftPort, node);
      expect(leftPos.x).toBe(0);
      expect(leftPos.y).toBe(40);
    });
  });

  describe('Hexagon Port Positioning', () => {
    it('should position ports at hexagon edge centers', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 100 },
      });

      node.setMetadata('shape', { type: 'hexagon' });

      const topPort = new PortModel({ id: 'top', type: 'input', side: 'top' });
      const rightPort = new PortModel({ id: 'right', type: 'output', side: 'right' });
      const bottomPort = new PortModel({ id: 'bottom', type: 'output', side: 'bottom' });
      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });

      node.addPort(topPort);
      node.addPort(rightPort);
      node.addPort(bottomPort);
      node.addPort(leftPort);

      // Hexagon flat-top, offset = 25% of width = 30
      // Top center: (60, 0)
      // Right center: (120, 50)
      // Bottom center: (60, 100)
      // Left center: (0, 50)

      const topPos = getPortPositionForShape(topPort, node);
      expect(topPos.x).toBe(60);
      expect(topPos.y).toBe(0);

      const rightPos = getPortPositionForShape(rightPort, node);
      expect(rightPos.x).toBe(120);
      expect(rightPos.y).toBe(50);

      const bottomPos = getPortPositionForShape(bottomPort, node);
      expect(bottomPos.x).toBe(60);
      expect(bottomPos.y).toBe(100);

      const leftPos = getPortPositionForShape(leftPort, node);
      expect(leftPos.x).toBe(0);
      expect(leftPos.y).toBe(50);
    });
  });

  describe('Multi-Port Positioning', () => {
    it('should position multiple ports on same side with index offset', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 100 },
      });

      node.setMetadata('shape', { type: 'circle' });

      // Three ports on right side
      const port1 = new PortModel({ id: 'right-1', type: 'output', side: 'right' });
      port1.index = 0;
      const port2 = new PortModel({ id: 'right-2', type: 'output', side: 'right' });
      port2.index = 1;
      const port3 = new PortModel({ id: 'right-3', type: 'output', side: 'right' });
      port3.index = 2;

      node.addPort(port1);
      node.addPort(port2);
      node.addPort(port3);

      // Ports should spread around the right quadrant
      const pos1 = getPortPositionForShape(port1, node);
      const pos2 = getPortPositionForShape(port2, node);
      const pos3 = getPortPositionForShape(port3, node);

      // Port 1 should be higher than port 2, which should be higher than port 3
      expect(pos1.y).toBeLessThan(pos2.y);
      expect(pos2.y).toBeLessThan(pos3.y);

      // All should be on or near the right edge
      expect(pos1.x).toBeGreaterThan(90);
      expect(pos2.x).toBeGreaterThan(90);
      expect(pos3.x).toBeGreaterThan(90);
    });
  });

  describe('Port Offset Support', () => {
    it('should apply port offset to calculated position', () => {
      const node = new NodeModel({
        type: 'test-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 100 },
      });

      node.setMetadata('shape', { type: 'circle' });

      const port = new PortModel({ id: 'top', type: 'input', side: 'top' });
      port.offset = { x: 10, y: 5 };

      node.addPort(port);

      // Base position: (50, 0)
      // With offset: (50 + 10, 0 + 5) = (60, 5)

      const pos = getPortPositionForShape(port, node);
      expect(pos.x).toBe(60);
      expect(pos.y).toBe(5);
    });
  });

  describe('Backward Compatibility', () => {
    it('should default to rectangle positioning if no shape config', () => {
      const node = new NodeModel({
        type: 'legacy-node',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 60 },
      });

      // No shape metadata

      const leftPort = new PortModel({ id: 'left', type: 'input', side: 'left' });
      node.addPort(leftPort);

      const pos = getPortPositionForShape(leftPort, node);
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(30);
    });
  });
});

/**
 * Helper function to get port position for a given shape
 * This will be implemented in the actual code
 */
function getPortPositionForShape(port: PortModel, node: NodeModel): { x: number; y: number } {
  // This is a placeholder - will be implemented in actual code
  throw new Error('Not implemented yet - this is a test placeholder');
}
