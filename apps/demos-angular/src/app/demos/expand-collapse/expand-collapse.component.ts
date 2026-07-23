import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { GroupModel, GroupCollapseService } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** A container of three members plus an external node wired across the boundary.
 *  Collapse hides the members, shrinks the group to a placeholder and re-homes
 *  the boundary edges onto a proxy; expand restores every member to the exact
 *  pixel it held — lossless, through the real GroupCollapseService. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;padding:10px 24px;align-items:center;border-bottom:1px solid rgba(127,127,127,.25)">
      <button (click)="collapse()" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">collapse</button>
      <button (click)="expand()" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">expand</button>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:calc(100vh - 52px)" />
  `,
})
export class ExpandCollapseComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'ext', position: { x: 480, y: 60 }, size: { width: 100, height: 44 }, label: 'external' },
    { id: 'c1', position: { x: 60, y: 40 }, size: { width: 90, height: 40 }, label: 'c1' },
    { id: 'c2', position: { x: 60, y: 110 }, size: { width: 90, height: 40 }, label: 'c2' },
    { id: 'c3', position: { x: 60, y: 180 }, size: { width: 90, height: 40 }, label: 'c3' },
  ];
  edges = [
    { id: 'e1', source: 'c1', target: 'c2' },
    { id: 'e2', source: 'c1', target: 'ext' },
    { id: 'e3', source: 'c2', target: 'ext' },
    { id: 'e4', source: 'ext', target: 'c3' },
  ];
  private group?: InstanceType<typeof GroupModel>;
  private collapser?: GroupCollapseService;

  collapse() { if (this.group) { this.collapser!.collapse(this.group); } }
  expand() { if (this.group) { this.collapser!.expand(this.group); } }

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      const diagram = engine.getDiagram();
      const group = new GroupModel({ id: 'box', name: 'Service' });
      diagram.addGroup(group);
      group.padding = 14;
      for (const id of ['c1', 'c2', 'c3']) group.addMember(id, diagram);
      this.group = group;
      this.collapser = new GroupCollapseService(diagram);
      await engine.layout('dagre', { direction: 'TB', nodeSpacing: 30, rankSpacing: 50 });
    }
    markReady();
  }
}
