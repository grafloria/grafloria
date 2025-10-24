import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { WorkflowNodeComponent, type WorkflowNodeType, type NodeStatus } from './workflow-node.component';

type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed';

interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  status: NodeStatus;
  position: {x: number, y: number};
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent, WorkflowNodeComponent],
  selector: 'app-workflow-builder',
  templateUrl: './workflow-builder.component.html',
  styleUrl: './workflow-builder.component.css',
})
export class WorkflowBuilderComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  executionStatus: ExecutionStatus = 'idle';
  currentExecutionIndex = 0;
  workflowNodes: Map<string, WorkflowNode> = new Map();
  executionOrder: string[] = [];

  ngOnInit() {
    this.initializeEngine();
    this.createSampleWorkflow();
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine();
    console.log('Workflow Builder initialized');
  }

  private createSampleWorkflow(): void {
    const diagram = this.engine.createDiagram('Workflow');

    // Create workflow nodes
    const startNode = this.createWorkflowNode('start', 'start', 'Start', { x: 100, y: 200 });
    const task1Node = this.createWorkflowNode('task1', 'task', 'Process Order', { x: 300, y: 200 });
    const decisionNode = this.createWorkflowNode('decision1', 'decision', 'Stock Available?', { x: 550, y: 200 });
    const task2Node = this.createWorkflowNode('task2', 'task', 'Ship Order', { x: 750, y: 100 });
    const task3Node = this.createWorkflowNode('task3', 'task', 'Notify Customer', { x: 750, y: 300 });
    const endNode = this.createWorkflowNode('end', 'end', 'End', { x: 950, y: 200 });

    // Create connections
    diagram.connectNodes(startNode, task1Node, 'direct');
    diagram.connectNodes(task1Node, decisionNode, 'direct');
    diagram.connectNodes(decisionNode, task2Node, 'direct');
    diagram.connectNodes(decisionNode, task3Node, 'direct');
    diagram.connectNodes(task2Node, endNode, 'direct');
    diagram.connectNodes(task3Node, endNode, 'direct');

    // Set execution order
    this.executionOrder = ['start', 'task1', 'decision1', 'task2', 'end'];

    diagram.fitToView(100);
    this.updateViewportFromDiagram();
  }

  private createWorkflowNode(
    id: string,
    type: WorkflowNodeType,
    label: string,
    position: { x: number; y: number }
  ): NodeModel {
    const diagram = this.engine.getDiagram();
    if (!diagram) throw new Error('No diagram');

    const sizes = {
      start: { width: 120, height: 120 },
      task: { width: 180, height: 100 },
      decision: { width: 140, height: 140 },
      end: { width: 120, height: 120 }
    };

    const node = new NodeModel({
      type: 'workflow',
      position,
      size: sizes[type]
    });

    node.setMetadata('workflowType', type);
    node.setMetadata('label', label);
    node.setMetadata('status', 'pending');

    const workflowNode: WorkflowNode = {
      id,
      type,
      label,
      status: 'pending',
      position
    };
    this.workflowNodes.set(id, workflowNode);

    diagram.addNode(node);
    return node;
  }

  startExecution(): void {
    if (this.executionStatus === 'running') return;

    this.executionStatus = 'running';
    this.currentExecutionIndex = 0;

    // Reset all nodes
    this.workflowNodes.forEach(node => {
      node.status = 'pending';
    });

    this.executeNextStep();
  }

  pauseExecution(): void {
    this.executionStatus = 'paused';
  }

  resumeExecution(): void {
    if (this.executionStatus === 'paused') {
      this.executionStatus = 'running';
      this.executeNextStep();
    }
  }

  stopExecution(): void {
    this.executionStatus = 'idle';
    this.currentExecutionIndex = 0;

    // Reset all nodes
    this.workflowNodes.forEach(node => {
      node.status = 'pending';
    });

    this.updateNodeStatuses();
  }

  stepForward(): void {
    if (this.executionStatus === 'running') return;

    this.executionStatus = 'paused';
    this.executeNextStep();
  }

  private executeNextStep(): void {
    if (this.executionStatus !== 'running' && this.executionStatus !== 'paused') return;
    if (this.currentExecutionIndex >= this.executionOrder.length) {
      this.executionStatus = 'completed';
      return;
    }

    const nodeId = this.executionOrder[this.currentExecutionIndex];
    const workflowNode = this.workflowNodes.get(nodeId);

    if (workflowNode) {
      workflowNode.status = 'running';
      this.updateNodeStatuses();

      // Simulate execution time
      setTimeout(() => {
        if (workflowNode) {
          workflowNode.status = 'completed';
          this.updateNodeStatuses();
        }

        this.currentExecutionIndex++;

        if (this.executionStatus === 'running') {
          this.executeNextStep();
        }
      }, 1000);
    }
  }

  private updateNodeStatuses(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    diagram.getNodes().forEach(node => {
      const nodeId = this.executionOrder.find(id =>
        this.workflowNodes.get(id)?.label === node.getMetadata('label')
      );

      if (nodeId) {
        const workflowNode = this.workflowNodes.get(nodeId);
        if (workflowNode) {
          node.setMetadata('status', workflowNode.status);
        }
      }
    });
  }

  onViewportChanged(rect: Rectangle): void {
    this.viewport = rect;
  }

  onZoomChanged(newZoom: number): void {
    this.zoom = newZoom;
  }

  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const vp = diagram.getViewport();
      this.viewport = { x: vp.x, y: vp.y, width: vp.width, height: vp.height };
      this.zoom = vp.zoom;
    }
  }

  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.min(diagram.viewport.zoom * 1.1, 3.0);
      diagram.setZoom(newZoom);
      this.updateViewportFromDiagram();
    }
  }

  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.max(diagram.viewport.zoom / 1.1, 0.1);
      diagram.setZoom(newZoom);
      this.updateViewportFromDiagram();
    }
  }

  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(100);
      this.updateViewportFromDiagram();
    }
  }

  getStatusIcon(status: ExecutionStatus): string {
    switch (status) {
      case 'idle': return '⏹️';
      case 'running': return '▶️';
      case 'paused': return '⏸️';
      case 'completed': return '✅';
      default: return '⏹️';
    }
  }
}
