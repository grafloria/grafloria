/**
 * Validation types for property schema
 *
 * @packageDocumentation
 */

/**
 * Validation error returned from validation functions
 *
 * @example
 * ```typescript
 * const error: ValidationError = {
 *   message: 'Value must be positive',
 *   code: 'POSITIVE_VALUE_REQUIRED'
 * };
 * ```
 */
export interface ValidationError {
  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Optional error code for programmatic handling
   */
  code?: string;
}

/**
 * Result of running validation on a property value
 *
 * @example
 * ```typescript
 * const result: ValidationResult = {
 *   valid: false,
 *   errors: [{ message: 'Required field is missing' }]
 * };
 * ```
 */
export interface ValidationResult {
  /**
   * Whether the value is valid
   */
  valid: boolean;

  /**
   * Array of validation errors (empty if valid)
   */
  errors: ValidationError[];
}

/**
 * Validation rules for property values
 *
 * @example String validation
 * ```typescript
 * const validation: PropertyValidation = {
 *   required: true,
 *   minLength: 3,
 *   maxLength: 50,
 *   pattern: '^[a-zA-Z]+$'
 * };
 * ```
 *
 * @example Number validation
 * ```typescript
 * const validation: PropertyValidation = {
 *   required: true,
 *   min: 0,
 *   max: 100,
 *   step: 5
 * };
 * ```
 *
 * @example Custom validation
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
export interface PropertyValidation {
  /**
   * Whether the property is required
   */
  required?: boolean;

  // String validation
  /**
   * Minimum string length (for string properties)
   */
  minLength?: number;

  /**
   * Maximum string length (for string properties)
   */
  maxLength?: number;

  /**
   * Regular expression pattern (for string properties)
   */
  pattern?: string;

  // Number validation
  /**
   * Minimum value (for number properties)
   */
  min?: number;

  /**
   * Maximum value (for number properties)
   */
  max?: number;

  /**
   * Step increment (for number properties)
   */
  step?: number;

  /**
   * Whether the number must be an integer (for number properties)
   */
  integer?: boolean;

  // Select/Multiselect validation
  /**
   * Allowed values (for select/multiselect properties)
   */
  enum?: any[];

  // JSON validation
  /**
   * JSON Schema for validating JSON properties
   */
  jsonSchema?: any;

  /**
   * Custom validation function
   *
   * @param value - The value to validate
   * @param allValues - All property values (for cross-field validation)
   * @returns ValidationError if invalid, null if valid
   */
  custom?: (value: any, allValues: Record<string, any>) => ValidationError | null;
}
