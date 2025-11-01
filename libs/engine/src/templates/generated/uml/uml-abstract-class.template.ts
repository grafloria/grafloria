/**
 * Auto-generated NodeTemplate for uml-abstract-class
 * Generated from TypeRegistry entry: uml:abstract-class
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlAbstractClassTemplate: NodeTemplate = {
  "id": "uml-abstract-class",
  "version": "1.0.0",
  "meta": {
    "name": "Abstract Class",
    "description": "An abstract class that cannot be instantiated",
    "category": "diagram",
    "tags": [
      "classifier",
      "abstract",
      "class",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:abstract-class",
    "size": {
      "width": 120,
      "height": 80,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#FFF3E0",
      "stroke": "#F57C00",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-class-container\">\n          <div class=\"class-header\">\n            {{data.stereotype ? '&laquo;' + data.stereotype + '&raquo;' : ''}}\n            <div class=\"class-name\">{{data.name || 'Class'}}</div>\n          </div>\n          <div class=\"divider\"></div>\n          <div class=\"attributes-section\">\n            {{#if data.attributes}}\n              {{#each data.attributes}}\n                <div class=\"attribute\">\n                  <span class=\"visibility\">{{this.visibility}}</span>\n                  <span class=\"name\">{{this.name}}</span>:\n                  <span class=\"type\">{{this.type}}</span>\n                </div>\n              {{/each}}\n            {{else}}\n              <div class=\"empty-section\"></div>\n            {{/if}}\n          </div>\n          <div class=\"divider\"></div>\n          <div class=\"methods-section\">\n            {{#if data.methods}}\n              {{#each data.methods}}\n                <div class=\"method\">\n                  <span class=\"visibility\">{{this.visibility}}</span>\n                  <span class=\"name\">{{this.name}}</span>({{this.params}}):\n                  <span class=\"return-type\">{{this.returnType}}</span>\n                </div>\n              {{/each}}\n            {{else}}\n              <div class=\"empty-section\"></div>\n            {{/if}}\n          </div>\n        </div>",
      "className": "uml-abstract-class",
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
          "width": 8,
          "height": 8,
          "hoverScale": 1.5
        },
        "svg": {
          "shape": "circle",
          "fill": "#1976D2",
          "stroke": "#FFFFFF",
          "strokeWidth": 2
        }
      },
      "left": {
        "enabled": true,
        "type": "input",
        "maxConnections": undefined
      },
      "right": {
        "enabled": true,
        "type": "output",
        "maxConnections": undefined
      },
      "top": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "bottom": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      }
    },
    "behavior": {
      "draggable": true,
      "selectable": true,
      "connectable": true,
      "resizable": false,
      "deletable": true
    }
  },
  "defaultData": {
    "label": "Abstract Class"
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "default": "Class"
      },
      "stereotype": {
        "type": "string",
        "enum": [
          "interface",
          "abstract",
          "entity",
          "control",
          "boundary"
        ]
      },
      "attributes": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "visibility": {
              "type": "string",
              "enum": [
                "+",
                "-",
                "#",
                "~"
              ],
              "default": "+"
            },
            "name": {
              "type": "string"
            },
            "type": {
              "type": "string"
            },
            "defaultValue": {
              "type": "string"
            },
            "isStatic": {
              "type": "boolean",
              "default": false
            }
          },
          "required": [
            "name",
            "type"
          ]
        },
        "default": []
      },
      "methods": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "visibility": {
              "type": "string",
              "enum": [
                "+",
                "-",
                "#",
                "~"
              ],
              "default": "+"
            },
            "name": {
              "type": "string"
            },
            "params": {
              "type": "string",
              "default": ""
            },
            "returnType": {
              "type": "string",
              "default": "void"
            },
            "isStatic": {
              "type": "boolean",
              "default": false
            },
            "isAbstract": {
              "type": "boolean",
              "default": false
            }
          },
          "required": [
            "name"
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
