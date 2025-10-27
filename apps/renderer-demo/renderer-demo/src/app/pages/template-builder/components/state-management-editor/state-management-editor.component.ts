import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

export interface StateVariable {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue: any;
  description?: string;
}

/**
 * State Management Editor Component
 *
 * Visual editor for component state variables with type safety and default values.
 */
@Component({
  selector: 'app-state-management-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="state-editor" [style.font-family]="tokens.typography.fontFamily">
      <div class="editor-header">
        <h3>State Variables</h3>
        <button class="add-btn" (click)="addVariable()">+ Add Variable</button>
      </div>

      <div class="empty-state" *ngIf="variables.length === 0">
        <div class="empty-icon">📊</div>
        <div class="empty-text">No state variables defined</div>
        <button class="add-variable-btn" (click)="addVariable()">Add Variable</button>
      </div>

      <div class="variables-list" *ngIf="variables.length > 0">
        <div *ngFor="let variable of variables; let i = index" class="variable-card">
          <div class="variable-header">
            <input [(ngModel)]="variable.name" (input)="emitChange()" placeholder="variableName" class="name-input" />
            <select [(ngModel)]="variable.type" (change)="onTypeChange(variable)" class="type-select">
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="object">Object</option>
              <option value="array">Array</option>
            </select>
            <button class="icon-btn delete" (click)="deleteVariable(i)">×</button>
          </div>

          <div class="variable-body">
            <label>Default Value</label>
            <input *ngIf="variable.type === 'string'" type="text" [(ngModel)]="variable.defaultValue" (input)="emitChange()" class="value-input" />
            <input *ngIf="variable.type === 'number'" type="number" [(ngModel)]="variable.defaultValue" (input)="emitChange()" class="value-input" />
            <label *ngIf="variable.type === 'boolean'" class="checkbox-label">
              <input type="checkbox" [(ngModel)]="variable.defaultValue" (change)="emitChange()" />
              <span>{{ variable.defaultValue }}</span>
            </label>
            <textarea *ngIf="variable.type === 'object' || variable.type === 'array'"
              [value]="getJsonValue(variable)"
              (input)="updateJsonValue(variable, $event)"
              class="json-textarea" rows="3"
              [placeholder]="variable.type === 'array' ? '[]' : '{}'"></textarea>

            <label>Description (optional)</label>
            <input type="text" [(ngModel)]="variable.description" (input)="emitChange()" placeholder="Variable description" class="description-input" />
          </div>
        </div>
      </div>

      <div class="code-section">
        <div class="code-header">
          <span>Generated Code</span>
          <button class="copy-btn" (click)="copyCode()" title="Copy">📋</button>
        </div>
        <pre class="code-output">{{ generateCode() }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .state-editor { padding: 16px; background: white; border-radius: 8px; max-height: 90vh; overflow-y: auto; width: 100%; max-width: 600px; }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .editor-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
    .add-btn, .add-variable-btn { padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .add-btn:hover, .add-variable-btn:hover { background: #5568d3; }
    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; color: #999; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
    .empty-text { font-size: 14px; margin-bottom: 16px; }
    .variables-list { display: flex; flex-direction: column; gap: 12px; }
    .variable-card { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; }
    .variable-header { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
    .name-input { flex: 1; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 13px; font-family: 'Monaco', monospace; }
    .type-select { padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 12px; background: white; }
    .icon-btn { width: 28px; height: 28px; border: 1px solid #e0e0e0; background: white; border-radius: 4px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
    .icon-btn.delete:hover { background: #fee; border-color: #ef4444; color: #ef4444; }
    .variable-body { display: flex; flex-direction: column; gap: 8px; }
    .variable-body label { font-size: 11px; font-weight: 600; color: #666; }
    .value-input, .description-input { width: 100%; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 13px; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; }
    .checkbox-label input { width: 18px; height: 18px; }
    .json-textarea { width: 100%; padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 12px; font-family: 'Monaco', monospace; resize: vertical; }
    .code-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0; }
    .code-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .code-header span { font-size: 12px; font-weight: 600; color: #666; }
    .copy-btn { border: none; background: none; cursor: pointer; font-size: 16px; opacity: 0.6; }
    .copy-btn:hover { opacity: 1; }
    .code-output { padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 11px; background: #f9f9f9; white-space: pre-wrap; }
  `]
})
export class StateManagementEditorComponent {
  @Input() variables: StateVariable[] = [];
  @Output() variablesChange = new EventEmitter<StateVariable[]>();

  tokens = DESIGN_TOKENS;

  addVariable(): void {
    this.variables.push({
      id: Date.now().toString(),
      name: `variable${this.variables.length + 1}`,
      type: 'string',
      defaultValue: '',
      description: ''
    });
    this.emitChange();
  }

  deleteVariable(index: number): void {
    if (confirm('Delete this variable?')) {
      this.variables.splice(index, 1);
      this.emitChange();
    }
  }

  onTypeChange(variable: StateVariable): void {
    switch (variable.type) {
      case 'string': variable.defaultValue = ''; break;
      case 'number': variable.defaultValue = 0; break;
      case 'boolean': variable.defaultValue = false; break;
      case 'object': variable.defaultValue = {}; break;
      case 'array': variable.defaultValue = []; break;
    }
    this.emitChange();
  }

  getJsonValue(variable: StateVariable): string {
    try {
      return JSON.stringify(variable.defaultValue, null, 2);
    } catch {
      return '{}';
    }
  }

  updateJsonValue(variable: StateVariable, event: Event): void {
    try {
      variable.defaultValue = JSON.parse((event.target as HTMLTextAreaElement).value);
      this.emitChange();
    } catch (e) {
      // Invalid JSON
    }
  }

  generateCode(): string {
    if (this.variables.length === 0) return '// No state variables';

    return this.variables.map(v => {
      const val = typeof v.defaultValue === 'string' ? `'${v.defaultValue}'` : JSON.stringify(v.defaultValue);
      return `${v.name}: ${v.type} = ${val}; // ${v.description || 'No description'}`;
    }).join('\n');
  }

  copyCode(): void {
    navigator.clipboard.writeText(this.generateCode());
  }

  emitChange(): void {
    this.variablesChange.emit([...this.variables]);
  }
}
