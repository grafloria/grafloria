/**
 * ValidationSchemaGenerator - Generates JSON Schema for node data validation
 *
 * Creates JSON Schema definitions based on node type and category.
 * Supports validation for:
 * - Simple nodes (label only)
 * - UML classes (attributes, methods)
 * - ERD entities (fields, relationships)
 * - BPMN tasks (specific task data)
 */

import type { NodeTypeDefinition } from '../../validation/TypeRegistry';

export class ValidationSchemaGenerator {
  /**
   * Generate JSON Schema for a node type's data
   */
  generate(typeDefinition: NodeTypeDefinition): Record<string, any> {
    const { category, family } = typeDefinition;

    // Complex schemas for specific types
    if (category === 'uml' && family === 'classifier') {
      return this.generateUMLClassSchema();
    }

    if (category === 'erd' && family === 'entity') {
      return this.generateERDEntitySchema();
    }

    if (category === 'bpmn' && family === 'activity') {
      return this.generateBPMNTaskSchema();
    }

    // Default simple schema
    return this.generateSimpleSchema();
  }

  /**
   * Generate simple schema (label only)
   */
  private generateSimpleSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          default: '',
        },
      },
      required: ['label'],
    };
  }

  /**
   * Generate schema for UML class nodes
   */
  private generateUMLClassSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          default: 'Class',
        },
        stereotype: {
          type: 'string',
          enum: ['interface', 'abstract', 'entity', 'control', 'boundary'],
        },
        attributes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              visibility: {
                type: 'string',
                enum: ['+', '-', '#', '~'], // public, private, protected, package
                default: '+',
              },
              name: {
                type: 'string',
              },
              type: {
                type: 'string',
              },
              defaultValue: {
                type: 'string',
              },
              isStatic: {
                type: 'boolean',
                default: false,
              },
            },
            required: ['name', 'type'],
          },
          default: [],
        },
        methods: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              visibility: {
                type: 'string',
                enum: ['+', '-', '#', '~'],
                default: '+',
              },
              name: {
                type: 'string',
              },
              params: {
                type: 'string',
                default: '',
              },
              returnType: {
                type: 'string',
                default: 'void',
              },
              isStatic: {
                type: 'boolean',
                default: false,
              },
              isAbstract: {
                type: 'boolean',
                default: false,
              },
            },
            required: ['name'],
          },
          default: [],
        },
      },
      required: ['name'],
    };
  }

  /**
   * Generate schema for ERD entity nodes
   */
  private generateERDEntitySchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          default: 'Entity',
        },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
              type: {
                type: 'string',
              },
              primaryKey: {
                type: 'boolean',
                default: false,
              },
              foreignKey: {
                type: 'boolean',
                default: false,
              },
              unique: {
                type: 'boolean',
                default: false,
              },
              notNull: {
                type: 'boolean',
                default: false,
              },
              autoIncrement: {
                type: 'boolean',
                default: false,
              },
              defaultValue: {
                type: 'string',
              },
            },
            required: ['name', 'type'],
          },
          default: [],
        },
      },
      required: ['name'],
    };
  }

  /**
   * Generate schema for BPMN task nodes
   */
  private generateBPMNTaskSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          default: 'Task',
        },
        taskType: {
          type: 'string',
          enum: ['task', 'user', 'service', 'manual', 'script', 'business-rule'],
        },
        assignee: {
          type: 'string',
        },
        candidateGroups: {
          type: 'array',
          items: { type: 'string' },
        },
        dueDate: {
          type: 'string',
          format: 'date-time',
        },
        priority: {
          type: 'number',
          minimum: 0,
          maximum: 10,
        },
      },
      required: ['label'],
    };
  }

  /**
   * Get default schema for a specific category
   */
  getDefaultForCategory(category: string): Record<string, any> {
    switch (category) {
      case 'uml':
        return this.generateSimpleSchema();
      case 'erd':
        return this.generateSimpleSchema();
      case 'bpmn':
        return this.generateBPMNTaskSchema();
      case 'flowchart':
        return this.generateSimpleSchema();
      default:
        return this.generateSimpleSchema();
    }
  }
}
