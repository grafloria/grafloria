/**
 * Auto-generated NodeTemplate for uml-activity-partition
 * Generated from TypeRegistry entry: uml:activity-partition
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const umlActivityPartitionTemplate: NodeTemplate = {
  "id": "uml-activity-partition",
  "version": "1.0.0",
  "meta": {
    "name": "Activity Partition",
    "description": "A swimlane for organizing activities by responsibility",
    "category": "diagram",
    "tags": [
      "activity",
      "partition",
      "swimlane",
      "responsibility",
      "container",
      "uml"
    ],
    "author": "Auto-Generated"
  },
  "structure": {
    "type": "uml:activity-partition",
    "size": {
      "width": 200,
      "height": 400,
      "minWidth": 120,
      "maxWidth": 400,
      "minHeight": 80,
      "maxHeight": 600
    },
    "shape": {
      "type": "rect",
      "fill": "transparent",
      "stroke": "#9E9E9E",
      "strokeWidth": 2,
      "opacity": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class=\"uml-activity-partition-content\">\n          <div class=\"node-label\">{{data.label || 'Activity Partition'}}</div>\n        </div>",
      "className": "uml-activity-partition",
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
    "label": "Activity Partition"
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
