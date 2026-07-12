import { LruCache } from './lru-cache';

describe('LruCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LruCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('evicts the least-recently-used entry past capacity', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // capacity 2 -> 'a' (oldest) evicted

    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('get() refreshes recency so the touched entry survives eviction', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);

    // Touch 'a' so 'b' becomes the least-recently-used.
    expect(cache.get('a')).toBe(1);

    cache.set('c', 3); // evicts 'b', not 'a'

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('set() on an existing key updates value and refreshes recency', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // update + refresh -> 'b' now oldest

    expect(cache.get('a')).toBe(10);
    expect(cache.size).toBe(2);

    cache.set('c', 3); // evicts 'b'
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
  });

  it('never exceeds capacity under sustained inserts', () => {
    const cache = new LruCache<number, number>(5);
    for (let i = 0; i < 1000; i++) {
      cache.set(i, i);
      expect(cache.size).toBeLessThanOrEqual(5);
    }
    expect(cache.size).toBe(5);
    // Only the last 5 keys remain
    expect(cache.has(999)).toBe(true);
    expect(cache.has(994)).toBe(false);
  });

  it('supports delete and clear', () => {
    const cache = new LruCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    expect(cache.has('a')).toBe(false);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('b')).toBe(false);
  });
});
