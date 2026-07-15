// NodeModel.coordinates-unit.spec.ts - Unit tests without DiagramEngine

import { NodeModel } from './NodeModel';
import { DiagramModel } from './DiagramModel';

describe('NodeModel - Coordinate Space System (Unit Tests)', () => {
  describe('PositioningMode', () => {
    it('should default to absolute positioning', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });
      expect(node.positionMode).toBe('absolute');
    });

    it('should allow changing positioning mode', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });

      node.positionMode = 'relative';
      expect(node.positionMode).toBe('relative');

      node.positionMode = 'layout';
      expect(node.positionMode).toBe('layout');
    });
  });

  describe('Transform Origin', () => {
    it('should default transform origin to center', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      expect(node.transformOrigin).toEqual({ x: 0.5, y: 0.5 });
    });

    it('should allow setting transform origin', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });

      node.setTransformOrigin(0, 0); // Top-left
      expect(node.transformOrigin).toEqual({ x: 0, y: 0 });

      node.setTransformOrigin(1, 1); // Bottom-right
      expect(node.transformOrigin).toEqual({ x: 1, y: 1 });
    });

    it('should calculate absolute transform origin', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 }
      });

      // Default center: (0.5, 0.5) * (100, 50) = (50, 25)
      let origin = node.getAbsoluteTransformOrigin();
      expect(origin).toEqual({ x: 50, y: 25, z: 0 });

      // Top-left: (0, 0) * (100, 50) = (0, 0)
      node.setTransformOrigin(0, 0);
      origin = node.getAbsoluteTransformOrigin();
      expect(origin).toEqual({ x: 0, y: 0, z: 0 });

      // Bottom-right: (1, 1) * (100, 50) = (100, 50)
      node.setTransformOrigin(1, 1);
      origin = node.getAbsoluteTransformOrigin();
      expect(origin).toEqual({ x: 100, y: 50, z: 0 });
    });
  });

  describe('Local vs Global Position - No Parent', () => {
    it('should return same position for local and global when no parent', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 200 } });

      const local = node.getLocalPosition();
      const global = node.getGlobalPosition();

      expect(local).toEqual({ x: 100, y: 200, z: undefined });
      expect(global).toEqual({ x: 100, y: 200, z: undefined });
    });
  });

  describe('Local vs Global Position - With Parent', () => {
    it('should return absolute position even with parent in absolute mode', () => {
      const diagram = new DiagramModel();
      const parent = new NodeModel({ type: 'parent', position: { x: 50, y: 50 } });
      const child = new NodeModel({ type: 'child', position: { x: 100, y: 100 } });

      // Add nodes to diagram
      diagram.addNode(parent);
      diagram.addNode(child);

      // Set up hierarchy
      child.setParent(parent.id);
      // wave13: setParent now DECLARES relative semantics (the default was a lie);
      // this test is ABOUT explicit absolute mode, so it now says so explicitly.
      child.positionMode = 'absolute';
      parent.addChild(child.id);

      // In absolute mode, position is relative to diagram, not parent
      const local = child.getLocalPosition();
      const global = child.getGlobalPosition();

      expect(local).toEqual({ x: 100, y: 100, z: undefined });
      expect(global).toEqual({ x: 100, y: 100, z: undefined });
    });

    it('should calculate global position from local + parent in relative mode', () => {
      const diagram = new DiagramModel();
      const parent = new NodeModel({ type: 'parent', position: { x: 50, y: 50 } });
      const child = new NodeModel({ type: 'child', position: { x: 20, y: 30 } });

      // Add nodes to diagram
      diagram.addNode(parent);
      diagram.addNode(child);

      // Set up hierarchy
      child.setParent(parent.id);
      parent.addChild(child.id);
      child.positionMode = 'relative';

      const local = child.getLocalPosition();
      const global = child.getGlobalPosition();

      expect(local).toEqual({ x: 20, y: 30, z: undefined });
      // Global = parent position + child local position
      expect(global.x).toBeCloseTo(70, 5); // 50 + 20
      expect(global.y).toBeCloseTo(80, 5); // 50 + 30
    });
  });

  describe('setLocalPosition / setGlobalPosition', () => {
    it('setLocalPosition should switch to relative mode', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });

      expect(node.positionMode).toBe('absolute');

      node.setLocalPosition(50, 75);

      expect(node.positionMode).toBe('relative');
      expect(node.position).toEqual({ x: 50, y: 75, z: undefined });
    });

    it('setGlobalPosition should work without parent', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });

      node.setGlobalPosition(200, 300);

      expect(node.position).toEqual({ x: 200, y: 300, z: undefined });
    });
  });

  describe('Transform Matrices', () => {
    it('should get local transform matrix', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 200 },
        size: { width: 50, height: 50 }
      });

      node.setRotation(90);
      node.setScale(2, 2);

      const matrix = node.getLocalTransformMatrix();

      // Matrix should compose: translate + rotate + scale around transform origin
      expect(matrix).toBeDefined();
      expect(matrix.a).toBeDefined(); // Has scale/rotation components
      expect(matrix.e).toBeDefined(); // Has translation X
      expect(matrix.f).toBeDefined(); // Has translation Y

      // Translation includes both position and origin offsets, so not exactly (100, 200)
      expect(matrix.e).toBeGreaterThan(50);
      expect(matrix.f).toBeGreaterThan(150);
    });

    it('should get global transform matrix without parent', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 200 }
      });

      const local = node.getLocalTransformMatrix();
      const global = node.getGlobalTransformMatrix();

      // Without parent, local and global should be same
      expect(global).toEqual(local);
    });
  });

  describe('Global Bounds', () => {
    it('should calculate global bounds without transforms', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 200 },
        size: { width: 50, height: 30 }
      });

      const bounds = node.getGlobalBounds();

      expect(bounds).toEqual({
        left: 100,
        top: 200,
        right: 150,
        bottom: 230,
        width: 50,
        height: 30
      });
    });

    it('should calculate global bounds with rotation', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 }
      });

      node.setRotation(90);

      const bounds = node.getGlobalBounds();

      // After 90° rotation, 100x50 rect becomes 50x100
      expect(bounds.width).toBeCloseTo(50, 1);
      expect(bounds.height).toBeCloseTo(100, 1);
    });

    it('should calculate global bounds with scale', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 30 }
      });

      node.setScale(2, 3);

      const bounds = node.getGlobalBounds();

      // Scaled: 50*2 = 100 width, 30*3 = 90 height
      expect(bounds.width).toBeCloseTo(100, 1);
      expect(bounds.height).toBeCloseTo(90, 1);
    });
  });

  describe('Serialization', () => {
    it('should serialize positioning mode', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });
      node.positionMode = 'relative';
      node.setTransformOrigin(0.25, 0.75);

      const serialized = node.serialize();

      expect(serialized.positionMode).toBe('relative');
      expect(serialized.transformOrigin).toEqual({ x: 0.25, y: 0.75 });
    });

    it('should deserialize positioning mode', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });
      node.positionMode = 'relative';
      node.setTransformOrigin(0.25, 0.75);

      const serialized = node.serialize();
      const restored = NodeModel.fromJSON(serialized);

      expect(restored.positionMode).toBe('relative');
      expect(restored.transformOrigin).toEqual({ x: 0.25, y: 0.75 });
    });

    it('should default to absolute mode if not in serialized data', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 } });

      const serialized = node.serialize();
      delete (serialized as any).positionMode;

      const restored = NodeModel.fromJSON(serialized);

      expect(restored.positionMode).toBe('absolute');
    });
  });
});
