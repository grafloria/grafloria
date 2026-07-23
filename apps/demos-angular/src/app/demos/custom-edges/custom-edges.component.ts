import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { registerLinkTemplate } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** An author-supplied edge template via registerLinkTemplate() — a two-rail
 *  "pipe" drawn from the routed polyline. It REPLACES the default edge and
 *  follows the live route. */
registerLinkTemplate('pipe', (ctx: any) => {
  const d = ctx.pathData;
  const stroke = ctx.selected ? '#2563eb' : '#0ea5e9';
  return [
    { type: 'path', props: { d, className: 'pipe-casing', fill: 'none', stroke, 'stroke-width': 10, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' } },
    { type: 'path', props: { d, className: 'pipe-core', fill: 'none', stroke, 'stroke-width': 2.5 } },
  ];
});

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class CustomEdgesComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 120, y: 120 }, size: { width: 140, height: 64 }, label: 'Source' },
    { id: 'b', position: { x: 680, y: 340 }, size: { width: 140, height: 64 }, label: 'Sink' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth' as const, style: { template: 'pipe' } }];
  ngAfterViewInit() { markReady(); }
}
