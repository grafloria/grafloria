import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Level-of-detail: the detail the renderer draws follows the zoom. Zoom in for
 *  full labels; zoom out and the renderer sheds detail. The readout reports the
 *  zoom and how much label text reaches the DOM — genuinely different renders. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);align-items:center">
      <span>zoom:</span>
      <button (click)="setZoom(1.5)" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">1.5× high</button>
      <button (click)="setZoom(0.7)" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">0.7× medium</button>
      <button (click)="setZoom(0.3)" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">0.3× sketch</button>
      <button (click)="setZoom(0.15)" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">0.15× low</button>
      <span #readout style="margin-left:auto;font:12px/1.4 ui-monospace,monospace;opacity:.85"></span>
    </div>
    <div #host style="height:calc(100vh - 52px)">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100%" />
    </div>
  `,
})
export class ContextualZoomComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  readout = viewChild.required<ElementRef<HTMLElement>>('readout');
  host = viewChild.required<ElementRef<HTMLElement>>('host');
  nodes: any[] = Array.from({ length: 12 }, (_, i) => ({
    id: `n${i}`, position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 140 },
    size: { width: 150, height: 70 }, label: `Node ${i}`,
  }));
  edges: any[] = Array.from({ length: 11 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}`, type: 'direct' }));

  ngAfterViewInit() {
    this.canvas().fitToContent(40);
    this.setZoom(1.5);
    markReady();
  }

  setZoom(z: number) {
    const vp = this.canvas().viewportController();
    vp?.setZoom(z);
    const texts = this.host().nativeElement.querySelectorAll('svg text').length;
    const el = this.readout()?.nativeElement;
    if (el) el.textContent = `zoom ${z}×  →  ${texts} text nodes in the DOM`;
  }
}
