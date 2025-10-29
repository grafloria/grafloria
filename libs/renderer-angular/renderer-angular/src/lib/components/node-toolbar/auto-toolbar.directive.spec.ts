import { Component, DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AutoToolbarDirective } from './auto-toolbar.directive';
import { NodeToolbarService } from './node-toolbar.service';
import { NodeModel, DiagramEngine } from '@grafloria/engine';
import { ToolbarAction } from './node-toolbar.component';

@Component({
  template: `
    <div
      grafloriaAutoToolbar
      [engine]="engine"
      [viewport]="viewport"
      [zoom]="zoom"
      [toolbarPosition]="toolbarPosition"
      [toolbarActions]="toolbarActions"
    ></div>
  `,
  standalone: true,
  imports: [AutoToolbarDirective],
})
class TestHostComponent {
  engine!: DiagramEngine;
  viewport = { x: 0, y: 0, width: 800, height: 600 };
  zoom = 1.0;
  toolbarPosition: 'top' | 'bottom' | 'left' | 'right' = 'top';
  toolbarActions: ToolbarAction[] = [];
}

describe('AutoToolbarDirective', () => {
  let component: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let directive: AutoToolbarDirective;
  let toolbarService: NodeToolbarService;
  let mockEngine: jasmine.SpyObj<DiagramEngine>;
  let mockNode: NodeModel;
  let eventBusCallbacks: Map<string, Function>;

  beforeEach(async () => {
    eventBusCallbacks = new Map();

    // Create mock engine with event bus
    mockEngine = jasmine.createSpyObj('DiagramEngine', ['getModel'], {
      eventBus: {
        on: (event: string, callback: Function) => {
          eventBusCallbacks.set(event, callback);
        },
        emit: jasmine.createSpy('emit'),
        off: jasmine.createSpy('off'),
      }
    });

    await TestBed.configureTestingModule({
      imports: [TestHostComponent, AutoToolbarDirective],
      providers: [NodeToolbarService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    component = fixture.componentInstance;
    component.engine = mockEngine;

    toolbarService = TestBed.inject(NodeToolbarService);

    const directiveEl: DebugElement = fixture.debugElement.query(
      By.directive(AutoToolbarDirective)
    );
    directive = directiveEl.injector.get(AutoToolbarDirective);

    // Create mock node
    mockNode = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
      size: { width: 150, height: 50 },
    });
  });

  afterEach(() => {
    toolbarService.hideAll();
  });

  it('should create', () => {
    expect(directive).toBeTruthy();
  });

  it('should initialize toolbar service with view container', () => {
    spyOn(toolbarService, 'setViewContainer');
    fixture.detectChanges();

    expect(toolbarService.setViewContainer).toHaveBeenCalled();
  });

  it('should initialize toolbar service with environment injector', () => {
    spyOn(toolbarService, 'setEnvironmentInjector');
    fixture.detectChanges();

    expect(toolbarService.setEnvironmentInjector).toHaveBeenCalled();
  });

  it('should set canvas element on toolbar service', () => {
    spyOn(toolbarService, 'setCanvasElement');
    fixture.detectChanges();

    expect(toolbarService.setCanvasElement).toHaveBeenCalled();
  });

  it('should set initial viewport', () => {
    spyOn(toolbarService, 'setViewport');
    fixture.detectChanges();

    expect(toolbarService.setViewport).toHaveBeenCalledWith(component.viewport);
  });

  it('should set initial zoom', () => {
    spyOn(toolbarService, 'setZoom');
    fixture.detectChanges();

    expect(toolbarService.setZoom).toHaveBeenCalledWith(component.zoom);
  });

  it('should listen to node:selected event', () => {
    fixture.detectChanges();
    expect(eventBusCallbacks.has('node:selected')).toBe(true);
  });

  it('should listen to node:deselected event', () => {
    fixture.detectChanges();
    expect(eventBusCallbacks.has('node:deselected')).toBe(true);
  });

  it('should listen to canvas:zoom event', () => {
    fixture.detectChanges();
    expect(eventBusCallbacks.has('canvas:zoom')).toBe(true);
  });

  it('should listen to canvas:pan event', () => {
    fixture.detectChanges();
    expect(eventBusCallbacks.has('canvas:pan')).toBe(true);
  });

  it('should show toolbar when node is selected', () => {
    spyOn(toolbarService, 'show');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('node:selected');
    expect(callback).toBeDefined();

    callback?.({ node: mockNode });

    expect(toolbarService.show).toHaveBeenCalledWith(
      mockNode,
      mockEngine,
      jasmine.objectContaining({
        position: component.toolbarPosition,
        actions: component.toolbarActions,
      })
    );
  });

  it('should hide toolbar when node is deselected', () => {
    spyOn(toolbarService, 'hide');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('node:deselected');
    expect(callback).toBeDefined();

    callback?.({ node: mockNode });

    expect(toolbarService.hide).toHaveBeenCalledWith(mockNode.id);
  });

  it('should update zoom when canvas:zoom event is emitted', () => {
    spyOn(toolbarService, 'setZoom');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('canvas:zoom');
    expect(callback).toBeDefined();

    callback?.({ zoom: 1.5 });

    expect(toolbarService.setZoom).toHaveBeenCalledWith(1.5);
  });

  it('should update viewport when canvas:pan event is emitted', () => {
    spyOn(toolbarService, 'setViewport');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('canvas:pan');
    expect(callback).toBeDefined();

    const newViewport = { x: 10, y: 20, width: 800, height: 600 };
    callback?.({ viewport: newViewport });

    expect(toolbarService.setViewport).toHaveBeenCalledWith(newViewport);
  });

  it('should update position when node is moved', () => {
    spyOn(toolbarService, 'updatePosition');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('node:moved');
    expect(callback).toBeDefined();

    callback?.({ node: mockNode });

    expect(toolbarService.updatePosition).toHaveBeenCalledWith(mockNode.id);
  });

  it('should update position when node is resized', () => {
    spyOn(toolbarService, 'updatePosition');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('node:resized');
    expect(callback).toBeDefined();

    callback?.({ node: mockNode });

    expect(toolbarService.updatePosition).toHaveBeenCalledWith(mockNode.id);
  });

  it('should hide all toolbars when diagram is cleared', () => {
    spyOn(toolbarService, 'hideAll');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('diagram:cleared');
    expect(callback).toBeDefined();

    callback?.({});

    expect(toolbarService.hideAll).toHaveBeenCalled();
  });

  it('should hide all toolbars on destroy', () => {
    spyOn(toolbarService, 'hideAll');
    fixture.detectChanges();

    directive.ngOnDestroy();

    expect(toolbarService.hideAll).toHaveBeenCalled();
  });

  it('should update viewport programmatically', () => {
    spyOn(toolbarService, 'setViewport');
    fixture.detectChanges();

    const newViewport = { x: 50, y: 60, width: 1000, height: 800 };
    directive.updateViewport(newViewport);

    expect(directive.viewport).toEqual(newViewport);
    expect(toolbarService.setViewport).toHaveBeenCalledWith(newViewport);
  });

  it('should update zoom programmatically', () => {
    spyOn(toolbarService, 'setZoom');
    fixture.detectChanges();

    directive.updateZoom(2.0);

    expect(directive.zoom).toBe(2.0);
    expect(toolbarService.setZoom).toHaveBeenCalledWith(2.0);
  });

  it('should warn when engine is not provided', () => {
    spyOn(console, 'warn');
    component.engine = undefined as any;
    fixture.detectChanges();

    expect(console.warn).toHaveBeenCalledWith('AutoToolbarDirective: engine not provided');
  });

  it('should pass custom toolbar actions to service', () => {
    const customActions: ToolbarAction[] = [
      {
        id: 'custom',
        label: 'Custom',
        onClick: () => {},
      },
    ];

    component.toolbarActions = customActions;
    spyOn(toolbarService, 'show');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('node:selected');
    callback?.({ node: mockNode });

    expect(toolbarService.show).toHaveBeenCalledWith(
      mockNode,
      mockEngine,
      jasmine.objectContaining({
        actions: customActions,
      })
    );
  });

  it('should pass custom toolbar position to service', () => {
    component.toolbarPosition = 'bottom';
    spyOn(toolbarService, 'show');
    fixture.detectChanges();

    const callback = eventBusCallbacks.get('node:selected');
    callback?.({ node: mockNode });

    expect(toolbarService.show).toHaveBeenCalledWith(
      mockNode,
      mockEngine,
      jasmine.objectContaining({
        position: 'bottom',
      })
    );
  });
});
