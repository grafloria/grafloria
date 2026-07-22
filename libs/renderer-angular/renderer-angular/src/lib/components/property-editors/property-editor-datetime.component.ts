import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Datetime editor component for date and time selection.
 *
 * Features:
 * - Native datetime-local input
 * - Min/max datetime validation
 * - Now button
 * - Clear button
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-datetime
 *   [value]="'2024-01-15T14:30'"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-datetime>
 * ```
 */
@Component({
    selector: 'property-editor-datetime',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-datetime">
      <div class="datetime-input-wrapper">
        <input
          type="datetime-local"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [readonly]="readonly"
          [min]="getMinDatetime()"
          [max]="getMaxDatetime()"
          class="form-datetime-input"
        />

        <div class="datetime-actions" *ngIf="!readonly">
          <button
            type="button"
            class="btn-datetime-action"
            (click)="setNow()"
            title="Now"
            aria-label="Set to now"
          >
            Now
          </button>
          <button
            type="button"
            class="btn-datetime-action"
            (click)="clear()"
            title="Clear"
            aria-label="Clear datetime"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-datetime {
        width: 100%;
      }

      .datetime-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .form-datetime-input {
        flex: 1;
        padding: 8px 12px;
        font-size: 14px;
        font-family: inherit;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        outline: none;
      }

      .form-datetime-input:focus {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
      }

      .form-datetime-input:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
      }

      .datetime-actions {
        display: flex;
        gap: 4px;
      }

      .btn-datetime-action {
        padding: 6px 12px;
        font-size: 12px;
        border: 1px solid var(--input-border, #ccc);
        background: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .btn-datetime-action:hover {
        background-color: var(--button-hover-bg, #f5f5f5);
      }

      .btn-datetime-action:active {
        background-color: var(--button-active-bg, #e5e5e5);
      }
    `,
    ]
})
export class PropertyEditorDatetimeComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: string = '';

  ngOnInit(): void {
    this.currentValue = this.value || '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.value || '';
    }
  }

  getMinDatetime(): string | undefined {
    if (this.property.validation?.min) {
      return this.formatDatetime(this.property.validation.min as any);
    }
    return undefined;
  }

  getMaxDatetime(): string | undefined {
    if (this.property.validation?.max) {
      return this.formatDatetime(this.property.validation.max as any);
    }
    return undefined;
  }

  private formatDatetime(datetime: string | Date): string {
    if (datetime instanceof Date) {
      return datetime.toISOString().slice(0, 16);
    }
    return datetime;
  }

  setNow(): void {
    if (this.readonly) return;
    const now = new Date().toISOString().slice(0, 16);
    this.currentValue = now;
    this.valueChange.emit(now);
  }

  clear(): void {
    if (this.readonly) return;
    this.currentValue = '';
    this.valueChange.emit('');
  }

  onValueChange(newValue: string): void {
    this.valueChange.emit(newValue);
  }
}
