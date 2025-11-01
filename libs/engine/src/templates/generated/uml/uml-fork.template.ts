/**
 * Auto-generated NodeTemplate for uml-fork
 * Generated from TypeRegistry entry: uml:fork
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlForkTemplate: NodeTemplate = {
  "id": "uml-fork",
  "version": "1.0.0",
  "meta": {
    "name": "Fork",
    "description": "A fork/split node for parallel flows",
    "category": "diagram",
    "tags": [
      "activity",
      "fork",
      "split",
      "parallel",
      "concurrency",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:fork",
    "size": {
      "width": 100,
      "height": 10,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#000000",
      "stroke": "#000000",
      "strokeWidth": 1,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-fork-content\">\n          <div class=\"node-label\">{{data.label || 'Fork'}}</div>\n        </div>",
      "className": "uml-fork",
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
      "resizable": true,
      "deletable": true
    }
  },
  "defaultData": {
    "label": "Fork"
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
