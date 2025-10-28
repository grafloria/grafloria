import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../shared/components/button/button.component';

export interface ChildNodeConfig {
  type: 'static' | 'dynamic';
  nodeType: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  dataPath?: string;
  itemVariable?: string;
}

/**
 * Child Node Wizard Component
 *
 * A guided multi-step wizard for adding child nodes to templates.
 * Helps users choose between static and dynamic children, configure
 * basic properties, and set up data bindings.
 *
 * Steps:
 * 1. Choose Type: Static vs Dynamic
 * 2. Configure Node: Type, size, position
 * 3. Data Binding (if dynamic): Data path and variable
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  selector: 'app-child-node-wizard',
  template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick()">
      <div class="modal-dialog wizard-dialog" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-content">
            <h2 class="modal-title">Add Child Node</h2>
            <div class="step-indicator">
              <div class="step" [class.active]="currentStep === 1" [class.completed]="currentStep > 1">
                <span class="step-number">1</span>
                <span class="step-label">Type</span>
              </div>
              <div class="step-divider"></div>
              <div class="step" [class.active]="currentStep === 2" [class.completed]="currentStep > 2">
                <span class="step-number">2</span>
                <span class="step-label">Configure</span>
              </div>
              <div class="step-divider" *ngIf="config.type === 'dynamic'"></div>
              <div class="step" *ngIf="config.type === 'dynamic'" [class.active]="currentStep === 3" [class.completed]="currentStep > 3">
                <span class="step-number">3</span>
                <span class="step-label">Data Binding</span>
              </div>
            </div>
          </div>
          <button class="close-btn" (click)="onClose()">×</button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <!-- Step 1: Choose Type -->
          <div class="wizard-step" *ngIf="currentStep === 1">
            <h3 class="step-title">Choose Child Node Type</h3>
            <p class="step-description">Select how you want to add child nodes to your template.</p>

            <div class="choice-cards">
              <div class="choice-card"
                   [class.selected]="config.type === 'static'"
                   (click)="config.type = 'static'">
                <div class="choice-icon">📄</div>
                <h4 class="choice-title">Static Child</h4>
                <p class="choice-description">
                  A single, fixed child node that's always visible. Perfect for labels, icons,
                  or decorative elements.
                </p>
                <div class="choice-example">
                  <strong>Example:</strong> A title label or status badge
                </div>
              </div>

              <div class="choice-card"
                   [class.selected]="config.type === 'dynamic'"
                   (click)="config.type = 'dynamic'">
                <div class="choice-icon">🔄</div>
                <h4 class="choice-title">Dynamic Children</h4>
                <p class="choice-description">
                  Multiple child nodes generated from data. Each item in your data array
                  creates a new child node.
                </p>
                <div class="choice-example">
                  <strong>Example:</strong> A list of tasks or team members
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: Configure Node -->
          <div class="wizard-step" *ngIf="currentStep === 2">
            <h3 class="step-title">Configure Node Properties</h3>
            <p class="step-description">Set the basic properties for your child node.</p>

            <div class="form-grid">
              <div class="form-group full-width">
                <label class="form-label">
                  Node Type
                  <span class="help-text">A descriptive name (e.g., "label", "icon", "badge")</span>
                </label>
                <input type="text"
                       class="form-input"
                       [(ngModel)]="config.nodeType"
                       placeholder="e.g., label, icon, badge">
              </div>

              <div class="form-group">
                <label class="form-label">Width (px)</label>
                <input type="number"
                       class="form-input"
                       [(ngModel)]="config.width"
                       min="10"
                       max="1000">
              </div>

              <div class="form-group">
                <label class="form-label">Height (px)</label>
                <input type="number"
                       class="form-input"
                       [(ngModel)]="config.height"
                       min="10"
                       max="1000">
              </div>

              <div class="form-group">
                <label class="form-label">
                  X Position (optional)
                  <span class="help-text">Leave empty for auto-layout</span>
                </label>
                <input type="number"
                       class="form-input"
                       [(ngModel)]="config.x"
                       placeholder="auto">
              </div>

              <div class="form-group">
                <label class="form-label">
                  Y Position (optional)
                  <span class="help-text">Leave empty for auto-layout</span>
                </label>
                <input type="number"
                       class="form-input"
                       [(ngModel)]="config.y"
                       placeholder="auto">
              </div>
            </div>
          </div>

          <!-- Step 3: Data Binding (Dynamic Only) -->
          <div class="wizard-step" *ngIf="currentStep === 3 && config.type === 'dynamic'">
            <h3 class="step-title">Configure Data Binding</h3>
            <p class="step-description">
              Connect your child nodes to your data source. Each item in the array
              will generate a child node.
            </p>

            <div class="form-grid">
              <div class="form-group full-width">
                <label class="form-label">
                  Data Path
                  <span class="help-text">The path to your data array (e.g., "items", "tasks", "members")</span>
                </label>
                <input type="text"
                       class="form-input"
                       [(ngModel)]="config.dataPath"
                       placeholder="e.g., items, tasks, members">
              </div>

              <div class="form-group full-width">
                <label class="form-label">
                  Item Variable Name
                  <span class="help-text">Variable name to reference each item (e.g., "item", "task", "member")</span>
                </label>
                <input type="text"
                       class="form-input"
                       [(ngModel)]="config.itemVariable"
                       placeholder="e.g., item, task, member">
              </div>

              <div class="data-binding-example">
                <strong>📘 How it works:</strong>
                <p>
                  If your data is: <code>{{ '{' }} "items": ["A", "B", "C"] {{ '}' }}</code>
                </p>
                <p>
                  You can reference each item with: <code>{{ '{{' }}item{{ '}}' }}</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-left">
            <app-button
              *ngIf="currentStep > 1"
              variant="secondary"
              (clicked)="previousStep()">
              ← Back
            </app-button>
          </div>
          <div class="footer-right">
            <app-button variant="secondary" (clicked)="onClose()">
              Cancel
            </app-button>
            <app-button
              *ngIf="!isLastStep()"
              variant="primary"
              [disabled]="!canProceed()"
              (clicked)="nextStep()">
              Next →
            </app-button>
            <app-button
              *ngIf="isLastStep()"
              variant="primary"
              [disabled]="!canProceed()"
              (clicked)="onGenerate()">
              Generate & Insert
            </app-button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(4px);
    }

    .wizard-dialog {
      width: 700px;
      max-width: 90vw;
      max-height: 85vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-bottom: none;
    }

    .header-content {
      flex: 1;
    }

    .modal-title {
      margin: 0 0 16px 0;
      font-size: 24px;
      font-weight: 600;
    }

    .step-indicator {
      display: flex;
      align-items: center;
      gap: 0;
    }

    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.3s;
    }

    .step.active .step-number {
      background: white;
      color: #667eea;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .step.completed .step-number {
      background: rgba(255, 255, 255, 0.4);
    }

    .step-label {
      font-size: 12px;
      opacity: 0.8;
      font-weight: 500;
    }

    .step.active .step-label {
      opacity: 1;
      font-weight: 600;
    }

    .step-divider {
      width: 40px;
      height: 2px;
      background: rgba(255, 255, 255, 0.3);
      margin: 0 12px;
      align-self: flex-start;
      margin-top: 16px;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 32px;
    }

    .wizard-step {
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .step-title {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }

    .step-description {
      margin: 0 0 24px 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.5;
    }

    /* Choice Cards */
    .choice-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .choice-card {
      padding: 24px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      background: white;
    }

    .choice-card:hover {
      border-color: #667eea;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
      transform: translateY(-2px);
    }

    .choice-card.selected {
      border-color: #667eea;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.2);
    }

    .choice-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }

    .choice-title {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }

    .choice-description {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: #6b7280;
      line-height: 1.5;
    }

    .choice-example {
      font-size: 12px;
      color: #4b5563;
      padding: 8px 12px;
      background: #f9fafb;
      border-radius: 6px;
      border-left: 3px solid #667eea;
    }

    .choice-example strong {
      color: #667eea;
    }

    /* Form */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group.full-width {
      grid-column: 1 / -1;
    }

    .form-label {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .help-text {
      font-size: 11px;
      font-weight: 400;
      color: #9ca3af;
    }

    .form-input {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      font-family: 'Monaco', 'Consolas', monospace;
      transition: all 0.2s;
    }

    .form-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .form-input::placeholder {
      color: #9ca3af;
    }

    .data-binding-example {
      grid-column: 1 / -1;
      padding: 16px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      margin-top: 8px;
    }

    .data-binding-example strong {
      color: #0369a1;
      font-size: 13px;
    }

    .data-binding-example p {
      margin: 8px 0 0 0;
      font-size: 13px;
      color: #075985;
    }

    .data-binding-example code {
      background: #e0f2fe;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 12px;
      color: #0c4a6e;
    }

    /* Footer */
    .modal-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }

    .footer-left,
    .footer-right {
      display: flex;
      gap: 12px;
    }
  `]
})
export class ChildNodeWizardComponent implements OnChanges {
  @Input() isOpen = false;
  @Output() generate = new EventEmitter<ChildNodeConfig>();
  @Output() close = new EventEmitter<void>();

  currentStep = 1;
  config: ChildNodeConfig = {
    type: 'static',
    nodeType: 'child-node',
    width: 100,
    height: 50,
    dataPath: 'items',
    itemVariable: 'item'
  };

  ngOnChanges(): void {
    if (this.isOpen) {
      // Reset when opening
      this.currentStep = 1;
      this.config = {
        type: 'static',
        nodeType: 'child-node',
        width: 100,
        height: 50,
        dataPath: 'items',
        itemVariable: 'item'
      };
    }
  }

  canProceed(): boolean {
    switch (this.currentStep) {
      case 1:
        return !!this.config.type;
      case 2:
        return !!this.config.nodeType && this.config.width > 0 && this.config.height > 0;
      case 3:
        return this.config.type === 'static' ||
               (!!this.config.dataPath && !!this.config.itemVariable);
      default:
        return false;
    }
  }

  isLastStep(): boolean {
    return this.config.type === 'static' ? this.currentStep === 2 : this.currentStep === 3;
  }

  nextStep(): void {
    if (this.canProceed() && !this.isLastStep()) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  onGenerate(): void {
    if (this.canProceed()) {
      this.generate.emit(this.config);
      this.onClose();
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(): void {
    this.onClose();
  }
}
