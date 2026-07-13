import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  DiagramRendererService,
  type RendererRecommendation,
  type RecommendationCriteria,
} from '../../services/diagram-renderer.service';

/**
 * RendererSwitcherComponent
 *
 * UI component for switching between diagram renderers.
 * Provides a dropdown interface with optional recommendations.
 *
 * Features:
 * - Dropdown for manual renderer selection
 * - Optional recommendation display
 * - Automatic sync with DiagramRendererService
 * - Customizable styling
 * - Reactive updates
 *
 * @example
 * ```html
 * <grafloria-renderer-switcher
 *   [container]="diagramContainer"
 *   [showRecommendation]="true"
 *   [recommendationCriteria]="{ nodeCount: 500 }"
 *   [label]="'Select Renderer'"
 *   (rendererChanged)="onRendererChanged($event)">
 * </grafloria-renderer-switcher>
 * ```
 */
@Component({
    selector: 'grafloria-renderer-switcher',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="renderer-switcher" [ngClass]="customClass">
      <div class="switcher-controls">
        <label *ngIf="label" class="switcher-label">{{ label }}</label>
        <select
          class="renderer-select"
          [(ngModel)]="selectedRenderer"
          (change)="onRendererChange()"
          [disabled]="disabled">
          <option *ngFor="let renderer of availableRenderers" [value]="renderer">
            {{ renderer.toUpperCase() }}
          </option>
        </select>
      </div>

      <div *ngIf="showRecommendation && recommendation" class="recommendation">
        <div class="recommendation-header">
          <span class="recommendation-icon">💡</span>
          <span class="recommendation-title">Recommended: {{ recommendation.recommendedRenderer.toUpperCase() }}</span>
        </div>
        <div class="recommendation-details">
          <p class="recommendation-reason">{{ recommendation.reason }}</p>
          <div class="recommendation-confidence">
            Confidence: {{ (recommendation.confidence * 100).toFixed(0) }}%
          </div>
          <button
            *ngIf="selectedRenderer !== recommendation.recommendedRenderer"
            class="apply-recommendation-btn"
            (click)="applyRecommendation()"
            [disabled]="disabled">
            Apply Recommendation
          </button>
        </div>
      </div>
    </div>
  `,
    styles: [
        `
      .renderer-switcher {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
      }

      .switcher-controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .switcher-label {
        font-weight: 600;
        color: #495057;
        font-size: 14px;
      }

      .renderer-select {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
        background: white;
        cursor: pointer;
        transition: border-color 0.2s;
      }

      .renderer-select:hover:not(:disabled) {
        border-color: #80bdff;
      }

      .renderer-select:focus {
        outline: none;
        border-color: #007bff;
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
      }

      .renderer-select:disabled {
        background: #e9ecef;
        cursor: not-allowed;
        opacity: 0.6;
      }

      .recommendation {
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        padding: 12px;
      }

      .recommendation-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .recommendation-icon {
        font-size: 18px;
      }

      .recommendation-title {
        font-weight: 600;
        color: #856404;
        font-size: 14px;
      }

      .recommendation-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .recommendation-reason {
        margin: 0;
        color: #856404;
        font-size: 13px;
      }

      .recommendation-confidence {
        font-size: 12px;
        color: #856404;
        opacity: 0.8;
      }

      .apply-recommendation-btn {
        padding: 6px 12px;
        background: #ffc107;
        color: #000;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
        align-self: flex-start;
      }

      .apply-recommendation-btn:hover:not(:disabled) {
        background: #ffca2c;
      }

      .apply-recommendation-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
    ]
})
export class RendererSwitcherComponent implements OnInit, OnChanges, OnDestroy {
  /**
   * DOM container for renderers.
   * Required for renderer initialization.
   */
  @Input() container!: HTMLElement;

  /**
   * Display label for the dropdown.
   */
  @Input() label = '';

  /**
   * Custom CSS class for styling.
   */
  @Input() customClass = '';

  /**
   * Whether to show renderer recommendation.
   */
  @Input() showRecommendation = false;

  /**
   * Criteria for renderer recommendation.
   */
  @Input() recommendationCriteria: RecommendationCriteria = {};

  /**
   * Disable the switcher.
   */
  @Input() disabled = false;

  /**
   * Emitted when renderer changes.
   */
  @Output() rendererChanged = new EventEmitter<string>();

  /**
   * Currently selected renderer.
   */
  selectedRenderer = '';

  /**
   * List of available renderers.
   */
  availableRenderers: string[] = [];

  /**
   * Current recommendation (if enabled).
   */
  recommendation: RendererRecommendation | null = null;

  private destroy$ = new Subject<void>();

  constructor(private rendererService: DiagramRendererService) {}

  ngOnInit(): void {
    // Load available renderers
    this.availableRenderers = this.rendererService.getRegisteredRenderers();

    // Set initial selection
    const activeRenderer = this.rendererService.getActiveRenderer();
    if (activeRenderer) {
      this.selectedRenderer = activeRenderer.type;
    } else if (this.availableRenderers.length > 0) {
      this.selectedRenderer = this.availableRenderers[0];
    }

    // Subscribe to external renderer changes
    this.rendererService.rendererChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event) {
          this.selectedRenderer = event.newType;
        }
      });

    // Update recommendation
    if (this.showRecommendation) {
      this.updateRecommendation();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Keep the recommendation reactive to criteria/toggle changes after init.
    if (
      (changes['recommendationCriteria'] || changes['showRecommendation']) &&
      this.showRecommendation
    ) {
      this.updateRecommendation();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handle renderer selection change.
   */
  async onRendererChange(): Promise<void> {
    if (!this.container) {
      console.error('Container not provided to RendererSwitcherComponent');
      return;
    }

    try {
      await this.rendererService.switchRenderer(this.selectedRenderer, this.container);
      this.rendererChanged.emit(this.selectedRenderer);

      // Update recommendation after switch
      if (this.showRecommendation) {
        this.updateRecommendation();
      }
    } catch (error) {
      console.error('Failed to switch renderer:', error);
    }
  }

  /**
   * Get current recommendation from service.
   */
  getCurrentRecommendation(): RendererRecommendation | null {
    return this.rendererService.getRecommendation(this.recommendationCriteria);
  }

  /**
   * Update recommendation based on criteria.
   */
  private updateRecommendation(): void {
    this.recommendation = this.getCurrentRecommendation();
  }

  /**
   * Apply the recommended renderer.
   */
  async applyRecommendation(): Promise<void> {
    if (!this.recommendation) {
      return;
    }

    this.selectedRenderer = this.recommendation.recommendedRenderer;
    await this.onRendererChange();
  }
}
