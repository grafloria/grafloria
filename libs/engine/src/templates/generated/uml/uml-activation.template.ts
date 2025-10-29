/**
 * Auto-generated NodeTemplate for uml-activation
 * Generated from TypeRegistry entry: uml:activation
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlActivationTemplate: NodeTemplate = {
  "id": "uml-activation",
  "version": "1.0.0",
  "meta": {
    "name": "Activation",
    "description": "An activation box showing when an object is active",
    "category": "diagram",
    "tags": [
      "sequence",
      "interaction",
      "activation",
      "execution",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:activation",
    "size": {
      "width": 15,
      "height": 80,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#FFFFFF",
      "stroke": "#1976D2",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-activation-content\">\n          <div class=\"node-label\">{{data.label || 'Activation'}}</div>\n        </div>",
      "className": "uml-activation",
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
    "label": "Activation"
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
