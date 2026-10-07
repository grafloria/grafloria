import { Component, OnDestroy } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import { registerStencils, bindShapeDataPanel, NodeFactory, type RenderSpec } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** T9/visio — Visio's "Shape Data" window. Every master ships a dataSchema and
 *  the values live on node.data. Select a shape and edit the fields its master
 *  declares — a framework-free property sheet (bindShapeDataPanel) driven by the
 *  template's dataSchema, writing through SetNodeDataCommand so every field edit
 *  is undoable (Ctrl/⌘+Z) and collab-safe. Click empty canvas to deselect; the
 *  panel follows the selection. */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  template: `
    <div style="display:flex; height:100vh; min-height:0">
      <div style="flex:1; min-width:0; position:relative">
        <grafloria-diagram [spec]="spec" (ready)="onReady($event, panel)" style="display:block; height:100%" />
      </div>
      <div id="sd-panel" #panel style="width:232px; flex:none"></div>
    </div>
  `,
})
export class ShapeDataComponent implements OnDestroy {
  spec: RenderSpec = { nodes: [], edges: [] };
  private handle?: ReturnType<typeof bindShapeDataPanel>;

  onReady(api: DiagramInstance, panel: HTMLElement) {
    const engine = api.getEngine() as any;
    // Masters carry the dataSchema the panel renders.
    registerStencils(engine.templateRegistry);
    const factory = new NodeFactory(engine.templateRegistry, api.getModel() as any);
    factory.createFromTemplate('flowchart-decision', { label: 'Approve?' }, { x: 220, y: 180 });
    factory.createFromTemplate('flowchart-process', { label: 'Pay' }, { x: 460, y: 180 });

    // The panel owns its element's inside.
    this.handle = bindShapeDataPanel(api as any, panel);

    api.renderNow();
    markReady();
  }

  ngOnDestroy() { this.handle?.destroy(); }
}
