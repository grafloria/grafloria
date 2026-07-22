import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Color editor component for color selection.
 *
 * Features:
 * - Color input with native color picker
 * - Visual color swatch
 * - Hex color input
 * - Preset colors (if configured)
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-color
 *   [value]="'#007bff'"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-color>
 * ```
 */
@Component({
    selector: 'property-editor-color',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-color">
      <div class="color-input-wrapper">
        <div class="color-swatch" [style.background-color]="currentValue">
          <input
            type="color"
            [id]="property.key"
            [(ngModel)]="currentValue"
            (ngModelChange)="onValueChange($event)"
            [disabled]="readonly"
            class="color-picker"
          />
        </div>

        <input
          type="text"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [readonly]="readonly"
          placeholder="#000000"
          class="color-text-input"
        />
      </div>

      <div class="preset-colors" *ngIf="hasPresets()">
        <button
          type="button"
          *ngFor="let preset of getPresets()"
          class="preset-color"
          [style.background-color]="preset"
          (click)="selectPreset(preset)"
          [disabled]="readonly"
          [title]="preset"
          [attr.aria-label]="'Select color ' + preset"
        ></button>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-color {
        width: 100%;
      }

      .color-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .color-swatch {
        position: relative;
        width: 40px;
        height: 40px;
        border: 2px solid var(--input-border, #ccc);
        border-radius: 4px;
        cursor: pointer;
        overflow: hidden;
      }

      .color-picker {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
        cursor: pointer;
        opacity: 0;
      }

      .color-picker:disabled {
        cursor: not-allowed;
      }

      .color-text-input {
        flex: 1;
        padding: 8px 12px;
        font-size: 14px;
        font-family: monospace;
        border: 1px solid var(--input-border, #ccc);
        border-radius: 4px;
        outline: none;
      }

      .color-text-input:focus {
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
      }

      .color-text-input:read-only {
        background-color: var(--input-readonly-bg, #f5f5f5);
        cursor: not-allowed;
      }

      .preset-colors {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .preset-color {
        width: 32px;
        height: 32px;
        border: 2px solid var(--input-border, #ccc);
        border-radius: 4px;
        cursor: pointer;
        padding: 0;
        transition: transform 0.2s, border-color 0.2s;
      }

      .preset-color:hover:not(:disabled) {
        transform: scale(1.1);
        border-color: var(--primary-color, #007bff);
      }

      .preset-color:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
    ]
})
export class PropertyEditorColorComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: string = '#000000';

  ngOnInit(): void {
    this.currentValue = this.value || '#000000';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.value || '#000000';
    }
  }

  hasPresets(): boolean {
    return Array.isArray(this.property.validation?.presets) &&
           this.property.validation.presets.length > 0;
  }

  getPresets(): string[] {
    return this.property.validation?.presets || [];
  }

  selectPreset(color: string): void {
    if (this.readonly) return;
    this.currentValue = color;
    this.valueChange.emit(color);
  }

  onValueChange(newValue: string): void {
    this.valueChange.emit(newValue);
  }
}
