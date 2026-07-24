import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Copy a node to the engine clipboard, then paste independent copies — each
 *  gets its own id and position, and mutating one leaves the others untouched.
 *  ⌘C / ⌘V drive the same engine.copy() / engine.paste() path. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #readout style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.8;border-bottom:1px solid rgba(127,127,127,.25);white-space:pre"></div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:calc(100vh - 44px)" />
  `,
})
export class CopyPasteComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  readout = viewChild.required<ElementRef<HTMLElement>>('readout');
  nodes: any[] = [
    { id: 'orig', position: { x: 120, y: 120 }, size: { width: 130, height: 50 }, label: 'Original' },
  ];
  edges: any[] = [];
  private key?: (e: KeyboardEvent) => void;

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine() as any;
    const model = engine?.getDiagram();
    const report = (m: string) => { const el = this.readout()?.nativeElement; if (el) el.textContent = m; };
    if (!engine || !model) { markReady(); return; }

    // Demonstrate the round trip on load: select, copy, paste one independent copy.
    engine.selectNodes(['orig']);
    await engine.copy();
    await engine.paste({ offset: { x: 60, y: 60 } });
    report(`copied Original; ${model.getNodes().length} nodes — ⌘C then ⌘V to make more`);

    this.key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'c') { engine.copy(); }
      if (e.key === 'v') {
        e.preventDefault();
        engine.paste({}).then(() => report(`${model.getNodes().length} nodes — each paste cascades to a new spot`));
      }
    };
    window.addEventListener('keydown', this.key);
    markReady();
  }
}
