/**
 * @jest-environment jsdom
 */
// LiveReroutingEngine.spec.ts
// TDD tests for automatic link rerouting (Phase 0.2)

import { LiveReroutingEngine } from './LiveReroutingEngine';
import { RoutingEngine } from './RoutingEngine';
import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel, NodeModel, PortModel, LinkModel } from '../models';
import type { Point } from '../types';

describe('LiveReroutingEngine (Phase 0.2)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let routingEngine: RoutingEngine;
  let liveRerouting: LiveReroutingEngine;
  let nodeA: NodeModel;
  let nodeB: NodeModel;
  let link: LinkModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    routingEngine = engine.getRoutingEngine();

    // Create test nodes with ports
    nodeA = new NodeModel({
      type: 'test',
      id: 'nodeA',
      position: { x: 0, y: 50 },
      size: { width: 60, height: 40 }
    });
    nodeA.addPort(new PortModel({
      id: 'portA-out',
      type: 'output',
      alignment: { side: 'right', offset: 0 },
      position: { x: 1, y: 0.5 }
    }));

    nodeB = new NodeModel({
      type: 'test',
      id: 'nodeB',
      position: { x: 200, y: 50 },
      size: { width: 60, height: 40 }
    });
    nodeB.addPort(new PortModel({
      id: 'portB-in',
      type: 'input',
      alignment: { side: 'left', offset: 0 },
      position: { x: 0, y: 0.5 }
    }));

    diagram.addNode(nodeA);
    diagram.addNode(nodeB);

    // Create link
    link = new LinkModel('portA-out', 'portB-in', 'orthogonal');
    (link as any).id = 'link1'; // tests reference the link by this id
    diagram.addLink(link);

    // Initialize LiveReroutingEngine
    liveRerouting = new LiveReroutingEngine(routingEngine, diagram);
  });

  describe('RED PHASE: Initialization', () => {
    it('should create LiveReroutingEngine instance', () => {
      expect(liveRerouting).toBeDefined();
      expect(liveRerouting).toBeInstanceOf(LiveReroutingEngine);
    });

    it('should be enabled by default', () => {
      expect((liveRerouting as any).enabled).toBe(true);
    });

    it('should have default throttle of 16ms (60fps)', () => {
      expect((liveRerouting as any).throttleMs).toBe(16);
    });

    it('should register event listeners on diagram', () => {
      // Verify that event listeners were attached
      const eventListeners = (diagram as any).emitter?._events;
      expect(eventListeners?.['node:moved']).toBeDefined();
      expect(eventListeners?.['node:resized']).toBeDefined();
    });
  });

  describe('RED PHASE: Node Movement Detection', () => {
    it('should detect when node moves', () => {
      // The constructor BINDS the handler, so spy the prototype before
      // constructing a fresh engine
      const handleNodeMovedSpy = jest.spyOn(LiveReroutingEngine.prototype as any, 'handleNodeMoved');
      const freshEngine = new LiveReroutingEngine(routingEngine, diagram);
      void freshEngine;

      // Move nodeA
      nodeA.setPosition(50, 50);
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      expect(handleNodeMovedSpy).toHaveBeenCalled();
      handleNodeMovedSpy.mockRestore();
    });

    it('should add affected links to pending reroutes when node moves', () => {
      // Move nodeA
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      // Check pending reroutes includes the link
      const pendingReroutes = (liveRerouting as any).pendingReroutes;
      expect(pendingReroutes.has('link1')).toBe(true);
    });

    it('should identify all links connected to moved node', () => {
      // Create additional link
      const link2 = new LinkModel('portA-out', 'portB-in', 'smooth');
      (link2 as any).id = 'link2';
      diagram.addLink(link2);

      // Move nodeA
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      // Both links should be pending reroute
      const pendingReroutes = (liveRerouting as any).pendingReroutes;
      expect(pendingReroutes.has('link1')).toBe(true);
      expect(pendingReroutes.has('link2')).toBe(true);
    });

    it('should handle node resize events', () => {
      const handleNodeResizedSpy = jest.spyOn(LiveReroutingEngine.prototype as any, 'handleNodeResized');
      const freshEngine = new LiveReroutingEngine(routingEngine, diagram);
      void freshEngine;

      (diagram as any).emitter.emit('node:resized', {
        nodeId: 'nodeA',
        size: { width: 80, height: 60 }
      });

      expect(handleNodeResizedSpy).toHaveBeenCalled();
    });
  });

  describe('RED PHASE: Throttled Rerouting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should throttle reroute calls', () => {
      const processReroutesSpy = jest.spyOn(liveRerouting as any, 'processReroutes');

      // Move node multiple times rapidly
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 10, y: 50 } });
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 20, y: 50 } });
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 30, y: 50 } });

      // Should not process immediately
      expect(processReroutesSpy).not.toHaveBeenCalled();

      // Fast-forward throttle time
      jest.advanceTimersByTime(16);

      // Now should process
      expect(processReroutesSpy).toHaveBeenCalledTimes(1);
    });

    it('should batch multiple movements into single reroute', () => {
      const processReroutesSpy = jest.spyOn(liveRerouting as any, 'processReroutes');

      // Move both nodes
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeB', position: { x: 250, y: 50 } });

      jest.advanceTimersByTime(16);

      // Should process once with all links
      expect(processReroutesSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow configurable throttle time', () => {
      liveRerouting.setThrottle(100);
      expect((liveRerouting as any).throttleMs).toBe(100);

      const processReroutesSpy = jest.spyOn(liveRerouting as any, 'processReroutes');

      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      // Should not process at 16ms
      jest.advanceTimersByTime(16);
      expect(processReroutesSpy).not.toHaveBeenCalled();

      // Should process at 100ms
      jest.advanceTimersByTime(84); // 16 + 84 = 100
      expect(processReroutesSpy).toHaveBeenCalled();
    });
  });

  describe('RED PHASE: Path Regeneration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call generatePath on affected links', () => {
      const generatePathSpy = jest.spyOn(link, 'generatePath');

      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });
      jest.advanceTimersByTime(16);

      expect(generatePathSpy).toHaveBeenCalled();
    });

    it('should mark links as dirty after rerouting', () => {
      const markDirtySpy = jest.spyOn(link, 'markDirty');

      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });
      jest.advanceTimersByTime(16);

      expect(markDirtySpy).toHaveBeenCalled();
    });

    it('should emit links:rerouted event after processing', (done) => {
      diagram.on('links:rerouted', (event: any) => {
        expect(event.count).toBeDefined();
        done();
      });

      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });
      jest.advanceTimersByTime(16);
    });

    it('should clear pending reroutes after processing', () => {
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      const pendingBefore = (liveRerouting as any).pendingReroutes.size;
      expect(pendingBefore).toBeGreaterThan(0);

      jest.advanceTimersByTime(16);

      const pendingAfter = (liveRerouting as any).pendingReroutes.size;
      expect(pendingAfter).toBe(0);
    });
  });

  describe('RED PHASE: Enable/Disable Control', () => {
    it('should allow disabling live rerouting', () => {
      liveRerouting.disable();
      expect((liveRerouting as any).enabled).toBe(false);
    });

    it('should not reroute when disabled', () => {
      liveRerouting.disable();

      const processReroutesSpy = jest.spyOn(liveRerouting as any, 'processReroutes');

      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      // Should not add to pending
      const pendingReroutes = (liveRerouting as any).pendingReroutes;
      expect(pendingReroutes.size).toBe(0);
      expect(processReroutesSpy).not.toHaveBeenCalled();
    });

    it('should allow re-enabling', () => {
      liveRerouting.disable();
      liveRerouting.enable();

      expect((liveRerouting as any).enabled).toBe(true);

      // Should work again
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });
      const pendingReroutes = (liveRerouting as any).pendingReroutes;
      expect(pendingReroutes.size).toBeGreaterThan(0);
    });
  });

  describe('RED PHASE: Reroute All Links', () => {
    it('should provide rerouteAll() method', () => {
      expect(liveRerouting.rerouteAll).toBeDefined();
      expect(typeof liveRerouting.rerouteAll).toBe('function');
    });

    it('should regenerate paths for all links', () => {
      // Create multiple links
      const link2 = new LinkModel('portA-out', 'portB-in', 'smooth');
      (link2 as any).id = 'link2';
      diagram.addLink(link2);

      const generatePath1 = jest.spyOn(link, 'generatePath');
      const generatePath2 = jest.spyOn(link2, 'generatePath');

      liveRerouting.rerouteAll();

      expect(generatePath1).toHaveBeenCalled();
      expect(generatePath2).toHaveBeenCalled();
    });

    it('should mark all links as dirty', () => {
      const link2 = new LinkModel('portA-out', 'portB-in', 'smooth');
      (link2 as any).id = 'link2';
      diagram.addLink(link2);

      const markDirty1 = jest.spyOn(link, 'markDirty');
      const markDirty2 = jest.spyOn(link2, 'markDirty');

      liveRerouting.rerouteAll();

      expect(markDirty1).toHaveBeenCalled();
      expect(markDirty2).toHaveBeenCalled();
    });
  });

  describe('RED PHASE: Edge Cases', () => {
    it('should handle non-existent node gracefully', () => {
      expect(() => {
        (diagram as any).emitter.emit('node:moved', { nodeId: 'non-existent', position: { x: 0, y: 0 } });
      }).not.toThrow();
    });

    it('should handle node with no ports', () => {
      const nodeC = new NodeModel({
        type: 'test',
        id: 'nodeC',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 }
      });
      diagram.addNode(nodeC);

      expect(() => {
        (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeC', position: { x: 150, y: 100 } });
      }).not.toThrow();
    });

    it('should handle non-existent link in pending reroutes', () => {
      // Manually add invalid link ID
      (liveRerouting as any).pendingReroutes.add('invalid-link-id');

      jest.useFakeTimers();
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });

      expect(() => {
        jest.advanceTimersByTime(16);
      }).not.toThrow();

      jest.useRealTimers();
    });

    it('should handle concurrent move events', () => {
      jest.useFakeTimers();

      // Rapid movements
      for (let i = 0; i < 10; i++) {
        (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: i * 10, y: 50 } });
      }

      // Should only process once after throttle
      const processReroutesSpy = jest.spyOn(liveRerouting as any, 'processReroutes');
      jest.advanceTimersByTime(16);

      expect(processReroutesSpy).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('RED PHASE: Performance', () => {
    it('should handle large number of links efficiently', () => {
      jest.useFakeTimers();

      // Create many links
      for (let i = 0; i < 100; i++) {
        const testLink = new LinkModel('portA-out', 'portB-in', 'orthogonal');
        (testLink as any).id = `link-${i}`;
        diagram.addLink(testLink);
      }

      const startTime = Date.now();
      (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: 50, y: 50 } });
      jest.advanceTimersByTime(16);
      const endTime = Date.now();

      // Should complete in reasonable time (< 100ms for 100 links)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 100)

      jest.useRealTimers();
    });

    it('should not create memory leaks with repeated movements', () => {
      jest.useFakeTimers();

      const initialPending = (liveRerouting as any).pendingReroutes.size;

      // Move many times
      for (let i = 0; i < 50; i++) {
        (diagram as any).emitter.emit('node:moved', { nodeId: 'nodeA', position: { x: i, y: 50 } });
        jest.advanceTimersByTime(16);
      }

      const finalPending = (liveRerouting as any).pendingReroutes.size;

      // Pending should be cleared (not accumulating)
      expect(finalPending).toBe(0);

      jest.useRealTimers();
    });
  });
});
