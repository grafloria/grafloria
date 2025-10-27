import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MinimapComponent } from './minimap.component';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { PreviewNodeInfo, ConnectionInfo } from '../../models/multi-node-state.model';

/**
 * Minimap Component Tests
 *
 * Tests for Phase 8 minimap navigation component
 */
describe('MinimapComponent', () => {
  let component: MinimapComponent;
  let fixture: ComponentFixture<MinimapComponent>;
  let mockEngine: jasmine.SpyObj<DiagramEngine>;

  beforeEach(async () => {
    mockEngine = jasmine.createSpyObj('DiagramEngine', ['getDiagram', 'createDiagram']);

    await TestBed.configureTestingModule({
      imports: [MinimapComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MinimapComponent);
    component = fixture.componentInstance;
    component.engine = mockEngine;
    component.viewport = { x: 0, y: 0, width: 800, height: 600, zoom: 1.0 };
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default canvas dimensions', () => {
    expect(component.canvasWidth).toBe(220);
    expect(component.canvasHeight).toBe(165);
  });

  it('should be visible by default', () => {
    expect(component.visible).toBe(true);
  });

  it('should not render when no nodes exist', () => {
    component.nodes = new Map();
    component.visible = true;

    fixture.detectChanges();

    const container = fixture.nativeElement.querySelector('.minimap-container');
    expect(container).toBeNull(); // Not rendered when nodes.size === 0
  });

  it('should render when nodes exist', () => {
    const mockNode = new NodeModel({
      type: 'rect',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });

    const nodeInfo: PreviewNodeInfo = {
      id: 'node1',
      templateId: 'template1',
      position: { x: 100, y: 100 },
      nodeModel: mockNode,
      data: {},
      createdAt: Date.now()
    };

    component.nodes = new Map([['node1', nodeInfo]]);
    component.visible = true;

    fixture.detectChanges();

    const container = fixture.nativeElement.querySelector('.minimap-container');
    expect(container).not.toBeNull();
  });

  it('should display node and connection counts', () => {
    const mockNode = new NodeModel({
      type: 'rect',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });

    const nodeInfo1: PreviewNodeInfo = {
      id: 'node1',
      templateId: 'template1',
      position: { x: 100, y: 100 },
      nodeModel: mockNode,
      data: {},
      createdAt: Date.now()
    };

    const nodeInfo2: PreviewNodeInfo = {
      id: 'node2',
      templateId: 'template1',
      position: { x: 400, y: 200 },
      nodeModel: mockNode,
      data: {},
      createdAt: Date.now()
    };

    component.nodes = new Map([['node1', nodeInfo1], ['node2', nodeInfo2]]);
    component.connections = new Map();
    component.visible = true;

    fixture.detectChanges();

    const stats = fixture.nativeElement.querySelector('.minimap-stats');
    expect(stats.textContent).toContain('2 nodes');
    expect(stats.textContent).toContain('0 links');
  });

  it('should toggle visibility', () => {
    component.visible = true;

    let emittedValue: boolean | undefined;
    component.visibilityChange.subscribe((value: boolean) => {
      emittedValue = value;
    });

    component.toggleVisibility();

    expect(component.visible).toBe(false);
    expect(emittedValue).toBe(false);
  });

  it('should emit viewport change on mouse down', (done) => {
    const mockNode = new NodeModel({
      type: 'rect',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });

    const nodeInfo: PreviewNodeInfo = {
      id: 'node1',
      templateId: 'template1',
      position: { x: 100, y: 100 },
      nodeModel: mockNode,
      data: {},
      createdAt: Date.now()
    };

    component.nodes = new Map([['node1', nodeInfo]]);
    component.visible = true;

    fixture.detectChanges();

    component.viewportChange.subscribe((position) => {
      expect(position).toBeDefined();
      expect(position.x).toBeDefined();
      expect(position.y).toBeDefined();
      done();
    });

    // Wait for view to be ready
    setTimeout(() => {
      const canvas = fixture.nativeElement.querySelector('.minimap-canvas') as HTMLCanvasElement;
      if (canvas) {
        const event = new MouseEvent('mousedown', {
          clientX: 110,
          clientY: 82,
          bubbles: true
        });
        canvas.dispatchEvent(event);
      }
    }, 100);
  });

  it('should start dragging on mouse down', () => {
    const mockNode = new NodeModel({
      type: 'rect',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });

    const nodeInfo: PreviewNodeInfo = {
      id: 'node1',
      templateId: 'template1',
      position: { x: 100, y: 100 },
      nodeModel: mockNode,
      data: {},
      createdAt: Date.now()
    };

    component.nodes = new Map([['node1', nodeInfo]]);
    component.visible = true;

    fixture.detectChanges();

    const canvas = fixture.nativeElement.querySelector('.minimap-canvas') as HTMLCanvasElement;
    if (canvas) {
      const event = new MouseEvent('mousedown', {
        clientX: 110,
        clientY: 82,
        bubbles: true
      });
      component.onMinimapMouseDown(event);

      expect(component['isDragging']).toBe(true);
    }
  });

  it('should stop dragging on mouse up', () => {
    component['isDragging'] = true;

    component.onMinimapMouseUp();

    expect(component['isDragging']).toBe(false);
  });

  it('should not update viewport when not dragging', () => {
    spyOn(component.viewportChange, 'emit');

    const event = new MouseEvent('mousemove', {
      clientX: 110,
      clientY: 82
    });

    component.onMinimapMouseMove(event);

    expect(component.viewportChange.emit).not.toHaveBeenCalled();
  });

  it('should calculate nodes bounds correctly', () => {
    const mockNode1 = new NodeModel({
      type: 'rect',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });

    const mockNode2 = new NodeModel({
      type: 'rect',
      position: { x: 500, y: 300 },
      size: { width: 200, height: 100 }
    });

    const nodeInfo1: PreviewNodeInfo = {
      id: 'node1',
      templateId: 'template1',
      position: { x: 100, y: 100 },
      nodeModel: mockNode1,
      data: {},
      createdAt: Date.now()
    };

    const nodeInfo2: PreviewNodeInfo = {
      id: 'node2',
      templateId: 'template1',
      position: { x: 500, y: 300 },
      nodeModel: mockNode2,
      data: {},
      createdAt: Date.now()
    };

    component.nodes = new Map([
      ['node1', nodeInfo1],
      ['node2', nodeInfo2]
    ]);

    const bounds = component['calculateNodesBounds']();

    expect(bounds).not.toBeNull();
    if (bounds) {
      // With padding of 100 on each side
      expect(bounds.minX).toBe(0); // 100 - 100
      expect(bounds.minY).toBe(0); // 100 - 100
      expect(bounds.width).toBe(800); // (700 - 100) + 200 = 800
      expect(bounds.height).toBe(500); // (400 - 100) + 200 = 500
    }
  });

  it('should return null bounds when no nodes exist', () => {
    component.nodes = new Map();

    const bounds = component['calculateNodesBounds']();

    expect(bounds).toBeNull();
  });

  it('should clean up animation frame on destroy', () => {
    component['animationFrameId'] = 123;

    spyOn(window, 'cancelAnimationFrame');

    component.ngOnDestroy();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(123);
  });

  it('should schedule render with throttling', () => {
    spyOn(window, 'requestAnimationFrame').and.returnValue(123);

    component['scheduleRender']();

    expect(window.requestAnimationFrame).toHaveBeenCalled();
    expect(component['animationFrameId']).toBe(123);
  });

  it('should not schedule render if already scheduled', () => {
    component['animationFrameId'] = 456;

    spyOn(window, 'requestAnimationFrame');

    component['scheduleRender']();

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('should trigger render on nodes change', () => {
    spyOn<any>(component, 'scheduleRender');

    const mockNode = new NodeModel({
      type: 'rect',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });

    const nodeInfo: PreviewNodeInfo = {
      id: 'node1',
      templateId: 'template1',
      position: { x: 100, y: 100 },
      nodeModel: mockNode,
      data: {},
      createdAt: Date.now()
    };

    component.ngOnChanges({
      nodes: {
        currentValue: new Map([['node1', nodeInfo]]),
        previousValue: new Map(),
        firstChange: false,
        isFirstChange: () => false
      }
    });

    expect(component['scheduleRender']).toHaveBeenCalled();
  });

  it('should trigger render on viewport change', () => {
    spyOn<any>(component, 'scheduleRender');

    component.ngOnChanges({
      viewport: {
        currentValue: { x: 100, y: 100, width: 800, height: 600, zoom: 1.0 },
        previousValue: { x: 0, y: 0, width: 800, height: 600, zoom: 1.0 },
        firstChange: false,
        isFirstChange: () => false
      }
    });

    expect(component['scheduleRender']).toHaveBeenCalled();
  });
});
