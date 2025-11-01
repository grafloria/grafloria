/**
 * Auto-generated NodeTemplate for bpmn-task
 * Generated from TypeRegistry entry: bpmn:task
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnTaskTemplate: NodeTemplate = {
  "id": "bpmn-task",
  "version": "1.0.0",
  "meta": {
    "name": "Task",
    "description": "A generic task or activity",
    "category": "workflow",
    "tags": [
      "activity",
      "task",
      "work",
      "bpmn"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:task",
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
      "fill": "#FFFFFF",
      "stroke": "#000000",
      "strokeWidth": 2,
      "opacity": 1,
      "cornerRadius": 8
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"bpmn-task-content\">\n          <div class=\"node-label\">{{data.label || 'Task'}}</div>\n        </div>",
      "className": "bpmn-task",
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
    "label": "Task"
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "default": "Task"
      },
      "taskType": {
        "type": "string",
        "enum": [
          "task",
          "user",
          "service",
          "manual",
          "script",
          "business-rule"
        ]
      },
      "assignee": {
        "type": "string"
      },
      "candidateGroups": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "dueDate": {
        "type": "string",
        "format": "date-time"
      },
      "priority": {
        "type": "number",
        "minimum": 0,
        "maximum": 10
      }
    },
    "required": [
      "label"
    ]
  }
};
