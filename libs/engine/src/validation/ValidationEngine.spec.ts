// ValidationEngine tests

// Mock nanoid and uuid
let idCounter = 0;
let uuidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: (size?: number) => 'test-id-' + (idCounter++).toString().padStart(12, '0'),
}));
jest.mock('uuid', () => ({
  v4: () => `12345678-1234-1234-1234-${(uuidCounter++).toString().padStart(12, '0')}`,
}));

import { ValidationEngine } from './ValidationEngine';
import { TypeRegistry, NodeTypeDefinition, PortTypeDefinition } from './TypeRegistry';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';

describe('ValidationEngine', () => {
  let registry: TypeRegistry;
  let engine: ValidationEngine;

  beforeEach(() => {
    idCounter = 0;
    uuidCounter = 0;
    registry = new TypeRegistry();
    engine = new ValidationEngine(registry);
  });

  describe('Node Validation', () => {
    it('should validate node successfully', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about unregistered node type in non-strict mode', () => {
      const node = new NodeModel({ type: 'unknown', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node, { strict: false });

      expect(result.valid).toBe(true); // No errors, just warnings
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.code).toBe('UNREGISTERED_NODE_TYPE');
    });

    it('should error on unregistered node type in strict mode', () => {
      const node = new NodeModel({ type: 'unknown', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node, { strict: true });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('UNKNOWN_NODE_TYPE');
    });

    it('should validate minimum port count', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'processor',
        label: 'Processor',
        minPorts: 2,
      };

      registry.registerNodeType(nodeDef);

      const node = new NodeModel({ type: 'processor', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INSUFFICIENT_PORTS');
    });

    it('should validate maximum port count', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'processor',
        label: 'Processor',
        maxPorts: 1,
      };

      registry.registerNodeType(nodeDef);

      const node = new NodeModel({ type: 'processor', position: { x: 0, y: 0 } });
      node.addPort(new PortModel({ type: 'input' }));
      node.addPort(new PortModel({ type: 'output' }));

      const result = engine.validateNode(node);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('EXCESSIVE_PORTS');
    });

    it('should run custom node validator', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'validated-node',
        label: 'Validated Node',
        validator: (node) => ({
          valid: false,
          errors: [
            {
              path: `node.${node.id}`,
              message: 'Custom validation failed',
              code: 'CUSTOM_ERROR',
              severity: 'error',
            },
          ],
          warnings: [],
        }),
      };

      registry.registerNodeType(nodeDef);

      const node = new NodeModel({ type: 'validated-node', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('CUSTOM_ERROR');
    });
  });

  describe('Port Validation', () => {
    it('should validate port successfully', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const port = new PortModel({ type: 'input' });

      const result = engine.validatePort(port, node);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about unregistered port type in non-strict mode', () => {
      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const port = new PortModel({ type: 'input', systemType: 'unknown' });

      const result = engine.validatePort(port, node, { strict: false });

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.code).toBe('UNREGISTERED_PORT_TYPE');
    });

    it('should validate maximum connections', () => {
      const portDef: PortTypeDefinition = {
        type: 'single-connection',
        label: 'Single Connection',
        direction: 'input',
        maxConnections: 1,
      };

      registry.registerPortType(portDef);

      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const port = new PortModel({ type: 'input', systemType: 'single-connection' });

      // Simulate two connections
      port.addConnection('link1');
      port.addConnection('link2');

      const result = engine.validatePort(port, node);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('EXCESSIVE_CONNECTIONS');
    });

    it('should run custom port validator', () => {
      const portDef: PortTypeDefinition = {
        type: 'validated-port',
        label: 'Validated Port',
        direction: 'input',
        validator: (port) => ({
          valid: false,
          errors: [
            {
              path: `port.${port.id}`,
              message: 'Custom port validation failed',
              code: 'CUSTOM_PORT_ERROR',
              severity: 'error',
            },
          ],
          warnings: [],
        }),
      };

      registry.registerPortType(portDef);

      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const port = new PortModel({ type: 'input', systemType: 'validated-port' });

      const result = engine.validatePort(port, node);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('CUSTOM_PORT_ERROR');
    });
  });

  describe('Link Validation', () => {
    it('should validate link successfully', () => {
      const diagram = new DiagramModel('Test');

      const node1 = new NodeModel({ type: 'source', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'target', position: { x: 100, y: 0 } });

      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'input' });

      node1.addPort(port1);
      node2.addPort(port2);

      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(port1.id, port2.id);

      const result = engine.validateLink(link, diagram);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error when source port not found', () => {
      const diagram = new DiagramModel('Test');
      const link = new LinkModel('nonexistent-source', 'nonexistent-target');

      const result = engine.validateLink(link, diagram);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.code === 'SOURCE_PORT_NOT_FOUND')).toBe(true);
    });

    it('should error when target port not found', () => {
      const diagram = new DiagramModel('Test');
      const node = new NodeModel({ type: 'source', position: { x: 0, y: 0 } });
      const port = new PortModel({ type: 'output' });

      node.addPort(port);
      diagram.addNode(node);

      const link = new LinkModel(port.id, 'nonexistent-target');

      const result = engine.validateLink(link, diagram);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'TARGET_PORT_NOT_FOUND')).toBe(true);
    });

    it('should error when connecting two input ports', () => {
      const diagram = new DiagramModel('Test');

      const node1 = new NodeModel({ type: 'node1', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'node2', position: { x: 100, y: 0 } });

      const port1 = new PortModel({ type: 'input' });
      const port2 = new PortModel({ type: 'input' });

      node1.addPort(port1);
      node2.addPort(port2);

      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(port1.id, port2.id);

      const result = engine.validateLink(link, diagram);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_PORT_CONNECTION')).toBe(true);
    });

    it('should error when connecting two output ports', () => {
      const diagram = new DiagramModel('Test');

      const node1 = new NodeModel({ type: 'node1', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'node2', position: { x: 100, y: 0 } });

      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'output' });

      node1.addPort(port1);
      node2.addPort(port2);

      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(port1.id, port2.id);

      const result = engine.validateLink(link, diagram);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_PORT_CONNECTION')).toBe(true);
    });
  });

  describe('Diagram Validation', () => {
    it('should validate empty diagram', () => {
      const diagram = new DiagramModel('Test');
      const result = engine.validateDiagram(diagram);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate diagram with nodes and links', () => {
      const diagram = new DiagramModel('Test');

      const node1 = new NodeModel({ type: 'source', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'target', position: { x: 100, y: 0 } });

      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'input' });

      node1.addPort(port1);
      node2.addPort(port2);

      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(port1.id, port2.id);
      diagram.addLink(link);

      const result = engine.validateDiagram(diagram);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should aggregate errors from multiple nodes', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'constrained',
        label: 'Constrained',
        minPorts: 2,
      };

      registry.registerNodeType(nodeDef);

      const diagram = new DiagramModel('Test');

      const node1 = new NodeModel({ type: 'constrained', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'constrained', position: { x: 100, y: 0 } });

      diagram.addNode(node1);
      diagram.addNode(node2);

      const result = engine.validateDiagram(diagram);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2); // One error per node
      expect(result.errors.every((e) => e.code === 'INSUFFICIENT_PORTS')).toBe(true);
    });
  });

  describe('Custom Validation Rules', () => {
    it('should add and execute custom node rule', () => {
      engine.addRule('node', (node) => ({
        valid: false,
        errors: [
          {
            path: `node.${node.id}`,
            message: 'Custom rule failed',
            code: 'CUSTOM_RULE',
            severity: 'error',
          },
        ],
        warnings: [],
      }));

      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CUSTOM_RULE')).toBe(true);
    });

    it('should clear rules for specific entity type', () => {
      engine.addRule('node', (node) => ({
        valid: false,
        errors: [{ path: '', message: '', code: 'ERROR', severity: 'error' }],
        warnings: [],
      }));

      expect(engine.getRulesCount('node')).toBe(1);

      engine.clearRules('node');

      expect(engine.getRulesCount('node')).toBe(0);
    });

    it('should clear all rules', () => {
      engine.addRule('node', () => ({ valid: true, errors: [], warnings: [] }));
      engine.addRule('port', () => ({ valid: true, errors: [], warnings: [] }));
      engine.addRule('link', () => ({ valid: true, errors: [], warnings: [] }));

      expect(engine.getRulesCount()).toBe(3);

      engine.clearAllRules();

      expect(engine.getRulesCount()).toBe(0);
    });

    it('should count rules correctly', () => {
      engine.addRule('node', () => ({ valid: true, errors: [], warnings: [] }));
      engine.addRule('node', () => ({ valid: true, errors: [], warnings: [] }));
      engine.addRule('port', () => ({ valid: true, errors: [], warnings: [] }));

      expect(engine.getRulesCount('node')).toBe(2);
      expect(engine.getRulesCount('port')).toBe(1);
      expect(engine.getRulesCount()).toBe(3);
    });

    it('should execute custom diagram rule', () => {
      engine.addRule('diagram', (diagram) => ({
        valid: false,
        errors: [
          {
            path: 'diagram',
            message: 'Diagram must have at least one node',
            code: 'EMPTY_DIAGRAM',
            severity: 'error',
          },
        ],
        warnings: [],
      }));

      const diagram = new DiagramModel('Test');
      const result = engine.validateDiagram(diagram);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'EMPTY_DIAGRAM')).toBe(true);
    });
  });

  describe('Validation Options', () => {
    it('should skip type validation when disabled', () => {
      const node = new NodeModel({ type: 'unknown', position: { x: 0, y: 0 } });
      const result = engine.validateNode(node, { validateTypes: false });

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should skip port validation when disabled', () => {
      const portDef: PortTypeDefinition = {
        type: 'bad-port',
        label: 'Bad Port',
        direction: 'input',
        maxConnections: 0, // Invalid but should be skipped
      };

      registry.registerPortType(portDef);

      const node = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
      const port = new PortModel({ type: 'input', systemType: 'bad-port' });
      node.addPort(port);

      const result = engine.validateNode(node, { validatePorts: false });

      expect(result.valid).toBe(true);
    });

    it('should skip connection validation when disabled', () => {
      const diagram = new DiagramModel('Test');
      const link = new LinkModel('nonexistent', 'nonexistent');

      const result = engine.validateLink(link, diagram, { validateConnections: false });

      expect(result.valid).toBe(true);
    });
  });
});
