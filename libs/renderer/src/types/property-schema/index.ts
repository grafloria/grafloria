/**
 * @packageDocumentation
 * Property schema types for defining node property editing UI
 *
 * This module provides TypeScript interfaces and types for defining
 * property schemas that describe how node properties should be edited
 * in UI panels. The schema system is framework-agnostic and can be used
 * with any UI framework (React, Vue, Angular, etc.).
 *
 * ## Core Concepts
 *
 * - **PropertyDefinition**: Defines how a single property should be edited
 * - **PropertySchema**: Complete schema for all properties of a node type
 * - **PropertyEditorType**: 12 different editor types (string, number, boolean, etc.)
 * - **PropertyValidation**: Validation rules for property values
 * - **PropertyCondition**: Conditional visibility based on other properties
 * - **PropertyGroup**: Organizing properties into collapsible groups
 *
 * ## Usage Examples
 *
 * ### Basic Property Definition
 *
 * ```typescript
 * const prop: PropertyDefinition = {
 *   key: 'name',
 *   label: 'Name',
 *   editor: 'string',
 *   validation: { required: true, minLength: 3 }
 * };
 * ```
 *
 * ### Select Property with Options
 *
 * ```typescript
 * const prop: SelectPropertyDefinition = {
 *   key: 'type',
 *   label: 'Type',
 *   editor: 'select',
 *   options: [
 *     { value: 'table', label: 'Table' },
 *     { value: 'view', label: 'View' }
 *   ]
 * };
 * ```
 *
 * ### Complete Schema
 *
 * ```typescript
 * const schema: PropertySchema = {
 *   properties: [
 *     {
 *       key: 'tableName',
 *       label: 'Table Name',
 *       editor: 'string',
 *       validation: { required: true },
 *       group: 'basic'
 *     },
 *     {
 *       key: 'columns',
 *       label: 'Columns',
 *       editor: 'json',
 *       group: 'schema'
 *     }
 *   ],
 *   groups: [
 *     { name: 'basic', label: 'Basic Information', order: 1 },
 *     { name: 'schema', label: 'Schema', order: 2 }
 *   ]
 * };
 * ```
 *
 * ### Conditional Visibility
 *
 * ```typescript
 * const prop: PropertyDefinition = {
 *   key: 'customColor',
 *   label: 'Custom Color',
 *   editor: 'color',
 *   condition: { property: 'useCustomColor', operator: '==', value: true }
 * };
 * ```
 *
 * ### Custom Validation
 *
 * ```typescript
 * const validation: PropertyValidation = {
 *   custom: (value, allValues) => {
 *     if (value < allValues.minValue) {
 *       return { message: 'Must be greater than minimum' };
 *     }
 *     return null;
 *   }
 * };
 * ```
 */

// Core property definition
export { PropertyDefinition, PropertyEditorType, PropertyDisplayOptions } from './property-definition';

// Editor types and type-specific definitions
export {
  StringPropertyDefinition,
  NumberPropertyDefinition,
  BooleanPropertyDefinition,
  SelectPropertyDefinition,
  MultiSelectPropertyDefinition,
  ColorPropertyDefinition,
  TextAreaPropertyDefinition,
  JsonPropertyDefinition,
  DatePropertyDefinition,
  DateTimePropertyDefinition,
  SliderPropertyDefinition,
  FilePropertyDefinition,
} from './editor-types';

// Validation types
export {
  PropertyValidation,
  ValidationError,
  ValidationResult,
  SelectOption,
} from './validation';

// Condition types
export {
  PropertyCondition,
  ConditionOperator,
  ComplexPropertyCondition,
} from './conditions';

// Group types
export { PropertyGroup } from './groups';

// Complete schema
export { PropertySchema } from './schema';
