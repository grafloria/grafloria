/**
 * Auto-generated NodeTemplate for uml-merge
 * Generated from TypeRegistry entry: uml:merge
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlMergeTemplate: NodeTemplate = {
  "id": "uml-merge",
  "version": "1.0.0",
  "meta": {
    "name": "Merge",
    "description": "A merge node in an activity diagram",
    "category": "diagram",
    "tags": [
      "activity",
      "merge",
      "join-flow",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:merge",
    "size": {
      "width": 120,
      "height": 80,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#E8F5E9",
      "stroke": "#388E3C",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-merge-content\">\n          <div class=\"node-label\">{{data.label || 'Merge'}}</div>\n        </div>",
      "className": "uml-merge",
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
    "label": "Merge"
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
