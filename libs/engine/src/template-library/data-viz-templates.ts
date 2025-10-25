/**
 * Data Visualization Node Templates (Phase 4)
 * Pre-built templates for data visualization and dashboards
 */

import type { NodeTemplate } from '../templates/NodeTemplate';

/**
 * Metric Card Template
 * Card displaying a key metric with trend
 */
export const MetricCardTemplate: NodeTemplate = {
  id: 'metric-card',
  version: '1.0.0',
  meta: {
    name: 'Metric Card',
    description: 'Display key metrics with trends and sparklines',
    category: 'data-viz',
  },


  structure: {
    type: 'metric',
    size: { width: 220, height: 120 },

    shape: {
      type: 'rect',
      cornerRadius: 12,
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="metric-card">
          <div class="metric-label">{{data.label}}</div>
          <div class="metric-value">{{data.value}}</div>
          <div class="metric-change {{data.trendDirection}}">
            <span class="trend-icon">{{data.trendIcon}}</span>
            <span class="trend-value">{{data.change}}</span>
          </div>
        </div>
      `,
      className: 'node-metric',
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '16px',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#fff',
        borderRadius: '12px',
      },
      events: {
        click: 'metric:clicked',
        mouseenter: 'metric:hovered',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      right: { enabled: true },
    },
  },

  defaultData: {
    label: 'Revenue',
    value: '$12,345',
    change: '+12.5%',
    trendDirection: 'up', // up, down, neutral
    trendIcon: '↑',
  },
};

/**
 * Gauge Template
 * Circular gauge/dial for percentage values
 */
export const GaugeTemplate: NodeTemplate = {
  id: 'gauge',
  version: '1.0.0',
  meta: {
    name: 'Gauge',
    description: 'Circular gauge for displaying percentage values',
    category: 'data-viz',
  },


  structure: {
    type: 'gauge',
    size: { width: 150, height: 150 },

    shape: {
      type: 'circle',
      fill: '#fafafa',
      stroke: '#e0e0e0',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="gauge">
          <svg class="gauge-svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#e0e0e0" stroke-width="8"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#4caf50" stroke-width="8"
              stroke-dasharray="{{data.percentage}} 100" stroke-dashoffset="25"/>
          </svg>
          <div class="gauge-value">{{data.value}}%</div>
          <div class="gauge-label">{{data.label}}</div>
        </div>
      `,
      className: 'node-gauge',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
      },
      events: {
        click: 'gauge:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: false,
    },
  },

  defaultData: {
    label: 'Progress',
    value: 75,
    percentage: 75,
    min: 0,
    max: 100,
    color: '#4caf50',
  },
};

/**
 * Bar Chart Template
 * Simple bar chart visualization
 */
export const BarChartTemplate: NodeTemplate = {
  id: 'bar-chart',
  version: '1.0.0',
  meta: {
    name: 'Bar Chart',
    description: 'Simple bar chart for comparing values',
    category: 'data-viz',
  },


  structure: {
    type: 'chart',
    size: { width: 280, height: 180 },

    shape: {
      type: 'rect',
      cornerRadius: 8,
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="bar-chart">
          <div class="chart-title">{{data.title}}</div>
          <div class="chart-bars">
            <!-- Bars would be rendered dynamically -->
            <div class="bar" style="height: {{data.bar1}}%">{{data.label1}}</div>
            <div class="bar" style="height: {{data.bar2}}%">{{data.label2}}</div>
            <div class="bar" style="height: {{data.bar3}}%">{{data.label3}}</div>
          </div>
        </div>
      `,
      className: 'node-chart',
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#fff',
        borderRadius: '8px',
      },
      events: {
        click: 'chart:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      left: { enabled: true },
    },
  },

  defaultData: {
    title: 'Sales by Region',
    bar1: 80,
    bar2: 60,
    bar3: 90,
    label1: 'North',
    label2: 'South',
    label3: 'East',
  },
};

/**
 * Data Table Template
 * Tabular data display
 */
export const DataTableTemplate: NodeTemplate = {
  id: 'data-table',
  version: '1.0.0',
  meta: {
    name: 'Data Table',
    description: 'Tabular data display with headers',
    category: 'data-viz',
  },


  structure: {
    type: 'table',
    size: { width: 300, height: 200 },

    shape: {
      type: 'rect',
      cornerRadius: 8,
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="data-table">
          <div class="table-header">{{data.title}}</div>
          <table class="table">
            <thead>
              <tr>
                <th>{{data.col1Header}}</th>
                <th>{{data.col2Header}}</th>
                <th>{{data.col3Header}}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Row 1</td>
                <td>Data</td>
                <td>Value</td>
              </tr>
            </tbody>
          </table>
        </div>
      `,
      className: 'node-table',
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#fff',
        borderRadius: '8px',
        overflow: 'auto',
      },
      events: {
        click: 'table:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      top: { enabled: true },
      bottom: { enabled: true },
    },
  },

  defaultData: {
    title: 'Data Table',
    col1Header: 'Name',
    col2Header: 'Status',
    col3Header: 'Value',
    rows: [],
  },
};

/**
 * Pie Chart Template
 * Circular pie/donut chart
 */
export const PieChartTemplate: NodeTemplate = {
  id: 'pie-chart',
  version: '1.0.0',
  meta: {
    name: 'Pie Chart',
    description: 'Circular pie chart for proportions',
    category: 'data-viz',
  },


  structure: {
    type: 'pie',
    size: { width: 180, height: 180 },

    shape: {
      type: 'circle',
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="pie-chart">
          <svg class="pie-svg" viewBox="0 0 100 100">
            <!-- Pie segments would be rendered dynamically -->
            <circle cx="50" cy="50" r="40" fill="#e0e0e0"/>
          </svg>
          <div class="pie-legend">{{data.title}}</div>
        </div>
      `,
      className: 'node-pie',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontFamily: 'system-ui, sans-serif',
      },
      events: {
        click: 'pie:clicked',
        mouseenter: 'pie:hovered',
      },
      zIndex: 1,
    },

    ports: {
      enabled: false,
    },
  },

  defaultData: {
    title: 'Distribution',
    segments: [],
    total: 100,
  },
};

/**
 * Stat Counter Template
 * Large number display with icon
 */
export const StatCounterTemplate: NodeTemplate = {
  id: 'stat-counter',
  version: '1.0.0',
  meta: {
    name: 'Stat Counter',
    description: 'Large statistic counter with icon',
    category: 'data-viz',
  },


  structure: {
    type: 'stat',
    size: { width: 160, height: 100 },

    shape: {
      type: 'rect',
      cornerRadius: 10,
      fill: '#e3f2fd',
      stroke: '#2196f3',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="stat-counter">
          <div class="stat-icon">{{data.icon}}</div>
          <div class="stat-number">{{data.value}}</div>
          <div class="stat-label">{{data.label}}</div>
        </div>
      `,
      className: 'node-stat',
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
        click: 'stat:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: false,
    },
  },

  defaultData: {
    label: 'Total Users',
    value: '1,234',
    icon: '👥',
    color: '#2196f3',
  },
};

/**
 * Progress Bar Template
 * Horizontal progress indicator
 */
export const ProgressBarTemplate: NodeTemplate = {
  id: 'progress-bar',
  version: '1.0.0',
  meta: {
    name: 'Progress Bar',
    description: 'Horizontal progress bar indicator',
    category: 'data-viz',
  },


  structure: {
    type: 'progress',
    size: { width: 250, height: 60 },

    shape: {
      type: 'rect',
      cornerRadius: 8,
      fill: '#fafafa',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="progress-bar">
          <div class="progress-label">{{data.label}}</div>
          <div class="progress-track">
            <div class="progress-fill" style="width: {{data.percentage}}%"></div>
          </div>
          <div class="progress-value">{{data.percentage}}%</div>
        </div>
      `,
      className: 'node-progress',
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
      },
      events: {
        click: 'progress:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      left: { enabled: true },
      right: { enabled: true },
    },
  },

  defaultData: {
    label: 'Upload Progress',
    percentage: 65,
    status: 'in-progress', // in-progress, complete, error
  },
};

/**
 * Export all data visualization templates
 */
export const DataVizTemplates = {
  MetricCard: MetricCardTemplate,
  Gauge: GaugeTemplate,
  BarChart: BarChartTemplate,
  DataTable: DataTableTemplate,
  PieChart: PieChartTemplate,
  StatCounter: StatCounterTemplate,
  ProgressBar: ProgressBarTemplate,
};
