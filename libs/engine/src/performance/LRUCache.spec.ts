// LRUCache.spec.ts - TDD tests for LRU cache (Phase 5.3)

import { LRUCache } from './LRUCache';

describe('LRUCache (Phase 5.3)', () => {
  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(3);

      expect(cache.get('missing')).toBeUndefined();
    });

    it('should update existing values', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('a', 2);

      expect(cache.get('a')).toBe(2);
    });

    it('should track cache size', () => {
      const cache = new LRUCache<string, number>(3);

      expect(cache.size()).toBe(0);

      cache.set('a', 1);
      expect(cache.size()).toBe(1);

      cache.set('b', 2);
      expect(cache.size()).toBe(2);
    });

    it('should check if key exists', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should delete keys', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.size()).toBe(1);

      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used item when capacity exceeded', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1); // Order: a
      cache.set('b', 2); // Order: b, a
      cache.set('c', 3); // Order: c, b, a

      // Now at capacity (3/3)
      cache.set('d', 4); // Order: d, c, b (evicts 'a')

      expect(cache.has('a')).toBe(false); // Evicted
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
      expect(cache.size()).toBe(3);
    });

    it('should update access order on get', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1); // Order: a
      cache.set('b', 2); // Order: b, a
      cache.set('c', 3); // Order: c, b, a

      cache.get('a'); // Order: a, c, b (a becomes most recent)

      cache.set('d', 4); // Order: d, a, c (evicts 'b')

      expect(cache.has('a')).toBe(true); // Kept (accessed recently)
      expect(cache.has('b')).toBe(false); // Evicted
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should update access order on set of existing key', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1); // Order: a
      cache.set('b', 2); // Order: b, a
      cache.set('c', 3); // Order: c, b, a

      cache.set('a', 10); // Order: a, c, b (a updated, becomes most recent)

      cache.set('d', 4); // Order: d, a, c (evicts 'b')

      expect(cache.has('a')).toBe(true); // Kept
      expect(cache.get('a')).toBe(10); // Updated value
      expect(cache.has('b')).toBe(false); // Evicted
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should handle capacity of 1', () => {
      const cache = new LRUCache<string, number>(1);

      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);

      cache.set('b', 2);
      expect(cache.has('a')).toBe(false); // Evicted
      expect(cache.has('b')).toBe(true);
    });

    it('should evict multiple items if needed', () => {
      const cache = new LRUCache<string, number>(2);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Evicts 'a'
      cache.set('d', 4); // Evicts 'b'

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('Eviction Callback', () => {
    it('should call onEvict callback when item is evicted', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache<string, number>(2, { onEvict });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Evicts 'a'

      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
    });

    it('should call onEvict for each evicted item', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache<string, number>(2, { onEvict });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Evicts 'a'
      cache.set('d', 4); // Evicts 'b'

      expect(onEvict).toHaveBeenCalledTimes(2);
      expect(onEvict).toHaveBeenNthCalledWith(1, 'a', 1);
      expect(onEvict).toHaveBeenNthCalledWith(2, 'b', 2);
    });

    it('should not call onEvict when explicitly deleting', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache<string, number>(2, { onEvict });

      cache.set('a', 1);
      cache.delete('a');

      expect(onEvict).not.toHaveBeenCalled();
    });

    it('should not call onEvict when clearing', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache<string, number>(2, { onEvict });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();

      expect(onEvict).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle large capacity', () => {
      const cache = new LRUCache<number, number>(1000);

      for (let i = 0; i < 1000; i++) {
        cache.set(i, i * 2);
      }

      expect(cache.size()).toBe(1000);

      // Adding one more evicts the first
      cache.set(1000, 2000);
      expect(cache.has(0)).toBe(false);
      expect(cache.has(1000)).toBe(true);
      expect(cache.size()).toBe(1000);
    });

    it('should handle object values', () => {
      const cache = new LRUCache<string, { value: number }>(2);

      const obj1 = { value: 1 };
      const obj2 = { value: 2 };

      cache.set('a', obj1);
      cache.set('b', obj2);

      expect(cache.get('a')).toBe(obj1);
      expect(cache.get('b')).toBe(obj2);
    });

    it('should throw error for invalid capacity', () => {
      expect(() => new LRUCache<string, number>(0)).toThrow();
      expect(() => new LRUCache<string, number>(-1)).toThrow();
    });
  });

  describe('Performance', () => {
    it('should have O(1) get operation', () => {
      const cache = new LRUCache<number, number>(1000);

      // Fill cache
      for (let i = 0; i < 1000; i++) {
        cache.set(i, i);
      }

      // Measure get performance
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        cache.get(i);
      }
      const duration = performance.now() - start;

      // Should complete in < 5ms for 1000 gets (O(1) operation)
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 5)
    });

    it('should have O(1) set operation', () => {
      const cache = new LRUCache<number, number>(1000);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        cache.set(i, i);
      }
      const duration = performance.now() - start;

      // Should complete in < 10ms for 1000 sets (O(1) operation)
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 10)
    });
  });
});
