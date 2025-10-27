/**
 * JSON Schema for NodeTemplate
 *
 * Comprehensive schema definition for Grafloria diagram node templates.
 * Provides autocomplete, validation, and documentation for Monaco Editor.
 *
 * Based on the NodeTemplate interface from @grafloria/engine
 */

export const NODE_TEMPLATE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'Node Template',
  description: 'Template definition for Grafloria diagram nodes',
  required: ['id', 'version', 'meta', 'structure'],

  properties: {
    id: {
      type: 'string',
      description: 'Unique template identifier (kebab-case recommended)',
      pattern: '^[a-z0-9-]+$',
      examples: ['basic-node', 'erd-table', 'workflow-task']
    },

    version: {
      type: 'string',
      description: 'Semantic version number',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      examples: ['1.0.0', '2.1.3']
    },

    meta: {
      type: 'object',
      description: 'Template metadata for categorization and discovery',
      required: ['name', 'category'],
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable display name',
          examples: ['Basic Rectangle', 'ERD Table', 'Workflow Task']
        },
        category: {
          type: 'string',
          description: 'Template category for organization',
          enum: ['basic', 'database', 'workflow', 'dashboard', 'custom'],
          examples: ['basic', 'database']
        },
        description: {
          type: 'string',
          description: 'Detailed description of the template purpose',
          examples: ['A simple rectangular node for general use']
        },
        tags: {
          type: 'array',
          description: 'Searchable tags for template discovery',
          items: {
            type: 'string'
          },
          examples: [['shape', 'basic'], ['database', 'table', 'erd']]
        }
      }
    },

    structure: {
      type: 'object',
      description: 'Node structure and appearance configuration',
      required: ['type', 'size'],
      properties: {
        type: {
          type: 'string',
          description: 'Node type identifier',
          examples: ['custom', 'erd-table', 'workflow-task']
        },

        role: {
          type: 'string',
          description: 'Node role in parent-child hierarchy',
          enum: ['container', 'content', 'drag-handler'],
          markdownDescription: '**Node roles:**\n- `container`: Parent node that contains children\n- `content`: Child node with content\n- `drag-handler`: Child that acts as drag handle for parent'
        },

        size: {
          type: 'object',
          description: 'Node dimensions in pixels',
          required: ['width', 'height'],
          properties: {
            width: {
              type: 'number',
              minimum: 10,
              maximum: 2000,
              description: 'Width in pixels',
              examples: [200, 250, 300]
            },
            height: {
              type: 'number',
              minimum: 10,
              maximum: 2000,
              description: 'Height in pixels',
              examples: [100, 150, 200]
            },
            depth: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'Depth for 3D rendering (future use)'
            }
          }
        },

        shape: {
          type: 'object',
          description: 'SVG shape configuration',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              description: 'Shape type',
              enum: ['rect', 'circle', 'ellipse', 'diamond', 'hexagon'],
              markdownDescription: '**Available shapes:**\n- `rect`: Rectangle with optional rounded corners\n- `circle`: Perfect circle (width must equal height)\n- `ellipse`: Oval shape\n- `diamond`: Rotated square (rhombus)\n- `hexagon`: Six-sided polygon'
            },
            fill: {
              type: 'string',
              description: 'Fill color (CSS color value)',
              pattern: '^(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla|transparent).*$',
              examples: ['#e3f2fd', '#ff9800', 'rgba(255, 0, 0, 0.5)', 'transparent']
            },
            stroke: {
              type: 'string',
              description: 'Stroke/border color (CSS color value)',
              examples: ['#2196f3', '#666', 'rgba(0, 0, 0, 0.2)']
            },
            strokeWidth: {
              type: 'number',
              minimum: 0,
              maximum: 20,
              description: 'Stroke width in pixels',
              examples: [1, 2, 3]
            },
            cornerRadius: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Corner radius for rectangles only',
              markdownDescription: '**Note:** Only applies to `rect` shape type'
            }
          }
        },

        html: {
          type: 'object',
          description: 'HTML layer configuration for rich content',
          required: ['mode', 'template'],
          properties: {
            mode: {
              type: 'string',
              enum: ['template', 'component'],
              description: 'Rendering mode',
              markdownDescription: '**Modes:**\n- `template`: Use Mustache template string\n- `component`: Use Angular component (advanced)'
            },
            template: {
              type: 'string',
              description: 'Mustache template string',
              markdownDescription: '**Mustache syntax:**\n- `{{data.propertyName}}`: Insert data value\n- `{{#data.condition}}...{{/data.condition}}`: Conditional block\n- `{{^data.condition}}...{{/data.condition}}`: Negative conditional\n- `{{#data.array}}...{{/data.array}}`: Loop over array',
              examples: [
                '<div class="node-content">{{data.title}}</div>',
                '{{#data.isActive}}<span class="active">●</span>{{/data.isActive}}'
              ]
            },
            className: {
              type: 'string',
              description: 'CSS class name for styling',
              examples: ['node-erd-table', 'workflow-task', 'dashboard-card']
            },
            zIndex: {
              type: 'number',
              description: 'Stacking order (higher = on top)',
              examples: [0, 1, 2, 10]
            },
            style: {
              type: 'object',
              description: 'Inline CSS styles (JavaScript object)',
              additionalProperties: true,
              examples: [{ padding: '10px', background: '#fff' }]
            }
          }
        },

        behavior: {
          type: 'object',
          description: 'Node interaction behavior',
          properties: {
            draggable: {
              type: 'boolean',
              description: 'Can be dragged by user',
              default: true
            },
            selectable: {
              type: 'boolean',
              description: 'Can be selected by user',
              default: true
            },
            connectable: {
              type: 'boolean',
              description: 'Can have connections via ports',
              default: true
            },
            dragHandler: {
              type: 'object',
              description: 'Drag handler configuration (for child nodes)',
              properties: {
                isDragHandler: {
                  type: 'boolean',
                  description: 'Acts as drag handle for parent node',
                  markdownDescription: 'When `true`, dragging this node drags the parent'
                },
                dragChildren: {
                  type: 'boolean',
                  description: 'Drag child nodes along with parent',
                  default: true
                }
              }
            }
          }
        },

        layout: {
          type: 'object',
          description: 'Flexbox layout for positioning child nodes',
          markdownDescription: '**Layout system:**\nUse CSS Flexbox to automatically position child nodes.\nOnly applies when node has children.',
          properties: {
            direction: {
              type: 'string',
              enum: ['row', 'column', 'row-reverse', 'column-reverse'],
              description: 'Flex direction',
              markdownDescription: '**Flex direction:**\n- `row`: Horizontal (left to right)\n- `column`: Vertical (top to bottom)\n- `row-reverse`: Horizontal (right to left)\n- `column-reverse`: Vertical (bottom to top)'
            },
            wrap: {
              type: 'string',
              enum: ['nowrap', 'wrap', 'wrap-reverse'],
              description: 'Flex wrap behavior'
            },
            justifyContent: {
              type: 'string',
              enum: ['start', 'end', 'center', 'space-between', 'space-around', 'space-evenly'],
              description: 'Alignment along main axis'
            },
            alignItems: {
              type: 'string',
              enum: ['start', 'end', 'center', 'stretch', 'baseline'],
              description: 'Alignment along cross axis'
            },
            alignContent: {
              type: 'string',
              enum: ['start', 'end', 'center', 'stretch', 'space-between', 'space-around'],
              description: 'Multi-line alignment'
            },
            gap: {
              type: 'number',
              minimum: 0,
              description: 'Gap between children in pixels',
              examples: [0, 4, 8, 16]
            },
            padding: {
              type: 'object',
              description: 'Padding around children',
              properties: {
                top: { type: 'number', minimum: 0 },
                right: { type: 'number', minimum: 0 },
                bottom: { type: 'number', minimum: 0 },
                left: { type: 'number', minimum: 0 }
              }
            }
          }
        },

        ports: {
          type: 'object',
          description: 'Connection port configuration',
          markdownDescription: '**Ports:**\nConnection points for linking nodes together.\nCan be placed on left, right, top, bottom sides.',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable ports on this node',
              default: true
            },
            defaultVisibility: {
              type: 'string',
              enum: ['always', 'hover', 'never'],
              description: 'Port visibility mode',
              markdownDescription: '**Visibility modes:**\n- `always`: Ports always visible\n- `hover`: Ports visible on mouse hover\n- `never`: Ports never visible (connections still work)'
            },
            left: {
              $ref: '#/definitions/portConfig',
              description: 'Left side port configuration'
            },
            right: {
              $ref: '#/definitions/portConfig',
              description: 'Right side port configuration'
            },
            top: {
              $ref: '#/definitions/portConfig',
              description: 'Top side port configuration'
            },
            bottom: {
              $ref: '#/definitions/portConfig',
              description: 'Bottom side port configuration'
            }
          }
        },

        children: {
          type: 'array',
          description: 'Static child nodes defined in template',
          markdownDescription: '**Children array:**\n\nDefine nested child nodes directly in the template.\nUseful for composite nodes like tables with headers.\n\n**Example:**\n```json\n"children": [\n  {\n    "type": "header-node",\n    "role": "drag-handler",\n    "size": { "width": 250, "height": 45 },\n    "html": { ... }\n  }\n]\n```',
          items: {
            $ref: '#/properties/structure',
            description: 'Child node structure (same schema as parent)'
          }
        }
      }
    },

    dataSchema: {
      type: 'object',
      description: 'JSON Schema for validating node data',
      markdownDescription: '**Data schema:**\n\nDefine the structure of data passed to this template.\nUsed for validation and autocomplete in template strings.\n\nSee: https://json-schema.org/understanding-json-schema/',
      additionalProperties: true
    },

    defaultData: {
      type: 'object',
      description: 'Default data values for template',
      markdownDescription: '**Default data:**\n\nProvide default values for template data properties.\nThese values are used when creating new nodes from this template.',
      additionalProperties: true
    }
  },

  definitions: {
    portConfig: {
      type: 'object',
      description: 'Port configuration for one side',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Enable port on this side',
          default: true
        },
        type: {
          type: 'string',
          enum: ['input', 'output', 'both'],
          description: 'Port connection type',
          markdownDescription: '**Port types:**\n- `input`: Can receive incoming connections\n- `output`: Can create outgoing connections\n- `both`: Can both send and receive'
        }
      }
    }
  }
};
