// DiagramStore - State management for diagram application

import type { Viewport } from '../types';
import type { DiagramModel } from '../models/DiagramModel';

export interface RenderStats {
  fps: number;
  renderTime: number;
  nodeCount: number;
  linkCount: number;
  visibleNodes: number;
  visibleLinks: number;
}

export interface DiagramState {
  // Model state
  diagram: DiagramModel | null;

  // Selection state
  selectedNodes: Set<string>;
  selectedLinks: Set<string>;
  hoveredElement: string | null;
  focusedElement: string | null;

  // View state
  viewport: Viewport;
  zoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;

  // Tool state
  activeTool: string;
  toolOptions: Record<string, any>;

  // Mode state
  mode: 'design' | 'runtime' | 'readonly';
  locked: boolean;

  // UI state
  theme: 'light' | 'dark';
  showMinimap: boolean;
  showToolbar: boolean;
  showProperties: boolean;

  // Performance
  renderStats: RenderStats;

  // Errors
  errors: Error[];
  warnings: string[];
}

export interface StateSnapshot {
  timestamp: number;
  state: DiagramState;
  version: string;
}

export type StateListener = (state: DiagramState, changes: string[]) => void;
export type PathListener = (value: any, oldValue: any) => void;

export class DiagramStore {
  private state: DiagramState;
  private listeners: Map<string, Set<PathListener>> = new Map();
  private globalListeners: Set<StateListener> = new Set();
  private history: StateSnapshot[] = [];
  private maxHistorySize: number = 50;
  private computedCache: Map<string, { value: any; deps: string[]; valid: boolean }> = new Map();
  private batching: boolean = false;
  private batchedChanges: string[] = [];

  constructor(initialState?: Partial<DiagramState>) {
    this.state = this.createInitialState(initialState);
  }

  /**
   * Get current state (immutable)
   */
  getState(): Readonly<DiagramState> {
    return this.deepFreeze(this.deepClone(this.state));
  }

  /**
   * Set state with change tracking
   */
  setState(updater: (state: DiagramState) => void): void {
    const prevState = this.deepClone(this.state);

    // Apply update
    updater(this.state);

    // Find changes
    const changes = this.diffState(prevState, this.state);

    if (changes.length > 0) {
      if (this.batching) {
        // Accumulate changes during batch
        this.batchedChanges.push(...changes);
      } else {
        // Invalidate computed values
        this.invalidateComputed(changes);

        // Notify listeners
        this.notifyListeners(changes);

        // Add to history
        this.addToHistory();
      }
    }
  }

  /**
   * Get state value by path
   */
  select<T>(path: string): T {
    const keys = path.split('.');
    let value: any = this.state;

    for (const key of keys) {
      if (value == null) return undefined as T;
      value = value[key];
    }

    return value as T;
  }

  /**
   * Set state value by path
   */
  set(path: string, value: any): void {
    this.setState((state) => {
      const keys = path.split('.');
      const lastKey = keys.pop()!;
      let target: any = state;

      for (const key of keys) {
        if (!(key in target)) {
          target[key] = {};
        }
        target = target[key];
      }

      target[lastKey] = value;
    });
  }

  /**
   * Subscribe to all state changes
   */
  subscribe(listener: StateListener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /**
   * Subscribe to path changes
   */
  watch(path: string, listener: PathListener): () => void {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }

    this.listeners.get(path)!.add(listener);

    return () => {
      const pathListeners = this.listeners.get(path);
      if (pathListeners) {
        pathListeners.delete(listener);
        if (pathListeners.size === 0) {
          this.listeners.delete(path);
        }
      }
    };
  }

  /**
   * Computed value with memoization
   */
  computed<T>(key: string, compute: (state: DiagramState) => T, deps?: string[]): T {
    const cached = this.computedCache.get(key);

    if (cached && cached.valid) {
      return cached.value;
    }

    const value = compute(this.state);

    this.computedCache.set(key, {
      value,
      deps: deps || [],
      valid: true,
    });

    return value;
  }

  /**
   * Batch multiple state updates
   */
  batch(fn: () => void): void {
    this.batching = true;
    this.batchedChanges = [];

    try {
      fn();

      // Process accumulated changes
      if (this.batchedChanges.length > 0) {
        // Remove duplicates
        const uniqueChanges = Array.from(new Set(this.batchedChanges));

        this.invalidateComputed(uniqueChanges);
        this.notifyListeners(uniqueChanges);
        this.addToHistory();
      }
    } finally {
      this.batching = false;
      this.batchedChanges = [];
    }
  }

  /**
   * Reset to initial state
   */
  reset(initialState?: Partial<DiagramState>): void {
    this.state = this.createInitialState(initialState);
    this.computedCache.clear();
    this.notifyListeners(['*']);
    this.history = [];
  }

  /**
   * Time travel to history index
   */
  timeTravel(index: number): void {
    if (index >= 0 && index < this.history.length) {
      const snapshot = this.history[index];
      this.state = this.deepClone(snapshot!.state);
      this.computedCache.clear();
      this.notifyListeners(['*']);
    }
  }

  /**
   * Get history
   */
  getHistory(): ReadonlyArray<StateSnapshot> {
    return [...this.history];
  }

  /**
   * Create snapshot
   */
  createSnapshot(): StateSnapshot {
    return {
      timestamp: Date.now(),
      state: this.deepClone(this.state),
      version: '1.0.0',
    };
  }

  /**
   * Restore snapshot
   */
  restoreSnapshot(snapshot: StateSnapshot): void {
    this.state = this.deepClone(snapshot.state);
    this.computedCache.clear();
    this.notifyListeners(['*']);
  }

  /**
   * Create initial state
   */
  private createInitialState(partial?: Partial<DiagramState>): DiagramState {
    return {
      diagram: null,
      selectedNodes: new Set(),
      selectedLinks: new Set(),
      hoveredElement: null,
      focusedElement: null,
      viewport: { x: 0, y: 0, zoom: 1, rotation: 0 },
      zoom: 1,
      gridEnabled: true,
      snapEnabled: true,
      activeTool: 'select',
      toolOptions: {},
      mode: 'design',
      locked: false,
      theme: 'light',
      showMinimap: false,
      showToolbar: true,
      showProperties: true,
      renderStats: {
        fps: 60,
        renderTime: 0,
        nodeCount: 0,
        linkCount: 0,
        visibleNodes: 0,
        visibleLinks: 0,
      },
      errors: [],
      warnings: [],
      ...partial,
    };
  }

  /**
   * Diff two states
   */
  private diffState(prev: any, current: any, path: string = ''): string[] {
    const changes: string[] = [];

    // Handle primitives
    if (prev === current) return changes;
    if (typeof prev !== 'object' || typeof current !== 'object' || prev === null || current === null) {
      if (path) changes.push(path);
      return changes;
    }

    // Handle Sets
    if (prev instanceof Set || current instanceof Set) {
      const prevSet = prev instanceof Set ? prev : new Set();
      const currSet = current instanceof Set ? current : new Set();

      if (prevSet.size !== currSet.size || ![...prevSet].every((v) => currSet.has(v))) {
        if (path) changes.push(path);
      }
      return changes;
    }

    // Handle arrays
    if (Array.isArray(prev) || Array.isArray(current)) {
      if (JSON.stringify(prev) !== JSON.stringify(current)) {
        if (path) changes.push(path);
      }
      return changes;
    }

    // Handle objects
    const allKeys = new Set([...Object.keys(prev || {}), ...Object.keys(current || {})]);

    for (const key of allKeys) {
      const prevValue = prev?.[key];
      const currentValue = current?.[key];
      const keyPath = path ? `${path}.${key}` : key;

      if (prevValue !== currentValue) {
        if (
          typeof prevValue === 'object' &&
          typeof currentValue === 'object' &&
          prevValue !== null &&
          currentValue !== null
        ) {
          changes.push(...this.diffState(prevValue, currentValue, keyPath));
        } else {
          changes.push(keyPath);
        }
      }
    }

    return changes;
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(changes: string[]): void {
    // Notify path listeners
    for (const change of changes) {
      const listeners = this.listeners.get(change);
      if (listeners) {
        const value = this.select(change);
        listeners.forEach((listener) => listener(value, undefined));
      }

      // Notify parent path listeners
      const parts = change.split('.');
      for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = parts.slice(0, i).join('.');
        const parentListeners = this.listeners.get(parentPath);
        if (parentListeners) {
          const value = this.select(parentPath);
          parentListeners.forEach((listener) => listener(value, undefined));
        }
      }
    }

    // Notify global listeners
    this.globalListeners.forEach((listener) => {
      listener(this.state, changes);
    });
  }

  /**
   * Invalidate computed values
   */
  private invalidateComputed(changes: string[]): void {
    for (const [key, cached] of this.computedCache.entries()) {
      for (const dep of cached.deps) {
        if (changes.some((change) => change.startsWith(dep))) {
          cached.valid = false;
          break;
        }
      }
    }
  }

  /**
   * Add to history
   */
  private addToHistory(): void {
    this.history.push(this.createSnapshot());

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Deep clone object (handles Sets, Maps, Arrays, Objects)
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Set) {
      return new Set(Array.from(obj));
    }

    if (obj instanceof Map) {
      return new Map(Array.from(obj));
    }

    if (obj instanceof Date) {
      return new Date(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item));
    }

    // For class instances (has a constructor other than Object), return as-is
    // This prevents trying to clone DiagramModel, NodeModel, etc.
    if (obj.constructor && obj.constructor !== Object) {
      return obj;
    }

    const cloned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * Deep freeze object
   */
  private deepFreeze(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach((prop) => {
      if (obj[prop] !== null && typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
        this.deepFreeze(obj[prop]);
      }
    });

    return obj;
  }
}
