import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Drag a chip out of the palette and drop it on the canvas: a node is created
 *  AT THE DROP POINT in world space (through the live viewport), so it lands
 *  under the cursor even after the camera has panned/zoomed. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:grid;grid-template-columns:160px 1fr;height:100vh">
      <div style="border-right:1px solid rgba(127,127,127,.25);padding:12px;display:flex;flex-direction:column;gap:10px">
        <div class="chip" data-kind="source" draggable="true" style="padding:10px;border:1px dashed rgba(127,127,127,.5);border-radius:8px;text-align:center;cursor:grab;user-select:none;font:13px/1.2 system-ui,sans-serif">Source</div>
        <div class="chip" data-kind="filter" draggable="true" style="padding:10px;border:1px dashed rgba(127,127,127,.5);border-radius:8px;text-align:center;cursor:grab;user-select:none;font:13px/1.2 system-ui,sans-serif">Filter</div>
        <div class="chip" data-kind="sink" draggable="true" style="padding:10px;border:1px dashed rgba(127,127,127,.5);border-radius:8px;text-align:center;cursor:grab;user-select:none;font:13px/1.2 system-ui,sans-serif">Sink</div>
      </div>
      <div #host style="height:100%;position:relative">
        <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100%" />
        <span #readout style="position:absolute;right:10px;top:8px;font:12px/1.4 ui-monospace,monospace;opacity:.75"></span>
      </div>
    </div>
  `,
})
export class DragAndDropComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  host = viewChild.required<ElementRef<HTMLElement>>('host');
  readout = viewChild.required<ElementRef<HTMLElement>>('readout');
  nodes: any[] = [];
  edges: any[] = [];

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine() as any;
    const model = engine?.getDiagram();
    const host = this.host().nativeElement;
    const vp = this.canvas().viewportController();
    if (!engine || !model || !vp) { markReady(); return; }

    const report = () => { const el = this.readout()?.nativeElement; if (el) el.textContent = `${model.getNodes().length} nodes`; };
    const dropAt = async (kind: string, clientX: number, clientY: number) => {
      const w = vp.clientToWorld(clientX, clientY, host.getBoundingClientRect());
      const node = await engine.addNode({ type: 'rect', position: { x: w.x - 55, y: w.y - 22 }, size: { width: 110, height: 44 } });
      node.data = { kind };
      node.setMetadata('label', kind);
      report();
      return node;
    };

    // Seed two dropped nodes so the result of the gesture is visible on load.
    const r = host.getBoundingClientRect();
    await dropAt('filter', r.left + r.width * 0.4, r.top + r.height * 0.4);
    await dropAt('sink', r.left + r.width * 0.6, r.top + r.height * 0.6);

    // Live HTML5 drag-and-drop for a human visitor.
    let dragKind: string | null = null;
    for (const chip of Array.from(host.ownerDocument.querySelectorAll<HTMLElement>('.chip'))) {
      chip.addEventListener('dragstart', () => { dragKind = chip.dataset['kind'] ?? null; });
    }
    host.addEventListener('dragover', (e) => e.preventDefault());
    host.addEventListener('drop', (e) => { e.preventDefault(); if (dragKind) dropAt(dragKind, e.clientX, e.clientY); });
    markReady();
  }
}
