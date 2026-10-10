/**
 * On a SELECTED node, a drag that starts on one of its side ports draws a wire —
 * it must not resize the node, even though the side resize handles share that
 * border. The JS canvas resolves this with `sideHandleYieldsToPort`: the port wins
 * its own grab radius, the side band wins the rest of the edge.
 *
 * The docs review (Angular quick start): click Ingest, drag from its bottom port to
 * Publish → the node's height went 80 → 41.5 and no edge was created.
 */
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — a port on a selected node beats the side resize handle', () => {
  let h: CanvasHarness;

  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
  });
  afterEach(() => h.destroy());

  function setup() {
    const a = h.addNode({ id: 'a', position: { x: 60, y: 80 }, label: 'Ingest' });
    const b = h.addNode({ id: 'b', position: { x: 380, y: 80 }, label: 'Publish' });
    h.mount();
    // Select Ingest with one click, like the reader did.
    h.click(h.client(60 + 50, 80 + 40));
    expect(a.isSelected()).toBe(true);
    return { a, b };
  }

  it('dragging from the bottom port of the selected node connects, and leaves its size alone', async () => {
    const { a, b } = setup();
    const linksBefore = h.diagram.getLinks().length;

    h.drag(h.client(60 + 90, 80 + 80), h.client(380 + 90, 80 + 80)); // onto Publish's bottom port
    await settle();

    expect(a.size).toEqual({ width: 180, height: 80 });
    expect(h.diagram.getLinks().length).toBe(linksBefore + 1);
    const link = h.diagram.getLinks().at(-1)!;
    expect(link.sourceNodeId).toBe('a');
    expect(b.size).toEqual({ width: 180, height: 80 });
  });

  it('dragging from the right port of the selected node connects too', async () => {
    const { a } = setup();
    const linksBefore = h.diagram.getLinks().length;

    h.drag(h.client(60 + 180, 80 + 40), h.client(380, 80 + 40)); // onto Publish's left port
    await settle();

    expect(a.size).toEqual({ width: 180, height: 80 });
    expect(h.diagram.getLinks().length).toBe(linksBefore + 1);
  });

  it('control: the border away from the port still resizes', async () => {
    const { a } = setup();
    // Bottom edge, well left of the bottom port's grab radius.
    h.drag(h.client(60 + 30, 80 + 80), h.client(60 + 30, 80 + 140));
    await settle();
    expect(a.size.height).toBeGreaterThan(120);
  });

  it('the side handles are drawn as edge lines, not as dots sitting on the ports', () => {
    setup();
    h.fixture.detectChanges();
    const el = h.fixture.nativeElement as HTMLElement;
    const dots = Array.from(el.querySelectorAll('.grafloria-tool-resize')).map((d) => d.getAttribute('data-tool'));
    expect(dots.sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    const lines = Array.from(el.querySelectorAll('.grafloria-tool-resize-edge')).map((d) => d.getAttribute('data-tool'));
    expect(lines.sort()).toEqual(['e', 'n', 's', 'w']);
  });

  it('the halo toolbar and the remove button keep clear of the right port and the NE corner', () => {
    setup();
    const layer = h.canvas.toolLayer;
    const right = 60 + 180;
    const portGrab = 9; // a side port's hover radius (6 × 1.5)
    for (const handle of layer.handles.filter((t) => t.kind === 'halo')) {
      expect(handle.world.x - handle.hitRadius).toBeGreaterThan(right + portGrab + 4);
    }
    const remove = layer.handles.find((t) => t.kind === 'remove')!;
    expect(Math.hypot(remove.world.x - right, remove.world.y - 80)).toBeGreaterThan(remove.hitRadius);
  });
});
