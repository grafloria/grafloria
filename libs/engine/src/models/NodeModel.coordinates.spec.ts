// NodeModel.coordinates.spec.ts - Coordinate Space System Tests (Phase 1.6a)

import { NodeModel } from './NodeModel';
import { DiagramModel } from './DiagramModel';
import { DiagramEngine } from '../engine/DiagramEngine';

describe('NodeModel - Coordinate Space System (Phase 1.6a)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    engine.initialize();
    diagram = engine.createDiagram('Test Diagram');
  });

  describe('PositioningMode', () => {
    it('should default to absolute positioning', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });

      expect(node.positionMode).toBe('absolute');
    });

    it('should allow changing positioning mode', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });

      node.positionMode = 'relative';
      expect(node.positionMode).toBe('relative');

      node.positionMode = 'layout';
      expect(node.positionMode).toBe('layout');
    });
  });

  describe('Transform Origin', () => {
    it('should default transform origin to center', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      expect(node.transformOrigin).toEqual({ x: 0.5, y: 0.5 });
    });

    it('should allow setting transform origin', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      node.setTransformOrigin(0, 0); // Top-left
      expect(node.transformOrigin).toEqual({ x: 0, y: 0 });

      node.setTransformOrigin(1, 1); // Bottom-right
      expect(node.transformOrigin).toEqual({ x: 1, y: 1 });
    });

    it('should calculate absolute transform origin', async () => {
      const node = await engine.addNode({
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
    it('should return same position for local and global when no parent', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 200 } });

      const local = node.getLocalPosition();
      const global = node.getGlobalPosition();

      expect(local).toEqual({ x: 100, y: 200, z: undefined });
      expect(global).toEqual({ x: 100, y: 200, z: undefined });
    });
  });

  describe('Local vs Global Position - With Parent (Absolute Mode)', () => {
    it('should return absolute position even with parent in absolute mode', async () => {
      const parent = await engine.addNode({ type: 'parent', position: { x: 50, y: 50 } });
      const child = await engine.addNode({
        type: 'child',
        position: { x: 100, y: 100 }
      });

      // Set up parent-child relationship
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
  });

  describe('Local vs Global Position - With Parent (Relative Mode)', () => {
    it('should calculate global position from local + parent in relative mode', async () => {
      const parent = await engine.addNode({ type: 'parent', position: { x: 50, y: 50 } });
      const child = await engine.addNode({
        type: 'child',
        position: { x: 20, y: 30 }
      });

      // Set up parent-child relationship
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

    it('should account for parent transforms in global position', async () => {
      const parent = await engine.addNode({ type: 'parent', position: { x: 100, y: 100 } });
      parent.setScale(2, 2);

      const child = await engine.addNode({
        type: 'child',
        position: { x: 10, y: 10 }
      });

      // Set up parent-child relationship
      child.setParent(parent.id);
      parent.addChild(child.id);
      child.positionMode = 'relative';

      const global = child.getGlobalPosition();

      // Parent scale affects child position
      // Child at (10, 10) scaled by 2x -> (20, 20)
      // Then translated by parent (100, 100) -> (120, 120)
      expect(global.x).toBeCloseTo(120, 5);
      expect(global.y).toBeCloseTo(120, 5);
    });

    it('should handle nested hierarchy (grandparent, parent, child)', async () => {
      const grandparent = await engine.addNode({ type: 'grandparent', position: { x: 10, y: 10 } });
      const parent = await engine.addNode({
        type: 'parent',
        position: { x: 20, y: 20 }
      });
      const child = await engine.addNode({
        type: 'child',
        position: { x: 5, y: 5 }
      });

      // Set up hierarchy
      parent.setParent(grandparent.id);
      grandparent.addChild(parent.id);
      child.setParent(parent.id);
      parent.addChild(child.id);

      parent.positionMode = 'relative';
      child.positionMode = 'relative';

      const global = child.getGlobalPosition();

      // Grandparent: (10, 10)
      // Parent relative: (10, 10) + (20, 20) = (30, 30)
      // Child relative: (30, 30) + (5, 5) = (35, 35)
      expect(global.x).toBeCloseTo(35, 5);
      expect(global.y).toBeCloseTo(35, 5);
    });
  });

  describe('setLocalPosition / setGlobalPosition', () => {
    it('setLocalPosition should switch to relative mode', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });

      expect(node.positionMode).toBe('absolute');

      node.setLocalPosition(50, 75);

      expect(node.positionMode).toBe('relative');
      expect(node.position).toEqual({ x: 50, y: 75, z: undefined });
    });

    it('setGlobalPosition should work without parent', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });

      node.setGlobalPosition(200, 300);

      expect(node.position).toEqual({ x: 200, y: 300, z: undefined });
    });

    it('setGlobalPosition should convert to local coordinates with parent', async () => {
      const parent = await engine.addNode({ type: 'parent', position: { x: 50, y: 50 } });
      const child = await engine.addNode({
        type: 'child',
        position: { x: 0, y: 0 }
      });

      // Set up parent-child relationship
      child.setParent(parent.id);
      parent.addChild(child.id);

      // Set child's global position to (100, 100)
      // With parent at (50, 50), child's local should be (50, 50)
      child.setGlobalPosition(100, 100);

      expect(child.positionMode).toBe('relative');
      expect(child.position.x).toBeCloseTo(50, 5);
      expect(child.position.y).toBeCloseTo(50, 5);

      // Verify global position is correct
      const global = child.getGlobalPosition();
      expect(global.x).toBeCloseTo(100, 5);
      expect(global.y).toBeCloseTo(100, 5);
    });
  });

  describe('Transform Matrices', () => {
    it('should get local transform matrix', async () => {
      const node = await engine.addNode({
        type: 'test',
        position: { x: 100, y: 200 },
        size: { width: 50, height: 50 }
      });

      node.setRotation(90);
      node.setScale(2, 2);

      const matrix = node.getLocalTransformMatrix();

      // Matrix should compose with transform origin: translate(100, 200) + rotate(90) + scale(2, 2)
      // Transform origin is at center (25, 25) of the 50x50 node
      // When rotating/scaling around origin, the final translation is affected:
      // Point (0,0) -> (-25,-25) -> scale(-50,-50) -> rotate(50,-50) -> (75,-25) -> (175,175)
      expect(matrix).toBeDefined();
      expect(matrix.e).toBeCloseTo(175, 1); // Translation X (affected by transform origin)
      expect(matrix.f).toBeCloseTo(175, 1); // Translation Y (affected by transform origin)
    });

    it('should get global transform matrix without parent', async () => {
      const node = await engine.addNode({
        type: 'test',
        position: { x: 100, y: 200 }
      });

      const local = node.getLocalTransformMatrix();
      const global = node.getGlobalTransformMatrix();

      // Without parent, local and global should be same
      expect(global).toEqual(local);
    });

    it('should compose parent and child transforms for global matrix', async () => {
      const parent = await engine.addNode({ type: 'parent', position: { x: 50, y: 50 } });
      parent.setRotation(45);

      const child = await engine.addNode({
        type: 'child',
        position: { x: 10, y: 10 }
      });

      // Set up parent-child relationship
      child.setParent(parent.id);
      parent.addChild(child.id);
      child.positionMode = 'relative';

      const globalMatrix = child.getGlobalTransformMatrix();

      // Global matrix should include both parent's 45° rotation and child's position
      expect(globalMatrix).toBeDefined();
      expect(globalMatrix.b).not.toBe(0); // Has rotation component from parent
    });
  });

  describe('Global Bounds', () => {
    it('should calculate global bounds without transforms', async () => {
      const node = await engine.addNode({
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

    it('should calculate global bounds with rotation', async () => {
      const node = await engine.addNode({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 }
      });

      node.setRotation(90);

      const bounds = node.getGlobalBounds();

      // After 90° rotation, 100x50 rect becomes 50x100
      // (depending on transform origin, bounds will shift)
      expect(bounds.width).toBeCloseTo(50, 1);
      expect(bounds.height).toBeCloseTo(100, 1);
    });

    it('should calculate global bounds with scale', async () => {
      const node = await engine.addNode({
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

    it('should calculate global bounds with parent transforms', async () => {
      const parent = await engine.addNode({
        type: 'parent',
        position: { x: 50, y: 50 }
      });
      parent.setScale(2, 2);

      const child = await engine.addNode({
        type: 'child',
        position: { x: 10, y: 10 },
        size: { width: 20, height: 20 }
      });

      // Set up parent-child relationship
      child.setParent(parent.id);
      parent.addChild(child.id);
      child.positionMode = 'relative';

      const bounds = child.getGlobalBounds();

      // Child scaled by parent's 2x -> 20*2 = 40x40
      expect(bounds.width).toBeCloseTo(40, 1);
      expect(bounds.height).toBeCloseTo(40, 1);
    });
  });

  describe('Serialization', () => {
    it('should serialize positioning mode', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });
      node.positionMode = 'relative';
      node.setTransformOrigin(0.25, 0.75);

      const serialized = node.serialize();

      expect(serialized.positionMode).toBe('relative');
      expect(serialized.transformOrigin).toEqual({ x: 0.25, y: 0.75 });
    });

    it('should deserialize positioning mode', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });
      node.positionMode = 'relative';
      node.setTransformOrigin(0.25, 0.75);

      const serialized = node.serialize();
      const { NodeModel: NM } = await import('./NodeModel');
      const restored = NM.fromJSON(serialized);

      expect(restored.positionMode).toBe('relative');
      expect(restored.transformOrigin).toEqual({ x: 0.25, y: 0.75 });
    });

    it('should default to absolute mode if not in serialized data', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });

      const serialized = node.serialize();
      delete (serialized as any).positionMode;

      const { NodeModel: NM } = await import('./NodeModel');
      const restored = NM.fromJSON(serialized);

      expect(restored.positionMode).toBe('absolute');
    });
  });
});
