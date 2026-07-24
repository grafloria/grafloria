import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GrafloriaHandleDirective } from '@grafloria/angular';
import type { DiagramEngine } from '@grafloria/engine';

/**
 * Represents a field in the table
 */
export interface TableField {
  id: string;
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

/**
 * Table node component with field-level ports
 *
 * This component demonstrates:
 * - HTML layer rendering with complex structure
 * - Multiple ports per node (one per field)
 * - Field-level connections (like ERD diagrams)
 * - Different port types (source/target on same field)
 */
@Component({
    selector: 'app-table-node',
    imports: [CommonModule, GrafloriaHandleDirective],
    template: `
    <div class="table-node"
         (mouseenter)="onMouseEnter()"
         (mouseleave)="onMouseLeave()">
      <!-- Table Header -->
      <div class="table-header">
        <div class="table-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm5 0v3h6V2H5zm6 4H5v3h6V6zM0 2v3h4V2H0zm0 4v3h4V6H0zm0 4v3h4v-3H0zm11 0v3h5v-3h-5zm0-1h5V6h-5v3zm0-4h5V2h-5v3z"/>
          </svg>
        </div>
        <h4>{{ tableName }}</h4>
      </div>

      <!-- Fields List -->
      <div class="fields-container">
        <div *ngFor="let field of fields; let i = index"
             class="field-row"
             [class.field-primary-key]="field.isPrimaryKey"
             [class.field-foreign-key]="field.isForeignKey">

          <!-- Left handle (target/input) -->
          <div class="field-handle field-handle-left"
               [class.field-handle-visible]="handlesVisible">
            <div
              grafloriaHandle="target"
              [handleId]="'field-' + field.id + '-input'"
              handlePosition="left"
              class="handle handle-target">
              <div class="handle-dot"></div>
            </div>
          </div>

          <!-- Field content -->
          <div class="field-content">
            <div class="field-info">
              <span class="field-name">
                <span *ngIf="field.isPrimaryKey" class="field-key-icon" title="Primary Key">🔑</span>
                <span *ngIf="field.isForeignKey && !field.isPrimaryKey" class="field-key-icon" title="Foreign Key">🔗</span>
                {{ field.name }}
              </span>
              <span class="field-type">{{ field.type }}</span>
            </div>
          </div>

          <!-- Right handle (source/output) -->
          <div class="field-handle field-handle-right"
               [class.field-handle-visible]="handlesVisible">
            <div
              grafloriaHandle="source"
              [handleId]="'field-' + field.id + '-output'"
              handlePosition="right"
              class="handle handle-source">
              <div class="handle-dot"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer with stats -->
      <div class="table-footer">
        <small>{{ fields.length }} field{{ fields.length !== 1 ? 's' : '' }}</small>
      </div>
    </div>
  `,
    styles: [`
    :host {
      display: block;
    }

    .table-node {
      position: relative;
      min-width: 220px;
      max-width: 300px;
      background: white;
      border: 2px solid #6366f1;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      font-family: system-ui, -apple-system, sans-serif;
      pointer-events: auto;
      overflow: hidden;
    }

    .table-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }

    .table-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      opacity: 0.9;
    }

    .table-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      flex: 1;
    }

    .fields-container {
      background: #fafafa;
    }

    .field-row {
      position: relative;
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: white;
      transition: background-color 0.15s;
    }

    .field-row:last-child {
      border-bottom: none;
    }

    .field-row:hover {
      background: #f9fafb;
    }

    .field-row.field-primary-key {
      background: #fef3c7;
    }

    .field-row.field-primary-key:hover {
      background: #fde68a;
    }

    .field-row.field-foreign-key {
      background: #dbeafe;
    }

    .field-row.field-foreign-key:hover {
      background: #bfdbfe;
    }

    .field-content {
      flex: 1;
      min-width: 0;
    }

    .field-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .field-name {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      font-weight: 500;
      color: #1f2937;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .field-key-icon {
      font-size: 11px;
      line-height: 1;
    }

    .field-type {
      font-size: 11px;
      color: #6b7280;
      font-family: 'Monaco', 'Courier New', monospace;
      white-space: nowrap;
    }

    .table-footer {
      padding: 6px 12px;
      background: #f3f4f6;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }

    .table-footer small {
      font-size: 11px;
      color: #6b7280;
    }

    /* Field Handles - positioned outside the row */
    .field-handle {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
      z-index: 100;
      pointer-events: none;
    }

    .field-handle.field-handle-visible {
      opacity: 1;
      visibility: visible;
    }

    /* Position handles clearly outside the row */
    .field-handle-left {
      left: -8px;
    }

    .field-handle-right {
      right: -8px;
    }

    .handle {
      position: relative;
      pointer-events: all;
      z-index: 1000;
      cursor: crosshair;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Larger, more visible handle dots */
    .handle-dot {
      width: 12px;
      height: 12px;
      background: #6366f1;
      border: 2px solid white;
      border-radius: 50%;
      cursor: crosshair;
      transition: all 0.2s;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }

    .handle-dot:hover {
      width: 16px;
      height: 16px;
      background: #4f46e5;
      box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.25);
      transform: scale(1.1);
    }

    /* Target handles are green - on the left */
    .handle-target .handle-dot {
      background: #10b981;
      border-color: white;
    }

    .handle-target .handle-dot:hover {
      background: #059669;
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.25);
    }

    /* Source handles are blue - on the right */
    .handle-source .handle-dot {
      background: #3b82f6;
      border-color: white;
    }

    .handle-source .handle-dot:hover {
      background: #2563eb;
      box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.25);
    }
  `]
})
export class TableNodeComponent implements OnInit, OnDestroy {
  @Input() node: any;
  @Input() engine?: DiagramEngine;

  /**
   * Table name
   */
  tableName = 'Table';

  /**
   * Fields to display in the table
   */
  fields: TableField[] = [];

  /**
   * Whether handles should be visible
   */
  handlesVisible = false;

  /**
   * Whether mouse is hovering over node
   */
  private isHovering = false;

  /**
   * Subscription to interaction config changes
   */
  private configUnsubscribe?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Get table name and fields from node data or use defaults
    this.tableName = this.node?.getData?.('tableName') || 'Table';
    this.fields = this.node?.getData?.('fields') || this.getDefaultFields();

    // Get initial visibility based on port visibility mode
    this.updateHandleVisibility();

    // Subscribe to interaction config changes
    if (this.engine) {
      const eventBus = (this.engine as any)['eventBus'];
      if (eventBus) {
        const handler = () => {
          this.updateHandleVisibility();
          this.cdr.markForCheck();
        };
        eventBus.on('config:interaction-changed', handler);
        this.configUnsubscribe = () => {
          eventBus.off('config:interaction-changed', handler);
        };
      }
    }
  }

  ngOnDestroy(): void {
    if (this.configUnsubscribe) {
      this.configUnsubscribe();
    }
  }

  /**
   * Handle mouse enter
   */
  onMouseEnter(): void {
    this.isHovering = true;
    this.updateHandleVisibility();
  }

  /**
   * Handle mouse leave
   */
  onMouseLeave(): void {
    this.isHovering = false;
    this.updateHandleVisibility();
  }

  /**
   * Update handle visibility based on port visibility mode
   */
  private updateHandleVisibility(): void {
    if (!this.engine) {
      this.handlesVisible = true;
      return;
    }

    const config = this.engine.getInteractionConfig();
    const portVisibility = config?.portVisibility || 'always';

    switch (portVisibility) {
      case 'always':
        this.handlesVisible = true;
        break;
      case 'on-hover':
        this.handlesVisible = this.isHovering;
        break;
      case 'hidden':
        this.handlesVisible = false;
        break;
      default:
        this.handlesVisible = true;
    }
  }

  /**
   * Get default fields for demo
   */
  private getDefaultFields(): TableField[] {
    return [
      { id: '1', name: 'id', type: 'INT', isPrimaryKey: true },
      { id: '2', name: 'name', type: 'VARCHAR(100)' },
      { id: '3', name: 'email', type: 'VARCHAR(255)' },
      { id: '4', name: 'created_at', type: 'TIMESTAMP' }
    ];
  }
}
