import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DSL, DiagramEngine } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

interface TemplateExample {
  name: string;
  description: string;
  html: string;
  sampleData: Record<string, any>;
}

@Component({
    imports: [CommonModule, FormsModule, DiagramCanvasComponent],
    selector: 'app-dsl-template-builder',
    templateUrl: './dsl-template-builder.component.html',
    styleUrl: './dsl-template-builder.component.css'
})
export class DslTemplateBuilderComponent implements OnInit {
  dsl!: DSL;
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  templateName = 'customCard';
  templateHTML = `<div class="custom-card">
  <div class="card-header">
    <h3>{{data.title}}</h3>
    <span class="badge">{{data.status}}</span>
  </div>
  <div class="card-body">
    <p>{{data.description}}</p>
  </div>
  <div class="card-footer">
    <span>{{data.author}}</span>
  </div>
</div>`;

  sampleData: Record<string, any> = {
    title: 'Sample Card',
    status: 'Active',
    description: 'This is a sample card description to show template rendering.',
    author: 'John Doe'
  };

  generatedDSL = '';
  validationErrors: string[] = [];

  templateExamples: TemplateExample[] = [
    {
      name: 'Task Card',
      description: 'Project management task card with assignee and due date',
      html: `<div class="task-card">
  <div class="task-header" style="background: {{data.priorityColor}}">
    <h4>{{data.taskName}}</h4>
    <span class="priority">{{data.priority}}</span>
  </div>
  <div class="task-body">
    <p>{{data.description}}</p>
    <div class="task-meta">
      <span>👤 {{data.assignee}}</span>
      <span>📅 {{data.dueDate}}</span>
    </div>
  </div>
  <div class="task-progress">
    <div class="progress-bar" style="width: {{data.progress}}%"></div>
  </div>
</div>`,
      sampleData: {
        taskName: 'Implement Authentication',
        priority: 'High',
        priorityColor: '#ef4444',
        description: 'Add JWT authentication to the API',
        assignee: 'Sarah Chen',
        dueDate: '2025-11-15',
        progress: 65
      }
    },
    {
      name: 'User Profile',
      description: 'User profile card with avatar and stats',
      html: `<div class="profile-card">
  <div class="profile-header">
    <div class="avatar" style="background: {{data.avatarColor}}">
      {{data.initials}}
    </div>
    <h3>{{data.name}}</h3>
    <p class="role">{{data.role}}</p>
  </div>
  <div class="profile-stats">
    <div class="stat">
      <div class="stat-value">{{data.projects}}</div>
      <div class="stat-label">Projects</div>
    </div>
    <div class="stat">
      <div class="stat-value">{{data.tasks}}</div>
      <div class="stat-label">Tasks</div>
    </div>
    <div class="stat">
      <div class="stat-value">{{data.commits}}</div>
      <div class="stat-label">Commits</div>
    </div>
  </div>
</div>`,
      sampleData: {
        name: 'Alex Rodriguez',
        initials: 'AR',
        role: 'Senior Developer',
        avatarColor: '#667eea',
        projects: 12,
        tasks: 47,
        commits: 352
      }
    },
    {
      name: 'Metric Dashboard',
      description: 'KPI metric display with trend indicator',
      html: `<div class="metric-card">
  <div class="metric-icon" style="background: {{data.iconColor}}">
    {{data.icon}}
  </div>
  <div class="metric-content">
    <div class="metric-label">{{data.label}}</div>
    <div class="metric-value">{{data.value}}</div>
    <div class="metric-trend" style="color: {{data.trendColor}}">
      {{data.trendIcon}} {{data.trendValue}}%
    </div>
  </div>
</div>`,
      sampleData: {
        label: 'Total Revenue',
        value: '$45,231',
        icon: '💰',
        iconColor: '#10b981',
        trendIcon: '📈',
        trendValue: '+12.5',
        trendColor: '#10b981'
      }
    },
    {
      name: 'Entity Table',
      description: 'Database entity with fields list (ERD-style)',
      html: `<div class="entity-container">
  <div class="entity-header" style="background: {{data.color}}">
    {{data.name}}
  </div>
  <div class="divider"></div>
  <div class="fields-section">
    {{#each data.fields}}
      <div class="field">
        {{#if this.primaryKey}}<span class="pk">PK</span>{{/if}}
        {{#if this.foreignKey}}<span class="fk">FK</span>{{/if}}
        <span class="field-name">{{this.name}}</span>:
        <span class="field-type">{{this.type}}</span>
      </div>
    {{/each}}
  </div>
</div>`,
      sampleData: {
        name: 'User',
        color: '#3b82f6',
        fields: [
          { name: 'id', type: 'int', primaryKey: true },
          { name: 'username', type: 'string' },
          { name: 'email', type: 'string' },
          { name: 'createdAt', type: 'date' }
        ]
      }
    }
  ];

  ngOnInit() {
    this.engine = new DiagramEngine();

    this.dsl = new DSL({
      debug: true,
      autoLayout: true
    });

    this.generateDSL();
  }

  generateDSL() {
    // Generate @template block
    const templateDef = `@template ${this.templateName} {
${this.templateHTML}
}

flowchart TD
  A[Node 1]@${this.templateName}
  B[Node 2]@${this.templateName}
  A --> B`;

    this.generatedDSL = templateDef;
    this.validateTemplate();

    // Parse and render the diagram
    try {
      const diagram = this.dsl.parse(this.generatedDSL);
      this.engine.setDiagram(diagram);
    } catch (error) {
      console.error('Failed to parse template diagram:', error);
    }
  }

  validateTemplate() {
    this.validationErrors = [];

    // Check for script tags
    if (this.templateHTML.includes('<script')) {
      this.validationErrors.push('Security: Script tags are not allowed');
    }

    // Check for balanced tags
    const openTags = (this.templateHTML.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (this.templateHTML.match(/<\/[^>]+>/g) || []).length;
    const selfClosing = (this.templateHTML.match(/<[^>]+\/>/g) || []).length;

    if (openTags !== closeTags + selfClosing) {
      this.validationErrors.push('HTML: Unbalanced tags detected');
    }

    // Extract bindings
    const bindings = this.extractBindings();
    if (bindings.length === 0) {
      this.validationErrors.push('Warning: No data bindings found');
    }
  }

  extractBindings(): string[] {
    const matches = this.templateHTML.match(/\{\{([^}]+)\}\}/g) || [];
    return matches.map(m => m.replace(/[{}]/g, '').trim());
  }

  loadExample(example: TemplateExample) {
    this.templateName = example.name.toLowerCase().replace(/\s+/g, '');
    this.templateHTML = example.html;
    this.sampleData = example.sampleData;
    this.generateDSL();
  }

  formatJSON() {
    try {
      const formatted = JSON.stringify(JSON.parse(JSON.stringify(this.sampleData)), null, 2);
      // Update would happen here in real implementation
    } catch (e) {
      console.error('JSON format error');
    }
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.generatedDSL);
  }

  exportTemplate() {
    const template = {
      name: this.templateName,
      html: this.templateHTML,
      sampleData: this.sampleData
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.templateName}-template.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
