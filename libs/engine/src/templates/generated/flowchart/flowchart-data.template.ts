/**
 * Auto-generated NodeTemplate for flowchart-data
 * Generated from TypeRegistry entry: flowchart:data
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const flowchartDataTemplate: NodeTemplate = {
  "id": "flowchart-data",
  "version": "1.0.0",
  "meta": {
    "name": "Data",
    "description": "Data input or output",
    "category": "workflow",
    "tags": [
      "data",
      "io",
      "input",
      "output",
      "flowchart"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "flowchart:data",
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
      "fill": "#F3E5F5",
      "stroke": "#7B1FA2",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"flowchart-data-content\">\n          <div class=\"node-label\">{{data.label || 'Data'}}</div>\n        </div>",
      "className": "flowchart-data",
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
    "label": "Data"
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
