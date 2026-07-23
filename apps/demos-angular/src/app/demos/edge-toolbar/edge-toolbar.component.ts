import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** A floating toolbar anchored to the edge — the canvas' built-in path-anchored
 *  link toolbar (enableLinkToolbar) rides the route midpoint and re-anchors when
 *  the route moves. The edge boots selected so the toolbar shows. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [enableLinkToolbar]="true" style="display:block; height:100vh" />
  `,
})
export class EdgeToolbarComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'a', position: { x: 120, y: 140 }, size: { width: 130, height: 60 }, label: 'A' },
    { id: 'b', position: { x: 660, y: 140 }, size: { width: 130, height: 60 }, label: 'B' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth' as const }];

  ngAfterViewInit() {
    const model = this.canvas().activeEngine()?.getDiagram() as any;
    const link = model?.getLink('e1');
    if (model && link) {
      (model.selectLink ? model.selectLink(link) : link.setSelected?.(true));
    }
    markReady();
  }
}
