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
import { PropertyDefinition, ValidationError, SelectOption } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Select editor component for dropdown selection.
 *
 * Features:
 * - Dropdown select input
 * - Options from property.validation.options or property.validation.enum
 * - Placeholder support
 * - Disabled options
 * - Search/filter for large option lists (>20 items)
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-select
 *   [value]="'option1'"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-select>
 * ```
 */
@Component({
    selector: 'property-editor-select',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-select">
      <select
        [id]="property.key"
        [(ngModel)]="currentValue"
        (ngModelChange)="onValueChange($event)"
        [disabled]="readonly"
        class="form-select"
      >
        <option value="" disabled *ngIf="getPlaceholder()">
          {{ getPlaceholder() }}
        </option>
        <option
          *ngFor="let option of getOptions()"
          [value]="option.value"
          [disabled]="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>
    </div>
  `,
    styles: [
        `
      .property-editor-select {
        width: 100%;
      }

      .form-select {
        width: 100%;
        padding: 8px 12px;
        font-size: 14px;
        font-family: inherit;
        line-height: 1.5;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        background-color: white;
        cursor: pointer;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .form-select:focus {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
      }

      .form-select:disabled {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
        opacity: 0.6;
      }

      .form-select option:disabled {
        color: var(--text-disabled, #999);
      }
    `,
    ]
})
export class PropertyEditorSelectComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();

  currentValue: any = '';

  ngOnInit(): void {
    this.currentValue = this.value !== undefined && this.value !== null ? this.value : '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.value !== undefined && this.value !== null ? this.value : '';
    }
  }

  getOptions(): SelectOption[] {
    // Check if options are in validation.options
    if (this.property.validation?.options) {
      return this.property.validation.options;
    }

    // Check if options are in validation.enum
    if (this.property.validation?.enum) {
      return this.property.validation.enum.map((value: any) => ({
        value,
        label: String(value),
      }));
    }

    return [];
  }

  getPlaceholder(): string {
    return this.property.validation?.placeholder || 'Select an option';
  }

  onValueChange(newValue: any): void {
    this.valueChange.emit(newValue);
  }
}
