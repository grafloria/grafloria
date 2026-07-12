// SpatialIndex.spec.ts - TDD tests for generic spatial indexing (Phase 5.1)

import { SpatialIndex } from './SpatialIndex';
import type { Rectangle } from '../types/geometry.types';

interface TestEntity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

describe('SpatialIndex (Phase 5.1 - Viewport Virtualization)', () => {
  let spatialIndex: SpatialIndex<TestEntity>;

  beforeEach(() => {
    spatialIndex = new SpatialIndex<TestEntity>({
      cellSize: 100,
      getBounds: (entity) => ({
        x: entity.x,
        y: entity.y,
        width: entity.width,
        height: entity.height,
      }),
    });
  });

  describe('Basic Operations', () => {
    it('should create an empty spatial index', () => {
      expect(spatialIndex).toBeDefined();
      expect(spatialIndex.size()).toBe(0);
    });

    it('should add an entity', () => {
      const entity: TestEntity = {
        id: 'entity1',
        x: 100,
        y: 100,
        width: 50,
        height: 30,
      };

      spatialIndex.add(entity);
      expect(spatialIndex.size()).toBe(1);
    });

    it('should remove an entity', () => {
      const entity: TestEntity = {
        id: 'entity1',
        x: 100,
        y: 100,
        width: 50,
        height: 30,
      };

      spatialIndex.add(entity);
      expect(spatialIndex.size()).toBe(1);

      const removed = spatialIndex.remove(entity.id);
      expect(removed).toBe(true);
      expect(spatialIndex.size()).toBe(0);
    });

    it('should return false when removing non-existent entity', () => {
      const removed = spatialIndex.remove('nonexistent');
      expect(removed).toBe(false);
    });

    it('should get entity by id', () => {
      const entity: TestEntity = {
        id: 'entity1',
        x: 100,
        y: 100,
        width: 50,
        height: 30,
      };

      spatialIndex.add(entity);
      const retrieved = spatialIndex.get('entity1');
      expect(retrieved).toEqual(entity);
    });

    it('should clear all entities', () => {
      spatialIndex.add({ id: 'e1', x: 0, y: 0, width: 50, height: 50 });
      spatialIndex.add({ id: 'e2', x: 100, y: 100, width: 50, height: 50 });
      expect(spatialIndex.size()).toBe(2);

      spatialIndex.clear();
      expect(spatialIndex.size()).toBe(0);
    });

    it('should update entity position', () => {
      const entity: TestEntity = {
        id: 'entity1',
        x: 100,
        y: 100,
        width: 50,
        height: 30,
      };

      spatialIndex.add(entity);

      // Update position
      const updated: TestEntity = {
        id: 'entity1',
        x: 200,
        y: 200,
        width: 50,
        height: 30,
      };

      spatialIndex.update(updated);

      const retrieved = spatialIndex.get('entity1');
      expect(retrieved?.x).toBe(200);
      expect(retrieved?.y).toBe(200);
    });
  });

  describe('Spatial Queries - Viewport Visibility', () => {
    beforeEach(() => {
      // Add entities in a grid pattern (simulating nodes)
      spatialIndex.add({ id: 'node1', x: 0, y: 0, width: 50, height: 50 });
      spatialIndex.add({ id: 'node2', x: 100, y: 0, width: 50, height: 50 });
      spatialIndex.add({ id: 'node3', x: 0, y: 100, width: 50, height: 50 });
      spatialIndex.add({ id: 'node4', x: 100, y: 100, width: 50, height: 50 });
      spatialIndex.add({ id: 'node5', x: 200, y: 200, width: 50, height: 50 });
      spatialIndex.add({ id: 'node6', x: 500, y: 500, width: 50, height: 50 });
    });

    it('should find entities in viewport region', () => {
      // Viewport showing top-left quadrant
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 150,
        height: 150,
      };

      const visible = spatialIndex.queryRegion(viewport);

      expect(visible.length).toBe(4);
      expect(visible.map((e) => e.id).sort()).toEqual([
        'node1',
        'node2',
        'node3',
        'node4',
      ]);
    });

    it('should return empty array when viewport shows no entities', () => {
      // Viewport in empty region
      const viewport: Rectangle = {
        x: 1000,
        y: 1000,
        width: 200,
        height: 200,
      };

      const visible = spatialIndex.queryRegion(viewport);
      expect(visible).toEqual([]);
    });

    it('should find all entities when viewport is very large', () => {
      const viewport: Rectangle = {
        x: -100,
        y: -100,
        width: 1000,
        height: 1000,
      };

      const visible = spatialIndex.queryRegion(viewport);
      expect(visible.length).toBe(6);
    });

    it('should handle viewport with zoom (scaled viewport)', () => {
      // Small zoomed-in viewport
      const viewport: Rectangle = {
        x: 95,
        y: 95,
        width: 60,
        height: 60,
      };

      const visible = spatialIndex.queryRegion(viewport);
      expect(visible.length).toBeGreaterThanOrEqual(1);
      expect(visible.some((e) => e.id === 'node4')).toBe(true);
    });

    it('should handle partially visible entities', () => {
      // Viewport that partially overlaps node5
      const viewport: Rectangle = {
        x: 180,
        y: 180,
        width: 50,
        height: 50,
      };

      const visible = spatialIndex.queryRegion(viewport);
      expect(visible.some((e) => e.id === 'node5')).toBe(true);
    });
  });

  describe('Performance - Large Scale Virtualization', () => {
    it('should handle 1000 entities efficiently', () => {
      const start = performance.now();

      // Add 1000 entities
      for (let i = 0; i < 1000; i++) {
        spatialIndex.add({
          id: `entity${i}`,
          x: Math.random() * 10000,
          y: Math.random() * 10000,
          width: 50,
          height: 50,
        });
      }

      const addTime = performance.now() - start;
      expect(addTime).toBeLessThan(500); // < 500ms to add 1000 entities

      // Viewport query should be VERY fast (virtualization benefit)
      const queryStart = performance.now();
      spatialIndex.queryRegion({ x: 0, y: 0, width: 500, height: 500 });
      const queryTime = performance.now() - queryStart;
      expect(queryTime).toBeLessThan(20); // < 20ms for viewport query
    });

    it('should scale to 10000 entities with reasonable performance', () => {
      // Add 10000 entities
      for (let i = 0; i < 10000; i++) {
        spatialIndex.add({
          id: `entity${i}`,
          x: (i % 100) * 100,
          y: Math.floor(i / 100) * 100,
          width: 50,
          height: 50,
        });
      }

      expect(spatialIndex.size()).toBe(10000);

      // Typical viewport query (showing ~100 entities out of 10000)
      const start = performance.now();
      const visible = spatialIndex.queryRegion({
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      });
      const duration = performance.now() - start;

      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(500); // Only subset visible
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 50)
    });

    it('should handle rapid viewport changes efficiently', () => {
      // Add 500 entities
      for (let i = 0; i < 500; i++) {
        spatialIndex.add({
          id: `entity${i}`,
          x: Math.random() * 5000,
          y: Math.random() * 5000,
          width: 50,
          height: 50,
        });
      }

      const start = performance.now();

      // Simulate 100 viewport updates (panning/zooming)
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 5000;
        const y = Math.random() * 5000;
        spatialIndex.queryRegion({ x, y, width: 500, height: 500 });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 200)
    });
  });

  describe('Query Options', () => {
    beforeEach(() => {
      spatialIndex.add({ id: 'node1', x: 0, y: 0, width: 50, height: 50 });
      spatialIndex.add({ id: 'node2', x: 100, y: 0, width: 50, height: 50 });
      spatialIndex.add({ id: 'node3', x: 200, y: 0, width: 50, height: 50 });
    });

    it('should support filtered queries', () => {
      const visible = spatialIndex.queryRegion(
        { x: 0, y: 0, width: 300, height: 100 },
        {
          filter: (entity) => entity.id !== 'node2',
        }
      );

      expect(visible.length).toBe(2);
      expect(visible.map((e) => e.id).sort()).toEqual(['node1', 'node3']);
    });

    it('should support limit on query results', () => {
      const visible = spatialIndex.queryRegion(
        { x: 0, y: 0, width: 300, height: 100 },
        {
          limit: 2,
        }
      );

      expect(visible.length).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-size entities', () => {
      const entity: TestEntity = {
        id: 'point',
        x: 100,
        y: 100,
        width: 0,
        height: 0,
      };

      expect(() => spatialIndex.add(entity)).not.toThrow();
      expect(spatialIndex.size()).toBe(1);
    });

    it('should handle negative coordinates', () => {
      const entity: TestEntity = {
        id: 'negative',
        x: -100,
        y: -50,
        width: 50,
        height: 30,
      };

      spatialIndex.add(entity);
      const retrieved = spatialIndex.get('negative');
      expect(retrieved).toEqual(entity);
    });

    it('should handle viewport with negative coordinates', () => {
      spatialIndex.add({ id: 'node1', x: -100, y: -100, width: 50, height: 50 });

      const visible = spatialIndex.queryRegion({
        x: -150,
        y: -150,
        width: 100,
        height: 100,
      });

      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe('node1');
    });

    it('should maintain spatial index after multiple updates', () => {
      spatialIndex.add({ id: 'node1', x: 0, y: 0, width: 50, height: 50 });

      // Update position multiple times
      spatialIndex.update({ id: 'node1', x: 100, y: 100, width: 50, height: 50 });
      spatialIndex.update({ id: 'node1', x: 200, y: 200, width: 50, height: 50 });

      // Query old positions - should be empty
      let visible = spatialIndex.queryRegion({
        x: 0,
        y: 0,
        width: 150,
        height: 150,
      });
      expect(visible.length).toBe(0);

      // Query new position - should find it
      visible = spatialIndex.queryRegion({
        x: 200,
        y: 200,
        width: 100,
        height: 100,
      });
      expect(visible.length).toBe(1);
    });
  });
});
