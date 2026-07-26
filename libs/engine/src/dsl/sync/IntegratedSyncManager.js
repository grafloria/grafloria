/**
 * Integrated Sync Manager - Complete synchronization solution
 *
 * Combines BidirectionalSync, LayoutApplicator, and SyncStateManager
 * into a single, easy-to-use interface for text ↔ visual editing.
 */
import { __awaiter } from "tslib";
import { BidirectionalSync } from './BidirectionalSync';
import { LayoutApplicator } from './LayoutApplicator';
import { SyncStateManager } from './SyncStateManager';
export class IntegratedSyncManager {
    constructor(options = {}) {
        var _a, _b, _c, _d;
        // Callbacks
        this.textChangeCallbacks = [];
        this.diagramChangeCallbacks = [];
        this.options = {
            syncOptions: (_a = options.syncOptions) !== null && _a !== void 0 ? _a : {},
            layoutOptions: (_b = options.layoutOptions) !== null && _b !== void 0 ? _b : {},
            autoLayoutOnTextChange: (_c = options.autoLayoutOnTextChange) !== null && _c !== void 0 ? _c : true,
            debug: (_d = options.debug) !== null && _d !== void 0 ? _d : false,
        };
        // Initialize components
        this.bidirectionalSync = new BidirectionalSync(Object.assign(Object.assign({}, this.options.syncOptions), { debug: this.options.debug }));
        this.layoutApplicator = new LayoutApplicator(Object.assign(Object.assign({}, this.options.layoutOptions), { debug: this.options.debug }));
        this.stateManager = new SyncStateManager();
        // Setup sync callbacks
        this.setupSyncCallbacks();
    }
    /**
     * Initialize with diagram and optional initial text
     */
    initialize(diagram, initialText) {
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
    onTextEdit(newText) {
        this.bidirectionalSync.markTextEdit();
        this.bidirectionalSync.onTextChange(newText);
    }
    /**
     * Handle visual editor changes
     */
    onVisualEdit() {
        this.bidirectionalSync.markVisualEdit();
    }
    /**
     * Get current text
     */
    getText() {
        return this.bidirectionalSync.getCurrentText();
    }
    /**
     * Get current diagram
     */
    getDiagram() {
        return this.bidirectionalSync.getDiagram();
    }
    /**
     * Get sync status
     */
    getStatus() {
        return this.stateManager.getStatus();
    }
    /**
     * Get sync metrics
     */
    getMetrics() {
        return this.stateManager.getMetrics();
    }
    /**
     * Apply layout to current diagram
     */
    applyLayout(presetId) {
        return __awaiter(this, void 0, void 0, function* () {
            const diagram = this.getDiagram();
            if (!diagram)
                return;
            if (presetId) {
                yield this.layoutApplicator.applyLayoutPreset(diagram, presetId);
            }
            else {
                yield this.layoutApplicator.applyOptimalLayout(diagram);
            }
            // Force visual → text sync after layout
            this.bidirectionalSync.forceSync('visual-to-text');
        });
    }
    /**
     * Get layout suggestion
     */
    suggestLayout() {
        const diagram = this.getDiagram();
        if (!diagram)
            return null;
        return this.layoutApplicator.suggestLayout(diagram);
    }
    /**
     * Subscribe to text changes
     */
    onTextChange(callback) {
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
    onDiagramChange(callback) {
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
    onStatusChange(callback) {
        return this.stateManager.onStatusChange(callback);
    }
    /**
     * Pause sync
     */
    pause() {
        this.bidirectionalSync.pause();
    }
    /**
     * Resume sync
     */
    resume() {
        this.bidirectionalSync.resume();
    }
    /**
     * Force sync in specific direction
     */
    forceSync(direction) {
        this.bidirectionalSync.forceSync(direction);
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.stateManager.resetMetrics();
    }
    /**
     * Get formatted status string
     */
    getFormattedStatus() {
        return this.stateManager.getFormattedStatus();
    }
    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        return this.stateManager.getMetricsSummary();
    }
    /**
     * Setup sync callbacks
     */
    setupSyncCallbacks() {
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
                }
                else if (direction === 'visual-to-text') {
                    this.emitTextChange(this.getText());
                }
            }
            else {
                this.stateManager.failSync('Sync failed');
            }
        });
    }
    /**
     * Emit text change
     */
    emitTextChange(text) {
        for (const callback of this.textChangeCallbacks) {
            try {
                callback(text);
            }
            catch (error) {
                console.error('[IntegratedSync] Text change callback error:', error);
            }
        }
    }
    /**
     * Emit diagram change
     */
    emitDiagramChange(diagram) {
        for (const callback of this.diagramChangeCallbacks) {
            try {
                callback(diagram);
            }
            catch (error) {
                console.error('[IntegratedSync] Diagram change callback error:', error);
            }
        }
    }
    /**
     * Dispose and cleanup
     */
    dispose() {
        this.bidirectionalSync.dispose();
        this.textChangeCallbacks = [];
        this.diagramChangeCallbacks = [];
        if (this.options.debug) {
            console.log('[IntegratedSync] Disposed');
        }
    }
}
//# sourceMappingURL=IntegratedSyncManager.js.map