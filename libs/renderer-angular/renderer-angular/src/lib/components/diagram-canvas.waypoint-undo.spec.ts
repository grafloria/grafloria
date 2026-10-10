/**
 * Inserting a bend and dragging a bend are undo steps — two separate ones — as in
 * the JS canvas. The Angular canvas ended the bend gesture without its engine,
 * so neither reached the history: three ⌘Z presses changed nothing.
 */
import { applyEdges } from '@grafloria/renderer';
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — bend insert and drag are undo steps', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
    h.addNode({ id: 'a', position: { x: 60, y: 180 }, size: { width: 120, height: 60 } });
    h.addNode({ id: 'b', position: { x: 540, y: 80 }, size: { width: 120, height: 60 } });
    applyEdges(h.diagram, [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', type: 'direct', waypoints: [{ x: 350, y: 210 }], selected: true },
    ]);
    h.engine.setInteractionConfig({ enableWaypointEditing: true, showWaypointHandles: true } as never);
    h.mount();
  });
  afterEach(() => h.destroy());

  const pts = () => h.diagram.getLink('e1')!.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

  it('click the path → a bend; drag it → moved; ⌘Z undoes the drag, ⌘Z again the insert', async () => {
    const start = pts();
    // A point on the second segment (350,210) → (540,110), away from both ends.
    const ins = { x: 465.1, y: 149.4 }; // where the docs review clicked: not the segment midpoint
    h.click(h.client(ins.x, ins.y));
    await settle();
    const inserted = pts();
    expect(inserted).not.toBe(start);
    expect(h.diagram.getLink('e1')!.points.length).toBe(start.split(' ').length + 1);

    h.drag(h.client(ins.x, ins.y), h.client(ins.x, ins.y + 90));
    await settle();
    const dragged = pts();
    expect(dragged).not.toBe(inserted);

    await h.canvas.undo();
    expect(pts()).toBe(inserted);
    await h.canvas.undo();
    expect(pts()).toBe(start);
  });
});
