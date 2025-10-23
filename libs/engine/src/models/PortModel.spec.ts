/**
 * PortModel Unit Tests
 *
 * Tests for Phase 0.5.1-0.5.3 port functionality:
 * - Port construction with side and index
 * - Port type validation (canConnectTo)
 * - Serialization and backward compatibility
 */

import { PortModel } from './PortModel';

describe('PortModel', () => {
  describe('Construction and Properties', () => {
    it('should create port with side parameter', () => {
      const port = new PortModel({ type: 'bi', side: 'right' });

      expect(port.side).toBe('right');
      expect(port.alignment.side).toBe('right');
    });

    it('should create port with index', () => {
      const port = new PortModel({ type: 'bi', side: 'top', index: 2 });

      expect(port.index).toBe(2);
    });

    it('should default index to 0', () => {
      const port = new PortModel({ type: 'bi', side: 'left' });

      expect(port.index).toBe(0);
    });

    it('should create port with all sides', () => {
      const sides = ['top', 'right', 'bottom', 'left'] as const;

      sides.forEach(side => {
        const port = new PortModel({ type: 'bi', side });
        expect(port.side).toBe(side);
      });
    });
  });

  describe('Side Getter and Setter', () => {
    it('should get side from alignment', () => {
      const port = new PortModel({
        type: 'bi',
        alignment: { side: 'bottom', offset: 0 }
      });

      expect(port.side).toBe('bottom');
    });

    it('should set side via setter', () => {
      const port = new PortModel({ type: 'bi', side: 'top' });

      port.side = 'bottom';

      expect(port.side).toBe('bottom');
      expect(port.alignment.side).toBe('bottom');
    });

    it('should track change when setting side', () => {
      const port = new PortModel({ type: 'bi', side: 'top' });
      const changes: unknown[] = [];

      port.on('change:alignment', (e: unknown) => {
        changes.push(e);
      });

      port.side = 'bottom';

      expect(changes.length).toBe(1);
    });
  });

  describe('canConnectTo() - Port Validation', () => {
    describe('Bidirectional Ports', () => {
      it('bi port should connect to any port', () => {
        const biPort = new PortModel({ type: 'bi', side: 'right' });
        const inputPort = new PortModel({ type: 'input', side: 'left' });
        const outputPort = new PortModel({ type: 'output', side: 'left' });
        const biPort2 = new PortModel({ type: 'bi', side: 'left' });

        expect(biPort.canConnectTo(inputPort)).toBe(true);
        expect(biPort.canConnectTo(outputPort)).toBe(true);
        expect(biPort.canConnectTo(biPort2)).toBe(true);
      });

      it('input port should connect to bi port', () => {
        const inputPort = new PortModel({ type: 'input', side: 'left' });
        const biPort = new PortModel({ type: 'bi', side: 'right' });

        expect(inputPort.canConnectTo(biPort)).toBe(true);
      });

      it('output port should connect to bi port', () => {
        const outputPort = new PortModel({ type: 'output', side: 'right' });
        const biPort = new PortModel({ type: 'bi', side: 'left' });

        expect(outputPort.canConnectTo(biPort)).toBe(true);
      });
    });

    describe('Directional Ports', () => {
      it('output should connect to input', () => {
        const output = new PortModel({ type: 'output', side: 'right' });
        const input = new PortModel({ type: 'input', side: 'left' });

        expect(output.canConnectTo(input)).toBe(true);
      });

      it('input should connect to output (bidirectional check)', () => {
        const input = new PortModel({ type: 'input', side: 'left' });
        const output = new PortModel({ type: 'output', side: 'right' });

        expect(input.canConnectTo(output)).toBe(true);
      });

      it('output should NOT connect to output', () => {
        const output1 = new PortModel({ type: 'output', side: 'right' });
        const output2 = new PortModel({ type: 'output', side: 'left' });

        expect(output1.canConnectTo(output2)).toBe(false);
      });

      it('input should NOT connect to input', () => {
        const input1 = new PortModel({ type: 'input', side: 'right' });
        const input2 = new PortModel({ type: 'input', side: 'left' });

        expect(input1.canConnectTo(input2)).toBe(false);
      });
    });

    describe('Connection Capacity', () => {
      it('should respect maxConnections limit on source port', () => {
        const port = new PortModel({ type: 'bi', side: 'right', maxConnections: 1 });
        const targetPort = new PortModel({ type: 'bi', side: 'left' });

        port.addConnection('link1');

        expect(port.canConnect()).toBe(false);
        expect(port.canConnectTo(targetPort)).toBe(false);
      });

      it('should respect maxConnections limit on target port', () => {
        const sourcePort = new PortModel({ type: 'bi', side: 'right' });
        const targetPort = new PortModel({ type: 'bi', side: 'left', maxConnections: 1 });

        targetPort.addConnection('link1');

        expect(sourcePort.canConnectTo(targetPort)).toBe(false);
      });

      it('should allow connection when both ports have capacity', () => {
        const sourcePort = new PortModel({ type: 'bi', side: 'right', maxConnections: 2 });
        const targetPort = new PortModel({ type: 'bi', side: 'left', maxConnections: 2 });

        sourcePort.addConnection('link1');
        targetPort.addConnection('link2');

        expect(sourcePort.canConnectTo(targetPort)).toBe(true);
      });

      it('should allow unlimited connections when maxConnections is -1', () => {
        const port = new PortModel({ type: 'bi', side: 'right' }); // Default is -1
        const targetPort = new PortModel({ type: 'bi', side: 'left' });

        // Add many connections
        for (let i = 0; i < 100; i++) {
          port.addConnection(`link${i}`);
        }

        expect(port.canConnect()).toBe(true);
        expect(port.canConnectTo(targetPort)).toBe(true);
      });
    });
  });

  describe('Serialization and Deserialization', () => {
    it('should serialize index property', () => {
      const port = new PortModel({ type: 'bi', side: 'top', index: 3 });
      const serialized = port.serialize();

      expect(serialized.index).toBe(3);
    });

    it('should serialize all port properties', () => {
      const port = new PortModel({
        type: 'output',
        side: 'right',
        index: 2,
        maxConnections: 5
      });
      port.nodeId = 'node123';

      const serialized = port.serialize();

      expect(serialized.type).toBe('output');
      expect(serialized.alignment.side).toBe('right');
      expect(serialized.index).toBe(2);
      expect(serialized.maxConnections).toBe(5);
      expect(serialized.nodeId).toBe('node123');
    });

    it('should deserialize index property', () => {
      const data = {
        id: 'port1',
        uuid: 'uuid1',
        type: 'bi' as const,
        version: 1,
        metadata: {},
        nodeId: 'node1',
        position: { x: 0.5, y: 0 },
        alignment: { side: 'top' as const, offset: 0 },
        offset: { x: 0, y: 0 },
        index: 5,
        maxConnections: -1,
        allowedTypes: [],
        visible: true,
        style: {},
        data: {},
      };

      const port = PortModel.fromJSON(data);

      expect(port.index).toBe(5);
    });

    it('should default index to 0 for old diagrams (backward compatibility)', () => {
      const data = {
        id: 'port1',
        uuid: 'uuid1',
        type: 'bi' as const,
        version: 1,
        metadata: {},
        nodeId: 'node1',
        position: { x: 0.5, y: 0 },
        alignment: { side: 'top' as const, offset: 0 },
        offset: { x: 0, y: 0 },
        // index is missing (old diagram)
        maxConnections: -1,
        allowedTypes: [],
        visible: true,
        style: {},
        data: {},
      } as any; // Cast to any to allow missing index

      const port = PortModel.fromJSON(data);

      expect(port.index).toBe(0); // Should default to 0
    });

    it('should restore side from alignment', () => {
      const data = {
        id: 'port1',
        uuid: 'uuid1',
        type: 'input' as const,
        version: 1,
        metadata: {},
        nodeId: 'node1',
        position: { x: 0, y: 0.5 },
        alignment: { side: 'left' as const, offset: 0 },
        offset: { x: 0, y: 0 },
        index: 0,
        maxConnections: -1,
        allowedTypes: [],
        visible: true,
        style: {},
        data: {},
      };

      const port = PortModel.fromJSON(data);

      expect(port.side).toBe('left');
    });
  });

  describe('Connection Management', () => {
    it('should add connection', () => {
      const port = new PortModel({ type: 'bi', side: 'right' });

      port.addConnection('link1');

      expect(port.getConnectionCount()).toBe(1);
    });

    it('should remove connection', () => {
      const port = new PortModel({ type: 'bi', side: 'right' });

      port.addConnection('link1');
      port.removeConnection('link1');

      expect(port.getConnectionCount()).toBe(0);
    });

    it('should track multiple connections', () => {
      const port = new PortModel({ type: 'bi', side: 'right' });

      port.addConnection('link1');
      port.addConnection('link2');
      port.addConnection('link3');

      expect(port.getConnectionCount()).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very high index values', () => {
      const port = new PortModel({ type: 'bi', side: 'top', index: 999 });

      expect(port.index).toBe(999);
    });

    it('should handle zero index', () => {
      const port = new PortModel({ type: 'bi', side: 'bottom', index: 0 });

      expect(port.index).toBe(0);
    });

    it('should handle all port types', () => {
      const types: Array<'input' | 'output' | 'bi'> = ['input', 'output', 'bi'];

      types.forEach(type => {
        const port = new PortModel({ type, side: 'right' });
        expect(port.type).toBe(type);
      });
    });
  });
});
