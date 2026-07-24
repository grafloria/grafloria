import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Eight nodes tween between layouts (grid · ring · row) by writing
 *  node.position every frame on an ease-out curve — pure userland, no animation
 *  API. Here the graph glides grid → ring on load; the ring edges follow. */
const IDS = Array.from({ length: 8 }, (_, i) => `n${i}`);
const SIZE = { width: 96, height: 40 };
const HX = SIZE.width / 2, HY = SIZE.height / 2;
const CX = 600, CY = 285;

function circleLayout() { const o: Record<string, { x: number; y: number }> = {}; IDS.forEach((id, i) => { const a = (i / IDS.length) * 2 * Math.PI - Math.PI / 2; o[id] = { x: CX + 250 * Math.cos(a) - HX, y: CY + 205 * Math.sin(a) - HY }; }); return o; }
function gridLayout() { const o: Record<string, { x: number; y: number }> = {}; IDS.forEach((id, i) => { const c = i % 4, r = (i / 4) | 0; o[id] = { x: (315 + c * 190) - HX, y: (160 + r * 250) - HY }; }); return o; }

const LAYOUTS = { grid: gridLayout(), circle: circleLayout() };
const EDGES = IDS.map((id, i) => ({ id: `e${i}`, source: id, target: IDS[(i + 1) % IDS.length] }));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class NodePositionAnimationComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = IDS.map((id) => ({ id, position: { ...LAYOUTS.grid[id] }, size: SIZE, label: id.toUpperCase() }));
  edges = EDGES;

  ngAfterViewInit() {
    const model = this.canvas().activeEngine()?.getDiagram() as any;
    if (model) {
      const targets = LAYOUTS.circle;
      const starts: Record<string, { x: number; y: number }> = {};
      for (const id of Object.keys(targets)) { const p = model.getNode(id).position; starts[id] = { x: p.x, y: p.y }; }
      const t0 = performance.now();
      const duration = 900;
      const frame = (now: number) => {
        const raw = Math.min(1, (now - t0) / duration);
        const k = easeOutCubic(raw);
        for (const id of Object.keys(targets)) {
          const s = starts[id], t = targets[id];
          model.getNode(id).setPosition(s.x + (t.x - s.x) * k, s.y + (t.y - s.y) * k);
        }
        if (raw < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
    markReady();
  }
}
