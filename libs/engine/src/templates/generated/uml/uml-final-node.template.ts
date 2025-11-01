/**
 * Auto-generated NodeTemplate for uml-final-node
 * Generated from TypeRegistry entry: uml:final-node
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlFinalNodeTemplate: NodeTemplate = {
  "id": "uml-final-node",
  "version": "1.0.0",
  "meta": {
    "name": "Final Node",
    "description": "The ending point of an activity",
    "category": "diagram",
    "tags": [
      "activity",
      "final",
      "end",
      "terminal",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:final-node",
    "size": {
      "width": 24,
      "height": 24,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "circle",
      "fill": "#000000",
      "stroke": "#000000",
      "strokeWidth": 4,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-final-node-content\">\n          <div class=\"node-label\">{{data.label || 'Final Node'}}</div>\n        </div>",
      "className": "uml-final-node",
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
      "resizable": false,
      "deletable": true
    }
  },
  "defaultData": {
    "label": "Final Node"
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
