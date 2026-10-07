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

// Every name below is a TYPE, so each re-export says `export type`. Without it
// a transpile-only pipeline (esbuild, SWC, Vite dev's native-ESM dev server)
// cannot know the binding has no runtime value and emits a real re-export,
// which then fails at load with "does not provide an export named …".
// `tsc` elides these either way, so this is free for the Nx builds.

// Core property definition
export type { PropertyDefinition, PropertyEditorType, PropertyDisplayOptions } from './property-definition';

// Editor types and type-specific definitions
export type {
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
export type {
  PropertyValidation,
  ValidationError,
  ValidationResult,
  SelectOption,
} from './validation';

// Condition types
export type {
  PropertyCondition,
  ConditionOperator,
  ComplexPropertyCondition,
} from './conditions';

// Group types
export type { PropertyGroup } from './groups';

// Complete schema
export type { PropertySchema } from './schema';
