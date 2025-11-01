/**
 * Auto-generated NodeTemplate for flowchart-manual-operation
 * Generated from TypeRegistry entry: flowchart:manual-operation
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const flowchartManualOperationTemplate: NodeTemplate = {
  "id": "flowchart-manual-operation",
  "version": "1.0.0",
  "meta": {
    "name": "Manual Operation",
    "description": "Manual operation or task",
    "category": "workflow",
    "tags": [
      "operation",
      "manual",
      "task",
      "flowchart"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "flowchart:manual-operation",
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
      "fill": "#FCE4EC",
      "stroke": "#C2185B",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"flowchart-manual-operation-content\">\n          <div class=\"node-label\">{{data.label || 'Manual Operation'}}</div>\n        </div>",
      "className": "flowchart-manual-operation",
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
    "label": "Manual Operation"
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
