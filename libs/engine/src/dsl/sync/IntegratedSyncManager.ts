/**
 * Integrated Sync Manager - Complete synchronization solution
 *
 * Combines BidirectionalSync, LayoutApplicator, and SyncStateManager
 * into a single, easy-to-use interface for text ↔ visual editing.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { BidirectionalSync, SyncOptions, SyncDirection } from './BidirectionalSync';
import { LayoutApplicator, LayoutApplicatorOptions } from './LayoutApplicator';
import { SyncStateManager, SyncStatus, SyncMetrics } from './SyncStateManager';

export interface IntegratedSyncOptions {
  /**
   * Bidirectional sync options
   */
  syncOptions?: SyncOptions;

  /**
   * Layout applicator options
   */
  layoutOptions?: LayoutApplicatorOptions;

  /**
   * Enable auto-layout on text changes
   */
  autoLayoutOnTextChange?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

export type TextChangeCallback = (text: string) => void;
export type DiagramChangeCallback = (diagram: DiagramModel) => void;
export type StatusCallback = (status: SyncStatus) => void;

export class IntegratedSyncManager {
  private bidirectionalSync: BidirectionalSync;
  private layoutApplicator: LayoutApplicator;
  private stateManager: SyncStateManager;
  private options: Required<IntegratedSyncOptions>;

  // Callbacks
  private textChangeCallbacks: TextChangeCallback[] = [];
  private diagramChangeCallbacks: DiagramChangeCallback[] = [];

  constructor(options: IntegratedSyncOptions = {}) {
    this.options = {
      syncOptions: options.syncOptions ?? {},
      layoutOptions: options.layoutOptions ?? {},
      autoLayoutOnTextChange: options.autoLayoutOnTextChange ?? true,
      debug: options.debug ?? false,
    };

    // Initialize components
    this.bidirectionalSync = new BidirectionalSync({
      ...this.options.syncOptions,
      debug: this.options.debug,
    });

    this.layoutApplicator = new LayoutApplicator({
      ...this.options.layoutOptions,
      debug: this.options.debug,
    });

    this.stateManager = new SyncStateManager();

    // Setup sync callbacks
    this.setupSyncCallbacks();
  }

  /**
   * Initialize with diagram and optional initial text
   */
  initialize(diagram: DiagramModel, initialText?: string): void {
    this.bidirectionalSync.initialize(diagram, initialText);

    if (this.options.debug) {
      console.log('[IntegratedSync] Initialized');
    }

    // Emit initial state
    this.emitTextChange(this.bidirectionalSync.getCurrentText());
  }

  /**
   * Handle text editor changes
   */
  onTextEdit(newText: string): void {
    this.bidirectionalSync.markTextEdit();
    this.bidirectionalSync.onTextChange(newText);
  }

  /**
   * Handle visual editor changes
   */
  onVisualEdit(): void {
    this.bidirectionalSync.markVisualEdit();
  }

  /**
   * Get current text
   */
  getText(): string {
    return this.bidirectionalSync.getCurrentText();
  }

  /**
   * Get current diagram
   */
  getDiagram(): DiagramModel | undefined {
    return this.bidirectionalSync.getDiagram();
  }

  /**
   * Get sync status
   */
  getStatus(): SyncStatus {
    return this.stateManager.getStatus();
  }

  /**
   * Get sync metrics
   */
  getMetrics(): SyncMetrics {
    return this.stateManager.getMetrics();
  }

  /**
   * Apply layout to current diagram
   */
  async applyLayout(presetId?: string): Promise<void> {
    const diagram = this.getDiagram();
    if (!diagram) return;

    if (presetId) {
      await this.layoutApplicator.applyLayoutPreset(diagram, presetId);
    } else {
      await this.layoutApplicator.applyOptimalLayout(diagram);
    }

    // Force visual → text sync after layout
    this.bidirectionalSync.forceSync('visual-to-text');
  }

  /**
   * Get layout suggestion
   */
  suggestLayout() {
    const diagram = this.getDiagram();
    if (!diagram) return null;

    return this.layoutApplicator.suggestLayout(diagram);
  }

  /**
   * Subscribe to text changes
   */
  onTextChange(callback: TextChangeCallback): () => void {
    this.textChangeCallbacks.push(callback);

    return () => {
      const index = this.textChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.textChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to diagram changes
   */
  onDiagramChange(callback: DiagramChangeCallback): () => void {
    this.diagramChangeCallbacks.push(callback);

    return () => {
      const index = this.diagramChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.diagramChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StatusCallback): () => void {
    return this.stateManager.onStatusChange(callback);
  }

  /**
   * Pause sync
   */
  pause(): void {
    this.bidirectionalSync.pause();
  }

  /**
   * Resume sync
   */
  resume(): void {
    this.bidirectionalSync.resume();
  }

  /**
   * Force sync in specific direction
   */
  forceSync(direction: 'text-to-visual' | 'visual-to-text'): void {
    this.bidirectionalSync.forceSync(direction);
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.stateManager.resetMetrics();
  }

  /**
   * Get formatted status string
   */
  getFormattedStatus(): string {
    return this.stateManager.getFormattedStatus();
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): string {
    return this.stateManager.getMetricsSummary();
  }

  /**
   * Setup sync callbacks
   */
  private setupSyncCallbacks(): void {
    this.bidirectionalSync.onSync((direction, success) => {
      const syncState = this.bidirectionalSync.getState();
      const syncTime = syncState.stats.lastSyncTime;

      if (success) {
        this.stateManager.completeSync(direction, syncTime);

        // Emit changes
        if (direction === 'text-to-visual') {
          const diagram = this.getDiagram();
          if (diagram) {
            this.emitDiagramChange(diagram);

            // Auto-layout if enabled
            if (this.options.autoLayoutOnTextChange) {
              this.applyLayout().catch((err) => {
                console.error('[IntegratedSync] Auto-layout failed:', err);
              });
            }
          }
        } else if (direction === 'visual-to-text') {
          this.emitTextChange(this.getText());
        }
      } else {
        this.stateManager.failSync('Sync failed');
      }
    });
  }

  /**
   * Emit text change
   */
  private emitTextChange(text: string): void {
    for (const callback of this.textChangeCallbacks) {
      try {
        callback(text);
      } catch (error) {
        console.error('[IntegratedSync] Text change callback error:', error);
      }
    }
  }

  /**
   * Emit diagram change
   */
  private emitDiagramChange(diagram: DiagramModel): void {
    for (const callback of this.diagramChangeCallbacks) {
      try {
        callback(diagram);
      } catch (error) {
        console.error('[IntegratedSync] Diagram change callback error:', error);
      }
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.bidirectionalSync.dispose();
    this.textChangeCallbacks = [];
    this.diagramChangeCallbacks = [];

    if (this.options.debug) {
      console.log('[IntegratedSync] Disposed');
    }
  }
}
