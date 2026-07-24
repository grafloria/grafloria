import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Right-click a node → a menu opens anchored at the pointer, and every item
 *  mutates the node it names: Rename (setMetadata), Duplicate (engine.addNode),
 *  Delete (removeNode). Driven by a real contextmenu event. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div #wrap style="height:100vh;position:relative">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100%" />
      <div #menu style="position:absolute;z-index:10;min-width:160px;background:var(--mbg,#1a1a1a);color:#fff;border:1px solid rgba(127,127,127,.35);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:4px;display:none;font:13px system-ui,sans-serif">
        <button data-act="rename" style="display:block;width:100%;text-align:left;padding:7px 10px;border:0;background:transparent;color:inherit;border-radius:5px;cursor:pointer">Rename</button>
        <button data-act="duplicate" style="display:block;width:100%;text-align:left;padding:7px 10px;border:0;background:transparent;color:inherit;border-radius:5px;cursor:pointer">Duplicate</button>
        <button data-act="delete" style="display:block;width:100%;text-align:left;padding:7px 10px;border:0;background:transparent;color:inherit;border-radius:5px;cursor:pointer">Delete</button>
      </div>
    </div>
  `,
})
export class ContextMenuComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  wrap = viewChild.required<ElementRef<HTMLElement>>('wrap');
  menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  nodes: any[] = [
    { id: 'a', position: { x: 120, y: 120 }, size: { width: 120, height: 48 }, label: 'Alpha' },
    { id: 'b', position: { x: 380, y: 120 }, size: { width: 120, height: 48 }, label: 'Beta' },
  ];
  edges: any[] = [{ id: 'e', source: 'a', target: 'b' }];

  ngAfterViewInit() {
    const engine = this.canvas().activeEngine() as any;
    const model = engine?.getDiagram();
    const wrap = this.wrap().nativeElement;
    const menu = this.menu().nativeElement;
    let target: string | null = null;
    if (!model) { markReady(); return; }

    wrap.addEventListener('contextmenu', (e) => {
      const el = (e.target as HTMLElement).closest('[data-node-id]');
      if (!el) return;
      e.preventDefault();
      target = el.getAttribute('data-node-id');
      const rect = wrap.getBoundingClientRect();
      menu.style.left = `${e.clientX - rect.left}px`;
      menu.style.top = `${e.clientY - rect.top}px`;
      menu.style.display = 'block';
    });

    const act = async (action: string) => {
      const id = target; if (!id) return;
      if (action === 'rename') model.getNode(id)?.setMetadata('label', 'RENAMED');
      if (action === 'delete') model.removeNode(id);
      if (action === 'duplicate') {
        const s = model.getNode(id); if (!s) return;
        const copy = await engine.addNode({ type: 'rect', position: { x: s.position.x + 30, y: s.position.y + 60 }, size: { ...s.size } });
        copy.setMetadata('label', (s.getMetadata('label') ?? '') + ' copy');
      }
      menu.style.display = 'none';
    };
    for (const btn of Array.from(menu.querySelectorAll<HTMLButtonElement>('button'))) {
      btn.addEventListener('click', () => act(btn.dataset['act']!));
    }
    document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target as Node)) menu.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.style.display = 'none'; });
    markReady();
  }
}
