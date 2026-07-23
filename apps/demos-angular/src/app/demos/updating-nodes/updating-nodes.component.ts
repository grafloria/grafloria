import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Edit a live node from OUTSIDE the canvas — type a label, pick a background,
 *  drag the width slider — and it re-renders on the spot. Each control calls a
 *  tracked setter (setMetadata / setSize) that bumps the mutation epoch. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex; gap:18px; align-items:center; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25); font:13px system-ui, sans-serif">
      <label>Label <input type="text" [value]="label" (input)="setLabel($any($event.target).value)" autocomplete="off"></label>
      <label>Background <input type="color" [value]="color" (input)="setColor($any($event.target).value)"></label>
      <label>Width <input type="range" min="140" max="360" step="1" [value]="width" (input)="setWidth(+$any($event.target).value)"> <output>{{ width }}</output></label>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:calc(100vh - 60px)" />
  `,
})
export class UpdatingNodesComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  label = 'BEFORE';
  color = '#eef2ff';
  width = 200;
  nodes = [
    { id: 'a', position: { x: 80, y: 90 }, size: { width: 200, height: 90 }, label: 'BEFORE',
      shape: { type: 'rect', fill: '#eef2ff', stroke: '#6366f1' } },
    { id: 'b', position: { x: 560, y: 90 }, size: { width: 200, height: 90 }, label: 'Steady' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }];

  private node(): any { return this.canvas().activeEngine()?.getDiagram()?.getNode('a'); }

  setLabel(v: string) { this.label = v; this.node()?.setMetadata('label', v); }
  setColor(v: string) { this.color = v; this.node()?.setMetadata('shape', { type: 'rect', fill: v, stroke: '#334155' }); }
  setWidth(v: number) { this.width = v; const n = this.node(); if (n) n.setSize(v, n.size.height); }

  ngAfterViewInit() { markReady(); }
}
