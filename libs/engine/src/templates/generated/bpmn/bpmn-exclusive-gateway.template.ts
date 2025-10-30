/**
 * Auto-generated NodeTemplate for bpmn-exclusive-gateway
 * Generated from TypeRegistry entry: bpmn:exclusive-gateway
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnExclusiveGatewayTemplate: NodeTemplate = {
  "id": "bpmn-exclusive-gateway",
  "version": "1.0.0",
  "meta": {
    "name": "Exclusive Gateway",
    "description": "A gateway that selects one outgoing path (XOR)",
    "category": "workflow",
    "tags": [
      "gateway",
      "xor",
      "decision",
      "exclusive",
      "bpmn"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:exclusive-gateway",
    "size": {
      "width": 50,
      "height": 50,
      "minWidth": 80,
      "maxWidth": 300,
      "minHeight": 60,
      "maxHeight": 200
    },
    "shape": {
      "type": "diamond",
      "fill": "#FFF9C4",
      "stroke": "#F57F17",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"bpmn-exclusive-gateway-content\">\n          <div class=\"node-label\">{{data.label || 'Exclusive Gateway'}}</div>\n        </div>",
      "className": "bpmn-exclusive-gateway",
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
          "fill": "#F57C00",
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
        "type": "output",
        "maxConnections": null
      },
      "bottom": {
        "enabled": true,
        "type": "output",
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
    "label": "Exclusive Gateway"
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
