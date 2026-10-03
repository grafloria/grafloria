import { Component, OnDestroy } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import { registerStencils, bindStencilPalette, type RenderSpec } from '@grafloria/element';
import { registerNotationShapes, type DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** Stencil palette (Visio-style): drag a shape out of a categorized stencil
 *  palette and drop it on the canvas — 80 BPMN / flowchart / UML / ERD
 *  masters, searchable, each thumbnail drawn from the shape's own outline
 *  geometry. A drop lands centred on the cursor as ONE undoable command
 *  (Ctrl/⌘+Z takes the whole shape back); section headers collapse. */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  // The two-pane authoring frame: palette rail + canvas.
  template: `
    <div style="display:flex; height:100vh; min-height:0">
      <div id="stencil-rail" #rail style="width:232px; flex:none"></div>
      <div id="stencil-canvas" #canvas style="flex:1; min-width:0; position:relative">
        <grafloria-diagram [spec]="spec" (ready)="onReady($event, rail, canvas)" style="display:block; height:100%" />
      </div>
    </div>
  `,
})
export class StencilPaletteComponent implements OnDestroy {
  spec: RenderSpec = { nodes: [], edges: [] };
  private handle?: ReturnType<typeof bindStencilPalette>;

  onReady(api: DiagramInstance, rail: HTMLElement, canvas: HTMLElement) {
    // The notation silhouettes (Delay, Display, OR, summing junction, …) are
    // registered by the renderer's entry file as a side effect, and this app's
    // build drops that call (it imports src/index.ts; package.json's sideEffects
    // names only src/index.js) — so they would draw as plain rectangles here,
    // in the palette and on the canvas. Registering again is a no-op elsewhere.
    registerNotationShapes();

    // Every built-in master behind engine.templateRegistry, so NodeFactory can
    // stamp any of them by id.
    registerStencils((api.getEngine() as any).templateRegistry);

    // The palette itself: sections from listStencils(), drops onto the canvas.
    // It owns the rail's inside.
    this.handle = bindStencilPalette(api as any, { palette: rail, canvas }, {
      data: (master: any) => ({ label: master.meta?.name ?? master.id }),
    });
    markReady();
  }

  ngOnDestroy() { this.handle?.destroy(); }
}
