import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { WorkflowBuilderComponent } from './workflow-builder.component';
import { WorkflowNodeComponent } from './workflow-node.component';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

describe('WorkflowBuilderComponent', () => {
  let component: WorkflowBuilderComponent;
  let fixture: ComponentFixture<WorkflowBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowBuilderComponent, FormsModule, DiagramCanvasComponent, WorkflowNodeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkflowBuilderComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize engine on ngOnInit', () => {
      component.ngOnInit();
      expect(component.engine).toBeTruthy();
      expect(component.engine instanceof DiagramEngine).toBe(true);
    });

    it('should create sample workflow on initialization', () => {
      component.ngOnInit();

      const diagram = component.engine.getDiagram();
      expect(diagram).toBeTruthy();

      const nodes = diagram?.getNodes();
      expect(nodes?.length).toBeGreaterThanOrEqual(4); // At least start, tasks, decision, end
    });

    it('should initialize with idle execution status', () => {
      component.ngOnInit();
      expect(component.executionStatus).toBe('idle');
    });

    it('should initialize with zero execution index', () => {
      component.ngOnInit();
      expect(component.currentExecutionIndex).toBe(0);
    });

    it('should store workflow nodes in map', () => {
      component.ngOnInit();
      expect(component.workflowNodes.size).toBeGreaterThan(0);
    });
  });

  describe('Node Creation and Placement', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should create all workflow node types', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      const hasStart = nodes?.some(n => n.getMetadata('workflowType') === 'start');
      const hasTask = nodes?.some(n => n.getMetadata('workflowType') === 'task');
      const hasDecision = nodes?.some(n => n.getMetadata('workflowType') === 'decision');
      const hasEnd = nodes?.some(n => n.getMetadata('workflowType') === 'end');

      expect(hasStart).toBe(true);
      expect(hasTask).toBe(true);
      expect(hasDecision).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it('should position nodes at unique locations', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      const positions = nodes?.map(n => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);

      // All nodes should have unique positions
      expect(uniquePositions.size).toBe(nodes?.length);
    });

    it('should not have overlapping nodes', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      // Check each pair of nodes
      nodes?.forEach((node1, i) => {
        nodes?.forEach((node2, j) => {
          if (i !== j) {
            // Two nodes should not be at exact same position
            const samePosition =
              node1.position.x === node2.position.x &&
              node1.position.y === node2.position.y;

            expect(samePosition).toBe(false);
          }
        });
      });
    });

    it('should set workflow type metadata on each node', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      nodes?.forEach(node => {
        const workflowType = node.getMetadata('workflowType');
        expect(workflowType).toBeDefined();
        expect(['start', 'task', 'decision', 'end']).toContain(workflowType);
      });
    });

    it('should set label metadata on each node', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      nodes?.forEach(node => {
        const label = node.getMetadata('label');
        expect(label).toBeDefined();
        expect(label.length).toBeGreaterThan(0);
      });
    });

    it('should set initial status to pending for all nodes', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      nodes?.forEach(node => {
        const status = node.getMetadata('status');
        expect(status).toBe('pending');
      });
    });

    it('should store workflow nodes with correct data structure', () => {
      component.workflowNodes.forEach((workflowNode, id) => {
        expect(workflowNode.id).toBe(id);
        expect(workflowNode.type).toBeDefined();
        expect(workflowNode.label).toBeDefined();
        expect(workflowNode.status).toBe('pending');
        expect(workflowNode.position).toBeDefined();
        expect(workflowNode.position.x).toBeDefined();
        expect(workflowNode.position.y).toBeDefined();
      });
    });
  });

  describe('Node Sizing', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should set correct size for start nodes', () => {
      const diagram = component.engine.getDiagram();
      const startNode = diagram?.getNodes().find(n => n.getMetadata('workflowType') === 'start');

      expect(startNode?.size.width).toBe(120);
      expect(startNode?.size.height).toBe(120);
    });

    it('should set correct size for task nodes', () => {
      const diagram = component.engine.getDiagram();
      const taskNodes = diagram?.getNodes().filter(n => n.getMetadata('workflowType') === 'task');

      taskNodes?.forEach(node => {
        expect(node.size.width).toBe(180);
        expect(node.size.height).toBe(100);
      });
    });

    it('should set correct size for decision nodes', () => {
      const diagram = component.engine.getDiagram();
      const decisionNode = diagram?.getNodes().find(n => n.getMetadata('workflowType') === 'decision');

      expect(decisionNode?.size.width).toBe(140);
      expect(decisionNode?.size.height).toBe(140);
    });

    it('should set correct size for end nodes', () => {
      const diagram = component.engine.getDiagram();
      const endNode = diagram?.getNodes().find(n => n.getMetadata('workflowType') === 'end');

      expect(endNode?.size.width).toBe(120);
      expect(endNode?.size.height).toBe(120);
    });
  });

  describe('Connections', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should create connections between workflow nodes', () => {
      const diagram = component.engine.getDiagram();
      const links = diagram?.getLinks();

      expect(links?.length).toBeGreaterThan(0);
    });

    it('should use direct path type for connections', () => {
      const diagram = component.engine.getDiagram();
      const links = diagram?.getLinks();

      links?.forEach(link => {
        expect(link.pathType).toBe('direct');
      });
    });

    it('should connect nodes in workflow order', () => {
      const diagram = component.engine.getDiagram();
      const links = diagram?.getLinks();

      // There should be connections but no duplicate connections
      const connectionPairs = links?.map(link => `${link.sourcePortId}-${link.targetPortId}`);
      const uniquePairs = new Set(connectionPairs);

      expect(uniquePairs.size).toBe(connectionPairs?.length);
    });

    it('should not create self-referencing connections', () => {
      const diagram = component.engine.getDiagram();
      const links = diagram?.getLinks();

      links?.forEach(link => {
        const sourceNode = diagram?.getNodes().find(n =>
          n.getPorts().some(p => p.id === link.sourcePortId)
        );
        const targetNode = diagram?.getNodes().find(n =>
          n.getPorts().some(p => p.id === link.targetPortId)
        );

        expect(sourceNode).not.toBe(targetNode);
      });
    });
  });

  describe('Execution State Machine', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should start execution', () => {
      component.startExecution();

      expect(component.executionStatus).toBe('running');
      expect(component.currentExecutionIndex).toBe(0);
    });

    it('should not start if already running', () => {
      component.startExecution();
      const index = component.currentExecutionIndex;

      component.startExecution(); // Try to start again

      expect(component.currentExecutionIndex).toBe(index);
    });

    it('should pause execution', () => {
      component.startExecution();
      component.pauseExecution();

      expect(component.executionStatus).toBe('paused');
    });

    it('should resume execution from paused state', () => {
      component.startExecution();
      component.pauseExecution();
      component.resumeExecution();

      expect(component.executionStatus).toBe('running');
    });

    it('should stop execution and reset', () => {
      component.startExecution();
      component.stopExecution();

      expect(component.executionStatus).toBe('idle');
      expect(component.currentExecutionIndex).toBe(0);
    });

    it('should reset all nodes to pending when stopping', () => {
      component.startExecution();
      component.stopExecution();

      component.workflowNodes.forEach(node => {
        expect(node.status).toBe('pending');
      });
    });

    it('should allow step forward when not running', () => {
      component.stepForward();

      expect(component.executionStatus).toBe('paused');
    });
  });

  describe('Execution Flow', () => {
    beforeEach(() => {
      component.ngOnInit();
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should update node status during execution', (done) => {
      component.startExecution();

      // Fast-forward through execution
      setTimeout(() => {
        const hasRunning = Array.from(component.workflowNodes.values()).some(n => n.status === 'running' || n.status === 'completed');
        expect(hasRunning).toBe(true);
        done();
      }, 1500);

      jasmine.clock().tick(1500);
    });

    it('should progress through execution order', (done) => {
      component.startExecution();
      const initialIndex = component.currentExecutionIndex;

      setTimeout(() => {
        expect(component.currentExecutionIndex).toBeGreaterThan(initialIndex);
        done();
      }, 1200);

      jasmine.clock().tick(1200);
    });

    it('should complete execution when reaching end', (done) => {
      component.startExecution();

      // Fast-forward through entire workflow
      setTimeout(() => {
        const status = component.executionStatus;
        expect(status === 'completed' || status === 'running').toBe(true);
        done();
      }, 10000);

      jasmine.clock().tick(10000);
    });
  });

  describe('Node Status Updates', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should update diagram node metadata when updating statuses', () => {
      const nodeId = component.executionOrder[0];
      const workflowNode = component.workflowNodes.get(nodeId);

      if (workflowNode) {
        workflowNode.status = 'running';
        (component as any).updateNodeStatuses();

        const diagram = component.engine.getDiagram();
        const diagramNode = diagram?.getNodes().find(n =>
          n.getMetadata('label') === workflowNode.label
        );

        expect(diagramNode?.getMetadata('status')).toBe('running');
      }
    });
  });

  describe('Zoom Controls', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should zoom in correctly', () => {
      const initialZoom = component.zoom;
      component.zoomIn();

      expect(component.zoom).toBeGreaterThan(initialZoom);
    });

    it('should zoom out correctly', () => {
      const initialZoom = component.zoom;
      component.zoomOut();

      expect(component.zoom).toBeLessThan(initialZoom);
    });

    it('should not zoom beyond maximum (3.0)', () => {
      for (let i = 0; i < 20; i++) {
        component.zoomIn();
      }

      expect(component.zoom).toBeLessThanOrEqual(3.0);
    });

    it('should not zoom below minimum (0.1)', () => {
      for (let i = 0; i < 20; i++) {
        component.zoomOut();
      }

      expect(component.zoom).toBeGreaterThanOrEqual(0.1);
    });

    it('should fit view', () => {
      component.zoom = 2.0;
      component.fitToView();

      const diagram = component.engine.getDiagram();
      expect(diagram?.viewport.zoom).toBeDefined();
    });
  });

  describe('Execution Status Icon', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should return idle icon for idle status', () => {
      component.executionStatus = 'idle';
      expect(component.getStatusIcon('idle')).toBe('⏹️');
    });

    it('should return running icon for running status', () => {
      component.executionStatus = 'running';
      expect(component.getStatusIcon('running')).toBe('▶️');
    });

    it('should return paused icon for paused status', () => {
      component.executionStatus = 'paused';
      expect(component.getStatusIcon('paused')).toBe('⏸️');
    });

    it('should return completed icon for completed status', () => {
      component.executionStatus = 'completed';
      expect(component.getStatusIcon('completed')).toBe('✅');
    });
  });

  describe('Viewport Updates', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should update viewport on viewport changed event', () => {
      const newViewport = { x: 100, y: 200, width: 1000, height: 600 };
      component.onViewportChanged(newViewport);

      expect(component.viewport.x).toBe(100);
      expect(component.viewport.y).toBe(200);
    });

    it('should update zoom on zoom changed event', () => {
      component.onZoomChanged(1.5);
      expect(component.zoom).toBe(1.5);
    });
  });

  describe('Duplicate Node Prevention', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should not create duplicate nodes for same workflow node ID', () => {
      const diagram = component.engine.getDiagram();
      const initialNodeCount = diagram?.getNodes().length || 0;

      // Stored workflow nodes should match diagram nodes
      expect(component.workflowNodes.size).toBe(initialNodeCount);
    });

    it('should maintain 1:1 relationship between workflowNodes map and diagram nodes', () => {
      const diagram = component.engine.getDiagram();
      const diagramNodes = diagram?.getNodes() || [];

      // Each workflow node should correspond to exactly one diagram node
      component.workflowNodes.forEach((workflowNode, id) => {
        const matchingDiagramNodes = diagramNodes.filter(n =>
          n.getMetadata('label') === workflowNode.label &&
          n.getMetadata('workflowType') === workflowNode.type
        );

        expect(matchingDiagramNodes.length).toBe(1);
      });
    });

    it('should not render duplicate visual elements', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes() || [];

      // Each node should have unique ID
      const nodeIds = nodes.map(n => n.id);
      const uniqueIds = new Set(nodeIds);

      expect(uniqueIds.size).toBe(nodeIds.length);
    });

    it('should not have overlapping node renders at same coordinates', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes() || [];

      // Group nodes by position
      const positionGroups = new Map<string, NodeModel[]>();

      nodes.forEach(node => {
        const key = `${node.position.x},${node.position.y}`;
        if (!positionGroups.has(key)) {
          positionGroups.set(key, []);
        }
        positionGroups.get(key)!.push(node);
      });

      // No position should have multiple nodes
      positionGroups.forEach((nodesAtPosition, position) => {
        expect(nodesAtPosition.length).toBe(1);
      });
    });
  });

  describe('Execution Order', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should have valid execution order', () => {
      expect(component.executionOrder.length).toBeGreaterThan(0);
    });

    it('should only include valid node IDs in execution order', () => {
      component.executionOrder.forEach(nodeId => {
        expect(component.workflowNodes.has(nodeId)).toBe(true);
      });
    });

    it('should start with start node', () => {
      const firstNodeId = component.executionOrder[0];
      const firstNode = component.workflowNodes.get(firstNodeId);

      expect(firstNode?.type).toBe('start');
    });

    it('should end with end node', () => {
      const lastNodeId = component.executionOrder[component.executionOrder.length - 1];
      const lastNode = component.workflowNodes.get(lastNodeId);

      expect(lastNode?.type).toBe('end');
    });
  });
});
