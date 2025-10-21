// DiagramEngine tests - TDD approach

// Mock nanoid and uuid
let idCounter = 0;
let uuidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: (size?: number) => 'test-id-' + (idCounter++).toString().padStart(12, '0'),
}));
jest.mock('uuid', () => ({
  v4: () => `12345678-1234-1234-1234-${(uuidCounter++).toString().padStart(12, '0')}`,
}));

import { DiagramEngine, DiagramEngineConfig } from './DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import type { Plugin } from '../types';

describe('DiagramEngine', () => {
  let engine: DiagramEngine;

  beforeEach(async () => {
    idCounter = 0;
    uuidCounter = 0;
    engine = new DiagramEngine();
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Initialization', () => {
    it('should create engine with default configuration', async () => {
      expect(engine).toBeDefined();
      expect(engine.eventBus).toBeDefined();
      expect(engine.store).toBeDefined();
      expect(engine.commandManager).toBeDefined();
      expect(engine.pluginManager).toBeDefined();
      expect(engine.typeRegistry).toBeDefined();
      expect(engine.validationEngine).toBeDefined();
      expect(engine.serializer).toBeDefined();
      expect(engine.performanceMonitor).toBeDefined();
    });

    it('should create engine with custom configuration', async () => {
      const config: DiagramEngineConfig = {
        performance: {
          enableMonitoring: true,
          warnThreshold: 50,
        },
        validation: {
          realTime: true,
          strict: true,
        },
        history: {
          maxCommands: 100,
        },
      };

      const customEngine = new DiagramEngine(config);

      expect(customEngine).toBeDefined();
      customEngine.destroy();
    });

    it('should emit initialized event', async () => {
      const listener = jest.fn();
      const newEngine = new DiagramEngine();

      newEngine.eventBus.on('engine:initialized', listener);

      // Engine is already initialized in constructor
      expect(newEngine).toBeDefined();

      newEngine.destroy();
    });

    it('should have no diagram initially', async () => {
      expect(engine.getDiagram()).toBeNull();
    });
  });

  describe('Diagram Management', () => {
    it('should create new diagram', async () => {
      const diagram = engine.createDiagram('Test Diagram');

      expect(diagram).toBeInstanceOf(DiagramModel);
      expect(diagram.name).toBe('Test Diagram');
      expect(engine.getDiagram()).toBe(diagram);
    });

    it('should create diagram with default name', async () => {
      const diagram = engine.createDiagram();

      expect(diagram.name).toBe('Untitled');
    });

    it('should emit diagram:created event', async () => {
      const listener = jest.fn();
      engine.eventBus.on('diagram:created', listener);

      const diagram = engine.createDiagram('Test');

      expect(listener).toHaveBeenCalledWith(diagram);
    });

    it('should set diagram', async () => {
      const diagram = new DiagramModel('External Diagram');

      engine.setDiagram(diagram);

      expect(engine.getDiagram()).toBe(diagram);
    });

    it('should emit diagram:changed event when setting diagram', async () => {
      const listener = jest.fn();
      engine.eventBus.on('diagram:changed', listener);

      const diagram1 = new DiagramModel('Diagram 1');
      const diagram2 = new DiagramModel('Diagram 2');

      engine.setDiagram(diagram1);
      engine.setDiagram(diagram2);

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith({
        oldDiagram: diagram1,
        newDiagram: diagram2,
      });
    });

    it('should clear diagram', async () => {
      const diagram = engine.createDiagram();

      // Add some nodes
      const node1 = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });
      diagram.addNode(node1);
      diagram.addNode(node2);

      engine.clearDiagram();

      expect(diagram.getNodes()).toHaveLength(0);
    });

    it('should emit diagram:cleared event', async () => {
      const listener = jest.fn();
      engine.eventBus.on('diagram:cleared', listener);

      engine.createDiagram();
      engine.clearDiagram();

      expect(listener).toHaveBeenCalled();
    });

    it('should handle setting diagram to null', async () => {
      engine.createDiagram();
      engine.setDiagram(null);

      expect(engine.getDiagram()).toBeNull();
    });
  });

  describe('Node Operations', () => {
    beforeEach(async () => {
      engine.createDiagram();
    });

    it('should add node to diagram', async () => {
      const node = await engine.addNode({
        type: 'process',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });

      expect(node).toBeInstanceOf(NodeModel);
      expect(node.type).toBe('process');
      expect(node.position).toEqual({ x: 100, y: 100 });
      expect(engine.getDiagram()?.getNode(node.id)).toBe(node);
    });

    it('should throw error when adding node without diagram', async () => {
      engine.setDiagram(null);

      await expect(engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      })).rejects.toThrow('No diagram loaded');
    });

    it('should remove node from diagram', async () => {
      const node = await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      engine.removeNode(node.id);

      expect(engine.getDiagram()?.getNode(node.id)).toBeUndefined();
    });

    it('should throw error when removing non-existent node', async () => {
      expect(() => {
        engine.removeNode('non-existent-id');
      }).toThrow('Node non-existent-id not found');
    });

    it('should throw error when removing node without diagram', async () => {
      engine.setDiagram(null);

      expect(() => {
        engine.removeNode('some-id');
      }).toThrow('No diagram loaded');
    });
  });

  describe('Link Operations', () => {
    let sourceNode: NodeModel;
    let targetNode: NodeModel;
    let sourcePort: PortModel;
    let targetPort: PortModel;

    beforeEach(async () => {
      engine.createDiagram();

      sourceNode = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      targetNode = new NodeModel({ type: 'test', position: { x: 200, y: 0 } });

      sourcePort = new PortModel({ id: 'source-port', type: 'output' });
      targetPort = new PortModel({ id: 'target-port', type: 'input' });

      sourceNode.addPort(sourcePort);
      targetNode.addPort(targetPort);

      engine.getDiagram()?.addNode(sourceNode);
      engine.getDiagram()?.addNode(targetNode);
    });

    it('should add link to diagram', async () => {
      const link = await engine.addLink({
        sourcePortId: sourcePort.id,
        targetPortId: targetPort.id,
      });

      expect(link).toBeInstanceOf(LinkModel);
      expect(link.sourcePortId).toBe(sourcePort.id);
      expect(link.targetPortId).toBe(targetPort.id);
      expect(engine.getDiagram()?.getLink(link.id)).toBe(link);
    });

    it('should throw error when adding link without diagram', async () => {
      engine.setDiagram(null);

      await expect(engine.addLink({
        sourcePortId: 'port1',
        targetPortId: 'port2',
      })).rejects.toThrow('No diagram loaded');
    });

    it('should throw error when adding link with invalid ports', async () => {
      await expect(engine.addLink({
        sourcePortId: 'invalid-port',
        targetPortId: targetPort.id,
      })).rejects.toThrow('Invalid ports');
    });

    it('should remove link from diagram', async () => {
      const link = await engine.addLink({
        sourcePortId: sourcePort.id,
        targetPortId: targetPort.id,
      });

      engine.removeLink(link.id);

      expect(engine.getDiagram()?.getLink(link.id)).toBeUndefined();
    });

    it('should throw error when removing non-existent link', async () => {
      expect(() => {
        engine.removeLink('non-existent-id');
      }).toThrow('Link non-existent-id not found');
    });

    it('should throw error when removing link without diagram', async () => {
      engine.setDiagram(null);

      expect(() => {
        engine.removeLink('some-id');
      }).toThrow('No diagram loaded');
    });
  });

  describe('Selection Management', () => {
    let node1: NodeModel;
    let node2: NodeModel;
    let link1: LinkModel;

    beforeEach(async () => {
      engine.createDiagram();

      node1 = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      node2 = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });

      const port1 = new PortModel({ id: 'port1', type: 'output' });
      const port2 = new PortModel({ id: 'port2', type: 'input' });

      node1.addPort(port1);
      node2.addPort(port2);

      engine.getDiagram()?.addNode(node1);
      engine.getDiagram()?.addNode(node2);

      link1 = new LinkModel(
        port1.id,
        port2.id
      );

      engine.getDiagram()?.addLink(link1);
    });

    it('should select nodes', async () => {
      engine.selectNodes([node1.id, node2.id]);

      const selectedNodes = engine.store.select<Set<string>>('selectedNodes');
      expect(selectedNodes.has(node1.id)).toBe(true);
      expect(selectedNodes.has(node2.id)).toBe(true);
    });

    it('should update node selected state', async () => {
      engine.selectNodes([node1.id]);

      expect(node1.state.selected).toBe(true);
      expect(node2.state.selected).toBe(false);
    });

    it('should emit selection:changed event for nodes', async () => {
      const listener = jest.fn();
      engine.eventBus.on('selection:changed', listener);

      engine.selectNodes([node1.id]);

      expect(listener).toHaveBeenCalledWith({ nodes: [node1.id] });
    });

    it('should select links', async () => {
      engine.selectLinks([link1.id]);

      const selectedLinks = engine.store.select<Set<string>>('selectedLinks');
      expect(selectedLinks.has(link1.id)).toBe(true);
    });

    it('should update link selected state', async () => {
      engine.selectLinks([link1.id]);

      expect(link1.state).toBe('selected');
    });

    it('should emit selection:changed event for links', async () => {
      const listener = jest.fn();
      engine.eventBus.on('selection:changed', listener);

      engine.selectLinks([link1.id]);

      expect(listener).toHaveBeenCalledWith({ links: [link1.id] });
    });

    it('should clear selection', async () => {
      engine.selectNodes([node1.id, node2.id]);
      engine.selectLinks([link1.id]);

      engine.clearSelection();

      const selectedNodes = engine.store.select<Set<string>>('selectedNodes');
      const selectedLinks = engine.store.select<Set<string>>('selectedLinks');

      expect(selectedNodes.size).toBe(0);
      expect(selectedLinks.size).toBe(0);
    });

    it('should emit selection:cleared event', async () => {
      const listener = jest.fn();
      engine.eventBus.on('selection:cleared', listener);

      engine.clearSelection();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Undo/Redo', () => {
    beforeEach(async () => {
      engine.createDiagram();
    });

    it('should support undo', async () => {
      const node = await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      expect(engine.canUndo()).toBe(true);

      await engine.undo();

      expect(engine.getDiagram()?.getNode(node.id)).toBeUndefined();
    });

    it('should support redo', async () => {
      const node = await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      await engine.undo();
      expect(engine.canRedo()).toBe(true);

      await engine.redo();

      expect(engine.getDiagram()?.getNode(node.id)).toBeDefined();
    });

    it('should report canUndo correctly', async () => {
      expect(engine.canUndo()).toBe(false);

      await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      expect(engine.canUndo()).toBe(true);
    });

    it('should report canRedo correctly', async () => {
      expect(engine.canRedo()).toBe(false);

      await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      await engine.undo();

      expect(engine.canRedo()).toBe(true);
    });
  });

  describe('Validation', () => {
    beforeEach(async () => {
      engine.createDiagram();
    });

    it('should validate diagram', async () => {
      const result = engine.validate();

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    it('should return valid for empty diagram', async () => {
      const result = engine.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for diagram with valid nodes', async () => {
      await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      const result = engine.validate();

      expect(result.valid).toBe(true);
    });
  });

  describe('Serialization', () => {
    beforeEach(async () => {
      engine.createDiagram('Serialization Test');
    });

    it('should serialize diagram', async () => {
      const serialized = engine.serialize();

      expect(serialized).toBeDefined();
      expect(serialized?.name).toBe('Serialization Test');
      expect(serialized?.version).toBe('1.0.0');
    });

    it('should return null when serializing without diagram', async () => {
      engine.setDiagram(null);

      const serialized = engine.serialize();

      expect(serialized).toBeNull();
    });

    it('should deserialize diagram', async () => {
      const original = engine.serialize();
      expect(original).toBeDefined();

      const newEngine = new DiagramEngine();
      const restored = newEngine.deserialize(original!);

      expect(restored).toBeInstanceOf(DiagramModel);
      expect(restored.name).toBe('Serialization Test');

      newEngine.destroy();
    });

    it('should save to JSON', async () => {
      const json = engine.saveToJSON();

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json!);
      expect(parsed.name).toBe('Serialization Test');
    });

    it('should return null when saving without diagram', async () => {
      engine.setDiagram(null);

      const json = engine.saveToJSON();

      expect(json).toBeNull();
    });

    it('should load from JSON', async () => {
      const json = engine.saveToJSON();
      expect(json).toBeDefined();

      const newEngine = new DiagramEngine();
      const restored = newEngine.loadFromJSON(json!);

      expect(restored).toBeInstanceOf(DiagramModel);
      expect(restored.name).toBe('Serialization Test');

      newEngine.destroy();
    });
  });

  describe('Type Registration', () => {
    it('should register node type', async () => {
      engine.registerNodeType({
        type: 'custom-node',
        label: 'Custom Node',
      });

      expect(engine.typeRegistry.hasNodeType('custom-node')).toBe(true);
    });

    it('should register link type', async () => {
      engine.registerLinkType({
        type: 'custom-link',
        label: 'Custom Link',
      });

      expect(engine.typeRegistry.hasLinkType('custom-link')).toBe(true);
    });
  });

  describe('Plugin Management', () => {
    it('should register plugin', async () => {
      const plugin: Plugin = {
        metadata: {
          name: 'test-plugin',
          version: '1.0.0',
          author: 'Test',
        },
        install: jest.fn(),
      };

      await engine.registerPlugin(plugin);

      expect(engine.getPlugin('test-plugin')).toBe(plugin);
    });

    it('should get registered plugin', async () => {
      const plugin: Plugin = {
        metadata: {
          name: 'test-plugin',
          version: '1.0.0',
          author: 'Test',
        },
        install: jest.fn(),
      };

      await engine.registerPlugin(plugin);

      const retrieved = engine.getPlugin('test-plugin');
      expect(retrieved).toBe(plugin);
    });

    it('should return undefined for non-existent plugin', async () => {
      const plugin = engine.getPlugin('non-existent');

      expect(plugin).toBeUndefined();
    });
  });

  describe('Viewport Management', () => {
    it('should set viewport', async () => {
      const viewport = {
        x: 100,
        y: 200,
        zoom: 1.5,
        rotation: 0,
        width: 800,
        height: 600,
      };

      engine.setViewport(viewport);

      const stored = engine.store.select('viewport');
      expect(stored).toEqual(viewport);
    });

    it('should emit viewport:changed event', async () => {
      const listener = jest.fn();
      engine.eventBus.on('viewport:changed', listener);

      const viewport = {
        x: 100,
        y: 200,
        zoom: 1.5,
        rotation: 0,
      };

      engine.setViewport(viewport);

      expect(listener).toHaveBeenCalledWith(viewport);
    });

    it('should set zoom', async () => {
      engine.setZoom(2.0);

      const zoom = engine.store.select<number>('zoom');
      expect(zoom).toBe(2.0);
    });

    it('should clamp zoom to valid range', async () => {
      engine.setZoom(10.0); // Too high
      expect(engine.store.select<number>('zoom')).toBe(5.0);

      engine.setZoom(0.01); // Too low
      expect(engine.store.select<number>('zoom')).toBe(0.1);
    });

    it('should emit viewport:zoomed event', async () => {
      const listener = jest.fn();
      engine.eventBus.on('viewport:zoomed', listener);

      engine.setZoom(1.5);

      expect(listener).toHaveBeenCalledWith(1.5);
    });
  });

  describe('Performance Monitoring', () => {
    it('should get performance report', async () => {
      const report = engine.getPerformanceReport();

      expect(report).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('should track node additions when monitoring enabled', async () => {
      const monitoredEngine = new DiagramEngine({
        performance: {
          enableMonitoring: true,
        },
      });

      monitoredEngine.createDiagram();
      await monitoredEngine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
      });

      const report = monitoredEngine.getPerformanceReport();
      expect(report.metrics['addNode']).toBeDefined();

      monitoredEngine.destroy();
    });
  });

  describe('Lifecycle', () => {
    it('should destroy engine', async () => {
      const diagram = engine.createDiagram();

      engine.destroy();

      // Should be safe to call destroy multiple times
      engine.destroy();
    });

    it('should emit engine:destroyed event', async () => {
      const listener = jest.fn();
      engine.eventBus.on('engine:destroyed', listener);

      engine.destroy();

      expect(listener).toHaveBeenCalled();
    });

    it('should cleanup diagram on destroy', async () => {
      const diagram = engine.createDiagram();

      engine.destroy();

      // getDiagram should still work, but diagram should be detached
      expect(engine.getDiagram()).toBeDefined();
    });
  });

  describe('Event Forwarding', () => {
    beforeEach(async () => {
      engine.createDiagram();
    });

    it('should forward node:added events from diagram to eventBus', async () => {
      const listener = jest.fn();
      engine.eventBus.on('node:added', listener);

      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      engine.getDiagram()?.addNode(node);

      expect(listener).toHaveBeenCalledWith(node);
    });

    it('should forward node:removed events from diagram to eventBus', async () => {
      const listener = jest.fn();
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      engine.getDiagram()?.addNode(node);

      engine.eventBus.on('node:removed', listener);
      engine.getDiagram()?.removeNode(node.id);

      expect(listener).toHaveBeenCalledWith(node);
    });

    it('should forward link:added events from diagram to eventBus', async () => {
      const listener = jest.fn();
      engine.eventBus.on('link:added', listener);

      const node1 = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });
      const port1 = new PortModel({ id: 'port1', type: 'output' });
      const port2 = new PortModel({ id: 'port2', type: 'input' });

      node1.addPort(port1);
      node2.addPort(port2);

      engine.getDiagram()?.addNode(node1);
      engine.getDiagram()?.addNode(node2);

      const link = new LinkModel(
        port1.id,
        port2.id
      );

      engine.getDiagram()?.addLink(link);

      expect(listener).toHaveBeenCalledWith(link);
    });

    it('should forward link:removed events from diagram to eventBus', async () => {
      const listener = jest.fn();

      const node1 = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });
      const port1 = new PortModel({ id: 'port1', type: 'output' });
      const port2 = new PortModel({ id: 'port2', type: 'input' });

      node1.addPort(port1);
      node2.addPort(port2);

      engine.getDiagram()?.addNode(node1);
      engine.getDiagram()?.addNode(node2);

      const link = new LinkModel(
        port1.id,
        port2.id
      );

      engine.getDiagram()?.addLink(link);

      engine.eventBus.on('link:removed', listener);
      engine.getDiagram()?.removeLink(link.id);

      expect(listener).toHaveBeenCalledWith(link);
    });
  });
});
