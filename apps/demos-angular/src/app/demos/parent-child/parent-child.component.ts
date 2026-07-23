import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** A container group with a real frame: drag the child in — it becomes a
 *  member and the frame carries it; membership is explicit, geometry never
 *  silently detaches it. Group API via the public activeEngine(). */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class ParentChildComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'child', position: { x: 120, y: 420 }, size: { width: 100, height: 50 }, label: 'child' },
  ];
  edges = [];
  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      engine.setInteractionConfig({ enableGroupDrag: true });
      const g = await engine.addGroup({ name: 'Container' });
      g.setFrame({ x: 400, y: 150, width: 320, height: 260 });
      g.constrainChildren = true;
    }
    markReady();
  }
}
