/**
 * Conditional visibility types for property schema
 *
 * @packageDocumentation
 */

/**
 * Comparison operators for property conditions
 *
 * @example
 * ```typescript
 * // Equality check
 * const condition: PropertyCondition = {
 *   property: 'type',
 *   operator: '==',
 *   value: 'table'
 * };
 * ```
 */
export type ConditionOperator =
  | '==' // Equals
  | '!=' // Not equals
  | '>' // Greater than
  | '<' // Less than
  | '>=' // Greater than or equal
  | '<=' // Less than or equal
  | 'contains' // Array/string contains value
  | 'in' // Value in array
  | 'notIn' // Value not in array
  | 'matches'; // Regex match

/**
 * Simple condition for property visibility
 *
 * @example Equality condition
 * ```typescript
 * const condition: PropertyCondition = {
 *   property: 'useCustomColor',
 *   operator: '==',
 *   value: true
 * };
 * ```
 *
 * @example Comparison condition
 * ```typescript
 * const condition: PropertyCondition = {
 *   property: 'nodeCount',
 *   operator: '>',
 *   value: 100
 * };
 * ```
 *
 * @example Contains condition
 * ```typescript
 * const condition: PropertyCondition = {
 *   property: 'tags',
 *   operator: 'contains',
 *   value: 'important'
 * };
 * ```
 */
export interface PropertyCondition {
  /**
   * Key of the property to check
   */
  property: string;

  /**
   * Comparison operator
   */
  operator: ConditionOperator;

  /**
   * Value to compare against
   */
  value: any;
}

/**
 * Complex condition combining multiple simple conditions
 *
 * @example AND condition
 * ```typescript
 * const condition: ComplexPropertyCondition = {
 *   and: [
 *     { property: 'enabled', operator: '==', value: true },
 *     { property: 'nodeCount', operator: '>', value: 10 }
 *   ]
 * };
 * ```
 *
 * @example OR condition
 * ```typescript
 * const condition: ComplexPropertyCondition = {
 *   or: [
 *     { property: 'type', operator: '==', value: 'table' },
 *     { property: 'type', operator: '==', value: 'view' }
 *   ]
 * };
 * ```
 */
export interface ComplexPropertyCondition {
  /**
   * All conditions must be true (AND logic)
   */
  and?: PropertyCondition[];

  /**
   * At least one condition must be true (OR logic)
   */
  or?: PropertyCondition[];
}
