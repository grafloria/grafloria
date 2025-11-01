/**
 * Auto-generated NodeTemplate for erd-relationship
 * Generated from TypeRegistry entry: erd:relationship
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const erdRelationshipTemplate: NodeTemplate = {
  "id": "erd-relationship",
  "version": "1.0.0",
  "meta": {
    "name": "Relationship",
    "description": "A relationship between entities",
    "category": "diagram",
    "tags": [
      "relationship",
      "association",
      "erd"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "erd:relationship",
    "size": {
      "width": 120,
      "height": 120,
      "minWidth": 140,
      "maxWidth": 350,
      "minHeight": 70,
      "maxHeight": 500
    },
    "shape": {
      "type": "diamond",
      "fill": "#FFF3E0",
      "stroke": "#F57C00",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"erd-relationship-content\">\n          <div class=\"node-label\">{{data.label || 'Relationship'}}</div>\n        </div>",
      "className": "erd-relationship",
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
    "label": "Relationship"
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
