import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Number editor component for numeric input with stepper controls.
 *
 * Features:
 * - Number input field
 * - Increment/decrement stepper buttons
 * - Min/max validation
 * - Integer vs decimal support
 * - Step control
 * - Prefix/suffix display (e.g., "$", "px", "%")
 * - Keyboard shortcuts (up/down arrows)
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-number
 *   [value]="25"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)"
 *   (validationError)="onValidationError($event)">
 * </property-editor-number>
 * ```
 */
@Component({
    selector: 'property-editor-number',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-number">
      <div class="input-wrapper">
        <span class="input-prefix" *ngIf="property.validation?.prefix">
          {{ property.validation!.prefix }}
        </span>

        <input
          type="number"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [readonly]="readonly"
          [attr.min]="property.validation?.min"
          [attr.max]="property.validation?.max"
          [step]="getStep()"
          class="form-input"
        />

        <span class="input-suffix" *ngIf="property.validation?.suffix">
          {{ property.validation!.suffix }}
        </span>

        <div class="stepper-buttons" *ngIf="!readonly">
          <button
            type="button"
            class="stepper-btn"
            (click)="increment()"
            [disabled]="isMaxReached()"
            aria-label="Increment"
          >
            ▲
          </button>
          <button
            type="button"
            class="stepper-btn"
            (click)="decrement()"
            [disabled]="isMinReached()"
            aria-label="Decrement"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-number {
        width: 100%;
      }

      .input-wrapper {
        display: flex;
        align-items: center;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        overflow: hidden;
        background: white;
      }

      .input-wrapper:focus-within {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
        outline: none;
      }

      .form-input {
        flex: 1;
        border: none;
        padding: 8px 12px;
        font-size: 14px;
        outline: none;
        font-family: inherit;
        line-height: 1.5;
      }

      .form-input:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
      }

      /* Hide default number input spinners */
      .form-input::-webkit-inner-spin-button,
      .form-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      .form-input[type='number'] {
        -moz-appearance: textfield;
      }

      .input-prefix,
      .input-suffix {
        padding: 0 8px;
        color: var(--text-secondary, #666);
        font-size: 14px;
        background: var(--input-affix-bg, #f5f5f5);
        height: 100%;
        display: flex;
        align-items: center;
      }

      .stepper-buttons {
        display: flex;
        flex-direction: column;
        border-left: 1px solid var(--input-border, #ccc);
      }

      .stepper-btn {
        background: var(--button-bg, #f5f5f5);
        border: none;
        padding: 0;
        width: 24px;
        height: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: var(--text-primary, #333);
        transition: background-color 0.2s;
      }

      .stepper-btn:hover:not(:disabled) {
        background: var(--button-hover-bg, #e5e5e5);
      }

      .stepper-btn:active:not(:disabled) {
        background: var(--button-active-bg, #d5d5d5);
      }

      .stepper-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .stepper-btn:first-child {
        border-bottom: 1px solid var(--input-border, #ccc);
      }
    `,
    ]
})
export class PropertyEditorNumberComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: number = 0;

  ngOnInit(): void {
    this.currentValue = typeof this.value === 'number' ? this.value : 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = typeof this.value === 'number' ? this.value : 0;
    }
  }

  getStep(): number {
    if (this.property.validation?.step !== undefined) {
      return this.property.validation.step;
    }
    return this.property.validation?.integer ? 1 : 0.1;
  }

  increment(): void {
    const step = this.getStep();
    const newValue = this.currentValue + step;

    if (
      this.property.validation?.max !== undefined &&
      newValue > this.property.validation.max
    ) {
      return;
    }

    this.currentValue = newValue;
    this.valueChange.emit(newValue);
  }

  decrement(): void {
    const step = this.getStep();
    const newValue = this.currentValue - step;

    if (
      this.property.validation?.min !== undefined &&
      newValue < this.property.validation.min
    ) {
      return;
    }

    this.currentValue = newValue;
    this.valueChange.emit(newValue);
  }

  isMaxReached(): boolean {
    return (
      this.property.validation?.max !== undefined &&
      this.currentValue >= this.property.validation.max
    );
  }

  isMinReached(): boolean {
    return (
      this.property.validation?.min !== undefined &&
      this.currentValue <= this.property.validation.min
    );
  }

  onValueChange(newValue: number): void {
    this.valueChange.emit(newValue);
  }
}
