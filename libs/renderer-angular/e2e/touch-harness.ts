// wave14/ng-touch — the Angular host's touch harness.
//
// Bootstraps the REAL DiagramCanvasComponent (standalone, JIT-compiled) in a
// REAL Chromium page so touch-run.mjs can drive REAL touch input at it through
// CDP `Input.dispatchTouchEvent`. This proves what the jsdom half
// (diagram-canvas.touch.spec.ts) cannot:
//
//  - `touch-action: none` actually reaches the container and the browser
//    actually delivers pointermove mid-gesture (jsdom has no touch-action);
//  - the compat-mouse dedupe holds against the browser's OWN synthesized
//    mouse events after a tap (jsdom never synthesizes them);
//  - a pinch is two genuinely concurrent touch points (jsdom has neither
//    PointerEvent nor multi-touch).
//
// The harness synthesizes NO events itself — everything arrives through the
// browser's own input pipeline, which is the entire question.

// JIT: the component ships with decorators + external templateUrl (inlined by
// the esbuild plugin in touch-run.mjs); @angular/compiler must be present
// before bootstrap compiles it. zone.js gives bootstrapApplication its default
// change-detection scheduler.
import '@angular/compiler';
import 'zone.js';

import { Component, ViewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

// NOTE: the runner emits every lib .ts through Angular's own
// `angularJitApplicationTransform` (see touch-run.mjs). That is what makes the
// signal-based `input()`/`model()` members visible to the JIT compiler
// (without it: NG0303 "Can't bind to 'engine'", and the component mounts with
// NO engine — every gesture silently no-ops) and what downlevels constructor
// DI parameters into static `ctorParameters` (esbuild emits no
// design:paramtypes metadata).
import { DiagramCanvasComponent } from '../renderer-angular/src/lib/components/diagram-canvas.component';

// ---------------------------------------------------------------------------
// The diagram: two 160×80 nodes far apart plus one link — the same stage the
// renderer's own touch harness uses (160×80, NOT smaller: default ports sit on
// the node edges and the 16px touch hit slop must not swallow a centre tap).
// ---------------------------------------------------------------------------
const engine = new DiagramEngine();
const diagram = engine.createDiagram('ng-touch-e2e');

const mk = (id: string, x: number, y: number) => {
  const n = new NodeModel({
    id,
    type: 'process',
    position: { x, y },
    size: { width: 160, height: 80 },
  });
  n.setMetadata('label', id);
  diagram.addNode(n);
  return n;
};

const a = mk('A', 120, 120);
const b = mk('B', 520, 320);
diagram.connectNodes(a, b);

const START = {
  a: { x: 120, y: 120 },
  b: { x: 520, y: 320 },
  viewport: { x: 0, y: 0, width: 800, height: 600 },
};

@Component({
  selector: 'harness-root',
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div class="stage">
      <grafloria-diagram-canvas [engine]="engine" />
    </div>
  `,
  styles: [
    `
      .stage {
        width: 1000px;
        height: 700px;
        border: 1px solid #cbd5e1;
        position: relative;
      }
    `,
  ],
})
class HarnessRoot {
  engine = engine;
  @ViewChild(DiagramCanvasComponent, { static: true }) canvas!: DiagramCanvasComponent;
}

bootstrapApplication(HarnessRoot)
  .then((appRef) => {
    const root = appRef.components[0].instance as HarnessRoot;
    const canvas = root.canvas;
    const container = document.querySelector('.diagram-canvas-container') as HTMLElement;

    // COMPAT-DEDUPE PROBE: count every time the mouse LADDER actually runs.
    // After a touch tap, the browser synthesizes mousedown/mouseup — if either
    // the preventDefault suppression or the sawPointerEvent gate is broken, the
    // ladder runs a second time for the same tap and this counter goes up.
    let ladderMousedowns = 0;
    const originalOnMouseDown = canvas.onMouseDown.bind(canvas);
    canvas.onMouseDown = (event: MouseEvent) => {
      ladderMousedowns++;
      return originalOnMouseDown(event);
    };

    (window as never as Record<string, unknown>)['__ngtouch'] = {
      state() {
        return {
          zoom: canvas.zoom(),
          viewport: { ...canvas.viewport() },
          a: { ...diagram.getNode('A')!.position },
          b: { ...diagram.getNode('B')!.position },
          aSize: { ...diagram.getNode('A')!.size },
          selected: diagram.getSelectedNodes().map((n) => n.id),
          links: diagram.getLinks().length,
          ladderMousedowns,
        };
      },

      /** Computed touch-action on the container — the line everything stands on. */
      touchAction() {
        return getComputedStyle(container).touchAction;
      },

      /** The CONTROL's lever: hand the gestures back to the browser. */
      setTouchAction(value: string) {
        container.style.touchAction = value;
      },

      /** Client coords of a node's centre, THROUGH the component's own maths. */
      nodeCenterClient(id: string) {
        const node = diagram.getNode(id)!;
        const rect = container.getBoundingClientRect();
        const s = canvas.worldToScreen(
          node.position.x + node.size.width / 2,
          node.position.y + node.size.height / 2
        );
        return { x: s.screenX + rect.left, y: s.screenY + rect.top };
      },

      /** Client coords of a node's SE corner (where the resize handle sits). */
      nodeSECornerClient(id: string) {
        const node = diagram.getNode(id)!;
        const rect = container.getBoundingClientRect();
        const s = canvas.worldToScreen(
          node.position.x + node.size.width,
          node.position.y + node.size.height
        );
        return { x: s.screenX + rect.left, y: s.screenY + rect.top };
      },

      /** World point under a client point — for the pinch-anchor assertion. */
      clientToWorld(x: number, y: number) {
        const w = (canvas as unknown as {
          clientToWorld(cx: number, cy: number): { worldX: number; worldY: number };
        }).clientToWorld(x, y);
        return { x: w.worldX, y: w.worldY };
      },

      /** Reset the stage between scenarios. */
      reset() {
        diagram.getNode('A')!.setPosition(START.a.x, START.a.y);
        diagram.getNode('B')!.setPosition(START.b.x, START.b.y);
        diagram.getNode('A')!.setSize(160, 80);
        diagram.clearSelection();
        diagram.getLinks().forEach((l) => {
          if (l.state === 'selected') l.setState('default');
        });
        canvas.viewport.set({ ...START.viewport });
        canvas.zoom.set(1);
        diagram.setZoom(1);
        ladderMousedowns = 0;
        canvas.scheduleRender();
      },
    };

    (window as never as Record<string, unknown>)['__DONE__'] = true;
  })
  .catch((error) => {
    console.error('bootstrap failed', error);
    (window as never as Record<string, unknown>)['__BOOT_ERROR__'] = String(error);
  });
