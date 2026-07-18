// resize-ux — the RF-parity resize affordances (live audit, node-resize pages).
//
// The audit drove all eight handles with a real pointer and found the four SIDE
// handles unreachable: they were midpoint DOTS sitting exactly on the default
// side ports, so every press either missed the 6px dot or was claimed by the
// port. React Flow's side affordance is the whole EDGE LINE — grab the border
// anywhere and that edge follows — with the port keeping only its own glyph.
// These specs pin that contract:
//
//   1. side handles carry a SEGMENT spanning the full edge (rotated too);
//   2. hitTest treats the segment as a band — anywhere along the edge hits;
//   3. a corner dot still beats the two bands that end on it;
//   4. the touch path's slop applies to bands through hitTestResize;
//   5. resizeBox honours an aspect lock on EDGE handles (RF keepAspectRatio
//      resizes both axes from a line control; ours keeps the cross axis
//      centred so the box never drifts to one side);
//   6. the side-handle-yields-to-port rule is one shared predicate, so the
//      mouse ladder, the touch ladder and the hover cursor can never disagree.

import { DiagramEngine, NodeModel } from '@grafloria/engine';
import {
  SelectionToolsController,
  resizeBox,
  sideHandleYieldsToPort,
  type ToolHandle,
} from './selection-tools';

function scene(rotation = 0) {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('resize-ux')!;
  const node = new NodeModel({
    type: 'basic',
    position: { x: 100, y: 100 },
    size: { width: 200, height: 100 },
  });
  (node as unknown as { id: string }).id = 'n1';
  if (rotation) node.setRotation(rotation);
  diagram.addNode(node);
  diagram.selectNode(node);
  const tools = new SelectionToolsController({
    showHalo: false,
    showRotateHandle: false,
    showRemoveButton: false,
    showLinkTools: false,
  });
  return { engine, diagram, node, tools };
}

const byId = (handles: ToolHandle[], id: string) =>
  handles.find((h) => h.kind === 'resize' && h.handleId === id)!;

describe('SelectionToolsController — RF-parity side handles (resize-ux)', () => {
  it('side handles span the FULL edge as a segment; corners stay dots', () => {
    const { engine, tools } = scene();
    const layer = tools.computeLayer(engine, 1);

    const n = byId(layer.handles, 'n');
    expect(n.segment).toBeDefined();
    expect(n.segment!.a).toEqual({ x: 100, y: 100 });
    expect(n.segment!.b).toEqual({ x: 300, y: 100 });
    // The midpoint stays the nominal position (hosts that draw dots keep working).
    expect(n.world).toEqual({ x: 200, y: 100 });

    const e = byId(layer.handles, 'e');
    expect(e.segment!.a).toEqual({ x: 300, y: 100 });
    expect(e.segment!.b).toEqual({ x: 300, y: 200 });

    expect(byId(layer.handles, 'nw').segment).toBeUndefined();
    expect(byId(layer.handles, 'se').segment).toBeUndefined();
  });

  it('a rotated node rotates the segments with its corners', () => {
    const { engine, tools } = scene(90);
    const layer = tools.computeLayer(engine, 1);
    // 90° about the centre (200,150): the unrotated N edge (100,100)-(300,100)
    // maps to (250,50)-(250,250).
    const n = byId(layer.handles, 'n');
    expect(n.segment!.a.x).toBeCloseTo(250);
    expect(n.segment!.a.y).toBeCloseTo(50);
    expect(n.segment!.b.x).toBeCloseTo(250);
    expect(n.segment!.b.y).toBeCloseTo(250);
  });

  it('hitTest hits a side handle ANYWHERE along its edge, not just the midpoint', () => {
    const { engine, tools } = scene();
    const layer = tools.computeLayer(engine, 1);

    // 25% along the top edge, 2 world units above it — inside the band
    // (hitRadius = 8/2 + 2 = 6 at zoom 1), nowhere near the midpoint dot.
    expect(tools.hitTest(layer, 150, 98)?.handleId).toBe('n');
    // …and along the bottom and left edges too.
    expect(tools.hitTest(layer, 260, 201)?.handleId).toBe('s');
    expect(tools.hitTest(layer, 99, 130)?.handleId).toBe('w');
    // Well off the band → no handle.
    expect(tools.hitTest(layer, 150, 88)).toBeNull();
  });

  it('a corner dot beats the two edge bands that end on it', () => {
    const { engine, tools } = scene();
    const layer = tools.computeLayer(engine, 1);
    expect(tools.hitTest(layer, 100, 100)?.handleId).toBe('nw');
    expect(tools.hitTest(layer, 300, 200)?.handleId).toBe('se');
  });

  it('hitTestResize applies touch slop to bands and dots alike', () => {
    const { engine, tools } = scene();
    const layer = tools.computeLayer(engine, 1);
    // 10 world units above the top edge: outside the 6px band, inside band+8 slop.
    expect(tools.hitTestResize(layer, 150, 90, 8)?.handleId).toBe('n');
    expect(tools.hitTestResize(layer, 150, 90, 0)).toBeNull();
  });

  describe('resizeBox — aspect lock on EDGE handles (RF keepAspectRatio parity)', () => {
    const start = { x: 0, y: 0, width: 200, height: 100 };

    it('an E drag with a locked ratio grows BOTH axes, cross axis centred', () => {
      const box = resizeBox(start, 'e', 40, 0, { aspect: 2 });
      expect(box.width).toBeCloseTo(240);
      expect(box.height).toBeCloseTo(120);
      // The dragged edge follows; the opposite edge stays; the cross axis is
      // centred so the box does not drift up or down.
      expect(box.x).toBeCloseTo(0);
      expect(box.y).toBeCloseTo(-10);
    });

    it('an S drag with a locked ratio derives width from height', () => {
      const box = resizeBox(start, 's', 0, 50, { aspect: 2 });
      expect(box.height).toBeCloseTo(150);
      expect(box.width).toBeCloseTo(300);
      expect(box.y).toBeCloseTo(0);
      expect(box.x).toBeCloseTo(-50); // centred: grew 100, half each side
    });

    it('the cross axis clamp re-derives the dragged axis (ratio never breaks)', () => {
      const box = resizeBox(start, 'e', 200, 0, { aspect: 2, maxHeight: 120 });
      expect(box.height).toBeCloseTo(120);
      expect(box.width).toBeCloseTo(240); // held to ratio, not to the pointer
    });

    it('without a lock an edge drag still moves ONE axis (unchanged behaviour)', () => {
      const box = resizeBox(start, 'e', 40, 0, {});
      expect(box.width).toBeCloseTo(240);
      expect(box.height).toBeCloseTo(100);
      expect(box.y).toBeCloseTo(0);
    });
  });

  describe('sideHandleYieldsToPort — the ONE port-priority predicate', () => {
    const handle = (id: string): ToolHandle =>
      ({ id: `resize-${id}`, kind: 'resize', handleId: id, nodeId: 'n1', world: { x: 0, y: 0 }, hitRadius: 6, cursor: '', label: '' }) as ToolHandle;

    it('a SIDE handle yields to a hovered port of the SAME node', () => {
      expect(sideHandleYieldsToPort(handle('e'), { nodeId: 'n1' })).toBe(true);
      expect(sideHandleYieldsToPort(handle('n'), { nodeId: 'n1' })).toBe(true);
    });

    it('corners never yield; other nodes’ ports never claim; no port, no claim', () => {
      expect(sideHandleYieldsToPort(handle('se'), { nodeId: 'n1' })).toBe(false);
      expect(sideHandleYieldsToPort(handle('e'), { nodeId: 'other' })).toBe(false);
      expect(sideHandleYieldsToPort(handle('e'), null)).toBe(false);
      expect(sideHandleYieldsToPort(handle('e'), undefined)).toBe(false);
    });
  });
});
