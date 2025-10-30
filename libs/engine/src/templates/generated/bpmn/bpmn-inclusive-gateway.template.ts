/**
 * Auto-generated NodeTemplate for bpmn-inclusive-gateway
 * Generated from TypeRegistry entry: bpmn:inclusive-gateway
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnInclusiveGatewayTemplate: NodeTemplate = {
  "id": "bpmn-inclusive-gateway",
  "version": "1.0.0",
  "meta": {
    "name": "Inclusive Gateway",
    "description": "A gateway that selects one or more paths (OR)",
    "category": "workflow",
    "tags": [
      "gateway",
      "or",
      "inclusive",
      "bpmn"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:inclusive-gateway",
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
      "fill": "#F3E5F5",
      "stroke": "#7B1FA2",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"bpmn-inclusive-gateway-content\">\n          <div class=\"node-label\">{{data.label || 'Inclusive Gateway'}}</div>\n        </div>",
      "className": "bpmn-inclusive-gateway",
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
    "label": "Inclusive Gateway"
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
