/**
 * A node drag at zoom ≠ 1 moves ONLY the node, by pointer delta / zoom.
 *
 * Reproduces the docs review's Angular bug: after "Zoom in" or Fit, a 100 × 60
 * px drag panned the camera ~78 world units and moved the node 6 × 34; after
 * Fit, dragging a node 80 px down moved it UP in the model. The camera must
 * stay put and the node must follow the pointer exactly, like the JS canvas.
 *
 * jsdom lays nothing out, so the container reports a real 1200 × 400 canvas
 * (the quick start's size) — with the 800 × 600 fallback the bug's geometry
 * never occurs.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

class FakePointerEvent extends MouseEvent {
  readonly pointerId = 1;
  readonly pointerType = 'mouse';
  constructor(type: string, init: MouseEventInit) {
    super(type, { bubbles: true, cancelable: true, ...init });
  }
}

const CANVAS = { width: 1200, height: 400 };

describe('DiagramCanvasComponent — node drag at zoom ≠ 1', () => {
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let component: DiagramCanvasComponent;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('zoom-drag');
  });

  afterEach(() => {
    fixture?.destroy();
    engine.destroy();
  });

  function addNode(id: string, x: number, y: number, width = 180, height = 80): NodeModel {
    const node = buildNode({ id, position: { x, y }, size: { width, height } } as never, 0);
    diagram.addNode(node);
    return node;
  }

  function mount(): void {
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('engine', engine);
    const container = component.containerRef.nativeElement;
    container.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: CANVAS.width, bottom: CANVAS.height, ...CANVAS, toJSON: () => ({}) }) as DOMRect;
    fixture.detectChanges();
  }

  /** Paint a frame (the render loop is rAF-coalesced in the component). */
  function paint(): void {
    (component as unknown as { renderNow(): void }).renderNow();
  }

  function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void {
    const event = new FakePointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }) as unknown as PointerEvent;
    if (type === 'pointerdown') component.onPointerDown(event);
    else if (type === 'pointermove') component.onPointerMove(event);
    else component.onPointerUp(event);
  }

  /** Hand-speed drag: 50 px pointer steps, a frame painted between moves. */
  function drag(from: { x: number; y: number }, dx: number, dy: number): void {
    pointer('pointermove', from.x, from.y);
    pointer('pointerdown', from.x, from.y);
    paint();
    const steps = Math.max(3, Math.ceil(Math.hypot(dx, dy) / 50));
    for (let i = 1; i <= steps; i++) {
      pointer('pointermove', from.x + (dx * i) / steps, from.y + (dy * i) / steps);
      paint();
    }
    pointer('pointerup', from.x + dx, from.y + dy);
    paint();
  }

  /** Client point of a world point (container sits at the page origin). */
  function toClient(worldX: number, worldY: number): { x: number; y: number } {
    const { screenX, screenY } = component.worldToScreen(worldX, worldY);
    return { x: screenX, y: screenY };
  }

  test('after zoomIn, a 100 × 60 px drag moves the node 100/z × 60/z and leaves the camera alone', () => {
    const a = addNode('a', 60, 80);
    mount();
    component.zoomIn();
    paint();
    const zoom = component.zoom();
    expect(zoom).not.toBe(1);
    const camera = { ...component.viewport() };
    const start = { ...a.position };

    // Press a visible point of the node (it sits partly inside the edge band).
    drag(toClient(a.position.x + 60, a.position.y + 40), 100, 60);

    expect(component.viewport()).toEqual(camera);
    expect(a.position.x - start.x).toBeCloseTo(100 / zoom, 1);
    expect(a.position.y - start.y).toBeCloseTo(60 / zoom, 1);
  });

  test('after fitToContent, dragging a node 80 px DOWN moves it 80/z down', () => {
    const a = addNode('a', 60, 80);
    addNode('b', 380, 80);
    mount();
    component.fitToContent(40);
    paint();
    const zoom = component.zoom();
    expect(zoom).toBeGreaterThan(2);
    const camera = { ...component.viewport() };
    const start = { ...a.position };

    drag(toClient(a.position.x + 45, a.position.y + 40), 0, 80);

    expect(component.viewport()).toEqual(camera);
    expect(a.position.x - start.x).toBeCloseTo(0, 1);
    expect(a.position.y - start.y).toBeCloseTo(80 / zoom, 1);
  });

  test('zoomed OUT, the same drag still moves by pointer delta / zoom (control)', () => {
    const a = addNode('a', 300, 120);
    mount();
    component.zoomOut();
    paint();
    const zoom = component.zoom();
    const camera = { ...component.viewport() };
    const start = { ...a.position };

    drag(toClient(a.position.x + 60, a.position.y + 40), 100, 60);

    expect(component.viewport()).toEqual(camera);
    expect(a.position.x - start.x).toBeCloseTo(100 / zoom, 1);
    expect(a.position.y - start.y).toBeCloseTo(60 / zoom, 1);
  });

  describe('keyboard focus containment (a11y) still does its job', () => {
    function tab(): void {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      paint();
    }

    test('Tab to a node far off-screen brings it into view', () => {
      addNode('far', 3000, 2000, 100, 50);
      mount();
      paint();
      const camera = { ...component.viewport() };

      tab();

      expect(component.viewport()).not.toEqual(camera);
      const { screenX, screenY } = component.worldToScreen(3000, 2000);
      expect(screenX).toBeGreaterThanOrEqual(0);
      expect(screenX + 100 * component.zoom()).toBeLessThanOrEqual(CANVAS.width);
      expect(screenY).toBeGreaterThanOrEqual(0);
      expect(screenY + 50 * component.zoom()).toBeLessThanOrEqual(CANVAS.height);
    });

    test('Tab to a node that is already fully visible on the real canvas does not move the camera', () => {
      // Visible on a 1200 px wide canvas — but not inside an 800 px one.
      addNode('right', 900, 100, 100, 50);
      mount();
      paint();
      const camera = { ...component.viewport() };

      tab();

      expect(component.viewport()).toEqual(camera);
    });

    test('scrolling away from a keyboard-focused node is not undone by the next frame', () => {
      addNode('n', 300, 150, 100, 50);
      mount();
      tab();
      const before = { ...component.viewport() };

      component.onWheel(new WheelEvent('wheel', { deltaY: 600, deltaX: 0, cancelable: true }));
      paint();
      paint();

      expect(component.viewport().y).toBeCloseTo(before.y + 600, 5);
    });
  });
});
