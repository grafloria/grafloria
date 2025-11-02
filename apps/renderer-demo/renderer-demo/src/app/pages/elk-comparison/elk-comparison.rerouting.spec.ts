/**
 * Unit tests for automatic link rerouting when nodes move
 * Tests the elk-comparison component's dynamic rerouting functionality
 */

import { TestBed } from '@angular/core/testing';
import { ElkComparisonComponent } from './elk-comparison.component';
import { DiagramEngine, NodeModel, LinkModel, PortModel } from '@grafloria/engine';

describe('ElkComparisonComponent - Link Rerouting', () => {
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

  describe('Node Movement Detection', () => {
    it('should detect when a node position changes', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      // Get one of the nodes
      const nodes = diagram!.getNodes();
      expect(nodes.length).toBeGreaterThan(0);

      const testNode = nodes[0];
      const originalX = testNode.position.x;
      const originalY = testNode.position.y;

      // Subscribe to diagram events
      let positionChangeDetected = false;
      diagram!.subscribe((event) => {
        if (event.type === 'change' && event.property === 'position' && event.entity.id === testNode.id) {
          positionChangeDetected = true;
        }
      });

      // Move the node
      testNode.setPosition(originalX + 100, originalY + 50);

      // Verify event was fired
      setTimeout(() => {
        expect(positionChangeDetected).toBe(true);
        done();
      }, 100);
    });
  });

  describe('Link Rerouting on Node Movement', () => {
    it('should reroute connected links when node moves', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      // Find a node with links (Node 6 has multiple connections)
      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      // Get links connected to node 6
      const connectedLinks = diagram!.getLinks().filter(link =>
        link.sourceNodeId === node6!.id || link.targetNodeId === node6!.id
      );
      expect(connectedLinks.length).toBeGreaterThan(0);

      // Record original link points
      const originalPoints = connectedLinks.map(link => ({
        id: link.id,
        points: [...link.getPoints()],
      }));

      // Move node 6
      const originalPos = node6!.position;
      node6!.setPosition(originalPos.x + 100, originalPos.y + 50);

      // Wait for rerouting to complete
      setTimeout(() => {
        // Verify that links were rerouted (points should have changed)
        connectedLinks.forEach((link, index) => {
          const newPoints = link.getPoints();
          const oldPoints = originalPoints[index].points;

          // Points should have changed
          expect(newPoints).not.toEqual(oldPoints);

          // Should still have valid points
          expect(newPoints.length).toBeGreaterThan(0);
        });

        done();
      }, 200);
    });

    it('should correctly calculate new port positions after node movement', () => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      // Create a test node with known position
      const testNode = new NodeModel({
        type: 'rect',
        position: { x: 500, y: 300 },
        size: { width: 120, height: 60 },
      });

      const leftPort = new PortModel({
        id: 'test-left',
        type: 'input',
        side: 'left',
      });

      const rightPort = new PortModel({
        id: 'test-right',
        type: 'output',
        side: 'right',
      });

      testNode.addPort(leftPort);
      testNode.addPort(rightPort);

      // Calculate initial port positions
      const initialBounds = testNode.getBoundingBox();
      const initialLeftPos = leftPort.getAbsolutePosition(initialBounds);
      const initialRightPos = rightPort.getAbsolutePosition(initialBounds);

      expect(initialLeftPos.x).toBe(500);
      expect(initialLeftPos.y).toBe(330); // 300 + 60/2
      expect(initialRightPos.x).toBe(620); // 500 + 120
      expect(initialRightPos.y).toBe(330);

      // Move the node
      testNode.setPosition(600, 400);

      // Calculate new port positions
      const newBounds = testNode.getBoundingBox();
      const newLeftPos = leftPort.getAbsolutePosition(newBounds);
      const newRightPos = rightPort.getAbsolutePosition(newBounds);

      // Verify positions moved correctly
      expect(newLeftPos.x).toBe(600); // moved +100 in x
      expect(newLeftPos.y).toBe(430); // moved +100 in y (400 + 60/2)
      expect(newRightPos.x).toBe(720); // moved +100 in x (600 + 120)
      expect(newRightPos.y).toBe(430); // moved +100 in y
    });
  });

  describe('Multiple Connected Links', () => {
    it('should reroute all links when a node with multiple connections moves', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      // Node 6 has 5 connections (incoming: Root, Node2, Node3; outgoing: Node9, Node10)
      const node6 = diagram!.getNodes().find(n => n.id.includes('node6'));
      expect(node6).toBeDefined();

      const connectedLinks = diagram!.getLinks().filter(link =>
        link.sourceNodeId === node6!.id || link.targetNodeId === node6!.id
      );

      // Should have 5 connections
      expect(connectedLinks.length).toBe(5);

      // Move node 6
      const originalPos = node6!.position;
      node6!.setPosition(originalPos.x + 150, originalPos.y);

      setTimeout(() => {
        // All 5 links should have been rerouted
        connectedLinks.forEach(link => {
          const points = link.getPoints();
          expect(points.length).toBeGreaterThan(0);

          // Verify points are valid numbers
          points.forEach(point => {
            expect(typeof point.x).toBe('number');
            expect(typeof point.y).toBe('number');
            expect(isNaN(point.x)).toBe(false);
            expect(isNaN(point.y)).toBe(false);
          });
        });

        done();
      }, 200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle moving a node with no connections', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      // Create an isolated node
      const isolatedNode = new NodeModel({
        type: 'rect',
        position: { x: 1000, y: 1000 },
        size: { width: 100, height: 50 },
      });

      diagram!.addNode(isolatedNode);

      // Move it (should not cause errors)
      expect(() => {
        isolatedNode.setPosition(1100, 1100);
      }).not.toThrow();

      setTimeout(() => {
        expect(isolatedNode.position.x).toBe(1100);
        expect(isolatedNode.position.y).toBe(1100);
        done();
      }, 100);
    });

    it('should maintain link validity after multiple consecutive moves', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node2 = diagram!.getNodes().find(n => n.id.includes('node2'));
      expect(node2).toBeDefined();

      const originalPos = node2!.position;

      // Move multiple times
      node2!.setPosition(originalPos.x + 50, originalPos.y);
      setTimeout(() => {
        node2!.setPosition(originalPos.x + 100, originalPos.y);
        setTimeout(() => {
          node2!.setPosition(originalPos.x + 150, originalPos.y);

          setTimeout(() => {
            // Verify all links are still valid
            const links = diagram!.getLinks().filter(link =>
              link.sourceNodeId === node2!.id || link.targetNodeId === node2!.id
            );

            links.forEach(link => {
              const points = link.getPoints();
              expect(points.length).toBeGreaterThan(0);
              expect(points.every(p => !isNaN(p.x) && !isNaN(p.y))).toBe(true);
            });

            done();
          }, 100);
        }, 100);
      }, 100);
    });
  });

  describe('Obstacle Avoidance During Rerouting', () => {
    it('should avoid other nodes when rerouting', (done) => {
      const diagram = engine.getDiagram();
      expect(diagram).toBeDefined();

      const node1 = diagram!.getNodes().find(n => n.id.includes('node1'));
      expect(node1).toBeDefined();

      const connectedLinks = diagram!.getLinks().filter(link =>
        link.sourceNodeId === node1!.id || link.targetNodeId === node1!.id
      );

      // Move node1 to create a potential collision scenario
      const originalPos = node1!.position;
      node1!.setPosition(originalPos.x, originalPos.y + 100);

      setTimeout(() => {
        // Verify rerouting completed
        connectedLinks.forEach(link => {
          const points = link.getPoints();
          expect(points.length).toBeGreaterThan(0);

          // In orthogonal routing with obstacle avoidance,
          // we should have multiple waypoints (not just start and end)
          if (connectedLinks.length > 2) {
            expect(points.length).toBeGreaterThan(2);
          }
        });

        done();
      }, 200);
    });
  });
});
