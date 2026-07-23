import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { BroadcastChannelTransport } from '@grafloria/engine';
import { markReady } from '../demo-ready';

/** Real multiplayer with no server: two canvases in one page, each joined to
 *  the same room over BroadcastChannel via [collab]. Drag a node on the left —
 *  the right converges through the engine's per-property CRDT, with presence
 *  cursors painted for the remote actor. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  templateUrl: './two-tabs-live.component.html',
})
export class TwoTabsLiveComponent implements AfterViewInit {
  private room = 'ng-collab-' + Math.random().toString(36).slice(2, 8);
  nodesA = [
    { id: 'a', position: { x: 60, y: 60 },  size: { width: 150, height: 66 }, data: { label: 'Ingest' } },
    { id: 'b', position: { x: 320, y: 60 }, size: { width: 150, height: 66 }, data: { label: 'Publish' } },
  ];
  edgesA = [{ id: 'e1', source: 'a', target: 'b' }];
  nodesB = structuredClone(this.nodesA);
  edgesB = structuredClone(this.edgesA);
  collabA = { transport: new BroadcastChannelTransport({ name: this.room, actor: 'ana' }), actor: 'ana', presence: { name: 'Ana' } };
  collabB = { transport: new BroadcastChannelTransport({ name: this.room, actor: 'ben' }), actor: 'ben', presence: { name: 'Ben' } };
  ngAfterViewInit() { markReady(); }
}
