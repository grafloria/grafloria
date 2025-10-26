/**
 * ERD (Entity-Relationship Diagram) Templates
 * Templates for database design and ERD diagrams
 */

import type { NodeTemplate } from '../templates/NodeTemplate';

/**
 * ERD Table Node
 * A container node representing a database table with nested field nodes
 * Uses flex column layout to automatically stack field rows
 */
export const ERDTable: NodeTemplate = {
  id: 'erd-table',
  version: '1.0.0',
  meta: {
    name: 'ERD Table',
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
      defaultVisibility: 'on-hover',
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
 * Export all ERD templates
 */
export const ERDTemplates = {
  ERDTable,
  ERDField,
  ERDRelationship,
};
