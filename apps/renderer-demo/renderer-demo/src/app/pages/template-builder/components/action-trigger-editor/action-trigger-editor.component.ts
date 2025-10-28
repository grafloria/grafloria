import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

export interface Trigger {
  id: string;
  name: string;
  triggerType: 'onMount' | 'onUnmount' | 'onStateChange' | 'onInterval' | 'onCondition' | 'custom';
  condition?: string;
  interval?: number;
  stateKey?: string;
  actions: TriggerAction[];
  enabled: boolean;
}

export interface TriggerAction {
  id: string;
  actionType: string;
  target?: string;
  params?: Record<string, any>;
}

/**
 * Action Trigger Editor Component
 *
 * Configure triggers that execute actions based on lifecycle events, state changes, or custom conditions.
 */
@Component({
  selector: 'app-action-trigger-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="trigger-editor" [style.font-family]="tokens.typography.fontFamily">
      <div class="editor-header">
        <h3>Action Triggers</h3>
        <button class="add-btn" (click)="addTrigger()">+ Add Trigger</button>
      </div>

      <div class="empty-state" *ngIf="triggers.length === 0">
        <div class="empty-icon">⚡</div>
        <div class="empty-text">No action triggers configured</div>
        <button class="add-trigger-btn" (click)="addTrigger()">Create Trigger</button>
      </div>

      <div class="triggers-list" *ngIf="triggers.length > 0">
        <div *ngFor="let trigger of triggers; let i = index" class="trigger-card" [class.disabled]="!trigger.enabled">
          <div class="trigger-header">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="trigger.enabled" (change)="emitChange()" />
              <input type="text" [(ngModel)]="trigger.name" (input)="emitChange()" placeholder="Trigger name" class="name-input" />
            </label>
            <button class="icon-btn delete" (click)="deleteTrigger(i)">×</button>
          </div>

          <div class="trigger-body" *ngIf="trigger.enabled">
            <div class="setting-group">
              <label>Trigger Type</label>
              <select [(ngModel)]="trigger.triggerType" (change)="onTriggerTypeChange(trigger)" class="select-input">
                <optgroup label="Lifecycle">
                  <option value="onMount">On Mount</option>
                  <option value="onUnmount">On Unmount</option>
                </optgroup>
                <optgroup label="State">
                  <option value="onStateChange">On State Change</option>
                </optgroup>
                <optgroup label="Time">
                  <option value="onInterval">On Interval</option>
                </optgroup>
                <optgroup label="Conditional">
                  <option value="onCondition">On Condition</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="custom">Custom</option>
                </optgroup>
              </select>
            </div>

            <div class="setting-group" *ngIf="trigger.triggerType === 'onStateChange'">
              <label>State Key</label>
              <input type="text" [(ngModel)]="trigger.stateKey" (input)="emitChange()" placeholder="e.g., count" class="text-input" />
            </div>

            <div class="setting-group" *ngIf="trigger.triggerType === 'onInterval'">
              <label>Interval (ms)</label>
              <input type="number" min="0" [(ngModel)]="trigger.interval" (input)="emitChange()" class="number-input" />
            </div>

            <div class="setting-group" *ngIf="trigger.triggerType === 'onCondition' || trigger.triggerType === 'custom'">
              <label>Condition (JavaScript)</label>
              <textarea [(ngModel)]="trigger.condition" (input)="emitChange()" placeholder="e.g., state.count > 10" class="condition-textarea" rows="2"></textarea>
            </div>

            <div class="actions-section">
              <div class="actions-header">
                <label>Actions ({{ trigger.actions.length }})</label>
                <button class="add-action-btn" (click)="addAction(trigger)">+ Add Action</button>
              </div>

              <div class="actions-list">
                <div *ngFor="let action of trigger.actions; let j = index" class="action-item">
                  <div class="action-number">{{ j + 1 }}</div>
                  <div class="action-content">
                    <select [(ngModel)]="action.actionType" (change)="emitChange()" class="select-input">
                      <option value="setState">Set State</option>
                      <option value="emitEvent">Emit Event</option>
                      <option value="callFunction">Call Function</option>
                      <option value="navigate">Navigate</option>
                      <option value="showNotification">Show Notification</option>
                      <option value="animate">Animate</option>
                      <option value="customScript">Custom Script</option>
                    </select>
                    <textarea [(ngModel)]="actionParamsJson[action.id]" (input)="updateActionParams(action)" placeholder='{"key": "value"}' class="json-textarea" rows="2"></textarea>
                  </div>
                  <button class="icon-btn delete" (click)="deleteAction(trigger, j)">×</button>
                </div>

                <div class="empty-actions" *ngIf="trigger.actions.length === 0">
                  <button class="add-action-btn" (click)="addAction(trigger)">Add First Action</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="presets-section" *ngIf="triggers.length > 0">
        <label class="section-label">Quick Presets</label>
        <div class="presets-grid">
          <button *ngFor="let preset of presets" class="preset-btn" (click)="applyPreset(preset)">
            <div class="preset-icon">{{ preset.icon }}</div>
            <div class="preset-name">{{ preset.name }}</div>
          </button>
        </div>
      </div>

      <div class="code-section">
        <div class="code-header">
          <span>Generated Code</span>
          <button class="copy-btn" (click)="copyCode()">📋</button>
        </div>
        <pre class="code-output">{{ generateCode() }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .trigger-editor { padding: 16px; background: white; border-radius: 8px; max-height: 90vh; overflow-y: auto; width: 100%; max-width: 650px; }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .editor-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
    .add-btn, .add-trigger-btn { padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; }
    .add-btn:hover, .add-trigger-btn:hover { background: #5568d3; }
    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; color: #999; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
    .empty-text { font-size: 14px; margin-bottom: 16px; }
    .triggers-list { display: flex; flex-direction: column; gap: 16px; }
    .trigger-card { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; }
    .trigger-card.disabled { opacity: 0.6; }
    .trigger-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; flex: 1; }
    .checkbox-label input[type="checkbox"] { width: 18px; height: 18px; }
    .name-input { flex: 1; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; font-weight: 500; }
    .icon-btn { width: 28px; height: 28px; border: 1px solid #e0e0e0; background: white; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .icon-btn.delete:hover { background: #fee; border-color: #ef4444; color: #ef4444; }
    .trigger-body { display: flex; flex-direction: column; gap: 12px; }
    .setting-group { display: flex; flex-direction: column; gap: 6px; }
    .setting-group label { font-size: 11px; font-weight: 600; color: #666; }
    .select-input, .text-input { width: 100%; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 13px; background: white; }
    .number-input { width: 100%; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 13px; font-family: 'Monaco', monospace; }
    .condition-textarea, .json-textarea { width: 100%; padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 12px; font-family: 'Monaco', monospace; resize: vertical; }
    .actions-section { margin-top: 8px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e0e0e0; }
    .actions-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .actions-header label { font-size: 12px; font-weight: 600; color: #666; }
    .add-action-btn { padding: 6px 12px; background: white; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 12px; cursor: pointer; }
    .add-action-btn:hover { border-color: #667eea; background: rgba(102, 126, 234, 0.05); }
    .actions-list { display: flex; flex-direction: column; gap: 12px; }
    .action-item { display: flex; gap: 12px; padding: 12px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; }
    .action-number { width: 28px; height: 28px; background: #667eea; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .action-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .empty-actions { display: flex; justify-content: center; padding: 12px; }
    .presets-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0; }
    .section-label { display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 12px; }
    .presets-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .preset-btn { padding: 12px; border: 1px solid #e0e0e0; background: white; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .preset-btn:hover { border-color: #667eea; background: rgba(102, 126, 234, 0.05); transform: translateY(-2px); }
    .preset-icon { font-size: 24px; }
    .preset-name { font-size: 11px; font-weight: 500; color: #666; text-align: center; }
    .code-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0; }
    .code-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .code-header span { font-size: 12px; font-weight: 600; color: #666; }
    .copy-btn { border: none; background: none; cursor: pointer; font-size: 16px; opacity: 0.6; }
    .copy-btn:hover { opacity: 1; }
    .code-output { padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 11px; background: #f9f9f9; white-space: pre-wrap; }
  `]
})
export class ActionTriggerEditorComponent {
  @Input() triggers: Trigger[] = [];
  @Output() triggersChange = new EventEmitter<Trigger[]>();

  tokens = DESIGN_TOKENS;
  actionParamsJson: Record<string, string> = {};

  presets = [
    { name: 'Init State', icon: '🚀', trigger: { name: 'Initialize', triggerType: 'onMount', actions: [{ actionType: 'setState', params: { initialized: true } }] } },
    { name: 'Auto Save', icon: '💾', trigger: { name: 'Auto Save', triggerType: 'onInterval', interval: 30000, actions: [{ actionType: 'callFunction', params: { function: 'saveData' } }] } },
    { name: 'Cleanup', icon: '🧹', trigger: { name: 'Cleanup', triggerType: 'onUnmount', actions: [{ actionType: 'callFunction', params: { function: 'cleanup' } }] } },
    { name: 'Notify', icon: '🔔', trigger: { name: 'Notify on Change', triggerType: 'onStateChange', stateKey: 'status', actions: [{ actionType: 'showNotification', params: { message: 'Status changed' } }] } }
  ];

  addTrigger(): void {
    const newTrigger: Trigger = {
      id: Date.now().toString(),
      name: `Trigger ${this.triggers.length + 1}`,
      triggerType: 'onMount',
      actions: [],
      enabled: true
    };
    this.triggers.push(newTrigger);
    this.emitChange();
  }

  deleteTrigger(index: number): void {
    if (confirm('Delete this trigger?')) {
      this.triggers.splice(index, 1);
      this.emitChange();
    }
  }

  onTriggerTypeChange(trigger: Trigger): void {
    if (trigger.triggerType === 'onInterval' && !trigger.interval) trigger.interval = 1000;
    this.emitChange();
  }

  addAction(trigger: Trigger): void {
    const newAction: TriggerAction = {
      id: Date.now().toString(),
      actionType: 'setState',
      params: {}
    };
    trigger.actions.push(newAction);
    this.actionParamsJson[newAction.id] = JSON.stringify({}, null, 2);
    this.emitChange();
  }

  deleteAction(trigger: Trigger, index: number): void {
    trigger.actions.splice(index, 1);
    this.emitChange();
  }

  updateActionParams(action: TriggerAction): void {
    try {
      action.params = JSON.parse(this.actionParamsJson[action.id]);
      this.emitChange();
    } catch (e) {
      // Invalid JSON
    }
  }

  applyPreset(preset: any): void {
    const newTrigger: Trigger = {
      id: Date.now().toString(),
      name: preset.trigger.name,
      triggerType: preset.trigger.triggerType,
      interval: preset.trigger.interval,
      stateKey: preset.trigger.stateKey,
      actions: preset.trigger.actions.map((a: any) => ({
        id: Date.now().toString(),
        actionType: a.actionType,
        params: a.params || {}
      })),
      enabled: true
    };

    newTrigger.actions.forEach(action => {
      this.actionParamsJson[action.id] = JSON.stringify(action.params || {}, null, 2);
    });

    this.triggers.push(newTrigger);
    this.emitChange();
  }

  generateCode(): string {
    if (this.triggers.length === 0) return '// No triggers configured';

    return this.triggers
      .filter(t => t.enabled)
      .map(trigger => {
        const actions = trigger.actions.map(a => `  - ${a.actionType}(${JSON.stringify(a.params)})`).join('\n');
        return `${trigger.triggerType}:\n  name: ${trigger.name}\n  actions:\n${actions || '  (none)'}`;
      })
      .join('\n\n');
  }

  copyCode(): void {
    navigator.clipboard.writeText(this.generateCode());
  }

  emitChange(): void {
    this.triggersChange.emit([...this.triggers]);
  }
}
