import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { importDiagram, isEditableArtifact } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Editable round-trip: the model rides INSIDE the exported file — an SVG
 *  <metadata> block. Re-open that file and you get an editable diagram back,
 *  not a flat picture. Pane A is the original; pane B is re-opened purely from
 *  pane A's exported bytes. */
const WHEN = '2020-01-01T00:00:00Z';

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      The model rides inside the exported file. Re-open it and you get an editable diagram back — {{ status }}
    </div>
    <div style="display:flex; height:calc(100vh - 45px)">
      <div style="flex:1; min-width:0; position:relative; border-right:2px solid rgba(127,127,127,.35)">
        <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">original</span>
        <grafloria-diagram-canvas #a [(nodes)]="nodesA" [(edges)]="edgesA" style="display:block; height:100%" />
      </div>
      <div style="flex:1; min-width:0; position:relative">
        <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">re-opened from the exported file</span>
        <grafloria-diagram-canvas #b [(nodes)]="nodesB" [(edges)]="edgesB" style="display:block; height:100%" />
      </div>
    </div>
  `,
})
export class EditableRoundTripComponent implements AfterViewInit {
  canvasA = viewChild.required<DiagramCanvasComponent>('a');
  nodesA = [
    { id: 'a', label: 'Author',  position: { x: 60,  y: 90 },  size: { width: 150, height: 66 } },
    { id: 'b', label: 'Review',  position: { x: 300, y: 90 },  size: { width: 150, height: 66 } },
    { id: 'c', label: 'Publish', position: { x: 300, y: 230 }, size: { width: 150, height: 66 } },
  ];
  edgesA = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];
  nodesB: unknown[] = [];
  edgesB: unknown[] = [];
  status = 'exporting…';

  async ngAfterViewInit() {
    try {
      const svg = await this.canvasA().exportDiagram('svg', { embedModel: true, embedModelCreatedAt: WHEN } as never);
      const editable = isEditableArtifact(svg);
      const model = importDiagram(svg) as any;
      if (model) {
        this.nodesB = model.getNodes().map((n: any) => ({
          id: n.id, label: n.getMetadata('label'),
          position: { x: n.position.x, y: n.position.y },
          size: { width: n.size.width, height: n.size.height },
        }));
        this.edgesB = model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId }));
        this.status = `re-opened ${model.getNodes().length} nodes from an ${editable ? 'editable' : 'unrecognised'} artifact.`;
      } else {
        this.status = 'the exported artifact carried no embedded model.';
      }
    } catch (e) {
      this.status = 'export failed: ' + (e as Error).message;
    }
    markReady();
  }
}
