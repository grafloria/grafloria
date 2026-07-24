import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { registerTool, createDrawTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../demo-ready';
import { whiteboardHost } from '../whiteboard-host';

/** Freehand draw: the pen is live against the canvas. Press and drag to commit
 *  one simplified stroke entity — real vector ink, not a screenshot. A sample
 *  wave is seeded so the board is not blank. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #host style="display:block; height:100vh">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
    </div>
  `,
})
export class FreehandDrawComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  host = viewChild.required<ElementRef<HTMLElement>>('host');
  nodes: unknown[] = [];
  edges: unknown[] = [];

  ngAfterViewInit() {
    const canvas = this.canvas();
    const model = canvas.activeEngine()?.getDiagram() as any;
    if (model) {
      // Seed one example stroke (a gentle wave) so the ink surface is visible.
      const pts = Array.from({ length: 24 }, (_, i) => ({ x: 120 + i * 20, y: 200 + Math.sin(i / 2) * 40 }));
      model.addStroke(new StrokeModel(pts, { color: '#e11d48', width: 3 }, { id: 'seed' }));
      registerTool(createDrawTool(whiteboardHost(canvas, this.host().nativeElement), { color: '#e11d48', width: 3, simplifyEpsilon: 0.8 }));
      canvas.scheduleRender();
    }
    markReady();
  }
}
