// bpmn.ts - BPMN (Business Process Model and Notation) type library

import type { TypeRegistry } from '../../validation/TypeRegistry';

/**
 * BPMN node type identifiers
 */
export const BPMNTypes = {
  // Activities (Tasks)
  TASK: 'bpmn:task',
  USER_TASK: 'bpmn:user-task',
  SERVICE_TASK: 'bpmn:service-task',
  MANUAL_TASK: 'bpmn:manual-task',
  BUSINESS_RULE_TASK: 'bpmn:business-rule-task',
  SCRIPT_TASK: 'bpmn:script-task',

  // Gateways
  EXCLUSIVE_GATEWAY: 'bpmn:exclusive-gateway',
  PARALLEL_GATEWAY: 'bpmn:parallel-gateway',
  INCLUSIVE_GATEWAY: 'bpmn:inclusive-gateway',

  // Events
  START_EVENT: 'bpmn:start-event',
  END_EVENT: 'bpmn:end-event',
  INTERMEDIATE_EVENT: 'bpmn:intermediate-event',
  MESSAGE_EVENT: 'bpmn:message-event',
  TIMER_EVENT: 'bpmn:timer-event',
  ERROR_EVENT: 'bpmn:error-event',
} as const;

/**
 * Register all BPMN types with the type registry
 */
export function registerBPMNTypes(registry: TypeRegistry): void {
  // Base Task - Rounded rectangle for activities
  registry.registerNodeType({
    type: BPMNTypes.TASK,
    label: 'Task',
    description: 'A generic task or activity',
    category: 'bpmn',
    family: 'activity',
    tags: ['activity', 'task', 'work'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 120,
      height: 80,
    },
    defaultStyle: {
      shape: 'rounded-rectangle',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 2,
      borderRadius: 8,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // User Task - Task performed by a human
  registry.registerNodeType({
    type: BPMNTypes.USER_TASK,
    label: 'User Task',
    description: 'A task performed by a human user',
    extends: BPMNTypes.TASK,
    tags: ['task', 'user', 'manual', 'human'],
    defaultStyle: {
      fill: '#E3F2FD', // Light blue
    },
  });

  // Service Task - Automated service/system task
  registry.registerNodeType({
    type: BPMNTypes.SERVICE_TASK,
    label: 'Service Task',
    description: 'A task performed by an automated service',
    extends: BPMNTypes.TASK,
    tags: ['task', 'service', 'automated', 'system'],
    defaultStyle: {
      fill: '#E8F5E9', // Light green
    },
  });

  // Manual Task - Physical task outside the system
  registry.registerNodeType({
    type: BPMNTypes.MANUAL_TASK,
    label: 'Manual Task',
    description: 'A manual task performed outside the system',
    extends: BPMNTypes.TASK,
    tags: ['task', 'manual', 'user', 'physical'],
    defaultStyle: {
      fill: '#FFF3E0', // Light orange
    },
  });

  // Business Rule Task - Task using business rules engine
  registry.registerNodeType({
    type: BPMNTypes.BUSINESS_RULE_TASK,
    label: 'Business Rule Task',
    description: 'A task that executes business rules',
    extends: BPMNTypes.TASK,
    tags: ['task', 'rules', 'automated', 'decision'],
    defaultStyle: {
      fill: '#F3E5F5', // Light purple
    },
  });

  // Script Task - Task that executes a script
  registry.registerNodeType({
    type: BPMNTypes.SCRIPT_TASK,
    label: 'Script Task',
    description: 'A task that executes a script',
    extends: BPMNTypes.TASK,
    tags: ['task', 'script', 'automated', 'code'],
    defaultStyle: {
      fill: '#FCE4EC', // Light pink
    },
  });

  // Exclusive Gateway (XOR) - Choose one path
  registry.registerNodeType({
    type: BPMNTypes.EXCLUSIVE_GATEWAY,
    label: 'Exclusive Gateway',
    description: 'A gateway that selects one outgoing path (XOR)',
    category: 'bpmn',
    family: 'gateway',
    tags: ['gateway', 'xor', 'decision', 'exclusive'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 50,
      height: 50,
    },
    defaultStyle: {
      shape: 'diamond',
      fill: '#FFF9C4', // Light yellow
      stroke: '#F57F17',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Parallel Gateway (AND) - Fork/Join all paths
  registry.registerNodeType({
    type: BPMNTypes.PARALLEL_GATEWAY,
    label: 'Parallel Gateway',
    description: 'A gateway that forks or joins all paths (AND)',
    category: 'bpmn',
    family: 'gateway',
    tags: ['gateway', 'and', 'parallel', 'fork', 'join'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 50,
      height: 50,
    },
    defaultStyle: {
      shape: 'diamond',
      fill: '#E0F7FA', // Light cyan
      stroke: '#00838F',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Inclusive Gateway (OR) - Select one or more paths
  registry.registerNodeType({
    type: BPMNTypes.INCLUSIVE_GATEWAY,
    label: 'Inclusive Gateway',
    description: 'A gateway that selects one or more paths (OR)',
    category: 'bpmn',
    family: 'gateway',
    tags: ['gateway', 'or', 'inclusive'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 50,
      height: 50,
    },
    defaultStyle: {
      shape: 'diamond',
      fill: '#F3E5F5', // Light purple
      stroke: '#7B1FA2',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Start Event - Process start
  registry.registerNodeType({
    type: BPMNTypes.START_EVENT,
    label: 'Start Event',
    description: 'Event that starts a process',
    category: 'bpmn',
    family: 'event',
    tags: ['event', 'start', 'begin'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 36,
      height: 36,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#E8F5E9', // Light green
      stroke: '#388E3C',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // End Event - Process end
  registry.registerNodeType({
    type: BPMNTypes.END_EVENT,
    label: 'End Event',
    description: 'Event that ends a process',
    category: 'bpmn',
    family: 'event',
    tags: ['event', 'end', 'terminate'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 36,
      height: 36,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#FFEBEE', // Light red
      stroke: '#C62828',
      strokeWidth: 4, // Thicker border for end events
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Intermediate Event - Event during process
  registry.registerNodeType({
    type: BPMNTypes.INTERMEDIATE_EVENT,
    label: 'Intermediate Event',
    description: 'Event that occurs during process execution',
    category: 'bpmn',
    family: 'event',
    tags: ['event', 'intermediate', 'catching', 'throwing'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 36,
      height: 36,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#FFF9C4', // Light yellow
      stroke: '#F57F17',
      strokeWidth: 3, // Double circle effect
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Message Event - Message-based event
  registry.registerNodeType({
    type: BPMNTypes.MESSAGE_EVENT,
    label: 'Message Event',
    description: 'Event triggered by a message',
    extends: BPMNTypes.INTERMEDIATE_EVENT,
    tags: ['event', 'message', 'communication'],
    defaultStyle: {
      fill: '#E3F2FD', // Light blue
    },
  });

  // Timer Event - Time-based event
  registry.registerNodeType({
    type: BPMNTypes.TIMER_EVENT,
    label: 'Timer Event',
    description: 'Event triggered by a timer',
    extends: BPMNTypes.INTERMEDIATE_EVENT,
    tags: ['event', 'timer', 'time', 'schedule'],
    defaultStyle: {
      fill: '#FFF3E0', // Light orange
    },
  });

  // Error Event - Error handling event
  registry.registerNodeType({
    type: BPMNTypes.ERROR_EVENT,
    label: 'Error Event',
    description: 'Event for error handling',
    extends: BPMNTypes.INTERMEDIATE_EVENT,
    tags: ['event', 'error', 'exception', 'fault'],
    defaultStyle: {
      fill: '#FFCDD2', // Light red
      stroke: '#D32F2F',
    },
  });
}
