import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * Boolean editor component for checkbox or toggle switch.
 *
 * Features:
 * - Checkbox mode (default)
 * - Toggle switch mode (via display.variant)
 * - Keyboard accessible (space to toggle)
 * - Visual states (checked, unchecked, disabled)
 * - Read-only mode
 *
 * @example
 * ```html
 * <!-- Checkbox mode -->
 * <property-editor-boolean
 *   [value]="true"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-boolean>
 *
 * <!-- Toggle mode -->
 * <property-editor-boolean
 *   [value]="true"
 *   [property]="{...property, display: { variant: 'toggle' }}"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-boolean>
 * ```
 */
@Component({
    selector: 'property-editor-boolean',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="property-editor property-editor-boolean">
      <label class="checkbox-label" *ngIf="!isToggleMode()">
        <input
          type="checkbox"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [disabled]="readonly"
          class="checkbox-input"
        />
        <span class="checkbox-box"></span>
      </label>

      <div class="toggle-switch" *ngIf="isToggleMode()">
        <input
          type="checkbox"
          [id]="property.key"
          [(ngModel)]="currentValue"
          (ngModelChange)="onValueChange($event)"
          [disabled]="readonly"
          class="toggle-input"
        />
        <label [for]="property.key" class="toggle-label">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-boolean {
        display: inline-flex;
        align-items: center;
      }

      .checkbox-label {
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        position: relative;
        user-select: none;
      }

      .checkbox-input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      .checkbox-input:checked + .checkbox-box {
        background: var(--primary-color, #007bff);
        border-color: var(--primary-color, #007bff);
      }

      .checkbox-input:checked + .checkbox-box::after {
        display: block;
      }

      .checkbox-input:focus + .checkbox-box {
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
      }

      .checkbox-input:disabled + .checkbox-box {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .checkbox-box {
        width: 18px;
        height: 18px;
        border: 2px solid var(--input-border, #ccc);
        border-radius: 3px;
        background: white;
        position: relative;
        transition: all 0.2s;
      }

      .checkbox-box::after {
        content: '';
        display: none;
        position: absolute;
        left: 5px;
        top: 2px;
        width: 4px;
        height: 8px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }

      .toggle-switch {
        display: inline-block;
      }

      .toggle-input {
        display: none;
      }

      .toggle-input:checked + .toggle-label .toggle-slider {
        background: var(--primary-color, #007bff);
      }

      .toggle-input:checked + .toggle-label .toggle-slider::before {
        transform: translateX(20px);
      }

      .toggle-input:focus + .toggle-label .toggle-slider {
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
      }

      .toggle-input:disabled + .toggle-label {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .toggle-label {
        display: block;
        width: 44px;
        height: 24px;
        cursor: pointer;
        user-select: none;
      }

      .toggle-slider {
        display: block;
        width: 100%;
        height: 100%;
        background: #ccc;
        border-radius: 12px;
        position: relative;
        transition: background 0.2s;
      }

      .toggle-slider::before {
        content: '';
        position: absolute;
        width: 20px;
        height: 20px;
        left: 2px;
        top: 2px;
        background: white;
        border-radius: 50%;
        transition: transform 0.2s;
      }
    `,
    ]
})
export class PropertyEditorBooleanComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: boolean = false;

  ngOnInit(): void {
    this.currentValue = !!this.value;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = !!this.value;
    }
  }

  isToggleMode(): boolean {
    return this.property.display?.variant === 'toggle';
  }

  onValueChange(newValue: boolean): void {
    this.valueChange.emit(newValue);
  }
}
