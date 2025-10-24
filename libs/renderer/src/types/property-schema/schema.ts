/**
 * Complete property schema interface
 *
 * @packageDocumentation
 */

import { PropertyDefinition } from './property-definition';
import { PropertyGroup } from './groups';

/**
 * Complete property schema for a node type
 *
 * A property schema defines how all properties of a node type should
 * be edited in the UI. It includes:
 * - Property definitions (what to edit and how)
 * - Optional groups (for organization)
 * - Optional metadata (versioning, documentation)
 *
 * @example Simple schema
 * ```typescript
 * const schema: PropertySchema = {
 *   properties: [
 *     {
 *       key: 'name',
 *       label: 'Name',
 *       editor: 'string',
 *       validation: { required: true }
 *     },
 *     {
 *       key: 'enabled',
 *       label: 'Enabled',
 *       editor: 'boolean'
 *     }
 *   ]
 * };
 * ```
 *
 * @example Complete schema with groups
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
 *     },
 *     {
 *       key: 'primaryKey',
 *       label: 'Primary Key',
 *       editor: 'select',
 *       options: [],
 *       group: 'schema'
 *     }
 *   ],
 *   groups: [
 *     { name: 'basic', label: 'Basic Information', order: 1 },
 *     { name: 'schema', label: 'Schema Definition', order: 2 }
 *   ],
 *   metadata: {
 *     version: '1.0.0',
 *     author: 'System',
 *     description: 'Property schema for database tables'
 *   }
 * };
 * ```
 */
export interface PropertySchema {
  /**
   * List of property definitions
   *
   * Each definition describes how a single property should be edited.
   * Properties are displayed in the order they appear in this array
   * (unless overridden by the `order` field).
   */
  properties: PropertyDefinition[];

  /**
   * Optional property groups for organization
   *
   * Groups allow properties to be organized into collapsible sections.
   * If not specified, all properties are shown ungrouped.
   */
  groups?: PropertyGroup[];

  /**
   * Schema metadata
   *
   * Optional metadata for versioning, documentation, and attribution.
   */
  metadata?: {
    /**
     * Schema version (e.g., '1.0.0')
     */
    version?: string;

    /**
     * Schema author or creator
     */
    author?: string;

    /**
     * Description of what this schema is for
     */
    description?: string;
  };
}
