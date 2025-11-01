/**
 * Auto-generated NodeTemplate for uml-port
 * Generated from TypeRegistry entry: uml:port
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlPortTemplate: NodeTemplate = {
  "id": "uml-port",
  "version": "1.0.0",
  "meta": {
    "name": "Port",
    "description": "A port on a component or class",
    "category": "diagram",
    "tags": [
      "composite",
      "port",
      "interface-point",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:port",
    "size": {
      "width": 20,
      "height": 20,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#FFFFFF",
      "stroke": "#00838F",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-port-content\">\n          <div class=\"node-label\">{{data.label || 'Port'}}</div>\n        </div>",
      "className": "uml-port",
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
    "label": "Port"
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
