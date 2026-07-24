import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** PDF export: a true VECTOR PDF — paths stay paths, text stays selectable text
 *  — with zero new dependencies, straight from canvas.exportDiagram('pdf'). */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap">
      <button (click)="downloadPdf()" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font:inherit">download PDF</button>
      <span style="font:12px ui-monospace,monospace;opacity:.8">{{ note }}</span>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:calc(100vh - 45px)" />
  `,
})
export class PdfExportComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  note = 'A true VECTOR PDF — paths stay paths, text stays selectable text.';
  nodes = [
    { id: 'a', label: 'Requirements', position: { x: 60,  y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#eef2ff', stroke: '#4f46e5', strokeWidth: 2 } },
    { id: 'b', label: 'Design',       position: { x: 340, y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2 } },
    { id: 'c', label: 'Ship',         position: { x: 620, y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#ecfdf5', stroke: '#059669', strokeWidth: 2 } },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];

  async downloadPdf() {
    const href = await this.canvas().exportDiagram('pdf');
    const a = document.createElement('a');
    a.href = href; a.download = 'diagram.pdf'; a.click();
    this.note = `diagram.pdf saved (${Math.round(href.length * 3 / 4 / 1024)} KB)`;
  }

  ngAfterViewInit() { markReady(); }
}
