/**
 * Auto-generated NodeTemplate for flowchart-delay
 * Generated from TypeRegistry entry: flowchart:delay
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const flowchartDelayTemplate: NodeTemplate = {
  "id": "flowchart-delay",
  "version": "1.0.0",
  "meta": {
    "name": "Delay",
    "description": "Delay or wait step",
    "category": "workflow",
    "tags": [
      "operation",
      "delay",
      "wait",
      "pause",
      "flowchart"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "flowchart:delay",
    "size": {
      "width": 120,
      "height": 60,
      "minWidth": 80,
      "maxWidth": 250,
      "minHeight": 50,
      "maxHeight": 150
    },
    "shape": {
      "type": "rect",
      "fill": "#FFEBEE",
      "stroke": "#C62828",
      "strokeWidth": 2,
      "opacity": 1,
      "cornerRadius": 15
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"flowchart-delay-content\">\n          <div class=\"node-label\">{{data.label || 'Delay'}}</div>\n        </div>",
      "className": "flowchart-delay",
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
    "label": "Delay"
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
