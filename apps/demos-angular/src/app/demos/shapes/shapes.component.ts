import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

const FIGURES = [
  'rect', 'circle', 'ellipse', 'diamond', 'hexagon', 'parallelogram', 'parallelogram-top',
  'trapezoid', 'trapezoid-bottom', 'triangle', 'triangle-down', 'package', 'cube',
  'document', 'cylinder', 'cloud', 'predefined-process', 'component', 'note', 'terminal', 'actor',
];

/** All 21 built-in figures, each a full ShapeDefinition — links attach to the
 *  real silhouette edge, not a bounding box. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class ShapesComponent implements AfterViewInit {
  nodes = FIGURES.map((type, i) => ({
    id: type,
    position: { x: 40 + (i % 6) * 200, y: 40 + Math.floor(i / 6) * 150 },
    size: { width: type === 'terminal' ? 170 : 130, height: 90 },
    label: type,
    shape: { type, fill: '#dbeafe', stroke: '#2563eb' },
  }));
  edges = [];
  ngAfterViewInit() { markReady(); }
}
