/**
 * Auto-generated NodeTemplate for uml-state
 * Generated from TypeRegistry entry: uml:state
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlStateTemplate: NodeTemplate = {
  "id": "uml-state",
  "version": "1.0.0",
  "meta": {
    "name": "State",
    "description": "A state in a state machine",
    "category": "diagram",
    "tags": [
      "state-machine",
      "state",
      "behavior",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:state",
    "size": {
      "width": 120,
      "height": 60,
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
      "opacity": 1,
      "cornerRadius": 12
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-state-content\">\n          <div class=\"node-label\">{{data.label || 'State'}}</div>\n        </div>",
      "className": "uml-state",
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
    "label": "State"
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
