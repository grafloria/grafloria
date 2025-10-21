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

export abstract class DiagramEntity {
  readonly id: string;
  readonly uuid: string;
  version: number = 1;
  metadata: Map<string, any>;

  protected emitter: EventEmitter;
  protected changeLog: ChangeEntry[] = [];
  protected maxChangeLogSize = 100;

  constructor(id?: string, uuid?: string) {
    this.id = id || generateId();
    this.uuid = uuid || generateUUID();
    this.metadata = new Map();
    this.emitter = new EventEmitter();
  }

  /**
   * Track property changes for undo/redo and events
   */
  protected trackChange(
    property: string,
    oldValue: any,
    newValue: any
  ): void {
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
   * Dispose entity and clean up resources
   */
  dispose(): void {
    this.emitter.removeAllListeners();
    this.changeLog = [];
    this.metadata.clear();
  }
}
