// flowchart.ts - Flowchart type library

import type { TypeRegistry } from '../../validation/TypeRegistry';

/**
 * Flowchart node type identifiers
 */
export const FlowchartTypes = {
  PROCESS: 'flowchart:process',
  DECISION: 'flowchart:decision',
  TERMINAL: 'flowchart:terminal',
  DATA: 'flowchart:data',
  DOCUMENT: 'flowchart:document',
  CONNECTOR: 'flowchart:connector',
  DELAY: 'flowchart:delay',
  MANUAL_INPUT: 'flowchart:manual-input',
  MANUAL_OPERATION: 'flowchart:manual-operation',

  // Phase 3: Extended Flowchart Elements
  PREDEFINED_PROCESS: 'flowchart:predefined-process',
  STORED_DATA: 'flowchart:stored-data',
  DISPLAY: 'flowchart:display',
  PREPARATION: 'flowchart:preparation',
  MERGE: 'flowchart:merge',
  OR: 'flowchart:or',
  SUMMING_JUNCTION: 'flowchart:summing-junction',
} as const;

/**
 * Register all flowchart types with the type registry
 */
export function registerFlowchartTypes(registry: TypeRegistry): void {
  // Process - Rectangle for operations/steps
  registry.registerNodeType({
    type: FlowchartTypes.PROCESS,
    label: 'Process',
    description: 'A process or operation step',
    category: 'flowchart',
    family: 'operation',
    tags: ['operation', 'step', 'action'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'rectangle',
      fill: '#E3F2FD',
      stroke: '#1976D2',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Decision - Diamond for conditional logic
  registry.registerNodeType({
    type: FlowchartTypes.DECISION,
    label: 'Decision',
    description: 'A decision or conditional branch point',
    category: 'flowchart',
    family: 'control-flow',
    tags: ['control-flow', 'decision', 'conditional', 'branch'],
    minPorts: 0,
    maxPorts: 10, // Multiple outputs for different branches
    defaultSize: {
      width: 100,
      height: 100,
    },
    defaultStyle: {
      shape: 'diamond',
      fill: '#FFF3E0',
      stroke: '#F57C00',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Terminal - Rounded rectangle for start/end
  registry.registerNodeType({
    type: FlowchartTypes.TERMINAL,
    label: 'Terminal',
    description: 'Start or end point of a flow',
    category: 'flowchart',
    family: 'terminal',
    tags: ['terminal', 'start', 'end', 'boundary'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 120,
      height: 50,
    },
    defaultStyle: {
      shape: 'rounded-rectangle',
      fill: '#E8F5E9',
      stroke: '#388E3C',
      strokeWidth: 2,
      borderRadius: 25,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Data - Parallelogram for data I/O
  registry.registerNodeType({
    type: FlowchartTypes.DATA,
    label: 'Data',
    description: 'Data input or output',
    category: 'flowchart',
    family: 'data',
    tags: ['data', 'io', 'input', 'output'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'parallelogram',
      fill: '#F3E5F5',
      stroke: '#7B1FA2',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Document - Rectangle with wavy bottom
  registry.registerNodeType({
    type: FlowchartTypes.DOCUMENT,
    label: 'Document',
    description: 'Document or report',
    category: 'flowchart',
    family: 'data',
    tags: ['data', 'document', 'output', 'report'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 120,
      height: 70,
    },
    defaultStyle: {
      shape: 'document',
      fill: '#FFF9C4',
      stroke: '#F57F17',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Connector - Small circle for connecting flows
  registry.registerNodeType({
    type: FlowchartTypes.CONNECTOR,
    label: 'Connector',
    description: 'Flow connector or reference point',
    category: 'flowchart',
    family: 'connector',
    tags: ['connector', 'reference', 'junction'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 40,
      height: 40,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#FFFFFF',
      stroke: '#757575',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Delay - Rounded rectangle with delay symbol
  registry.registerNodeType({
    type: FlowchartTypes.DELAY,
    label: 'Delay',
    description: 'Delay or wait step',
    category: 'flowchart',
    family: 'operation',
    tags: ['operation', 'delay', 'wait', 'pause'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'rounded-rectangle',
      fill: '#FFEBEE',
      stroke: '#C62828',
      strokeWidth: 2,
      borderRadius: 15,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Manual Input - Parallelogram with flat top
  registry.registerNodeType({
    type: FlowchartTypes.MANUAL_INPUT,
    label: 'Manual Input',
    description: 'Manual input or data entry',
    category: 'flowchart',
    family: 'input',
    tags: ['input', 'manual', 'data-entry', 'user-input'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'parallelogram-top',
      fill: '#E0F7FA',
      stroke: '#00838F',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Manual Operation - Trapezoid
  registry.registerNodeType({
    type: FlowchartTypes.MANUAL_OPERATION,
    label: 'Manual Operation',
    description: 'Manual operation or task',
    category: 'flowchart',
    family: 'operation',
    tags: ['operation', 'manual', 'task'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'trapezoid',
      fill: '#FCE4EC',
      stroke: '#C2185B',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // === Phase 3: Extended Flowchart Elements ===

  // Predefined Process - Rectangle with double-struck vertical edges
  registry.registerNodeType({
    type: FlowchartTypes.PREDEFINED_PROCESS,
    label: 'Predefined Process',
    description: 'A predefined process or subroutine',
    extends: FlowchartTypes.PROCESS,
    category: 'flowchart',
    family: 'operation',
    tags: ['operation', 'subroutine', 'predefined', 'module'],
    defaultStyle: {
      strokeWidth: 3,
    },
  });

  // Stored Data - Cylinder for database/storage
  registry.registerNodeType({
    type: FlowchartTypes.STORED_DATA,
    label: 'Stored Data',
    description: 'Stored data, database, or file',
    extends: FlowchartTypes.DATA,
    category: 'flowchart',
    family: 'data',
    tags: ['data', 'storage', 'database', 'file'],
    defaultSize: {
      width: 120,
      height: 70,
    },
    defaultStyle: {
      shape: 'cylinder',
      fill: '#E8F5E9',
      stroke: '#388E3C',
    },
  });

  // Display - Monitor/screen shape
  registry.registerNodeType({
    type: FlowchartTypes.DISPLAY,
    label: 'Display',
    description: 'Display or output to screen',
    category: 'flowchart',
    family: 'data',
    tags: ['data', 'display', 'output', 'screen'],
    minPorts: 0,
    maxPorts: 6,
    defaultSize: {
      width: 120,
      height: 80,
    },
    defaultStyle: {
      shape: 'rounded-rectangle',
      fill: '#F3E5F5',
      stroke: '#7B1FA2',
      strokeWidth: 2,
      borderRadius: 15,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Preparation - Hexagon
  registry.registerNodeType({
    type: FlowchartTypes.PREPARATION,
    label: 'Preparation',
    description: 'Preparation or initialization step',
    category: 'flowchart',
    family: 'operation',
    tags: ['operation', 'preparation', 'initialization', 'setup'],
    minPorts: 0,
    maxPorts: 8,
    defaultSize: {
      width: 140,
      height: 60,
    },
    defaultStyle: {
      shape: 'hexagon',
      fill: '#FFF3E0',
      stroke: '#F57C00',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Merge - Inverted triangle for merging flows
  registry.registerNodeType({
    type: FlowchartTypes.MERGE,
    label: 'Merge',
    description: 'Merge multiple flows into one',
    category: 'flowchart',
    family: 'flow-control',
    tags: ['flow-control', 'merge', 'join'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 80,
      height: 70,
    },
    defaultStyle: {
      shape: 'triangle',
      fill: '#E8F5E9',
      stroke: '#388E3C',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // OR - Circle for OR logic
  registry.registerNodeType({
    type: FlowchartTypes.OR,
    label: 'OR',
    description: 'Logical OR operation',
    category: 'flowchart',
    family: 'flow-control',
    tags: ['flow-control', 'or', 'logic'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 60,
      height: 60,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#FFF9C4',
      stroke: '#F57F17',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Summing Junction - Circle with X for summing
  registry.registerNodeType({
    type: FlowchartTypes.SUMMING_JUNCTION,
    label: 'Summing Junction',
    description: 'Summing junction for combining flows',
    extends: FlowchartTypes.OR,
    category: 'flowchart',
    family: 'flow-control',
    tags: ['flow-control', 'sum', 'combine', 'junction'],
    defaultStyle: {
      fill: '#E0F2F1',
      stroke: '#00695C',
    },
  });
}
