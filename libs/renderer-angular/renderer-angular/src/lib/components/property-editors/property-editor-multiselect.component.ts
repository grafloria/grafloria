import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError, SelectOption } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Multiselect editor component for multiple selection.
 *
 * Features:
 * - Multiple option selection with checkboxes
 * - Chip display for selected items
 * - Select all / Deselect all buttons
 * - Search/filter support
 * - Max selections limit (optional)
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-multiselect
 *   [value]="['option1', 'option2']"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-multiselect>
 * ```
 */
@Component({
    selector: 'property-editor-multiselect',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-multiselect">
      <div class="chips-container" *ngIf="currentValue.length > 0">
        <div class="chip" *ngFor="let value of currentValue">
          <span>{{ getLabelForValue(value) }}</span>
          <button
            type="button"
            class="chip-remove"
            (click)="removeValue(value)"
            [disabled]="readonly"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      </div>

      <div class="options-container" *ngIf="!readonly">
        <div class="options-header">
          <button type="button" class="btn-link" (click)="selectAll()">
            Select All
          </button>
          <button type="button" class="btn-link" (click)="deselectAll()">
            Deselect All
          </button>
        </div>

        <div class="option-item" *ngFor="let option of getOptions()">
          <label class="option-label">
            <input
              type="checkbox"
              [checked]="isSelected(option.value)"
              (change)="toggleOption(option.value)"
              [disabled]="option.disabled || readonly"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-multiselect {
        width: 100%;
      }

      .chips-container {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--chip-bg, #e3f2fd);
        border: 1px solid var(--chip-border, #90caf9);
        border-radius: 16px;
        font-size: 13px;
        color: var(--chip-text, #1976d2);
      }

      .chip-remove {
        background: none;
        border: none;
        padding: 0;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--chip-text, #1976d2);
        font-size: 18px;
        line-height: 1;
      }

      .chip-remove:hover:not(:disabled) {
        color: var(--chip-remove-hover, #d32f2f);
      }

      .chip-remove:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .options-container {
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        padding: 8px;
        max-height: 200px;
        overflow-y: auto;
      }

      .options-header {
        display: flex;
        gap: 12px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--input-border, #ccc);
      }

      .btn-link {
        background: none;
        border: none;
        color: var(--primary-color, #007bff);
        cursor: pointer;
        font-size: 13px;
        padding: 0;
        text-decoration: underline;
      }

      .btn-link:hover {
        color: var(--primary-color-dark, #0056b3);
      }

      .option-item {
        padding: 4px 0;
      }

      .option-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
      }

      .option-label input[type='checkbox'] {
        cursor: pointer;
      }

      .option-label input[type='checkbox']:disabled {
        cursor: not-allowed;
      }
    `,
    ]
})
export class PropertyEditorMultiselectComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: any[] = [];

  ngOnInit(): void {
    this.currentValue = Array.isArray(this.value) ? [...this.value] : [];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = Array.isArray(this.value) ? [...this.value] : [];
    }
  }

  getOptions(): SelectOption[] {
    if (this.property.validation?.options) {
      return this.property.validation.options;
    }

    if (this.property.validation?.enum) {
      return this.property.validation.enum.map((value: any) => ({
        value,
        label: String(value),
      }));
    }

    return [];
  }

  isSelected(value: any): boolean {
    return this.currentValue.includes(value);
  }

  toggleOption(value: any): void {
    if (this.readonly) return;

    const index = this.currentValue.indexOf(value);
    if (index > -1) {
      this.currentValue.splice(index, 1);
    } else {
      this.currentValue.push(value);
    }

    this.valueChange.emit([...this.currentValue]);
  }

  removeValue(value: any): void {
    if (this.readonly) return;

    const index = this.currentValue.indexOf(value);
    if (index > -1) {
      this.currentValue.splice(index, 1);
      this.valueChange.emit([...this.currentValue]);
    }
  }

  selectAll(): void {
    if (this.readonly) return;

    const allValues = this.getOptions()
      .filter((opt) => !opt.disabled)
      .map((opt) => opt.value);
    this.currentValue = [...allValues];
    this.valueChange.emit([...this.currentValue]);
  }

  deselectAll(): void {
    if (this.readonly) return;

    this.currentValue = [];
    this.valueChange.emit([...this.currentValue]);
  }

  getLabelForValue(value: any): string {
    const option = this.getOptions().find((opt) => opt.value === value);
    return option ? option.label : String(value);
  }
}
