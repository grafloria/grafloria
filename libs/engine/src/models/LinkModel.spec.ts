// LinkModel tests

import { LinkModel } from './LinkModel';
import { PortModel } from './PortModel';

// Mock nanoid and uuid
let idCounter = 0;
let uuidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: (size?: number) => 'test-id-' + (idCounter++).toString().padStart(12, '0'),
}));
jest.mock('uuid', () => ({
  v4: () => `12345678-1234-1234-1234-${(uuidCounter++).toString().padStart(12, '0')}`,
}));

describe('LinkModel', () => {
  let sourcePort: PortModel;
  let targetPort: PortModel;

  beforeEach(() => {
    idCounter = 0;
    uuidCounter = 0;
    sourcePort = new PortModel({ id: 'source-port', type: 'output' });
    targetPort = new PortModel({ id: 'target-port', type: 'input' });
  });

  describe('Creation and basic properties', () => {
    it('should create a link with default properties', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);

      expect(link.sourcePortId).toBe(sourcePort.id);
      expect(link.targetPortId).toBe(targetPort.id);
      expect(link.pathType).toBe('smooth');
      expect(link.state).toBe('default');
      expect(link.segments).toEqual([]);
      expect(link.points).toEqual([]);
      expect(link.labels).toEqual([]);
    });

    it('should create a link with custom path type', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'orthogonal');

      expect(link.pathType).toBe('orthogonal');
    });

    it('should have unique ID and UUID', () => {
      const link1 = new LinkModel(sourcePort.id, targetPort.id);
      const link2 = new LinkModel(sourcePort.id, targetPort.id);

      expect(link1.id).not.toBe(link2.id);
      expect(link1.uuid).not.toBe(link2.uuid);
    });
  });

  describe('Path generation', () => {
    it('should generate direct path', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'direct');
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 100 });

      expect(link.segments).toHaveLength(1);
      expect(link.segments[0]?.type).toBe('line');
      expect(link.segments[0]?.from).toEqual({ x: 0, y: 0 });
      expect(link.segments[0]?.to).toEqual({ x: 100, y: 100 });
    });

    it('should generate smooth/bezier path', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'smooth');
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 0 });

      expect(link.segments).toHaveLength(1);
      expect(link.segments[0]?.type).toBe('curve');
      expect(link.segments[0]?.control1).toBeDefined();
      expect(link.segments[0]?.control2).toBeDefined();
    });

    it('should generate orthogonal path', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'orthogonal');
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 100 });

      expect(link.segments.length).toBeGreaterThan(0);
      // All segments should be either horizontal or vertical
      link.segments.forEach((segment) => {
        if (segment.type === 'line') {
          const isHorizontal = segment.from.y === segment.to.y;
          const isVertical = segment.from.x === segment.to.x;
          expect(isHorizontal || isVertical).toBe(true);
        }
      });
    });

    it('should emit event when path is generated', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      const handler = jest.fn();
      link.on('link:path-changed', handler);

      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 100 });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Point manipulation', () => {
    it('should add custom point', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.addPoint({ x: 50, y: 50 });

      expect(link.points).toHaveLength(1);
      expect(link.points[0]).toEqual({ x: 50, y: 50 });
    });

    it('should remove point by index', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.addPoint({ x: 50, y: 50 });
      link.addPoint({ x: 75, y: 75 });

      link.removePoint(0);

      expect(link.points).toHaveLength(1);
      expect(link.points[0]).toEqual({ x: 75, y: 75 });
    });

    // Note: Point updates can be done by removing and re-adding points
    // or by directly modifying the points array if needed

    it('should emit event when point is added', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      const handler = jest.fn();
      link.on('link:point-added', handler);

      link.addPoint({ x: 50, y: 50 });

      expect(handler).toHaveBeenCalledWith({ point: { x: 50, y: 50 }, index: 0 });
    });
  });

  describe('Labels', () => {
    it('should add label', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.addLabel({ text: 'Label 1', position: 0.5 });

      expect(link.labels).toHaveLength(1);
      expect(link.labels[0]?.text).toBe('Label 1');
      expect(link.labels[0]?.position).toBe(0.5);
    });

    it('should remove label by index', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.addLabel({ text: 'Label 1', position: 0.5 });
      link.addLabel({ text: 'Label 2', position: 0.7 });

      link.removeLabelAt(0);

      expect(link.labels).toHaveLength(1);
      expect(link.labels[0]?.text).toBe('Label 2');
    });

    it('should update label by index', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.addLabel({ text: 'Label 1', position: 0.5 });

      link.updateLabel(0, { text: 'Updated Label' });

      expect(link.labels[0]?.text).toBe('Updated Label');
      expect(link.labels[0]?.position).toBe(0.5); // Position unchanged
    });

    it('should emit event when label is added', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      const handler = jest.fn();
      link.on('link:label-added', handler);

      link.addLabel({ text: 'Label 1', position: 0.5 });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('State and style', () => {
    it('should update state', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.setState('selected');

      expect(link.state).toBe('selected');
    });

    it('should update style', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.updateStyle({ stroke: 'red', strokeWidth: 3 });

      expect(link.style.stroke).toBe('red');
      expect(link.style.strokeWidth).toBe(3);
    });

    it('should emit event when state changes', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      const handler = jest.fn();
      link.on('link:state-changed', handler);

      link.setState('selected');

      expect(handler).toHaveBeenCalledWith({ oldState: 'default', newState: 'selected' });
    });

    it('should emit event when style changes', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      const handler = jest.fn();
      link.on('link:style-changed', handler);

      link.updateStyle({ stroke: 'red' });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'direct');
      link.addLabel({ text: 'Test Label', position: 0.5 });
      link.setState('selected');
      link.updateStyle({ stroke: 'red' });

      const json = link.serialize();

      expect(json.sourcePortId).toBe(sourcePort.id);
      expect(json.targetPortId).toBe(targetPort.id);
      expect(json.pathType).toBe('direct');
      expect(json.state).toBe('selected');
      expect(json.style.stroke).toBe('red');
      expect(json.labels).toHaveLength(1);
    });

    it('should deserialize from JSON', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id);
      link.addLabel({ text: 'Test Label', position: 0.5 });
      link.setState('selected');

      const json = link.serialize();
      const restored = LinkModel.fromJSON(json);

      expect(restored.sourcePortId).toBe(link.sourcePortId);
      expect(restored.targetPortId).toBe(link.targetPortId);
      expect(restored.pathType).toBe(link.pathType);
      expect(restored.state).toBe(link.state);
      expect(restored.labels).toEqual(link.labels);
    });
  });

  describe('Path utilities', () => {
    it('should get point at position on direct path', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'direct');
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 100 });

      const midPoint = link.getPointAtPosition(0.5);

      expect(midPoint).not.toBeNull();
      expect(midPoint!.x).toBeCloseTo(50, 0);
      expect(midPoint!.y).toBeCloseTo(50, 0);
    });

    it('should calculate total length of direct path', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'direct');
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 0 });

      const length = link.getTotalLength();

      expect(length).toBeCloseTo(100, 0);
    });

    it('should calculate total length of orthogonal path', () => {
      const link = new LinkModel(sourcePort.id, targetPort.id, 'orthogonal');
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 100 });

      const length = link.getTotalLength();

      // Orthogonal path should be longer than direct path
      expect(length).toBeGreaterThanOrEqual(200);
    });
  });
});
