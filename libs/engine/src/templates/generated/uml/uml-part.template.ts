/**
 * Auto-generated NodeTemplate for uml-part
 * Generated from TypeRegistry entry: uml:part
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlPartTemplate: NodeTemplate = {
  "id": "uml-part",
  "version": "1.0.0",
  "meta": {
    "name": "Part",
    "description": "A part in a composite structure",
    "category": "diagram",
    "tags": [
      "composite",
      "part",
      "component-part",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:part",
    "size": {
      "width": 100,
      "height": 60,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#E1F5FE",
      "stroke": "#0277BD",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-part-content\">\n          <div class=\"node-label\">{{data.label || 'Part'}}</div>\n        </div>",
      "className": "uml-part",
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
    "label": "Part"
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
