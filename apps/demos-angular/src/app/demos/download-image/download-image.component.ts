import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Download image: exports the VNode tree — labels, arrowheads, shadows and all
 *  — not a screenshot. PNG (raster) and SVG (vector) both come from the same
 *  canvas.exportDiagram() pipeline. */
const SHADOW = { offsetX: 3, offsetY: 4, blur: 5, color: '#1e293b' };

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap">
      <button (click)="downloadPng()" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font:inherit">download PNG</button>
      <button (click)="downloadSvg()" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font:inherit">download SVG</button>
      <span style="font:12px ui-monospace,monospace;opacity:.8">{{ note }}</span>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:calc(100vh - 45px)" />
  `,
})
export class DownloadImageComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  note = 'Exports the VNode tree — not a screenshot.';
  nodes = [
    { id: 'ingest',    label: 'Ingest',    position: { x: 60,  y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 } },
    { id: 'transform', label: 'Transform', position: { x: 340, y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2, shadow: SHADOW } },
    { id: 'publish',   label: 'Publish',   position: { x: 620, y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#dcfce7', stroke: '#16a34a', strokeWidth: 2 } },
  ];
  edges = [
    { id: 'e1', source: 'ingest', target: 'transform', label: 'rows' },
    { id: 'e2', source: 'transform', target: 'publish' },
  ];

  private download(href: string, name: string) {
    const a = document.createElement('a');
    a.href = href; a.download = name; a.click();
  }
  async downloadPng() {
    const d = await this.canvas().exportDiagram('png', { scale: 2 });
    this.download(d, 'diagram.png');
    this.note = `diagram.png saved (${Math.round(d.length * 3 / 4 / 1024)} KB)`;
  }
  async downloadSvg() {
    const svg = await this.canvas().exportDiagram('svg');
    this.download('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 'diagram.svg');
    this.note = `diagram.svg saved (${Math.round(svg.length / 1024)} KB)`;
  }

  ngAfterViewInit() { markReady(); }
}
