/**
 * Bidirectional Sync - Manages real-time text ↔ visual synchronization
 *
 * Implements debounced bidirectional editing with conflict resolution:
 * - 300ms debounce for both directions
 * - Prevents infinite sync loops
 * - Tracks edit sources (text vs visual)
 * - Provides sync state and statistics
 */
import { __awaiter } from "tslib";
import { DSL } from '../DSL';
export class BidirectionalSync {
    constructor(options = {}) {
        var _a, _b, _c, _d, _e;
        this.currentText = '';
        // Sync state
        this.state = {
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
        this.syncLock = false;
        // Event unsubscribe functions
        this.unsubscribeFunctions = [];
        // Callbacks
        this.callbacks = [];
        this.options = {
            debounceMs: (_a = options.debounceMs) !== null && _a !== void 0 ? _a : 300,
            debug: (_b = options.debug) !== null && _b !== void 0 ? _b : false,
            autoLayout: (_c = options.autoLayout) !== null && _c !== void 0 ? _c : true,
            generatorOptions: (_d = options.generatorOptions) !== null && _d !== void 0 ? _d : {},
            transformerOptions: (_e = options.transformerOptions) !== null && _e !== void 0 ? _e : {},
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
    initialize(diagram, initialText) {
        this.diagram = diagram;
        if (initialText) {
            this.currentText = initialText;
        }
        else {
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
    onTextChange(newText) {
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
    syncTextToVisual(text) {
        return __awaiter(this, void 0, void 0, function* () {
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
            }
            catch (error) {
                console.error('[BidirectionalSync] Text → Visual sync failed:', error);
                this.notifyCallbacks('text-to-visual', false);
            }
            finally {
                this.syncLock = false;
                this.state.syncing = false;
            }
        });
    }
    /**
     * Sync visual to text (diagram → text)
     */
    syncVisualToText() {
        return __awaiter(this, void 0, void 0, function* () {
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
            }
            catch (error) {
                console.error('[BidirectionalSync] Visual → Text sync failed:', error);
                this.notifyCallbacks('visual-to-text', false);
            }
            finally {
                this.syncLock = false;
                this.state.syncing = false;
            }
        });
    }
    /**
     * Update diagram with new content
     */
    updateDiagram(newDiagram) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (!this.diagram)
            return;
        // BATCH UPDATE: Suspend events during clear+rebuild to prevent flickering
        // This prevents the UI from seeing intermediate states (5→4→3→2→1→0 nodes during clear)
        const batchMethod = this.diagram.beginBatch;
        console.log('[BidirectionalSync] Beginning batch update on OLD diagram, batchMethod exists:', !!batchMethod);
        if (batchMethod && typeof batchMethod === 'function') {
            this.diagram.beginBatch();
            console.log('[BidirectionalSync] OLD diagram batch mode active:', (_b = (_a = this.diagram).isBatching) === null || _b === void 0 ? void 0 : _b.call(_a));
        }
        // IMPORTANT: Also put the NEW diagram in batch mode to prevent events during node iteration
        const newBatchMethod = newDiagram.beginBatch;
        console.log('[BidirectionalSync] Beginning batch update on NEW diagram, batchMethod exists:', !!newBatchMethod);
        if (newBatchMethod && typeof newBatchMethod === 'function') {
            newDiagram.beginBatch();
            console.log('[BidirectionalSync] NEW diagram batch mode active:', (_d = (_c = newDiagram).isBatching) === null || _d === void 0 ? void 0 : _d.call(_c));
        }
        try {
            // Clear existing content
            console.log('[BidirectionalSync] Clearing diagram...');
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
            // Copy all metadata keys
            const allMetadata = newDiagram.metadata;
            if (allMetadata && typeof allMetadata === 'object') {
                for (const [key, value] of Object.entries(allMetadata)) {
                    this.diagram.setMetadata(key, value);
                }
            }
        }
        finally {
            // END BATCH on NEW diagram first (before ending old diagram batch)
            console.log('[BidirectionalSync] Ending batch update on NEW diagram...');
            const newEndBatchMethod = newDiagram.endBatch;
            if (newEndBatchMethod && typeof newEndBatchMethod === 'function') {
                newDiagram.endBatch();
                console.log('[BidirectionalSync] NEW diagram batch mode ended, still batching:', (_f = (_e = newDiagram).isBatching) === null || _f === void 0 ? void 0 : _f.call(_e));
            }
            // END BATCH: Resume events and fire single update on OLD diagram
            console.log('[BidirectionalSync] Ending batch update on OLD diagram...');
            const endBatchMethod = this.diagram.endBatch;
            if (endBatchMethod && typeof endBatchMethod === 'function') {
                this.diagram.endBatch();
                console.log('[BidirectionalSync] OLD diagram batch mode ended, still batching:', (_h = (_g = this.diagram).isBatching) === null || _h === void 0 ? void 0 : _h.call(_g));
            }
        }
    }
    /**
     * Setup diagram change listeners
     */
    setupDiagramListeners() {
        if (!this.diagram)
            return;
        // Listen to all diagram changes
        this.diagramChangeListener = () => {
            if (this.state.lastEditSource === 'visual') {
                this.onVisualChange();
            }
        };
        // Store unsubscribe functions returned by .on()
        this.unsubscribeFunctions.push(this.diagram.on('node:added', this.diagramChangeListener));
        this.unsubscribeFunctions.push(this.diagram.on('node:removed', this.diagramChangeListener));
        this.unsubscribeFunctions.push(this.diagram.on('node:changed', this.diagramChangeListener));
        this.unsubscribeFunctions.push(this.diagram.on('link:added', this.diagramChangeListener));
        this.unsubscribeFunctions.push(this.diagram.on('link:removed', this.diagramChangeListener));
        this.unsubscribeFunctions.push(this.diagram.on('link:changed', this.diagramChangeListener));
    }
    /**
     * Handle visual changes (called when diagram is modified)
     */
    onVisualChange() {
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
    markVisualEdit() {
        this.state.lastEditSource = 'visual';
    }
    /**
     * Mark next changes as from text editor
     */
    markTextEdit() {
        this.state.lastEditSource = 'text';
    }
    /**
     * Get current text
     */
    getCurrentText() {
        return this.currentText;
    }
    /**
     * Get current diagram
     */
    getDiagram() {
        return this.diagram;
    }
    /**
     * Get sync state
     */
    getState() {
        return Object.assign({}, this.state);
    }
    /**
     * Add sync callback
     */
    onSync(callback) {
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
    notifyCallbacks(direction, success) {
        for (const callback of this.callbacks) {
            try {
                callback(direction, success);
            }
            catch (error) {
                console.error('[BidirectionalSync] Callback error:', error);
            }
        }
    }
    /**
     * Pause sync
     */
    pause() {
        this.state.active = false;
        if (this.options.debug) {
            console.log('[BidirectionalSync] Paused');
        }
    }
    /**
     * Resume sync
     */
    resume() {
        this.state.active = true;
        if (this.options.debug) {
            console.log('[BidirectionalSync] Resumed');
        }
    }
    /**
     * Force sync in specific direction
     */
    forceSync(direction) {
        if (direction === 'text-to-visual') {
            this.syncTextToVisual(this.currentText);
        }
        else {
            this.syncVisualToText();
        }
    }
    /**
     * Dispose and cleanup
     */
    dispose() {
        // Clear timers
        if (this.textDebounceTimer) {
            clearTimeout(this.textDebounceTimer);
        }
        if (this.visualDebounceTimer) {
            clearTimeout(this.visualDebounceTimer);
        }
        // Call all unsubscribe functions to remove listeners
        this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
        this.unsubscribeFunctions = [];
        this.state.active = false;
        this.callbacks = [];
        if (this.options.debug) {
            console.log('[BidirectionalSync] Disposed');
        }
    }
}
//# sourceMappingURL=BidirectionalSync.js.map