import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

export type RenderingMode = 'template' | 'component';

export interface ComponentModeConfig {
  mode: RenderingMode;
  component?: string;
  template?: string;
  className?: string | string[];
  style?: Record<string, any>;
  props?: Record<string, any>;
  slots?: SlotDefinition[];
}

export interface SlotDefinition {
  id: string;
  name: string;
  description?: string;
  defaultContent?: string;
  required?: boolean;
}

@Component({
  selector: 'app-component-mode-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="component-mode-editor" [style.font-family]="tokens.typography.fontFamily">
      <div class="header">
        <h3 [style.color]="tokens.colors.text.primary" [style.margin]="0">
          Component Configuration
        </h3>
        <p class="description" [style.color]="tokens.colors.text.secondary" [style.margin]="'8px 0 0 0'">
          Configure how this node renders its content
        </p>
      </div>

      <!-- Mode Toggle -->
      <div class="section">
        <label class="label" [style.color]="tokens.colors.text.primary">
          Rendering Mode
        </label>
        <div class="mode-toggle">
          <button
            type="button"
            class="mode-button"
            [class.active]="config.mode === 'template'"
            [style.background]="config.mode === 'template' ? tokens.colors.primary[500] : tokens.colors.background.secondary"
            [style.color]="config.mode === 'template' ? '#ffffff' : tokens.colors.text.primary"
            (click)="setMode('template')">
            📝 Template Mode
          </button>
          <button
            type="button"
            class="mode-button"
            [class.active]="config.mode === 'component'"
            [style.background]="config.mode === 'component' ? tokens.colors.primary[500] : tokens.colors.background.secondary"
            [style.color]="config.mode === 'component' ? '#ffffff' : tokens.colors.text.primary"
            (click)="setMode('component')">
            ⚙️ Component Mode
          </button>
        </div>
      </div>

      <!-- Mode Description -->
      <div class="info-card" [style.background]="tokens.colors.info.light" [style.border-color]="tokens.colors.info.light">
        <div class="info-icon" [style.color]="tokens.colors.info.main">ℹ️</div>
        <div>
          <div class="info-title" [style.color]="tokens.colors.info.dark">
            {{ config.mode === 'template' ? 'Template Mode' : 'Component Mode' }}
          </div>
          <div class="info-text" [style.color]="tokens.colors.info.main">
            {{ getModeDescription() }}
          </div>
        </div>
      </div>

      <!-- Template Mode Configuration -->
      <div *ngIf="config.mode === 'template'" class="section">
        <label class="label" [style.color]="tokens.colors.text.primary">
          LemonadeJS Template
          <span class="hint" [style.color]="tokens.colors.text.secondary">
            (HTML with {{'{{'}}data{{'}}}'}} bindings)
          </span>
        </label>
        <textarea
          class="template-input"
          [(ngModel)]="config.template"
          (ngModelChange)="emitChange()"
          placeholder="<div>{{'{{'}}data.name{{'}}'}}</div>"
          rows="6"
          [style.background]="tokens.colors.background.primary"
          [style.border-color]="tokens.colors.border.primary"
          [style.color]="tokens.colors.text.primary">
        </textarea>
        <div class="template-examples">
          <div class="example-label" [style.color]="tokens.colors.text.secondary">Quick Examples:</div>
          <button
            *ngFor="let example of templateExamples"
            type="button"
            class="example-button"
            (click)="insertTemplate(example.template)"
            [style.background]="tokens.colors.background.secondary"
            [style.color]="tokens.colors.text.primary"
            [title]="example.description">
            {{ example.label }}
          </button>
        </div>
      </div>

      <!-- Component Mode Configuration -->
      <div *ngIf="config.mode === 'component'" class="section">
        <label class="label" [style.color]="tokens.colors.text.primary">
          Component Name
          <span class="hint" [style.color]="tokens.colors.text.secondary">
            (Framework component reference)
          </span>
        </label>
        <input
          type="text"
          class="text-input"
          [(ngModel)]="config.component"
          (ngModelChange)="emitChange()"
          placeholder="UserCardComponent"
          [style.background]="tokens.colors.background.primary"
          [style.border-color]="tokens.colors.border.primary"
          [style.color]="tokens.colors.text.primary" />

        <div class="component-examples">
          <div class="example-label" [style.color]="tokens.colors.text.secondary">Examples:</div>
          <ul class="examples-list" [style.color]="tokens.colors.text.secondary">
            <li>UserCardComponent (Angular)</li>
            <li>UserCard (React)</li>
            <li>user-card (Vue)</li>
            <li>CustomDashboard (any framework)</li>
          </ul>
        </div>
      </div>

      <!-- Common Configuration -->
      <div class="section">
        <label class="label" [style.color]="tokens.colors.text.primary">
          CSS Classes
          <span class="hint" [style.color]="tokens.colors.text.secondary">(optional)</span>
        </label>
        <input
          type="text"
          class="text-input"
          [ngModel]="getClassNameString()"
          (ngModelChange)="setClassName($event)"
          placeholder="card user-card highlight"
          [style.background]="tokens.colors.background.primary"
          [style.border-color]="tokens.colors.border.primary"
          [style.color]="tokens.colors.text.primary" />
      </div>

      <!-- Style Configuration -->
      <div class="section">
        <label class="label" [style.color]="tokens.colors.text.primary">
          Inline Styles (JSON)
          <span class="hint" [style.color]="tokens.colors.text.secondary">(optional)</span>
        </label>
        <textarea
          class="style-input"
          [ngModel]="getStyleString()"
          (ngModelChange)="setStyle($event)"
          placeholder='{ "padding": "16px", "background": "#f5f5f5" }'
          rows="3"
          [style.background]="tokens.colors.background.primary"
          [style.border-color]="tokens.colors.border.primary"
          [style.color]="tokens.colors.text.primary">
        </textarea>
      </div>

      <!-- Use Cases -->
      <div class="use-cases-section">
        <div class="use-case-title" [style.color]="tokens.colors.text.primary">
          When to use {{ config.mode === 'template' ? 'Template' : 'Component' }} Mode:
        </div>
        <ul class="use-cases-list" [style.color]="tokens.colors.text.secondary">
          <li *ngFor="let useCase of getUseCases()">{{ useCase }}</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .component-mode-editor {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      height: 100%;
      overflow-y: auto;
    }

    .header h3 {
      font-size: 18px;
      font-weight: 600;
    }

    .description {
      font-size: 14px;
      line-height: 1.5;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .label {
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .hint {
      font-size: 12px;
      font-weight: 400;
    }

    .mode-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .mode-button {
      padding: 12px 16px;
      border: 2px solid transparent;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .mode-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .mode-button.active {
      border-color: rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    }

    .info-card {
      padding: 12px;
      border: 1px solid;
      border-radius: 8px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .info-icon {
      font-size: 20px;
      line-height: 1;
    }

    .info-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .info-text {
      font-size: 13px;
      line-height: 1.5;
    }

    .template-input,
    .text-input,
    .style-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid;
      border-radius: 6px;
      font-size: 13px;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      resize: vertical;
    }

    .template-input:focus,
    .text-input:focus,
    .style-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .template-examples,
    .component-examples {
      margin-top: 8px;
    }

    .example-label {
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .example-button {
      padding: 6px 12px;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      margin-right: 6px;
      margin-bottom: 6px;
      transition: all 0.2s;
    }

    .example-button:hover {
      background: #e8e8e8 !important;
      border-color: #a0a0a0;
    }

    .examples-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      line-height: 1.8;
    }

    .use-cases-section {
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .use-case-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .use-cases-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      line-height: 1.8;
    }

    .use-cases-list li {
      margin-bottom: 4px;
    }
  `]
})
export class ComponentModeEditorComponent implements OnInit, OnChanges {
  @Input() config: ComponentModeConfig = {
    mode: 'template',
    template: '',
    className: '',
    style: {}
  };

  @Output() configChange = new EventEmitter<ComponentModeConfig>();

  tokens = DESIGN_TOKENS;

  templateExamples = [
    {
      label: 'Simple Text',
      description: 'Display data property',
      template: '<div>{{data.name}}</div>'
    },
    {
      label: 'Card',
      description: 'Card with title and description',
      template: '<div class="card">\n  <h3>{{data.title}}</h3>\n  <p>{{data.description}}</p>\n</div>'
    },
    {
      label: 'List',
      description: 'List of items',
      template: '<ul>\n  <li :loop="data.items">{{item.name}}</li>\n</ul>'
    },
    {
      label: 'Conditional',
      description: 'Show/hide based on condition',
      template: '<div :if="data.isActive">\n  <span>{{data.status}}</span>\n</div>'
    }
  ];

  ngOnInit(): void {
    // Ensure config has defaults
    if (!this.config.mode) {
      this.config.mode = 'template';
    }
  }

  ngOnChanges(): void {
    // Handle config changes from parent
  }

  setMode(mode: RenderingMode): void {
    this.config.mode = mode;
    this.emitChange();
  }

  getModeDescription(): string {
    if (this.config.mode === 'template') {
      return 'Use LemonadeJS templates for framework-agnostic, data-driven HTML rendering with simple binding syntax.';
    } else {
      return 'Reference framework-specific components (Angular, React, Vue) for complex interactivity and rich UI features.';
    }
  }

  getUseCases(): string[] {
    if (this.config.mode === 'template') {
      return [
        'Simple data display with text and formatting',
        'Framework-agnostic solutions',
        'Better performance (no framework overhead)',
        'Static content with basic event handlers',
        'Quick prototyping and mockups'
      ];
    } else {
      return [
        'Complex interactivity (forms, wizards, workflows)',
        'Framework-specific features (routing, DI, state management)',
        'Existing components to reuse in diagrams',
        'Rich UI libraries (Material, PrimeNG, Ant Design)',
        'Advanced animations and transitions'
      ];
    }
  }

  insertTemplate(template: string): void {
    this.config.template = template;
    this.emitChange();
  }

  getClassNameString(): string {
    if (Array.isArray(this.config.className)) {
      return this.config.className.join(' ');
    }
    return this.config.className || '';
  }

  setClassName(value: string): void {
    this.config.className = value.trim() ? value.split(' ').filter(c => c) : '';
    this.emitChange();
  }

  getStyleString(): string {
    if (!this.config.style || Object.keys(this.config.style).length === 0) {
      return '';
    }
    try {
      return JSON.stringify(this.config.style, null, 2);
    } catch {
      return '';
    }
  }

  setStyle(value: string): void {
    if (!value.trim()) {
      this.config.style = {};
      this.emitChange();
      return;
    }

    try {
      this.config.style = JSON.parse(value);
      this.emitChange();
    } catch {
      // Invalid JSON, don't update
    }
  }

  emitChange(): void {
    this.configChange.emit({ ...this.config });
  }
}
