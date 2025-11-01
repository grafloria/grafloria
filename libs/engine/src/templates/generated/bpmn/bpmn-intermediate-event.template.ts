/**
 * Auto-generated NodeTemplate for bpmn-intermediate-event
 * Generated from TypeRegistry entry: bpmn:intermediate-event
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnIntermediateEventTemplate: NodeTemplate = {
  "id": "bpmn-intermediate-event",
  "version": "1.0.0",
  "meta": {
    "name": "Intermediate Event",
    "description": "Event that occurs during process execution",
    "category": "workflow",
    "tags": [
      "event",
      "intermediate",
      "catching",
      "throwing",
      "bpmn"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:intermediate-event",
    "size": {
      "width": 36,
      "height": 36,
      "minWidth": 80,
      "maxWidth": 300,
      "minHeight": 60,
      "maxHeight": 200
    },
    "shape": {
      "type": "circle",
      "fill": "#FFF9C4",
      "stroke": "#F57F17",
      "strokeWidth": 3,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"bpmn-intermediate-event-content\">\n          <div class=\"node-label\">{{data.label || 'Intermediate Event'}}</div>\n        </div>",
      "className": "bpmn-intermediate-event",
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
      "top": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "right": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "bottom": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
      },
      "left": {
        "enabled": true,
        "type": "bi",
        "maxConnections": undefined
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
    "label": "Intermediate Event"
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
