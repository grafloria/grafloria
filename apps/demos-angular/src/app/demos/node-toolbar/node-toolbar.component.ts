import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** A floating toolbar pinned to a node — shown while the node is selected, held
 *  at a constant on-screen size and re-anchored through the viewport transform.
 *  Mounted through the canvas's live instance (activeEngine + viewport), the same
 *  way the React/Vue variants do it. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #wrap style="height:100vh; position:relative">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
    </div>
  `,
})
export class NodeToolbarComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  wrap = viewChild.required<ElementRef<HTMLElement>>('wrap');
  nodes = [{ id: 'n', position: { x: 320, y: 230 }, size: { width: 200, height: 100 }, label: 'selected' }];
  edges = [];

  ngAfterViewInit() {
    const OFFSET = 10;
    const engine = this.canvas().activeEngine() as any;
    const model = engine?.getDiagram();
    const cmp = this.canvas() as any;
    const viewport = cmp.viewportController();
    const host = this.wrap().nativeElement;
    const node = model?.getNode('n');
    if (!model || !node || !viewport) { markReady(); return; }

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'position:absolute;left:0;top:0;z-index:4;display:flex;gap:6px;background:#111827;padding:5px 6px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap';
    for (const label of ['duplicate', 'delete']) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:12px system-ui;border:0;border-radius:5px;padding:3px 9px;background:#374151;color:#fff;cursor:pointer';
      b.addEventListener('click', () => {
        const src = model.getNode('n'); if (!src) return;
        if (label === 'delete') { model.removeNode('n'); toolbar.style.display = 'none'; }
        else {
          model.applyNodes?.([
            ...model.getNodes().map((x: any) => ({ id: x.id, position: { ...x.position }, size: { ...x.size }, label: x.getMetadata('label') })),
            { id: 'n-copy-' + Date.now().toString(36), position: { x: src.position.x + 40, y: src.position.y + 40 }, size: { ...src.size }, label: 'copy' },
          ]);
        }
      });
      toolbar.appendChild(b);
    }
    host.appendChild(toolbar);

    const reposition = () => {
      const nn = model.getNode('n'); if (!nn) return;
      const r = host.getBoundingClientRect();
      const c = viewport.worldToClient(nn.position.x + nn.size.width / 2, nn.position.y, r);
      toolbar.style.left = (c.x - r.left) + 'px';
      toolbar.style.top = (c.y - r.top) + 'px';
      toolbar.style.transform = `translate(-50%, calc(-100% - ${OFFSET}px))`;
    };
    const syncVisible = () => {
      const nn = model.getNode('n');
      toolbar.style.display = nn && nn.isSelected?.() ? '' : 'none';
    };

    node.on?.('change:position', reposition);
    node.on?.('change:size', reposition);
    model.on?.('selection:changed', () => { syncVisible(); reposition(); });
    viewport.onChange?.(reposition);

    model.selectNode ? model.selectNode(node) : node.setSelected?.(true);
    reposition(); syncVisible();
    markReady();
  }
}
