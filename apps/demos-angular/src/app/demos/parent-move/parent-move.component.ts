import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Move the container, the contents follow: drag a subflow's frame and every
 *  member travels with it as one undoable step, while a non-member stays put.
 *  The only host wiring is setInteractionConfig({ enableGroupDrag: true }); the
 *  engine's live drag path translates members and frame together. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100vh" />
  `,
})
export class ParentMoveComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = [
    { id: 'm1', position: { x: 400, y: 200 }, size: { width: 100, height: 50 }, label: 'stage 1' },
    { id: 'm2', position: { x: 560, y: 220 }, size: { width: 100, height: 50 }, label: 'stage 2' },
    { id: 'outside', position: { x: 120, y: 500 }, size: { width: 100, height: 50 }, label: 'outside' },
  ];
  edges: any[] = [{ id: 'e1', source: 'm1', target: 'm2' }];

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine() as any;
    if (engine) {
      engine.setInteractionConfig({ enableGroupDrag: true });
      const g = await engine.addGroup({ name: 'Pipeline' });
      g.setFrame({ x: 370, y: 180, width: 320, height: 170 });
      await engine.addToGroup(g.id, 'm1');
      await engine.addToGroup(g.id, 'm2');
    }
    markReady();
  }
}
