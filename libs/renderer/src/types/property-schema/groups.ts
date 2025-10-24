/**
 * Property group types for organizing properties
 *
 * @packageDocumentation
 */

/**
 * Property group for organizing related properties
 *
 * Groups allow properties to be organized into collapsible sections
 * in the UI. Each group has a name (used for referencing in property
 * definitions) and a label (displayed to the user).
 *
 * @example Basic group
 * ```typescript
 * const group: PropertyGroup = {
 *   name: 'appearance',
 *   label: 'Appearance'
 * };
 * ```
 *
 * @example Group with all options
 * ```typescript
 * const group: PropertyGroup = {
 *   name: 'advanced',
 *   label: 'Advanced Settings',
 *   description: 'Advanced configuration options',
 *   collapsed: true,
 *   order: 10,
 *   icon: 'settings'
 * };
 * ```
 */
export interface PropertyGroup {
  /**
   * Unique group identifier (used in PropertyDefinition.group)
   */
  name: string;

  /**
   * Display label shown in UI
   */
  label: string;

  /**
   * Optional description or help text
   */
  description?: string;

  /**
   * Initial collapse state (default: false/expanded)
   */
  collapsed?: boolean;

  /**
   * Display order (groups with lower order appear first)
   */
  order?: number;

  /**
   * Optional icon identifier
   */
  icon?: string;
}
