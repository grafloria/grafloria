import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type WorkflowNodeType = 'start' | 'task' | 'decision' | 'end';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'error';

export interface WorkflowNodeData {
  type: WorkflowNodeType;
  label: string;
  status: NodeStatus;
}

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div class="workflow-node" [ngClass]="['node-' + workflowType, 'status-' + status]" *ngIf="node">
      <svg *ngIf="workflowType === 'decision'" class="diamond-bg" viewBox="0 0 140 140" preserveAspectRatio="none">
        <polygon points="70,5 135,70 70,135 5,70"
                 [attr.fill]="getShapeFill()"
                 [attr.stroke]="getShapeStroke()"
                 [attr.stroke-width]="status === 'running' ? 4 : 3"/>
      </svg>
      <div class="node-status-indicator" [ngClass]="'indicator-' + status">
        {{ getStatusIcon() }}
      </div>
      <div class="node-content">
        <div class="node-icon">{{ getTypeIcon() }}</div>
        <div class="node-label">{{ label }}</div>
      </div>
    </div>
  `,
  styles: [`
    .workflow-node {
      background: white;
      border: 3px solid #95a5a6;
      border-radius: 12px;
      padding: 1rem;
      min-width: 140px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      position: relative;
      transition: all 0.3s ease;
    }

    .node-start {
      border-color: #27ae60;
      border-radius: 50%;
      padding: 1.5rem;
    }

    .node-end {
      border-color: #e74c3c;
      border-radius: 50%;
      padding: 1.5rem;
    }

    .node-decision {
      border: none;
      background: transparent;
      position: relative;
    }

    .diamond-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      transition: filter 0.3s ease;
    }

    .node-decision.status-running .diamond-bg {
      filter: drop-shadow(0 0 8px rgba(241, 196, 15, 0.6));
    }

    .node-decision .node-content {
      position: relative;
      z-index: 1;
    }

    .node-task {
      border-color: #3498db;
    }

    .node-status-indicator {
      position: absolute;
      top: -12px;
      right: -12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      background: white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      z-index: 10;
    }

    .indicator-pending {
      background: #ecf0f1;
    }

    .indicator-running {
      background: #fff3cd;
      animation: pulse 1s infinite;
    }

    .indicator-completed {
      background: #d4edda;
    }

    .indicator-error {
      background: #f8d7da;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .status-running {
      border-width: 4px;
      box-shadow: 0 0 0 4px rgba(241, 196, 15, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .status-completed {
      border-color: #27ae60;
      opacity: 0.8;
    }

    .node-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .node-icon {
      font-size: 1.5rem;
    }

    .node-label {
      font-weight: 600;
      color: #2c3e50;
      text-align: center;
      font-size: 0.9rem;
    }
  `]
})
export class WorkflowNodeComponent implements OnInit, OnChanges, OnDestroy {
  @Input() node: any; // NodeModel from the engine
  @Input() engine?: any; // DiagramEngine (optional)

  private unsubscribe?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Subscribe to node metadata changes
    // When metadata changes, trigger change detection so getters are re-evaluated
    if (this.node && typeof this.node.on === 'function') {
      this.unsubscribe = this.node.on('change:metadata.status', () => {
        // Status metadata changed - trigger change detection
        this.cdr.detectChanges();
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Trigger change detection when inputs change
    if (changes['node']) {
      // Unsubscribe from old node
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = undefined;
      }

      // Subscribe to new node
      if (this.node && typeof this.node.on === 'function') {
        this.unsubscribe = this.node.on('change:metadata.status', () => {
          this.cdr.detectChanges();
        });
      }

      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    // Clean up subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  // Use getters to always read fresh metadata from the node
  get workflowType(): WorkflowNodeType {
    return this.node?.getMetadata('workflowType') || 'task';
  }

  get label(): string {
    return this.node?.getMetadata('label') || '';
  }

  get status(): NodeStatus {
    return this.node?.getMetadata('status') || 'pending';
  }

  getTypeIcon(): string {
    switch (this.workflowType) {
      case 'start': return '▶️';
      case 'task': return '⚙️';
      case 'decision': return '❓';
      case 'end': return '🏁';
      default: return '📝';
    }
  }

  getStatusIcon(): string {
    switch (this.status) {
      case 'pending': return '⏸️';
      case 'running': return '▶️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⏸️';
    }
  }

  getShapeFill(): string {
    // Return white background for all statuses
    return 'white';
  }

  getShapeStroke(): string {
    // Return stroke color based on status and node type
    if (this.status === 'completed') {
      return '#27ae60'; // Green when completed
    } else if (this.status === 'running') {
      return '#f39c12'; // Orange when running
    }
    // Default color for decision node
    return '#f39c12';
  }
}
