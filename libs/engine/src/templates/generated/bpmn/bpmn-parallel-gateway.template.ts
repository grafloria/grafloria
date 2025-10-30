/**
 * Auto-generated NodeTemplate for bpmn-parallel-gateway
 * Generated from TypeRegistry entry: bpmn:parallel-gateway
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const bpmnParallelGatewayTemplate: NodeTemplate = {
  "id": "bpmn-parallel-gateway",
  "version": "1.0.0",
  "meta": {
    "name": "Parallel Gateway",
    "description": "A gateway that forks or joins all paths (AND)",
    "category": "workflow",
    "tags": [
      "gateway",
      "and",
      "parallel",
      "fork",
      "join",
      "bpmn"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "bpmn:parallel-gateway",
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
      "fill": "#E0F7FA",
      "stroke": "#00838F",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"bpmn-parallel-gateway-content\">\n          <div class=\"node-label\">{{data.label || 'Parallel Gateway'}}</div>\n        </div>",
      "className": "bpmn-parallel-gateway",
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
    "label": "Parallel Gateway"
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
