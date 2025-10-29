/**
 * Bidirectional Sync - Manages real-time text ↔ visual synchronization
 *
 * Implements debounced bidirectional editing with conflict resolution:
 * - 300ms debounce for both directions
 * - Prevents infinite sync loops
 * - Tracks edit sources (text vs visual)
 * - Provides sync state and statistics
 */

import { DiagramModel } from '../../models/DiagramModel';
import { DSL } from '../DSL';
import { GeneratorOptions } from '../generator/DSLGenerator';
import { TransformOptions } from '../transformer/ASTTransformer';

export type SyncDirection = 'text-to-visual' | 'visual-to-text' | 'none';
export type EditSource = 'text' | 'visual' | 'none';

export interface SyncOptions {
  /**
   * Debounce delay in milliseconds (default: 300)
   */
  debounceMs?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Auto-apply layout after text changes
   */
  autoLayout?: boolean;

  /**
   * Generator options for visual→text sync
   */
  generatorOptions?: GeneratorOptions;

  /**
   * Transformer options for text→visual sync
   */
  transformerOptions?: TransformOptions;
}

export interface SyncState {
  /**
   * Is sync currently active
   */
  active: boolean;

  /**
   * Last edit source
   */
  lastEditSource: EditSource;

  /**
   * Last sync direction
   */
  lastSyncDirection: SyncDirection;

  /**
   * Sync in progress
   */
  syncing: boolean;

  /**
   * Number of pending syncs
   */
  pendingCount: number;

  /**
   * Statistics
   */
  stats: {
    textToVisualCount: number;
    visualToTextCount: number;
    conflictsResolved: number;
    lastSyncTime: number;
  };
}

export type SyncCallback = (direction: SyncDirection, success: boolean) => void;

export class BidirectionalSync {
  private dsl: DSL;
  private diagram?: DiagramModel;
  private currentText: string = '';
  private options: Required<SyncOptions>;

  // Debounce timers
  private textDebounceTimer?: NodeJS.Timeout;
  private visualDebounceTimer?: NodeJS.Timeout;

  // Sync state
  private state: SyncState = {
    active: false,
    lastEditSource: 'none',
    lastSyncDirection: 'none',
    syncing: false,
    pendingCount: 0,
    stats: {
      textToVisualCount: 0,
      visualToTextCount: 0,
      conflictsResolved: 0,
      lastSyncTime: 0,
    },
  };

  // Sync lock to prevent loops
  private syncLock = false;

  // Callbacks
  private callbacks: SyncCallback[] = [];

  // Change listeners
  private diagramChangeListener?: () => void;

  constructor(options: SyncOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 300,
      debug: options.debug ?? false,
      autoLayout: options.autoLayout ?? true,
      generatorOptions: options.generatorOptions ?? {},
      transformerOptions: options.transformerOptions ?? {},
    };

    this.dsl = new DSL({
      autoLayout: this.options.autoLayout,
      debug: this.options.debug,
      transformOptions: this.options.transformerOptions,
    });
  }

  /**
   * Initialize sync with diagram and initial text
   */
  initialize(diagram: DiagramModel, initialText?: string): void {
    this.diagram = diagram;

    if (initialText) {
      this.currentText = initialText;
    } else {
      // Generate initial text from diagram
      this.currentText = this.dsl.generate(diagram, this.options.generatorOptions);
    }

    // Listen to diagram changes
    this.setupDiagramListeners();

    this.state.active = true;

    if (this.options.debug) {
      console.log('[BidirectionalSync] Initialized');
    }
  }

  /**
   * Update text (called when user edits text)
   */
  onTextChange(newText: string): void {
    if (!this.state.active || this.syncLock) {
      return;
    }

    // Clear existing timer
    if (this.textDebounceTimer) {
      clearTimeout(this.textDebounceTimer);
    }

    // Update state
    this.state.lastEditSource = 'text';
    this.state.pendingCount++;

    if (this.options.debug) {
      console.log(`[BidirectionalSync] Text changed, debouncing (${this.options.debounceMs}ms)...`);
    }

    // Debounce
    this.textDebounceTimer = setTimeout(() => {
      this.syncTextToVisual(newText);
      this.state.pendingCount--;
    }, this.options.debounceMs);
  }

  /**
   * Sync text to visual (text → diagram)
   */
  private async syncTextToVisual(text: string): Promise<void> {
    if (!this.diagram || this.syncLock) {
      return;
    }

    this.state.syncing = true;
    this.state.lastSyncDirection = 'text-to-visual';

    // Set lock to prevent visual → text sync
    this.syncLock = true;

    try {
      if (this.options.debug) {
        console.log('[BidirectionalSync] Syncing text → visual...');
      }

      const startTime = performance.now();

      // Parse new text
      const newDiagram = this.dsl.parse(text);

      // Update current diagram
      this.updateDiagram(newDiagram);

      // Update stored text
      this.currentText = text;

      // Update stats
      this.state.stats.textToVisualCount++;
      this.state.stats.lastSyncTime = performance.now() - startTime;

      if (this.options.debug) {
        console.log(`[BidirectionalSync] Text → Visual complete (${this.state.stats.lastSyncTime.toFixed(2)}ms)`);
      }

      // Notify callbacks
      this.notifyCallbacks('text-to-visual', true);
    } catch (error) {
      console.error('[BidirectionalSync] Text → Visual sync failed:', error);
      this.notifyCallbacks('text-to-visual', false);
    } finally {
      this.syncLock = false;
      this.state.syncing = false;
    }
  }

  /**
   * Sync visual to text (diagram → text)
   */
  private async syncVisualToText(): Promise<void> {
    if (!this.diagram || this.syncLock) {
      return;
    }

    this.state.syncing = true;
    this.state.lastSyncDirection = 'visual-to-text';

    // Set lock to prevent text → visual sync
    this.syncLock = true;

    try {
      if (this.options.debug) {
        console.log('[BidirectionalSync] Syncing visual → text...');
      }

      const startTime = performance.now();

      // Generate text from diagram
      const newText = this.dsl.generate(this.diagram, this.options.generatorOptions);

      // Update stored text
      this.currentText = newText;

      // Update stats
      this.state.stats.visualToTextCount++;
      this.state.stats.lastSyncTime = performance.now() - startTime;

      if (this.options.debug) {
        console.log(`[BidirectionalSync] Visual → Text complete (${this.state.stats.lastSyncTime.toFixed(2)}ms)`);
      }

      // Notify callbacks
      this.notifyCallbacks('visual-to-text', true);
    } catch (error) {
      console.error('[BidirectionalSync] Visual → Text sync failed:', error);
      this.notifyCallbacks('visual-to-text', false);
    } finally {
      this.syncLock = false;
      this.state.syncing = false;
    }
  }

  /**
   * Update diagram with new content
   */
  private updateDiagram(newDiagram: DiagramModel): void {
    if (!this.diagram) return;

    // Clear existing content
    this.diagram.clear();

    // Copy nodes
    for (const node of newDiagram.getNodes()) {
      this.diagram.addNode(node);
    }

    // Copy links
    for (const link of newDiagram.getLinks()) {
      this.diagram.addLink(link);
    }

    // Copy metadata
    const metadata = newDiagram.getMetadata('diagramType');
    if (metadata) {
      this.diagram.setMetadata('diagramType', metadata);
    }
  }

  /**
   * Setup diagram change listeners
   */
  private setupDiagramListeners(): void {
    if (!this.diagram) return;

    // Listen to all diagram changes
    this.diagramChangeListener = () => {
      if (this.state.lastEditSource === 'visual') {
        this.onVisualChange();
      }
    };

    this.diagram.on('node:added', this.diagramChangeListener);
    this.diagram.on('node:removed', this.diagramChangeListener);
    this.diagram.on('node:changed', this.diagramChangeListener);
    this.diagram.on('link:added', this.diagramChangeListener);
    this.diagram.on('link:removed', this.diagramChangeListener);
    this.diagram.on('link:changed', this.diagramChangeListener);
  }

  /**
   * Handle visual changes (called when diagram is modified)
   */
  private onVisualChange(): void {
    if (!this.state.active || this.syncLock) {
      return;
    }

    // Clear existing timer
    if (this.visualDebounceTimer) {
      clearTimeout(this.visualDebounceTimer);
    }

    // Update state
    this.state.pendingCount++;

    if (this.options.debug) {
      console.log(`[BidirectionalSync] Visual changed, debouncing (${this.options.debounceMs}ms)...`);
    }

    // Debounce
    this.visualDebounceTimer = setTimeout(() => {
      this.syncVisualToText();
      this.state.pendingCount--;
    }, this.options.debounceMs);
  }

  /**
   * Mark next changes as from visual editor
   */
  markVisualEdit(): void {
    this.state.lastEditSource = 'visual';
  }

  /**
   * Mark next changes as from text editor
   */
  markTextEdit(): void {
    this.state.lastEditSource = 'text';
  }

  /**
   * Get current text
   */
  getCurrentText(): string {
    return this.currentText;
  }

  /**
   * Get current diagram
   */
  getDiagram(): DiagramModel | undefined {
    return this.diagram;
  }

  /**
   * Get sync state
   */
  getState(): Readonly<SyncState> {
    return { ...this.state };
  }

  /**
   * Add sync callback
   */
  onSync(callback: SyncCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify callbacks
   */
  private notifyCallbacks(direction: SyncDirection, success: boolean): void {
    for (const callback of this.callbacks) {
      try {
        callback(direction, success);
      } catch (error) {
        console.error('[BidirectionalSync] Callback error:', error);
      }
    }
  }

  /**
   * Pause sync
   */
  pause(): void {
    this.state.active = false;

    if (this.options.debug) {
      console.log('[BidirectionalSync] Paused');
    }
  }

  /**
   * Resume sync
   */
  resume(): void {
    this.state.active = true;

    if (this.options.debug) {
      console.log('[BidirectionalSync] Resumed');
    }
  }

  /**
   * Force sync in specific direction
   */
  forceSync(direction: 'text-to-visual' | 'visual-to-text'): void {
    if (direction === 'text-to-visual') {
      this.syncTextToVisual(this.currentText);
    } else {
      this.syncVisualToText();
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    // Clear timers
    if (this.textDebounceTimer) {
      clearTimeout(this.textDebounceTimer);
    }
    if (this.visualDebounceTimer) {
      clearTimeout(this.visualDebounceTimer);
    }

    // Remove listeners
    if (this.diagram && this.diagramChangeListener) {
      this.diagram.off('node:added', this.diagramChangeListener);
      this.diagram.off('node:removed', this.diagramChangeListener);
      this.diagram.off('node:changed', this.diagramChangeListener);
      this.diagram.off('link:added', this.diagramChangeListener);
      this.diagram.off('link:removed', this.diagramChangeListener);
      this.diagram.off('link:changed', this.diagramChangeListener);
    }

    this.state.active = false;
    this.callbacks = [];

    if (this.options.debug) {
      console.log('[BidirectionalSync] Disposed');
    }
  }
}
