import { Injectable, Type } from '@angular/core';
import { PropertyEditorStringComponent } from '../components/property-editors/property-editor-string.component';
import { PropertyEditorNumberComponent } from '../components/property-editors/property-editor-number.component';
import { PropertyEditorBooleanComponent } from '../components/property-editors/property-editor-boolean.component';
import { PropertyEditorSelectComponent } from '../components/property-editors/property-editor-select.component';
import { PropertyEditorMultiselectComponent } from '../components/property-editors/property-editor-multiselect.component';
import { PropertyEditorColorComponent } from '../components/property-editors/property-editor-color.component';
import { PropertyEditorSliderComponent } from '../components/property-editors/property-editor-slider.component';
import { PropertyEditorTextareaComponent } from '../components/property-editors/property-editor-textarea.component';
import { PropertyEditorDateComponent } from '../components/property-editors/property-editor-date.component';
import { PropertyEditorDatetimeComponent } from '../components/property-editors/property-editor-datetime.component';
import { PropertyEditorFileComponent } from '../components/property-editors/property-editor-file.component';
import { PropertyEditorJsonComponent } from '../components/property-editors/property-editor-json.component';

/**
 * Registry service for property editor components.
 *
 * This service manages all property editor components (both built-in and custom).
 * It provides a centralized way to register and retrieve editor components by type.
 *
 * Built-in editors are automatically registered on service initialization:
 * - string, number, boolean, select, multiselect, color, slider,
 *   textarea, date, datetime, file, json
 *
 * Custom editors can be registered using the `registerEditor` method.
 *
 * @example
 * ```typescript
 * // Register a custom editor
 * @Component({
 *   selector: 'custom-editor',
 *   template: '...'
 * })
 * export class CustomEditorComponent implements PropertyEditorComponent {
 *   // ...
 * }
 *
 * // In your module or component
 * constructor(private registry: PropertyEditorRegistryService) {
 *   registry.registerEditor('custom', CustomEditorComponent);
 * }
 *
 * // Use it in a property definition
 * const property: PropertyDefinition = {
 *   key: 'customField',
 *   label: 'Custom Field',
 *   editor: 'custom'
 * };
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class PropertyEditorRegistryService {
  private editors = new Map<string, Type<any>>();

  constructor() {
    this.registerBuiltInEditors();
  }

  /**
   * Register all built-in editor components.
   *
   * This method is called automatically during service initialization.
   * It registers the 12 standard property editor types.
   */
  private registerBuiltInEditors(): void {
    this.registerEditor('string', PropertyEditorStringComponent);
    this.registerEditor('number', PropertyEditorNumberComponent);
    this.registerEditor('boolean', PropertyEditorBooleanComponent);
    this.registerEditor('select', PropertyEditorSelectComponent);
    this.registerEditor('multiselect', PropertyEditorMultiselectComponent);
    this.registerEditor('color', PropertyEditorColorComponent);
    this.registerEditor('slider', PropertyEditorSliderComponent);
    this.registerEditor('textarea', PropertyEditorTextareaComponent);
    this.registerEditor('date', PropertyEditorDateComponent);
    this.registerEditor('datetime', PropertyEditorDatetimeComponent);
    this.registerEditor('file', PropertyEditorFileComponent);
    this.registerEditor('json', PropertyEditorJsonComponent);
  }

  /**
   * Register a custom editor component.
   *
   * This method allows you to register custom property editor components
   * or override built-in editors. If an editor with the same type already
   * exists, it will be overwritten.
   *
   * @param type - The editor type identifier (e.g., 'custom', 'richtext')
   * @param component - The Angular component class that implements PropertyEditorComponent
   *
   * @example
   * ```typescript
   * registry.registerEditor('richtext', RichTextEditorComponent);
   * ```
   */
  registerEditor(type: string, component: Type<any>): void {
    if (this.editors.has(type)) {
      console.warn(
        `PropertyEditorRegistry: Editor type '${type}' is already registered. Overwriting...`
      );
    }

    this.editors.set(type, component);
  }

  /**
   * Get the editor component class for a given type.
   *
   * @param type - The editor type identifier
   * @returns The component class, or null if not found
   *
   * @example
   * ```typescript
   * const editorComponent = registry.getEditor('string');
   * if (editorComponent) {
   *   // Use the component
   * }
   * ```
   */
  getEditor(type: string): Type<any> | null {
    return this.editors.get(type) || null;
  }

  /**
   * Check if an editor is registered for a given type.
   *
   * @param type - The editor type identifier
   * @returns True if an editor is registered, false otherwise
   *
   * @example
   * ```typescript
   * if (registry.hasEditor('custom')) {
   *   console.log('Custom editor is available');
   * }
   * ```
   */
  hasEditor(type: string): boolean {
    return this.editors.has(type);
  }

  /**
   * Get all registered editor types.
   *
   * @returns Array of all registered editor type identifiers
   *
   * @example
   * ```typescript
   * const types = registry.getEditorTypes();
   * console.log('Available editors:', types);
   * // Output: ['string', 'number', 'boolean', 'custom', ...]
   * ```
   */
  getEditorTypes(): string[] {
    return Array.from(this.editors.keys());
  }
}
