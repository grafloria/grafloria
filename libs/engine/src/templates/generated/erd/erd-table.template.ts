/**
 * Auto-generated NodeTemplate for erd-table
 * Generated from TypeRegistry entry: erd:table
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdTableTemplate: NodeTemplate = {
  "id": "erd-table",
  "version": "1.0.0",
  "meta": {
    "name": "Table",
    "description": "A database table (physical model)",
    "category": "diagram",
    "tags": [
      "physical",
      "table",
      "database",
      "relational",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:table",
    "size": {
      "width": 180,
      "height": 120,
      "minWidth": 140,
      "maxWidth": 350,
      "minHeight": 70,
      "maxHeight": 500
    },
    "shape": {
      "type": "rect",
      "fill": "#E8F5E9",
      "stroke": "#388E3C",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"erd-table-content\">\n          <div class=\"node-label\">{{data.label || 'Table'}}</div>\n        </div>",
      "className": "erd-table",
      "style": {
        "display": "flex",
        "alignItems": "center",
        "justifyContent": "center",
        "padding": "8px",
        "fontFamily": "Arial, sans-serif",
        "fontSize": "14px",
        "textAlign": "center",
        "wordBreak": "break-word"
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
        "maxConnections": null
      },
      "right": {
        "enabled": true,
        "type": "output",
        "maxConnections": null
      },
      "top": {
        "enabled": true,
        "type": "bi",
        "maxConnections": null
      },
      "bottom": {
        "enabled": true,
        "type": "bi",
        "maxConnections": null
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
    "label": "Table"
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "default": ""
      }
    },
    "required": [
      "label"
    ]
  }
};
