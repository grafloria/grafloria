import { EventEmitter } from '@angular/core';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';

/**
 * Common interface that all property editors must implement.
 * This ensures consistency across all editor types.
 *
 * All property editors receive:
 * - value: The current value to edit
 * - property: The property definition with validation rules
 * - readonly: Whether the editor should be in read-only mode
 *
 * All property editors emit:
 * - valueChange: When the value changes
 * - validationError: When validation fails
 *
 * @example
 * ```typescript
 * @Component({
 *   selector: 'property-editor-string',
 *   template: `<input [(ngModel)]="value" (ngModelChange)="onValueChange($event)" />`
 * })
 * export class PropertyEditorStringComponent implements PropertyEditorComponent {
 *   @Input() value: any;
 *   @Input() property!: PropertyDefinition;
 *   @Input() readonly = false;
 *   @Output() valueChange = new EventEmitter<any>();
 *   @Output() validationError = new EventEmitter<ValidationError | null>();
 *
 *   onValueChange(newValue: any): void {
 *     this.valueChange.emit(newValue);
 *   }
 * }
 * ```
 */
export interface PropertyEditorComponent {
  /** Current property value */
  value: any;

  /** Property definition with validation rules */
  property: PropertyDefinition;

  /** Read-only mode (disable editing) */
  readonly: boolean;

  /** Emitted when value changes */
  valueChange: EventEmitter<any>;

  /** Emitted when validation error occurs */
  validationError: EventEmitter<ValidationError | null>;
}
