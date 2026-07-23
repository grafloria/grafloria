import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import type { LinearGradient, RadialGradient, Pattern, Shadow } from '@grafloria/engine';
import { markReady } from '../demo-ready';

const LINEAR: LinearGradient = {
  type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1,
  stops: [{ offset: 0, color: '#7c3aed' }, { offset: 1, color: '#ec4899' }],
};
const RADIAL: RadialGradient = {
  type: 'radial', cx: 0.5, cy: 0.4, r: 0.6,
  stops: [{ offset: 0, color: '#fde047' }, { offset: 1, color: '#ea580c' }],
};
const DOTS: Pattern = { type: 'dots', color: '#0369a1', backgroundColor: '#e0f2fe', size: 2, spacing: 10 };
const SHADOW: Shadow = { offsetX: 4, offsetY: 6, blur: 8, color: 'rgba(0,0,0,0.5)' };

/** Gradient & pattern fills and drop-shadow filters — each a real, deduped
 *  <defs> paint server referenced by url(#…), not a flattened approximation. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class PaintServersComponent implements AfterViewInit {
  nodes = [
    { id: 'grad', position: { x: 60, y: 90 }, size: { width: 190, height: 84 }, data: { label: 'linear' }, style: { fill: LINEAR } },
    { id: 'grad2', position: { x: 60, y: 220 }, size: { width: 190, height: 84 }, data: { label: 'linear (twin)' }, style: { fill: LINEAR } },
    { id: 'radial', position: { x: 320, y: 90 }, size: { width: 190, height: 84 }, data: { label: 'radial' }, style: { fill: RADIAL } },
    { id: 'dots', position: { x: 320, y: 220 }, size: { width: 190, height: 84 }, data: { label: 'dots pattern' }, style: { fill: DOTS } },
    { id: 'shadow', position: { x: 580, y: 90 }, size: { width: 190, height: 84 }, data: { label: 'drop shadow' }, style: { fill: '#ffffff', shadow: SHADOW } },
    { id: 'flat', position: { x: 580, y: 220 }, size: { width: 190, height: 84 }, data: { label: 'flat (control)' }, style: { fill: '#e2e8f0' } },
  ];
  edges = [{ id: 'e1', source: 'grad', target: 'radial' }];
  ngAfterViewInit() { markReady(); }
}
