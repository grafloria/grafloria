/**
 * Auto-generated NodeTemplate for uml-final-state
 * Generated from TypeRegistry entry: uml:final-state
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlFinalStateTemplate: NodeTemplate = {
  "id": "uml-final-state",
  "version": "1.0.0",
  "meta": {
    "name": "Final State",
    "description": "A final state in a state machine",
    "category": "diagram",
    "tags": [
      "state-machine",
      "final",
      "end",
      "terminal",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:final-state",
    "size": {
      "width": 20,
      "height": 20,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "circle",
      "fill": "#FFFFFF",
      "stroke": "#000000",
      "strokeWidth": 4,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-final-state-content\">\n          <div class=\"node-label\">{{data.label || 'Final State'}}</div>\n        </div>",
      "className": "uml-final-state",
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
    "label": "Final State"
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
