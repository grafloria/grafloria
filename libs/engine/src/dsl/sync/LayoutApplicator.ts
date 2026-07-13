/**
 * Layout Applicator - Applies layout presets to diagrams
 *
 * Integrates LayoutDetector with LayoutManager to automatically
 * apply optimal layouts to diagrams after parsing or modification.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { LayoutDetector, LayoutSuggestion } from '../detector/LayoutDetector';
import { DiagramNode } from '../types/ASTNode';
import { LayoutPresets, LayoutPreset } from '../../layout/layout-presets';
import type { LayoutConfiguration } from '../../layout/types';
import {
  LayoutRegistry,
  createDefaultLayoutRegistry,
  runLayout,
  type UnifiedLayoutOptions,
} from '../../layout/layout-registry';

export interface LayoutApplicationResult {
  /**
   * Was layout applied successfully
   */
  success: boolean;

  /**
   * Layout preset that was applied
   */
  presetId?: string;

  /**
   * Confidence of the layout selection
   */
  confidence?: number;

  /**
   * Reasoning for layout choice
   */
  reasoning?: string;

  /**
   * Time taken to apply layout (ms)
   */
  applyTime?: number;

  /**
   * Error if layout failed
   */
  error?: string;
}

export interface LayoutApplicatorOptions {
  /**
   * Minimum confidence threshold to auto-apply (0-1)
   */
  minConfidence?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom layout configurations
   */
  customLayouts?: Map<string, LayoutConfiguration>;
}

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
function presetOptions(preset: LayoutPreset): UnifiedLayoutOptions {
  return {
    ...(preset.options as UnifiedLayoutOptions),
    ...(preset.constraints ? { constraints: preset.constraints } : {}),
  };
}

export class LayoutApplicator {
  private detector: LayoutDetector;
  private options: Required<LayoutApplicatorOptions>;
  private registry?: LayoutRegistry;

  constructor(options: LayoutApplicatorOptions = {}) {
    this.detector = new LayoutDetector();
    this.options = {
      minConfidence: options.minConfidence ?? 0.7,
      debug: options.debug ?? false,
      customLayouts: options.customLayouts ?? new Map(),
    };
  }

  /**
   * Detect and apply optimal layout
   */
  async applyOptimalLayout(
    diagram: DiagramModel,
    ast?: DiagramNode
  ): Promise<LayoutApplicationResult> {
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
          console.log(
            `[LayoutApplicator] Confidence too low (${suggestion.confidence.toFixed(2)} < ${this.options.minConfidence}), skipping`
          );
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
      await this.applyLayoutPreset(diagram, suggestion.presetId);

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[LayoutApplicator] Layout application failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        applyTime: performance.now() - startTime,
      };
    }
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
  async applyLayoutPreset(diagram: DiagramModel, presetId: string): Promise<void> {
    // Custom layouts stay on the LayoutManager path: a LayoutConfiguration IS a
    // LayoutManager config ('grid'/'hierarchical'/…), and that path works.
    if (this.options.customLayouts.has(presetId)) {
      const config = this.options.customLayouts.get(presetId)!;
      await diagram.reLayout(config);
      return;
    }

    const preset = this.findPresetById(presetId);

    if (!preset) {
      throw new Error(`Layout preset not found: ${presetId}`);
    }

    await runLayout(this.getLayoutRegistry(), diagram, preset.adapter, presetOptions(preset));
  }

  /**
   * The registry presets are applied through. Injectable, so a host that has
   * replaced a built-in layout (or registered its own) gets its version here too
   * rather than a second, private copy of the built-ins.
   */
  getLayoutRegistry(): LayoutRegistry {
    if (!this.registry) {
      this.registry = createDefaultLayoutRegistry();
    }
    return this.registry;
  }

  setLayoutRegistry(registry: LayoutRegistry): void {
    this.registry = registry;
  }

  /**
   * Apply layout with custom configuration
   */
  async applyCustomLayout(
    diagram: DiagramModel,
    config: LayoutConfiguration
  ): Promise<LayoutApplicationResult> {
    const startTime = performance.now();

    try {
      if (this.options.debug) {
        console.log(`[LayoutApplicator] Applying custom layout: ${config.type || 'default'}`);
      }

      await diagram.reLayout(config);

      const applyTime = performance.now() - startTime;

      if (this.options.debug) {
        console.log(`[LayoutApplicator] Custom layout applied in ${applyTime.toFixed(2)}ms`);
      }

      return {
        success: true,
        applyTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[LayoutApplicator] Custom layout failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        applyTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Get layout suggestion without applying
   */
  suggestLayout(diagram: DiagramModel, ast?: DiagramNode): LayoutSuggestion {
    return this.detector.detect(diagram, ast);
  }

  /**
   * Find preset by ID in all categories
   */
  private findPresetById(presetId: string): LayoutPreset | null {
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
  listPresets(): Array<{ id: string; name: string; category: string }> {
    const presets: Array<{ id: string; name: string; category: string }> = [];

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
  setMinConfidence(threshold: number): void {
    this.options.minConfidence = Math.max(0, Math.min(1, threshold));

    if (this.options.debug) {
      console.log(`[LayoutApplicator] Min confidence set to ${this.options.minConfidence.toFixed(2)}`);
    }
  }

  /**
   * Add custom layout preset
   */
  addCustomLayout(id: string, config: LayoutConfiguration): void {
    this.options.customLayouts.set(id, config);

    if (this.options.debug) {
      console.log(`[LayoutApplicator] Added custom layout: ${id}`);
    }
  }

  /**
   * Remove custom layout preset
   */
  removeCustomLayout(id: string): boolean {
    const removed = this.options.customLayouts.delete(id);

    if (this.options.debug && removed) {
      console.log(`[LayoutApplicator] Removed custom layout: ${id}`);
    }

    return removed;
  }
}
