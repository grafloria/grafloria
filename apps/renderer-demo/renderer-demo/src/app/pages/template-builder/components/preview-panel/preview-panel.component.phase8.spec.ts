import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PreviewPanelComponent } from './preview-panel.component';
import { PerformanceMonitorService } from '../../services/performance-monitor.service';
import { DiagramEngine, NodeTemplate } from '@grafloria/engine';

/**
 * Phase 8 Tests: Multi-Node Preview & Connections
 *
 * Tests for Phase 8 features:
 * - Multi-node canvas management
 * - Connection rendering
 * - Enhanced zoom/pan controls
 * - Keyboard shortcuts
 * - Minimap integration
 */
describe('PreviewPanelComponent - Phase 8 Features', () => {
  let component: PreviewPanelComponent;
  let fixture: ComponentFixture<PreviewPanelComponent>;
  let mockPerformanceMonitor: jasmine.SpyObj<PerformanceMonitorService>;

  const sampleTemplate: NodeTemplate = {
    id: 'test-template',
    name: 'Test Template',
    version: '1.0.0',
    category: 'test',
    meta: {
      description: 'Test template',
      tags: ['test'],
      author: 'Test'
    },
    structure: {
      type: 'rect',
      size: { width: 200, height: 100 },
      shape: {
        type: 'rect',
        fill: '#3498db',
        stroke: '#2980b9',
        strokeWidth: 2
      },
      ports: {
        enabled: true,
        items: [
          { id: 'in', type: 'input', side: 'left', alignment: 0.5 },
          { id: 'out', type: 'output', side: 'right', alignment: 0.5 }
        ]
      }
    },
    defaultData: { label: 'Test Node' }
  };

  beforeEach(async () => {
    mockPerformanceMonitor = jasmine.createSpyObj('PerformanceMonitorService', [
      'startMeasure',
      'endMeasure',
      'reset'
    ]);

    await TestBed.configureTestingModule({
      imports: [PreviewPanelComponent],
      providers: [
        { provide: PerformanceMonitorService, useValue: mockPerformanceMonitor }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PreviewPanelComponent);
    component = fixture.componentInstance;
    component.multiNodeMode = true; // Enable multi-node mode
    component.template = JSON.stringify(sampleTemplate);
    fixture.detectChanges();
  });

  describe('Multi-Node Canvas Management', () => {
    it('should create component with multi-node mode enabled', () => {
      expect(component).toBeTruthy();
      expect(component.multiNodeMode).toBe(true);
      expect(component.nodes.size).toBe(0);
      expect(component.connections.size).toBe(0);
    });

    it('should add node to canvas', () => {
      const nodeId = component.addNodeToCanvas();

      expect(nodeId).toBeTruthy();
      expect(component.nodes.size).toBe(1);

      const nodeInfo = component.nodes.get(nodeId);
      expect(nodeInfo).toBeDefined();
      expect(nodeInfo!.templateId).toBe('test-template');
      expect(nodeInfo!.nodeModel).toBeDefined();
    });

    it('should add multiple nodes to canvas', () => {
      const nodeId1 = component.addNodeToCanvas();
      const nodeId2 = component.addNodeToCanvas();
      const nodeId3 = component.addNodeToCanvas();

      expect(component.nodes.size).toBe(3);
      expect(nodeId1).not.toBe(nodeId2);
      expect(nodeId2).not.toBe(nodeId3);
    });

    it('should add node at specified position', () => {
      const position = { x: 500, y: 300 };
      const nodeId = component.addNodeToCanvas(position);

      const nodeInfo = component.nodes.get(nodeId);
      expect(nodeInfo!.position).toEqual(position);
    });

    it('should auto-position nodes in grid layout', () => {
      const nodeId1 = component.addNodeToCanvas();
      const nodeId2 = component.addNodeToCanvas();
      const nodeId3 = component.addNodeToCanvas();
      const nodeId4 = component.addNodeToCanvas();

      const node1 = component.nodes.get(nodeId1);
      const node2 = component.nodes.get(nodeId2);
      const node3 = component.nodes.get(nodeId3);
      const node4 = component.nodes.get(nodeId4);

      // First row
      expect(node1!.position.y).toBe(node2!.position.y);
      expect(node2!.position.y).toBe(node3!.position.y);

      // Second row
      expect(node4!.position.y).toBeGreaterThan(node1!.position.y);

      // Columns
      expect(node2!.position.x).toBeGreaterThan(node1!.position.x);
      expect(node3!.position.x).toBeGreaterThan(node2!.position.x);
    });

    it('should remove node from canvas', () => {
      const nodeId = component.addNodeToCanvas();
      expect(component.nodes.size).toBe(1);

      component.removeNodeFromCanvas(nodeId);
      expect(component.nodes.size).toBe(0);
    });

    it('should remove selected nodes', () => {
      const nodeId1 = component.addNodeToCanvas();
      const nodeId2 = component.addNodeToCanvas();
      const nodeId3 = component.addNodeToCanvas();

      component.selectedNodeIds.add(nodeId1);
      component.selectedNodeIds.add(nodeId3);

      component.removeSelectedNodes();

      expect(component.nodes.size).toBe(1);
      expect(component.nodes.has(nodeId2)).toBe(true);
      expect(component.selectedNodeIds.size).toBe(0);
    });

    it('should clear entire canvas', () => {
      component.addNodeToCanvas();
      component.addNodeToCanvas();
      component.addNodeToCanvas();

      expect(component.nodes.size).toBe(3);

      component.clearCanvas();

      expect(component.nodes.size).toBe(0);
      expect(component.connections.size).toBe(0);
      expect(component.selectedNodeIds.size).toBe(0);
    });

    it('should auto-layout nodes in grid', () => {
      const nodeId1 = component.addNodeToCanvas({ x: 100, y: 100 });
      const nodeId2 = component.addNodeToCanvas({ x: 500, y: 500 });
      const nodeId3 = component.addNodeToCanvas({ x: 1000, y: 1000 });

      // Before auto-layout, positions are scattered
      const beforeNode1 = component.nodes.get(nodeId1)!;
      const beforeNode2 = component.nodes.get(nodeId2)!;
      expect(beforeNode1.position.x).toBe(100);
      expect(beforeNode2.position.x).toBe(500);

      component.autoLayoutNodes();

      // After auto-layout, nodes should be in grid pattern
      const afterNode1 = component.nodes.get(nodeId1)!;
      const afterNode2 = component.nodes.get(nodeId2)!;
      const afterNode3 = component.nodes.get(nodeId3)!;

      expect(afterNode1.position.y).toBe(afterNode2.position.y);
      expect(afterNode2.position.x).toBeGreaterThan(afterNode1.position.x);
      expect(afterNode3.position.y).toBeGreaterThan(afterNode1.position.y);
    });

    it('should get node count', () => {
      expect(component.getNodeCount()).toBe(0);

      component.addNodeToCanvas();
      expect(component.getNodeCount()).toBe(1);

      component.addNodeToCanvas();
      component.addNodeToCanvas();
      expect(component.getNodeCount()).toBe(3);
    });
  });

  describe('Connection Management', () => {
    let nodeId1: string;
    let nodeId2: string;

    beforeEach(() => {
      nodeId1 = component.addNodeToCanvas();
      nodeId2 = component.addNodeToCanvas();
    });

    it('should add connection between nodes', () => {
      const connectionId = component.addConnection(nodeId1, nodeId2);

      expect(connectionId).toBeTruthy();
      expect(component.connections.size).toBe(1);

      const connection = component.connections.get(connectionId);
      expect(connection!.sourceNodeId).toBe(nodeId1);
      expect(connection!.targetNodeId).toBe(nodeId2);
      expect(connection!.style).toBe('curved');
    });

    it('should add connection with different styles', () => {
      const connId1 = component.addConnection(nodeId1, nodeId2, 'straight');
      const connId2 = component.addConnection(nodeId2, nodeId1, 'orthogonal');

      expect(component.connections.get(connId1)!.style).toBe('straight');
      expect(component.connections.get(connId2)!.style).toBe('orthogonal');
    });

    it('should add connection with label', () => {
      const connectionId = component.addConnection(nodeId1, nodeId2, 'curved', 'Test Connection');

      const connection = component.connections.get(connectionId);
      expect(connection!.label).toBe('Test Connection');
    });

    it('should not add connection if source node does not exist', () => {
      const connectionId = component.addConnection('non-existent', nodeId2);
      expect(connectionId).toBe('');
      expect(component.connections.size).toBe(0);
    });

    it('should not add connection if target node does not exist', () => {
      const connectionId = component.addConnection(nodeId1, 'non-existent');
      expect(connectionId).toBe('');
      expect(component.connections.size).toBe(0);
    });

    it('should remove connection', () => {
      const connectionId = component.addConnection(nodeId1, nodeId2);
      expect(component.connections.size).toBe(1);

      component.removeConnection(connectionId);
      expect(component.connections.size).toBe(0);
    });

    it('should remove all connections when node is removed', () => {
      const nodeId3 = component.addNodeToCanvas();

      const connId1 = component.addConnection(nodeId1, nodeId2);
      const connId2 = component.addConnection(nodeId2, nodeId3);
      const connId3 = component.addConnection(nodeId1, nodeId3);

      expect(component.connections.size).toBe(3);

      // Remove nodeId2, should remove connId1 and connId2
      component.removeNodeFromCanvas(nodeId2);

      expect(component.connections.size).toBe(1);
      expect(component.connections.has(connId3)).toBe(true);
    });

    it('should get connection count', () => {
      expect(component.getConnectionCount()).toBe(0);

      component.addConnection(nodeId1, nodeId2);
      expect(component.getConnectionCount()).toBe(1);

      const nodeId3 = component.addNodeToCanvas();
      component.addConnection(nodeId2, nodeId3);
      expect(component.getConnectionCount()).toBe(2);
    });
  });

  describe('Enhanced Zoom and Pan Controls', () => {
    it('should set zoom to specific percentage', () => {
      component.setZoomPercentage(150);
      expect(component.zoom).toBeCloseTo(1.5, 2);

      component.setZoomPercentage(50);
      expect(component.zoom).toBeCloseTo(0.5, 2);
    });

    it('should have zoom presets array', () => {
      expect(component.zoomPresets).toEqual([25, 50, 75, 100, 125, 150, 200, 300, 400, 500]);
    });

    it('should fit to selection when nodes are selected', () => {
      const nodeId1 = component.addNodeToCanvas({ x: 100, y: 100 });
      const nodeId2 = component.addNodeToCanvas({ x: 500, y: 300 });

      component.selectedNodeIds.add(nodeId1);
      component.selectedNodeIds.add(nodeId2);

      const initialZoom = component.zoom;
      component.fitToSelection();

      // Zoom should change to fit selected nodes
      expect(component.zoom).not.toBe(initialZoom);
    });

    it('should fit to view when no nodes are selected', () => {
      component.addNodeToCanvas();
      component.addNodeToCanvas();

      spyOn(component, 'fitToView');

      component.fitToSelection();

      expect(component.fitToView).toHaveBeenCalled();
    });

    it('should track canvas focus state', () => {
      expect(component['isCanvasFocused']).toBe(false);

      component.onCanvasFocus();
      expect(component['isCanvasFocused']).toBe(true);

      component.onCanvasBlur();
      expect(component['isCanvasFocused']).toBe(false);
    });
  });

  describe('Node Selection', () => {
    let nodeId1: string;
    let nodeId2: string;
    let nodeId3: string;

    beforeEach(() => {
      nodeId1 = component.addNodeToCanvas();
      nodeId2 = component.addNodeToCanvas();
      nodeId3 = component.addNodeToCanvas();
    });

    it('should select a single node', () => {
      component.selectNode(nodeId1);

      expect(component.selectedNodeIds.size).toBe(1);
      expect(component.selectedNodeIds.has(nodeId1)).toBe(true);
    });

    it('should replace selection when multi is false', () => {
      component.selectNode(nodeId1);
      component.selectNode(nodeId2);

      expect(component.selectedNodeIds.size).toBe(1);
      expect(component.selectedNodeIds.has(nodeId2)).toBe(true);
      expect(component.selectedNodeIds.has(nodeId1)).toBe(false);
    });

    it('should add to selection when multi is true', () => {
      component.selectNode(nodeId1, true);
      component.selectNode(nodeId2, true);

      expect(component.selectedNodeIds.size).toBe(2);
      expect(component.selectedNodeIds.has(nodeId1)).toBe(true);
      expect(component.selectedNodeIds.has(nodeId2)).toBe(true);
    });

    it('should toggle node selection', () => {
      component.selectNode(nodeId1);
      expect(component.selectedNodeIds.has(nodeId1)).toBe(true);

      component.selectNode(nodeId1);
      expect(component.selectedNodeIds.has(nodeId1)).toBe(false);
    });

    it('should deselect all nodes', () => {
      component.selectNode(nodeId1, true);
      component.selectNode(nodeId2, true);
      component.selectNode(nodeId3, true);

      expect(component.selectedNodeIds.size).toBe(3);

      component.deselectAll();

      expect(component.selectedNodeIds.size).toBe(0);
    });
  });

  describe('Minimap Integration', () => {
    it('should have minimap visible by default', () => {
      expect(component.minimapVisible).toBe(true);
    });

    it('should toggle minimap visibility', () => {
      component.toggleMinimap();
      expect(component.minimapVisible).toBe(false);

      component.toggleMinimap();
      expect(component.minimapVisible).toBe(true);
    });

    it('should handle minimap viewport change', () => {
      const newPosition = { x: 500, y: 300 };

      component.onMinimapViewportChange(newPosition);

      expect(component.viewport.x).toBe(newPosition.x);
      expect(component.viewport.y).toBe(newPosition.y);
    });

    it('should handle minimap visibility change', () => {
      component.onMinimapVisibilityChange(false);
      expect(component.minimapVisible).toBe(false);

      component.onMinimapVisibilityChange(true);
      expect(component.minimapVisible).toBe(true);
    });
  });

  describe('Keyboard Shortcuts', () => {
    beforeEach(() => {
      component.onCanvasFocus(); // Enable keyboard shortcuts
    });

    it('should handle Ctrl+Plus for zoom in', () => {
      const event = new KeyboardEvent('keydown', { key: '+', ctrlKey: true });
      spyOn(component, 'zoomIn');

      component.onKeyDown(event);

      expect(component.zoomIn).toHaveBeenCalled();
    });

    it('should handle Ctrl+Minus for zoom out', () => {
      const event = new KeyboardEvent('keydown', { key: '-', ctrlKey: true });
      spyOn(component, 'zoomOut');

      component.onKeyDown(event);

      expect(component.zoomOut).toHaveBeenCalled();
    });

    it('should handle Ctrl+0 for reset zoom', () => {
      const event = new KeyboardEvent('keydown', { key: '0', ctrlKey: true });
      spyOn(component, 'resetZoom');

      component.onKeyDown(event);

      expect(component.resetZoom).toHaveBeenCalled();
    });

    it('should handle Delete key to remove selected nodes', () => {
      const nodeId1 = component.addNodeToCanvas();
      const nodeId2 = component.addNodeToCanvas();

      component.selectedNodeIds.add(nodeId1);

      const event = new KeyboardEvent('keydown', { key: 'Delete' });
      component.onKeyDown(event);

      expect(component.nodes.size).toBe(1);
      expect(component.nodes.has(nodeId2)).toBe(true);
    });

    it('should not respond to keyboard shortcuts when canvas is not focused', () => {
      component.onCanvasBlur();

      const event = new KeyboardEvent('keydown', { key: '+', ctrlKey: true });
      spyOn(component, 'zoomIn');

      component.onKeyDown(event);

      expect(component.zoomIn).not.toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle 100 nodes without errors', () => {
      for (let i = 0; i < 100; i++) {
        component.addNodeToCanvas();
      }

      expect(component.nodes.size).toBe(100);
      expect(component.getNodeCount()).toBe(100);
    });

    it('should handle 50 connections without errors', () => {
      const nodes: string[] = [];
      for (let i = 0; i < 20; i++) {
        nodes.push(component.addNodeToCanvas());
      }

      for (let i = 0; i < 50; i++) {
        const sourceIdx = i % nodes.length;
        const targetIdx = (i + 1) % nodes.length;
        component.addConnection(nodes[sourceIdx], nodes[targetIdx]);
      }

      expect(component.connections.size).toBe(50);
    });

    it('should clear large canvas efficiently', () => {
      for (let i = 0; i < 100; i++) {
        component.addNodeToCanvas();
      }

      const startTime = performance.now();
      component.clearCanvas();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should clear in < 100ms
      expect(component.nodes.size).toBe(0);
    });
  });
});
