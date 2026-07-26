/**
 * Layout Applicator - Applies layout presets to diagrams
 *
 * Integrates LayoutDetector with LayoutManager to automatically
 * apply optimal layouts to diagrams after parsing or modification.
 */
import { __awaiter } from "tslib";
import { LayoutDetector } from '../detector/LayoutDetector';
import { LayoutPresets } from '../../layout/layout-presets';
import { createDefaultLayoutRegistry, runLayout, } from '../../layout/layout-registry';
/**
 * A preset's options, in the shape the Card-0 registry wants.
 *
 * The presets are written in each adapter's own dialect (`rankdir`/`nodesep` for
 * dagre, `elk.direction` for ELK) and `translateOptions()` passes unknown keys
 * straight through to the adapter, so the dialect keys land exactly where they
 * are read. `constraints` rides along in the shared LayoutOptions slot, which is
 * the only reason the presets' pinning config ever reaches an adapter.
 *
 * (`preset.incrementalOptions` is NOT applied here. It configures
 * `adapter.applyIncremental()` — a different entry point, for adding nodes to an
 * existing layout — and pretending to honour it from a full-layout call would be
 * the same lie this method was telling before. Card 6 owns incremental layout.)
 */
function presetOptions(preset) {
    return Object.assign(Object.assign({}, preset.options), (preset.constraints ? { constraints: preset.constraints } : {}));
}
export class LayoutApplicator {
    constructor(options = {}) {
        var _a, _b, _c;
        this.detector = new LayoutDetector();
        this.options = {
            minConfidence: (_a = options.minConfidence) !== null && _a !== void 0 ? _a : 0.7,
            debug: (_b = options.debug) !== null && _b !== void 0 ? _b : false,
            customLayouts: (_c = options.customLayouts) !== null && _c !== void 0 ? _c : new Map(),
        };
    }
    /**
     * Detect and apply optimal layout
     */
    applyOptimalLayout(diagram, ast) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = performance.now();
            try {
                // Detect optimal layout
                const suggestion = this.detector.detect(diagram, ast);
                if (this.options.debug) {
                    console.log(`[LayoutApplicator] Detected layout: ${suggestion.presetId}`);
                    console.log(`[LayoutApplicator] Confidence: ${suggestion.confidence.toFixed(2)}`);
                    console.log(`[LayoutApplicator] Reasoning: ${suggestion.reasoning}`);
                }
                // Check confidence threshold
                if (suggestion.confidence < this.options.minConfidence) {
                    if (this.options.debug) {
                        console.log(`[LayoutApplicator] Confidence too low (${suggestion.confidence.toFixed(2)} < ${this.options.minConfidence}), skipping`);
                    }
                    return {
                        success: false,
                        presetId: suggestion.presetId,
                        confidence: suggestion.confidence,
                        reasoning: suggestion.reasoning,
                        error: 'Confidence below threshold',
                    };
                }
                // Apply layout
                yield this.applyLayoutPreset(diagram, suggestion.presetId);
                const applyTime = performance.now() - startTime;
                if (this.options.debug) {
                    console.log(`[LayoutApplicator] Layout applied in ${applyTime.toFixed(2)}ms`);
                }
                return {
                    success: true,
                    presetId: suggestion.presetId,
                    confidence: suggestion.confidence,
                    reasoning: suggestion.reasoning,
                    applyTime,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('[LayoutApplicator] Layout application failed:', errorMessage);
                return {
                    success: false,
                    error: errorMessage,
                    applyTime: performance.now() - startTime,
                };
            }
        });
    }
    /**
     * Apply a specific layout preset.
     *
     * ---------------------------------------------------------------------------
     * WAVE 7 CARD 2 — THIS METHOD DID NOTHING. THE ENTIRE PRESET LIBRARY WAS DEAD.
     * ---------------------------------------------------------------------------
     *
     * It used to build:
     *
     *     const config: LayoutConfiguration = {
     *       algorithm: preset.adapter === 'dagre' ? 'dagre' : 'elk',
     *       ...preset.options,           // rankdir, nodesep, 'elk.direction', …
     *     };
     *     await diagram.reLayout(config);
     *
     * and every part of that was inert:
     *
     *   • `LayoutConfiguration` has no `algorithm` field at all. It has `type`, and
     *     the only legal values are 'grid' | 'force-directed' | 'hierarchical' |
     *     'hybrid' — 'dagre' and 'elk' are not among them.
     *   • `reLayout()` then OVERWRITES `type` with `this.currentAlgorithm.getType()`,
     *     the LayoutManager's single-node placement strategy. So the preset's chosen
     *     adapter was discarded before it was even mistyped.
     *   • `reLayout()` reads adapter options from `config.options` (nested). The
     *     preset's options were spread at the TOP level, so `rankdir`, `nodesep`,
     *     `ranker`, `elk.direction` — every knob the 17 presets exist to set — were
     *     never read by anything.
     *
     * Net effect: "Org Chart (Compact)", "Workflow (Horizontal)" and
     * "Force-Directed (Tight)" all produced the SAME picture, whatever the
     * LayoutManager's current placement algorithm happened to be. The presets, the
     * detector that chooses between them, and the confidence threshold that gates
     * the choice were an elaborate no-op. This is the "config declared but never
     * consumed" shape, and it survived six waves because nothing tested it.
     *
     * The fix routes presets through the Card-0 registry — the same path
     * `engine.layout()` takes — so a preset now genuinely selects its adapter and
     * genuinely passes its options.
     */
    applyLayoutPreset(diagram, presetId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Custom layouts stay on the LayoutManager path: a LayoutConfiguration IS a
            // LayoutManager config ('grid'/'hierarchical'/…), and that path works.
            if (this.options.customLayouts.has(presetId)) {
                const config = this.options.customLayouts.get(presetId);
                yield diagram.reLayout(config);
                return;
            }
            const preset = this.findPresetById(presetId);
            if (!preset) {
                throw new Error(`Layout preset not found: ${presetId}`);
            }
            yield runLayout(this.getLayoutRegistry(), diagram, preset.adapter, presetOptions(preset));
        });
    }
    /**
     * The registry presets are applied through. Injectable, so a host that has
     * replaced a built-in layout (or registered its own) gets its version here too
     * rather than a second, private copy of the built-ins.
     */
    getLayoutRegistry() {
        if (!this.registry) {
            this.registry = createDefaultLayoutRegistry();
        }
        return this.registry;
    }
    setLayoutRegistry(registry) {
        this.registry = registry;
    }
    /**
     * Apply layout with custom configuration
     */
    applyCustomLayout(diagram, config) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = performance.now();
            try {
                if (this.options.debug) {
                    console.log(`[LayoutApplicator] Applying custom layout: ${config.type || 'default'}`);
                }
                yield diagram.reLayout(config);
                const applyTime = performance.now() - startTime;
                if (this.options.debug) {
                    console.log(`[LayoutApplicator] Custom layout applied in ${applyTime.toFixed(2)}ms`);
                }
                return {
                    success: true,
                    applyTime,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('[LayoutApplicator] Custom layout failed:', errorMessage);
                return {
                    success: false,
                    error: errorMessage,
                    applyTime: performance.now() - startTime,
                };
            }
        });
    }
    /**
     * Get layout suggestion without applying
     */
    suggestLayout(diagram, ast) {
        return this.detector.detect(diagram, ast);
    }
    /**
     * Find preset by ID in all categories
     */
    findPresetById(presetId) {
        const categories = [
            LayoutPresets.HIERARCHICAL,
            LayoutPresets.FLOW,
            LayoutPresets.NETWORK,
            LayoutPresets.ARCHITECTURE,
            LayoutPresets.INTERACTIVE,
        ];
        for (const category of categories) {
            const preset = category.presets.find((p) => p.id === presetId);
            if (preset) {
                return preset;
            }
        }
        return null;
    }
    /**
     * List all available presets
     */
    listPresets() {
        const presets = [];
        const categories = [
            { name: 'Hierarchical', category: LayoutPresets.HIERARCHICAL },
            { name: 'Flow', category: LayoutPresets.FLOW },
            { name: 'Network', category: LayoutPresets.NETWORK },
            { name: 'Architecture', category: LayoutPresets.ARCHITECTURE },
            { name: 'Interactive', category: LayoutPresets.INTERACTIVE },
        ];
        for (const { name, category } of categories) {
            for (const preset of category.presets) {
                presets.push({
                    id: preset.id,
                    name: preset.name,
                    category: name,
                });
            }
        }
        return presets;
    }
    /**
     * Set minimum confidence threshold
     */
    setMinConfidence(threshold) {
        this.options.minConfidence = Math.max(0, Math.min(1, threshold));
        if (this.options.debug) {
            console.log(`[LayoutApplicator] Min confidence set to ${this.options.minConfidence.toFixed(2)}`);
        }
    }
    /**
     * Add custom layout preset
     */
    addCustomLayout(id, config) {
        this.options.customLayouts.set(id, config);
        if (this.options.debug) {
            console.log(`[LayoutApplicator] Added custom layout: ${id}`);
        }
    }
    /**
     * Remove custom layout preset
     */
    removeCustomLayout(id) {
        const removed = this.options.customLayouts.delete(id);
        if (this.options.debug && removed) {
            console.log(`[LayoutApplicator] Removed custom layout: ${id}`);
        }
        return removed;
    }
}
//# sourceMappingURL=LayoutApplicator.js.map