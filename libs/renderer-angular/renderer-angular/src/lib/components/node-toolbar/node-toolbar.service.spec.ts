import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, ViewContainerRef, EnvironmentInjector } from '@angular/core';
import { NodeToolbarService, ToolbarConfig } from './node-toolbar.service';
import { NodeModel, DiagramEngine } from '@grafloria/engine';
import { ToolbarAction } from './node-toolbar.component';

@Component({
  template: '<div></div>',
  standalone: true,
})
class TestHostComponent {}

describe('NodeToolbarService', () => {
  let service: NodeToolbarService;
  let fixture: ComponentFixture<TestHostComponent>;
  let viewContainerRef: ViewContainerRef;
  let environmentInjector: EnvironmentInjector;
  let mockEngine: jasmine.SpyObj<DiagramEngine>;
  let mockNode: NodeModel;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [NodeToolbarService],
    });

    service = TestBed.inject(NodeToolbarService);
    fixture = TestBed.createComponent(TestHostComponent);
    viewContainerRef = fixture.componentRef.injector.get(ViewContainerRef);
    environmentInjector = TestBed.inject(EnvironmentInjector);

    // Create mock engine
    mockEngine = jasmine.createSpyObj('DiagramEngine', ['getModel'], {
      eventBus: jasmine.createSpyObj('EventBus', ['on', 'emit', 'off'])
    });

    // Create mock node
    mockNode = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
      size: { width: 150, height: 50 },
    });

    service.setViewContainer(viewContainerRef);
    service.setEnvironmentInjector(environmentInjector);
  });

  afterEach(() => {
    service.hideAll();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set view container', () => {
    const newService = new NodeToolbarService();
    expect(() => newService.setViewContainer(viewContainerRef)).not.toThrow();
  });

  it('should set environment injector', () => {
    const newService = new NodeToolbarService();
    expect(() => newService.setEnvironmentInjector(environmentInjector)).not.toThrow();
  });

  it('should throw error when showing toolbar without view container', () => {
    const newService = new NodeToolbarService();
    expect(() => newService.show(mockNode, mockEngine)).toThrowError(
      'ViewContainerRef not set. Call setViewContainer() first.'
    );
  });

  it('should show toolbar for a node', () => {
    const componentRef = service.show(mockNode, mockEngine, {
      position: 'top',
      actions: [],
    });

    expect(componentRef).toBeDefined();
    expect(componentRef.instance.node).toBe(mockNode);
    expect(componentRef.instance.engine).toBe(mockEngine);
    expect(service.isShown(mockNode.id)).toBe(true);
  });

  it('should hide toolbar for a node', () => {
    service.show(mockNode, mockEngine);
    expect(service.isShown(mockNode.id)).toBe(true);

    service.hide(mockNode.id);
    expect(service.isShown(mockNode.id)).toBe(false);
  });

  it('should hide all toolbars', () => {
    const node1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
    });
    const node2 = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
    });

    service.show(node1, mockEngine);
    service.show(node2, mockEngine);

    expect(service.getCount()).toBe(2);

    service.hideAll();

    expect(service.getCount()).toBe(0);
    expect(service.isShown(node1.id)).toBe(false);
    expect(service.isShown(node2.id)).toBe(false);
  });

  it('should get toolbar for a node', () => {
    service.show(mockNode, mockEngine);
    const toolbar = service.get(mockNode.id);

    expect(toolbar).toBeDefined();
    expect(toolbar?.instance.node).toBe(mockNode);
  });

  it('should return undefined for non-existent toolbar', () => {
    const toolbar = service.get('non-existent-id');
    expect(toolbar).toBeUndefined();
  });

  it('should check if toolbar is shown', () => {
    expect(service.isShown(mockNode.id)).toBe(false);

    service.show(mockNode, mockEngine);
    expect(service.isShown(mockNode.id)).toBe(true);

    service.hide(mockNode.id);
    expect(service.isShown(mockNode.id)).toBe(false);
  });

  it('should update toolbar position', () => {
    const componentRef = service.show(mockNode, mockEngine);
    spyOn(componentRef.instance, 'updatePosition');

    service.updatePosition(mockNode.id);

    expect(componentRef.instance.updatePosition).toHaveBeenCalled();
  });

  it('should update all toolbar positions', () => {
    const node1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
    });
    const node2 = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
    });

    const componentRef1 = service.show(node1, mockEngine);
    const componentRef2 = service.show(node2, mockEngine);

    spyOn(componentRef1.instance, 'updatePosition');
    spyOn(componentRef2.instance, 'updatePosition');

    service.updateAllPositions();

    expect(componentRef1.instance.updatePosition).toHaveBeenCalled();
    expect(componentRef2.instance.updatePosition).toHaveBeenCalled();
  });

  it('should replace existing toolbar when showing again', () => {
    const firstRef = service.show(mockNode, mockEngine);
    const firstInstance = firstRef.instance;

    const secondRef = service.show(mockNode, mockEngine);
    const secondInstance = secondRef.instance;

    expect(firstInstance).not.toBe(secondInstance);
    expect(service.getCount()).toBe(1);
  });

  it('should configure toolbar with custom config', () => {
    const actions: ToolbarAction[] = [
      {
        id: 'test',
        label: 'Test',
        onClick: () => {},
      },
    ];

    const config: ToolbarConfig = {
      position: 'bottom',
      alignment: 'end',
      actions,
      offset: 16,
    };

    const componentRef = service.show(mockNode, mockEngine, config);

    expect(componentRef.instance.position).toBe('bottom');
    expect(componentRef.instance.alignment).toBe('end');
    expect(componentRef.instance.actions).toBe(actions);
    expect(componentRef.instance.offset).toBe(16);
  });

  it('should set global canvas element', () => {
    const mockCanvas = document.createElement('div');
    service.setCanvasElement(mockCanvas);

    const componentRef = service.show(mockNode, mockEngine);
    expect(componentRef.instance.canvasElement).toBe(mockCanvas);
  });

  it('should set global viewport', () => {
    const viewport = { x: 10, y: 20, width: 1000, height: 800 };
    service.setViewport(viewport);

    const componentRef = service.show(mockNode, mockEngine);
    expect(componentRef.instance.viewport).toEqual(viewport);
  });

  it('should set global zoom', () => {
    const zoom = 1.5;
    service.setZoom(zoom);

    const componentRef = service.show(mockNode, mockEngine);
    expect(componentRef.instance.zoom).toBe(zoom);
  });

  it('should update config for existing toolbar', () => {
    const componentRef = service.show(mockNode, mockEngine, {
      position: 'top',
    });

    expect(componentRef.instance.position).toBe('top');

    service.updateConfig(mockNode.id, {
      position: 'bottom',
      offset: 20,
    });

    expect(componentRef.instance.position).toBe('bottom');
    expect(componentRef.instance.offset).toBe(20);
  });

  it('should return count of active toolbars', () => {
    expect(service.getCount()).toBe(0);

    service.show(mockNode, mockEngine);
    expect(service.getCount()).toBe(1);

    const node2 = new NodeModel({
      type: 'default',
      position: { x: 200, y: 200 },
    });
    service.show(node2, mockEngine);
    expect(service.getCount()).toBe(2);

    service.hide(mockNode.id);
    expect(service.getCount()).toBe(1);
  });

  it('should get all toolbar component references', () => {
    const node1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
    });
    const node2 = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
    });

    service.show(node1, mockEngine);
    service.show(node2, mockEngine);

    const allToolbars = service.getAll();

    expect(allToolbars.length).toBe(2);
    expect(allToolbars[0].instance).toBeDefined();
    expect(allToolbars[1].instance).toBeDefined();
  });

  it('should update all toolbars when setting global canvas element', () => {
    const node1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
    });
    const node2 = new NodeModel({
      type: 'default',
      position: { x: 100, y: 100 },
    });

    const componentRef1 = service.show(node1, mockEngine);
    const componentRef2 = service.show(node2, mockEngine);

    spyOn(componentRef1.instance, 'updatePosition');
    spyOn(componentRef2.instance, 'updatePosition');

    const mockCanvas = document.createElement('div');
    service.setCanvasElement(mockCanvas);

    expect(componentRef1.instance.canvasElement).toBe(mockCanvas);
    expect(componentRef2.instance.canvasElement).toBe(mockCanvas);
    expect(componentRef1.instance.updatePosition).toHaveBeenCalled();
    expect(componentRef2.instance.updatePosition).toHaveBeenCalled();
  });
});
