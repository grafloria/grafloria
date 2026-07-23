import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Groups draw a visible, labelled, themed frame — nested containers included.
 *  The "Pipeline" frame wraps three nodes; a nested "Retry handler" frame sits
 *  inside it, and both paint behind the nodes without stealing their clicks. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class GroupFramesComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'n1', position: { x: 320, y: 160 }, size: { width: 120, height: 60 }, label: 'ingest' },
    { id: 'n2', position: { x: 520, y: 160 }, size: { width: 120, height: 60 }, label: 'transform' },
    { id: 'n3', position: { x: 420, y: 280 }, size: { width: 120, height: 60 }, label: 'retry' },
  ];
  edges = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n1', target: 'n3' },
  ];

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      const diagram = engine.getDiagram();
      const outer = await engine.addGroup({ name: 'Pipeline' });
      outer.setFrame({ x: 290, y: 120, width: 400, height: 240 });
      await engine.addToGroup(outer.id, 'n1');
      await engine.addToGroup(outer.id, 'n2');
      await engine.addToGroup(outer.id, 'n3');

      const inner = await engine.addGroup({ name: 'Retry handler' });
      inner.setFrame({ x: 390, y: 250, width: 180, height: 100 });
      await engine.addToGroup(inner.id, 'n3');
      outer.addMember(inner.id, diagram);
    }
    markReady();
  }
}
