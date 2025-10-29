/**
 * Auto-generated NodeTemplate for erd-multivalued-attribute
 * Generated from TypeRegistry entry: erd:multivalued-attribute
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdMultivaluedAttributeTemplate: NodeTemplate = {
  "id": "erd-multivalued-attribute",
  "version": "1.0.0",
  "meta": {
    "name": "Multivalued Attribute",
    "description": "An attribute that can have multiple values",
    "category": "diagram",
    "tags": [
      "attribute",
      "multivalued",
      "collection",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:multivalued-attribute",
    "size": {
      "width": 120,
      "height": 80,
      "minWidth": 140,
      "maxWidth": 350,
      "minHeight": 70,
      "maxHeight": 500
    },
    "shape": {
      "type": "rect",
      "fill": "#FFFFFF",
      "stroke": "#000000",
      "strokeWidth": 4,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"erd-multivalued-attribute-content\">\n          <div class=\"node-label\">{{data.label || 'Multivalued Attribute'}}</div>\n        </div>",
      "className": "erd-multivalued-attribute",
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
    "label": "Multivalued Attribute"
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
