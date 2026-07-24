import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

const TYPES = ['marching-ants', 'flow', 'pulse', 'dash-flow'];

/** Four CSS stroke animations, straight from the spec: style.animation is a
 *  live keyframe on the painted path, not dead config. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class AnimatingEdgesComponent implements AfterViewInit {
  nodes = TYPES.flatMap((type, i) => [
    { id: 'a' + i, position: { x: 120, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: type },
    { id: 'b' + i, position: { x: 640, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: '' },
  ]);
  edges = TYPES.map((type, i) => ({
    id: 'e' + i, source: 'a' + i, target: 'b' + i,
    style: { animation: { type, speed: 'normal' } },
  }));
  ngAfterViewInit() { markReady(); }
}
