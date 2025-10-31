import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DiagramEngine, NodeModel, PortModel, LinkModel, InteractionMode, PortVisibilityStrategy } from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

type WorkflowNodeType = 'start' | 'task' | 'decision' | 'end';
type NodeStatus = 'pending' | 'running' | 'completed' | 'error';

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
  imports: [CommonModule, FormsModule, DiagramCanvasComponent],
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

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.initializeEngine();
    this.createSampleWorkflow();

    // Force change detection to ensure initial render (like shape-gallery demo)
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine({
      interaction: {
        mode: InteractionMode.SMART,
        portVisibility: PortVisibilityStrategy.ALWAYS,
        enableSmartAutoConnect: true,
      }
    });
    console.log('Workflow Builder initialized with smart interaction mode');
  }

  private createSampleWorkflow(): void {
    const diagram = this.engine.createDiagram('Workflow');
    // Note: createDiagram() automatically calls setDiagram()

    // Enable automatic link rerouting when nodes move (Observer Pattern)
    this.engine.enableLiveRerouting();

    // ✅ Use batch mode for bulk operations (Principle #2 from Master Troubleshooting Guide)
    diagram.beginBatch();

    // Create workflow nodes
    const startNode = this.createWorkflowNode('start', 'start', 'Start', { x: 100, y: 200 });
    const task1Node = this.createWorkflowNode('task1', 'task', 'Process Order', { x: 300, y: 200 });
    const decisionNode = this.createWorkflowNode('decision1', 'decision', 'Stock Available?', { x: 550, y: 200 });
    const task2Node = this.createWorkflowNode('task2', 'task', 'Ship Order', { x: 750, y: 100 });
    const task3Node = this.createWorkflowNode('task3', 'task', 'Notify Customer', { x: 750, y: 300 });
    const endNode = this.createWorkflowNode('end', 'end', 'End', { x: 950, y: 200 });

    // Create connections using ports for proper shape-aware routing
    const link1 = new LinkModel(startNode.getPorts()[1].id, task1Node.getPorts()[0].id, 'orthogonal');
    const link2 = new LinkModel(task1Node.getPorts()[1].id, decisionNode.getPorts()[0].id, 'orthogonal');
    const link3 = new LinkModel(decisionNode.getPorts()[1].id, task2Node.getPorts()[0].id, 'orthogonal'); // right -> top branch
    const link4 = new LinkModel(decisionNode.getPorts()[2].id, task3Node.getPorts()[0].id, 'orthogonal'); // bottom -> bottom branch
    const link5 = new LinkModel(task2Node.getPorts()[1].id, endNode.getPorts()[0].id, 'orthogonal');
    const link6 = new LinkModel(task3Node.getPorts()[1].id, endNode.getPorts()[0].id, 'orthogonal');

    diagram.addLink(link1);
    diagram.addLink(link2);
    diagram.addLink(link3);
    diagram.addLink(link4);
    diagram.addLink(link5);
    diagram.addLink(link6);

    // End batch - events fire together, UI updates once
    diagram.endBatch();

    // Set execution order
    this.executionOrder = ['start', 'task1', 'decision1', 'task2', 'end'];

    // ✅ Mark dirty after programmatic changes (Principle #3 from Master Troubleshooting Guide)
    diagram.markDirty();

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

    // Map workflow types to shape types
    const shapeTypes: Record<WorkflowNodeType, 'circle' | 'rect' | 'diamond'> = {
      start: 'circle',
      task: 'rect',
      decision: 'diamond',
      end: 'circle'
    };

    // Color scheme based on node type
    const colors = {
      start: { fill: '#e8f5e9', stroke: '#27ae60' },
      task: { fill: '#e3f2fd', stroke: '#3498db' },
      decision: { fill: '#fff3e0', stroke: '#f39c12' },
      end: { fill: '#ffebee', stroke: '#e74c3c' }
    };

    const node = new NodeModel({
      type: shapeTypes[type],
      position,
      size: sizes[type]
    });

    // ✅ CRITICAL: Set node.style (not just metadata) so computeNodeStylesProgrammatic uses these colors
    node.style = {
      fill: colors[type].fill,
      stroke: colors[type].stroke,
      strokeWidth: 3,
      borderRadius: type === 'task' ? 12 : undefined
    };

    // Also set shape metadata for SVG renderer
    const shapeMetadata = {
      type: shapeTypes[type],
      fill: colors[type].fill,
      stroke: colors[type].stroke,
      strokeWidth: 3,
      cornerRadius: type === 'task' ? 12 : undefined
    };
    node.setMetadata('shape', shapeMetadata);

    console.log(`[Workflow] Created node ${id} with style:`, node.style);
    console.log(`[Workflow] Created node ${id} with shape metadata:`, shapeMetadata);

    // Set workflow metadata
    node.setMetadata('workflowType', type);
    node.setMetadata('label', label);
    node.setMetadata('status', 'pending');

    // Add ports for connections
    const inputPort = new PortModel({
      id: `${id}-in`,
      type: 'input',
      side: type === 'start' ? undefined : 'left'
    });

    const outputPort = new PortModel({
      id: `${id}-out`,
      type: 'output',
      side: type === 'end' ? undefined : 'right'
    });

    node.addPort(inputPort);
    node.addPort(outputPort);

    // For decision nodes, add additional ports
    if (type === 'decision') {
      const yesPort = new PortModel({
        id: `${id}-yes`,
        type: 'output',
        side: 'bottom'
      });
      node.addPort(yesPort);
    }

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

  stepBackward(): void {
    // Can't step back if running or at the beginning
    if (this.executionStatus === 'running' || this.currentExecutionIndex === 0) return;

    // Set status to paused if it was completed
    if (this.executionStatus === 'completed') {
      this.executionStatus = 'paused';
    }

    // Move back one step
    this.currentExecutionIndex--;

    // Reset all nodes from current position onwards to pending
    // (This includes the node we just stepped back from)
    for (let i = this.currentExecutionIndex; i < this.executionOrder.length; i++) {
      const nodeId = this.executionOrder[i];
      const node = this.workflowNodes.get(nodeId);
      if (node) {
        node.status = 'pending';
      }
    }

    // Set all nodes BEFORE current position to completed
    for (let i = 0; i < this.currentExecutionIndex; i++) {
      const nodeId = this.executionOrder[i];
      const node = this.workflowNodes.get(nodeId);
      if (node) {
        node.status = 'completed';
      }
    }

    // Update all node statuses in the diagram
    this.updateNodeStatuses();
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

    console.log('[Workflow] updateNodeStatuses called');

    diagram.getNodes().forEach(node => {
      const nodeId = this.executionOrder.find(id =>
        this.workflowNodes.get(id)?.label === node.getMetadata('label')
      );

      if (nodeId) {
        const workflowNode = this.workflowNodes.get(nodeId);
        if (workflowNode) {
          node.setMetadata('status', workflowNode.status);

          // Update shape stroke color based on status
          const shape = node.getMetadata('shape');
          if (shape) {
            const workflowType = node.getMetadata('workflowType');
            const baseColors = {
              start: '#27ae60',
              task: '#3498db',
              decision: '#f39c12',
              end: '#e74c3c'
            };

            let stroke = baseColors[workflowType as WorkflowNodeType] || '#95a5a6';
            let strokeWidth = 3;

            if (workflowNode.status === 'running') {
              stroke = '#f39c12'; // Orange when running
              strokeWidth = 4;
            } else if (workflowNode.status === 'completed') {
              stroke = '#27ae60'; // Green when completed
            }

            console.log(`[Workflow] Updating node ${nodeId} (${workflowNode.label}) to status ${workflowNode.status}, stroke: ${stroke}`);

            node.setMetadata('shape', {
              ...shape,
              stroke,
              strokeWidth
            });

            // Verify the metadata was updated
            const updatedShape = node.getMetadata('shape');
            console.log(`[Workflow] Verified shape metadata:`, updatedShape);
          }

          // ✅ CORRECT: setMetadata() automatically triggers:
          // → node 'change' event
          // → diagram 'node:changed' event
          // → DiagramCanvasComponent listener
          // → renderDiagram() + cdr.detectChanges()
          // No need to call node.markDirty() - it's redundant
          // No need to call this.cdr.detectChanges() - wrong component
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
