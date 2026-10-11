/**
 * N4 (docs review v4): a host's own listener on the canvas (a context menu, a
 * tooltip) finds the node through `event.target.closest('[data-node-id]')` — as
 * on the JS canvas, where the rendered SVG is the hit target. On the Angular
 * canvas the SVG layer is `pointer-events: none` and the rule meant to re-enable
 * the SVG inside it never matched (view encapsulation scopes it to template
 * elements; the renderer's <svg> is created imperatively), so every event
 * targeted the container and the edit-nodes context menu was dead.
 */
import { TestBed } from '@angular/core/testing';
import { DiagramEngine } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent — the rendered SVG is the hit target (N4)', () => {
  test('the renderer <svg> receives pointer events (its layer does not)', async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    const engine = new DiagramEngine();
    engine.createDiagram('hit').addNode(buildNode({ id: 'a', position: { x: 10, y: 10 }, size: { width: 100, height: 50 } } as never, 0));
    const fixture = TestBed.createComponent(DiagramCanvasComponent);
    fixture.componentRef.setInput('engine', engine);
    fixture.detectChanges();
    const layer = fixture.nativeElement.querySelector('.grafloria-svg-layer') as HTMLElement;
    const svg = layer.querySelector('svg') as SVGSVGElement;
    expect(svg).toBeTruthy();
    // (jsdom does not load the component stylesheet, so the inline value is what is checked.)
    expect(svg.style.pointerEvents).toBe('all');
    // …and it survives a repaint.
    (fixture.componentInstance as unknown as { renderNow(): void }).renderNow();
    expect((layer.querySelector('svg') as SVGSVGElement).style.pointerEvents).toBe('all');
    fixture.destroy();
    engine.destroy();
  });
});
