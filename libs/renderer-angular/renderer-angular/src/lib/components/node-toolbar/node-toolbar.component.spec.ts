import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, ElementRef, TemplateRef } from '@angular/core';
import { NodeToolbarComponent, ToolbarAction, ToolbarPosition } from './node-toolbar.component';
import { NodeModel, DiagramEngine, DiagramModel } from '@grafloria/engine';

describe('NodeToolbarComponent', () => {
  let component: NodeToolbarComponent;
  let fixture: ComponentFixture<NodeToolbarComponent>;
  let mockEngine: DiagramEngine;
  let mockNode: NodeModel;

  beforeEach(async () => {
    // Create mock engine with event bus
    mockEngine = {
      getModel: jest.fn(),
      eventBus: { on: jest.fn(), emit: jest.fn(), off: jest.fn() },
    } as unknown as DiagramEngine;

    await TestBed.configureTestingModule({
      imports: [NodeToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NodeToolbarComponent);
    component = fixture.componentInstance;

    // Create a mock node
    mockNode = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
      size: { width: 150, height: 50 },
    });

    // Set required inputs
    component.node = mockNode;
    component.engine = mockEngine;
    component.viewport = { x: 0, y: 0, width: 800, height: 600 };
    component.zoom = 1.0;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with visible set to true by default', () => {
    component.visible = true;
    fixture.detectChanges();
    expect(component.isVisible).toBe(true);
  });

  it('should initialize with visible set to false when input is false', () => {
    component.visible = false;
    fixture.detectChanges();
    expect(component.isVisible).toBe(false);
  });

  it('should have default position "top"', () => {
    expect(component.position).toBe('top');
  });

  it('should have default alignment "center"', () => {
    expect(component.alignment).toBe('center');
  });

  it('should have default offset of 8', () => {
    expect(component.offset).toBe(8);
  });

  it('should accept custom actions', () => {
    const actions: ToolbarAction[] = [
      {
        id: 'test',
        label: 'Test',
        onClick: () => {},
      },
    ];
    component.actions = actions;
    fixture.detectChanges();
    expect(component.actions).toBe(actions);
  });

  it('should show toolbar when show() is called', () => {
    component.isVisible = false;
    component.show();
    expect(component.isVisible).toBe(true);
  });

  it('should hide toolbar when hide() is called', () => {
    component.isVisible = true;
    component.hide();
    expect(component.isVisible).toBe(false);
  });

  it('should toggle toolbar visibility', () => {
    component.isVisible = false;
    component.toggle();
    expect(component.isVisible).toBe(true);
    component.toggle();
    expect(component.isVisible).toBe(false);
  });

  it('should emit actionClicked event when action is clicked', () => {
    const action: ToolbarAction = {
      id: 'test',
      label: 'Test',
      onClick: jest.fn(),
    };

    jest.spyOn(component.actionClicked, 'emit');

    component.handleActionClick(action);

    expect(action.onClick).toHaveBeenCalledWith(mockNode);
    expect(component.actionClicked.emit).toHaveBeenCalledWith({
      action,
      node: mockNode,
    });
  });

  it('should not trigger action when disabled', () => {
    const action: ToolbarAction = {
      id: 'test',
      label: 'Test',
      disabled: true,
      onClick: jest.fn(),
    };

    jest.spyOn(component.actionClicked, 'emit');

    component.handleActionClick(action);

    expect(action.onClick).not.toHaveBeenCalled();
    expect(component.actionClicked.emit).not.toHaveBeenCalled();
  });

  it('should listen to canvas:zoom events', () => {
    component.ngOnInit();
    expect(mockEngine.eventBus.on).toHaveBeenCalledWith(
      'canvas:zoom',
      expect.any(Function)
    );
  });

  it('should listen to canvas:pan events', () => {
    component.ngOnInit();
    expect(mockEngine.eventBus.on).toHaveBeenCalledWith(
      'canvas:pan',
      expect.any(Function)
    );
  });

  it('should listen to node:moved events', () => {
    component.ngOnInit();
    expect(mockEngine.eventBus.on).toHaveBeenCalledWith(
      'node:moved',
      expect.any(Function)
    );
  });

  it('should listen to node:resized events', () => {
    component.ngOnInit();
    expect(mockEngine.eventBus.on).toHaveBeenCalledWith(
      'node:resized',
      expect.any(Function)
    );
  });

  it('should clean up on destroy', () => {
    component.ngOnInit();
    const destroySpy = jest.spyOn(component['destroy$'], 'next');
    const completeSpy = jest.spyOn(component['destroy$'], 'complete');

    component.ngOnDestroy();

    expect(destroySpy).toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalled();
  });

  it('should support different positions', () => {
    const positions: ToolbarPosition[] = ['top', 'bottom', 'left', 'right'];

    positions.forEach(position => {
      component.position = position;
      fixture.detectChanges();
      expect(component.position).toBe(position);
    });
  });

  it('should render actions in template', () => {
    const actions: ToolbarAction[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'fa fa-edit',
        onClick: () => {},
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'fa fa-trash',
        onClick: () => {},
      },
    ];

    component.actions = actions;
    component.visible = true;
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const buttons = compiled.querySelectorAll('.toolbar-button');

    expect(buttons.length).toBe(2);
  });

  it('should apply visible class when isVisible is true', () => {
    component.visible = true;
    fixture.detectChanges();

    const toolbar = fixture.nativeElement.querySelector('.grafloria-node-toolbar');
    expect(toolbar.classList.contains('visible')).toBe(true);
  });

  it('should not apply visible class when isVisible is false', () => {
    component.visible = false;
    fixture.detectChanges();

    const toolbar = fixture.nativeElement.querySelector('.grafloria-node-toolbar');
    expect(toolbar.classList.contains('visible')).toBe(false);
  });

  it('should apply data-position attribute', () => {
    component.position = 'bottom';
    fixture.detectChanges();

    const toolbar = fixture.nativeElement.querySelector('.grafloria-node-toolbar');
    expect(toolbar.getAttribute('data-position')).toBe('bottom');
  });

  it('should update transform on updatePosition', () => {
    // Mock the canvas element
    const mockCanvas = document.createElement('div');
    mockCanvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    component.canvasElement = mockCanvas;
    component.ngOnInit();
    fixture.detectChanges();

    // Mock toolbar element
    if (component.toolbarRef) {
      const toolbarEl = component.toolbarRef.nativeElement;
      jest.spyOn(toolbarEl, 'getBoundingClientRect').mockReturnValue({
        width: 200,
        height: 40,
        left: 0,
        top: 0,
        right: 200,
        bottom: 40,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      component.updatePosition();

      expect(component.transform).toContain('translate');
    }
  });
});
