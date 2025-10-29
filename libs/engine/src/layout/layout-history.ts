/**
 * Layout History and Undo/Redo System
 *
 * Manages layout state history and enables undo/redo operations.
 * Essential for interactive editing workflows.
 */

import { NodeModel } from '../models/NodeModel';

/**
 * Snapshot of node positions at a point in time
 */
export interface LayoutSnapshot {
  /** Unique identifier for this snapshot */
  id: string;
  /** Timestamp when snapshot was created */
  timestamp: number;
  /** Node positions */
  positions: Map<string, { x: number; y: number }>;
  /** Optional description */
  description?: string;
  /** Layout algorithm used */
  algorithm?: string;
  /** Layout options used */
  options?: any;
}

/**
 * Options for layout history management
 */
export interface LayoutHistoryOptions {
  /** Maximum number of history entries to keep */
  maxHistorySize?: number;
  /** Whether to automatically create snapshots */
  autoSnapshot?: boolean;
  /** Minimum time between auto-snapshots (ms) */
  minSnapshotInterval?: number;
}

/**
 * Layout History Manager
 *
 * Manages undo/redo stack for layout operations
 */
export class LayoutHistory {
  private history: LayoutSnapshot[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number;
  private lastSnapshotTime: number = 0;
  private minSnapshotInterval: number;

  constructor(options: LayoutHistoryOptions = {}) {
    this.maxHistorySize = options.maxHistorySize || 50;
    this.minSnapshotInterval = options.minSnapshotInterval || 1000; // 1 second
  }

  /**
   * Create and push a new snapshot
   *
   * @param nodes - Current nodes
   * @param description - Optional description
   * @param algorithm - Layout algorithm used
   * @param options - Layout options used
   * @returns The created snapshot
   */
  pushSnapshot(
    nodes: NodeModel[],
    description?: string,
    algorithm?: string,
    options?: any
  ): LayoutSnapshot {
    const now = Date.now();

    // Check if enough time has passed since last snapshot
    if (now - this.lastSnapshotTime < this.minSnapshotInterval) {
      // Return last snapshot without creating a new one
      return this.history[this.currentIndex];
    }

    // Create position map
    const positions = new Map<string, { x: number; y: number }>();
    nodes.forEach(node => {
      const pos = node.position;
      positions.set(node.id, { x: pos.x, y: pos.y });
    });

    const snapshot: LayoutSnapshot = {
      id: this.generateId(),
      timestamp: now,
      positions,
      description,
      algorithm,
      options,
    };

    // If we're not at the end, remove all entries after current
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new snapshot
    this.history.push(snapshot);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }

    this.lastSnapshotTime = now;

    return snapshot;
  }

  /**
   * Undo to previous snapshot
   *
   * @returns The snapshot to restore, or undefined if can't undo
   */
  undo(): LayoutSnapshot | undefined {
    if (!this.canUndo()) {
      return undefined;
    }

    this.currentIndex--;
    return this.history[this.currentIndex];
  }

  /**
   * Redo to next snapshot
   *
   * @returns The snapshot to restore, or undefined if can't redo
   */
  redo(): LayoutSnapshot | undefined {
    if (!this.canRedo()) {
      return undefined;
    }

    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get current snapshot
   */
  getCurrentSnapshot(): LayoutSnapshot | undefined {
    return this.history[this.currentIndex];
  }

  /**
   * Get all snapshots
   */
  getAllSnapshots(): LayoutSnapshot[] {
    return [...this.history];
  }

  /**
   * Get snapshot by ID
   */
  getSnapshotById(id: string): LayoutSnapshot | undefined {
    return this.history.find(s => s.id === id);
  }

  /**
   * Restore a specific snapshot by ID
   *
   * @param id - Snapshot ID to restore
   * @returns The snapshot, or undefined if not found
   */
  restoreSnapshot(id: string): LayoutSnapshot | undefined {
    const index = this.history.findIndex(s => s.id === id);
    if (index === -1) {
      return undefined;
    }

    this.currentIndex = index;
    return this.history[index];
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.lastSnapshotTime = 0;
  }

  /**
   * Get history size
   */
  size(): number {
    return this.history.length;
  }

  /**
   * Get current index in history
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Apply snapshot to nodes
   *
   * @param snapshot - Snapshot to apply
   * @param nodes - Nodes to update
   * @returns Number of nodes updated
   */
  static applySnapshot(snapshot: LayoutSnapshot, nodes: NodeModel[]): number {
    let updatedCount = 0;

    nodes.forEach(node => {
      const pos = snapshot.positions.get(node.id);
      if (pos) {
        node.setPosition(pos.x, pos.y);
        updatedCount++;
      }
    });

    return updatedCount;
  }

  /**
   * Generate unique ID for snapshot
   */
  private generateId(): string {
    return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export history to JSON
   */
  exportToJSON(): string {
    const exportData = {
      history: this.history.map(snapshot => ({
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        positions: Array.from(snapshot.positions.entries()),
        description: snapshot.description,
        algorithm: snapshot.algorithm,
        options: snapshot.options,
      })),
      currentIndex: this.currentIndex,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import history from JSON
   *
   * @param json - JSON string to import
   * @returns True if successful
   */
  importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);

      this.history = data.history.map((item: any) => ({
        id: item.id,
        timestamp: item.timestamp,
        positions: new Map(item.positions),
        description: item.description,
        algorithm: item.algorithm,
        options: item.options,
      }));

      this.currentIndex = data.currentIndex;

      return true;
    } catch (error) {
      console.error('Failed to import layout history:', error);
      return false;
    }
  }

  /**
   * Get history statistics
   */
  getStatistics(): {
    totalSnapshots: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    oldestTimestamp: number;
    newestTimestamp: number;
    averageInterval: number;
  } {
    const snapshots = this.history;

    if (snapshots.length === 0) {
      return {
        totalSnapshots: 0,
        currentIndex: -1,
        canUndo: false,
        canRedo: false,
        oldestTimestamp: 0,
        newestTimestamp: 0,
        averageInterval: 0,
      };
    }

    const timestamps = snapshots.map(s => s.timestamp);
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const averageInterval = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;

    return {
      totalSnapshots: snapshots.length,
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      oldestTimestamp: timestamps[0],
      newestTimestamp: timestamps[timestamps.length - 1],
      averageInterval,
    };
  }
}
