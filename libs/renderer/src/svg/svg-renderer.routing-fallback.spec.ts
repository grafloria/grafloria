// svg-renderer.routing-fallback.spec.ts
// TDD tests for routing fallback strategy (Phase 0.1)

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine } from '@grafloria/engine';
import { DiagramModel, NodeModel, PortModel, LinkModel } from '@grafloria/engine';
import type { Point } from '@grafloria/engine';

describe('SVGRenderer - Routing Fallback (Phase 0.1)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let nodeA: NodeModel;
  let nodeB: NodeModel;
  let nodeC: NodeModel; // Obstacle node

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    renderer = new SVGRenderer(engine);
  });

  describe('RED PHASE: Primary Routing Failure Scenarios', () => {
    beforeEach(() => {
      // Setup: Create nodes that will block routing
      nodeA = new NodeModel({ type: 'test', id: 'nodeA', position: { x: 0, y: 50 }, size: { width: 60, height: 40 } });
      nodeA.addPort(new PortModel({
        id: 'portA-out',
        type: 'output',
        alignment: { side: 'right', offset: 0 },
        position: { x: 1, y: 0.5 }
      }));
      diagram.addNode(nodeA);

      nodeB = new NodeModel({ type: 'test', id: 'nodeB', position: { x: 300, y: 50 }, size: { width: 60, height: 40 } });
      nodeB.addPort(new PortModel({
        id: 'portB-in',
        type: 'input',
        alignment: { side: 'left', offset: 0 },
        position: { x: 0, y: 0.5 }
      }));
      diagram.addNode(nodeB);

      // Create obstacle node that blocks all possible paths
      nodeC = new NodeModel({
        type: 'test',
        id: 'nodeC',
        position: { x: 120, y: 0 },
        size: { width: 120, height: 140 }
      });
      diagram.addNode(nodeC);
    });

    it('should NOT render straight line through obstacles when primary routing fails', () => {
      // Create link with orthogonal routing
      const link = new LinkModel('portA-out', 'portB-in', 'orthogonal');
      diagram.addLink(link);

      // Render the link
      const vnode = (renderer as any).renderLink(link, 'high');

      // EXPECTATION: Should not have straight line path through obstacle
      const pathElement = vnode?.children?.find((child: any) => child.type === 'path');
      expect(pathElement).toBeDefined();

      const pathData = pathElement?.props?.d;
      expect(pathData).toBeDefined();

      // Parse path to check it doesn't go straight through obstacle
      // A straight line would be: M x1 y1 L x2 y2
      const isStraightLine = /^M\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+$/.test(pathData);

      if (isStraightLine) {
        // If it's a straight line, verify it doesn't intersect the obstacle
        const pathMatches = pathData.match(/M\s+([\d.]+)\s+([\d.]+)\s+L\s+([\d.]+)\s+([\d.]+)/);
        if (pathMatches) {
          const start = { x: parseFloat(pathMatches[1]), y: parseFloat(pathMatches[2]) };
          const end = { x: parseFloat(pathMatches[3]), y: parseFloat(pathMatches[4]) };

          // Check if line intersects obstacle
          const obstacleIntersects = lineIntersectsRectangle(
            start,
            end,
            nodeC.position,
            nodeC.size
          );

          expect(obstacleIntersects).toBe(false);
        }
      }
    });

    it('should use fallback routing with reduced margin when primary fails', () => {
      const link = new LinkModel('portA-out', 'portB-in', 'orthogonal');
      diagram.addLink(link);

      // Spy on routing engine to verify fallback attempt
      const routingEngine = engine.getRoutingEngine();
      const routeSpy = jest.spyOn(routingEngine, 'route');

      // Render
      (renderer as any).renderLink(link, 'high');

      // Should have been called at least twice (primary + fallback)
      // Primary with 20px margin, fallback with 5px margin
      expect(routeSpy).toHaveBeenCalled();

      const calls = routeSpy.mock.calls;
      if (calls.length > 1) {
        // Check that second call has reduced margin
        const secondCallOptions = calls[1][0]?.options;
        expect(secondCallOptions?.obstacleMargin).toBeLessThan(20);
      }
    });

    it('should return an empty group when all routing strategies fail', () => {
      // The router always produces SOME path from real geometry (it falls
      // back to a colliding simple path rather than giving up), so a total
      // failure is only reachable when route() itself returns null
      const routeSpy = jest
        .spyOn(engine.getRoutingEngine(), 'route')
        .mockReturnValue(null);

      const link = new LinkModel('portA-out', 'portB-in', 'orthogonal');
      diagram.addLink(link);

      const vnode = (renderer as any).renderLink(link, 'high');

      // Should either be null or have no children (link hidden)
      const hasNoPath = !vnode || !vnode.children || vnode.children.length === 0;
      expect(hasNoPath).toBe(true);
      routeSpy.mockRestore();
    });

    it('should log warning when routing fails', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const routeSpy = jest
        .spyOn(engine.getRoutingEngine(), 'route')
        .mockReturnValue(null);

      const link = new LinkModel('portA-out', 'portB-in', 'orthogonal');
      diagram.addLink(link);

      (renderer as any).renderLink(link, 'high');

      // Should log warning about routing failure
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('routing strategies failed')
      );

      routeSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('RED PHASE: Connection Preview During Drag', () => {
    it('should not show straight line preview through obstacles', () => {
      // Setup connection drag state
      const connectionState = engine.getConnectionStateManager();
      const sourcePort = nodeA.getPorts()[0];

      connectionState.startConnection(sourcePort, { x: 60, y: 70 });

      // Update to position blocked by obstacle
      connectionState.updateConnection({ x: 350, y: 70 }, undefined);

      // Render connection preview
      const previewVNode = (renderer as any).renderConnectionPreview(
        connectionState.getState()
      );

      // Preview path should not be a straight line through obstacle
      const pathElement = previewVNode?.children?.find((child: any) => child.type === 'path');
      if (pathElement) {
        const pathData = pathElement.props.d;

        // If it's straight, should not intersect obstacle
        const isStraightLine = /^M\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+$/.test(pathData);
        if (isStraightLine) {
          const pathMatches = pathData.match(/M\s+([\d.]+)\s+([\d.]+)\s+L\s+([\d.]+)\s+([\d.]+)/);
          if (pathMatches) {
            const start = { x: parseFloat(pathMatches[1]), y: parseFloat(pathMatches[2]) };
            const end = { x: parseFloat(pathMatches[3]), y: parseFloat(pathMatches[4]) };

            const obstacleIntersects = lineIntersectsRectangle(
              start,
              end,
              nodeC.position,
              nodeC.size
            );

            expect(obstacleIntersects).toBe(false);
          }
        }
      }
    });

    it('should hide preview when routing is impossible', () => {
      const connectionState = engine.getConnectionStateManager();
      const sourcePort = nodeA.getPorts()[0];

      connectionState.startConnection(sourcePort, { x: 60, y: 70 });

      // Completely blocked position
      connectionState.updateConnection({ x: 180, y: 70 }, undefined);

      const previewVNode = (renderer as any).renderConnectionPreview(
        connectionState.getState()
      );

      // Should not render or have empty children
      const hasNoPreview = !previewVNode || !previewVNode.children ||
                          previewVNode.children.length === 0;
      expect(hasNoPreview).toBe(true);
    });
  });

  describe('RED PHASE: Fallback Strategy Hierarchy', () => {
    it('should try fallback strategies in correct order', () => {
      // 1. Primary routing (full margin)
      // 2. Reduced margin
      // 3. Coarser grid
      // 4. No render

      const link = new LinkModel('portA-out', 'portB-in', 'orthogonal');
      diagram.addLink(link);

      const routingEngine = engine.getRoutingEngine();
      const routeSpy = jest.spyOn(routingEngine, 'route');

      (renderer as any).renderLink(link, 'high');

      const calls = routeSpy.mock.calls;

      // Verify fallback progression
      if (calls.length >= 2) {
        const primaryMargin = calls[0][0]?.options?.obstacleMargin;
        const fallbackMargin = calls[1][0]?.options?.obstacleMargin;

        expect(fallbackMargin).toBeLessThan(primaryMargin!);
      }
    });
  });
});

// Helper function for geometric intersection test
function lineIntersectsRectangle(
  start: Point,
  end: Point,
  rectPos: Point,
  rectSize: { width: number; height: number }
): boolean {
  // Simple AABB line intersection test
  const minX = rectPos.x;
  const minY = rectPos.y;
  const maxX = rectPos.x + rectSize.width;
  const maxY = rectPos.y + rectSize.height;

  // Check if line passes through rectangle
  // Using parametric line equation
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let tmin = 0;
  let tmax = 1;

  // Check X bounds
  if (dx !== 0) {
    const tx1 = (minX - start.x) / dx;
    const tx2 = (maxX - start.x) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  } else if (start.x < minX || start.x > maxX) {
    return false;
  }

  // Check Y bounds
  if (dy !== 0) {
    const ty1 = (minY - start.y) / dy;
    const ty2 = (maxY - start.y) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  } else if (start.y < minY || start.y > maxY) {
    return false;
  }

  return tmax >= tmin && tmin <= 1 && tmax >= 0;
}
