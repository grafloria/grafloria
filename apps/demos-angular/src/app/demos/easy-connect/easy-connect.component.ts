import { AfterViewInit, Component, OnDestroy, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { registerTool, SnapController } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** Easy Connect: the WHOLE node body is a connection handle. Press anywhere on
 *  one node, release anywhere on another, and they wire up — wired through the
 *  public registerTool seam, committing with the shipped link command. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class EasyConnectComponent implements AfterViewInit, OnDestroy {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
    { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
  ];
  edges = [];
  private dispose?: () => void;

  ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    const model = engine?.getDiagram() as any;
    if (engine && model) {
      const eng = engine as any;
      const snap = new SnapController();
      let src: any = null;
      this.dispose = registerTool({
        id: 'demo-easy-connect',
        priority: 10,
        hitTest: (_e: any, hit: any) => !!hit.node,
        onPointerDown: (_e: any, hit: any) => { src = hit.node; },
        onPointerUp: (e: any) => {
          if (!src) return;
          const tgt = model.getNodeAtPosition(e.world.x, e.world.y);
          if (tgt && tgt.id !== src.id) {
            const candidate = {
              sourcePort: src.getPortBySide('right') ?? src.getPorts()[0],
              targetPort: tgt.getPortBySide('left') ?? tgt.getPorts()[0],
              sourceNodeId: src.id, targetNodeId: tgt.id, distance: 0,
            };
            eng.commandManager.execute(snap.buildProximityLinkCommand(candidate));
          }
          src = null;
        },
        onCancel: () => { src = null; },
      } as any) as any;
    }
    markReady();
  }

  ngOnDestroy() { this.dispose?.(); }
}
