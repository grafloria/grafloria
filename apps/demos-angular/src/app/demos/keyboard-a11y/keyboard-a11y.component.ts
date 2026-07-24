import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { Replica } from '@grafloria/engine';
import { markReady } from '../demo-ready';

/** Keyboard + screen-reader a11y: Tab / Shift+Tab move a focus ring across nodes
 *  (aria-activedescendant), arrows nudge the focused node (⌘Z undoes to the exact
 *  pixel via the op log), C+Tab+Enter connects with no mouse, and a visually
 *  hidden live-region outline narrates every node and edge. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #readout style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.85;border-bottom:1px solid rgba(127,127,127,.25);white-space:pre"></div>
    <div style="position:relative;height:calc(100vh - 44px)">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100%" />
      <div #kbd tabindex="0" role="application" aria-label="Diagram editor. Tab between nodes, arrows nudge, C then a node to connect." aria-activedescendant=""
           style="position:absolute;inset:0;outline:none"></div>
      <ul #outline role="list" aria-live="polite" aria-label="Diagram outline" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></ul>
      <div style="position:absolute;left:12px;bottom:10px;font:12px system-ui;opacity:.6">Tab / ⇧Tab · arrows nudge · ⌘Z undo · C+Tab+Enter connect</div>
    </div>
  `,
})
export class KeyboardA11yComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  readout = viewChild.required<ElementRef<HTMLElement>>('readout');
  kbd = viewChild.required<ElementRef<HTMLElement>>('kbd');
  outline = viewChild.required<ElementRef<HTMLElement>>('outline');
  nodes: any[] = ['ingest', 'clean', 'model', 'serve'].map((id, i) => ({
    id, position: { x: 80 + i * 200, y: 160 }, size: { width: 140, height: 56 }, label: id,
  }));
  edges: any[] = [
    { id: 'e1', source: 'ingest', target: 'clean' },
    { id: 'e2', source: 'clean', target: 'model' },
  ];
  private focusIndex = 0;
  private connectFrom: string | null = null;

  ngAfterViewInit() {
    const engine = this.canvas().activeEngine() as any;
    const model = engine?.getDiagram();
    const kbd = this.kbd().nativeElement;
    const outline = this.outline().nativeElement;
    const STEP = 16;
    if (!engine || !model) { markReady(); return; }

    let replica: any = null;
    try { replica = new Replica(model, { actor: 'kbd', onLocalOp: () => {} } as any); } catch { replica = null; }

    const order = () => model.getNodes().map((n: any) => n.id).sort();
    const focusedId = () => order()[this.focusIndex];
    const paintFocus = () => {
      const id = focusedId();
      kbd.setAttribute('aria-activedescendant', `node-${id}`);
      for (const n of model.getNodes()) n.setSelected(n.id === id);
    };
    const syncOutline = () => {
      outline.innerHTML = model.getNodes().map((n: any) => {
        const outs = model.getLinks().filter((l: any) => l.sourceNodeId === n.id).map((l: any) => l.targetNodeId);
        const label = n.getMetadata('label') ?? n.id;
        return `<li id="node-${n.id}" role="listitem">${label} at ${Math.round(n.position.x)},${Math.round(n.position.y)}${outs.length ? ' → connects to ' + outs.join(', ') : ''}</li>`;
      }).join('');
    };
    const report = (m: string) => { this.readout().nativeElement.textContent = `focused: ${focusedId()}${this.connectFrom ? `  connecting from ${this.connectFrom}` : ''}\n${m}`; };

    const handle = (key: string, shift: boolean, meta: boolean) => {
      const ids = order();
      if (key === 'Tab') { this.focusIndex = (this.focusIndex + (shift ? -1 : 1) + ids.length) % ids.length; paintFocus(); report('Tab moved focus'); return; }
      if (key === 'z' && meta) { replica?.undo(); syncOutline(); report('⌘Z undo'); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        const n = model.getNode(focusedId());
        const dx = key === 'ArrowLeft' ? -STEP : key === 'ArrowRight' ? STEP : 0;
        const dy = key === 'ArrowUp' ? -STEP : key === 'ArrowDown' ? STEP : 0;
        n.setPosition(n.position.x + dx, n.position.y + dy);
        syncOutline(); report(`nudged ${key.replace('Arrow', '').toLowerCase()}`); return;
      }
      if (key === 'c') { this.connectFrom = focusedId(); report('connect mode: Tab to a target, Enter to link'); return; }
      if (key === 'Enter' && this.connectFrom) {
        const target = focusedId();
        if (target !== this.connectFrom) {
          const s = model.getNode(this.connectFrom).getPortBySide('right');
          const t = model.getNode(target).getPortBySide('left');
          const csm = engine.getConnectionStateManager();
          csm.startConnection(s, { x: 0, y: 0 });
          csm.completeConnection(t);
        }
        this.connectFrom = null; syncOutline(); report('linked by keyboard'); return;
      }
    };
    kbd.addEventListener('keydown', (e) => {
      const keys = ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'c', 'z'];
      if (keys.includes(e.key)) { e.preventDefault(); handle(e.key, e.shiftKey, e.metaKey || e.ctrlKey); }
    });

    paintFocus(); syncOutline(); report('ready — keyboard only');
    markReady();
  }
}
