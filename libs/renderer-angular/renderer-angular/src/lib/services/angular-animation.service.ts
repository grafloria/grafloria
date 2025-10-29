/**
 * Angular Animation Service
 *
 * Phase 1.1: Angular wrapper for AnimationService
 * Provides Angular dependency injection support while wrapping the
 * framework-agnostic core AnimationService
 *
 * @example
 * ```typescript
 * // In your component
 * constructor(private animationService: AngularAnimationService) {
 *   // Get animation classes
 *   const linkClass = this.animationService.getEdgeAnimationClass(link);
 *
 *   // Apply presets
 *   this.animationService.applyWorkflowPreset(node, AnimationPresets.WORKFLOW.RUNNING);
 * }
 * ```
 */

import { Injectable, OnDestroy } from '@angular/core';
import {
  AnimationService,
  type AnimationConfig,
  AnimationPresets,
  applyNodePreset,
  applyWorkflowPreset,
  getLinkAnimationFromPreset,
} from '@grafloria/renderer';
import type { LinkModel, NodeModel } from '@grafloria/engine';

/**
 * Angular-injectable Animation Service
 *
 * This service wraps the framework-agnostic AnimationService and provides:
 * - Angular dependency injection
 * - Automatic cleanup on destroy
 * - Convenient preset application methods
 * - Reactive configuration updates
 */
@Injectable({
  providedIn: 'root'
})
export class AngularAnimationService implements OnDestroy {
  /** Core animation service instance */
  private readonly animationService: AnimationService;

  /** Export presets for easy access */
  public readonly presets = AnimationPresets;

  constructor() {
    // Initialize core service
    this.animationService = new AnimationService();
  }

  /**
   * Enable or disable all animations globally
   */
  setEnabled(enabled: boolean): void {
    this.animationService.setEnabled(enabled);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<AnimationConfig> {
    return this.animationService.getConfig();
  }

  /**
   * Update configuration (partial update)
   */
  updateConfig(config: Partial<AnimationConfig>): void {
    this.animationService.updateConfig(config);
  }

  /**
   * Get animation CSS classes for an edge (link)
   */
  getEdgeAnimationClass(link: LinkModel): string {
    return this.animationService.getEdgeAnimationClass(link);
  }

  /**
   * Get animation CSS classes for a node
   */
  getNodeAnimationClass(node: NodeModel, useSVGVariant: boolean = false): string {
    return this.animationService.getNodeAnimationClass(node, useSVGVariant);
  }

  /**
   * Calculate animation duration with speed multiplier applied
   */
  getAnimationDuration(baseDuration: number): number {
    return this.animationService.getAnimationDuration(baseDuration);
  }

  /**
   * Pause all animations (for debugging or screenshots)
   */
  pauseAllAnimations(): void {
    this.animationService.pauseAllAnimations();
  }

  /**
   * Resume all animations
   */
  resumeAllAnimations(): void {
    this.animationService.resumeAllAnimations();
  }

  /**
   * Add listener for configuration changes
   */
  onConfigChange(listener: (config: AnimationConfig) => void): () => void {
    return this.animationService.onConfigChange(listener);
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.animationService.resetConfig();
  }

  /**
   * Phase 1.1: Inject animation CSS into the document
   */
  injectCSS(): void {
    this.animationService.injectCSS();
  }

  /**
   * Phase 1.1: Remove injected animation CSS from the document
   */
  removeCSS(): void {
    this.animationService.removeCSS();
  }

  /**
   * Phase 1.1: Check if CSS has been injected
   */
  isCSSInjected(): boolean {
    return this.animationService.isCSSInjected();
  }

  /**
   * Phase 1.1: Apply a node preset to a node
   * Convenient wrapper that modifies the node in place
   */
  applyNodePreset(
    node: NodeModel,
    preset: typeof AnimationPresets.NODE[keyof typeof AnimationPresets.NODE]
  ): NodeModel {
    return applyNodePreset(node, preset);
  }

  /**
   * Phase 1.1: Apply a workflow preset to a node
   * Convenient wrapper that modifies the node in place
   */
  applyWorkflowPreset(
    node: NodeModel,
    preset: typeof AnimationPresets.WORKFLOW[keyof typeof AnimationPresets.WORKFLOW] |
            typeof AnimationPresets.ETL[keyof typeof AnimationPresets.ETL] |
            typeof AnimationPresets.MONITORING[keyof typeof AnimationPresets.MONITORING]
  ): NodeModel {
    return applyWorkflowPreset(node, preset as any);
  }

  /**
   * Phase 1.1: Get link animation from a preset
   * Returns the LinkAnimation configuration from a preset
   */
  getLinkAnimationFromPreset(
    preset: typeof AnimationPresets.WORKFLOW[keyof typeof AnimationPresets.WORKFLOW] |
            typeof AnimationPresets.ETL[keyof typeof AnimationPresets.ETL] |
            typeof AnimationPresets.DATA_FLOW[keyof typeof AnimationPresets.DATA_FLOW] |
            typeof AnimationPresets.CONNECTION[keyof typeof AnimationPresets.CONNECTION]
  ): any {
    return getLinkAnimationFromPreset(preset as any);
  }

  /**
   * Phase 1.1: Apply animation to multiple nodes at once
   * Convenient batch operation
   */
  applyPresetToNodes(
    nodes: NodeModel[],
    preset: typeof AnimationPresets.NODE[keyof typeof AnimationPresets.NODE]
  ): void {
    nodes.forEach(node => this.applyNodePreset(node, preset));
  }

  /**
   * Phase 1.1: Apply workflow preset to multiple nodes at once
   * Convenient batch operation
   */
  applyWorkflowPresetToNodes(
    nodes: NodeModel[],
    preset: typeof AnimationPresets.WORKFLOW[keyof typeof AnimationPresets.WORKFLOW] |
            typeof AnimationPresets.ETL[keyof typeof AnimationPresets.ETL] |
            typeof AnimationPresets.MONITORING[keyof typeof AnimationPresets.MONITORING]
  ): void {
    nodes.forEach(node => this.applyWorkflowPreset(node, preset));
  }

  /**
   * Phase 1.1: Apply link animation preset to multiple links at once
   * Convenient batch operation
   */
  applyLinkPresetToLinks(
    links: LinkModel[],
    preset: typeof AnimationPresets.DATA_FLOW[keyof typeof AnimationPresets.DATA_FLOW] |
            typeof AnimationPresets.CONNECTION[keyof typeof AnimationPresets.CONNECTION]
  ): void {
    const animation = getLinkAnimationFromPreset(preset as any);
    links.forEach(link => {
      if (!link.style) {
        link.style = {};
      }
      link.style.animation = animation;
    });
  }

  /**
   * Angular lifecycle: Clean up on destroy
   */
  ngOnDestroy(): void {
    this.animationService.destroy();
  }
}
