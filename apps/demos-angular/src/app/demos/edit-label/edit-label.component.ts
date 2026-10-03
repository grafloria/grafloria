import { Component } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** Double-click a node and type — the label edits in place, commits on Enter
 *  or blur as ONE undoable step (Ctrl/⌘+Z brings the old label back), and
 *  Escape abandons the edit. The renderer's binder opens the editor itself,
 *  positioned through the live world→screen map, so it lands on the label at
 *  any zoom or pan. Hosted by <grafloria-diagram> — the same render() instance
 *  the JS page drives, not the Angular canvas's own editor. */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  template: `<grafloria-diagram [spec]="spec" (ready)="onReady($event)" style="display:block; height:100vh" />`,
})
export class EditLabelComponent {
  spec = {
    nodes: [
      { id: 'a', position: { x: 260, y: 200 }, size: { width: 150, height: 60 }, label: 'draft' },
      { id: 'b', position: { x: 520, y: 200 }, size: { width: 150, height: 60 }, label: 'review' },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  };

  onReady(api: DiagramInstance) {
    // The gesture under test — opt-in, so a host with its own editor keeps control.
    api.getEngine().setInteractionConfig({ enableInPlaceTextEdit: true });
    api.renderNow();
    markReady();
  }
}
