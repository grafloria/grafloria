import { AfterViewInit, Component, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { MemoryHub } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Conflict resolution: two peers edit the SAME node at the SAME time — one
 *  moves it, the other renames it — offline from each other (batched with a
 *  huge interval so nothing crosses the wire until ⇄ Exchange flushes both op
 *  logs). Both converge with BOTH edits intact, because a per-property CRDT
 *  keeps position and label as different registers. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent, FormsModule],
  template: `
    <div style="font-size:12px;opacity:.8;padding:10px 14px;border-bottom:1px solid rgba(127,127,127,.25)">
      Peer A moves n1, peer B renames it — offline. Their chips disagree until ⇄ Exchange, then both converge with both edits intact.
    </div>
    <div style="display:flex; height:calc(100vh - 150px)">
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; border-right:2px solid rgba(127,127,127,.35)">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(127,127,127,.25)">
          <span style="font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">peer A — moves it</span>
          <button (click)="moveA()" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">⤢ Move node</button>
          <span style="margin-left:auto;font:12px ui-monospace,Menlo,monospace;opacity:.85" [innerHTML]="statA"></span>
        </div>
        <grafloria-diagram-canvas #a [(nodes)]="nodesA" [(edges)]="edgesA"
          [collab]="collabA" (collabReady)="sessionA = $event" style="display:block; flex:1" />
      </div>
      <div style="flex:1; min-width:0; display:flex; flex-direction:column">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(127,127,127,.25)">
          <span style="font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">peer B — renames it</span>
          <input [(ngModel)]="name" style="font-size:12px;padding:4px 7px;width:90px;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit">
          <button (click)="renameB()" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">✎ Rename</button>
          <span style="margin-left:auto;font:12px ui-monospace,Menlo,monospace;opacity:.85" [innerHTML]="statB"></span>
        </div>
        <grafloria-diagram-canvas #b [(nodes)]="nodesB" [(edges)]="edgesB"
          [collab]="collabB" (collabReady)="sessionB = $event" style="display:block; flex:1" />
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid rgba(127,127,127,.3)">
      <button (click)="exchange()" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(37,99,235,.6);background:transparent;color:inherit;cursor:pointer;font-size:12px;font-weight:600">⇄ Exchange / Sync</button>
      <button (click)="resetAll()" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">↺ Reset</button>
      <button (click)="resizeA()" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">＋ Resize n1</button>
      <span style="margin-left:8px;font-size:13px" [innerHTML]="verdict"></span>
    </div>
  `,
})
export class ConflictResolutionComponent implements AfterViewInit {
  canvasA = viewChild.required<DiagramCanvasComponent>('a');
  canvasB = viewChild.required<DiagramCanvasComponent>('b');

  // Two-way arrays. n1 is one node, no edges.
  nodesA = [{ id: 'n1', label: 'Draft', position: { x: 120, y: 120 }, size: { width: 160, height: 70 } }];
  edgesA: unknown[] = [];
  nodesB = [{ id: 'n1', label: 'Draft', position: { x: 120, y: 120 }, size: { width: 160, height: 70 } }];
  edgesB: unknown[] = [];
  name = 'Final';
  statA = '';
  statB = '';
  verdict = '';

  private hub = new MemoryHub();
  collabA = { transport: this.hub.connect('ana'), actor: 'ana', batch: { intervalMs: 1_000_000 } } as never;
  collabB = { transport: this.hub.connect('bo'), actor: 'bo', batch: { intervalMs: 1_000_000 } } as never;
  sessionA?: { flush: () => void };
  sessionB?: { flush: () => void };

  private nodeOf(c: DiagramCanvasComponent): any {
    return (c.activeEngine()?.getDiagram() as any)?.getNode('n1');
  }
  private stateOf(c: DiagramCanvasComponent) {
    const n = this.nodeOf(c);
    return n ? { label: n.getMetadata('label'), x: Math.round(n.position.x), w: n.size.width } : { label: '?', x: 0, w: 0 };
  }
  private refresh = () => {
    const a = this.stateOf(this.canvasA());
    const b = this.stateOf(this.canvasB());
    const d = { lbl: a.label !== b.label, x: a.x !== b.x, w: a.w !== b.w };
    const chip = (s: { label: string; x: number; w: number }) =>
      `label <b${d.lbl ? ' style="color:#e0245e"' : ''}>"${s.label}"</b> · x <b${d.x ? ' style="color:#e0245e"' : ''}>${s.x}</b> · w <b${d.w ? ' style="color:#e0245e"' : ''}>${s.w}</b>`;
    this.statA = chip(a);
    this.statB = chip(b);
    const converged = !d.lbl && !d.x && !d.w;
    const edited = !(a.label === 'Draft' && a.x === 120 && a.w === 160);
    this.verdict = !converged
      ? '<span style="color:#b45309">● diverged — the peers hold different values until you ⇄ Exchange</span>'
      : edited
        ? '<span style="color:#16a34a;font-weight:600">✓ converged — every edit survived on BOTH peers</span>'
        : 'in sync — both peers agree (boot state)';
  };

  moveA() { this.nodeOf(this.canvasA())?.setPosition(360, 250); this.refresh(); }
  renameB() { this.nodeOf(this.canvasB())?.setMetadata('label', (this.name || 'Final').trim() || 'Final'); this.refresh(); }
  resizeA() { this.nodeOf(this.canvasA())?.setSize(220, 90); this.refresh(); }
  exchange() {
    this.sessionA?.flush();
    this.sessionB?.flush();
    requestAnimationFrame(() => { this.canvasA().scheduleRender(); this.canvasB().scheduleRender(); this.refresh(); });
  }
  resetAll() {
    for (const c of [this.canvasA(), this.canvasB()]) {
      const n = this.nodeOf(c);
      if (n) { n.setPosition(120, 120); n.setSize(160, 70); n.setMetadata('label', 'Draft'); }
    }
    this.sessionA?.flush(); this.sessionB?.flush();
    requestAnimationFrame(() => { this.canvasA().scheduleRender(); this.canvasB().scheduleRender(); this.name = 'Final'; this.refresh(); });
  }

  ngAfterViewInit() {
    this.refresh();
    markReady();
  }
}
