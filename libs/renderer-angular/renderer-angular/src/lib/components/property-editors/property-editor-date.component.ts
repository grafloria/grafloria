import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Date editor component for date selection.
 *
 * Features:
 * - Native date input with calendar popup
 * - Min/max date validation
 * - Today button
 * - Clear button
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-date
 *   [value]="'2024-01-15'"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-date>
 * ```
 */
@Component({
  selector: 'property-editor-date',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="property-editor property-editor-date">
      <div class="date-input-wrapper">
        <input
          type="date"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [readonly]="readonly"
          [min]="getMinDate()"
          [max]="getMaxDate()"
          class="form-date-input"
        />

        <div class="date-actions" *ngIf="!readonly">
          <button
            type="button"
            class="btn-date-action"
            (click)="setToday()"
            title="Today"
            aria-label="Set to today"
          >
            Today
          </button>
          <button
            type="button"
            class="btn-date-action"
            (click)="clear()"
            title="Clear"
            aria-label="Clear date"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .property-editor-date {
        width: 100%;
      }

      .date-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .form-date-input {
        flex: 1;
        padding: 8px 12px;
        font-size: 14px;
        font-family: inherit;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        outline: none;
      }

      .form-date-input:focus {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
      }

      .form-date-input:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
      }

      .date-actions {
        display: flex;
        gap: 4px;
      }

      .btn-date-action {
        padding: 6px 12px;
        font-size: 12px;
        border: 1px solid var(--input-border, #ccc);
        background: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .btn-date-action:hover {
        background-color: var(--button-hover-bg, #f5f5f5);
      }

      .btn-date-action:active {
        background-color: var(--button-active-bg, #e5e5e5);
      }
    `,
  ],
})
export class PropertyEditorDateComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();

  currentValue: string = '';

  ngOnInit(): void {
    this.currentValue = this.value || '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.value || '';
    }
  }

  getMinDate(): string | undefined {
    if (this.property.validation?.min) {
      return this.formatDate(this.property.validation.min as any);
    }
    return undefined;
  }

  getMaxDate(): string | undefined {
    if (this.property.validation?.max) {
      return this.formatDate(this.property.validation.max as any);
    }
    return undefined;
  }

  private formatDate(date: string | Date): string {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    return date;
  }

  setToday(): void {
    if (this.readonly) return;
    const today = new Date().toISOString().split('T')[0];
    this.currentValue = today;
    this.valueChange.emit(today);
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
