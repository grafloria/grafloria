import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { registerTool, createDrawTool, createStrokeEditTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../demo-ready';
import { whiteboardHost } from '../whiteboard-host';

/** Stroke edit: draw ink with the pen, then switch to the edit tool and drag a
 *  committed stroke — the whole stroke translates as one undoable step. The
 *  draw and edit tools are both registered; the toolbar is the tool-switch
 *  seam (setActive). */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);align-items:center">
      <span>tool:</span>
      <button (click)="setTool(false)" [style.background]="edit ? 'transparent' : '#0f766e'" [style.color]="edit ? 'inherit' : '#fff'"
        style="padding:4px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);cursor:pointer;font:inherit">draw</button>
      <button (click)="setTool(true)" [style.background]="edit ? '#0f766e' : 'transparent'" [style.color]="edit ? '#fff' : 'inherit'"
        style="padding:4px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);cursor:pointer;font:inherit">edit</button>
    </div>
    <div #host style="display:block; height:calc(100vh - 45px)">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
    </div>
  `,
})
export class StrokeEditComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  host = viewChild.required<ElementRef<HTMLElement>>('host');
  nodes: unknown[] = [];
  edges: unknown[] = [];
  edit = false;
  private drawTool?: { setActive: (a: boolean) => void };
  private editTool?: { setActive: (a: boolean) => void };

  setTool(edit: boolean) {
    this.edit = edit;
    this.drawTool?.setActive(!edit);
    this.editTool?.setActive(edit);
  }

  ngAfterViewInit() {
    const canvas = this.canvas();
    const model = canvas.activeEngine()?.getDiagram() as any;
    if (model) {
      // Seed one stroke to author-then-edit against.
      model.addStroke(new StrokeModel(
        [{ x: 120, y: 200 }, { x: 240, y: 230 }, { x: 360, y: 210 }, { x: 420, y: 260 }],
        { color: '#0f766e', width: 4 }, { id: 'seed' },
      ));
      const wbHost = whiteboardHost(canvas, this.host().nativeElement);
      this.drawTool = createDrawTool(wbHost, { color: '#0f766e', width: 4 }) as never;
      registerTool(this.drawTool as never);
      this.editTool = createStrokeEditTool(wbHost, { active: false }) as never;
      registerTool(this.editTool as never);
      canvas.scheduleRender();
    }
    markReady();
  }
}
