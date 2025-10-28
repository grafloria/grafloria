/**
 * Dynamic Rendering Examples
 * Demonstrates both HTML :loop and NodeModel repeater approaches
 */

import type { NodeTemplate } from '../templates/NodeTemplate';

/**
 * ====================================================================
 * APPROACH 1: HTML Template with :loop (Display-Only)
 * ====================================================================
 * Use when: Pure visualization, no item-level interaction needed
 */

/**
 * Dashboard Metrics Card - HTML :loop Example
 * Displays a list of KPIs using LemonadeJS :loop attribute
 * Perfect for dashboards, reports, and read-only data displays
 */
export const DashboardMetricsCard: NodeTemplate = {
  id: 'dashboard-metrics-html',
  version: '1.0.0',
  meta: {
    name: 'Dashboard Metrics (HTML)',
    description: 'Display-only metrics dashboard using HTML :loop',
    category: 'dashboard',
    tags: ['dashboard', 'metrics', 'html', 'display-only'],
  },
  structure: {
    type: 'dashboard-card',
    size: { width: 400, height: 300 },

    html: {
      mode: 'template',
      template: `
        <div class="dashboard-card">
          <div class="dashboard-header">
            <h3>{{data.title}}</h3>
            <span class="dashboard-subtitle">{{data.subtitle}}</span>
          </div>

          <div class="metrics-grid" :loop="\${this.data.metrics}">
            <div class="metric-card">
              <div class="metric-icon">{{self.icon}}</div>
              <div class="metric-content">
                <div class="metric-label">{{self.label}}</div>
                <div class="metric-value">{{self.value}}</div>
                <div class="metric-trend {{#self.isPositive}}trend-up{{/self.isPositive}}{{^self.isPositive}}trend-down{{/self.isPositive}}">
                  {{self.change}}
                </div>
              </div>
            </div>
          </div>

          <div class="dashboard-footer">
            Last updated: {{data.lastUpdated}}
          </div>
        </div>
      `,
      className: 'grafloria-dashboard-node',
      style: {
        padding: '16px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      },
    },

    // Container-level port for connecting to other dashboard nodes
    ports: {
      enabled: true,
      right: { enabled: true, type: 'output' },
    }
  },
  defaultData: {
    title: 'Sales Overview',
    subtitle: 'Q4 2024',
    lastUpdated: '5 minutes ago',
    metrics: [
      { icon: '💰', label: 'Revenue', value: '$1.2M', change: '+12%', isPositive: true },
      { icon: '📦', label: 'Orders', value: '3,456', change: '+8%', isPositive: true },
      { icon: '💳', label: 'Avg Order', value: '$347', change: '-2%', isPositive: false },
      { icon: '👥', label: 'Customers', value: '2,103', change: '+15%', isPositive: true },
    ]
  }
};

/**
 * Activity Log - HTML :loop Example
 * Displays a scrollable list of activities
 */
export const ActivityLog: NodeTemplate = {
  id: 'activity-log-html',
  version: '1.0.0',
  meta: {
    name: 'Activity Log (HTML)',
    description: 'Scrollable activity feed using HTML :loop',
    category: 'monitoring',
    tags: ['log', 'activity', 'html', 'monitoring'],
  },
  structure: {
    type: 'activity-log',
    size: { width: 350, height: 400 },

    html: {
      mode: 'template',
      template: `
        <div class="activity-log">
          <div class="log-header">
            <h4>{{data.title}}</h4>
          </div>

          <div class="log-entries" :loop="\${this.data.activities}">
            <div class="log-entry">
              <div class="log-time">{{self.timestamp}}</div>
              <div class="log-message">
                <span class="log-user">{{self.user}}</span>
                <span class="log-action">{{self.action}}</span>
              </div>
              <div class="log-status {{self.status}}">{{self.status}}</div>
            </div>
          </div>
        </div>
      `,
      className: 'grafloria-activity-log',
      style: {
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
      }
    }
  },
  defaultData: {
    title: 'Recent Activity',
    activities: [
      { timestamp: '10:45 AM', user: 'John', action: 'deployed app', status: 'success' },
      { timestamp: '10:32 AM', user: 'Sarah', action: 'merged PR #123', status: 'success' },
      { timestamp: '10:15 AM', user: 'Mike', action: 'failed build', status: 'error' },
    ]
  }
};

/**
 * ====================================================================
 * APPROACH 2: NodeModel Repeater (Interactive)
 * ====================================================================
 * Use when: Items need ports, draggable, selectable, or complex interaction
 */

/**
 * ERD Table - NodeModel Repeater Example
 * Creates actual NodeModel instances for each field with ports
 * Essential for database design tools where fields connect to each other
 */
export const ERDTableDynamic: NodeTemplate = {
  id: 'erd-table-dynamic',
  version: '1.0.0',
  meta: {
    name: 'ERD Table (Dynamic)',
    description: 'Database table with dynamic field nodes - field-level connections',
    category: 'erd',
    tags: ['database', 'erd', 'table', 'repeater', 'interactive'],
  },
  structure: {
    type: 'erd-container',
    size: { width: 250, height: 200 },

    shape: {
      type: 'rect',
      fill: '#ffffff',
      stroke: '#6b7280',
      strokeWidth: 2,
      cornerRadius: 4,
    },

    behavior: {
      draggable: true,
      selectable: true,
    },

    ports: { enabled: false }, // No ports on container

    layout: {
      direction: 'column',
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'stretch',
      alignContent: 'start',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },

    // Static header child
    children: [
      {
        type: 'erd-header',
        size: { width: 250, height: 32 },

        html: {
          mode: 'template',
          template: `
            <div class="erd-header">
              <span class="header-icon">🔑</span>
              <span class="header-text">{{data.tableName}}</span>
            </div>
          `,
          className: 'grafloria-erd-header',
          style: {
            width: '100%',
            height: '32px',
            padding: '8px',
            backgroundColor: '#f3f4f6',
            borderBottom: '1px solid #d1d5db',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }
        },

        behavior: {
          draggable: true,
          dragHandler: {
            isDragHandler: true,
            dragChildren: true,
          },
          selectable: false,
        },

        ports: { enabled: false },
      }
    ],

    // Dynamic field children - THE KEY FEATURE
    repeater: {
      dataSource: 'columns',
      keyField: 'name',
      itemTemplate: {
        type: 'erd-field',
        size: { width: 250, height: 24 },

        html: {
          mode: 'template',
          template: `
            <div class="erd-field {{#data.isPrimaryKey}}field-pk{{/data.isPrimaryKey}}{{#data.isForeignKey}}field-fk{{/data.isForeignKey}}">
              <span class="field-icon">
                {{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}
                {{#data.isForeignKey}}🔗{{/data.isForeignKey}}
                {{^data.isPrimaryKey}}{{^data.isForeignKey}}📝{{/data.isForeignKey}}{{/data.isPrimaryKey}}
              </span>
              <span class="field-name">{{data.name}}</span>
              <span class="field-type">{{data.dataType}}</span>
            </div>
          `,
          className: 'grafloria-erd-field',
          style: {
            width: '100%',
            height: '24px',
            padding: '4px 8px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }
        },

        behavior: {
          draggable: false,  // Fields are locked to parent table
          selectable: false,
          connectable: true,
        },

        // CRITICAL: Each field has its own ports for field-to-field connections
        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' },
        }
      }
    }
  },
  defaultData: {
    tableName: 'users',
    columns: [
      { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false },
      { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false },
      { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false },
    ]
  }
};

/**
 * Process Flow with Dynamic Steps - NodeModel Repeater Example
 * Each step is a NodeModel with ports for connecting to next/previous steps
 */
export const ProcessFlow: NodeTemplate = {
  id: 'process-flow-dynamic',
  version: '1.0.0',
  meta: {
    name: 'Process Flow (Dynamic)',
    description: 'Process with dynamic steps - step-to-step connections',
    category: 'workflow',
    tags: ['workflow', 'process', 'repeater', 'interactive'],
  },
  structure: {
    type: 'process-container',
    size: { width: 300, height: 400 },

    shape: {
      type: 'rect',
      fill: '#fef3c7',
      stroke: '#f59e0b',
      strokeWidth: 2,
      cornerRadius: 8,
    },

    ports: { enabled: false },

    layout: {
      direction: 'column',
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'stretch',
      alignContent: 'start',
      gap: 8,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    },

    children: [
      {
        type: 'process-title',
        size: { width: 268, height: 40 },
        html: {
          mode: 'template',
          template: `
            <div class="process-title">
              <h3>{{data.processName}}</h3>
            </div>
          `
        },
        ports: { enabled: false },
      }
    ],

    repeater: {
      dataSource: 'steps',
      keyField: 'id',
      itemTemplate: {
        type: 'process-step',
        size: { width: 268, height: 60 },

        html: {
          mode: 'template',
          template: `
            <div class="process-step">
              <div class="step-number">{{data._index + 1}}</div>
              <div class="step-content">
                <div class="step-title">{{data.title}}</div>
                <div class="step-desc">{{data.description}}</div>
              </div>
              <div class="step-status {{data.status}}">{{data.status}}</div>
            </div>
          `
        },

        behavior: {
          draggable: false,
          selectable: true,
        },

        // Each step has ports to connect to next/previous steps
        ports: {
          enabled: true,
          top: { enabled: true, type: 'input' },
          bottom: { enabled: true, type: 'output' },
        }
      }
    }
  },
  defaultData: {
    processName: 'Order Fulfillment',
    steps: [
      { id: 'step1', title: 'Receive Order', description: 'Order placed by customer', status: 'completed' },
      { id: 'step2', title: 'Process Payment', description: 'Payment verification', status: 'completed' },
      { id: 'step3', title: 'Pack Items', description: 'Prepare for shipping', status: 'in-progress' },
      { id: 'step4', title: 'Ship Order', description: 'Hand off to carrier', status: 'pending' },
    ]
  }
};

/**
 * ====================================================================
 * HYBRID APPROACH: Container Node + HTML List
 * ====================================================================
 * Use when: You need container-level ports + visual list inside
 */

/**
 * Department Org Chart - Hybrid Example
 * Container has ports for org hierarchy, employees shown via HTML :loop
 */
export const DepartmentNode: NodeTemplate = {
  id: 'department-hybrid',
  version: '1.0.0',
  meta: {
    name: 'Department (Hybrid)',
    description: 'Department node with ports + employee list',
    category: 'organization',
    tags: ['org-chart', 'department', 'hybrid', 'html-loop'],
  },
  structure: {
    type: 'department',
    size: { width: 280, height: 300 },

    html: {
      mode: 'template',
      template: `
        <div class="department">
          <div class="dept-header">
            <h3>{{data.departmentName}}</h3>
            <p class="manager">Manager: {{data.managerName}}</p>
          </div>

          <div class="employees-section">
            <h4>Team Members</h4>
            <div class="employees" :loop="\${this.data.employees}">
              <div class="employee">
                <span class="employee-name">{{self.name}}</span>
                <span class="employee-role">{{self.role}}</span>
              </div>
            </div>
          </div>

          <div class="dept-footer">
            {{data.employees.length}} employee(s)
          </div>
        </div>
      `,
      className: 'grafloria-department',
    },

    // Department-level ports for org hierarchy
    ports: {
      enabled: true,
      top: { enabled: true, type: 'input' },     // Reports to
      bottom: { enabled: true, type: 'output' }, // Manages
    }
  },
  defaultData: {
    departmentName: 'Engineering',
    managerName: 'Jane Smith',
    employees: [
      { name: 'Alice Johnson', role: 'Senior Developer' },
      { name: 'Bob Wilson', role: 'Developer' },
      { name: 'Carol Davis', role: 'QA Engineer' },
    ]
  }
};

/**
 * Export all example templates
 */
export const DynamicRenderingExamples = {
  // HTML :loop examples (display-only)
  DashboardMetricsCard,
  ActivityLog,

  // NodeModel repeater examples (interactive)
  ERDTableDynamic,
  ProcessFlow,

  // Hybrid examples
  DepartmentNode,
};
