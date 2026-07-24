import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Proximity connect wired into the ENGINE: drag a node next to another and the
 *  engine's own drag path proposes AND commits the wire — the page only sets
 *  enableProximityConnect. The auto-created link is a single undoable step. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [enableProximityConnect]="true" style="display:block;height:100vh" />
  `,
})
export class ProximityConnectLiveComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = [
    { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
    { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
  ];
  edges: any[] = [];

  ngAfterViewInit() {
    this.canvas().activeEngine()?.setInteractionConfig({ enableProximityConnect: true } as never);
    markReady();
  }
}
