import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { SwimlaneService } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Pools and weighted lanes that tile a frame: a "Delivery" pool split into
 *  three lanes — Backlog, In progress (weight 2, twice as tall), Done — through
 *  the public SwimlaneService. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class SwimlanesComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'task', position: { x: 1090, y: 300 }, size: { width: 120, height: 50 }, label: 'ticket' },
  ];
  edges = [];

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      const diagram = engine.getDiagram();
      const svc = new SwimlaneService(diagram);
      svc.createPool({
        name: 'Delivery',
        orientation: 'horizontal',
        bounds: { x: 60, y: 60, width: 1000, height: 480 },
        lanes: [
          { name: 'Backlog', weight: 1 },
          { name: 'In progress', weight: 2 },
          { name: 'Done', weight: 1 },
        ],
        headerSize: 40,
      });
      // The pool's lanes/labels are added straight to the model after the first
      // paint — nudge the two-way [(nodes)] so the canvas repaints the full pool.
      this.nodes = [...this.nodes];
      this.canvas().fitToContent?.(40);
    }
    markReady();
  }
}
