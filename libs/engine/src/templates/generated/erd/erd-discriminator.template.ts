/**
 * Auto-generated NodeTemplate for erd-discriminator
 * Generated from TypeRegistry entry: erd:discriminator
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdDiscriminatorTemplate: NodeTemplate = {
  "id": "erd-discriminator",
  "version": "1.0.0",
  "meta": {
    "name": "Discriminator",
    "description": "A discriminator attribute for subtype determination",
    "category": "diagram",
    "tags": [
      "inheritance",
      "discriminator",
      "subtype-indicator",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:discriminator",
    "size": {
      "width": 60,
      "height": 60,
      "minWidth": 140,
      "maxWidth": 350,
      "minHeight": 70,
      "maxHeight": 500
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
      "template": "<div class=\"erd-discriminator-content\">\n          <div class=\"node-label\">{{data.label || 'Discriminator'}}</div>\n        </div>",
      "className": "erd-discriminator",
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
        "maxConnections": null
      },
      "right": {
        "enabled": true,
        "type": "output",
        "maxConnections": null
      },
      "top": {
        "enabled": true,
        "type": "output",
        "maxConnections": null
      },
      "bottom": {
        "enabled": true,
        "type": "output",
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
    "label": "Discriminator"
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
