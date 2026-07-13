import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import type {
  PropertySchema,
  PropertyDefinition,
  PropertyValidation,
  PropertyCondition,
  ValidationError,
  ValidationResult,
} from '@grafloria/renderer';

/**
 * Diagram node interface for property management
 * Simplified interface to work with any node type that has data storage
 */
export interface PropertyDiagramNode {
  id: string;
  type: string;
  /** Optional human-readable label shown in the panel header (falls back to id) */
  label?: string;
  data: Record<string, any>;
}

/**
 * Property change event
 */
export interface PropertyChangeEvent {
  /** Node ID (single node change) */
  nodeId?: string;

  /** Node IDs (bulk change) */
  nodeIds?: string[];

  /** Property key that changed */
  propertyKey: string;

  /** Old value (single node change) */
  oldValue?: any;

  /** New value */
  newValue: any;

  /** Timestamp of change */
  timestamp: number;
}

/**
 * Core service for managing property schemas and property values.
 * Acts as bridge between property panel UI and diagram engine.
 */
@Injectable({ providedIn: 'root' })
export class PropertyPanelService {
  private schemaRegistry = new Map<string, PropertySchema>();
  private propertyChangedSubject = new Subject<PropertyChangeEvent>();

  /**
   * Observable that emits when any property changes.
   * Can be filtered by node ID or property key.
   */
  readonly propertyChanged$ = this.propertyChangedSubject.asObservable();

  /**
   * Register a property schema for a node type.
   *
   * @param nodeType - Node type identifier (e.g., 'ERD.TABLE', 'BPMN.TASK')
   * @param schema - Property schema definition
   * @throws Error if type already registered or schema invalid
   *
   * @example
   * propertyPanel.registerSchema('ERD.TABLE', {
   *   properties: [
   *     { key: 'tableName', label: 'Table Name', editor: 'string' }
   *   ]
   * });
   */
  registerSchema(nodeType: string, schema: PropertySchema): void {
    if (this.schemaRegistry.has(nodeType)) {
      throw new Error(`Schema for type '${nodeType}' is already registered`);
    }

    this.validateSchema(schema);
    this.schemaRegistry.set(nodeType, schema);
  }

  /**
   * Register schema from JSON string.
   * Enables loading schemas from database or config files.
   *
   * @param nodeType - Node type identifier
   * @param schemaJson - JSON string containing schema
   * @throws Error if JSON invalid or schema invalid
   *
   * @example
   * const json = '{"properties": [...]}';
   * propertyPanel.registerSchemaFromJSON('ERD.TABLE', json);
   */
  registerSchemaFromJSON(nodeType: string, schemaJson: string): void {
    const schema = JSON.parse(schemaJson) as PropertySchema;
    this.registerSchema(nodeType, schema);
  }

  /**
   * Extend an existing schema to create a specialized type.
   * Child inherits all parent properties and can override or add new ones.
   *
   * @param nodeType - New node type identifier
   * @param parentType - Parent type to extend
   * @param overrides - Property overrides and additions
   * @throws Error if parent type not found
   *
   * @example
   * // ERD.TABLE_WITH_AUDIT extends ERD.TABLE
   * propertyPanel.extendSchema(
   *   'ERD.TABLE_WITH_AUDIT',
   *   'ERD.TABLE',
   *   {
   *     properties: [
   *       { key: 'createdAt', label: 'Created At', editor: 'datetime' },
   *       { key: 'updatedAt', label: 'Updated At', editor: 'datetime' }
   *     ]
   *   }
   * );
   */
  extendSchema(
    nodeType: string,
    parentType: string,
    overrides: Partial<PropertySchema>
  ): void {
    const parentSchema = this.schemaRegistry.get(parentType);

    if (!parentSchema) {
      throw new Error(`Parent type '${parentType}' not found. Cannot extend.`);
    }

    const mergedSchema = this.mergeSchemas(parentSchema, overrides);
    this.registerSchema(nodeType, mergedSchema);
  }

  /**
   * Get property schema for a node type.
   * Returns fully resolved schema (including inherited properties).
   *
   * @param nodeType - Node type identifier
   * @returns Property schema or null if not registered
   *
   * @example
   * const schema = propertyPanel.getSchema('ERD.TABLE');
   * if (schema) {
   *   console.log('Properties:', schema.properties.map(p => p.key));
   * }
   */
  getSchema(nodeType: string): PropertySchema | null {
    const schema = this.schemaRegistry.get(nodeType);
    // Return defensive copy to prevent external mutations
    return schema ? this.deepCopy(schema) : null;
  }

  /**
   * Check if schema is registered for node type.
   *
   * @param nodeType - Node type identifier
   * @returns True if schema registered
   */
  hasSchema(nodeType: string): boolean {
    return this.schemaRegistry.has(nodeType);
  }

  /**
   * Get list of all registered node types.
   *
   * @returns Array of node type identifiers
   */
  getAllTypes(): string[] {
    return Array.from(this.schemaRegistry.keys());
  }

  /**
   * Get property value from a node.
   * Supports nested property paths (e.g., 'style.fill.color').
   *
   * @param node - Diagram node
   * @param propertyKey - Property key or path
   * @returns Property value or undefined
   *
   * @example
   * const tableName = propertyPanel.getPropertyValue(node, 'tableName');
   * const fillColor = propertyPanel.getPropertyValue(node, 'style.fill.color');
   */
  getPropertyValue(node: PropertyDiagramNode, propertyKey: string): any {
    return this.getNestedValue(node.data, propertyKey);
  }

  /**
   * Set property value on a node.
   * Validates value against schema before setting.
   *
   * @param node - Diagram node
   * @param propertyKey - Property key or path
   * @param value - New property value
   * @returns Previous property value
   * @throws ValidationError if value invalid
   *
   * @example
   * propertyPanel.setPropertyValue(node, 'tableName', 'users');
   * propertyPanel.setPropertyValue(node, 'style.fill.color', '#ff0000');
   */
  setPropertyValue(node: PropertyDiagramNode, propertyKey: string, value: any): any {
    const schema = this.getSchema(node.type);

    if (!schema) {
      throw new Error(`No schema registered for type '${node.type}'`);
    }

    const property = this.findProperty(schema, propertyKey);

    if (!property) {
      throw new Error(`Property '${propertyKey}' not found in schema for '${node.type}'`);
    }

    // Validate
    const validation = this.validateProperty(value, property);
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join(', ');
      throw new Error(
        `Invalid value for property '${propertyKey}': ${errorMessages}`
      );
    }

    // Get old value
    const oldValue = this.getPropertyValue(node, propertyKey);

    // Set new value
    this.setNestedValue(node.data, propertyKey, value);

    // Emit change event
    this.propertyChangedSubject.next({
      nodeId: node.id,
      propertyKey,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    });

    return oldValue;
  }

  /**
   * Set property value on multiple nodes simultaneously.
   * Validates once and applies to all nodes.
   * Rolls back all changes if any validation fails.
   *
   * @param nodes - Array of diagram nodes
   * @param propertyKey - Property key
   * @param value - New property value
   * @returns Array of updated node IDs
   * @throws ValidationError if value invalid
   *
   * @example
   * const selectedNodes = diagram.getSelectedNodes();
   * propertyPanel.setPropertyValues(selectedNodes, 'style.fill.color', '#ff0000');
   */
  setPropertyValues(
    nodes: PropertyDiagramNode[],
    propertyKey: string,
    value: any
  ): string[] {
    if (nodes.length === 0) {
      return [];
    }

    // Validate against first node's schema
    const schema = this.getSchema(nodes[0].type);
    if (!schema) {
      throw new Error(`No schema registered for type '${nodes[0].type}'`);
    }

    const property = this.findProperty(schema, propertyKey);
    if (!property) {
      throw new Error(`Property '${propertyKey}' not found in schema`);
    }

    const validation = this.validateProperty(value, property);
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join(', ');
      throw new Error(
        `Invalid value: ${errorMessages}`
      );
    }

    // Apply to all nodes
    const updatedIds: string[] = [];

    for (const node of nodes) {
      this.setNestedValue(node.data, propertyKey, value);
      updatedIds.push(node.id);
    }

    // Emit batch event
    this.propertyChangedSubject.next({
      nodeIds: updatedIds,
      propertyKey,
      newValue: value,
      timestamp: Date.now()
    });

    return updatedIds;
  }

  /**
   * Validate a property value against its definition.
   *
   * @param value - Value to validate
   * @param property - Property definition with validation rules
   * @returns Validation result
   *
   * @example
   * const result = propertyPanel.validateProperty('user_table', {
   *   key: 'tableName',
   *   editor: 'string',
   *   validation: { pattern: '^[a-z_]+$', maxLength: 64 }
   * });
   *
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   */
  validateProperty(value: any, property: PropertyDefinition): ValidationResult {
    const errors: ValidationError[] = [];

    const validation = property.validation;

    // Required check
    if (validation?.required && (value === undefined || value === null || value === '')) {
      errors.push({ message: `${property.label} is required` });
      return { valid: false, errors };
    }

    // Skip validation if empty and not required
    if (value === undefined || value === null || value === '') {
      return { valid: true, errors: [] };
    }

    if (!validation) {
      return { valid: true, errors: [] };
    }

    // Type-specific validation
    switch (property.editor) {
      case 'string':
      case 'textarea':
        if (typeof value !== 'string') {
          errors.push({ message: `${property.label} must be a string` });
        } else {
          if (validation.minLength && value.length < validation.minLength) {
            errors.push({ message: `${property.label} must be at least ${validation.minLength} characters` });
          }
          if (validation.maxLength && value.length > validation.maxLength) {
            errors.push({ message: `${property.label} must be at most ${validation.maxLength} characters` });
          }
          if (validation.pattern) {
            const regex = new RegExp(validation.pattern);
            if (!regex.test(value)) {
              errors.push({ message: `${property.label} has invalid format` });
            }
          }
        }
        break;

      case 'number':
      case 'slider':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({ message: `${property.label} must be a number` });
        } else {
          if (validation.min !== undefined && value < validation.min) {
            errors.push({ message: `${property.label} must be at least ${validation.min}` });
          }
          if (validation.max !== undefined && value > validation.max) {
            errors.push({ message: `${property.label} must be at most ${validation.max}` });
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({ message: `${property.label} must be a boolean` });
        }
        break;

      case 'color':
        if (typeof value !== 'string' || !this.isValidColor(value)) {
          errors.push({ message: `${property.label} must be a valid color (hex, rgb, or named)` });
        }
        break;
    }

    // Custom validation function
    if (validation.custom) {
      const customError = validation.custom(value, {});
      if (customError) {
        errors.push({ message: customError.message });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if property is visible based on condition.
   * Evaluates condition expression against current node properties.
   *
   * @param node - Diagram node
   * @param property - Property definition with condition
   * @returns True if property should be visible
   *
   * @example
   * // Property only visible when fill === 'pattern'
   * const isVisible = propertyPanel.isPropertyVisible(node, {
   *   key: 'patternType',
   *   editor: 'select',
   *   condition: { property: 'fill', operator: '==', value: 'pattern' }
   * });
   */
  isPropertyVisible(node: PropertyDiagramNode, property: PropertyDefinition): boolean {
    if (!property.condition) {
      return true; // No condition = always visible
    }

    const condition = property.condition;
    const actualValue = this.getPropertyValue(node, condition.property);

    switch (condition.operator) {
      case '==':
        return actualValue === condition.value;

      case '!=':
        return actualValue !== condition.value;

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(actualValue);

      case '>':
        return typeof actualValue === 'number' && actualValue > (condition.value as number);

      case '<':
        return typeof actualValue === 'number' && actualValue < (condition.value as number);

      case '>=':
        return typeof actualValue === 'number' && actualValue >= (condition.value as number);

      case '<=':
        return typeof actualValue === 'number' && actualValue <= (condition.value as number);

      case 'contains':
        if (Array.isArray(actualValue)) {
          return actualValue.includes(condition.value);
        }
        if (typeof actualValue === 'string') {
          return actualValue.includes(condition.value);
        }
        return false;

      case 'matches':
        if (typeof actualValue === 'string' && typeof condition.value === 'string') {
          const regex = new RegExp(condition.value);
          return regex.test(actualValue);
        }
        return false;

      default:
        console.warn(`Unknown condition operator: ${condition.operator}`);
        return true;
    }
  }

  /**
   * Apply default values from schema to node.
   * Only sets properties that are currently undefined.
   *
   * @param node - Diagram node
   * @param schema - Property schema
   *
   * @example
   * // Apply defaults when creating new node
   * const node = diagram.createNode('ERD.TABLE');
   * const schema = propertyPanel.getSchema('ERD.TABLE');
   * propertyPanel.applyDefaults(node, schema);
   */
  applyDefaults(node: PropertyDiagramNode, schema: PropertySchema): void {
    for (const property of schema.properties) {
      const currentValue = this.getPropertyValue(node, property.key);

      if (currentValue === undefined && property.defaultValue !== undefined) {
        this.setNestedValue(
          node.data,
          property.key,
          property.defaultValue
        );
      }
    }
  }

  /**
   * Get properties organized by groups.
   * Properties without group go to 'General' group.
   *
   * @param schema - Property schema
   * @returns Map of group names to properties
   *
   * @example
   * const groups = propertyPanel.getPropertyGroups(schema);
   * for (const [groupName, properties] of groups) {
   *   console.log(`Group: ${groupName}`);
   *   properties.forEach(p => console.log(`  - ${p.label}`));
   * }
   */
  getPropertyGroups(schema: PropertySchema): Map<string, PropertyDefinition[]> {
    const groups = new Map<string, PropertyDefinition[]>();

    for (const property of schema.properties) {
      const groupName = property.group || 'General';

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }

      groups.get(groupName)!.push(property);
    }

    // Sort groups by order field (if present)
    const sortedGroups = new Map<string, PropertyDefinition[]>();
    const groupOrder = schema.groups?.sort((a, b) => (a.order || 0) - (b.order || 0)) || [];

    for (const groupDef of groupOrder) {
      if (groups.has(groupDef.name)) {
        sortedGroups.set(groupDef.name, groups.get(groupDef.name)!);
        groups.delete(groupDef.name);
      }
    }

    // Add remaining groups (no explicit order)
    for (const [name, properties] of groups) {
      sortedGroups.set(name, properties);
    }

    return sortedGroups;
  }

  /**
   * Filter property change events by node ID.
   */
  getPropertyChangesForNode(nodeId: string): Observable<PropertyChangeEvent> {
    return this.propertyChanged$.pipe(
      filter(event =>
        event.nodeId === nodeId ||
        Boolean(event.nodeIds && event.nodeIds.includes(nodeId))
      )
    );
  }

  /**
   * Filter property change events by property key.
   */
  getPropertyChangesForKey(propertyKey: string): Observable<PropertyChangeEvent> {
    return this.propertyChanged$.pipe(
      filter(event => event.propertyKey === propertyKey)
    );
  }

  // Private helper methods

  private validateSchema(schema: PropertySchema): void {
    if (!schema.properties || schema.properties.length === 0) {
      throw new Error('Schema must have at least one property');
    }

    for (const property of schema.properties) {
      if (!property.key || !property.label || !property.editor) {
        throw new Error(
          `Property must have key, label, and editor: ${JSON.stringify(property)}`
        );
      }
    }
  }

  private mergeSchemas(
    parent: PropertySchema,
    overrides: Partial<PropertySchema>
  ): PropertySchema {
    // Merge properties (child can override parent)
    const mergedProperties = [...parent.properties];

    if (overrides.properties) {
      for (const overrideProp of overrides.properties) {
        const existingIndex = mergedProperties.findIndex(p => p.key === overrideProp.key);

        if (existingIndex >= 0) {
          // Override existing
          mergedProperties[existingIndex] = overrideProp;
        } else {
          // Add new
          mergedProperties.push(overrideProp);
        }
      }
    }

    return {
      ...parent,
      ...overrides,
      properties: mergedProperties
    };
  }

  private findProperty(schema: PropertySchema, key: string): PropertyDefinition | null {
    return schema.properties.find(p => p.key === key) || null;
  }

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];

      if (current[part] === undefined || current[part] === null) {
        current[part] = {};
      }

      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  private isValidColor(value: string): boolean {
    // Hex: #rgb or #rrggbb
    if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(value)) {
      return true;
    }

    // RGB/RGBA
    if (/^rgba?\([\d\s,]+\)$/i.test(value)) {
      return true;
    }

    // Named colors (basic check)
    const namedColors = ['red', 'blue', 'green', 'black', 'white', 'transparent'];
    if (namedColors.includes(value.toLowerCase())) {
      return true;
    }

    return false;
  }

  private deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
