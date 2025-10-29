/**
 * Auto-generated NodeTemplate for erd-attribute
 * Generated from TypeRegistry entry: erd:attribute
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdAttributeTemplate: NodeTemplate = {
  "id": "erd-attribute",
  "version": "1.0.0",
  "meta": {
    "name": "Attribute",
    "description": "An attribute of an entity",
    "category": "diagram",
    "tags": [
      "attribute",
      "property",
      "field",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:attribute",
    "size": {
      "width": 100,
      "height": 50,
      "minWidth": 140,
      "maxWidth": 350,
      "minHeight": 70,
      "maxHeight": 500
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
      "template": "<div class=\"erd-attribute-content\">\n          <div class=\"node-label\">{{data.label || 'Attribute'}}</div>\n        </div>",
      "className": "erd-attribute",
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
    "label": "Attribute"
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
