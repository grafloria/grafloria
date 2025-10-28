import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Event handler configuration
 */
export interface EventHandler {
  id: string;
  eventType: string;
  actions: Action[];
  condition?: string;
  debounce?: number;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled: boolean;
}

/**
 * Action to perform on event
 */
export interface Action {
  id: string;
  type: string;
  target?: string;
  params?: Record<string, any>;
  delay?: number;
}

/**
 * Event Handler Configuration Component
 *
 * A comprehensive event handler editor with:
 * - Multiple event type support (click, hover, input, etc.)
 * - Action chaining (multiple actions per event)
 * - Conditional execution (JavaScript expressions)
 * - Debounce/throttle configuration
 * - Event behavior controls (preventDefault, stopPropagation)
 * - Visual action flow display
 * - Action templates/presets
 * - Testing/simulation mode
 *
 * Usage:
 * ```html
 * <app-event-handler-config
 *   [handlers]="eventHandlers"
 *   (handlersChange)="onHandlersChange($event)">
 * </app-event-handler-config>
 * ```
 */
@Component({
  selector: 'app-event-handler-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="event-config" [style.font-family]="tokens.typography.fontFamily">
      <!-- Header -->
      <div class="config-header">
        <h3>Event Handlers</h3>
        <button class="add-btn" (click)="addHandler()">
          + Add Handler
        </button>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="handlers.length === 0">
        <div class="empty-icon">⚡</div>
        <div class="empty-text">No event handlers configured</div>
        <button class="add-handler-btn" (click)="addHandler()">
          Add Event Handler
        </button>
      </div>

      <!-- Handler List -->
      <div class="handlers-list" *ngIf="handlers.length > 0">
        <div
          *ngFor="let handler of handlers; let i = index; trackBy: trackByHandlerId"
          class="handler-card"
          [class.disabled]="!handler.enabled"
        >
          <!-- Handler Header -->
          <div class="handler-header">
            <div class="handler-title">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="handler.enabled"
                  (change)="emitChange()"
                />
                <span class="event-badge">{{ handler.eventType }}</span>
              </label>
            </div>
            <div class="handler-actions">
              <button class="icon-btn" (click)="duplicateHandler(handler)" title="Duplicate">
                ⧉
              </button>
              <button class="icon-btn delete" (click)="deleteHandler(i)" title="Delete">
                ×
              </button>
            </div>
          </div>

          <!-- Handler Settings -->
          <div class="handler-settings" *ngIf="handler.enabled">
            <!-- Event Type -->
            <div class="setting-group">
              <label>Event Type</label>
              <select [(ngModel)]="handler.eventType" (change)="emitChange()">
                <optgroup label="Mouse Events">
                  <option value="click">Click</option>
                  <option value="dblclick">Double Click</option>
                  <option value="mouseenter">Mouse Enter</option>
                  <option value="mouseleave">Mouse Leave</option>
                  <option value="mousemove">Mouse Move</option>
                  <option value="mousedown">Mouse Down</option>
                  <option value="mouseup">Mouse Up</option>
                </optgroup>
                <optgroup label="Input Events">
                  <option value="input">Input</option>
                  <option value="change">Change</option>
                  <option value="focus">Focus</option>
                  <option value="blur">Blur</option>
                  <option value="keydown">Key Down</option>
                  <option value="keyup">Key Up</option>
                  <option value="keypress">Key Press</option>
                </optgroup>
                <optgroup label="Form Events">
                  <option value="submit">Submit</option>
                  <option value="reset">Reset</option>
                </optgroup>
                <optgroup label="Custom Events">
                  <option value="custom">Custom Event</option>
                </optgroup>
              </select>
            </div>

            <!-- Condition -->
            <div class="setting-group">
              <label>Condition (optional)</label>
              <input
                type="text"
                [(ngModel)]="handler.condition"
                (input)="emitChange()"
                placeholder="e.g., event.target.value > 10"
                class="text-input"
              />
              <div class="help-text">JavaScript expression that must return true</div>
            </div>

            <!-- Event Behavior -->
            <div class="setting-group">
              <label>Event Behavior</label>
              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="handler.preventDefault"
                    (change)="emitChange()"
                  />
                  <span>Prevent Default</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="handler.stopPropagation"
                    (change)="emitChange()"
                  />
                  <span>Stop Propagation</span>
                </label>
              </div>
            </div>

            <!-- Debounce -->
            <div class="setting-group">
              <label>Debounce (ms)</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="50"
                  [(ngModel)]="handler.debounce"
                  (input)="emitChange()"
                />
                <input
                  type="number"
                  min="0"
                  [(ngModel)]="handler.debounce"
                  (input)="emitChange()"
                  class="number-input"
                />
                <span class="unit">ms</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="actions-section">
              <div class="actions-header">
                <label>Actions ({{ handler.actions.length }})</label>
                <button class="add-action-btn" (click)="addAction(handler)">
                  + Add Action
                </button>
              </div>

              <!-- Action List -->
              <div class="actions-list">
                <div
                  *ngFor="let action of handler.actions; let j = index; trackBy: trackByActionId"
                  class="action-item"
                >
                  <!-- Action Number -->
                  <div class="action-number">{{ j + 1 }}</div>

                  <!-- Action Content -->
                  <div class="action-content">
                    <!-- Action Type -->
                    <div class="action-field">
                      <label>Type</label>
                      <select [(ngModel)]="action.type" (change)="emitChange()">
                        <optgroup label="State Actions">
                          <option value="setState">Set State</option>
                          <option value="updateState">Update State</option>
                          <option value="resetState">Reset State</option>
                        </optgroup>
                        <optgroup label="Navigation">
                          <option value="navigate">Navigate</option>
                          <option value="openUrl">Open URL</option>
                        </optgroup>
                        <optgroup label="Data Actions">
                          <option value="emitEvent">Emit Event</option>
                          <option value="callApi">Call API</option>
                          <option value="updateData">Update Data</option>
                        </optgroup>
                        <optgroup label="UI Actions">
                          <option value="showModal">Show Modal</option>
                          <option value="showNotification">Show Notification</option>
                          <option value="toggleVisibility">Toggle Visibility</option>
                        </optgroup>
                        <optgroup label="Animation">
                          <option value="animate">Animate</option>
                          <option value="playAnimation">Play Animation</option>
                        </optgroup>
                        <optgroup label="Other">
                          <option value="customScript">Custom Script</option>
                        </optgroup>
                      </select>
                    </div>

                    <!-- Action Target -->
                    <div class="action-field" *ngIf="needsTarget(action.type)">
                      <label>Target</label>
                      <input
                        type="text"
                        [(ngModel)]="action.target"
                        (input)="emitChange()"
                        placeholder="e.g., #nodeId or .className"
                        class="text-input"
                      />
                    </div>

                    <!-- Action Parameters -->
                    <div class="action-field">
                      <label>Parameters (JSON)</label>
                      <textarea
                        [(ngModel)]="actionParamsJson[action.id]"
                        (input)="updateActionParams(action)"
                        placeholder='{ "key": "value" }'
                        class="json-textarea"
                        rows="3"
                      ></textarea>
                    </div>

                    <!-- Action Delay -->
                    <div class="action-field">
                      <label>Delay (ms)</label>
                      <input
                        type="number"
                        min="0"
                        [(ngModel)]="action.delay"
                        (input)="emitChange()"
                        placeholder="0"
                        class="number-input"
                      />
                    </div>
                  </div>

                  <!-- Action Controls -->
                  <div class="action-controls">
                    <button class="icon-btn" (click)="moveActionUp(handler, j)" [disabled]="j === 0" title="Move up">
                      ↑
                    </button>
                    <button class="icon-btn" (click)="moveActionDown(handler, j)" [disabled]="j === handler.actions.length - 1" title="Move down">
                      ↓
                    </button>
                    <button class="icon-btn delete" (click)="deleteAction(handler, j)" title="Delete">
                      ×
                    </button>
                  </div>
                </div>

                <!-- Empty Actions -->
                <div class="empty-actions" *ngIf="handler.actions.length === 0">
                  <div class="empty-actions-text">No actions configured</div>
                  <button class="add-action-btn" (click)="addAction(handler)">
                    Add First Action
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Templates -->
      <div class="templates-section" *ngIf="handlers.length > 0">
        <label class="section-label">Quick Templates</label>
        <div class="templates-grid">
          <button
            *ngFor="let template of templates"
            class="template-btn"
            (click)="applyTemplate(template)"
            [title]="template.description"
          >
            <div class="template-icon">{{ template.icon }}</div>
            <div class="template-name">{{ template.name }}</div>
          </button>
        </div>
      </div>

      <!-- Code Output -->
      <div class="code-section">
        <div class="code-header">
          <span>Generated Code</span>
          <button class="copy-btn" (click)="copyCodeToClipboard()" title="Copy code">
            📋
          </button>
        </div>
        <pre class="code-output">{{ generateCode() }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .event-config {
      padding: 16px;
      background: white;
      border-radius: 8px;
      max-height: 90vh;
      overflow-y: auto;
      width: 100%;
      max-width: 650px;
    }

    .config-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .config-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .add-btn {
      padding: 8px 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-btn:hover {
      background: #5568d3;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: #999;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 14px;
      margin-bottom: 16px;
    }

    .add-handler-btn {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-handler-btn:hover {
      background: #5568d3;
    }

    .handlers-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .handler-card {
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s;
    }

    .handler-card.disabled {
      opacity: 0.6;
    }

    .handler-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .handler-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .event-badge {
      padding: 4px 12px;
      background: #667eea;
      color: white;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .handler-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      width: 28px;
      height: 28px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .icon-btn:hover:not(:disabled) {
      background: #f0f0f0;
      border-color: #667eea;
    }

    .icon-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .icon-btn.delete:hover:not(:disabled) {
      background: #fee;
      border-color: #ef4444;
      color: #ef4444;
    }

    .handler-settings {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .setting-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .setting-group > label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    select,
    .text-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      background: white;
    }

    select:focus,
    .text-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .help-text {
      font-size: 11px;
      color: #999;
      font-style: italic;
    }

    .checkbox-group {
      display: flex;
      gap: 16px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
      color: #333;
    }

    .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .slider-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .slider-control input[type="range"] {
      flex: 1;
      height: 24px;
      -webkit-appearance: none;
      appearance: none;
      background: #e0e0e0;
      border-radius: 12px;
      outline: none;
    }

    .slider-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
    }

    .slider-control input[type="range"]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      border: none;
    }

    .number-input {
      width: 80px;
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .unit {
      font-size: 12px;
      color: #999;
      min-width: 32px;
    }

    .actions-section {
      margin-top: 8px;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
    }

    .actions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .actions-header label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .add-action-btn {
      padding: 6px 12px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-action-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .action-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
    }

    .action-number {
      width: 32px;
      height: 32px;
      background: #667eea;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .action-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .action-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .action-field label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
    }

    .json-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 12px;
      font-family: 'Monaco', 'Courier New', monospace;
      resize: vertical;
    }

    .json-textarea:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .action-controls {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex-shrink: 0;
    }

    .empty-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px;
      color: #999;
    }

    .empty-actions-text {
      font-size: 13px;
    }

    .templates-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
    }

    .section-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }

    .templates-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .template-btn {
      padding: 12px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .template-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
      transform: translateY(-2px);
    }

    .template-icon {
      font-size: 24px;
    }

    .template-name {
      font-size: 11px;
      font-weight: 500;
      color: #666;
      text-align: center;
    }

    .code-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
    }

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .code-header span {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .copy-btn {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      opacity: 0.6;
      transition: opacity 0.2s;
    }

    .copy-btn:hover {
      opacity: 1;
    }

    .code-output {
      width: 100%;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      background: #f9f9f9;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  `]
})
export class EventHandlerConfigComponent implements OnInit {
  @Input() handlers: EventHandler[] = [];
  @Output() handlersChange = new EventEmitter<EventHandler[]>();

  tokens = DESIGN_TOKENS;
  actionParamsJson: Record<string, string> = {};

  templates = [
    {
      name: 'Toggle Visibility',
      icon: '👁️',
      description: 'Toggle element visibility on click',
      handler: {
        eventType: 'click',
        actions: [{ type: 'toggleVisibility', target: '#targetId' }]
      }
    },
    {
      name: 'Show Notification',
      icon: '🔔',
      description: 'Show notification on click',
      handler: {
        eventType: 'click',
        actions: [{ type: 'showNotification', params: { message: 'Success!', type: 'success' } }]
      }
    },
    {
      name: 'Update State',
      icon: '🔄',
      description: 'Update component state',
      handler: {
        eventType: 'input',
        debounce: 300,
        actions: [{ type: 'setState', params: { key: 'value' } }]
      }
    },
    {
      name: 'Emit Event',
      icon: '📡',
      description: 'Emit custom event',
      handler: {
        eventType: 'click',
        actions: [{ type: 'emitEvent', params: { eventName: 'customEvent', data: {} } }]
      }
    }
  ];

  ngOnInit(): void {
    // Initialize action params JSON
    this.handlers.forEach(handler => {
      handler.actions.forEach(action => {
        this.actionParamsJson[action.id] = JSON.stringify(action.params || {}, null, 2);
      });
    });
  }

  /**
   * Add new handler
   */
  addHandler(): void {
    const newHandler: EventHandler = {
      id: this.generateId(),
      eventType: 'click',
      actions: [],
      debounce: 0,
      preventDefault: false,
      stopPropagation: false,
      enabled: true
    };
    this.handlers.push(newHandler);
    this.emitChange();
  }

  /**
   * Delete handler
   */
  deleteHandler(index: number): void {
    if (confirm('Delete this event handler?')) {
      this.handlers.splice(index, 1);
      this.emitChange();
    }
  }

  /**
   * Duplicate handler
   */
  duplicateHandler(handler: EventHandler): void {
    const duplicate: EventHandler = {
      ...handler,
      id: this.generateId(),
      actions: handler.actions.map(action => ({
        ...action,
        id: this.generateId()
      }))
    };
    this.handlers.push(duplicate);
    this.emitChange();
  }

  /**
   * Add action to handler
   */
  addAction(handler: EventHandler): void {
    const newAction: Action = {
      id: this.generateId(),
      type: 'setState',
      params: {},
      delay: 0
    };
    handler.actions.push(newAction);
    this.actionParamsJson[newAction.id] = JSON.stringify({}, null, 2);
    this.emitChange();
  }

  /**
   * Delete action
   */
  deleteAction(handler: EventHandler, index: number): void {
    handler.actions.splice(index, 1);
    this.emitChange();
  }

  /**
   * Move action up
   */
  moveActionUp(handler: EventHandler, index: number): void {
    if (index > 0) {
      [handler.actions[index], handler.actions[index - 1]] =
        [handler.actions[index - 1], handler.actions[index]];
      this.emitChange();
    }
  }

  /**
   * Move action down
   */
  moveActionDown(handler: EventHandler, index: number): void {
    if (index < handler.actions.length - 1) {
      [handler.actions[index], handler.actions[index + 1]] =
        [handler.actions[index + 1], handler.actions[index]];
      this.emitChange();
    }
  }

  /**
   * Update action params from JSON textarea
   */
  updateActionParams(action: Action): void {
    try {
      action.params = JSON.parse(this.actionParamsJson[action.id]);
      this.emitChange();
    } catch (e) {
      // Invalid JSON, don't update
    }
  }

  /**
   * Check if action type needs target
   */
  needsTarget(type: string): boolean {
    return ['toggleVisibility', 'animate', 'navigate'].includes(type);
  }

  /**
   * Apply template
   */
  applyTemplate(template: any): void {
    const newHandler: EventHandler = {
      id: this.generateId(),
      eventType: template.handler.eventType,
      actions: template.handler.actions.map((action: any) => ({
        id: this.generateId(),
        type: action.type,
        target: action.target,
        params: action.params || {},
        delay: action.delay || 0
      })),
      debounce: template.handler.debounce || 0,
      preventDefault: false,
      stopPropagation: false,
      enabled: true
    };

    // Initialize action params JSON
    newHandler.actions.forEach(action => {
      this.actionParamsJson[action.id] = JSON.stringify(action.params || {}, null, 2);
    });

    this.handlers.push(newHandler);
    this.emitChange();
  }

  /**
   * Generate code output
   */
  generateCode(): string {
    if (this.handlers.length === 0) {
      return '// No event handlers configured';
    }

    const code = this.handlers
      .filter(h => h.enabled)
      .map(handler => {
        const actions = handler.actions
          .map(action => `  - ${action.type}(${JSON.stringify(action.params)})`)
          .join('\n');

        return `on${handler.eventType}:
  condition: ${handler.condition || 'none'}
  debounce: ${handler.debounce}ms
  preventDefault: ${handler.preventDefault}
  stopPropagation: ${handler.stopPropagation}
  actions:
${actions || '  (none)'}`;
      })
      .join('\n\n');

    return code;
  }

  /**
   * Copy code to clipboard
   */
  copyCodeToClipboard(): void {
    navigator.clipboard.writeText(this.generateCode()).then(() => {
      console.log('Code copied to clipboard');
    });
  }

  /**
   * Emit change event
   */
  emitChange(): void {
    this.handlersChange.emit([...this.handlers]);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track by handler ID
   */
  trackByHandlerId(index: number, handler: EventHandler): string {
    return handler.id;
  }

  /**
   * Track by action ID
   */
  trackByActionId(index: number, action: Action): string {
    return action.id;
  }
}
