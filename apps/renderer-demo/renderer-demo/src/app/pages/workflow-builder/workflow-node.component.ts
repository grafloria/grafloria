import { Component, Input } from '@angular/core';
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
  template: `
    <div class="workflow-node" [ngClass]="['node-' + data.type, 'status-' + data.status]" *ngIf="data">
      <div class="node-status-indicator" [ngClass]="'indicator-' + data.status">
        {{ getStatusIcon() }}
      </div>
      <div class="node-content">
        <div class="node-icon">{{ getTypeIcon() }}</div>
        <div class="node-label">{{ data.label }}</div>
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
      border-color: #f39c12;
      transform: rotate(45deg);
    }

    .node-decision .node-content {
      transform: rotate(-45deg);
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
export class WorkflowNodeComponent {
  @Input() data!: WorkflowNodeData;

  getTypeIcon(): string {
    switch (this.data.type) {
      case 'start': return '▶️';
      case 'task': return '⚙️';
      case 'decision': return '❓';
      case 'end': return '🏁';
      default: return '📝';
    }
  }

  getStatusIcon(): string {
    switch (this.data.status) {
      case 'pending': return '⏸️';
      case 'running': return '▶️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⏸️';
    }
  }
}
