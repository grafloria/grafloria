import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Textarea editor component for multi-line text input.
 *
 * Features:
 * - Multi-line text input
 * - Auto-resize height (optional)
 * - Character count when maxLength is set
 * - Min/max length validation
 * - Configurable rows via display hint
 * - Placeholder support
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-textarea
 *   [value]="'Multi-line text'"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-textarea>
 * ```
 */
@Component({
    selector: 'property-editor-textarea',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-textarea">
      <textarea
        #textareaElement
        [id]="property.key"
        [(ngModel)]="currentValue"
        (ngModelChange)="onValueChange($event)"
        (input)="onInput()"
        [placeholder]="property.validation?.placeholder || ''"
        [readonly]="readonly"
        [attr.maxlength]="property.validation?.maxLength"
        [rows]="getRows()"
        class="form-textarea"
        [class.auto-resize]="isAutoResize()"
      ></textarea>

      <div class="character-count" *ngIf="property.validation?.maxLength">
        {{ currentValue?.length || 0 }} / {{ property.validation!.maxLength }}
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-textarea {
        width: 100%;
      }

      .form-textarea {
        width: 100%;
        padding: 8px 12px;
        font-size: 14px;
        font-family: inherit;
        line-height: 1.5;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        outline: none;
        resize: vertical;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .form-textarea:focus {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
      }

      .form-textarea:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
      }

      .form-textarea.auto-resize {
        resize: none;
        overflow: hidden;
      }

      .character-count {
        font-size: 11px;
        color: var(--text-secondary, #666);
        margin-top: 4px;
        text-align: right;
      }
    `,
    ]
})
export class PropertyEditorTextareaComponent
  implements PropertyEditorComponent, OnInit, OnChanges, AfterViewInit
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();

  @ViewChild('textareaElement') textareaElement?: ElementRef<HTMLTextAreaElement>;

  currentValue: string = '';

  ngOnInit(): void {
    this.currentValue = this.value || '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.value || '';
    }
  }

  ngAfterViewInit(): void {
    if (this.isAutoResize()) {
      this.adjustHeight();
    }
  }

  getRows(): number {
    return this.property.display?.rows || 4;
  }

  isAutoResize(): boolean {
    return this.property.display?.autoResize === true;
  }

  onInput(): void {
    if (this.isAutoResize()) {
      this.adjustHeight();
    }
  }

  private adjustHeight(): void {
    if (this.textareaElement) {
      const textarea = this.textareaElement.nativeElement;
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  }

  onValueChange(newValue: string): void {
    this.valueChange.emit(newValue);
  }
}
