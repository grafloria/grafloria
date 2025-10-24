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
 * String editor component for single-line text input.
 *
 * Features:
 * - Single-line text input
 * - Placeholder support
 * - Prefix/suffix display (e.g., "$" prefix, "px" suffix)
 * - Character count when maxLength is set
 * - Max length validation
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-string
 *   [value]="'John Doe'"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)"
 *   (validationError)="onValidationError($event)">
 * </property-editor-string>
 * ```
 */
@Component({
  selector: 'property-editor-string',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="property-editor property-editor-string">
      <div class="input-wrapper">
        <span class="input-prefix" *ngIf="property.validation?.prefix">
          {{ property.validation.prefix }}
        </span>

        <input
          type="text"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [placeholder]="property.validation?.placeholder || ''"
          [readonly]="readonly"
          [maxlength]="property.validation?.maxLength"
          class="form-input"
          [class.has-prefix]="property.validation?.prefix"
          [class.has-suffix]="property.validation?.suffix"
        />

        <span class="input-suffix" *ngIf="property.validation?.suffix">
          {{ property.validation.suffix }}
        </span>
      </div>

      <div class="character-count" *ngIf="property.validation?.maxLength">
        {{ currentValue?.length || 0 }} / {{ property.validation.maxLength }}
      </div>
    </div>
  `,
  styles: [
    `
      .property-editor-string {
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

      .form-input.has-prefix {
        padding-left: 4px;
      }

      .form-input.has-suffix {
        padding-right: 4px;
      }

      .form-input:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
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

      .character-count {
        font-size: 11px;
        color: var(--text-secondary, #666);
        margin-top: 4px;
        text-align: right;
      }
    `,
  ],
})
export class PropertyEditorStringComponent
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

  onValueChange(newValue: string): void {
    this.valueChange.emit(newValue);
  }
}
