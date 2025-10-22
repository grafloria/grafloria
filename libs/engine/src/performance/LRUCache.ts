// LRUCache - Least Recently Used cache with automatic eviction (Phase 5.3)

/**
 * Doubly-linked list node for O(1) removal and insertion
 */
class LRUNode<K, V> {
  constructor(
    public key: K,
    public value: V,
    public prev: LRUNode<K, V> | null = null,
    public next: LRUNode<K, V> | null = null
  ) {}
}

export interface LRUCacheOptions<K, V> {
  /**
   * Callback invoked when an item is evicted due to capacity
   * Not called for explicit delete() or clear()
   */
  onEvict?: (key: K, value: V) => void;
}

/**
 * LRU (Least Recently Used) Cache with automatic eviction
 *
 * Features:
 * - O(1) get, set, delete operations
 * - Automatic eviction when capacity exceeded
 * - Customizable eviction callback
 * - Prevents unbounded memory growth
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string, Route>(100);
 * cache.set('route1', calculatedRoute);
 * const route = cache.get('route1'); // O(1) lookup
 * // When 101st item added, oldest unused item is evicted
 * ```
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, LRUNode<K, V>> = new Map();
  private head: LRUNode<K, V> | null = null; // Most recently used
  private tail: LRUNode<K, V> | null = null; // Least recently used
  private onEvict?: (key: K, value: V) => void;

  constructor(capacity: number, options?: LRUCacheOptions<K, V>) {
    if (capacity <= 0) {
      throw new Error('Cache capacity must be greater than 0');
    }
    this.capacity = capacity;
    this.onEvict = options?.onEvict;
  }

  /**
   * Get value by key, marks as recently used
   * @returns Value if found, undefined otherwise
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }

    // Move to head (most recently used)
    this.moveToHead(node);
    return node.value;
  }

  /**
   * Set key-value pair, evicts LRU item if capacity exceeded
   */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing node
      existingNode.value = value;
      this.moveToHead(existingNode);
    } else {
      // Create new node
      const newNode = new LRUNode(key, value);
      this.cache.set(key, newNode);
      this.addToHead(newNode);

      // Evict if over capacity
      if (this.cache.size > this.capacity) {
        this.evictLRU();
      }
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete key from cache
   * @returns true if key existed, false otherwise
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Get current number of entries in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Move node to head (most recently used position)
   */
  private moveToHead(node: LRUNode<K, V>): void {
    if (node === this.head) {
      return; // Already at head
    }

    // Remove from current position
    this.removeNode(node);

    // Add to head
    this.addToHead(node);
  }

  /**
   * Add node to head of list
   */
  private addToHead(node: LRUNode<K, V>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Remove node from list
   */
  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      // Node is head
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      // Node is tail
      this.tail = node.prev;
    }
  }

  /**
   * Evict least recently used item (tail)
   */
  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    const evicted = this.tail;
    this.removeNode(evicted);
    this.cache.delete(evicted.key);

    // Call eviction callback if provided
    if (this.onEvict) {
      this.onEvict(evicted.key, evicted.value);
    }
  }
}
