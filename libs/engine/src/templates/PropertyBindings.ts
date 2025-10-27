/**
 * Enhanced NodeTemplate with Data-Driven Properties
 *
 * This demonstrates how to implement conditional properties in repeater items
 * based on item data.
 */

import type { NodeTemplate, NodeStructureDefinition, ShapeConfig } from '../templates/NodeTemplate';

/**
 * Property resolver configuration
 * Maps data conditions to property values
 */
export interface PropertyResolver {
  /**
   * Source data path to evaluate
   * Example: 'data.isPrimaryKey', 'data.status'
   */
  source: string;

  /**
   * Map of source values to target property values
   * Example: { true: '#e3f2fd', false: '#ffffff' }
   */
  map: Record<string, any>;

  /**
   * Default value if source doesn't match any key in map
   */
  default?: any;
}

/**
 * Property bindings for dynamic properties based on data
 */
export interface PropertyBindings {
  /**
   * Shape property bindings
   * Example: { 'fill': { source: 'data.isPrimaryKey', map: { true: '#e3f2fd', false: '#fff' } } }
   */
  shape?: Record<string, PropertyResolver>;

  /**
   * Behavior property bindings
   */
  behavior?: Record<string, PropertyResolver>;

  /**
   * Port configuration bindings
   */
  ports?: Record<string, PropertyResolver>;
}

/**
 * Enhanced NodeStructureDefinition with property bindings
 */
export interface EnhancedNodeStructureDefinition extends NodeStructureDefinition {
  /**
   * Property bindings for data-driven properties
   */
  propertyBindings?: PropertyBindings;
}

/**
 * Example: ERD Field with Conditional Styling
 *
 * This template demonstrates how to use property bindings to conditionally
 * style fields based on their data properties.
 */
export const ERDFieldWithConditionalProperties: NodeTemplate = {
  id: 'erd-field-conditional',
  version: '1.0.0',
  meta: {
    name: 'ERD Field (Conditional Properties)',
    description: 'Field with data-driven shape and behavior',
    category: 'erd',
    tags: ['erd', 'conditional', 'data-driven'],
  },
  structure: {
    type: 'erd-field-conditional',
    size: { width: 250, height: 24 },

    // Base shape (can be overridden by propertyBindings)
    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    // Property bindings - PROPOSED FEATURE
    propertyBindings: {
      shape: {
        // Conditional fill based on isPrimaryKey
        fill: {
          source: 'data.isPrimaryKey',
          map: {
            'true': '#e3f2fd',
            'false': '#ffffff',
          },
          default: '#ffffff',
        },
        // Conditional stroke based on isForeignKey
        stroke: {
          source: 'data.isForeignKey',
          map: {
            'true': '#4caf50',
            'false': '#e0e0e0',
          },
          default: '#e0e0e0',
        },
        // Conditional strokeWidth
        strokeWidth: {
          source: 'data.isPrimaryKey',
          map: {
            'true': 2,
            'false': 1,
          },
          default: 1,
        }
      }
    },

    html: {
      mode: 'template',
      template: `
        <div class="field">
          <span>{{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}</span>
          <span>{{data.name}}</span>
          <span>{{data.dataType}}</span>
        </div>
      `
    },

    ports: {
      enabled: true,
      left: { enabled: true },
      right: { enabled: true },
    }
  } as EnhancedNodeStructureDefinition,

  defaultData: {
    name: 'field',
    dataType: 'VARCHAR',
    isPrimaryKey: false,
    isForeignKey: false,
  }
};

/**
 * Example: Multi-Condition Property Resolver
 *
 * For complex scenarios with multiple conditions
 */
export const ERDFieldMultiCondition: NodeTemplate = {
  id: 'erd-field-multi-condition',
  version: '1.0.0',
  meta: {
    name: 'ERD Field (Multi-Condition)',
    description: 'Field with multiple conditional properties',
    category: 'erd',
  },
  structure: {
    type: 'erd-field-multi',
    size: { width: 250, height: 24 },

    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#e0e0e0',
    },

    // Complex conditional logic
    propertyBindings: {
      shape: {
        // Primary key → Blue
        // Foreign key → Green
        // Nullable → Gray
        // Regular → White
        fill: {
          source: 'data.fieldType', // Custom computed property
          map: {
            'primary_key': '#e3f2fd',
            'foreign_key': '#c8e6c9',
            'nullable': '#f5f5f5',
            'regular': '#ffffff',
          },
          default: '#ffffff',
        }
      }
    },
  } as EnhancedNodeStructureDefinition,

  defaultData: {
    name: 'field',
    fieldType: 'regular', // primary_key | foreign_key | nullable | regular
  }
};

/**
 * Helper function to resolve property value from data
 *
 * This is a reference implementation that would go in NodeFactory
 */
export function resolveProperty(
  resolver: PropertyResolver,
  data: Record<string, any>
): any {
  // Get value from data path
  const parts = resolver.source.split('.');
  let value: any = data;

  for (const part of parts) {
    if (value == null) {
      return resolver.default;
    }
    value = value[part];
  }

  // Convert to string for map lookup
  const key = String(value);

  // Look up in map
  if (key in resolver.map) {
    return resolver.map[key];
  }

  // Return default
  return resolver.default;
}

/**
 * Helper function to apply property bindings to a node
 *
 * This would be integrated into NodeFactory.buildNodeTree()
 */
export function applyPropertyBindings(
  node: any, // NodeModel
  bindings: PropertyBindings | undefined,
  data: Record<string, any>
): void {
  if (!bindings) return;

  // Apply shape property bindings
  if (bindings.shape) {
    const currentShape = node.getMetadata('shape') || {};
    const newShape = { ...currentShape };

    for (const [prop, resolver] of Object.entries(bindings.shape)) {
      newShape[prop] = resolveProperty(resolver, data);
    }

    node.setMetadata('shape', newShape);
  }

  // Apply behavior property bindings
  if (bindings.behavior) {
    const currentBehavior = node.behavior || {};

    for (const [prop, resolver] of Object.entries(bindings.behavior)) {
      (currentBehavior as any)[prop] = resolveProperty(resolver, data);
    }

    node.behavior = currentBehavior;
  }

  // Apply port configuration bindings
  // (more complex - would need to regenerate ports)
}

/**
 * Example usage:
 *
 * const table = nodeFactory.createFromTemplate('erd-table-repeater', {
 *   tableName: 'users',
 *   columns: [
 *     { name: 'id', dataType: 'INT', isPrimaryKey: true },      // → Blue background
 *     { name: 'user_id', dataType: 'INT', isForeignKey: true }, // → Green background
 *     { name: 'email', dataType: 'VARCHAR(255)' },              // → White background
 *   ]
 * });
 *
 * Each field will have different shape.fill based on its data!
 */

export const PropertyBindingExamples = {
  ERDFieldWithConditionalProperties,
  ERDFieldMultiCondition,
  resolveProperty,
  applyPropertyBindings,
};
