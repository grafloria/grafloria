import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
} from '@angular/core';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorRegistryService } from '../../services/property-editor-registry.service';

/**
 * Host component that dynamically loads the appropriate property editor.
 *
 * This component acts as a dynamic container for property editors. It uses the
 * PropertyEditorRegistryService to look up and instantiate the correct editor
 * component based on the property definition's `editor` field.
 *
 * The host component:
 * - Dynamically creates the appropriate editor component
 * - Passes inputs (value, property, readonly) to the editor
 * - Subscribes to outputs (valueChange, validationError) from the editor
 * - Handles editor switching when the property changes
 * - Manages component lifecycle (creation and destruction)
 *
 * This component is used by the PropertyPanelComponent to render individual
 * property editors without needing to know which specific editor to use.
 *
 * @example
 * ```html
 * <diagram-property-editor
 *   [property]="propertyDefinition"
 *   [value]="currentValue"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)"
 *   (validationError)="onValidationError($event)">
 * </diagram-property-editor>
 * ```
 */
@Component({
  selector: 'diagram-property-editor',
  standalone: true,
  template: `<ng-container #editorHost></ng-container>`,
})
export class PropertyEditorHostComponent
  implements OnInit, OnChanges, OnDestroy
{
  /**
   * The property definition that determines which editor to load.
   */
  @Input() property!: PropertyDefinition;

  /**
   * The current value to be edited.
   */
  @Input() value: any;

  /**
   * Whether the editor should be in read-only mode.
   */
  @Input() readonly = false;

  /**
   * Emitted when the value changes in the editor.
   */
  @Output() valueChange = new EventEmitter<any>();

  /**
   * Emitted when a validation error occurs in the editor.
   */
  @Output() validationError = new EventEmitter<ValidationError | null>();

  /**
   * ViewContainerRef for dynamically creating components.
   */
  @ViewChild('editorHost', { read: ViewContainerRef, static: true })
  editorHost!: ViewContainerRef;

  /**
   * Reference to the dynamically created editor component.
   */
  componentRef: ComponentRef<any> | null = null;

  constructor(private propertyEditorRegistry: PropertyEditorRegistryService) {}

  ngOnInit(): void {
    this.loadEditor();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If property changed, reload the entire editor
    if (changes['property'] && !changes['property'].firstChange) {
      this.loadEditor();
    }
    // If only value or readonly changed, update the existing editor
    else if (this.componentRef) {
      if (changes['value']) {
        this.componentRef.instance.value = this.value;
      }
      if (changes['readonly']) {
        this.componentRef.instance.readonly = this.readonly;
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyEditor();
  }

  /**
   * Load and instantiate the appropriate editor component.
   *
   * This method:
   * 1. Clears any existing editor
   * 2. Looks up the editor component from the registry
   * 3. Creates a new instance of the editor component
   * 4. Sets the input properties
   * 5. Subscribes to the output events
   */
  private loadEditor(): void {
    // Clear previous editor
    this.destroyEditor();

    // Get editor component from registry
    const editorType = this.property.editor;
    const editorComponent =
      this.propertyEditorRegistry.getEditor(editorType);

    if (!editorComponent) {
      console.error(
        `PropertyEditorHost: No editor registered for type: ${editorType}`
      );
      return;
    }

    // Create editor component
    this.componentRef = this.editorHost.createComponent(editorComponent);

    // Set inputs
    this.componentRef.instance.value = this.value;
    this.componentRef.instance.property = this.property;
    this.componentRef.instance.readonly = this.readonly;

    // Subscribe to outputs
    this.componentRef.instance.valueChange.subscribe((value: any) => {
      this.valueChange.emit(value);
    });

    this.componentRef.instance.validationError.subscribe(
      (error: ValidationError | null) => {
        this.validationError.emit(error);
      }
    );
  }

  /**
   * Destroy the current editor component if it exists.
   */
  private destroyEditor(): void {
    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
    }

    this.editorHost.clear();
  }
}
