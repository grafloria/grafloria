import { NodeTemplate } from '@grafloria/engine';
import { TemplateMetadata } from '../models/template-metadata.model';

/**
 * Sample Templates for Gallery
 *
 * Pre-built example templates to populate the gallery
 * Organized by category and complexity
 *
 * Phase 9: Template Gallery & Management
 */

/**
 * Basic Templates - Simple nodes for getting started
 */
export const BASIC_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Simple Rectangle',
    description: 'A basic rectangular node with customizable color and size. Perfect starting point for any design.',
    category: 'basic',
    tags: ['rectangle', 'shape', 'simple'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: [],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: false,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'simple-rectangle',
      type: 'rectangle',
      size: { width: 200, height: 100 },
      shape: {
        type: 'rect',
        fill: '#e3f2fd',
        stroke: '#2196f3',
        strokeWidth: 2
      },
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Rounded Card',
    description: 'A rounded rectangle card with shadow. Great for displaying content or information boxes.',
    category: 'basic',
    tags: ['card', 'rounded', 'shadow'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['css'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'rounded-card',
      type: 'rectangle',
      size: { width: 250, height: 150 },
      shape: {
        type: 'rect',
        fill: 'white',
        stroke: '#e0e0e0',
        strokeWidth: 1,
        rx: 12,
        ry: 12
      },
      cssLayer: `
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transition: box-shadow 0.3s;
      `,
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Circle Badge',
    description: 'A circular badge or avatar placeholder. Useful for profile pictures or status indicators.',
    category: 'basic',
    tags: ['circle', 'badge', 'avatar'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: [],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: false,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'circle-badge',
      type: 'circle',
      size: { width: 80, height: 80 },
      shape: {
        type: 'circle',
        fill: '#f3e5f5',
        stroke: '#9c27b0',
        strokeWidth: 3
      },
      ports: { enabled: false }
    }
  },
  {
    name: 'Text Label',
    description: 'A simple text label with customizable content. Perfect for adding annotations or descriptions.',
    category: 'basic',
    tags: ['text', 'label', 'annotation'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'text-label',
      type: 'rectangle',
      size: { width: 200, height: 60 },
      shape: {
        type: 'rect',
        fill: 'transparent',
        stroke: 'none'
      },
      htmlLayer: `
        <div style="padding: 12px; text-align: center; font-size: 16px; color: #333;">
          Your text here
        </div>
      `,
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Text Label',
    description: 'A simple text label with customizable content. Perfect for adding annotations or descriptions.',
    category: 'basic',
    tags: ['text', 'label', 'annotation'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'text-label',
      type: 'rectangle',
      size: { width: 200, height: 60 },
      shape: {
        type: 'rect',
        fill: 'transparent',
        stroke: 'none'
      },
      htmlLayer: `
        <div style="padding: 12px; text-align: center; font-size: 16px; color: #333;">
          Your text here
        </div>
      `,
      ports: { enabled: false }
    } as any
  }
];

/**
 * UI Component Templates - Reusable interface elements
 */
export const UI_COMPONENT_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Button Component',
    description: 'A styled button with hover effects. Click-ready with customizable text and colors.',
    category: 'ui-component',
    tags: ['button', 'interactive', 'action'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css', 'behavior'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: true,
    template: {
      id: 'button-component',
      type: 'rectangle',
      size: { width: 140, height: 44 },
      shape: {
        type: 'rect',
        fill: '#3498db',
        stroke: 'none',
        rx: 8,
        ry: 8
      },
      htmlLayer: `
        <div class="btn-content">
          Click Me
        </div>
      `,
      cssLayer: `
        .btn-content {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          user-select: none;
        }
        .btn-content:hover {
          background: rgba(0, 0, 0, 0.1);
        }
        .btn-content:active {
          transform: scale(0.98);
        }
      `,
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Input Field',
    description: 'A form input field with placeholder text. Great for building forms and data entry interfaces.',
    category: 'ui-component',
    tags: ['input', 'form', 'text-field'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: true,
    template: {
      id: 'input-field',
      type: 'rectangle',
      size: { width: 300, height: 48 },
      shape: {
        type: 'rect',
        fill: 'white',
        stroke: '#d0d0d0',
        strokeWidth: 2,
        rx: 6,
        ry: 6
      },
      htmlLayer: `
        <input type="text" placeholder="Enter text..." class="input-field" />
      `,
      cssLayer: `
        .input-field {
          width: 100%;
          height: 100%;
          border: none;
          outline: none;
          padding: 0 16px;
          font-size: 14px;
          background: transparent;
        }
        .input-field:focus {
          border-color: #3498db;
        }
      `,
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Card with Header',
    description: 'A card component with title, subtitle, and content area. Perfect for displaying structured information.',
    category: 'ui-component',
    tags: ['card', 'header', 'content'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css', 'layout'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'card-with-header',
      type: 'rectangle',
      size: { width: 320, height: 200 },
      shape: {
        type: 'rect',
        fill: 'white',
        stroke: '#e0e0e0',
        strokeWidth: 1,
        rx: 12,
        ry: 12
      },
      htmlLayer: `
        <div class="card-container">
          <div class="card-header">
            <h3>Card Title</h3>
            <p>Subtitle text here</p>
          </div>
          <div class="card-body">
            Content goes here. Add your text, data, or other elements.
          </div>
        </div>
      `,
      cssLayer: `
        .card-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .card-header {
          padding: 16px;
          border-bottom: 1px solid #f0f0f0;
        }
        .card-header h3 {
          margin: 0 0 4px 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }
        .card-header p {
          margin: 0;
          font-size: 13px;
          color: #666;
        }
        .card-body {
          flex: 1;
          padding: 16px;
          font-size: 14px;
          color: #555;
          line-height: 1.5;
        }
      `,
      ports: { enabled: false }
    } as any
  }
];

/**
 * Dashboard Templates - Analytics and data visualization
 */
export const DASHBOARD_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Metric Card',
    description: 'A dashboard metric card showing a value with label. Ideal for KPIs and statistics.',
    category: 'dashboard',
    tags: ['metric', 'kpi', 'statistics', 'dashboard'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: {
      id: 'metric-card',
      type: 'rectangle',
      size: { width: 240, height: 140 },
      shape: {
        type: 'rect',
        fill: 'white',
        stroke: '#e0e0e0',
        strokeWidth: 1,
        rx: 12,
        ry: 12
      },
      htmlLayer: `
        <div class="metric-card">
          <div class="metric-label">Total Users</div>
          <div class="metric-value">12,543</div>
          <div class="metric-change positive">+12.5%</div>
        </div>
      `,
      cssLayer: `
        .metric-card {
          height: 100%;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .metric-label {
          font-size: 13px;
          color: #666;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .metric-value {
          font-size: 32px;
          font-weight: 700;
          color: #2c3e50;
          margin-bottom: 8px;
        }
        .metric-change {
          font-size: 14px;
          font-weight: 600;
        }
        .metric-change.positive {
          color: #27ae60;
        }
        .metric-change.negative {
          color: #e74c3c;
        }
      `,
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Progress Bar',
    description: 'An animated progress bar showing completion percentage. Perfect for loading states or progress tracking.',
    category: 'dashboard',
    tags: ['progress', 'bar', 'loading', 'percentage'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css'],
    hasChildNodes: false,
    hasConnections: false,
    hasCustomStyling: true,
    hasDataBinding: true,
    hasInteractivity: false,
    template: {
      id: 'progress-bar',
      type: 'rectangle',
      size: { width: 300, height: 80 },
      shape: {
        type: 'rect',
        fill: 'white',
        stroke: '#e0e0e0',
        strokeWidth: 1,
        rx: 8,
        ry: 8
      },
      htmlLayer: `
        <div class="progress-container">
          <div class="progress-header">
            <span class="progress-label">Project Progress</span>
            <span class="progress-percentage">75%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: 75%"></div>
          </div>
        </div>
      `,
      cssLayer: `
        .progress-container {
          padding: 16px;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .progress-label {
          font-size: 13px;
          color: #666;
        }
        .progress-percentage {
          font-size: 14px;
          font-weight: 700;
          color: #3498db;
        }
        .progress-track {
          height: 12px;
          background: #f0f0f0;
          border-radius: 6px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3498db, #2980b9);
          border-radius: 6px;
          transition: width 0.3s ease;
        }
      `,
      ports: { enabled: false }
    } as any
  }
];

/**
 * Workflow Templates - Process flows and diagrams
 */
export const WORKFLOW_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Process Step',
    description: 'A workflow process step with title and description. Connect multiple steps to create flows.',
    category: 'workflow',
    tags: ['workflow', 'process', 'step', 'flow'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'process-step',
      type: 'rectangle',
      size: { width: 220, height: 100 },
      shape: {
        type: 'rect',
        fill: '#e8f5e9',
        stroke: '#4caf50',
        strokeWidth: 2,
        rx: 8,
        ry: 8
      },
      htmlLayer: `
        <div class="process-step">
          <div class="step-number">1</div>
          <div class="step-content">
            <div class="step-title">Process Name</div>
            <div class="step-desc">Description</div>
          </div>
        </div>
      `,
      cssLayer: `
        .process-step {
          height: 100%;
          padding: 16px;
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #4caf50;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          flex-shrink: 0;
        }
        .step-content {
          flex: 1;
        }
        .step-title {
          font-size: 14px;
          font-weight: 600;
          color: #2c3e50;
          margin-bottom: 4px;
        }
        .step-desc {
          font-size: 12px;
          color: #666;
        }
      `,
      ports: {
        enabled: true,
        config: {
          inputs: [{ id: 'in', position: 'left', label: 'In' }],
          outputs: [{ id: 'out', position: 'right', label: 'Out' }]
        }
      }
    } as any
  },
  {
    name: 'Decision Diamond',
    description: 'A decision point in a workflow. Use for branching logic and conditional paths.',
    category: 'workflow',
    tags: ['decision', 'diamond', 'conditional', 'branch'],
    complexity: 'simple',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['html', 'css', 'ports'],
    hasChildNodes: false,
    hasConnections: true,
    hasCustomStyling: true,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'decision-diamond',
      type: 'diamond',
      size: { width: 180, height: 120 },
      shape: {
        type: 'polygon',
        fill: '#fff3e0',
        stroke: '#ff9800',
        strokeWidth: 2,
        points: '90,0 180,60 90,120 0,60'
      },
      htmlLayer: `
        <div class="decision-content">
          <div class="decision-text">Decision?</div>
        </div>
      `,
      cssLayer: `
        .decision-content {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .decision-text {
          font-size: 14px;
          font-weight: 600;
          color: #e65100;
          padding: 0 20px;
        }
      `,
      ports: {
        enabled: true,
        config: {
          inputs: [{ id: 'in', position: 'top', label: 'In' }],
          outputs: [
            { id: 'yes', position: 'right', label: 'Yes' },
            { id: 'no', position: 'bottom', label: 'No' }
          ]
        }
      }
    } as any
  }
];

/**
 * Container Templates - Layouts with child nodes
 */
export const CONTAINER_TEMPLATES: Partial<TemplateMetadata>[] = [
  {
    name: 'Vertical Stack',
    description: 'A vertical container with flexbox layout. Add children to create stacked layouts.',
    category: 'basic',
    tags: ['container', 'layout', 'vertical', 'stack'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['layout', 'children'],
    hasChildNodes: true,
    hasConnections: false,
    hasCustomStyling: false,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'vertical-stack',
      type: 'container',
      size: { width: 300, height: 400 },
      shape: {
        type: 'rect',
        fill: '#fafafa',
        stroke: '#e0e0e0',
        strokeWidth: 1,
        rx: 8,
        ry: 8
      },
      structure: {
        type: 'container',
        layout: {
          direction: 'column',
          wrap: 'nowrap',
          justifyContent: 'start',
          alignItems: 'stretch',
          alignContent: 'stretch',
          gap: 12,
          padding: { top: 16, right: 16, bottom: 16, left: 16 }
        },
        children: []
      },
      ports: { enabled: false }
    } as any
  },
  {
    name: 'Horizontal Stack',
    description: 'A horizontal container with flexbox layout. Add children to create side-by-side layouts.',
    category: 'basic',
    tags: ['container', 'layout', 'horizontal', 'row'],
    complexity: 'medium',
    author: 'Grafloria',
    version: '1.0.0',
    features: ['layout', 'children'],
    hasChildNodes: true,
    hasConnections: false,
    hasCustomStyling: false,
    hasDataBinding: false,
    hasInteractivity: false,
    template: {
      id: 'horizontal-stack',
      type: 'container',
      size: { width: 500, height: 200 },
      shape: {
        type: 'rect',
        fill: '#fafafa',
        stroke: '#e0e0e0',
        strokeWidth: 1,
        rx: 8,
        ry: 8
      },
      structure: {
        type: 'container',
        layout: {
          direction: 'row',
          wrap: 'nowrap',
          justifyContent: 'start',
          alignItems: 'stretch',
          alignContent: 'stretch',
          gap: 12,
          padding: { top: 16, right: 16, bottom: 16, left: 16 }
        },
        children: []
      },
      ports: { enabled: false }
    } as any
  }
];

/**
 * All Sample Templates Combined
 */
export const ALL_SAMPLE_TEMPLATES: Partial<TemplateMetadata>[] = [
  ...BASIC_TEMPLATES,
  ...UI_COMPONENT_TEMPLATES,
  ...DASHBOARD_TEMPLATES,
  ...WORKFLOW_TEMPLATES,
  ...CONTAINER_TEMPLATES
];

/**
 * Get sample templates with full metadata
 */
export function getSampleTemplates(): Partial<TemplateMetadata>[] {
  return ALL_SAMPLE_TEMPLATES.map((template, index) => ({
    ...template,
    id: template.template?.id || `sample-template-${index}`,
    usageCount: Math.floor(Math.random() * 100), // Random usage count for demo
    viewCount: Math.floor(Math.random() * 200), // Random view count for demo
    createdAt: Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
    modifiedAt: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date within last 7 days
    isFavorite: false,
    collections: [],
    userTags: []
  }));
}
