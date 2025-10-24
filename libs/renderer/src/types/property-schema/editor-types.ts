/**
 * Property editor types and type-specific definitions
 *
 * @packageDocumentation
 */

import { PropertyDefinition } from './property-definition';

/**
 * Supported property editor types
 *
 * The system supports 12 different editor types for various data types:
 * - Text: string, textarea
 * - Numeric: number, slider
 * - Boolean: boolean
 * - Selection: select, multiselect
 * - Visual: color
 * - Structured: json
 * - Temporal: date, datetime
 * - File: file
 *
 * @example
 * ```typescript
 * const editorType: PropertyEditorType = 'string';
 * ```
 */
export type PropertyEditorType =
  | 'string' // Single-line text input
  | 'number' // Number input with step/min/max
  | 'boolean' // Checkbox
  | 'select' // Dropdown (single selection)
  | 'multiselect' // Multi-select dropdown
  | 'color' // Color picker
  | 'textarea' // Multi-line text input
  | 'json' // JSON editor
  | 'date' // Date picker
  | 'datetime' // Date + time picker
  | 'slider' // Range slider
  | 'file'; // File upload

/**
 * Option for select/multiselect editors
 *
 * @example
 * ```typescript
 * const option: SelectOption = {
 *   value: 'table',
 *   label: 'Database Table',
 *   disabled: false
 * };
 * ```
 */
export interface SelectOption {
  /**
   * The actual value stored
   */
  value: any;

  /**
   * Display label shown to user
   */
  label: string;

  /**
   * Whether this option is disabled
   */
  disabled?: boolean;
}

/**
 * String property definition with string-specific validation
 *
 * @example
 * ```typescript
 * const prop: StringPropertyDefinition = {
 *   key: 'tableName',
 *   label: 'Table Name',
 *   editor: 'string',
 *   validation: {
 *     required: true,
 *     minLength: 3,
 *     maxLength: 50,
 *     pattern: '^[a-zA-Z][a-zA-Z0-9_]*$'
 *   }
 * };
 * ```
 */
export interface StringPropertyDefinition extends PropertyDefinition {
  editor: 'string';
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string; // Regex pattern
  };
}

/**
 * Number property definition with number-specific validation
 *
 * @example
 * ```typescript
 * const prop: NumberPropertyDefinition = {
 *   key: 'port',
 *   label: 'Port Number',
 *   editor: 'number',
 *   validation: {
 *     required: true,
 *     min: 1,
 *     max: 65535,
 *     step: 1
 *   }
 * };
 * ```
 */
export interface NumberPropertyDefinition extends PropertyDefinition {
  editor: 'number';
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    step?: number;
  };
}

/**
 * Boolean property definition
 *
 * @example
 * ```typescript
 * const prop: BooleanPropertyDefinition = {
 *   key: 'enabled',
 *   label: 'Enabled',
 *   editor: 'boolean',
 *   defaultValue: true
 * };
 * ```
 */
export interface BooleanPropertyDefinition extends PropertyDefinition {
  editor: 'boolean';
  defaultValue?: boolean;
}

/**
 * Select (dropdown) property definition with options
 *
 * @example
 * ```typescript
 * const prop: SelectPropertyDefinition = {
 *   key: 'nodeType',
 *   label: 'Node Type',
 *   editor: 'select',
 *   options: [
 *     { value: 'table', label: 'Table' },
 *     { value: 'view', label: 'View' },
 *     { value: 'procedure', label: 'Stored Procedure', disabled: true }
 *   ],
 *   validation: { required: true }
 * };
 * ```
 */
export interface SelectPropertyDefinition extends PropertyDefinition {
  editor: 'select';
  options: SelectOption[];
  validation?: {
    required?: boolean;
  };
}

/**
 * Multi-select property definition with options
 *
 * @example
 * ```typescript
 * const prop: MultiSelectPropertyDefinition = {
 *   key: 'tags',
 *   label: 'Tags',
 *   editor: 'multiselect',
 *   options: [
 *     { value: 'important', label: 'Important' },
 *     { value: 'urgent', label: 'Urgent' },
 *     { value: 'review', label: 'Needs Review' }
 *   ]
 * };
 * ```
 */
export interface MultiSelectPropertyDefinition extends PropertyDefinition {
  editor: 'multiselect';
  options: SelectOption[];
  validation?: {
    required?: boolean;
  };
}

/**
 * Color picker property definition
 *
 * @example
 * ```typescript
 * const prop: ColorPropertyDefinition = {
 *   key: 'backgroundColor',
 *   label: 'Background Color',
 *   editor: 'color',
 *   defaultValue: '#FFFFFF'
 * };
 * ```
 */
export interface ColorPropertyDefinition extends PropertyDefinition {
  editor: 'color';
  defaultValue?: string; // Hex color (e.g., '#FF0000')
}

/**
 * Textarea (multi-line text) property definition
 *
 * @example
 * ```typescript
 * const prop: TextAreaPropertyDefinition = {
 *   key: 'description',
 *   label: 'Description',
 *   editor: 'textarea',
 *   validation: {
 *     maxLength: 500
 *   }
 * };
 * ```
 */
export interface TextAreaPropertyDefinition extends PropertyDefinition {
  editor: 'textarea';
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
  };
}

/**
 * JSON editor property definition
 *
 * @example
 * ```typescript
 * const prop: JsonPropertyDefinition = {
 *   key: 'metadata',
 *   label: 'Metadata',
 *   editor: 'json',
 *   defaultValue: { version: '1.0' }
 * };
 * ```
 */
export interface JsonPropertyDefinition extends PropertyDefinition {
  editor: 'json';
  defaultValue?: any;
}

/**
 * Date picker property definition
 *
 * @example
 * ```typescript
 * const prop: DatePropertyDefinition = {
 *   key: 'birthDate',
 *   label: 'Birth Date',
 *   editor: 'date',
 *   validation: { required: true }
 * };
 * ```
 */
export interface DatePropertyDefinition extends PropertyDefinition {
  editor: 'date';
  defaultValue?: string | Date;
  validation?: {
    required?: boolean;
  };
}

/**
 * DateTime picker property definition
 *
 * @example
 * ```typescript
 * const prop: DateTimePropertyDefinition = {
 *   key: 'createdAt',
 *   label: 'Created At',
 *   editor: 'datetime',
 *   defaultValue: new Date().toISOString()
 * };
 * ```
 */
export interface DateTimePropertyDefinition extends PropertyDefinition {
  editor: 'datetime';
  defaultValue?: string | Date;
  validation?: {
    required?: boolean;
  };
}

/**
 * Slider (range) property definition
 *
 * @example
 * ```typescript
 * const prop: SliderPropertyDefinition = {
 *   key: 'opacity',
 *   label: 'Opacity',
 *   editor: 'slider',
 *   min: 0,
 *   max: 100,
 *   step: 1,
 *   defaultValue: 100
 * };
 * ```
 */
export interface SliderPropertyDefinition extends PropertyDefinition {
  editor: 'slider';
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
}

/**
 * File upload property definition
 *
 * @example
 * ```typescript
 * const prop: FilePropertyDefinition = {
 *   key: 'avatar',
 *   label: 'Avatar Image',
 *   editor: 'file',
 *   accept: 'image/*',
 *   multiple: false
 * };
 * ```
 */
export interface FilePropertyDefinition extends PropertyDefinition {
  editor: 'file';
  accept?: string; // MIME type filter (e.g., 'image/*', '.pdf')
  multiple?: boolean; // Allow multiple file selection
}
