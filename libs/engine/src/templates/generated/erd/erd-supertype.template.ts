/**
 * Auto-generated NodeTemplate for erd-supertype
 * Generated from TypeRegistry entry: erd:supertype
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdSupertypeTemplate: NodeTemplate = {
  "id": "erd-supertype",
  "version": "1.0.0",
  "meta": {
    "name": "Supertype",
    "description": "A generalized entity in a generalization hierarchy",
    "category": "diagram",
    "tags": [
      "inheritance",
      "supertype",
      "generalization",
      "parent",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:supertype",
    "size": {
      "width": 120,
      "height": 80,
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
      "template": "<div class=\"erd-supertype-content\">\n          <div class=\"node-label\">{{data.label || 'Supertype'}}</div>\n        </div>",
      "className": "erd-supertype",
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
      "resizable": false,
      "deletable": true
    }
  },
  "defaultData": {
    "label": "Supertype"
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
