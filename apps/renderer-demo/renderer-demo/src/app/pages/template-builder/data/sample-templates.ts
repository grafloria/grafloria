import { NodeTemplate } from '@grafloria/engine';
import { TemplateMetadata } from '../models/template-metadata.model';

/**
 * Sample Templates for Gallery
 *
 * Pre-built example templates following proper NodeTemplate schema
 * Organized by category: Basic, Workflow, Diagram, Dashboard, UI Components
 *
 * Phase 9: Template Gallery & Management
 */

/**
 * Helper to create proper NodeTemplate structure
 */
function createTemplate(partial: Partial<NodeTemplate>): NodeTemplate {
  return {
    id: partial.id || 'unknown',
    version: '1.0.0',
    meta: {
      name: partial.meta?.name || 'Unnamed',
      description: partial.meta?.description,
      category: partial.meta?.category || 'basic',
      tags: partial.meta?.tags,
      author: partial.meta?.author
    },
    structure: partial.structure!,
    ...partial
  } as NodeTemplate;
}

/**
 * Basic Templates - Simple shapes for getting started
 */
export const BASIC_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Simple Rectangle',
    description: 'A basic rectangular node with customizable color and size. Perfect starting point for any design.',
    category: 'basic',
    tags: ['rectangle', 'shape', 'simple'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: [],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: false,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'simple-rectangle',
      meta: {
        name: 'Simple Rectangle',
        description: 'Basic rectangular node',
        category: 'basic'
      },
      structure: {
        type: 'rectangle',
        size: { width: 200, height: 100 },
        shape: {
          type: 'rect',
          fill: '#e3f2fd',
          stroke: '#2196f3',
          strokeWidth: 2
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Rounded Card',
    description: 'A rounded rectangle card with shadow. Great for displaying content or information boxes.',
    category: 'basic',
    tags: ['card', 'rounded', 'shadow'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['css'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'rounded-card',
      meta: {
        name: 'Rounded Card',
        description: 'Rounded rectangle with shadow',
        category: 'basic'
      },
      structure: {
        type: 'rectangle',
        size: { width: 250, height: 150 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#e0e0e0',
          strokeWidth: 1,
          cornerRadius: 12
        },
        style: {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Circle Badge',
    description: 'A circular badge or avatar placeholder. Useful for profile pictures or status indicators.',
    category: 'basic',
    tags: ['circle', 'badge', 'avatar'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: [],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: false,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'circle-badge',
      meta: {
        name: 'Circle Badge',
        description: 'Circular badge or avatar',
        category: 'basic'
      },
      structure: {
        type: 'circle',
        size: { width: 80, height: 80 },
        shape: {
          type: 'circle',
          fill: '#f3e5f5',
          stroke: '#9c27b0',
          strokeWidth: 3
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Text Label',
    description: 'A simple text label with customizable content. Perfect for adding annotations or descriptions.',
    category: 'basic',
    tags: ['text', 'label', 'annotation'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'text-label',
      meta: {
        name: 'Text Label',
        description: 'Simple text label',
        category: 'basic'
      },
      structure: {
        type: 'rectangle',
        size: { width: 200, height: 60 },
        shape: {
          type: 'rect',
          fill: 'transparent',
          stroke: 'none'
        },
        html: {
          mode: 'template',
          template: '<div style="padding: 12px; text-align: center; font-size: 16px; color: #333;">Your text here</div>'
        },
        ports: { enabled: false }
      }
    })
  }
];

/**
 * Workflow Templates - N8N-style automation and process nodes
 */
export const WORKFLOW_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Trigger Node',
    description: 'Workflow trigger that starts an automation. Like N8N trigger nodes for webhooks, schedules, or events.',
    category: 'workflow',
    tags: ['workflow', 'trigger', 'automation', 'n8n', 'start'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'trigger-node',
      meta: {
        name: 'Trigger Node',
        description: 'Workflow trigger node',
        category: 'workflow'
      },
      structure: {
        type: 'rectangle',
        size: { width: 200, height: 90 },
        shape: {
          type: 'rect',
          fill: '#f0f4ff',
          stroke: '#4f46e5',
          strokeWidth: 2,
          cornerRadius: 8
        },
        html: {
          mode: 'template',
          template: `<div style="padding: 16px; display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: #4f46e5; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">⚡</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 2px;">Trigger</div>
              <div style="font-size: 12px; color: #64748b;">When event occurs</div>
            </div>
          </div>`
        },
        ports: {
          enabled: true,
          right: { enabled: true, type: 'output' }
        }
      }
    })
  },
  {
    name: 'Action Node',
    description: 'Workflow action that performs an operation. Like N8N action nodes for API calls, data transforms, or integrations.',
    category: 'workflow',
    tags: ['workflow', 'action', 'automation', 'n8n', 'task'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'action-node',
      meta: {
        name: 'Action Node',
        description: 'Workflow action node',
        category: 'workflow'
      },
      structure: {
        type: 'rectangle',
        size: { width: 200, height: 90 },
        shape: {
          type: 'rect',
          fill: '#f0fdf4',
          stroke: '#16a34a',
          strokeWidth: 2,
          cornerRadius: 8
        },
        html: {
          mode: 'template',
          template: `<div style="padding: 16px; display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: #16a34a; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">▶</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 2px;">Action</div>
              <div style="font-size: 12px; color: #64748b;">Perform operation</div>
            </div>
          </div>`
        },
        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' }
        }
      }
    })
  },
  {
    name: 'Decision Node',
    description: 'Conditional branching node. Split workflow into multiple paths based on conditions.',
    category: 'workflow',
    tags: ['workflow', 'decision', 'conditional', 'branch', 'if'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'decision-node',
      meta: {
        name: 'Decision Node',
        description: 'Conditional branching',
        category: 'workflow'
      },
      structure: {
        type: 'diamond',
        size: { width: 180, height: 120 },
        shape: {
          type: 'diamond',
          fill: '#fff7ed',
          stroke: '#ea580c',
          strokeWidth: 2
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 20px;">
            <div>
              <div style="font-size: 24px; margin-bottom: 4px;">?</div>
              <div style="font-weight: 600; font-size: 13px; color: #9a3412;">Decision</div>
            </div>
          </div>`
        },
        ports: {
          enabled: true,
          top: { enabled: true, type: 'input' },
          left: { enabled: true, type: 'output' },
          right: { enabled: true, type: 'output' }
        }
      }
    })
  },
  {
    name: 'Data Transform',
    description: 'Transform and map data between steps. Modify, filter, or restructure data in workflows.',
    category: 'workflow',
    tags: ['workflow', 'transform', 'data', 'map', 'filter'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'data-transform',
      meta: {
        name: 'Data Transform',
        description: 'Transform and map data',
        category: 'workflow'
      },
      structure: {
        type: 'rectangle',
        size: { width: 200, height: 90 },
        shape: {
          type: 'rect',
          fill: '#faf5ff',
          stroke: '#9333ea',
          strokeWidth: 2,
          cornerRadius: 8
        },
        html: {
          mode: 'template',
          template: `<div style="padding: 16px; display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: #9333ea; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">⚙</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 2px;">Transform</div>
              <div style="font-size: 12px; color: #64748b;">Map & filter data</div>
            </div>
          </div>`
        },
        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' }
        }
      }
    })
  }
];

/**
 * Diagram Templates - Visio-style flowchart and process shapes
 */
export const DIAGRAM_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Process Box',
    description: 'Standard process box for flowcharts. Represents a process or action step.',
    category: 'diagram',
    tags: ['flowchart', 'process', 'visio', 'diagram'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'process-box',
      meta: {
        name: 'Process Box',
        description: 'Flowchart process step',
        category: 'diagram'
      },
      structure: {
        type: 'rectangle',
        size: { width: 200, height: 80 },
        shape: {
          type: 'rect',
          fill: '#dbeafe',
          stroke: '#1e40af',
          strokeWidth: 2,
          cornerRadius: 4
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; display: flex; align-items: center; justify-content: center; padding: 0 16px;">
            <div style="font-weight: 500; font-size: 14px; color: #1e3a8a; text-align: center;">Process Step</div>
          </div>`
        },
        ports: {
          enabled: true,
          top: { enabled: true, type: 'input' },
          bottom: { enabled: true, type: 'output' },
          left: { enabled: true, type: 'bi' },
          right: { enabled: true, type: 'bi' }
        }
      }
    })
  },
  {
    name: 'Data/Document',
    description: 'Data or document shape for flowcharts. Represents data input/output or documents.',
    category: 'diagram',
    tags: ['flowchart', 'data', 'document', 'visio', 'diagram'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'data-document',
      meta: {
        name: 'Data/Document',
        description: 'Data or document shape',
        category: 'diagram'
      },
      structure: {
        type: 'rectangle',
        size: { width: 180, height: 100 },
        shape: {
          type: 'rect',
          fill: '#fef3c7',
          stroke: '#d97706',
          strokeWidth: 2,
          cornerRadius: 0
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; display: flex; align-items: center; justify-content: center; padding: 0 16px; border-bottom: 12px solid transparent; border-image: linear-gradient(to right, #d97706, #f59e0b, #d97706) 1; border-image-slice: 0 0 1 0;">
            <div style="font-weight: 500; font-size: 13px; color: #92400e; text-align: center;">Document</div>
          </div>`
        },
        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' }
        }
      }
    })
  },
  {
    name: 'Start/End',
    description: 'Terminal shape for flowchart start and end points. Oval/pill shape for process boundaries.',
    category: 'diagram',
    tags: ['flowchart', 'start', 'end', 'terminal', 'visio'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'start-end',
      meta: {
        name: 'Start/End',
        description: 'Terminal shape',
        category: 'diagram'
      },
      structure: {
        type: 'ellipse',
        size: { width: 160, height: 70 },
        shape: {
          type: 'ellipse',
          fill: '#d1fae5',
          stroke: '#059669',
          strokeWidth: 2
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; display: flex; align-items: center; justify-content: center;">
            <div style="font-weight: 600; font-size: 14px; color: #065f46;">Start</div>
          </div>`
        },
        ports: {
          enabled: true,
          bottom: { enabled: true, type: 'output' }
        }
      }
    })
  },
  {
    name: 'ERD Table (Products)',
    description: 'Database table with dynamic children (header + fields). Styled like React Flow schema nodes with proper borders and rounded corners.',
    category: 'diagram',
    tags: ['database', 'erd', 'table', 'schema', 'children', 'react-flow'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '2.0.0',
    features: ['html', 'ports', 'children', 'layout'],
    hasChildNodes: true,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: createTemplate({
      id: 'erd-table-products',
      meta: {
        name: 'ERD Table (Products)',
        description: 'Complete database table with header and field rows - React Flow styled',
        category: 'diagram'
      },
      structure: {
        type: 'erd-table-container',
        role: 'container',
        size: { width: 250, height: 148 },
        shape: {
          type: 'rect',
          fill: '#ffffff',
          stroke: '#CBD2D9',
          strokeWidth: 1,
          cornerRadius: 4
        },
        behavior: {
          draggable: true,
          selectable: true,
          connectable: false
        },
        layout: {
          direction: 'column',
          wrap: 'nowrap',
          justifyContent: 'start',
          alignItems: 'stretch',
          alignContent: 'start',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        ports: {
          enabled: false
        },
        // Dynamic children: header + fields
        children: [
          // Header (drag handler) - React Flow style with rounded top corners
          {
            type: 'erd-table-header',
            role: 'drag-handler',
            size: { width: 250, height: 36 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 36px;
                padding: 8px;
                background: #91C4F2;
                border-radius: 4px 4px 0 0;
                color: #000;
                font-weight: bold;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: move;
                user-select: none;
                box-sizing: border-box;
              ">Products</div>`,
              zIndex: 2
            },
            behavior: {
              draggable: true,
              dragHandler: {
                isDragHandler: true,
                dragChildren: true
              },
              selectable: false
            },
            ports: {
              enabled: false
            }
          },
          // Field 1: id (Primary Key)
          {
            type: 'erd-field',
            role: 'content',
            size: { width: 250, height: 28 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 28px;
                padding: 8px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: transparent;
                border-bottom: 1px solid #CBD2D9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-sizing: border-box;
                line-height: 1;
              ">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <span style="font-weight: 500; color: #000;">id</span>
                </div>
                <span style="color: #BBB; font-size: 12px;">INT</span>
              </div>`,
              zIndex: 1
            },
            behavior: {
              draggable: false,
              selectable: false,
              connectable: true
            },
            ports: {
              enabled: true,
              defaultVisibility: 'always',
              left: { enabled: true, type: 'input' },
              right: { enabled: true, type: 'output' }
            }
          },
          // Field 2: name
          {
            type: 'erd-field',
            role: 'content',
            size: { width: 250, height: 28 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 28px;
                padding: 8px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: transparent;
                border-bottom: 1px solid #CBD2D9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-sizing: border-box;
                line-height: 1;
              ">
                <span style="margin-left: 20px; color: #000;">name</span>
                <span style="color: #BBB; font-size: 12px;">VARCHAR(255)</span>
              </div>`,
              zIndex: 1
            },
            behavior: {
              draggable: false,
              selectable: false,
              connectable: true
            },
            ports: {
              enabled: true,
              defaultVisibility: 'always',
              left: { enabled: true, type: 'input' },
              right: { enabled: true, type: 'output' }
            }
          },
          // Field 3: price
          {
            type: 'erd-field',
            role: 'content',
            size: { width: 250, height: 28 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 28px;
                padding: 8px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: transparent;
                border-bottom: 1px solid #CBD2D9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-sizing: border-box;
                line-height: 1;
              ">
                <span style="margin-left: 20px; color: #000;">price</span>
                <span style="color: #BBB; font-size: 12px;">DECIMAL(10,2)</span>
              </div>`,
              zIndex: 1
            },
            behavior: {
              draggable: false,
              selectable: false,
              connectable: true
            },
            ports: {
              enabled: true,
              defaultVisibility: 'always',
              left: { enabled: true, type: 'input' },
              right: { enabled: true, type: 'output' }
            }
          },
          // Field 4: stock (last row - no border-bottom, rounded bottom corners)
          {
            type: 'erd-field',
            role: 'content',
            size: { width: 250, height: 28 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 28px;
                padding: 8px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: transparent;
                border-radius: 0 0 4px 4px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-sizing: border-box;
                line-height: 1;
              ">
                <span style="margin-left: 20px; color: #000;">stock</span>
                <span style="color: #BBB; font-size: 12px;">INT</span>
              </div>`,
              zIndex: 1
            },
            behavior: {
              draggable: false,
              selectable: false,
              connectable: true
            },
            ports: {
              enabled: true,
              defaultVisibility: 'always',
              left: { enabled: true, type: 'input' },
              right: { enabled: true, type: 'output' }
            }
          }
        ]
      },
      defaultData: {
        tableName: 'Products'
      }
    })
  },
  {
    name: 'ERD Table (Users - Dynamic)',
    description: 'Database table with DYNAMIC CHILDREN using repeater. Provide column data and fields are auto-generated with ports. Perfect for ERD diagrams.',
    category: 'diagram',
    tags: ['database', 'erd', 'table', 'schema', 'dynamic', 'repeater', 'react-flow'],
    complexity: 'complex',
    author: 'Grafloria',
    version: '2.0.0',
    features: ['html', 'ports', 'repeater', 'layout', 'children'],
    hasChildNodes: true,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: createTemplate({
      id: 'erd-table-dynamic',
      meta: {
        name: 'ERD Table (Dynamic Repeater)',
        description: 'Database table with dynamic children - fields auto-generated from data',
        category: 'diagram'
      },
      structure: {
        type: 'erd-table-container',
        role: 'container',
        size: { width: 250, height: 100 },
        shape: {
          type: 'rect',
          fill: '#ffffff',
          stroke: '#CBD2D9',
          strokeWidth: 1,
          cornerRadius: 4
        },
        behavior: {
          draggable: true,
          selectable: true,
          connectable: false
        },
        layout: {
          direction: 'column',
          wrap: 'nowrap',
          justifyContent: 'start',
          alignItems: 'stretch',
          alignContent: 'start',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        ports: {
          enabled: false
        },
        // Static header child
        children: [
          {
            type: 'erd-table-header',
            role: 'drag-handler',
            size: { width: 250, height: 36 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 36px;
                padding: 8px;
                background: #91C4F2;
                border-radius: 4px 4px 0 0;
                color: #000;
                font-weight: bold;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: move;
                user-select: none;
                box-sizing: border-box;
              ">{{data.tableName}}</div>`,
              zIndex: 2
            },
            behavior: {
              draggable: true,
              dragHandler: {
                isDragHandler: true,
                dragChildren: true
              },
              selectable: false
            },
            ports: {
              enabled: false
            }
          }
        ],
        // Dynamic field children using repeater
        repeater: {
          dataSource: 'columns',
          keyField: 'name',
          itemTemplate: {
            type: 'erd-field',
            role: 'content',
            size: { width: 250, height: 28 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none'
            },
            html: {
              mode: 'template',
              template: `<div style="
                width: 100%;
                height: 28px;
                padding: 8px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: transparent;
                border-bottom: 1px solid #CBD2D9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-sizing: border-box;
                line-height: 1;
              ">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="width: 14px; font-size: 14px;">{{data.icon}}</span>
                  <span style="font-weight: 400; color: #000;">{{data.name}}</span>
                </div>
                <span style="color: #999; font-size: 11px;">{{data.dataType}}</span>
              </div>`,
              zIndex: 1
            },
            behavior: {
              draggable: false,
              selectable: false,
              connectable: true
            },
            ports: {
              enabled: true,
              defaultVisibility: 'always',
              left: { enabled: true, type: 'input' },
              right: { enabled: true, type: 'output' }
            }
          }
        }
      },
      defaultData: {
        tableName: 'Users',
        columns: [
          { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, icon: '🔑' },
          { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, icon: '📧' },
          { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false, icon: '👤' },
          { name: 'created_at', dataType: 'TIMESTAMP', isPrimaryKey: false, isForeignKey: false, icon: '📅' }
        ]
      }
    })
  }
];

/**
 * Dashboard Templates - Analytics and metrics widgets
 */
export const DASHBOARD_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Metric Card',
    description: 'KPI metric card showing value, label, and trend. Perfect for dashboards and analytics.',
    category: 'dashboard',
    tags: ['metric', 'kpi', 'dashboard', 'statistics'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: createTemplate({
      id: 'metric-card',
      meta: {
        name: 'Metric Card',
        description: 'Dashboard KPI metric',
        category: 'dashboard'
      },
      structure: {
        type: 'rectangle',
        size: { width: 240, height: 140 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#e5e7eb',
          strokeWidth: 1,
          cornerRadius: 12
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; padding: 20px; display: flex; flex-direction: column; justify-content: center;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Total Users</div>
            <div style="font-size: 32px; font-weight: 700; color: #111827; margin-bottom: 8px;">12,543</div>
            <div style="font-size: 14px; font-weight: 600; color: #10b981;">+12.5%</div>
          </div>`
        },
        style: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Progress Bar',
    description: 'Progress indicator with percentage. Show completion status for tasks or goals.',
    category: 'dashboard',
    tags: ['progress', 'bar', 'percentage', 'dashboard'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: createTemplate({
      id: 'progress-bar',
      meta: {
        name: 'Progress Bar',
        description: 'Progress indicator',
        category: 'dashboard'
      },
      structure: {
        type: 'rectangle',
        size: { width: 300, height: 80 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#e5e7eb',
          strokeWidth: 1,
          cornerRadius: 8
        },
        html: {
          mode: 'template',
          template: `<div style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="font-size: 13px; color: #6b7280;">Project Progress</span>
              <span style="font-size: 14px; font-weight: 700; color: #3b82f6;">75%</span>
            </div>
            <div style="height: 12px; background: #f3f4f6; border-radius: 6px; overflow: hidden;">
              <div style="height: 100%; width: 75%; background: linear-gradient(90deg, #3b82f6, #2563eb); border-radius: 6px; transition: width 0.3s;"></div>
            </div>
          </div>`
        },
        style: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Status Badge',
    description: 'Status indicator badge. Show system status, health, or availability.',
    category: 'dashboard',
    tags: ['status', 'badge', 'indicator', 'dashboard'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: createTemplate({
      id: 'status-badge',
      meta: {
        name: 'Status Badge',
        description: 'Status indicator',
        category: 'dashboard'
      },
      structure: {
        type: 'rectangle',
        size: { width: 180, height: 70 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#e5e7eb',
          strokeWidth: 1,
          cornerRadius: 8
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; padding: 16px; display: flex; align-items: center; gap: 12px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);"></div>
            <div style="flex: 1;">
              <div style="font-size: 13px; color: #6b7280; margin-bottom: 2px;">System Status</div>
              <div style="font-weight: 600; font-size: 14px; color: #10b981;">Operational</div>
            </div>
          </div>`
        },
        style: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Chart Widget',
    description: 'Chart placeholder widget. Represents data visualization like bar, line, or pie charts.',
    category: 'dashboard',
    tags: ['chart', 'graph', 'visualization', 'dashboard'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: createTemplate({
      id: 'chart-widget',
      meta: {
        name: 'Chart Widget',
        description: 'Data visualization',
        category: 'dashboard'
      },
      structure: {
        type: 'rectangle',
        size: { width: 400, height: 250 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#e5e7eb',
          strokeWidth: 1,
          cornerRadius: 12
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; padding: 20px; display: flex; flex-direction: column;">
            <div style="margin-bottom: 16px;">
              <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 4px;">Sales Overview</div>
              <div style="font-size: 13px; color: #6b7280;">Monthly revenue trend</div>
            </div>
            <div style="flex: 1; display: flex; align-items: flex-end; justify-content: space-around; gap: 8px; padding: 16px; background: #f9fafb; border-radius: 8px;">
              <div style="flex: 1; height: 60%; background: linear-gradient(to top, #3b82f6, #60a5fa); border-radius: 4px;"></div>
              <div style="flex: 1; height: 80%; background: linear-gradient(to top, #3b82f6, #60a5fa); border-radius: 4px;"></div>
              <div style="flex: 1; height: 45%; background: linear-gradient(to top, #3b82f6, #60a5fa); border-radius: 4px;"></div>
              <div style="flex: 1; height: 95%; background: linear-gradient(to top, #3b82f6, #60a5fa); border-radius: 4px;"></div>
              <div style="flex: 1; height: 70%; background: linear-gradient(to top, #3b82f6, #60a5fa); border-radius: 4px;"></div>
            </div>
          </div>`
        },
        style: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        ports: { enabled: false }
      }
    })
  }
];

/**
 * UI Component Templates - Reusable interface elements
 */
export const UI_COMPONENT_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Button Component',
    description: 'Interactive button with hover effects. Styled button ready for actions.',
    category: 'ui-component',
    tags: ['button', 'interactive', 'action', 'ui'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'behavior'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: true,
    template: createTemplate({
      id: 'button-component',
      meta: {
        name: 'Button Component',
        description: 'Interactive button',
        category: 'ui-component'
      },
      structure: {
        type: 'rectangle',
        size: { width: 140, height: 44 },
        shape: {
          type: 'rect',
          fill: '#3b82f6',
          stroke: 'none',
          cornerRadius: 8
        },
        html: {
          mode: 'template',
          template: `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 14px; font-weight: 600; cursor: pointer; user-select: none; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.1)'" onmouseout="this.style.background='transparent'" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
            Click Me
          </div>`
        },
        behavior: {
          selectable: true,
          draggable: true
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Input Field',
    description: 'Form input field with placeholder. For building forms and data entry.',
    category: 'ui-component',
    tags: ['input', 'form', 'text-field', 'ui'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: true,
    template: createTemplate({
      id: 'input-field',
      meta: {
        name: 'Input Field',
        description: 'Form input',
        category: 'ui-component'
      },
      structure: {
        type: 'rectangle',
        size: { width: 300, height: 48 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#d1d5db',
          strokeWidth: 2,
          cornerRadius: 6
        },
        html: {
          mode: 'template',
          template: `<input type="text" placeholder="Enter text..." style="width: 100%; height: 100%; border: none; outline: none; padding: 0 16px; font-size: 14px; background: transparent; color: #111827;" />`
        },
        ports: { enabled: false }
      }
    })
  },
  {
    name: 'Card with Header',
    description: 'Card component with title and content area. For structured information display.',
    category: 'ui-component',
    tags: ['card', 'header', 'content', 'ui'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'layout'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: createTemplate({
      id: 'card-with-header',
      meta: {
        name: 'Card with Header',
        description: 'Card with title and content',
        category: 'ui-component'
      },
      structure: {
        type: 'rectangle',
        size: { width: 320, height: 200 },
        shape: {
          type: 'rect',
          fill: 'white',
          stroke: '#e5e7eb',
          strokeWidth: 1,
          cornerRadius: 12
        },
        html: {
          mode: 'template',
          template: `<div style="height: 100%; display: flex; flex-direction: column;">
            <div style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
              <h3 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #111827;">Card Title</h3>
              <p style="margin: 0; font-size: 13px; color: #6b7280;">Subtitle text here</p>
            </div>
            <div style="flex: 1; padding: 16px; font-size: 14px; color: #4b5563; line-height: 1.5;">
              Content goes here. Add your text, data, or other elements.
            </div>
          </div>`
        },
        style: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        ports: { enabled: false }
      }
    })
  }
];

/**
 * All Sample Templates Combined
 */
export const ALL_SAMPLE_TEMPLATES: Partial<TemplateMetadata>[] = [
  ...BASIC_TEMPLATES,
  ...WORKFLOW_TEMPLATES,
  ...DIAGRAM_TEMPLATES,
  ...DASHBOARD_TEMPLATES,
  ...UI_COMPONENT_TEMPLATES
];

/**
 * Get sample templates with full metadata
 */
export function getSampleTemplates(): Partial<TemplateMetadata>[] {
  return ALL_SAMPLE_TEMPLATES.map((template, index) => ({
    ...template,
    id: template.template?.id || `sample-template-${index}`,
    usageCount: Math.floor(Math.random() * 100),
    viewCount: Math.floor(Math.random() * 200),
    createdAt: Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
    modifiedAt: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
    isFavorite: false,
    collections: [],
    userTags: []
  }));
}
