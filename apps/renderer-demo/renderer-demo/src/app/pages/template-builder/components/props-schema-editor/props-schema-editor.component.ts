import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

export type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function' | 'any';
export type PropDirection = 'input' | 'output' | 'both';

export interface PropDefinition {
  id: string;
  name: string;
  type: PropType;
  direction: PropDirection;
  defaultValue?: any;
  required?: boolean;
  description?: string;
}

export interface PropsSchema {
  props: PropDefinition[];
}

@Component({
  selector: 'app-props-schema-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="props-schema-editor" [style.font-family]="tokens.typography.fontFamily">
      <div class="header">
        <div>
          <h3 [style.color]="tokens.colors.text.primary" [style.margin]="0">
            Props Schema
          </h3>
          <p class="description" [style.color]="tokens.colors.text.secondary" [style.margin]="'4px 0 0 0'">
            Define input/output properties for this component
          </p>
        </div>
        <button
          type="button"
          class="add-button"
          (click)="addProp()"
          [style.background]="tokens.colors.primary[500]"
          [style.color]="'#ffffff'">
          + Add Prop
        </button>
      </div>

      <div *ngIf="schema.props.length === 0" class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title" [style.color]="tokens.colors.text.primary">
          No props defined
        </div>
        <div class="empty-text" [style.color]="tokens.colors.text.secondary">
          Add props to define the component's interface
        </div>
      </div>

      <div class="props-list">
        <div
          *ngFor="let prop of schema.props; let i = index"
          class="prop-card"
          [style.background]="tokens.colors.background.secondary"
          [style.border-color]="tokens.colors.border.primary">

          <div class="prop-header">
            <div class="prop-badge" [style.background]="getDirectionColor(prop.direction)">
              {{ getDirectionLabel(prop.direction) }}
            </div>
            <button
              type="button"
              class="delete-button"
              (click)="removeProp(i)"
              [style.color]="tokens.colors.error[500]"
              title="Remove prop">
              ✕
            </button>
          </div>

          <div class="prop-grid">
            <!-- Name -->
            <div class="form-group">
              <label class="label" [style.color]="tokens.colors.text.primary">
                Property Name *
              </label>
              <input
                type="text"
                class="text-input"
                [(ngModel)]="prop.name"
                (ngModelChange)="emitChange()"
                placeholder="userName"
                [style.background]="tokens.colors.background.primary"
                [style.border-color]="tokens.colors.border.primary"
                [style.color]="tokens.colors.text.primary" />
            </div>

            <!-- Type -->
            <div class="form-group">
              <label class="label" [style.color]="tokens.colors.text.primary">
                Type *
              </label>
              <select
                class="select-input"
                [(ngModel)]="prop.type"
                (ngModelChange)="emitChange()"
                [style.background]="tokens.colors.background.primary"
                [style.border-color]="tokens.colors.border.primary"
                [style.color]="tokens.colors.text.primary">
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="object">Object</option>
                <option value="array">Array</option>
                <option value="function">Function</option>
                <option value="any">Any</option>
              </select>
            </div>

            <!-- Direction -->
            <div class="form-group">
              <label class="label" [style.color]="tokens.colors.text.primary">
                Direction *
              </label>
              <select
                class="select-input"
                [(ngModel)]="prop.direction"
                (ngModelChange)="emitChange()"
                [style.background]="tokens.colors.background.primary"
                [style.border-color]="tokens.colors.border.primary"
                [style.color]="tokens.colors.text.primary">
                <option value="input">Input (receives data)</option>
                <option value="output">Output (emits events)</option>
                <option value="both">Both (bi-directional)</option>
              </select>
            </div>

            <!-- Required -->
            <div class="form-group">
              <label class="checkbox-label" [style.color]="tokens.colors.text.primary">
                <input
                  type="checkbox"
                  [(ngModel)]="prop.required"
                  (ngModelChange)="emitChange()" />
                <span>Required</span>
              </label>
            </div>
          </div>

          <!-- Default Value -->
          <div class="form-group" *ngIf="prop.direction !== 'output'">
            <label class="label" [style.color]="tokens.colors.text.primary">
              Default Value
              <span class="hint" [style.color]="tokens.colors.text.secondary">
                ({{ getDefaultValueHint(prop.type) }})
              </span>
            </label>
            <input
              *ngIf="prop.type === 'string' || prop.type === 'number'"
              [type]="prop.type === 'number' ? 'number' : 'text'"
              class="text-input"
              [ngModel]="getDefaultValueString(prop)"
              (ngModelChange)="setDefaultValue(prop, $event)"
              [placeholder]="getDefaultValuePlaceholder(prop.type)"
              [style.background]="tokens.colors.background.primary"
              [style.border-color]="tokens.colors.border.primary"
              [style.color]="tokens.colors.text.primary" />
            <select
              *ngIf="prop.type === 'boolean'"
              class="select-input"
              [ngModel]="getDefaultValueString(prop)"
              (ngModelChange)="setDefaultValue(prop, $event)"
              [style.background]="tokens.colors.background.primary"
              [style.border-color]="tokens.colors.border.primary"
              [style.color]="tokens.colors.text.primary">
              <option value="">-- Not set --</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <textarea
              *ngIf="prop.type === 'object' || prop.type === 'array' || prop.type === 'any'"
              class="textarea-input"
              [ngModel]="getDefaultValueString(prop)"
              (ngModelChange)="setDefaultValue(prop, $event)"
              [placeholder]="getDefaultValuePlaceholder(prop.type)"
              rows="2"
              [style.background]="tokens.colors.background.primary"
              [style.border-color]="tokens.colors.border.primary"
              [style.color]="tokens.colors.text.primary">
            </textarea>
          </div>

          <!-- Description -->
          <div class="form-group">
            <label class="label" [style.color]="tokens.colors.text.primary">
              Description
              <span class="hint" [style.color]="tokens.colors.text.secondary">(optional)</span>
            </label>
            <input
              type="text"
              class="text-input"
              [(ngModel)]="prop.description"
              (ngModelChange)="emitChange()"
              placeholder="Brief description of this property"
              [style.background]="tokens.colors.background.primary"
              [style.border-color]="tokens.colors.border.primary"
              [style.color]="tokens.colors.text.primary" />
          </div>
        </div>
      </div>

      <!-- Examples -->
      <div class="examples-section" *ngIf="schema.props.length > 0">
        <div class="examples-title" [style.color]="tokens.colors.text.primary">
          Common Prop Patterns:
        </div>
        <div class="examples-grid">
          <button
            *ngFor="let example of propExamples"
            type="button"
            class="example-card"
            (click)="addPropFromExample(example)"
            [style.background]="tokens.colors.background.secondary"
            [style.border-color]="tokens.colors.border.primary">
            <div class="example-name" [style.color]="tokens.colors.text.primary">
              {{ example.name }}
            </div>
            <div class="example-desc" [style.color]="tokens.colors.text.secondary">
              {{ example.description }}
            </div>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .props-schema-editor {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100%;
      overflow-y: auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .header h3 {
      font-size: 16px;
      font-weight: 600;
    }

    .description {
      font-size: 13px;
      line-height: 1.5;
    }

    .add-button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .add-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .empty-text {
      font-size: 14px;
    }

    .props-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .prop-card {
      padding: 16px;
      border: 1px solid;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .prop-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .prop-badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: white;
    }

    .delete-button {
      width: 24px;
      height: 24px;
      border: none;
      background: none;
      font-size: 16px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .delete-button:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    .prop-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .hint {
      font-size: 11px;
      font-weight: 400;
    }

    .text-input,
    .select-input,
    .textarea-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid;
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
    }

    .textarea-input {
      resize: vertical;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    }

    .text-input:focus,
    .select-input:focus,
    .textarea-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 8px 0;
    }

    .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .examples-section {
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .examples-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .examples-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }

    .example-card {
      padding: 12px;
      border: 1px solid;
      border-radius: 6px;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }

    .example-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-color: #3b82f6;
    }

    .example-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .example-desc {
      font-size: 11px;
      line-height: 1.4;
    }
  `]
})
export class PropsSchemaEditorComponent implements OnInit {
  @Input() schema: PropsSchema = { props: [] };
  @Output() schemaChange = new EventEmitter<PropsSchema>();

  tokens = DESIGN_TOKENS;

  propExamples = [
    { name: 'title', type: 'string' as PropType, direction: 'input' as PropDirection, description: 'Display title text' },
    { name: 'count', type: 'number' as PropType, direction: 'input' as PropDirection, description: 'Numeric value' },
    { name: 'isActive', type: 'boolean' as PropType, direction: 'input' as PropDirection, description: 'Active state flag' },
    { name: 'onClick', type: 'function' as PropType, direction: 'output' as PropDirection, description: 'Click event handler' },
    { name: 'data', type: 'object' as PropType, direction: 'input' as PropDirection, description: 'Data object' },
    { name: 'items', type: 'array' as PropType, direction: 'input' as PropDirection, description: 'List of items' }
  ];

  ngOnInit(): void {
    if (!this.schema.props) {
      this.schema.props = [];
    }
  }

  addProp(): void {
    const newProp: PropDefinition = {
      id: `prop_${Date.now()}`,
      name: '',
      type: 'string',
      direction: 'input',
      required: false,
      description: ''
    };
    this.schema.props.push(newProp);
    this.emitChange();
  }

  removeProp(index: number): void {
    this.schema.props.splice(index, 1);
    this.emitChange();
  }

  addPropFromExample(example: any): void {
    const newProp: PropDefinition = {
      id: `prop_${Date.now()}`,
      name: example.name,
      type: example.type,
      direction: example.direction,
      required: false,
      description: example.description
    };
    this.schema.props.push(newProp);
    this.emitChange();
  }

  getDirectionLabel(direction: PropDirection): string {
    const labels = {
      input: 'IN',
      output: 'OUT',
      both: 'I/O'
    };
    return labels[direction];
  }

  getDirectionColor(direction: PropDirection): string {
    const colors = {
      input: '#10b981',
      output: '#f59e0b',
      both: '#8b5cf6'
    };
    return colors[direction];
  }

  getDefaultValueHint(type: PropType): string {
    const hints = {
      string: 'text',
      number: '0, 42, etc.',
      boolean: 'true or false',
      object: 'JSON object',
      array: 'JSON array',
      function: 'not applicable',
      any: 'JSON value'
    };
    return hints[type];
  }

  getDefaultValuePlaceholder(type: PropType): string {
    const placeholders = {
      string: 'Default text...',
      number: '0',
      boolean: '',
      object: '{ "key": "value" }',
      array: '["item1", "item2"]',
      function: '',
      any: '{ "any": "value" }'
    };
    return placeholders[type];
  }

  getDefaultValueString(prop: PropDefinition): string {
    if (prop.defaultValue === undefined || prop.defaultValue === null) {
      return '';
    }
    if (prop.type === 'string' || prop.type === 'number' || prop.type === 'boolean') {
      return String(prop.defaultValue);
    }
    try {
      return JSON.stringify(prop.defaultValue, null, 2);
    } catch {
      return '';
    }
  }

  setDefaultValue(prop: PropDefinition, value: string): void {
    if (!value.trim()) {
      prop.defaultValue = undefined;
      this.emitChange();
      return;
    }

    if (prop.type === 'string') {
      prop.defaultValue = value;
    } else if (prop.type === 'number') {
      prop.defaultValue = parseFloat(value);
    } else if (prop.type === 'boolean') {
      prop.defaultValue = value === 'true';
    } else {
      try {
        prop.defaultValue = JSON.parse(value);
      } catch {
        // Invalid JSON, don't update
        return;
      }
    }
    this.emitChange();
  }

  emitChange(): void {
    this.schemaChange.emit({ ...this.schema });
  }
}
