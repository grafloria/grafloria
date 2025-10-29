/**
 * Auto-generated NodeTemplate for uml-actor
 * Generated from TypeRegistry entry: uml:actor
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlActorTemplate: NodeTemplate = {
  "id": "uml-actor",
  "version": "1.0.0",
  "meta": {
    "name": "Actor",
    "description": "An external actor interacting with the system",
    "category": "diagram",
    "tags": [
      "use-case",
      "actor",
      "external",
      "user",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:actor",
    "size": {
      "width": 60,
      "height": 80,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "#FFFFFF",
      "stroke": "#000000",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-actor-content\">\n          <div class=\"use-case-name\">{{data.name || 'Use Case'}}</div>\n          {{#if data.description}}\n            <div class=\"use-case-description\">{{data.description}}</div>\n          {{/if}}\n        </div>",
      "className": "uml-actor",
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
    "label": "Actor"
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
