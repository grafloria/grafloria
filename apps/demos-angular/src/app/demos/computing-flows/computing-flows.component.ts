import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Data flowing through TYPED ports: type a value into the source and every
 *  downstream node recomputes LIVE along the real link topology; rewiring or
 *  cutting a wire recomputes off the new topology. Grafloria owns the graph and
 *  fires link:added / link:removed; the app owns the arithmetic. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div id="readout" style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.9;border-bottom:1px solid rgba(127,127,127,.25);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <label style="display:inline-flex;align-items:center;gap:6px">input
        <input #src type="number" step="1" value="2" style="width:74px;font:inherit;padding:2px 6px;border:1px solid rgba(127,127,127,.5);border-radius:4px;background:transparent;color:inherit">
      </label>
      <span #formula style="white-space:pre"></span>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block;height:calc(100vh - 44px)" />
  `,
})
export class ComputingFlowsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  src = viewChild.required<ElementRef<HTMLInputElement>>('src');
  formula = viewChild.required<ElementRef<HTMLElement>>('formula');
  nodes: any[] = [
    { id: 'in', position: { x: 40, y: 120 }, size: { width: 120, height: 56 }, label: 'input',
      ports: [{ id: 'in.out', side: 'right', type: 'output', dataType: 'number' }], data: { value: 2 } },
    { id: 'mul', position: { x: 240, y: 120 }, size: { width: 120, height: 56 }, label: '× 3',
      ports: [{ id: 'mul.in', side: 'left', type: 'input', dataType: 'number' },
              { id: 'mul.out', side: 'right', type: 'output', dataType: 'number' }], data: { op: 'mul', k: 3, value: 0 } },
    { id: 'add', position: { x: 440, y: 120 }, size: { width: 120, height: 56 }, label: '+ 10',
      ports: [{ id: 'add.in', side: 'left', type: 'input', dataType: 'number' },
              { id: 'add.out', side: 'right', type: 'output', dataType: 'number' }], data: { op: 'add', k: 10, value: 0 } },
    { id: 'out', position: { x: 640, y: 120 }, size: { width: 120, height: 56 }, label: 'sink',
      ports: [{ id: 'out.in', side: 'left', type: 'input', dataType: 'number' }], data: { op: 'sink', value: 0 } },
  ];
  edges: any[] = [
    { id: 'l1', source: 'in', target: 'mul', sourceHandle: 'in.out', targetHandle: 'mul.in' },
    { id: 'l2', source: 'mul', target: 'add', sourceHandle: 'mul.out', targetHandle: 'add.in' },
    { id: 'l3', source: 'add', target: 'out', sourceHandle: 'add.out', targetHandle: 'out.in' },
  ];

  ngAfterViewInit() {
    const model = this.canvas().activeEngine()?.getDiagram() as any;
    const srcInput = this.src().nativeElement;
    const formula = this.formula().nativeElement;
    if (!model) { markReady(); return; }

    const order = ['in', 'mul', 'add', 'out'];
    const propagate = () => {
      const incoming = (id: string) => model.getLinks().filter((l: any) => l.targetNodeId === id);
      for (const id of order) {
        if (id === 'in') continue;
        const node = model.getNode(id); if (!node) continue;
        const feeds = incoming(id);
        const input = feeds.length ? (model.getNode(feeds[0].sourceNodeId)?.data.value ?? 0) : null;
        if (input === null) continue;
        const d = node.data;
        d.value = d.op === 'mul' ? input * d.k : d.op === 'add' ? input + d.k : input;
      }
      const v = (id: string) => model.getNode(id)?.data.value ?? 0;
      formula.textContent = `→  ×3=${v('mul')}  →  +10=${v('add')}  →  sink=${v('out')}`;
      if (document.activeElement !== srcInput) srcInput.value = String(v('in'));
    };

    srcInput.addEventListener('input', () => {
      const n = Number(srcInput.value);
      const inN = model.getNode('in'); if (inN) inN.data.value = Number.isFinite(n) ? n : 0;
      propagate();
    });
    model.on?.('link:added', () => propagate());
    model.on?.('link:removed', () => propagate());

    propagate();
    markReady();
  }
}
