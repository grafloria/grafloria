import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { defineStyle } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

// The registry is a process-wide singleton, so namespace class names to this demo.
const WARN = 'nsc-warn';
const BOLD = 'nsc-bold';
defineStyle(WARN, { fill: '#f97316', stroke: '#9a3412', strokeWidth: 2 });
defineStyle(BOLD, { strokeWidth: 6 });

/** defineStyle() + style.styleClass — one deterministic cascade:
 *  theme < type-default < named-class < element-inline < state. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class NamedStyleClassesComponent implements AfterViewInit {
  nodes = [
    { id: 'classed', position: { x: 60, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'styleClass: warn' },
      style: { styleClass: WARN } },
    { id: 'override', position: { x: 320, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'warn + inline fill' },
      style: { styleClass: WARN, fill: '#22c55e' } },
    { id: 'stacked', position: { x: 580, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'warn bold' },
      style: { styleClass: `${WARN} ${BOLD}` } },
    { id: 'plain', position: { x: 320, y: 250 }, size: { width: 190, height: 78 }, data: { label: 'no class (theme)' } },
  ];
  edges = [];
  ngAfterViewInit() { markReady(); }
}
