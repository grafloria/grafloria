import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Tree node representation
 */
export interface TreeNode {
  id: string;
  type: string;
  name: string;
  children?: TreeNode[];
  expanded?: boolean;
  selected?: boolean;
  parent?: TreeNode | null;
  level?: number;
  data?: any;
}

/**
 * Tree action event
 */
export interface TreeAction {
  action: 'select' | 'expand' | 'collapse' | 'add' | 'delete' | 'duplicate' | 'moveUp' | 'moveDown';
  node: TreeNode;
  parent?: TreeNode | null;
}

/**
 * Nested Structure Tree Component
 *
 * A hierarchical tree view for managing nested node structures with:
 * - Expand/collapse functionality
 * - Multi-level indentation
 * - Node selection
 * - Node actions (add child, delete, duplicate, reorder)
 * - Visual hierarchy indicators
 * - Node type icons
 * - Breadcrumb path display
 * - Search/filter functionality
 * - Drag-and-drop support (future)
 *
 * Usage:
 * ```html
 * <app-nested-structure-tree
 *   [nodes]="treeData"
 *   [selectedNodeId]="currentNodeId"
 *   (nodeAction)="handleTreeAction($event)">
 * </app-nested-structure-tree>
 * ```
 */
@Component({
  selector: 'app-nested-structure-tree',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tree-container" [style.font-family]="tokens.typography.fontFamily">
      <!-- Tree Header -->
      <div class="tree-header">
        <h3>Structure</h3>
        <div class="header-actions">
          <button class="icon-btn" (click)="expandAll()" title="Expand all">
            ⊞
          </button>
          <button class="icon-btn" (click)="collapseAll()" title="Collapse all">
            ⊟
          </button>
          <button class="icon-btn" (click)="addRootNode()" title="Add root node">
            +
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="search-section">
        <input
          type="text"
          class="search-input"
          [(ngModel)]="searchQuery"
          (input)="filterNodes()"
          placeholder="Search nodes..."
        />
      </div>

      <!-- Breadcrumb -->
      <div class="breadcrumb" *ngIf="selectedNode">
        <span class="breadcrumb-item" *ngFor="let item of getBreadcrumb(); let last = last">
          <span class="breadcrumb-text" (click)="selectNode(item)">{{ item.name }}</span>
          <span class="breadcrumb-separator" *ngIf="!last">›</span>
        </span>
      </div>

      <!-- Tree View -->
      <div class="tree-view">
        <div class="tree-empty" *ngIf="displayNodes.length === 0">
          <div class="empty-icon">📦</div>
          <div class="empty-text">No nodes yet</div>
          <button class="add-node-btn" (click)="addRootNode()">Add Root Node</button>
        </div>

        <div class="tree-nodes" *ngIf="displayNodes.length > 0">
          <ng-container *ngFor="let node of displayNodes; trackBy: trackByNodeId">
            <div
              class="tree-node"
              [class.selected]="node.selected"
              [class.has-children]="hasChildren(node)"
              [style.padding-left.px]="(node.level || 0) * 20 + 12"
            >
              <!-- Expand/Collapse Toggle -->
              <button
                class="expand-btn"
                *ngIf="hasChildren(node)"
                (click)="toggleExpand(node)"
              >
                {{ node.expanded ? '▼' : '▶' }}
              </button>
              <span class="expand-placeholder" *ngIf="!hasChildren(node)"></span>

              <!-- Node Icon -->
              <span class="node-icon" [title]="node.type">
                {{ getNodeIcon(node.type) }}
              </span>

              <!-- Node Name -->
              <span class="node-name" (click)="selectNode(node)">
                {{ node.name }}
              </span>

              <!-- Node Type Badge -->
              <span class="node-type">{{ node.type }}</span>

              <!-- Node Actions -->
              <div class="node-actions">
                <button
                  class="action-btn"
                  (click)="addChildNode(node)"
                  title="Add child"
                >
                  +
                </button>
                <button
                  class="action-btn"
                  (click)="duplicateNode(node)"
                  title="Duplicate"
                >
                  ⧉
                </button>
                <button
                  class="action-btn"
                  (click)="moveNodeUp(node)"
                  [disabled]="!canMoveUp(node)"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  class="action-btn"
                  (click)="moveNodeDown(node)"
                  [disabled]="!canMoveDown(node)"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  class="action-btn delete"
                  (click)="deleteNode(node)"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>

            <!-- Children (if expanded) -->
            <ng-container *ngIf="node.expanded && node.children">
              <ng-container *ngTemplateOutlet="recursiveTree; context: { $implicit: node.children, parent: node }"></ng-container>
            </ng-container>
          </ng-container>
        </div>
      </div>

      <!-- Selected Node Info -->
      <div class="node-info" *ngIf="selectedNode">
        <div class="info-header">Selected Node</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">ID:</span>
            <span class="info-value">{{ selectedNode.id }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Type:</span>
            <span class="info-value">{{ selectedNode.type }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Level:</span>
            <span class="info-value">{{ selectedNode.level }}</span>
          </div>
          <div class="info-item" *ngIf="selectedNode.children">
            <span class="info-label">Children:</span>
            <span class="info-value">{{ selectedNode.children.length }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recursive Template for Children -->
    <ng-template #recursiveTree let-nodes let-parent="parent">
      <ng-container *ngFor="let node of nodes; trackBy: trackByNodeId">
        <div
          class="tree-node"
          [class.selected]="node.selected"
          [class.has-children]="hasChildren(node)"
          [style.padding-left.px]="(node.level || 0) * 20 + 12"
        >
          <button
            class="expand-btn"
            *ngIf="hasChildren(node)"
            (click)="toggleExpand(node)"
          >
            {{ node.expanded ? '▼' : '▶' }}
          </button>
          <span class="expand-placeholder" *ngIf="!hasChildren(node)"></span>

          <span class="node-icon" [title]="node.type">
            {{ getNodeIcon(node.type) }}
          </span>

          <span class="node-name" (click)="selectNode(node)">
            {{ node.name }}
          </span>

          <span class="node-type">{{ node.type }}</span>

          <div class="node-actions">
            <button class="action-btn" (click)="addChildNode(node)" title="Add child">+</button>
            <button class="action-btn" (click)="duplicateNode(node)" title="Duplicate">⧉</button>
            <button class="action-btn" (click)="moveNodeUp(node)" [disabled]="!canMoveUp(node)" title="Move up">↑</button>
            <button class="action-btn" (click)="moveNodeDown(node)" [disabled]="!canMoveDown(node)" title="Move down">↓</button>
            <button class="action-btn delete" (click)="deleteNode(node)" title="Delete">×</button>
          </div>
        </div>

        <ng-container *ngIf="node.expanded && node.children">
          <ng-container *ngTemplateOutlet="recursiveTree; context: { $implicit: node.children, parent: node }"></ng-container>
        </ng-container>
      </ng-container>
    </ng-template>
  `,
  styles: [`
    .tree-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }

    .tree-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f9f9f9;
      border-bottom: 1px solid #e0e0e0;
    }

    .tree-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .header-actions {
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

    .icon-btn:hover {
      background: #f0f0f0;
      border-color: #667eea;
    }

    .search-section {
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .search-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
    }

    .search-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .breadcrumb {
      padding: 8px 16px;
      background: #f9f9f9;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      white-space: nowrap;
    }

    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .breadcrumb-text {
      color: #667eea;
      cursor: pointer;
      transition: all 0.2s;
    }

    .breadcrumb-text:hover {
      text-decoration: underline;
    }

    .breadcrumb-separator {
      color: #999;
      margin: 0 4px;
    }

    .tree-view {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .tree-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
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

    .add-node-btn {
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

    .add-node-btn:hover {
      background: #5568d3;
    }

    .tree-nodes {
      display: flex;
      flex-direction: column;
    }

    .tree-node {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      min-height: 32px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }

    .tree-node:hover {
      background: rgba(102, 126, 234, 0.05);
    }

    .tree-node.selected {
      background: rgba(102, 126, 234, 0.1);
      border-left: 3px solid #667eea;
    }

    .expand-btn {
      width: 18px;
      height: 18px;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 10px;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .expand-btn:hover {
      color: #667eea;
    }

    .expand-placeholder {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .node-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .node-name {
      flex: 1;
      font-size: 13px;
      color: #333;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-type {
      font-size: 10px;
      padding: 2px 6px;
      background: #f0f0f0;
      color: #666;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;
      flex-shrink: 0;
    }

    .node-actions {
      display: none;
      gap: 2px;
      flex-shrink: 0;
    }

    .tree-node:hover .node-actions {
      display: flex;
    }

    .action-btn {
      width: 24px;
      height: 24px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .action-btn:hover:not(:disabled) {
      background: #f0f0f0;
      border-color: #667eea;
    }

    .action-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .action-btn.delete:hover:not(:disabled) {
      background: #fee;
      border-color: #ef4444;
      color: #ef4444;
    }

    .node-info {
      padding: 12px 16px;
      background: #f9f9f9;
      border-top: 1px solid #e0e0e0;
    }

    .info-header {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .info-label {
      font-size: 10px;
      color: #999;
      text-transform: uppercase;
    }

    .info-value {
      font-size: 12px;
      color: #333;
      font-weight: 500;
      font-family: 'Monaco', 'Courier New', monospace;
    }
  `]
})
export class NestedStructureTreeComponent implements OnInit, OnChanges {
  @Input() nodes: TreeNode[] = [];
  @Input() selectedNodeId?: string;
  @Output() nodeAction = new EventEmitter<TreeAction>();

  tokens = DESIGN_TOKENS;
  searchQuery = '';
  displayNodes: TreeNode[] = [];
  selectedNode: TreeNode | null = null;

  private nodeCounter = 1;

  ngOnInit(): void {
    this.initializeTree();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['nodes'] || changes['selectedNodeId']) {
      this.initializeTree();
    }
  }

  /**
   * Initialize tree structure
   */
  private initializeTree(): void {
    this.processNodes(this.nodes, null, 0);
    this.displayNodes = [...this.nodes];
    this.updateSelection();
    this.filterNodes();
  }

  /**
   * Process nodes recursively (set parent, level)
   */
  private processNodes(nodes: TreeNode[], parent: TreeNode | null, level: number): void {
    nodes.forEach(node => {
      node.parent = parent;
      node.level = level;
      if (node.children) {
        this.processNodes(node.children, node, level + 1);
      }
    });
  }

  /**
   * Update selection based on selectedNodeId
   */
  private updateSelection(): void {
    this.clearAllSelection(this.nodes);
    if (this.selectedNodeId) {
      const node = this.findNodeById(this.nodes, this.selectedNodeId);
      if (node) {
        node.selected = true;
        this.selectedNode = node;
        this.expandParents(node);
      }
    } else {
      this.selectedNode = null;
    }
  }

  /**
   * Clear selection on all nodes
   */
  private clearAllSelection(nodes: TreeNode[]): void {
    nodes.forEach(node => {
      node.selected = false;
      if (node.children) {
        this.clearAllSelection(node.children);
      }
    });
  }

  /**
   * Find node by ID
   */
  private findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Expand all parent nodes
   */
  private expandParents(node: TreeNode): void {
    let current = node.parent;
    while (current) {
      current.expanded = true;
      current = current.parent;
    }
  }

  /**
   * Select node
   */
  selectNode(node: TreeNode): void {
    this.clearAllSelection(this.nodes);
    node.selected = true;
    this.selectedNode = node;
    this.nodeAction.emit({ action: 'select', node });
  }

  /**
   * Toggle expand/collapse
   */
  toggleExpand(node: TreeNode): void {
    node.expanded = !node.expanded;
    this.nodeAction.emit({
      action: node.expanded ? 'expand' : 'collapse',
      node
    });
  }

  /**
   * Expand all nodes
   */
  expandAll(): void {
    this.setExpandedRecursive(this.nodes, true);
  }

  /**
   * Collapse all nodes
   */
  collapseAll(): void {
    this.setExpandedRecursive(this.nodes, false);
  }

  /**
   * Set expanded state recursively
   */
  private setExpandedRecursive(nodes: TreeNode[], expanded: boolean): void {
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        node.expanded = expanded;
        this.setExpandedRecursive(node.children, expanded);
      }
    });
  }

  /**
   * Add root node
   */
  addRootNode(): void {
    const newNode: TreeNode = {
      id: this.generateId(),
      type: 'container',
      name: `Node ${this.nodeCounter++}`,
      children: [],
      expanded: true,
      selected: false,
      parent: null,
      level: 0
    };
    this.nodeAction.emit({ action: 'add', node: newNode, parent: null });
  }

  /**
   * Add child node
   */
  addChildNode(parent: TreeNode): void {
    const newNode: TreeNode = {
      id: this.generateId(),
      type: 'container',
      name: `Node ${this.nodeCounter++}`,
      children: [],
      expanded: true,
      selected: false,
      parent: parent,
      level: (parent.level || 0) + 1
    };
    this.nodeAction.emit({ action: 'add', node: newNode, parent });
  }

  /**
   * Delete node
   */
  deleteNode(node: TreeNode): void {
    if (confirm(`Delete "${node.name}" and all its children?`)) {
      this.nodeAction.emit({ action: 'delete', node });
    }
  }

  /**
   * Duplicate node
   */
  duplicateNode(node: TreeNode): void {
    this.nodeAction.emit({ action: 'duplicate', node });
  }

  /**
   * Move node up
   */
  moveNodeUp(node: TreeNode): void {
    if (this.canMoveUp(node)) {
      this.nodeAction.emit({ action: 'moveUp', node });
    }
  }

  /**
   * Move node down
   */
  moveNodeDown(node: TreeNode): void {
    if (this.canMoveDown(node)) {
      this.nodeAction.emit({ action: 'moveDown', node });
    }
  }

  /**
   * Check if node can move up
   */
  canMoveUp(node: TreeNode): boolean {
    const siblings = node.parent ? node.parent.children! : this.nodes;
    const index = siblings.indexOf(node);
    return index > 0;
  }

  /**
   * Check if node can move down
   */
  canMoveDown(node: TreeNode): boolean {
    const siblings = node.parent ? node.parent.children! : this.nodes;
    const index = siblings.indexOf(node);
    return index < siblings.length - 1;
  }

  /**
   * Get breadcrumb path
   */
  getBreadcrumb(): TreeNode[] {
    if (!this.selectedNode) return [];
    const path: TreeNode[] = [];
    let current: TreeNode | null | undefined = this.selectedNode;
    while (current) {
      path.unshift(current);
      current = current.parent;
    }
    return path;
  }

  /**
   * Filter nodes by search query
   */
  filterNodes(): void {
    if (!this.searchQuery.trim()) {
      this.displayNodes = [...this.nodes];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.displayNodes = this.filterNodesRecursive(this.nodes, query);

    // Auto-expand nodes that have matches
    this.expandMatchingNodes(this.displayNodes);
  }

  /**
   * Filter nodes recursively
   */
  private filterNodesRecursive(nodes: TreeNode[], query: string): TreeNode[] {
    return nodes.filter(node => {
      const matches = node.name.toLowerCase().includes(query) ||
                     node.type.toLowerCase().includes(query);

      const hasMatchingChildren = node.children &&
        this.filterNodesRecursive(node.children, query).length > 0;

      return matches || hasMatchingChildren;
    });
  }

  /**
   * Expand nodes with matches
   */
  private expandMatchingNodes(nodes: TreeNode[]): void {
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        node.expanded = true;
        this.expandMatchingNodes(node.children);
      }
    });
  }

  /**
   * Check if node has children
   */
  hasChildren(node: TreeNode): boolean {
    return !!(node.children && node.children.length > 0);
  }

  /**
   * Get node icon based on type
   */
  getNodeIcon(type: string): string {
    const icons: Record<string, string> = {
      'root': '🏠',
      'container': '📦',
      'group': '📁',
      'text': '📝',
      'image': '🖼️',
      'shape': '🔷',
      'button': '🔘',
      'input': '📥',
      'list': '📋',
      'grid': '⊞',
      'flex': '⊟',
      'custom': '⚙️'
    };
    return icons[type] || '📄';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track by node ID
   */
  trackByNodeId(index: number, node: TreeNode): string {
    return node.id;
  }
}
