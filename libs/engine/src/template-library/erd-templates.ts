/**
 * ERD (Entity-Relationship Diagram) Templates
 * Templates for database design and ERD diagrams
 */

import type { NodeTemplate } from '../templates/NodeTemplate';

/**
 * ERD Table Node (OLD - GroupModel based)
 * A container node representing a database table with nested field nodes
 * Uses flex column layout to automatically stack field rows
 */
export const ERDTable: NodeTemplate = {
  id: 'erd-table',
  version: '1.0.0',
  meta: {
    name: 'ERD Table (OLD)',
    description: 'Database table with nested field nodes',
    category: 'erd',
    tags: ['database', 'table', 'erd', 'schema'],
  },
  structure: {
    type: 'erd-table',
    size: { width: 250, height: 200 },

    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#667eea',
      strokeWidth: 2,
      cornerRadius: 4,
    },

    html: {
      mode: 'template',
      template: `
        <div class="erd-table-header" style="
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          font-size: 14px;
          border-radius: 4px 4px 0 0;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <span style="font-size: 16px;">📊</span>
          <span>{{data.tableName}}</span>
        </div>
      `,
      className: 'node-erd-table',
      zIndex: 1,
    },

    // Smart layout: field nodes stack vertically
    layout: {
      direction: 'column',
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'stretch',
      alignContent: 'start',
      gap: 0,
      padding: { top: 45, right: 0, bottom: 0, left: 0 }, // Space for header
    },

    // No ports on table itself - only on field nodes
    ports: {
      enabled: false,
    },
  },
  defaultData: {
    tableName: 'Table',
  },
};

/**
 * OPTION A: ERD Table with Children Array
 * Complete template with container + header + field structure
 * All defined in one template with static header child
 */
export const ERDTableOptionA: NodeTemplate = {
  id: 'erd-table-option-a',
  version: '1.0.0',
  meta: {
    name: 'ERD Table (Option A)',
    description: 'Table with integrated header drag handler',
    category: 'erd',
    tags: ['database', 'table', 'erd', 'option-a'],
  },
  structure: {
    type: 'erd-table-container-a',
    role: 'container',
    size: { width: 250, height: 200 },

    // Master container background and border
    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#667eea',
      strokeWidth: 2,
      cornerRadius: 8,
    },

    html: {
      mode: 'template',
      template: `
        <div class="erd-table-background-a" style="
          width: 100%;
          height: 100%;
          background: white;
          border: 2px solid #667eea;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
          overflow: hidden;
        "></div>
      `,
      className: 'node-erd-table-container-a',
      zIndex: 0,
    },

    behavior: {
      draggable: true,
      selectable: true,
      connectable: false,
    },

    // Layout for children (header + fields)
    layout: {
      direction: 'column',
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'stretch',
      alignContent: 'start',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },

    ports: {
      enabled: false,
    },

    // Static header child (drag handler)
    children: [
      {
        type: 'erd-table-header-a',
        role: 'drag-handler',
        size: { width: 250, height: 45 },

        shape: {
          type: 'rect',
          fill: 'transparent',
          stroke: 'none',
        },

        html: {
          mode: 'template',
          template: `
            <div class="erd-table-header-a" style="
              width: 100%;
              height: 45px;
              padding: 12px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              font-weight: 600;
              font-size: 14px;
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: move;
              user-select: none;
            ">
              <span style="font-size: 16px;">📊</span>
              <span>{{data.tableName}} (Option A)</span>
            </div>
          `,
          className: 'node-erd-header-a',
          zIndex: 2,
        },

        behavior: {
          draggable: true,
          dragHandler: {
            isDragHandler: true,
            dragChildren: true,
          },
          selectable: false,
        },

        ports: {
          enabled: false,
        },
      },
    ],
  },
  defaultData: {
    tableName: 'Table',
  },
};

/**
 * ERD Field Node
 * A field/column within a table node
 * Has ports on left (input) and right (output) for connections
 */
export const ERDField: NodeTemplate = {
  id: 'erd-field',
  version: '1.0.0',
  meta: {
    name: 'ERD Field',
    description: 'Database table field/column with connection ports',
    category: 'erd',
    tags: ['database', 'field', 'column', 'erd'],
  },
  structure: {
    type: 'erd-field',
    size: { width: 250, height: 30 },

    shape: {
      type: 'rect',
      fill: 'transparent',
      stroke: 'none',
    },

    html: {
      mode: 'template',
      template: `
        <div class="erd-field-row" style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          font-size: 12px;
          background: white;
          border-bottom: 1px solid #e0e0e0;
          height: 30px;
        ">
          <span class="field-icon" style="width: 16px; text-align: center; font-size: 14px;">
            {{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}
            {{#data.isForeignKey}}🔗{{/data.isForeignKey}}
          </span>
          <span class="field-name" style="
            flex: 1;
            font-weight: {{#data.isPrimaryKey}}600{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}400{{/data.isPrimaryKey}};
            color: {{#data.isPrimaryKey}}#667eea{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}#2c3e50{{/data.isPrimaryKey}};
          ">{{data.fieldName}}</span>
          <span class="field-type" style="
            color: #7f8c8d;
            font-size: 11px;
            font-family: 'Courier New', monospace;
          ">{{data.fieldType}}</span>
        </div>
      `,
      className: 'node-erd-field',
      zIndex: 1,
    },

    // Field has ports on left and right
    ports: {
      enabled: true,
      defaultVisibility: 'always',
      left: {
        enabled: true,
        type: 'input',
      },
      right: {
        enabled: true,
        type: 'output',
      },
    },
  },
  defaultData: {
    fieldName: 'field',
    fieldType: 'VARCHAR',
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
  },
};

/**
 * ERD Relationship (Optional standalone node for many-to-many)
 * A diamond-shaped node representing a relationship entity
 */
export const ERDRelationship: NodeTemplate = {
  id: 'erd-relationship',
  version: '1.0.0',
  meta: {
    name: 'ERD Relationship',
    description: 'Relationship entity (for many-to-many relationships)',
    category: 'erd',
    tags: ['database', 'relationship', 'erd', 'many-to-many'],
  },
  structure: {
    type: 'erd-relationship',
    size: { width: 120, height: 60 },

    shape: {
      type: 'diamond',
      fill: '#fff3cd',
      stroke: '#ffc107',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div style="
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 500;
          color: #2c3e50;
        ">
          {{data.relationshipName}}
        </div>
      `,
      className: 'node-erd-relationship',
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      left: {
        enabled: true,
        type: 'input',
      },
      right: {
        enabled: true,
        type: 'output',
      },
      top: {
        enabled: true,
        type: 'input',
      },
      bottom: {
        enabled: true,
        type: 'output',
      },
    },
  },
  defaultData: {
    relationshipName: 'Relationship',
  },
};

/**
 * OPTION A: ERD Field for Option A tables
 * Non-draggable field with ports
 */
export const ERDFieldOptionA: NodeTemplate = {
  id: 'erd-field-option-a',
  version: '1.0.0',
  meta: {
    name: 'ERD Field (Option A)',
    description: 'Non-draggable field for Option A tables',
    category: 'erd',
    tags: ['database', 'field', 'column', 'option-a'],
  },
  structure: {
    type: 'erd-field-a',
    role: 'content',
    size: { width: 250, height: 30 },

    shape: {
      type: 'rect',
      fill: 'transparent',
      stroke: 'none',
    },

    html: {
      mode: 'template',
      template: `
        <div class="erd-field-row-a" style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          font-size: 12px;
          background: white;
          border-bottom: 1px solid #e0e0e0;
          height: 30px;
        ">
          <span class="field-icon" style="width: 16px; text-align: center; font-size: 14px;">
            {{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}
            {{#data.isForeignKey}}🔗{{/data.isForeignKey}}
          </span>
          <span class="field-name" style="
            flex: 1;
            font-weight: {{#data.isPrimaryKey}}600{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}400{{/data.isPrimaryKey}};
            color: {{#data.isPrimaryKey}}#667eea{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}#2c3e50{{/data.isPrimaryKey}};
          ">{{data.fieldName}}</span>
          <span class="field-type" style="
            color: #7f8c8d;
            font-size: 11px;
            font-family: 'Courier New', monospace;
          ">{{data.fieldType}}</span>
        </div>
      `,
      className: 'node-erd-field-a',
      zIndex: 1,
    },

    behavior: {
      draggable: false,  // NOT draggable - locked to parent
      selectable: false,
      connectable: true,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      left: {
        enabled: true,
        type: 'input',
      },
      right: {
        enabled: true,
        type: 'output',
      },
    },
  },
  defaultData: {
    fieldName: 'field',
    fieldType: 'VARCHAR',
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
  },
};

/**
 * OPTION B: ERD Table Container (Master Background)
 * Just the background container, no header
 * Styled like SQL Server Management Studio
 */
export const ERDTableContainerOptionB: NodeTemplate = {
  id: 'erd-table-container-b',
  version: '1.0.0',
  meta: {
    name: 'ERD Container (Option B)',
    description: 'Background container for Option B - SSMS style',
    category: 'erd',
    tags: ['database', 'container', 'option-b', 'ssms'],
  },
  structure: {
    type: 'erd-table-container-b',
    role: 'container',
    size: { width: 250, height: 200 },

    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#a1a1aa',
      strokeWidth: 1,
      cornerRadius: 0,
    },

    behavior: {
      draggable: true,
      selectable: true,
      connectable: false,
    },

    layout: {
      direction: 'column',
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'stretch',
      alignContent: 'start',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 8, left: 0 },
    },

    ports: {
      enabled: false,
    },
  },
  defaultData: {},
};

/**
 * OPTION B: ERD Table Header (Drag Handler)
 * Separate header node that acts as drag handle
 * Styled like SQL Server Management Studio table header
 */
export const ERDTableHeaderOptionB: NodeTemplate = {
  id: 'erd-table-header-b',
  version: '1.0.0',
  meta: {
    name: 'ERD Header (Option B)',
    description: 'Drag handler header for Option B - SSMS style',
    category: 'erd',
    tags: ['database', 'header', 'drag-handler', 'option-b', 'ssms'],
  },
  structure: {
    type: 'erd-table-header-b',
    role: 'drag-handler',
    size: { width: 250, height: 32 },

    shape: {
      type: 'rect',
      fill: 'transparent',
      stroke: 'none',
    },

    html: {
      mode: 'template',
      template: `
        <div class="erd-table-header-b" style="
          width: 100%;
          height: 32px;
          padding: 6px 8px;
          background: #f5f5f5;
          border-bottom: 1px solid #d4d4d8;
          color: #18181b;
          font-weight: 600;
          font-size: 13px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: move;
          user-select: none;
        ">
          <span style="font-size: 14px;">🔑</span>
          <span>{{data.tableName}}</span>
        </div>
      `,
      className: 'node-erd-header-b',
      zIndex: 2,
    },

    behavior: {
      draggable: true,
      dragHandler: {
        isDragHandler: true,
        dragChildren: true,
      },
      selectable: false,
    },

    ports: {
      enabled: false,
    },
  },
  defaultData: {
    tableName: 'Table',
  },
};

/**
 * OPTION B: ERD Field
 * Non-draggable field for Option B tables
 * Styled like SQL Server Management Studio table fields
 */
export const ERDFieldOptionB: NodeTemplate = {
  id: 'erd-field-option-b',
  version: '1.0.0',
  meta: {
    name: 'ERD Field (Option B)',
    description: 'Non-draggable field for Option B tables - SSMS style',
    category: 'erd',
    tags: ['database', 'field', 'column', 'option-b', 'ssms'],
  },
  structure: {
    type: 'erd-field-b',
    role: 'content',
    size: { width: 250, height: 24 },

    shape: {
      type: 'rect',
      fill: 'transparent',
      stroke: 'none',
    },

    html: {
      mode: 'template',
      template: `
        <div class="erd-field-row-b" style="
          width: 100%;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          font-size: 12px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #ffffff;
          border-bottom: {{#data.isLastField}}none{{/data.isLastField}}{{^data.isLastField}}1px solid #e5e5e5{{/data.isLastField}};
          height: 24px;
          min-height: 24px;
        ">
          <span class="field-icon" style="
            width: 14px;
            min-width: 14px;
            text-align: center;
            font-size: 11px;
          ">
            {{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}
            {{#data.isForeignKey}}🔗{{/data.isForeignKey}}
          </span>
          <span class="field-name" style="
            flex: 1;
            font-weight: {{#data.isPrimaryKey}}600{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}400{{/data.isPrimaryKey}};
            color: {{#data.isPrimaryKey}}#0066cc{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}#18181b{{/data.isPrimaryKey}};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">{{data.fieldName}}</span>
          <span class="field-type" style="
            color: #71717a;
            font-size: 11px;
            font-family: 'Consolas', 'Courier New', monospace;
            white-space: nowrap;
          ">{{data.fieldType}}</span>
        </div>
      `,
      className: 'node-erd-field-b',
      zIndex: 1,
    },

    behavior: {
      draggable: false,  // NOT draggable - locked to parent
      selectable: false,
      connectable: true,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      left: {
        enabled: true,
        type: 'input',
      },
      right: {
        enabled: true,
        type: 'output',
      },
    },
  },
  defaultData: {
    fieldName: 'field',
    fieldType: 'VARCHAR',
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
  },
};

/**
 * ERD Table with Dynamic Fields (Repeater)
 * Modern approach using repeater configuration for dynamic field generation
 * This is the RECOMMENDED approach for new ERD implementations
 */
export const ERDTableRepeater: NodeTemplate = {
  id: 'erd-table-repeater',
  version: '1.0.0',
  meta: {
    name: 'ERD Table (Repeater)',
    description: 'Database table with dynamic field nodes using repeater',
    category: 'erd',
    tags: ['database', 'table', 'erd', 'repeater', 'dynamic'],
  },
  structure: {
    type: 'erd-container-repeater',
    role: 'container',
    size: { width: 250, height: 200 },

    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#6b7280',
      strokeWidth: 2,
      cornerRadius: 4,
    },

    behavior: {
      draggable: true,
      selectable: true,
    },

    ports: { enabled: false },

    layout: {
      direction: 'column',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'start',
      alignContent: 'start',
    },

    // Static header child
    children: [
      {
        type: 'erd-header-repeater',
        size: { width: 250, height: 32 },

        html: {
          mode: 'template',
          template: `
            <div class="erd-header" style="
              width: 100%;
              height: 32px;
              padding: 8px;
              background: #f3f4f6;
              border-bottom: 1px solid #d1d5db;
              font-weight: 600;
              font-size: 13px;
              display: flex;
              align-items: center;
              gap: 6px;
            ">
              <span>🔑</span>
              <span>{{data.tableName}}</span>
            </div>
          `,
          className: 'node-erd-header-repeater',
          zIndex: 2,
        },

        behavior: {
          draggable: true,
          dragHandler: {
            isDragHandler: true,
            dragChildren: true,
          },
          selectable: false,
        },

        ports: { enabled: false },
      }
    ],

    // Dynamic field children using repeater
    repeater: {
      dataSource: 'columns',
      keyField: 'name',
      itemTemplate: {
        type: 'erd-field-repeater',
        role: 'content',
        size: { width: 250, height: 24 },

        shape: {
          type: 'rect',
          fill: 'transparent',
          stroke: 'none',
        },

        html: {
          mode: 'template',
          template: `
            <div class="erd-field-row" style="
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 4px 8px;
              font-size: 12px;
              background: #ffffff;
              border-bottom: 1px solid #e5e7eb;
              height: 24px;
            ">
              <span class="field-icon" style="width: 14px; text-align: center; font-size: 11px;">
                {{data.icon}}
              </span>
              <span class="field-name" style="
                flex: 1;
                font-weight: 400;
                color: #18181b;
              ">{{data.name}}</span>
              <span class="field-type" style="
                color: #71717a;
                font-size: 11px;
                font-family: 'Consolas', 'Courier New', monospace;
              ">{{data.dataType}}</span>
            </div>
          `,
          className: 'node-erd-field-repeater',
          zIndex: 1,
        },

        behavior: {
          draggable: false,
          selectable: false,
          connectable: true,
        },

        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' },
        },
      }
    }
  },
  defaultData: {
    tableName: 'Table',
    columns: [],
  },
};

/**
 * Export all ERD templates
 */
export const ERDTemplates = {
  ERDTable,
  ERDField,
  ERDRelationship,
  // Option A
  ERDTableOptionA,
  ERDFieldOptionA,
  // Option B
  ERDTableContainerOptionB,
  ERDTableHeaderOptionB,
  ERDFieldOptionB,
  // Modern Repeater Approach (RECOMMENDED)
  ERDTableRepeater,
};
