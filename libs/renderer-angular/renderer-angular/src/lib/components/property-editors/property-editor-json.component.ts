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
 * JSON editor component for editing JSON data.
 *
 * Features:
 * - Textarea with monospace font
 * - JSON syntax validation
 * - Auto-format button
 * - Error indicators
 * - Line numbers (via display hint)
 * - Read-only mode
 *
 * Note: For a more advanced JSON editor, consider integrating
 * Monaco Editor or CodeMirror in a future iteration.
 *
 * @example
 * ```html
 * <property-editor-json
 *   [value]='{"key": "value"}'
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-json>
 * ```
 */
@Component({
    selector: 'property-editor-json',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-json">
      <div class="json-toolbar" *ngIf="!readonly">
        <button
          type="button"
          class="btn-format"
          (click)="formatJson()"
          [disabled]="readonly"
          title="Format JSON"
        >
          Format
        </button>
        <button
          type="button"
          class="btn-minify"
          (click)="minifyJson()"
          [disabled]="readonly"
          title="Minify JSON"
        >
          Minify
        </button>
      </div>

      <textarea
        [id]="property.key"
        [(ngModel)]="currentValue"
        (ngModelChange)="onValueChange($event)"
        (blur)="validateJson()"
        [readonly]="readonly"
        [rows]="getRows()"
        class="json-textarea"
        [class.has-error]="hasError"
        spellcheck="false"
      ></textarea>

      <div class="json-error" *ngIf="errorMessage">
        <span class="error-icon">⚠</span>
        <span class="error-message">{{ errorMessage }}</span>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-json {
        width: 100%;
      }

      .json-toolbar {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }

      .btn-format,
      .btn-minify {
        padding: 6px 12px;
        font-size: 12px;
        border: 1px solid var(--input-border, #ccc);
        background: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .btn-format:hover:not(:disabled),
      .btn-minify:hover:not(:disabled) {
        background-color: var(--button-hover-bg, #f5f5f5);
      }

      .btn-format:disabled,
      .btn-minify:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .json-textarea {
        width: 100%;
        padding: 12px;
        font-size: 13px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        line-height: 1.5;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        outline: none;
        resize: vertical;
        background-color: var(--code-bg, #f8f9fa);
        color: var(--code-text, #333);
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .json-textarea:focus {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
      }

      .json-textarea.has-error {
        border-color: var(--error-color, #dc3545);
      }

      .json-textarea:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
      }

      .json-error {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        padding: 8px 12px;
        background: var(--error-bg, #f8d7da);
        color: var(--error-text, #721c24);
        border-radius: 4px;
        font-size: 13px;
      }

      .error-icon {
        font-size: 16px;
      }

      .error-message {
        flex: 1;
      }
    `,
    ]
})
export class PropertyEditorJsonComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();

  currentValue: string = '';
  errorMessage = '';
  hasError = false;

  ngOnInit(): void {
    this.currentValue = this.formatValue(this.value);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.formatValue(this.value);
    }
  }

  private formatValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    if (value !== null && value !== undefined) {
      return JSON.stringify(value, null, 2);
    }
    return '';
  }

  getRows(): number {
    return this.property.display?.rows || 10;
  }

  validateJson(): void {
    this.errorMessage = '';
    this.hasError = false;

    if (!this.currentValue.trim()) {
      this.validationError.emit(null);
      return;
    }

    try {
      JSON.parse(this.currentValue);
      this.validationError.emit(null);
    } catch (error: any) {
      this.errorMessage = `Invalid JSON: ${error.message}`;
      this.hasError = true;
      this.validationError.emit({ message: this.errorMessage });
    }
  }

  formatJson(): void {
    if (this.readonly) return;

    try {
      const parsed = JSON.parse(this.currentValue);
      this.currentValue = JSON.stringify(parsed, null, 2);
      this.errorMessage = '';
      this.hasError = false;
      this.valueChange.emit(this.currentValue);
      this.validationError.emit(null);
    } catch (error: any) {
      this.errorMessage = `Cannot format invalid JSON: ${error.message}`;
      this.hasError = true;
      this.validationError.emit({ message: this.errorMessage });
    }
  }

  minifyJson(): void {
    if (this.readonly) return;

    try {
      const parsed = JSON.parse(this.currentValue);
      this.currentValue = JSON.stringify(parsed);
      this.errorMessage = '';
      this.hasError = false;
      this.valueChange.emit(this.currentValue);
      this.validationError.emit(null);
    } catch (error: any) {
      this.errorMessage = `Cannot minify invalid JSON: ${error.message}`;
      this.hasError = true;
      this.validationError.emit({ message: this.errorMessage });
    }
  }

  onValueChange(newValue: string): void {
    this.valueChange.emit(newValue);
  }
}
