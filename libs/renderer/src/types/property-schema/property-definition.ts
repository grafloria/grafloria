/**
 * Core property definition interface
 *
 * @packageDocumentation
 */

import { PropertyValidation } from './validation';
import { PropertyCondition } from './conditions';

/**
 * Base property editor type (imported from editor-types to avoid circular dependency)
 */
export type PropertyEditorType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'color'
  | 'textarea'
  | 'json'
  | 'date'
  | 'datetime'
  | 'slider'
  | 'file';

/**
 * Definition of a single property in a property schema
 *
 * This is the core interface that defines how a property should be
 * edited in the UI. Each property definition specifies:
 * - What property key it maps to in the NodeModel
 * - How it should be displayed (label, description)
 * - What editor component to use
 * - Validation rules
 * - Conditional visibility
 * - Grouping and ordering
 *
 * @example Basic string property
 * ```typescript
 * const prop: PropertyDefinition = {
 *   key: 'name',
 *   label: 'Name',
 *   editor: 'string',
 *   validation: { required: true, minLength: 3 }
 * };
 * ```
 *
 * @example Number property with validation
 * ```typescript
 * const prop: PropertyDefinition = {
 *   key: 'port',
 *   label: 'Port',
 *   editor: 'number',
 *   validation: { min: 1, max: 65535 },
 *   defaultValue: 8080
 * };
 * ```
 *
 * @example Conditional property
 * ```typescript
 * const prop: PropertyDefinition = {
 *   key: 'customColor',
 *   label: 'Custom Color',
 *   editor: 'color',
 *   condition: { property: 'useCustomColor', operator: '==', value: true }
 * };
 * ```
 */
export interface PropertyDefinition {
  /**
   * Property key in NodeModel (must match the property name)
   */
  key: string;

  /**
   * Display label shown in UI
   */
  label: string;

  /**
   * Editor type to use for this property
   */
  editor: PropertyEditorType;

  /**
   * Default value if property is not set
   */
  defaultValue?: any;

  /**
   * Help text or tooltip description
   */
  description?: string;

  /**
   * Validation rules for this property
   */
  validation?: PropertyValidation;

  /**
   * Conditional visibility based on other property values
   */
  condition?: PropertyCondition;

  /**
   * Group name for organizing properties (optional)
   */
  group?: string;

  /**
   * Display order within group (default: definition order)
   */
  order?: number;

  /**
   * Display options and hints for the editor
   */
  display?: PropertyDisplayOptions;
}

/**
 * Display options for property editors
 */
export interface PropertyDisplayOptions {
  /**
   * Variant of the editor (e.g., 'toggle' for boolean)
   */
  variant?: string;

  /**
   * Number of rows for textarea/json editors
   */
  rows?: number;

  /**
   * Auto-resize for textarea
   */
  autoResize?: boolean;

  /**
   * Show labels on slider (min/max)
   */
  showLabels?: boolean;
}
