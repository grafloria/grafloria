import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { registerTool, createRectangleTool } from '@grafloria/element';
import { markReady } from '../demo-ready';
import { whiteboardHost } from '../whiteboard-host';

/** Rectangle tool: drag out a box on the canvas and it becomes a real NODE —
 *  connectable, resizable, laid out — because a rectangle IS a box, unlike
 *  freehand ink. A seeded box shows the shape the tool produces. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #host style="display:block; height:100vh">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
    </div>
  `,
})
export class RectangleComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  host = viewChild.required<ElementRef<HTMLElement>>('host');
  nodes = [
    { id: 'box1', position: { x: 120, y: 100 }, size: { width: 300, height: 180 }, label: 'Box',
      style: { shape: 'rectangle', fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 } },
  ];
  edges: unknown[] = [];

  ngAfterViewInit() {
    const canvas = this.canvas();
    const model = canvas.activeEngine()?.getDiagram();
    if (model) {
      registerTool(createRectangleTool(
        whiteboardHost(canvas, this.host().nativeElement),
        { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, label: 'Box' },
      ));
    }
    markReady();
  }
}
