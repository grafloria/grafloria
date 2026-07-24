import { Component, signal, viewChild } from '@angular/core';
import { DiagramCanvasComponent, GrafloriaNodeDefDirective } from '@grafloria/angular';
import { DashboardPageComponent } from './dashboard-page.component';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

@Component({
  selector: 'app-root',
  imports: [DiagramCanvasComponent, GrafloriaNodeDefDirective, DashboardPageComponent],
  template: `
    <h1>Grafloria conformance — the Angular way</h1>
    <p>
      <button id="run-elk" type="button" (click)="runElk()">Run ELK layout</button>
      <button id="save" type="button" (click)="save()">Snapshot</button>
      <button id="restore" type="button" (click)="restore()">Restore</button>
      <span id="status">{{ status() }}</span>
    </p>
    <grafloria-diagram-canvas
      #canvas
      style="display:block;width:800px;height:400px;border:1px solid #ccc"
      [(nodes)]="nodes"
      [(edges)]="edges"
      [plugins]="true"
      (layoutDone)="status.set('layout done')">
      <ng-template grafloriaNode="job" let-node let-data="data">
        <div class="job-card" [attr.data-node]="node.id"
             style="width:100%;height:100%;border-radius:8px;background:#243041;color:#e8eef7;
                    padding:10px;box-sizing:border-box;font:13px system-ui">
          <strong>{{ data['title'] }}</strong>
          <div>{{ data['status'] }} · {{ data['progress'] }}%</div>
          <button type="button" (click)="bump(node.id)">+10%</button>
        </div>
      </ng-template>
    </grafloria-diagram-canvas>

    <app-dashboard-page />
  `,
})
export class AppComponent {
  private readonly canvas = viewChild.required<DiagramCanvasComponent>('canvas');
  readonly status = signal('idle');
  private saved: unknown = null;

  // All stacked at one spot — only a real layout separates them.
  nodes = signal<NodeSpec[]>([
    { id: 'j1', type: 'job', position: { x: 40, y: 40 }, size: { width: 190, height: 92 },
      data: { title: 'Extract', status: 'running', progress: 40 } },
    { id: 'j2', type: 'job', position: { x: 40, y: 40 }, size: { width: 190, height: 92 },
      data: { title: 'Transform', status: 'queued', progress: 0 } },
    { id: 'p1', type: 'plain', position: { x: 40, y: 40 }, size: { width: 120, height: 50 }, label: 'Load' },
  ]);
  edges = signal<EdgeSpec[]>([
    { source: 'j1', target: 'j2' },
    { source: 'j2', target: 'p1' },
  ]);

  runElk(): void {
    this.status.set('elk running…');
    void this.canvas().applyLayout({ name: 'elk', options: { direction: 'RIGHT' } });
  }

  save(): void {
    this.saved = this.canvas().snapshot();
    this.status.set('saved');
  }

  restore(): void {
    if (this.saved) {
      this.canvas().loadSnapshot(this.saved as any);
      this.status.set('restored');
    }
  }

  bump(id: string): void {
    this.nodes.update((ns) =>
      ns.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, progress: Math.min(100, Number(n.data?.['progress'] ?? 0) + 10) } }
          : n
      )
    );
  }
}
