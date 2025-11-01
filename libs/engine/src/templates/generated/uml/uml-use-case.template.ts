/**
 * Auto-generated NodeTemplate for uml-use-case
 * Generated from TypeRegistry entry: uml:use-case
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlUseCaseTemplate: NodeTemplate = {
  "id": "uml-use-case",
  "version": "1.0.0",
  "meta": {
    "name": "Use Case",
    "description": "A use case representing system functionality",
    "category": "diagram",
    "tags": [
      "use-case",
      "functionality",
      "requirement",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:use-case",
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
      "fill": "#E8F5E9",
      "stroke": "#388E3C",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-use-case-content\">\n          <div class=\"use-case-name\">{{data.name || 'Use Case'}}</div>\n          {{#if data.description}}\n            <div class=\"use-case-description\">{{data.description}}</div>\n          {{/if}}\n        </div>",
      "className": "uml-use-case",
      "style": {
        "display": "flex",
        "flexDirection": "column",
        "alignItems": "center",
        "justifyContent": "center",
        "padding": "12px",
        "fontFamily": "Arial, sans-serif",
        "fontSize": "13px",
        "textAlign": "center"
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
        "maxConnections": undefined
      },
      "right": {
        "enabled": true,
        "type": "output",
        "maxConnections": undefined
      },
      "top": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "bottom": {
        "enabled": true,
        "type": "bi",
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
    "label": "Use Case"
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
