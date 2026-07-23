import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DARK_THEME, type Theme } from '@grafloria/renderer';
import type { LinearGradient, Shadow } from '@grafloria/engine';
import { markReady } from '../demo-ready';

const TURBO: LinearGradient = {
  type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0,
  stops: [{ offset: 0, color: '#2a8af6' }, { offset: 0.5, color: '#a853ba' }, { offset: 1, color: '#e92a67' }],
};
const GLOW: Shadow = { offsetX: 0, offsetY: 0, blur: 6, color: '#a853ba' };

const node = (id: string, x: number, y: number, label: string) => ({
  id, position: { x, y }, size: { width: 170, height: 72 }, data: { label },
  style: {
    fill: '#111528', stroke: '#2a8af6', strokeWidth: 2,
    animatedBorder: true, borderAnimationType: 'gradient' as const, shadow: GLOW,
  },
});
const edge = (id: string, s: string, t: string) => ({
  id, source: s, target: t,
  style: { stroke: TURBO, strokeWidth: 3, shadow: GLOW, animation: { type: 'dash-flow', speed: 'fast' } as const },
});

/** Glowing, animated gradient edges and node borders — all through the public
 *  style API: gradient stroke paint servers, drop-shadow glow filters, and a
 *  live dash-flow keyframe streaming along each edge. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" [theme]="theme"
      style="display:block; height:100vh; background:#0b1220" />
  `,
})
export class TurboFlowComponent implements AfterViewInit {
  theme: Theme = DARK_THEME;
  nodes = [node('a', 60, 90, 'Source'), node('b', 380, 60, 'Turbo'), node('c', 380, 210, 'Boost'), node('d', 700, 130, 'Sink')];
  edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')];
  ngAfterViewInit() { markReady(); }
}
