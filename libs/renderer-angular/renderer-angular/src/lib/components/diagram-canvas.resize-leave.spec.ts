/**
 * A resize past the node's max size keeps the CLAMPED size — also when the pointer,
 * still going, leaves the canvas before the release. The Angular canvas CANCELLED
 * the gesture on mouseleave and snapped the node back to its start size; the JS
 * canvas commits what is on screen (one undo step).
 *
 * Docs review: size-and-transform-nodes, SE handle +200,+150 → 160×90 again on
 * release (the pointer ran off the bottom of the 400 px canvas); JS kept 240×120.
 */
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — a resize that leaves the canvas keeps its size', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness({ width: 1000, height: 400 });
    h.addNode({
      id: 'bounded', position: { x: 60, y: 170 }, size: { width: 160, height: 90 },
      metadata: { sizing: { minWidth: 100, minHeight: 60, maxWidth: 240, maxHeight: 120 } },
    } as never);
    h.mount();
    h.click(h.client(100, 200));
  });
  afterEach(() => h.destroy());

  function resizeSE(dx: number, dy: number, leave: boolean): void {
    const from = h.client(220, 260);
    h.hover(from);
    h.pointer('pointerdown', from);
    const n = Math.ceil(Math.hypot(dx, dy) / 50);
    for (let i = 1; i <= n; i++) {
      h.pointer('pointermove', { x: from.x + (dx * i) / n, y: from.y + (dy * i) / n });
      h.paint();
    }
    if (leave) h.canvas.onMouseLeave();
    h.pointer('pointerup', { x: from.x + dx, y: from.y + dy });
    h.paint();
  }

  it('past the max, released inside: clamped size kept (control)', async () => {
    resizeSE(200, 120, false);
    await settle();
    expect(h.diagram.getNode('bounded')!.size).toEqual({ width: 240, height: 120 });
  });

  it('past the max, pointer leaves the canvas before the release: clamped size kept, one undo', async () => {
    resizeSE(200, 150, true);
    await settle();
    expect(h.diagram.getNode('bounded')!.size).toEqual({ width: 240, height: 120 });
    await h.canvas.undo();
    expect(h.diagram.getNode('bounded')!.size).toEqual({ width: 160, height: 90 });
  });
});
