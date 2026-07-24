import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

const POSITIONS: Record<string, { x: number; y: number }> = {
  right: { x: 620, y: 200 }, below: { x: 220, y: 460 }, corner: { x: 620, y: 460 },
};

/** metadata.connectionPoint: 'smart' floats the edge along the node PERIMETER —
 *  move B around A and the wire re-attaches to whichever side faces it.
 *  Repositioning is pure data: the buttons just rewrite [(nodes)]. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  templateUrl: './floating-edges.component.html',
})
export class FloatingEdgesComponent implements AfterViewInit {
  positions = Object.keys(POSITIONS);
  where = 'right';
  nodes = this.build('right');
  edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct' as const, metadata: { connectionPoint: 'smart' } }];
  place(pos: string) { this.where = pos; this.nodes = this.build(pos); }
  private build(pos: string) {
    return [
      { id: 'a', position: { x: 220, y: 200 }, size: { width: 140, height: 90 }, label: 'A' },
      { id: 'b', position: { ...POSITIONS[pos] }, size: { width: 140, height: 90 }, label: 'B' },
    ];
  }
  ngAfterViewInit() { markReady(); }
}
