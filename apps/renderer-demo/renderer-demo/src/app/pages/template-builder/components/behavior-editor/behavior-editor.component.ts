import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Event handler configuration
 */
export interface EventHandler {
  id: string;
  event: 'click' | 'hover' | 'input' | 'change' | 'focus' | 'blur' | 'custom';
  customEvent?: string;
  action: 'emit-event' | 'update-state' | 'navigate' | 'call-function' | 'custom';
  target?: string;
  params?: Record<string, any>;
  condition?: string;
  enabled: boolean;
}

/**
 * State variable configuration
 */
export interface StateVariable {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue: any;
  description?: string;
}

/**
 * Behavior configuration
 */
export interface BehaviorConfig {
  eventHandlers: EventHandler[];
  stateVariables: StateVariable[];
  draggable?: boolean;
  selectable?: boolean;
  resizable?: boolean;
}

/**
 * Behavior Editor Component
 *
 * Visual editor for node interactivity and behavior:
 * - Event handlers (click, hover, etc.)
 * - State variables
 * - Drag/resize/select configuration
 *
 * Phase 6: Behavior & Interactivity
 *
 * Usage:
 * ```html
 * <app-behavior-editor
 *   [behavior]="behaviorConfig"
 *   (behaviorChange)="onBehaviorChange($event)">
 * </app-behavior-editor>
 * ```
 */
@Component({
  selector: 'app-behavior-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="behavior-editor" [style.font-family]="tokens.typography.fontFamily">
      <!-- Header -->
      <div class="editor-header">
        <h3>Behavior Configuration</h3>
      </div>

      <!-- Interactive Options -->
      <div class="section">
        <label class="section-label">Interactive Options</label>
        <div class="options-grid">
          <label class="option-checkbox">
            <input
              type="checkbox"
              [(ngModel)]="behavior.draggable"
              (ngModelChange)="emitChange()">
            <span>Draggable</span>
          </label>
          <label class="option-checkbox">
            <input
              type="checkbox"
              [(ngModel)]="behavior.selectable"
              (ngModelChange)="emitChange()">
            <span>Selectable</span>
          </label>
          <label class="option-checkbox">
            <input
              type="checkbox"
              [(ngModel)]="behavior.resizable"
              (ngModelChange)="emitChange()">
            <span>Resizable</span>
          </label>
        </div>
      </div>

      <!-- Event Handlers -->
      <div class="section">
        <div class="section-header">
          <label class="section-label">Event Handlers</label>
          <button
            class="add-btn"
            (click)="addEventHandler()"
            [style.background]="tokens.colors.primary[500]">
            + Add Handler
          </button>
        </div>

        <div class="event-handlers-list">
          <div
            *ngFor="let handler of behavior.eventHandlers; let i = index"
            class="event-handler-card"
            [class.disabled]="!handler.enabled">

            <div class="handler-header">
              <label class="handler-checkbox">
                <input
                  type="checkbox"
                  [(ngModel)]="handler.enabled"
                  (ngModelChange)="emitChange()">
                <strong>Handler {{i + 1}}</strong>
              </label>
              <button
                class="delete-btn"
                (click)="removeEventHandler(i)"
                title="Delete handler">
                ×
              </button>
            </div>

            <div class="handler-content" *ngIf="handler.enabled">
              <!-- Event Type -->
              <div class="control-group">
                <label>Event Type</label>
                <select
                  [(ngModel)]="handler.event"
                  (ngModelChange)="emitChange()">
                  <option value="click">Click</option>
                  <option value="hover">Hover</option>
                  <option value="input">Input</option>
                  <option value="change">Change</option>
                  <option value="focus">Focus</option>
                  <option value="blur">Blur</option>
                  <option value="custom">Custom Event</option>
                </select>
              </div>

              <!-- Custom Event Name -->
              <div class="control-group" *ngIf="handler.event === 'custom'">
                <label>Custom Event Name</label>
                <input
                  type="text"
                  [(ngModel)]="handler.customEvent"
                  (ngModelChange)="emitChange()"
                  placeholder="my-custom-event">
              </div>

              <!-- Action Type -->
              <div class="control-group">
                <label>Action</label>
                <select
                  [(ngModel)]="handler.action"
                  (ngModelChange)="emitChange()">
                  <option value="emit-event">Emit Event</option>
                  <option value="update-state">Update State</option>
                  <option value="navigate">Navigate</option>
                  <option value="call-function">Call Function</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <!-- Target -->
              <div class="control-group">
                <label>Target</label>
                <input
                  type="text"
                  [(ngModel)]="handler.target"
                  (ngModelChange)="emitChange()"
                  placeholder="event-name or state-var">
              </div>

              <!-- Condition -->
              <div class="control-group">
                <label>Condition (optional)</label>
                <input
                  type="text"
                  [(ngModel)]="handler.condition"
                  (ngModelChange)="emitChange()"
                  placeholder="e.g., data.count > 5">
                <p class="hint">JavaScript expression, return true/false</p>
              </div>
            </div>
          </div>

          <div *ngIf="behavior.eventHandlers.length === 0" class="empty-state">
            <p>No event handlers defined</p>
            <p class="hint">Click "+ Add Handler" to create one</p>
          </div>
        </div>
      </div>

      <!-- State Variables -->
      <div class="section">
        <div class="section-header">
          <label class="section-label">State Variables</label>
          <button
            class="add-btn"
            (click)="addStateVariable()"
            [style.background]="tokens.colors.primary[500]">
            + Add Variable
          </button>
        </div>

        <div class="state-variables-list">
          <div
            *ngFor="let stateVar of behavior.stateVariables; let i = index"
            class="state-var-card">

            <div class="var-header">
              <strong>{{ stateVar.name || 'Variable ' + (i + 1) }}</strong>
              <button
                class="delete-btn"
                (click)="removeStateVariable(i)"
                title="Delete variable">
                ×
              </button>
            </div>

            <div class="var-content">
              <!-- Name -->
              <div class="control-group">
                <label>Name</label>
                <input
                  type="text"
                  [(ngModel)]="stateVar.name"
                  (ngModelChange)="emitChange()"
                  placeholder="variableName">
              </div>

              <!-- Type -->
              <div class="control-group">
                <label>Type</label>
                <select
                  [(ngModel)]="stateVar.type"
                  (ngModelChange)="emitChange()">
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="object">Object</option>
                  <option value="array">Array</option>
                </select>
              </div>

              <!-- Default Value -->
              <div class="control-group">
                <label>Default Value</label>
                <input
                  *ngIf="stateVar.type !== 'boolean'"
                  type="text"
                  [(ngModel)]="stateVar.defaultValue"
                  (ngModelChange)="emitChange()"
                  [placeholder]="getDefaultPlaceholder(stateVar.type)">
                <select
                  *ngIf="stateVar.type === 'boolean'"
                  [(ngModel)]="stateVar.defaultValue"
                  (ngModelChange)="emitChange()">
                  <option [ngValue]="true">true</option>
                  <option [ngValue]="false">false</option>
                </select>
              </div>

              <!-- Description -->
              <div class="control-group">
                <label>Description (optional)</label>
                <input
                  type="text"
                  [(ngModel)]="stateVar.description"
                  (ngModelChange)="emitChange()"
                  placeholder="Describe what this variable does">
              </div>
            </div>
          </div>

          <div *ngIf="behavior.stateVariables.length === 0" class="empty-state">
            <p>No state variables defined</p>
            <p class="hint">Click "+ Add Variable" to create one</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .behavior-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
    }

    .editor-header {
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .editor-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .section {
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .section-label {
      display: block;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
      color: #333;
    }

    .add-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .add-btn:hover {
      opacity: 0.9;
    }

    .options-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
    }

    .option-checkbox,
    .handler-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 13px;
    }

    .event-handlers-list,
    .state-variables-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .event-handler-card,
    .state-var-card {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: white;
      overflow: hidden;
    }

    .event-handler-card.disabled {
      opacity: 0.6;
    }

    .handler-header,
    .var-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: #f9f9f9;
      border-bottom: 1px solid #e0e0e0;
    }

    .delete-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      color: #f44336;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      transition: all 0.2s;
    }

    .delete-btn:hover {
      background: #ffebee;
      border-color: #f44336;
    }

    .handler-content,
    .var-content {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .control-group label {
      font-size: 12px;
      font-weight: 500;
      color: #666;
    }

    .control-group input,
    .control-group select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
    }

    .control-group input:focus,
    .control-group select:focus {
      outline: none;
      border-color: #2196f3;
    }

    .hint {
      margin: 0;
      font-size: 11px;
      color: #999;
    }

    .empty-state {
      padding: 32px;
      text-align: center;
      color: #999;
    }

    .empty-state p {
      margin: 4px 0;
    }
  `]
})
export class BehaviorEditorComponent implements OnInit {
  @Input() behavior: BehaviorConfig = {
    eventHandlers: [],
    stateVariables: [],
    draggable: false,
    selectable: true,
    resizable: false
  };
  @Output() behaviorChange = new EventEmitter<BehaviorConfig>();

  tokens = DESIGN_TOKENS;

  ngOnInit(): void {
    if (!this.behavior.eventHandlers) {
      this.behavior.eventHandlers = [];
    }
    if (!this.behavior.stateVariables) {
      this.behavior.stateVariables = [];
    }
  }

  /**
   * Add new event handler
   */
  addEventHandler(): void {
    const newHandler: EventHandler = {
      id: `handler-${Date.now()}`,
      event: 'click',
      action: 'emit-event',
      enabled: true
    };
    this.behavior.eventHandlers.push(newHandler);
    this.emitChange();
  }

  /**
   * Remove event handler
   */
  removeEventHandler(index: number): void {
    this.behavior.eventHandlers.splice(index, 1);
    this.emitChange();
  }

  /**
   * Add new state variable
   */
  addStateVariable(): void {
    const newVar: StateVariable = {
      id: `var-${Date.now()}`,
      name: '',
      type: 'string',
      defaultValue: ''
    };
    this.behavior.stateVariables.push(newVar);
    this.emitChange();
  }

  /**
   * Remove state variable
   */
  removeStateVariable(index: number): void {
    this.behavior.stateVariables.splice(index, 1);
    this.emitChange();
  }

  /**
   * Get default placeholder for value input
   */
  getDefaultPlaceholder(type: string): string {
    switch (type) {
      case 'string': return '"text value"';
      case 'number': return '0';
      case 'object': return '{}';
      case 'array': return '[]';
      default: return '';
    }
  }

  /**
   * Emit behavior change
   */
  emitChange(): void {
    this.behaviorChange.emit(this.behavior);
  }
}
