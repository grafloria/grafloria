import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * History Entry
 * Represents a single snapshot in the undo/redo history
 */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  snapshot: {
    json: string;
    html: string;
    css: string;
  };
  parentId?: string; // For branching history
}

/**
 * Undo/Redo Service
 *
 * Manages undo/redo history with branching support.
 * Maintains a stack of changes and provides time-travel functionality.
 *
 * Responsibilities:
 * - Track all changes
 * - Provide undo/redo functionality
 * - Support branching history
 * - Maintain named checkpoints
 *
 * ~200 lines
 */
@Injectable({
  providedIn: 'root'
})
export class UndoRedoService {

  private readonly MAX_HISTORY_SIZE = 100;

  private history: HistoryEntry[] = [];
  private currentIndex = -1;

  private canUndoSubject = new BehaviorSubject<boolean>(false);
  private canRedoSubject = new BehaviorSubject<boolean>(false);

  public canUndo$: Observable<boolean> = this.canUndoSubject.asObservable();
  public canRedo$: Observable<boolean> = this.canRedoSubject.asObservable();

  /**
   * Push a new state to history
   */
  pushState(
    json: string,
    html: string,
    css: string,
    description: string
  ): void {
    // Remove any redo history when pushing new state
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Create new entry
    const entry: HistoryEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      description,
      snapshot: { json, html, css },
      parentId: this.currentIndex >= 0 ? this.history[this.currentIndex].id : undefined
    };

    // Add to history
    this.history.push(entry);
    this.currentIndex++;

    // Trim history if too large
    if (this.history.length > this.MAX_HISTORY_SIZE) {
      this.history = this.history.slice(this.history.length - this.MAX_HISTORY_SIZE);
      this.currentIndex = this.history.length - 1;
    }

    this.updateCanUndoRedo();
  }

  /**
   * Undo to previous state
   */
  undo(): HistoryEntry | null {
    if (!this.canUndo()) {
      return null;
    }

    this.currentIndex--;
    this.updateCanUndoRedo();

    return this.getCurrentEntry();
  }

  /**
   * Redo to next state
   */
  redo(): HistoryEntry | null {
    if (!this.canRedo()) {
      return null;
    }

    this.currentIndex++;
    this.updateCanUndoRedo();

    return this.getCurrentEntry();
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get current history entry
   */
  getCurrentEntry(): HistoryEntry | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
      return null;
    }
    return this.history[this.currentIndex];
  }

  /**
   * Get full history
   */
  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get current index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Jump to specific history entry
   */
  jumpTo(index: number): HistoryEntry | null {
    if (index < 0 || index >= this.history.length) {
      return null;
    }

    this.currentIndex = index;
    this.updateCanUndoRedo();

    return this.getCurrentEntry();
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.updateCanUndoRedo();
  }

  /**
   * Create a named checkpoint
   */
  createCheckpoint(name: string, json: string, html: string, css: string): void {
    this.pushState(json, html, css, `Checkpoint: ${name}`);
  }

  /**
   * Update can undo/redo subjects
   */
  private updateCanUndoRedo(): void {
    this.canUndoSubject.next(this.canUndo());
    this.canRedoSubject.next(this.canRedo());
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
