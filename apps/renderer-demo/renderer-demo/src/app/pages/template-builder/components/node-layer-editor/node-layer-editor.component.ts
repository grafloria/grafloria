import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../shared/components/button/button.component';

/**
 * Node Layer Editor Component
 *
 * Modal dialog for editing HTML and CSS layers for individual nodes.
 * Provides a focused editing experience with syntax highlighting.
 *
 * Features:
 * - Modal dialog with backdrop
 * - Tabbed interface (HTML / CSS)
 * - Monaco editor integration
 * - Save/Cancel actions
 * - Node path breadcrumb
 *
 * Usage:
 * <app-node-layer-editor
 *   [isOpen]="showEditor"
 *   [nodePath]="'structure.children[0]'"
 *   [htmlLayer]="nodeHtml"
 *   [cssLayer]="nodeCss"
 *   (save)="onLayersSave($event)"
 *   (close)="showEditor = false">
 * </app-node-layer-editor>
 */
@Component({
    imports: [CommonModule, FormsModule, ButtonComponent],
    selector: 'app-node-layer-editor',
    template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick()">
      <div class="modal-dialog" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-content">
            <h2 class="modal-title">Edit Node Layers</h2>
            <div class="node-path" *ngIf="nodePath">
              <span class="path-icon">📍</span>
              <span class="path-text">{{ nodePath }}</span>
            </div>
          </div>
          <button class="close-btn" (click)="onClose()" title="Close (Esc)">×</button>
        </div>

        <!-- Tabs -->
        <div class="modal-tabs">
          <button
            class="tab"
            [class.active]="activeTab === 'html'"
            (click)="activeTab = 'html'">
            HTML Layer
          </button>
          <button
            class="tab"
            [class.active]="activeTab === 'css'"
            (click)="activeTab = 'css'">
            CSS Layer
          </button>
        </div>

        <!-- Content -->
        <div class="modal-body">
          <!-- HTML Editor -->
          <div class="editor-container" *ngIf="activeTab === 'html'">
            <div class="editor-help">
              <span class="help-icon">💡</span>
              <span>Tip: Use data binding with {{'{{'}}data.property{{'}}'}} syntax</span>
            </div>
            <textarea
              class="code-editor"
              [(ngModel)]="localHtmlLayer"
              placeholder="Enter HTML template here...
Example:
<div class='node-content'>
  <h3>{{'{{'}}data.title{{'}}'}}</h3>
  <p>{{'{{'}}data.description{{'}}'}}</p>
</div>"
              spellcheck="false">
            </textarea>
          </div>

          <!-- CSS Editor -->
          <div class="editor-container" *ngIf="activeTab === 'css'">
            <div class="editor-help">
              <span class="help-icon">💡</span>
              <span>Tip: Scope styles to avoid conflicts (.node-content {{ '{' }} ... {{ '}' }})</span>
            </div>
            <textarea
              class="code-editor"
              [(ngModel)]="localCssLayer"
              placeholder="Enter CSS styles here...
Example:
.node-content {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.node-content h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}"
              spellcheck="false">
            </textarea>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-info">
            <span class="info-icon">ℹ️</span>
            <span class="info-text">Changes will update the selected node in JSON</span>
          </div>
          <div class="footer-actions">
            <app-button
              variant="secondary"
              (clicked)="onClose()">
              Cancel
            </app-button>
            <app-button
              variant="primary"
              (clicked)="onSave()">
              Save Changes
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
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-dialog {
      width: 90%;
      max-width: 800px;
      max-height: 85vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px 12px 0 0;
      color: white;
    }

    .header-content {
      flex: 1;
    }

    .modal-title {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 600;
    }

    .node-path {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      opacity: 0.9;
      font-family: 'Courier New', monospace;
    }

    .path-icon {
      font-size: 14px;
    }

    .close-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
    }

    .modal-tabs {
      display: flex;
      gap: 0;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      padding: 0 16px;
    }

    .tab {
      padding: 12px 20px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #6b7280;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab:hover {
      color: #374151;
      background: rgba(102, 126, 234, 0.05);
    }

    .tab.active {
      color: #667eea;
      border-bottom-color: #667eea;
      background: rgba(102, 126, 234, 0.08);
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .editor-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      min-height: 400px;
    }

    .editor-help {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 6px;
      font-size: 13px;
      color: #92400e;
    }

    .help-icon {
      font-size: 16px;
    }

    .code-editor {
      flex: 1;
      width: 100%;
      min-height: 350px;
      padding: 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-family: 'Courier New', Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
      resize: vertical;
      background: #1e1e1e;
      color: #d4d4d4;
    }

    .code-editor::placeholder {
      color: #6b7280;
    }

    .code-editor:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .footer-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #6b7280;
    }

    .info-icon {
      font-size: 16px;
    }

    .footer-actions {
      display: flex;
      gap: 12px;
    }
  `]
})
export class NodeLayerEditorComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() nodePath = '';
  @Input() htmlLayer = '';
  @Input() cssLayer = '';

  @Output() save = new EventEmitter<{ html: string; css: string }>();
  @Output() close = new EventEmitter<void>();

  activeTab: 'html' | 'css' = 'html';
  localHtmlLayer = '';
  localCssLayer = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['htmlLayer']) {
      this.localHtmlLayer = this.htmlLayer || '';
    }
    if (changes['cssLayer']) {
      this.localCssLayer = this.cssLayer || '';
    }
    if (changes['isOpen'] && this.isOpen) {
      // Reset to HTML tab when opened
      this.activeTab = 'html';
    }
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({
      html: this.localHtmlLayer,
      css: this.localCssLayer
    });
    this.onClose();
  }
}
