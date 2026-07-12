import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Tree node representation
 */
export interface TreeNode {
  id: string;
  type: string;
  label?: string;
  children?: TreeNode[];
  expanded?: boolean;
  selected?: boolean;
  level?: number;
  parent?: TreeNode;
}

/**
 * Node action type
 */
export type NodeAction = 'select' | 'add' | 'delete' | 'duplicate' | 'move-up' | 'move-down';

/**
 * Node action event
 */
export interface NodeActionEvent {
  action: NodeAction;
  node: TreeNode;
  targetNode?: TreeNode; // For drag-drop operations
}

/**
 * Node Tree View Component
 *
 * Displays a hierarchical tree view of nested nodes with:
 * - Expand/collapse controls
 * - Node selection
 * - Add/delete/duplicate actions
 * - Drag-and-drop reordering
 * - Visual indentation for hierarchy levels
 * - Node type icons
 *
 * Phase 5: Nested Nodes & Layout System
 *
 * Usage:
 * ```html
 * <app-node-tree-view
 *   [template]="template"
 *   [selectedNodeId]="selectedId"
 *   (nodeAction)="handleNodeAction($event)">
 * </app-node-tree-view>
 * ```
 */
@Component({
    selector: 'app-node-tree-view',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="tree-view" [style.font-family]="tokens.typography.fontFamily">
      <!-- Header -->
      <div class="tree-header">
        <h3>Node Structure</h3>
        <button
          class="add-root-btn"
          (click)="onAddRootNode()"
          [style.background]="tokens.colors.primary[500]"
          title="Add root node">
          + Root
        </button>
      </div>

      <!-- Tree -->
      <div class="tree-content">
        <div *ngIf="!rootNode" class="empty-state">
          <p>No nodes defined</p>
          <p class="hint">Click "+ Root" to add a root node</p>
        </div>

        <div *ngIf="rootNode" class="tree-nodes">
          <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: rootNode, level: 0 }"></ng-container>
        </div>
      </div>

      <!-- Node Template (Recursive) -->
      <ng-template #nodeTemplate let-node="node" let-level="level">
        <div
          class="tree-node"
          [class.selected]="node.id === selectedNodeId"
          [class.has-children]="node.children && node.children.length > 0"
          [style.padding-left.px]="level * 20"
          (click)="onSelectNode(node, $event)">

          <!-- Expand/Collapse -->
          <button
            *ngIf="node.children && node.children.length > 0"
            class="expand-btn"
            (click)="onToggleExpand(node, $event)">
            {{ node.expanded ? '▼' : '▶' }}
          </button>
          <span *ngIf="!node.children || node.children.length === 0" class="spacer"></span>

          <!-- Node Icon -->
          <span class="node-icon" [attr.data-type]="node.type">
            {{ getNodeIcon(node.type) }}
          </span>

          <!-- Node Label -->
          <span class="node-label">
            {{ node.label || node.type || 'Node' }}
          </span>

          <!-- Node Type Badge -->
          <span class="node-type" [style.background]="tokens.colors.background.tertiary">
            {{ node.type }}
          </span>

          <!-- Actions -->
          <div class="node-actions">
            <button
              class="action-btn"
              (click)="onNodeAction('add', node, $event)"
              title="Add child node">
              +
            </button>
            <button
              class="action-btn"
              (click)="onNodeAction('duplicate', node, $event)"
              title="Duplicate node">
              ⎘
            </button>
            <button
              class="action-btn delete-btn"
              (click)="onNodeAction('delete', node, $event)"
              [disabled]="level === 0"
              title="Delete node">
              ×
            </button>
          </div>
        </div>

        <!-- Children (Recursive) -->
        <div *ngIf="node.expanded && node.children && node.children.length > 0" class="tree-children">
          <ng-container *ngFor="let child of node.children">
            <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: child, level: level + 1 }"></ng-container>
          </ng-container>
        </div>
      </ng-template>

      <!-- Footer -->
      <div class="tree-footer" *ngIf="rootNode">
        <span class="node-count">
          {{ getNodeCount() }} node(s)
        </span>
      </div>
    </div>
  `,
    styles: [`
    .tree-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      border-radius: 4px;
      overflow: hidden;
    }

    .tree-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .tree-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .add-root-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .add-root-btn:hover {
      opacity: 0.9;
    }

    .tree-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: #999;
      text-align: center;
    }

    .empty-state p {
      margin: 4px 0;
    }

    .empty-state .hint {
      font-size: 12px;
      color: #bbb;
    }

    .tree-nodes {
      padding: 0;
    }

    .tree-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      transition: background 0.15s;
      border-left: 3px solid transparent;
      position: relative;
    }

    .tree-node:hover {
      background: #f5f5f5;
    }

    .tree-node.selected {
      background: #e3f2fd;
      border-left-color: #2196f3;
    }

    .tree-node:hover .node-actions {
      opacity: 1;
    }

    .expand-btn {
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 10px;
      color: #666;
      transition: color 0.2s;
      flex-shrink: 0;
    }

    .expand-btn:hover {
      color: #2196f3;
    }

    .spacer {
      width: 20px;
      flex-shrink: 0;
    }

    .node-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      flex-shrink: 0;
    }

    .node-icon[data-type="container"] {
      background: #e3f2fd;
    }

    .node-icon[data-type="rectangle"] {
      background: #f3e5f5;
    }

    .node-icon[data-type="circle"] {
      background: #e8f5e9;
    }

    .node-label {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-type {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      color: #666;
      flex-shrink: 0;
    }

    .node-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .action-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      color: #666;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .action-btn:hover {
      background: #f5f5f5;
      border-color: #999;
      color: #333;
    }

    .action-btn.delete-btn {
      color: #f44336;
    }

    .action-btn.delete-btn:hover {
      background: #ffebee;
      border-color: #f44336;
    }

    .action-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .tree-children {
      /* Nested children */
    }

    .tree-footer {
      padding: 8px 16px;
      border-top: 1px solid #e0e0e0;
      background: #fafafa;
      font-size: 12px;
      color: #666;
    }

    .node-count {
      font-weight: 500;
    }
  `]
})
export class NodeTreeViewComponent implements OnChanges {
  @Input() template: any;
  @Input() selectedNodeId?: string;
  @Output() nodeAction = new EventEmitter<NodeActionEvent>();

  tokens = DESIGN_TOKENS;
  rootNode?: TreeNode;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['template']) {
      this.buildTree();
    }
  }

  /**
   * Build tree from template structure
   */
  private buildTree(): void {
    if (!this.template?.structure) {
      this.rootNode = undefined;
      return;
    }

    this.rootNode = this.convertToTreeNode(this.template.structure, 0);
    this.rootNode.expanded = true;
  }

  /**
   * Convert template structure to tree node
   */
  private convertToTreeNode(structure: any, level: number, parent?: TreeNode): TreeNode {
    const node: TreeNode = {
      id: structure.id || this.generateId(),
      type: structure.type || 'node',
      label: structure.label,
      level,
      parent,
      expanded: level < 2, // Auto-expand first 2 levels
      children: []
    };

    // Convert children
    if (structure.children && Array.isArray(structure.children)) {
      node.children = structure.children.map((child: any) =>
        this.convertToTreeNode(child, level + 1, node)
      );
    }

    return node;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get node icon based on type
   */
  getNodeIcon(type: string): string {
    const icons: Record<string, string> = {
      container: '□',
      rectangle: '▭',
      circle: '●',
      diamond: '◆',
      hexagon: '⬡',
      text: 'T',
      image: '🖼',
      button: '🔘',
      input: '📝',
    };
    return icons[type] || '◻';
  }

  /**
   * Toggle node expansion
   */
  onToggleExpand(node: TreeNode, event: Event): void {
    event.stopPropagation();
    node.expanded = !node.expanded;
  }

  /**
   * Select node
   */
  onSelectNode(node: TreeNode, event: Event): void {
    event.stopPropagation();
    this.nodeAction.emit({ action: 'select', node });
  }

  /**
   * Handle node action
   */
  onNodeAction(action: NodeAction, node: TreeNode, event: Event): void {
    event.stopPropagation();
    this.nodeAction.emit({ action, node });
  }

  /**
   * Add root node
   */
  onAddRootNode(): void {
    const rootNode: TreeNode = {
      id: this.generateId(),
      type: 'container',
      label: 'Root Container',
      level: 0,
      expanded: true,
      children: []
    };
    this.nodeAction.emit({ action: 'add', node: rootNode });
  }

  /**
   * Get total node count
   */
  getNodeCount(): number {
    if (!this.rootNode) return 0;
    return this.countNodes(this.rootNode);
  }

  private countNodes(node: TreeNode): number {
    let count = 1;
    if (node.children) {
      node.children.forEach(child => {
        count += this.countNodes(child);
      });
    }
    return count;
  }
}
