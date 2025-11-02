/**
 * TDD Tests for Path Endpoint Alignment Issue
 *
 * Problem: Path endpoints don't match actual port positions, creating diagonal offset lines
 *
 * Scenario:
 * - OrthogonalRouter calculates path ending at point A (e.g., 595, 380)
 * - Port actual position is at point B (e.g., 600, 380)
 * - Renderer draws diagonal line from A to B (5px offset)
 * - Arrow is correctly positioned at B, but path is offset
 *
 * Solution:
 * - Path MUST end at EXACT port position
 * - No diagonal offset lines allowed
 */

import { TestBed } from '@angular/core/testing';
import { ElkComparisonComponent } from './elk-comparison.component';
import { DiagramEngine, NodeModel, PortModel } from '@grafloria/engine';

describe('Elk-Comparison Path Endpoint Alignment (TDD)', () => {
  let component: ElkComparisonComponent;
  let engine: DiagramEngine;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElkComparisonComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ElkComparisonComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
    engine = component.engine;
  });

  describe('Initial Routing - Path Endpoints Match Port Positions', () => {
    it('should ensure path endpoint matches target port position exactly', () => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const links = diagram!.getLinks();
      const nodes = diagram!.getNodes();

      links.forEach(link => {
        const targetNode = nodes.find(n => n.id === link.targetNodeId);
        if (!targetNode) return;

        const targetPort = targetNode.getPort(link.targetPortId);
        if (!targetPort) return;

        // Get actual port position
        const targetBounds = targetNode.getBoundingBox();
        const actualPortPosition = targetPort.getAbsolutePosition(targetBounds);

        // Get path points
        const pathPoints = link.getPoints();
        expect(pathPoints.length).toBeGreaterThan(0);

        // CRITICAL TEST: Last path point MUST equal port position
        const lastPoint = pathPoints[pathPoints.length - 1];

        expect(lastPoint.x).toBe(actualPortPosition.x);
        expect(lastPoint.y).toBe(actualPortPosition.y);
      });
    });

    it('should ensure path start matches source port position exactly', () => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const links = diagram!.getLinks();
      const nodes = diagram!.getNodes();

      links.forEach(link => {
        const sourceNode = nodes.find(n => n.id === link.sourceNodeId);
        if (!sourceNode) return;

        const sourcePort = sourceNode.getPort(link.sourcePortId);
        if (!sourcePort) return;

        // Get actual port position
        const sourceBounds = sourceNode.getBoundingBox();
        const actualPortPosition = sourcePort.getAbsolutePosition(sourceBounds);

        // Get path points
        const pathPoints = link.getPoints();
        expect(pathPoints.length).toBeGreaterThan(0);

        // CRITICAL TEST: First path point MUST equal port position
        const firstPoint = pathPoints[0];

        expect(firstPoint.x).toBe(actualPortPosition.x);
        expect(firstPoint.y).toBe(actualPortPosition.y);
      });
    });

    it('should have no diagonal offset segments near endpoints for Node 6', () => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const node6Links = diagram!.getLinks().filter(link =>
        link.sourceNodeId === node6!.id || link.targetNodeId === node6!.id
      );

      node6Links.forEach(link => {
        const points = link.getPoints();
        expect(points.length).toBeGreaterThan(1);

        // Check last segment (should be orthogonal, not diagonal)
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2];

        const isHorizontal = lastPoint.y === secondLastPoint.y;
        const isVertical = lastPoint.x === secondLastPoint.x;

        // MUST be either horizontal OR vertical (orthogonal)
        expect(isHorizontal || isVertical).toBe(true);

        // Check first segment
        const firstPoint = points[0];
        const secondPoint = points[1];

        const isFirstHorizontal = firstPoint.y === secondPoint.y;
        const isFirstVertical = firstPoint.x === secondPoint.x;

        expect(isFirstHorizontal || isFirstVertical).toBe(true);
      });
    });
  });

  describe('After Node Movement - Path Endpoints Still Match', () => {
    it('should maintain endpoint alignment when Node 6 moves right', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const originalPos = node6!.position;

      // Move Node 6 to the right
      node6!.setPosition(originalPos.x + 50, originalPos.y);

      // Wait for rerouting
      setTimeout(() => {
        const node6Links = diagram!.getLinks().filter(link =>
          link.sourceNodeId === node6!.id || link.targetNodeId === node6!.id
        );

        node6Links.forEach(link => {
          const points = link.getPoints();

          // Check target endpoint
          if (link.targetNodeId === node6!.id) {
            const targetPort = node6!.getPort(link.targetPortId);
            const targetBounds = node6!.getBoundingBox();
            const actualPortPos = targetPort!.getAbsolutePosition(targetBounds);
            const lastPoint = points[points.length - 1];

            expect(lastPoint.x).toBe(actualPortPos.x);
            expect(lastPoint.y).toBe(actualPortPos.y);
          }

          // Check source endpoint
          if (link.sourceNodeId === node6!.id) {
            const sourcePort = node6!.getPort(link.sourcePortId);
            const sourceBounds = node6!.getBoundingBox();
            const actualPortPos = sourcePort!.getAbsolutePosition(sourceBounds);
            const firstPoint = points[0];

            expect(firstPoint.x).toBe(actualPortPos.x);
            expect(firstPoint.y).toBe(actualPortPos.y);
          }
        });

        done();
      }, 100);
    });

    it('should maintain endpoint alignment when Node 6 moves up', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const originalPos = node6!.position;

      // Move Node 6 up
      node6!.setPosition(originalPos.x, originalPos.y - 50);

      // Wait for rerouting
      setTimeout(() => {
        const leftPort = node6!.getPorts().find(p => p.alignment.side === 'left');
        expect(leftPort).toBeDefined();

        const node6Bounds = node6!.getBoundingBox();
        const actualLeftPortPos = leftPort!.getAbsolutePosition(node6Bounds);

        // Find link connected to left port
        const incomingLink = diagram!.getLinks().find(link =>
          link.targetNodeId === node6!.id && link.targetPortId === leftPort!.id
        );

        if (incomingLink) {
          const points = incomingLink.getPoints();
          const lastPoint = points[points.length - 1];

          // CRITICAL: Must match exactly
          expect(lastPoint.x).toBe(actualLeftPortPos.x);
          expect(lastPoint.y).toBe(actualLeftPortPos.y);

          // No diagonal segment at end
          const secondLastPoint = points[points.length - 2];
          const isOrthogonal = (lastPoint.x === secondLastPoint.x) || (lastPoint.y === secondLastPoint.y);
          expect(isOrthogonal).toBe(true);
        }

        done();
      }, 100);
    });

    it('should maintain endpoint alignment when Node 6 moves down', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const originalPos = node6!.position;

      // Move Node 6 down
      node6!.setPosition(originalPos.x, originalPos.y + 50);

      // Wait for rerouting
      setTimeout(() => {
        const node6Links = diagram!.getLinks().filter(link =>
          link.targetNodeId === node6!.id || link.sourceNodeId === node6!.id
        );

        node6Links.forEach(link => {
          const points = link.getPoints();
          expect(points.length).toBeGreaterThan(1);

          // Check that ALL segments are orthogonal (no diagonals)
          for (let i = 0; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];

            const isHorizontal = current.y === next.y;
            const isVertical = current.x === next.x;

            expect(isHorizontal || isVertical).toBe(true);
          }
        });

        done();
      }, 100);
    });
  });

  describe('Specific Node 6 Left Port Test', () => {
    it('should have zero offset between path end and arrow position for Node 6 left port', () => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const leftPort = node6!.getPorts().find(p => p.alignment.side === 'left');
      expect(leftPort).toBeDefined();

      // Find incoming links to left port
      const incomingLinks = diagram!.getLinks().filter(link =>
        link.targetNodeId === node6!.id && link.targetPortId === leftPort!.id
      );

      expect(incomingLinks.length).toBeGreaterThan(0);

      incomingLinks.forEach(link => {
        const points = link.getPoints();
        const node6Bounds = node6!.getBoundingBox();
        const portPosition = leftPort!.getAbsolutePosition(node6Bounds);

        // Last point MUST be at port position
        const lastPoint = points[points.length - 1];

        // Zero tolerance - exact match required
        expect(lastPoint.x).toBe(portPosition.x);
        expect(lastPoint.y).toBe(portPosition.y);

        // Additionally verify second-to-last point forms orthogonal segment
        if (points.length > 1) {
          const secondLast = points[points.length - 2];

          // Must be either horizontal or vertical
          const isHorizontal = lastPoint.y === secondLast.y;
          const isVertical = lastPoint.x === secondLast.x;

          expect(isHorizontal || isVertical).toBe(true);

          // If horizontal, X values should differ
          // If vertical, Y values should differ
          if (isHorizontal) {
            expect(lastPoint.x).not.toBe(secondLast.x);
          } else {
            expect(lastPoint.y).not.toBe(secondLast.y);
          }
        }
      });
    });
  });

  describe('Distance Validation - No Offset Segments', () => {
    it('should have no segments shorter than 10 pixels (indicating offset bugs)', () => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const node6Links = diagram!.getLinks().filter(link =>
        link.sourceNodeId === node6!.id || link.targetNodeId === node6!.id
      );

      node6Links.forEach(link => {
        const points = link.getPoints();

        for (let i = 0; i < points.length - 1; i++) {
          const current = points[i];
          const next = points[i + 1];

          const distance = Math.sqrt(
            Math.pow(next.x - current.x, 2) +
            Math.pow(next.y - current.y, 2)
          );

          // If segment is very short (< 10px), it's likely an offset bug
          // unless it's the very first or last segment (which might be legitimate)
          if (i > 0 && i < points.length - 2) {
            expect(distance).toBeGreaterThanOrEqual(10);
          }
        }
      });
    });
  });
});
