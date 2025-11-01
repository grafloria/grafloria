/**
 * Auto-generated NodeTemplate for flowchart-summing-junction
 * Generated from TypeRegistry entry: flowchart:summing-junction
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const flowchartSummingJunctionTemplate: NodeTemplate = {
  "id": "flowchart-summing-junction",
  "version": "1.0.0",
  "meta": {
    "name": "Summing Junction",
    "description": "Summing junction for combining flows",
    "category": "workflow",
    "tags": [
      "flow-control",
      "sum",
      "combine",
      "junction",
      "flowchart"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "flowchart:summing-junction",
    "size": {
      "width": 120,
      "height": 80,
      "minWidth": 80,
      "maxWidth": 250,
      "minHeight": 50,
      "maxHeight": 150
    },
    "shape": {
      "type": "rect",
      "fill": "#E0F2F1",
      "stroke": "#00695C",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"flowchart-summing-junction-content\">\n          <div class=\"node-label\">{{data.label || 'Summing Junction'}}</div>\n        </div>",
      "className": "flowchart-summing-junction",
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
      "resizable": false,
      "deletable": true
    }
  },
  "defaultData": {
    "label": "Summing Junction"
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
