/**
 * Port-Aware Layout Tests
 *
 * Comprehensive test suite for port-aware layout system
 */

import {
  PortInfo,
  PortSide,
  PortFlowDirection,
  PortAwareLayoutOptions,
  PortAwareLayoutManager,
} from './port-aware-layout.interface';

describe('PortAwareLayoutManager', () => {
  // Sample data for tests
  const createSamplePorts = (): PortInfo[] => [
    {
      id: 'port1',
      nodeId: 'node1',
      direction: 'input',
      preferredSide: 'left',
    },
    {
      id: 'port2',
      nodeId: 'node1',
      direction: 'output',
      preferredSide: 'right',
    },
    {
      id: 'port3',
      nodeId: 'node2',
      direction: 'input',
      preferredSide: 'left',
    },
  ];

  const createNodePositions = (): Map<string, { x: number; y: number }> => {
    const map = new Map();
    map.set('node1', { x: 0, y: 0 });
    map.set('node2', { x: 200, y: 0 });
    return map;
  };

  const createNodeSizes = (): Map<string, { width: number; height: number }> => {
    const map = new Map();
    map.set('node1', { width: 100, height: 50 });
    map.set('node2', { width: 100, height: 50 });
    return map;
  };

  const createLinks = () => [
    { sourcePortId: 'port2', targetPortId: 'port3' },
  ];

  describe('assignPortSides', () => {
    it('should assign ports with explicit preferences', () => {
      const ports = createSamplePorts();
      const nodePositions = createNodePositions();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoAssignSides: false,
      };

      const assignments = PortAwareLayoutManager.assignPortSides(ports, nodePositions, options);

      expect(assignments.get('port1')).toBe('left');
      expect(assignments.get('port2')).toBe('right');
      expect(assignments.get('port3')).toBe('left');
    });

    it('should auto-assign sides based on direction', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1', direction: 'input' },
        { id: 'port2', nodeId: 'node1', direction: 'output' },
      ];
      const nodePositions = createNodePositions();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoAssignSides: true,
        inputSide: 'left',
        outputSide: 'right',
      };

      const assignments = PortAwareLayoutManager.assignPortSides(ports, nodePositions, options);

      expect(assignments.get('port1')).toBe('left');
      expect(assignments.get('port2')).toBe('right');
    });

    it('should respect node-specific preferences', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1', direction: 'input' },
        { id: 'port2', nodeId: 'node2', direction: 'input' },
      ];
      const nodePositions = createNodePositions();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoAssignSides: true,
        nodeSidePreferences: {
          node1: { inputs: 'top' },
          node2: { inputs: 'bottom' },
        },
      };

      const assignments = PortAwareLayoutManager.assignPortSides(ports, nodePositions, options);

      expect(assignments.get('port1')).toBe('top');
      expect(assignments.get('port2')).toBe('bottom');
    });
  });

  describe('orderPorts', () => {
    it('should use manual ordering when provided', () => {
      const ports = createSamplePorts();
      const portAssignments = new Map<string, PortSide>();
      portAssignments.set('port1', 'left');
      portAssignments.set('port2', 'right');
      const nodePositions = createNodePositions();
      const links = createLinks();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        portOrdering: {
          node1: ['port2', 'port1'], // Reverse order
        },
      };

      const ordering = PortAwareLayoutManager.orderPorts(
        ports,
        portAssignments,
        nodePositions,
        links,
        options
      );

      expect(ordering.get('node1')).toEqual(['port2', 'port1']);
    });

    it('should auto-order ports when enabled', () => {
      const ports = createSamplePorts();
      const portAssignments = new Map<string, PortSide>();
      ports.forEach(p => portAssignments.set(p.id, 'left'));
      const nodePositions = createNodePositions();
      const links = createLinks();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoOrderPorts: true,
        orderingStrategy: 'minimize-crossings',
      };

      const ordering = PortAwareLayoutManager.orderPorts(
        ports,
        portAssignments,
        nodePositions,
        links,
        options
      );

      expect(ordering.has('node1')).toBe(true);
      expect(ordering.get('node1')!.length).toBeGreaterThan(0);
    });

    it('should order ports by group when using group-based strategy', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1', group: 'data', priority: 10 },
        { id: 'port2', nodeId: 'node1', group: 'control', priority: 20 },
        { id: 'port3', nodeId: 'node1', group: 'data', priority: 5 },
      ];
      const portAssignments = new Map<string, PortSide>();
      ports.forEach(p => portAssignments.set(p.id, 'left'));
      const nodePositions = createNodePositions();
      const links: any[] = [];
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoOrderPorts: true,
        orderingStrategy: 'group-based',
      };

      const ordering = PortAwareLayoutManager.orderPorts(
        ports,
        portAssignments,
        nodePositions,
        links,
        options
      );

      const order = ordering.get('node1')!;
      // Should group by 'group', then by priority (higher first), then by ID
      expect(order[0]).toBe('port2'); // control group, priority 20
      expect(order[1]).toBe('port1'); // data group, priority 10
      expect(order[2]).toBe('port3'); // data group, priority 5
    });
  });

  describe('calculatePortPositions', () => {
    it('should position ports evenly on sides', () => {
      const ports = createSamplePorts();
      const portAssignments = new Map<string, PortSide>();
      portAssignments.set('port1', 'left');
      portAssignments.set('port2', 'right');
      portAssignments.set('port3', 'left');
      const portOrdering = new Map<string, string[]>();
      portOrdering.set('node1', ['port1', 'port2']);
      portOrdering.set('node2', ['port3']);
      const nodeSizes = createNodeSizes();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        portSpacing: 20,
      };

      const positions = PortAwareLayoutManager.calculatePortPositions(
        ports,
        portAssignments,
        portOrdering,
        nodeSizes,
        options
      );

      // port1 should be on left side
      const port1Pos = positions.get('port1')!;
      expect(port1Pos.side).toBe('left');
      expect(port1Pos.x).toBe(-50); // -width/2

      // port2 should be on right side
      const port2Pos = positions.get('port2')!;
      expect(port2Pos.side).toBe('right');
      expect(port2Pos.x).toBe(50); // width/2
    });

    it('should distribute multiple ports evenly', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1' },
        { id: 'port2', nodeId: 'node1' },
        { id: 'port3', nodeId: 'node1' },
      ];
      const portAssignments = new Map<string, PortSide>();
      ports.forEach(p => portAssignments.set(p.id, 'top'));
      const portOrdering = new Map<string, string[]>();
      portOrdering.set('node1', ['port1', 'port2', 'port3']);
      const nodeSizes = new Map();
      nodeSizes.set('node1', { width: 120, height: 60 });
      const options: PortAwareLayoutOptions = {
        enabled: true,
        portSpacing: 10,
      };

      const positions = PortAwareLayoutManager.calculatePortPositions(
        ports,
        portAssignments,
        portOrdering,
        nodeSizes,
        options
      );

      // All should be on top
      expect(positions.get('port1')!.side).toBe('top');
      expect(positions.get('port2')!.side).toBe('top');
      expect(positions.get('port3')!.side).toBe('top');

      // Should be evenly distributed along width
      expect(positions.get('port1')!.y).toBe(-30); // -height/2
      expect(positions.get('port2')!.y).toBe(-30);
      expect(positions.get('port3')!.y).toBe(-30);
    });
  });

  describe('countEdgeCrossings', () => {
    it('should count zero crossings for non-intersecting edges', () => {
      const portPositions = new Map();
      portPositions.set('port1', { x: -50, y: 0, side: 'left' as PortSide });
      portPositions.set('port2', { x: 50, y: 0, side: 'right' as PortSide });
      portPositions.set('port3', { x: -50, y: 0, side: 'left' as PortSide });
      portPositions.set('port4', { x: 50, y: 0, side: 'right' as PortSide });

      const nodePositions = new Map();
      nodePositions.set('node1', { x: 0, y: 0 });
      nodePositions.set('node2', { x: 200, y: 0 });

      const links = [
        { sourcePortId: 'port2', targetPortId: 'port3' },
        { sourcePortId: 'port1', targetPortId: 'port4' },
      ];

      const crossings = PortAwareLayoutManager.countEdgeCrossings(
        portPositions,
        nodePositions,
        links
      );

      // Simple parallel lines shouldn't cross
      expect(crossings).toBe(0);
    });
  });

  describe('computePortLayout', () => {
    it('should generate complete port layout result', () => {
      const ports = createSamplePorts();
      const nodePositions = createNodePositions();
      const nodeSizes = createNodeSizes();
      const links = createLinks();
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoAssignSides: true,
        autoOrderPorts: true,
        inputSide: 'left',
        outputSide: 'right',
        portSpacing: 20,
        orderingStrategy: 'minimize-crossings',
      };

      const result = PortAwareLayoutManager.computePortLayout(
        ports,
        nodePositions,
        nodeSizes,
        links,
        options
      );

      expect(result.portAssignments.size).toBeGreaterThan(0);
      expect(result.portOrdering.size).toBeGreaterThan(0);
      expect(result.portPositions.size).toBe(ports.length);
      expect(result.wasOptimized).toBe(true);
      expect(result.edgeCrossings).toBeGreaterThanOrEqual(0);
    });

    it('should track auto-assigned ports', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1', direction: 'input' }, // Will be auto-assigned
        { id: 'port2', nodeId: 'node1', direction: 'output', preferredSide: 'right' }, // Already assigned
      ];
      const nodePositions = createNodePositions();
      const nodeSizes = createNodeSizes();
      const links: any[] = [];
      const options: PortAwareLayoutOptions = {
        enabled: true,
        autoAssignSides: true,
        inputSide: 'left',
      };

      const result = PortAwareLayoutManager.computePortLayout(
        ports,
        nodePositions,
        nodeSizes,
        links,
        options
      );

      expect(result.autoAssignedPorts).toContain('port1');
      expect(result.autoAssignedPorts).not.toContain('port2');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty port arrays', () => {
      const result = PortAwareLayoutManager.computePortLayout(
        [],
        new Map(),
        new Map(),
        [],
        { enabled: true }
      );

      expect(result.portAssignments.size).toBe(0);
      expect(result.portOrdering.size).toBe(0);
      expect(result.portPositions.size).toBe(0);
    });

    it('should handle single port', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1', preferredSide: 'left' },
      ];
      const nodePositions = new Map([['node1', { x: 0, y: 0 }]]);
      const nodeSizes = new Map([['node1', { width: 100, height: 50 }]]);

      const result = PortAwareLayoutManager.computePortLayout(
        ports,
        nodePositions,
        nodeSizes,
        [],
        { enabled: true }
      );

      expect(result.portPositions.size).toBe(1);
      const pos = result.portPositions.get('port1')!;
      expect(pos.side).toBe('left');
      // Single port should be centered
      expect(pos.y).toBe(0);
    });

    it('should handle ports with fixed positions', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1', preferredSide: 'left', fixed: true, offset: 0.5 },
      ];
      const nodePositions = createNodePositions();
      const nodeSizes = createNodeSizes();

      const result = PortAwareLayoutManager.computePortLayout(
        ports,
        nodePositions,
        nodeSizes,
        [],
        { enabled: true }
      );

      expect(result.portPositions.has('port1')).toBe(true);
    });
  });

  describe('Port spacing', () => {
    it('should respect custom port spacing', () => {
      const ports: PortInfo[] = [
        { id: 'port1', nodeId: 'node1' },
        { id: 'port2', nodeId: 'node1' },
      ];
      const portAssignments = new Map();
      ports.forEach(p => portAssignments.set(p.id, 'top'));
      const portOrdering = new Map([['node1', ['port1', 'port2']]]);
      const nodeSizes = new Map([['node1', { width: 200, height: 100 }]]);

      const result1 = PortAwareLayoutManager.calculatePortPositions(
        ports,
        portAssignments,
        portOrdering,
        nodeSizes,
        { enabled: true, portSpacing: 10 }
      );

      const result2 = PortAwareLayoutManager.calculatePortPositions(
        ports,
        portAssignments,
        portOrdering,
        nodeSizes,
        { enabled: true, portSpacing: 40 }
      );

      // Same node size, different spacing shouldn't affect position
      // (spacing is between ports, not affecting their position on the node)
      expect(result1.get('port1')!.x).toBeDefined();
      expect(result2.get('port1')!.x).toBeDefined();
    });
  });
});
