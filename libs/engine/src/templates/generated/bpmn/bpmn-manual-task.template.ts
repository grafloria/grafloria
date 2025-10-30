/**
 * Auto-generated NodeTemplate for bpmn-manual-task
 * Generated from TypeRegistry entry: bpmn:manual-task
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnManualTaskTemplate: NodeTemplate = {
  "id": "bpmn-manual-task",
  "version": "1.0.0",
  "meta": {
    "name": "Manual Task",
    "description": "A manual task performed outside the system",
    "category": "common",
    "tags": [
      "task",
      "manual",
      "user",
      "physical"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:manual-task",
    "size": {
      "width": 120,
      "height": 80,
      "minWidth": 80,
      "maxWidth": 300,
      "minHeight": 60,
      "maxHeight": 200
    },
    "shape": {
      "type": "rect",
      "fill": "#FFF3E0",
      "stroke": "#000000",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"bpmn-manual-task-content\">\n          <div class=\"node-label\">{{data.label || 'Manual Task'}}</div>\n        </div>",
      "className": "bpmn-manual-task",
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
    "label": "Manual Task"
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
