/**
 * Auto-generated NodeTemplate for flowchart-process
 * Generated from TypeRegistry entry: flowchart:process
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const flowchartProcessTemplate: NodeTemplate = {
  "id": "flowchart-process",
  "version": "1.0.0",
  "meta": {
    "name": "Process",
    "description": "A process or operation step",
    "category": "workflow",
    "tags": [
      "operation",
      "step",
      "action",
      "flowchart"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "flowchart:process",
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
      "fill": "#E3F2FD",
      "stroke": "#1976D2",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"flowchart-process-content\">\n          <div class=\"node-label\">{{data.label || 'Process'}}</div>\n        </div>",
      "className": "flowchart-process",
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
    "label": "Process"
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
