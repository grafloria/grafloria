/**
 * Auto-generated NodeTemplate for erd-entity
 * Generated from TypeRegistry entry: erd:entity
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdEntityTemplate: NodeTemplate = {
  "id": "erd-entity",
  "version": "1.0.0",
  "meta": {
    "name": "Entity",
    "description": "An entity in the database",
    "category": "diagram",
    "tags": [
      "entity",
      "table",
      "strong-entity",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:entity",
    "size": {
      "width": 140,
      "height": 70,
      "minWidth": 140,
      "maxWidth": 350,
      "minHeight": 70,
      "maxHeight": 500
    },
    "shape": {
      "type": "rect",
      "fill": "#E3F2FD",
      "stroke": "#1976D2",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"erd-entity-container\">\n          <div class=\"entity-header\">\n            {{data.name || 'Entity'}}\n          </div>\n          <div class=\"divider\"></div>\n          <div class=\"fields-section\">\n            {{#if data.fields}}\n              {{#each data.fields}}\n                <div class=\"field\" data-field-id=\"{{this.name}}\">\n                  {{#if this.primaryKey}}<span class=\"pk-indicator\">PK</span>{{/if}}\n                  {{#if this.foreignKey}}<span class=\"fk-indicator\">FK</span>{{/if}}\n                  <span class=\"field-name {{#if this.primaryKey}}primary-key{{/if}}\">\n                    {{this.name}}\n                  </span>:\n                  <span class=\"field-type\">{{this.type}}</span>\n                  {{#if this.notNull}}<span class=\"constraint\">NOT NULL</span>{{/if}}\n                </div>\n              {{/each}}\n            {{else}}\n              <div class=\"empty-section\">No fields</div>\n            {{/if}}\n          </div>\n        </div>",
      "className": "erd-entity",
      "style": {
        "fontFamily": "monospace",
        "fontSize": "12px",
        "padding": "0"
      }
    },
    "ports": {
      "enabled": true,
      "defaultVisibility": "on-hover",
      "rendering": {
        "mode": "svg",
        "size": {
          "width": 6,
          "height": 6,
          "hoverScale": 1.5
        },
        "svg": {
          "shape": "circle",
          "fill": "#1976D2",
          "stroke": "#FFFFFF",
          "strokeWidth": 1
        }
      },
      "left": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "right": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      }
    },
    "behavior": {
      "draggable": true,
      "selectable": true,
      "connectable": true,
      "resizable": true,
      "deletable": true
    }
  },
  "defaultData": {
    "label": "Entity"
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "default": "Entity"
      },
      "fields": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "type": {
              "type": "string"
            },
            "primaryKey": {
              "type": "boolean",
              "default": false
            },
            "foreignKey": {
              "type": "boolean",
              "default": false
            },
            "unique": {
              "type": "boolean",
              "default": false
            },
            "notNull": {
              "type": "boolean",
              "default": false
            },
            "autoIncrement": {
              "type": "boolean",
              "default": false
            },
            "defaultValue": {
              "type": "string"
            }
          },
          "required": [
            "name",
            "type"
          ]
        },
        "default": []
      }
    },
    "required": [
      "name"
    ]
  }
};
