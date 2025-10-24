import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { PropertyDefinition } from '@grafloria/renderer';

/**
 * Placeholder property editor component.
 * This will be replaced by the full implementation from property-editors.md
 *
 * @internal
 */
@Component({
  selector: 'diagram-property-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="property-editor-wrapper">
      <!-- String/Textarea Editor -->
      <input
        *ngIf="property.editor === 'string'"
        type="text"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        [placeholder]="placeholder"
        (input)="onValueChange($event)"
        class="property-input"
      />

      <textarea
        *ngIf="property.editor === 'textarea'"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        [placeholder]="placeholder"
        (input)="onValueChange($event)"
        class="property-textarea"
        rows="3"
      ></textarea>

      <!-- Number Editor -->
      <input
        *ngIf="property.editor === 'number' || property.editor === 'slider'"
        type="number"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        [min]="property.validation?.min"
        [max]="property.validation?.max"
        (input)="onValueChange($event)"
        class="property-input"
      />

      <!-- Boolean Editor -->
      <input
        *ngIf="property.editor === 'boolean'"
        type="checkbox"
        [id]="id"
        [checked]="value"
        [disabled]="readonly"
        (change)="onCheckboxChange($event)"
        class="property-checkbox"
      />

      <!-- Color Editor -->
      <input
        *ngIf="property.editor === 'color'"
        type="color"
        [id]="id"
        [value]="value"
        [disabled]="readonly"
        (input)="onValueChange($event)"
        class="property-color"
      />

      <!-- Select Editor -->
      <select
        *ngIf="property.editor === 'select'"
        [id]="id"
        [value]="value"
        [disabled]="readonly"
        (change)="onSelectChange($event)"
        class="property-select"
      >
        <option *ngFor="let option of property.options" [value]="option.value">
          {{ option.label }}
        </option>
      </select>

      <!-- Date/Time Editors -->
      <input
        *ngIf="property.editor === 'date'"
        type="date"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        (input)="onValueChange($event)"
        class="property-input"
      />

      <input
        *ngIf="property.editor === 'time'"
        type="time"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        (input)="onValueChange($event)"
        class="property-input"
      />

      <input
        *ngIf="property.editor === 'datetime'"
        type="datetime-local"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        (input)="onValueChange($event)"
        class="property-input"
      />

      <!-- Fallback for unsupported types -->
      <input
        *ngIf="!['string', 'textarea', 'number', 'slider', 'boolean', 'color', 'select', 'date', 'time', 'datetime'].includes(property.editor)"
        type="text"
        [id]="id"
        [value]="value"
        [readonly]="readonly"
        (input)="onValueChange($event)"
        class="property-input"
      />
    </div>
  `,
  styles: [`
    .property-editor-wrapper {
      width: 100%;
    }

    .property-input,
    .property-textarea,
    .property-select {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--input-border, #ccc);
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      background: var(--input-bg, #fff);
      color: var(--input-text, #333);
      transition: border-color 0.2s;
    }

    .property-input:focus,
    .property-textarea:focus,
    .property-select:focus {
      outline: none;
      border-color: var(--primary-color, #007bff);
      box-shadow: 0 0 0 2px var(--primary-color-alpha, rgba(0, 123, 255, 0.1));
    }

    .property-input:read-only,
    .property-textarea:read-only {
      background: var(--input-readonly-bg, #f5f5f5);
      cursor: not-allowed;
    }

    .property-textarea {
      resize: vertical;
      min-height: 60px;
    }

    .property-checkbox {
      width: 20px;
      height: 20px;
      cursor: pointer;
    }

    .property-checkbox:disabled {
      cursor: not-allowed;
    }

    .property-color {
      width: 100%;
      height: 40px;
      padding: 4px;
      border: 1px solid var(--input-border, #ccc);
      border-radius: 4px;
      cursor: pointer;
    }

    .property-color:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertyEditorComponent {
  @Input() id = '';
  @Input() property!: PropertyDefinition;
  @Input() value: any = '';
  @Input() readonly = false;

  @Output() valueChange = new EventEmitter<any>();

  get placeholder(): string {
    if (this.value === '(multiple values)') {
      return 'Multiple values';
    }
    return '';
  }

  onValueChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    let newValue: any = target.value;

    // Type conversion
    if (this.property.editor === 'number' || this.property.editor === 'slider') {
      newValue = parseFloat(newValue);
      if (isNaN(newValue)) {
        return;
      }
    }

    this.valueChange.emit(newValue);
  }

  onCheckboxChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.valueChange.emit(target.checked);
  }

  onSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.valueChange.emit(target.value);
  }
}
