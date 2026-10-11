/**
 * N7 (docs review v4, add-presence-and-discussion Angular tab): the presentation
 * follower drifted. The canvas pushed its `viewport` MODEL rect (800×600 unless
 * the host sizes it) into the camera `viewportController()` hands out, so the
 * camera's size disagreed with the canvas's real pixel size and every centre
 * derived from it (presentTo broadcasts the centre) was off by half the
 * difference. And `instance()` had no `viewport` at all, so a host building a
 * `PresentationHost` from the instance (as from the JS `DiagramInstance`)
 * could not get the camera the canvas paints with.
 */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { DiagramEngine } from '@grafloria/engine';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent — one camera (N7)', () => {
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let canvas: DiagramCanvasComponent;
  let engine: DiagramEngine;
  const RECT = { left: 10, top: 20, x: 10, y: 20, width: 640, height: 360, right: 650, bottom: 380, toJSON: () => ({}) };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    engine = new DiagramEngine();
    engine.createDiagram('camera');
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    canvas = fixture.componentInstance;
    fixture.componentRef.setInput('engine', engine);
    // A 640×360 canvas (jsdom lays nothing out).
    const container = fixture.nativeElement.querySelector('.diagram-canvas-container') as HTMLElement;
    container.getBoundingClientRect = () => RECT as DOMRect;
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  test('instance().viewport IS viewportController()', () => {
    const camera = canvas.viewportController();
    expect(camera).toBeTruthy();
    expect(canvas.instance().viewport).toBe(camera);
  });

  test('after the canvas pans, the camera maps world → client exactly as the canvas paints', () => {
    const camera = canvas.viewportController()!;
    canvas.viewport.set({ ...canvas.viewport(), x: 120, y: 80 }); // what a pan writes
    fixture.detectChanges();

    expect(camera.getViewport()).toMatchObject({ x: 120, y: 80, width: 640, height: 360 });
    const painted = canvas.worldToScreen(300, 200);
    const viaCamera = camera.worldToClient(300, 200, RECT);
    expect(viaCamera.x - RECT.left).toBeCloseTo(painted.screenX);
    expect(viaCamera.y - RECT.top).toBeCloseTo(painted.screenY);

    canvas.zoom.set(2);
    fixture.detectChanges();
    const paintedZoomed = canvas.worldToScreen(300, 200);
    const viaCameraZoomed = camera.worldToClient(300, 200, RECT);
    expect(viaCameraZoomed.x - RECT.left).toBeCloseTo(paintedZoomed.screenX);
    expect(viaCameraZoomed.y - RECT.top).toBeCloseTo(paintedZoomed.screenY);
  });
});
