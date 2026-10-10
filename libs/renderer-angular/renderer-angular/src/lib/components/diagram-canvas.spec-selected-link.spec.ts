/**
 * A link selected through its spec (`selected: true`) can be reconnected by its
 * endpoint handle straight away — the handles are drawn, so they must work. The
 * docs review: the drag did nothing until the link had been clicked once.
 *
 * The cause was not the link's state: with a NODE also selected (the sample's A
 * is `selected: true`) the press on the endpoint — drawn ON the target port —
 * was taken by the port rung, which started a new connection from B's port. The
 * JS canvas gives that press to the endpoint (`reconnectableEndpointAt`).
 */
import { applyEdges } from '@grafloria/renderer';
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — a spec-selected link reconnects by its handle', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
    h.addNode({ id: 'a', position: { x: 60, y: 180 }, size: { width: 120, height: 60 }, selected: true } as never);
    h.addNode({ id: 'b', position: { x: 540, y: 80 }, size: { width: 120, height: 60 } });
    h.addNode({ id: 'c', position: { x: 540, y: 320 }, size: { width: 120, height: 60 } });
    applyEdges(h.diagram, [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', type: 'direct', waypoints: [{ x: 350, y: 210 }], selected: true },
    ]);
    h.engine.setInteractionConfig({ enableLinkReconnection: true, showLinkEndpointHandles: true } as never);
    h.mount();
  });
  afterEach(() => h.destroy());

  it('dragging the target handle onto C reconnects the link — no click first', async () => {
    const link = h.diagram.getLink('e1')!;
    expect(link.state).toBe('selected');
    const end = link.points[link.points.length - 1]!;
    expect(h.diagram.getNode('a')!.isSelected()).toBe(true);
    // Onto C's left edge, where its left port sits (a body drop is refused, as in JS).
    h.drag(h.client(end.x, end.y), h.client(542, 350), 40);
    await settle();
    expect(h.diagram.getLinks()).toHaveLength(1);
    expect(h.diagram.getLink('e1')!.targetNodeId).toBe('c');
  });
});
