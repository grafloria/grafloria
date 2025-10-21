// TypeRegistry tests

import { TypeRegistry, NodeTypeDefinition, PortTypeDefinition, LinkTypeDefinition } from './TypeRegistry';

describe('TypeRegistry', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Node Type Registration', () => {
    it('should register a node type', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'custom-node',
        label: 'Custom Node',
        description: 'A custom node type',
      };

      registry.registerNodeType(nodeDef);

      expect(registry.hasNodeType('custom-node')).toBe(true);
      expect(registry.getNodeType('custom-node')).toEqual(nodeDef);
    });

    it('should throw when registering duplicate node type', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'custom-node',
        label: 'Custom Node',
      };

      registry.registerNodeType(nodeDef);

      expect(() => registry.registerNodeType(nodeDef)).toThrow(
        "Node type 'custom-node' is already registered"
      );
    });

    it('should unregister a node type', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'custom-node',
        label: 'Custom Node',
      };

      registry.registerNodeType(nodeDef);
      const result = registry.unregisterNodeType('custom-node');

      expect(result).toBe(true);
      expect(registry.hasNodeType('custom-node')).toBe(false);
    });

    it('should return false when unregistering non-existent node type', () => {
      const result = registry.unregisterNodeType('nonexistent');
      expect(result).toBe(false);
    });

    it('should list all node types', () => {
      const node1: NodeTypeDefinition = { type: 'type1', label: 'Type 1' };
      const node2: NodeTypeDefinition = { type: 'type2', label: 'Type 2' };

      registry.registerNodeType(node1);
      registry.registerNodeType(node2);

      const types = registry.listNodeTypes();

      expect(types).toHaveLength(2);
      expect(types).toContainEqual(node1);
      expect(types).toContainEqual(node2);
    });
  });

  describe('Port Type Registration', () => {
    it('should register a port type', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'input',
        maxConnections: 1,
      };

      registry.registerPortType(portDef);

      expect(registry.hasPortType('data-port')).toBe(true);
      expect(registry.getPortType('data-port')).toEqual(portDef);
    });

    it('should throw when registering duplicate port type', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'input',
      };

      registry.registerPortType(portDef);

      expect(() => registry.registerPortType(portDef)).toThrow(
        "Port type 'data-port' is already registered"
      );
    });

    it('should unregister a port type', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'input',
      };

      registry.registerPortType(portDef);
      const result = registry.unregisterPortType('data-port');

      expect(result).toBe(true);
      expect(registry.hasPortType('data-port')).toBe(false);
    });

    it('should list all port types', () => {
      const port1: PortTypeDefinition = { type: 'type1', label: 'Type 1', direction: 'input' };
      const port2: PortTypeDefinition = { type: 'type2', label: 'Type 2', direction: 'output' };

      registry.registerPortType(port1);
      registry.registerPortType(port2);

      const types = registry.listPortTypes();

      expect(types).toHaveLength(2);
      expect(types).toContainEqual(port1);
      expect(types).toContainEqual(port2);
    });
  });

  describe('Link Type Registration', () => {
    it('should register a link type', () => {
      const linkDef: LinkTypeDefinition = {
        type: 'data-link',
        label: 'Data Link',
        allowedSourcePortTypes: ['output'],
        allowedTargetPortTypes: ['input'],
      };

      registry.registerLinkType(linkDef);

      expect(registry.hasLinkType('data-link')).toBe(true);
      expect(registry.getLinkType('data-link')).toEqual(linkDef);
    });

    it('should throw when registering duplicate link type', () => {
      const linkDef: LinkTypeDefinition = {
        type: 'data-link',
        label: 'Data Link',
      };

      registry.registerLinkType(linkDef);

      expect(() => registry.registerLinkType(linkDef)).toThrow(
        "Link type 'data-link' is already registered"
      );
    });

    it('should unregister a link type', () => {
      const linkDef: LinkTypeDefinition = {
        type: 'data-link',
        label: 'Data Link',
      };

      registry.registerLinkType(linkDef);
      const result = registry.unregisterLinkType('data-link');

      expect(result).toBe(true);
      expect(registry.hasLinkType('data-link')).toBe(false);
    });

    it('should list all link types', () => {
      const link1: LinkTypeDefinition = { type: 'type1', label: 'Type 1' };
      const link2: LinkTypeDefinition = { type: 'type2', label: 'Type 2' };

      registry.registerLinkType(link1);
      registry.registerLinkType(link2);

      const types = registry.listLinkTypes();

      expect(types).toHaveLength(2);
      expect(types).toContainEqual(link1);
      expect(types).toContainEqual(link2);
    });
  });

  describe('Clear and Stats', () => {
    it('should clear all registered types', () => {
      registry.registerNodeType({ type: 'node1', label: 'Node 1' });
      registry.registerPortType({ type: 'port1', label: 'Port 1', direction: 'input' });
      registry.registerLinkType({ type: 'link1', label: 'Link 1' });

      registry.clear();

      expect(registry.hasNodeType('node1')).toBe(false);
      expect(registry.hasPortType('port1')).toBe(false);
      expect(registry.hasLinkType('link1')).toBe(false);
    });

    it('should return correct stats', () => {
      registry.registerNodeType({ type: 'node1', label: 'Node 1' });
      registry.registerNodeType({ type: 'node2', label: 'Node 2' });
      registry.registerPortType({ type: 'port1', label: 'Port 1', direction: 'input' });
      registry.registerLinkType({ type: 'link1', label: 'Link 1' });

      const stats = registry.getStats();

      expect(stats).toEqual({
        nodeTypes: 2,
        portTypes: 1,
        linkTypes: 1,
      });
    });
  });

  describe('Complex Type Definitions', () => {
    it('should register node type with constraints', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'processor',
        label: 'Processor Node',
        description: 'Processes data',
        minPorts: 2,
        maxPorts: 10,
        allowedPortTypes: ['data-input', 'data-output'],
        validator: (node) => ({
          valid: true,
          errors: [],
          warnings: [],
        }),
      };

      registry.registerNodeType(nodeDef);

      const retrieved = registry.getNodeType('processor');
      expect(retrieved).toBeDefined();
      expect(retrieved!.minPorts).toBe(2);
      expect(retrieved!.maxPorts).toBe(10);
      expect(retrieved!.validator).toBeDefined();
    });

    it('should register port type with constraints', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'bi',
        maxConnections: 5,
        allowedLinkTypes: ['data-link', 'control-link'],
        validator: (port) => ({
          valid: true,
          errors: [],
          warnings: [],
        }),
      };

      registry.registerPortType(portDef);

      const retrieved = registry.getPortType('data-port');
      expect(retrieved).toBeDefined();
      expect(retrieved!.maxConnections).toBe(5);
      expect(retrieved!.allowedLinkTypes).toEqual(['data-link', 'control-link']);
      expect(retrieved!.validator).toBeDefined();
    });
  });
});
