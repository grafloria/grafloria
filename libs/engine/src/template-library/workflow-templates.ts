/**
 * Workflow Node Templates (Phase 4)
 * Pre-built templates for workflow and process diagrams
 */

import type { NodeTemplate } from '../templates/NodeTemplate';

/**
 * Flexible template type with additional convenience properties
 * Makes NodeTemplate properties optional and adds convenience fields
 */
type FlexibleTemplate = Partial<NodeTemplate> & {
  id: string; // ID is always required
  structure: NodeTemplate['structure']; // structure is always required
  name?: string;
  description?: string;
  category?: string;
};

/**
 * Process Step Template
 * Rectangular process box for workflow diagrams
 */
export const ProcessStepTemplate: FlexibleTemplate = {
  id: 'process-step',
  name: 'Process Step',
  description: 'Standard process step for flowcharts',
  category: 'workflow',

  structure: {
    type: 'process',
    size: { width: 180, height: 80 },

    shape: {
      type: 'rect',
      cornerRadius: 4,
      fill: '#e3f2fd',
      stroke: '#2196f3',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="process-step">
          <div class="process-title">{{data.title}}</div>
          <div class="process-description">{{data.description}}</div>
        </div>
      `,
      className: 'node-process',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      },
      events: {
        click: 'process:clicked',
        dblclick: 'process:edited',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    title: 'Process Step',
    description: 'Description',
    duration: '',
    owner: '',
  },
};

/**
 * Decision Node Template
 * Diamond-shaped decision point
 */
export const DecisionNodeTemplate: FlexibleTemplate = {
  id: 'decision-node',
  name: 'Decision Node',
  description: 'Diamond-shaped decision point for branching logic',
  category: 'workflow',

  structure: {
    type: 'decision',
    size: { width: 120, height: 120 },

    shape: {
      type: 'diamond',
      fill: '#fff3e0',
      stroke: '#ff9800',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="decision-node">
          <div class="decision-question">{{data.question}}</div>
        </div>
      `,
      className: 'node-decision',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontWeight: '600',
        textAlign: 'center',
      },
      events: {
        click: 'decision:clicked',
        dblclick: 'decision:edited',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    question: 'Condition?',
    type: 'boolean', // boolean, multi-choice
  },
};

/**
 * Start Event Template
 * Circle indicating workflow start
 */
export const StartEventTemplate: FlexibleTemplate = {
  id: 'start-event',
  name: 'Start Event',
  description: 'Circle node marking the start of a workflow',
  category: 'workflow',

  structure: {
    type: 'start',
    size: { width: 60, height: 60 },

    shape: {
      type: 'circle',
      fill: '#e8f5e9',
      stroke: '#4caf50',
      strokeWidth: 3,
    },

    html: {
      mode: 'template',
      template: `
        <div class="start-event">
          <span class="start-icon">▶</span>
        </div>
      `,
      className: 'node-start',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: '20px',
        color: '#4caf50',
      },
      events: {
        click: 'start:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      right: { enabled: true },
      bottom: { enabled: true },
    },
  },

  defaultData: {
    label: 'Start',
    trigger: 'manual', // manual, scheduled, event
  },
};

/**
 * End Event Template
 * Circle indicating workflow end
 */
export const EndEventTemplate: FlexibleTemplate = {
  id: 'end-event',
  name: 'End Event',
  description: 'Circle node marking the end of a workflow',
  category: 'workflow',

  structure: {
    type: 'end',
    size: { width: 60, height: 60 },

    shape: {
      type: 'circle',
      fill: '#ffebee',
      stroke: '#f44336',
      strokeWidth: 3,
    },

    html: {
      mode: 'template',
      template: `
        <div class="end-event">
          <span class="end-icon">■</span>
        </div>
      `,
      className: 'node-end',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: '20px',
        color: '#f44336',
      },
      events: {
        click: 'end:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      top: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    label: 'End',
    result: 'success', // success, failure, cancel
  },
};

/**
 * Subprocess Template
 * Rounded rectangle for subprocess
 */
export const SubprocessTemplate: FlexibleTemplate = {
  id: 'subprocess',
  name: 'Subprocess',
  description: 'Subprocess or grouped activity',
  category: 'workflow',

  structure: {
    type: 'subprocess',
    size: { width: 200, height: 100 },

    shape: {
      type: 'rect',
      cornerRadius: 12,
      fill: '#f3e5f5',
      stroke: '#9c27b0',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="subprocess">
          <div class="subprocess-icon">⊞</div>
          <div class="subprocess-title">{{data.title}}</div>
          <div class="subprocess-count">{{data.stepCount}} steps</div>
        </div>
      `,
      className: 'node-subprocess',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      },
      events: {
        click: 'subprocess:clicked',
        dblclick: 'subprocess:expanded',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    title: 'Subprocess',
    stepCount: 0,
    collapsed: true,
  },
};

/**
 * Gateway Template
 * Diamond for parallel/exclusive gateways
 */
export const GatewayTemplate: FlexibleTemplate = {
  id: 'gateway',
  name: 'Gateway',
  description: 'Gateway for splitting/joining workflow paths',
  category: 'workflow',

  structure: {
    type: 'gateway',
    size: { width: 80, height: 80 },

    shape: {
      type: 'diamond',
      fill: '#fffde7',
      stroke: '#fbc02d',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="gateway">
          <span class="gateway-icon">{{data.icon}}</span>
        </div>
      `,
      className: 'node-gateway',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: '24px',
        fontWeight: 'bold',
      },
      events: {
        click: 'gateway:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    type: 'parallel', // parallel (+), exclusive (×), inclusive (○)
    icon: '+',
  },
};

/**
 * Activity Template
 * Rounded rectangle for activity/task
 */
export const ActivityTemplate: FlexibleTemplate = {
  id: 'activity',
  name: 'Activity',
  description: 'Activity or task in a workflow',
  category: 'workflow',

  structure: {
    type: 'activity',
    size: { width: 160, height: 70 },

    shape: {
      type: 'rect',
      cornerRadius: 8,
      fill: '#e1f5fe',
      stroke: '#0288d1',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="activity">
          <div class="activity-icon">{{data.icon}}</div>
          <div class="activity-name">{{data.name}}</div>
        </div>
      `,
      className: 'node-activity',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
      },
      events: {
        click: 'activity:clicked',
        dblclick: 'activity:edited',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'always',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    name: 'Activity',
    icon: '📋',
    type: 'user', // user, service, script
    assignee: '',
  },
};

/**
 * Export all workflow templates
 */
export const WorkflowTemplates = {
  ProcessStep: ProcessStepTemplate,
  DecisionNode: DecisionNodeTemplate,
  StartEvent: StartEventTemplate,
  EndEvent: EndEventTemplate,
  Subprocess: SubprocessTemplate,
  Gateway: GatewayTemplate,
  Activity: ActivityTemplate,
};
