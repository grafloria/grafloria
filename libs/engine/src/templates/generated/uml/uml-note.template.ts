/**
 * Auto-generated NodeTemplate for uml-note
 * Generated from TypeRegistry entry: uml:note
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlNoteTemplate: NodeTemplate = {
  "id": "uml-note",
  "version": "1.0.0",
  "meta": {
    "name": "Note",
    "description": "A note or comment",
    "category": "diagram",
    "tags": [
      "annotation",
      "note",
      "comment",
      "documentation",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:note",
    "size": {
      "width": 100,
      "height": 80,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#FFFDE7",
      "stroke": "#F57F17",
      "strokeWidth": 1,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-note-content\">\n          <div class=\"node-label\">{{data.label || 'Note'}}</div>\n        </div>",
      "className": "uml-note",
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
    "label": "Note"
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
