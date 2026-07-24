import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { registerTool, createEraserTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../demo-ready';
import { whiteboardHost } from '../whiteboard-host';

/** Eraser: wipe over ink to remove it. Whole-stroke delete; a sweep across
 *  several strokes is one undo step. Three parallel strokes are seeded and the
 *  eraser tool is live against the canvas. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #host style="display:block; height:100vh">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
    </div>
  `,
})
export class EraserComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  host = viewChild.required<ElementRef<HTMLElement>>('host');
  nodes: unknown[] = [];
  edges: unknown[] = [];

  private ink(id: string, y: number) {
    return new StrokeModel(
      [{ x: 100, y }, { x: 300, y }, { x: 500, y }],
      { color: '#1f2933', width: 4 },
      { id },
    );
  }

  ngAfterViewInit() {
    const canvas = this.canvas();
    const model = canvas.activeEngine()?.getDiagram() as any;
    if (model) {
      model.addStroke(this.ink('top', 120));
      model.addStroke(this.ink('mid', 240));
      model.addStroke(this.ink('bot', 360));
      registerTool(createEraserTool(whiteboardHost(canvas, this.host().nativeElement), { radius: 10 }));
      canvas.scheduleRender();
    }
    markReady();
  }
}
