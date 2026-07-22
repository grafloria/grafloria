import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Slider editor component for range input.
 *
 * Features:
 * - Range slider with thumb
 * - Min/max from validation
 * - Step from validation
 * - Current value display
 * - Marks/ticks at intervals (optional)
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-slider
 *   [value]="50"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-slider>
 * ```
 */
@Component({
    selector: 'property-editor-slider',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-slider">
      <div class="slider-header">
        <span class="slider-label">{{ getLabel() }}</span>
        <span class="slider-value">{{ currentValue }}</span>
      </div>

      <div class="slider-wrapper">
        <span class="slider-min" *ngIf="showLabels()">{{ getMin() }}</span>

        <input
          type="range"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [disabled]="readonly"
          [min]="getMin()"
          [max]="getMax()"
          [step]="getStep()"
          class="form-slider"
        />

        <span class="slider-max" *ngIf="showLabels()">{{ getMax() }}</span>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-slider {
        width: 100%;
      }

      .slider-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .slider-label {
        font-size: 14px;
        color: var(--text-primary, #333);
      }

      .slider-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--primary-color, #007bff);
      }

      .slider-wrapper {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .slider-min,
      .slider-max {
        font-size: 12px;
        color: var(--text-secondary, #666);
        min-width: 32px;
        text-align: center;
      }

      .form-slider {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: var(--slider-track-bg, #ddd);
        border-radius: 3px;
        outline: none;
      }

      .form-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        background: var(--primary-color, #007bff);
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s;
      }

      .form-slider::-webkit-slider-thumb:hover {
        transform: scale(1.1);
        box-shadow: 0 0 0 4px rgba(0, 123, 255, 0.1);
      }

      .form-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        background: var(--primary-color, #007bff);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s;
      }

      .form-slider::-moz-range-thumb:hover {
        transform: scale(1.1);
        box-shadow: 0 0 0 4px rgba(0, 123, 255, 0.1);
      }

      .form-slider:focus {
        outline: none;
      }

      .form-slider:focus::-webkit-slider-thumb {
        box-shadow: 0 0 0 4px rgba(0, 123, 255, 0.2);
      }

      .form-slider:focus::-moz-range-thumb {
        box-shadow: 0 0 0 4px rgba(0, 123, 255, 0.2);
      }

      .form-slider:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .form-slider:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
      }

      .form-slider:disabled::-moz-range-thumb {
        cursor: not-allowed;
      }
    `,
    ]
})
export class PropertyEditorSliderComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: number = 0;

  ngOnInit(): void {
    this.currentValue = typeof this.value === 'number' ? this.value : this.getMin();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = typeof this.value === 'number' ? this.value : this.getMin();
    }
  }

  getMin(): number {
    return this.property.validation?.min !== undefined ? this.property.validation.min : 0;
  }

  getMax(): number {
    return this.property.validation?.max !== undefined ? this.property.validation.max : 100;
  }

  getStep(): number {
    return this.property.validation?.step !== undefined ? this.property.validation.step : 1;
  }

  getLabel(): string {
    return this.property.label || '';
  }

  showLabels(): boolean {
    return this.property.display?.showLabels !== false;
  }

  onValueChange(newValue: number): void {
    this.valueChange.emit(newValue);
  }
}
