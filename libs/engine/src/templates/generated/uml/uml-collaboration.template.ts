/**
 * Auto-generated NodeTemplate for uml-collaboration
 * Generated from TypeRegistry entry: uml:collaboration
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlCollaborationTemplate: NodeTemplate = {
  "id": "uml-collaboration",
  "version": "1.0.0",
  "meta": {
    "name": "Collaboration",
    "description": "A collaboration between multiple elements",
    "category": "diagram",
    "tags": [
      "composite",
      "collaboration",
      "interaction",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:collaboration",
    "size": {
      "width": 140,
      "height": 70,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "ellipse",
      "fill": "#F3E5F5",
      "stroke": "#7B1FA2",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-collaboration-content\">\n          <div class=\"node-label\">{{data.label || 'Collaboration'}}</div>\n        </div>",
      "className": "uml-collaboration",
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
    "label": "Collaboration"
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
