import { AfterViewInit, Component, OnDestroy, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { registerTool } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** A node carries a rotation the renderer bakes into rotate(θ, cx, cy). Spin it
 *  with a real pointer drag wired through the public registerTool seam. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class RotatableNodeComponent implements AfterViewInit, OnDestroy {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [{ id: 'n', position: { x: 360, y: 150 }, size: { width: 200, height: 120 }, label: 'spin me' }];
  edges = [];
  private dispose?: () => void;

  ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      let grab: any = null;
      const center = (node: any) => ({
        x: node.position.x + node.size.width / 2,
        y: node.position.y + node.size.height / 2,
      });
      this.dispose = registerTool({
        id: 'demo-rotate',
        priority: 10,
        hitTest: (_e: any, hit: any) => !!hit.node,
        onPointerDown: (e: any, hit: any) => {
          const c = center(hit.node);
          grab = { node: hit.node, cx: c.x, cy: c.y, a0: Math.atan2(e.world.y - c.y, e.world.x - c.x), r0: hit.node.rotation };
        },
        onPointerMove: (e: any) => {
          if (!grab) return;
          const a = Math.atan2(e.world.y - grab.cy, e.world.x - grab.cx);
          grab.node.setRotation(grab.r0 + (a - grab.a0) * 180 / Math.PI);
        },
        onPointerUp: () => { grab = null; },
      } as any) as any;
    }
    markReady();
  }

  ngOnDestroy() { this.dispose?.(); }
}
