/**
 * Auto-generated NodeTemplate for bpmn-timer-event
 * Generated from TypeRegistry entry: bpmn:timer-event
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnTimerEventTemplate: NodeTemplate = {
  "id": "bpmn-timer-event",
  "version": "1.0.0",
  "meta": {
    "name": "Timer Event",
    "description": "Event triggered by a timer",
    "category": "common",
    "tags": [
      "event",
      "timer",
      "time",
      "schedule"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:timer-event",
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
      "template": "<div class=\"bpmn-timer-event-content\">\n          <div class=\"node-label\">{{data.label || 'Timer Event'}}</div>\n        </div>",
      "className": "bpmn-timer-event",
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
    "label": "Timer Event"
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
