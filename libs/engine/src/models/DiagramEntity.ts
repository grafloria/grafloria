// Base class for all diagram entities

import { EventEmitter } from 'eventemitter3';
import { SerializedEntity } from '../types';
import { generateId, generateUUID, deepClone } from '../utils';

export interface ChangeEntry {
  timestamp: number;
  property: string;
  oldValue: any;
  newValue: any;
}

/**
 * wave8/dirty — THE MUTATION EPOCH.
 *
 * A monotone counter bumped by `markDirty()`, which is the ONE funnel every
 * model mutation already passes through: `trackChange()` calls it on every
 * property write, and `DiagramModel` is itself a `DiagramEntity`, so adding or
 * removing a node/link/group (`trackChange('nodes'|'links'|'groups', …)`) bumps
 * it too. Nothing that can change the picture reaches the renderer without
 * passing this line.
 *
 * That makes it an O(1), CONSERVATIVE answer to the only question an
 * incremental renderer must answer before it can skip a frame: *has anything
 * changed since the frame I already have on screen?* Scanning dirty FLAGS
 * cannot answer it — the renderer marks an entity clean only when it renders
 * one, so in a virtualized 10k-node scene the ~9,900 off-screen nodes are dirty
 * forever and every dirty-count check returns "yes, something changed" for the
 * life of the diagram. (That is not hypothetical: it is exactly why
 * `createDiagram`'s idle-skip never fired on a big diagram — see
 * `instance/create-diagram.ts`.)
 *
 * It is deliberately GLOBAL rather than per-diagram: an entity has no
 * back-reference to its model in the base class, and the failure mode of a
 * global counter (a mutation in diagram A makes diagram B redraw one extra
 * frame) is a wasted frame, while the failure mode of an under-counting
 * per-model one is a STALE PICTURE. Only ever err toward the wasted frame.
 *
 * `markClean()` does NOT bump it — cleaning is the renderer telling the model
 * "I drew you", not the model changing.
 */
let mutationEpoch = 0;

/** Read the current mutation epoch. Cheap enough to call every frame. */
export function getMutationEpoch(): number {
  return mutationEpoch;
}

/**
 * Bump the epoch by hand, for a mutation that legitimately bypasses
 * `markDirty()` (in-place `points` rewrites, say). Prefer `markDirty()`.
 */
export function bumpMutationEpoch(): number {
  return ++mutationEpoch;
}

export abstract class DiagramEntity {
  readonly id: string;
  readonly uuid: string;
  version: number = 1;
  metadata: Map<string, any>;

  protected emitter: EventEmitter;
  protected changeLog: ChangeEntry[] = [];
  protected maxChangeLogSize = 100;

  // Phase 5.2: Dirty marking for lazy rendering
  private _isDirty: boolean = true; // Start dirty since never rendered
  private _dirtyTimestamp: number | null = null;
  private _dirtyReasons: Set<string> = new Set(['created']);
  private _batchDepth: number = 0;
  private _batchHadChanges: boolean = false;

  // Phase 5.4: Memory management
  private _disposed: boolean = false;

  constructor(id?: string, uuid?: string) {
    this.id = id || generateId();
    this.uuid = uuid || generateUUID();
    this.metadata = new Map();
    this.emitter = new EventEmitter();
    this._dirtyTimestamp = Date.now(); // Set initial timestamp
  }

  /**
   * Check if entity has been modified since last render (Phase 5.2)
   */
  get isDirty(): boolean {
    return this._isDirty;
  }

  /**
   * Mark entity as dirty (needs re-render) (Phase 5.2)
   */
  markDirty(reason?: string): void {
    this.assertNotDisposed(); // Phase 5.4: Prevent operations on disposed entities

    const wasDirty = this._isDirty;

    // wave8/dirty: bump UNCONDITIONALLY — not inside the `!wasDirty` guard below.
    // An already-dirty entity that changes again HAS changed again; a renderer
    // that rendered it in between (and so left it dirty only because it is
    // off-screen) must still be told. Counting only clean→dirty transitions
    // would silently lose those, and a lost bump is a stale frame.
    mutationEpoch++;

    this._isDirty = true;
    this._dirtyTimestamp = Date.now();

    if (reason) {
      this._dirtyReasons.add(reason);
    }

    // Only emit if state changed
    if (!wasDirty) {
      this.emitter.emit('dirty:changed', true);
    }
  }

  /**
   * Mark entity as clean (rendered) (Phase 5.2)
   */
  markClean(): void {
    this.assertNotDisposed(); // Phase 5.4

    const wasDirty = this._isDirty;

    this._isDirty = false;
    this._dirtyTimestamp = null;
    this._dirtyReasons.clear();

    // Only emit if state changed
    if (wasDirty) {
      this.emitter.emit('dirty:changed', false);
    }
  }

  /**
   * Get reasons why entity is dirty (Phase 5.2)
   */
  getDirtyReasons(): string[] {
    return Array.from(this._dirtyReasons);
  }

  /**
   * Get timestamp when entity was marked dirty (Phase 5.2)
   */
  getDirtyTimestamp(): number | null {
    return this._dirtyTimestamp;
  }

  /**
   * Begin batch update (Phase 5.2)
   * Delays dirty marking until batch ends
   */
  beginBatch(): void {
    this._batchDepth++;
  }

  /**
   * End batch update (Phase 5.2)
   * Marks dirty once if any changes occurred
   */
  endBatch(): void {
    this._batchDepth = Math.max(0, this._batchDepth - 1);

    // When all batches complete, mark dirty if needed
    if (this._batchDepth === 0 && this._batchHadChanges) {
      this.markDirty('batch');
      this._batchHadChanges = false;
    }
  }

  /**
   * Check if currently in batch mode
   */
  isBatching(): boolean {
    return this._batchDepth > 0;
  }

  /**
   * Restore persisted identity onto a freshly-constructed entity during
   * deserialization. A load must reproduce the SAVED identity (uuid) and
   * mutation counter (version) rather than mint new ones — otherwise
   * save/load is lossy and anything anchored to uuids (ops, comments,
   * collaboration) breaks across a round-trip. `uuid` is readonly at the
   * type level; this is the one sanctioned place it is written after
   * construction.
   */
  protected restoreIdentity(data: { uuid?: string; version?: number }): void {
    if (data.uuid) {
      (this as { uuid: string }).uuid = data.uuid;
    }
    if (typeof data.version === 'number') {
      this.version = data.version;
    }
  }

  /**
   * Track property changes for undo/redo and events
   */
  protected trackChange(
    property: string,
    oldValue: any,
    newValue: any
  ): void {
    this.assertNotDisposed(); // Phase 5.4

    // Skip if values are the same
    if (oldValue === newValue) return;

    const entry: ChangeEntry = {
      timestamp: Date.now(),
      property,
      oldValue: this.cloneValue(oldValue),
      newValue: this.cloneValue(newValue),
    };

    // Add to change log
    this.changeLog.push(entry);
    if (this.changeLog.length > this.maxChangeLogSize) {
      this.changeLog.shift();
    }

    // Increment version
    this.version++;

    // Phase 5.2: Auto-mark dirty on changes
    if (this._batchDepth > 0) {
      // In batch mode, just track that changes occurred
      this._batchHadChanges = true;
      this._dirtyReasons.add(property);
    } else {
      // Not in batch, mark dirty immediately
      this.markDirty(property);
    }

    // Emit change event
    this.emitter.emit('change', entry);
    this.emitter.emit(`change:${property}`, {
      oldValue: entry.oldValue,
      newValue: entry.newValue,
    });
  }

  /**
   * Subscribe to changes
   */
  on(event: string, handler: Function): () => void {
    this.emitter.on(event, handler as any);
    return () => this.emitter.off(event, handler as any);
  }

  /**
   * Subscribe to property changes
   */
  onPropertyChange(property: string, handler: (data: any) => void): () => void {
    return this.on(`change:${property}`, handler);
  }

  /**
   * Get change history
   */
  getChangeLog(): ReadonlyArray<ChangeEntry> {
    return [...this.changeLog];
  }

  /**
   * Clear change history
   */
  clearChangeLog(): void {
    this.changeLog = [];
  }

  /**
   * Set metadata value
   */
  setMetadata(key: string, value: any): void {
    this.assertNotDisposed(); // Phase 5.4
    const oldValue = this.metadata.get(key);
    this.metadata.set(key, value);
    this.trackChange(`metadata.${key}`, oldValue, value);
  }

  /**
   * Get metadata value
   */
  getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  /**
   * Remove metadata
   */
  deleteMetadata(key: string): void {
    const oldValue = this.metadata.get(key);
    this.metadata.delete(key);
    this.trackChange(`metadata.${key}`, oldValue, undefined);
  }

  /**
   * Clone a value for change tracking
   */
  protected cloneValue(value: any): any {
    return deepClone(value);
  }

  /**
   * Serialize entity to JSON
   */
  abstract serialize(): SerializedEntity;

  /**
   * Check if entity has been disposed (Phase 5.4)
   */
  isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Check if entity is not disposed and throw if it is (Phase 5.4)
   */
  protected assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('Cannot operate on disposed entity');
    }
  }

  /**
   * Dispose entity and clean up resources (Phase 5.4)
   * Prevents memory leaks by:
   * - Removing all event listeners
   * - Clearing change log
   * - Clearing metadata
   * - Marking as disposed
   */
  dispose(): void {
    if (this._disposed) {
      return; // Already disposed, idempotent
    }

    // Emit disposed event before cleanup
    this.emitter.emit('disposed');

    // Remove all event listeners (prevents memory leaks)
    this.emitter.removeAllListeners();

    // Clear change log
    this.changeLog = [];

    // Clear metadata
    this.metadata.clear();

    // Clear dirty tracking
    this._dirtyReasons.clear();
    this._dirtyTimestamp = null;

    // Mark as disposed
    this._disposed = true;
  }
}
