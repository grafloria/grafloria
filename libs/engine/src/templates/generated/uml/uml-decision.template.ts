/**
 * Auto-generated NodeTemplate for uml-decision
 * Generated from TypeRegistry entry: uml:decision
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlDecisionTemplate: NodeTemplate = {
  "id": "uml-decision",
  "version": "1.0.0",
  "meta": {
    "name": "Decision",
    "description": "A decision/branch node in an activity diagram",
    "category": "diagram",
    "tags": [
      "activity",
      "decision",
      "branch",
      "conditional",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:decision",
    "size": {
      "width": 50,
      "height": 50,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "diamond",
      "fill": "#FFF9C4",
      "stroke": "#F57F17",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-decision-content\">\n          <div class=\"node-label\">{{data.label || 'Decision'}}</div>\n        </div>",
      "className": "uml-decision",
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
          "fill": "#F57C00",
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
        "type": "output",
        "maxConnections": undefined
      },
      "bottom": {
        "enabled": true,
        "type": "output",
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
    "label": "Decision"
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
