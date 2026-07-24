import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Drag a node and every node it overlaps lights up red, live. The overlap set
 *  is recomputed on every node:moved from the model's spatial index; the moved
 *  node itself stays unpainted (React Flow parity). */
const HILITE = { type: 'rect', fill: '#fecaca', stroke: '#dc2626' };
const rectOf = (n: any) => ({ x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height });

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class IntersectionsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'a', position: { x: 120, y: 140 }, size: { width: 180, height: 110 }, label: 'A · drag me' },
    { id: 'b', position: { x: 460, y: 140 }, size: { width: 180, height: 110 }, label: 'B' },
    { id: 'c', position: { x: 800, y: 140 }, size: { width: 180, height: 110 }, label: 'C' },
    { id: 's', position: { x: 150, y: 430 }, size: { width: 60, height: 60 }, label: 'S' },
  ];
  edges = [];

  ngAfterViewInit() {
    const model = this.canvas().activeEngine()?.getDiagram() as any;
    if (model) {
      const hits = (id: string): string[] => model
        .getVisibleNodes(rectOf(model.getNode(id)))
        .filter((o: any) => o.id !== id)
        .map((o: any) => o.id);
      const relight = (movedId: string) => {
        const moved = model.getNode(movedId);
        if (!moved) return;
        const lit = hits(movedId);
        for (const n of model.getNodes()) {
          const want = lit.includes(n.id);
          const has = n.getMetadata('shape') === HILITE;
          if (want && !has) n.setMetadata('shape', HILITE);
          else if (!want && has) n.setMetadata('shape', undefined);
        }
      };
      model.on('node:moved', ({ nodeId }: any) => relight(nodeId));
    }
    markReady();
  }
}
