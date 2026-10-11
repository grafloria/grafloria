/**
 * N1 (docs review v4): `grafloriaAutoToolbar` around a real canvas. Selecting a
 * node on the canvas never showed the toolbar: the directive listened for
 * `node:selected` on the ENGINE bus, which nothing emits — selection lives on
 * the diagram model (`selection:changed`) and the canvas's `selectionChange`.
 *
 * jsdom: the canvas falls back to its 800×600 viewport, so at zoom 1 client
 * coords ARE world coords.
 */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramEngine, DiagramModel } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent } from '../diagram-canvas.component';
import { AutoToolbarDirective } from './auto-toolbar.directive';
import { NodeToolbarService } from './node-toolbar.service';

// jsdom has no DOMRect (the toolbar builds one for the node's screen rect).
(globalThis as { DOMRect?: unknown }).DOMRect ??= class {
  constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  get left() { return this.x; }
  get top() { return this.y; }
  get right() { return this.x + this.width; }
  get bottom() { return this.y + this.height; }
};

@Component({
  imports: [DiagramCanvasComponent, AutoToolbarDirective],
  providers: [NodeToolbarService],
  template: `<div grafloriaAutoToolbar [engine]="engine" style="position:relative;width:800px;height:600px">
    <grafloria-diagram-canvas [engine]="engine" style="display:block;width:800px;height:600px" />
  </div>`,
})
class Host {
  engine!: DiagramEngine;
}

describe('AutoToolbarDirective — on a real canvas (N1)', () => {
  let fixture: ComponentFixture<Host>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let service: NodeToolbarService;
  let canvasEl: HTMLElement;
  let canvas: DiagramCanvasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('autotb');
    diagram.addNode(buildNode({ id: 'a', position: { x: 100, y: 100 }, size: { width: 160, height: 80 } } as never, 0));
    diagram.addNode(buildNode({ id: 'b', position: { x: 500, y: 300 }, size: { width: 160, height: 80 } } as never, 1));
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.engine = engine;
    fixture.detectChanges();
    const debug = fixture.debugElement.query(By.directive(DiagramCanvasComponent));
    canvasEl = debug.nativeElement;
    canvas = debug.componentInstance;
    service = fixture.debugElement.query(By.directive(AutoToolbarDirective)).injector.get(NodeToolbarService);
  });

  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));
  function click(x: number, y: number): void {
    for (const type of ['mousedown', 'mouseup'] as const) {
      canvasEl.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
    }
  }

  test('clicking a node shows its toolbar; another node moves it; empty canvas hides it', async () => {
    click(180, 140);
    await settle();
    expect(service.isShown('a')).toBe(true);

    click(580, 340);
    await settle();
    expect(service.isShown('a')).toBe(false);
    expect(service.isShown('b')).toBe(true);

    click(720, 40);
    await settle();
    expect(service.getCount()).toBe(0);
  });

  test('a selection made through the model API shows it too', async () => {
    diagram.selectNode(diagram.getNode('b')!);
    await settle();
    expect(service.isShown('b')).toBe(true);
  });

  test('a multi-selection shows no toolbar', async () => {
    diagram.selectNode(diagram.getNode('a')!);
    diagram.addToSelection(diagram.getNode('b')!);
    await settle();
    expect(service.getCount()).toBe(0);
  });

  test('the toolbar is placed with the canvas camera (pan and zoom)', async () => {
    canvas.zoom.set(2);
    canvas.viewport.set({ x: 50, y: 20, width: 800, height: 600 });
    fixture.detectChanges();
    diagram.selectNode(diagram.getNode('a')!);
    await settle();
    const toolbar = service.get('a')!.instance;
    const origin = canvas.worldToScreen(0, 0);
    expect(toolbar.zoom).toBe(2);
    expect(toolbar.viewport.x).toBeCloseTo(origin.screenX);
    expect(toolbar.viewport.y).toBeCloseTo(origin.screenY);
  });

  test('the toolbar lands above its node wherever it is mounted (client → containing block)', async () => {
    diagram.selectNode(diagram.getNode('a')!);
    await settle();
    const toolbar = service.get('a')!.instance;
    const el = (toolbar as unknown as { toolbarRef: { nativeElement: HTMLElement } }).toolbarRef.nativeElement;
    // The service mounts the toolbar AFTER the canvas host: its containing block
    // starts 600 px further down the page than the canvas.
    const block = document.createElement('div');
    block.getBoundingClientRect = () => new DOMRect(0, 600, 800, 100);
    Object.defineProperty(el, 'offsetParent', { configurable: true, get: () => block });
    el.getBoundingClientRect = () => new DOMRect(0, 0, 120, 30);
    canvasEl.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    toolbar.updatePosition();
    // node a: world (100,100) 160×80 → client top 100; 'top' + offset 8 → 100 − 30 − 8 = 62
    // client, i.e. 62 − 600 inside the containing block.
    expect(toolbar.transform).toBe('translate(120px, -538px)');
  });
});
