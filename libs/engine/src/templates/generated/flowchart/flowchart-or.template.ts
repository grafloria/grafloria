/**
 * Auto-generated NodeTemplate for flowchart-or
 * Generated from TypeRegistry entry: flowchart:or
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const flowchartOrTemplate: NodeTemplate = {
  "id": "flowchart-or",
  "version": "1.0.0",
  "meta": {
    "name": "OR",
    "description": "Logical OR operation",
    "category": "workflow",
    "tags": [
      "flow-control",
      "or",
      "logic",
      "flowchart"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "flowchart:or",
    "size": {
      "width": 60,
      "height": 60,
      "minWidth": 80,
      "maxWidth": 250,
      "minHeight": 50,
      "maxHeight": 150
    },
    "shape": {
      "type": "circle",
      "fill": "#FFF9C4",
      "stroke": "#F57F17",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"flowchart-or-content\">\n          <div class=\"node-label\">{{data.label || 'OR'}}</div>\n        </div>",
      "className": "flowchart-or",
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
      "top": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "right": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "bottom": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "left": {
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
    "label": "OR"
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
