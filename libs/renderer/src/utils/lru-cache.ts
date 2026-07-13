/**
 * Minimal Map-based LRU cache.
 *
 * A `Map` iterates in insertion order, so the FIRST key is always the
 * least-recently-used one. On `get`, the entry is re-inserted (moved to the
 * end) to mark it most-recently-used; on `set`, once the size exceeds the
 * capacity the oldest entries are evicted from the front.
 *
 * This is a drop-in replacement for the subset of the `Map` API the SVG
 * renderer's vnode cache uses (`get` / `set` / `has` / `delete` / `clear` /
 * `size`), keeping the renderer free of any runtime dependency on the engine.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly capacity: number) {}

  /** Current number of cached entries. */
  get size(): number {
    return this.map.size;
  }

  /** Look up a value, marking it most-recently-used. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    // Re-insert to move the entry to the most-recently-used position.
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** Insert/update a value and evict the oldest entries past capacity. */
  set(key: K, value: V): void {
    // Delete first so an update also refreshes recency (moves to the end).
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);

    // Evict least-recently-used entries (front of the Map) past capacity.
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /**
   * A SNAPSHOT of the current keys, oldest first.
   *
   * Snapshot, not the live Map iterator: the only caller (the renderer's
   * theme-swap invalidation) deletes while it walks, and mutating a Map during
   * its own iteration is how you skip entries.
   */
  keys(): K[] {
    return Array.from(this.map.keys());
  }

  clear(): void {
    this.map.clear();
  }
}
