/**
 * Wave 4 — Card 5: the floating tool layer (resize / rotate handles, Halo,
 * link endpoint + vertex tools).
 *
 * Every test constructs the controller with a PLAIN `new` — no Angular, no DOM.
 * The commands it returns are executed on the engine's real CommandManager, so
 * "is it undoable?" is answered by actually undoing it.
 */
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  MacroCommand,
  ResizeNodeCommand,
  RotateNodeCommand,
  SetLinkPointsCommand,
} from '@grafloria/engine';
import {
  SelectionToolsController,
  resizeBox,
  applyResizeToNode,
  angleAt,
  snapAngle,
  rotatePoint,
  RESIZE_HANDLE_IDS,
} from './selection-tools';

describe('Card 5 — SelectionToolsController', () => {
  let tools: SelectionToolsController;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    tools = new SelectionToolsController();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-tools');
  });

  afterEach(() => engine.destroy());

  function addNode(x: number, y: number, width = 100, height = 50): NodeModel {
    const node = new NodeModel({
      type: 'test',
      position: { x, y },
      size: { width, height, depth: 0 },
    });
    diagram.addNode(node);
    return node;
  }

  function linkBetween(a: NodeModel, b: NodeModel): LinkModel {
    const source = a.getPortBySide('right')!;
    const target = b.getPortBySide('left')!;
    const link = new LinkModel(source.id, target.id);
    link.setSourcePort(source.id, a.id);
    link.setTargetPort(target.id, b.id);
    link.setPoints([
      { x: a.position.x + 100, y: a.position.y + 25 },
      { x: b.position.x, y: b.position.y + 25 },
    ]);
    diagram.addLink(link);
    return link;
  }

  // ==========================================================================
  // The layer
  // ==========================================================================

  describe('computeLayer', () => {
    test('is empty when nothing is selected', () => {
      addNode(0, 0);
      const layer = tools.computeLayer(engine);
      expect(layer.bounds).toBeNull();
      expect(layer.handles).toHaveLength(0);
    });

    test('emits 8 resize handles at the corners and edge midpoints', () => {
      const node = addNode(100, 200, 100, 50);
      diagram.selectNode(node);

      const layer = tools.computeLayer(engine);
      const resize = layer.handles.filter((h) => h.kind === 'resize');
      expect(resize).toHaveLength(8);
      expect(resize.map((h) => h.handleId).sort()).toEqual([...RESIZE_HANDLE_IDS].sort());

      const nw = resize.find((h) => h.handleId === 'nw')!;
      const se = resize.find((h) => h.handleId === 'se')!;
      const n = resize.find((h) => h.handleId === 'n')!;
      expect(nw.world).toEqual({ x: 100, y: 200 });
      expect(se.world).toEqual({ x: 200, y: 250 });
      expect(n.world).toEqual({ x: 150, y: 200 });
    });

    test('handles keep a CONSTANT SCREEN size: their world hit radius scales with 1/zoom', () => {
      const node = addNode(0, 0);
      diagram.selectNode(node);

      const at1 = tools.computeLayer(engine, 1).handles.find((h) => h.kind === 'resize')!;
      const at2 = tools.computeLayer(engine, 2).handles.find((h) => h.kind === 'resize')!;
      expect(at2.hitRadius).toBeCloseTo(at1.hitRadius / 2, 6);
    });

    test('rotate handle only appears for a rotatable node, above the top edge', () => {
      const node = addNode(0, 0, 100, 50);
      diagram.selectNode(node);

      expect(tools.computeLayer(engine).handles.some((h) => h.kind === 'rotate')).toBe(false);

      node.behavior.rotatable = true;
      const rotate = tools.computeLayer(engine).handles.find((h) => h.kind === 'rotate')!;
      expect(rotate).toBeDefined();
      expect(rotate.world.x).toBe(50); // centred
      expect(rotate.world.y).toBeLessThan(0); // above the box
    });

    test('resize handles are suppressed for a non-resizable or locked node', () => {
      const node = addNode(0, 0);
      diagram.selectNode(node);

      node.behavior.resizable = false;
      expect(tools.computeLayer(engine).handles.some((h) => h.kind === 'resize')).toBe(false);

      node.behavior.resizable = true;
      node.setState({ locked: true });
      expect(tools.computeLayer(engine).handles.some((h) => h.kind === 'resize')).toBe(false);
    });

    test('a rotated node ROTATES its handles about the box centre', () => {
      const node = addNode(0, 0, 100, 50);
      node.setRotation(90);
      diagram.selectNode(node);

      const nw = tools.computeLayer(engine).handles.find((h) => h.handleId === 'nw')!;

      // The NW corner (0,0) rotated 90° about the centre (50,25).
      const expected = rotatePoint({ x: 0, y: 0 }, { x: 50, y: 25 }, 90);
      expect(nw.world.x).toBeCloseTo(expected.x, 6);
      expect(nw.world.y).toBeCloseTo(expected.y, 6);
    });

    test('Halo emits connect/clone/fork/delete for a single node', () => {
      const node = addNode(0, 0);
      diagram.selectNode(node);

      const halo = tools.computeLayer(engine).handles.filter((h) => h.kind === 'halo');
      expect(halo.map((h) => h.action)).toEqual(['connect', 'clone', 'fork', 'delete']);
    });

    test('multi-select: bounding frame + halo delete, but no resize/rotate (scoped out)', () => {
      const a = addNode(0, 0, 100, 50);
      const b = addNode(300, 100, 100, 50);
      diagram.selectNode(a);
      diagram.toggleNodeSelection(b);

      const layer = tools.computeLayer(engine);
      expect(layer.nodeIds).toHaveLength(2);
      expect(layer.bounds).toEqual({ x: 0, y: 0, width: 400, height: 150 });
      expect(layer.handles.some((h) => h.kind === 'resize')).toBe(false);
      expect(layer.handles.filter((h) => h.kind === 'halo').map((h) => h.action)).toEqual([
        'clone',
        'delete',
      ]);
    });

    test('a selected LINK gets endpoint anchors, add-vertex tools and a remove button', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = linkBetween(a, b);
      link.setState('selected');

      const layer = tools.computeLayer(engine);
      const endpoints = layer.handles.filter((h) => h.kind === 'link-endpoint');
      expect(endpoints.map((h) => h.endpoint)).toEqual(['source', 'target']);
      expect(endpoints[0]!.world).toEqual({ x: 100, y: 25 });

      // 2 points → 1 segment → 1 add-vertex tool at its midpoint, no vertex to remove.
      const adds = layer.handles.filter((h) => h.kind === 'vertex-add');
      expect(adds).toHaveLength(1);
      expect(adds[0]!.world).toEqual({ x: 200, y: 25 });
      expect(layer.handles.some((h) => h.kind === 'vertex-remove')).toBe(false);
      expect(layer.handles.some((h) => h.kind === 'remove')).toBe(true);
    });

    test('interior vertices get remove tools', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = linkBetween(a, b);
      link.setPoints([
        { x: 100, y: 25 },
        { x: 200, y: 100 },
        { x: 300, y: 25 },
      ]);
      link.setState('selected');

      const removes = tools.computeLayer(engine).handles.filter((h) => h.kind === 'vertex-remove');
      expect(removes).toHaveLength(1);
      expect(removes[0]!.index).toBe(1);
      expect(removes[0]!.world).toEqual({ x: 200, y: 100 });
    });
  });

  describe('hitTest', () => {
    test('finds the handle under a world point, and nothing outside its radius', () => {
      const node = addNode(0, 0, 100, 50);
      diagram.selectNode(node);
      const layer = tools.computeLayer(engine);

      const hit = tools.hitTest(layer, 100, 50); // the SE corner
      expect(hit?.kind).toBe('resize');
      expect(hit?.handleId).toBe('se');

      expect(tools.hitTest(layer, 50, 25)).toBeNull(); // dead centre of the node
    });
  });

  // ==========================================================================
  // Resize maths
  // ==========================================================================

  describe('resizeBox (pure)', () => {
    const start = { x: 0, y: 0, width: 100, height: 50 };

    test('SE grows both axes; NW moves the origin and shrinks', () => {
      expect(resizeBox(start, 'se', 20, 10)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
      expect(resizeBox(start, 'nw', 20, 10)).toEqual({ x: 20, y: 10, width: 80, height: 40 });
    });

    test('edge handles only move their own axis', () => {
      expect(resizeBox(start, 'e', 20, 999)).toEqual({ x: 0, y: 0, width: 120, height: 50 });
      expect(resizeBox(start, 'n', 999, -10)).toEqual({ x: 0, y: -10, width: 100, height: 60 });
    });

    test('the anchored edge NEVER moves, even on a runaway drag past the minimum', () => {
      const box = resizeBox(start, 'nw', 500, 500, { minWidth: 16, minHeight: 16 });
      expect(box.x + box.width).toBe(100); // right edge held
      expect(box.y + box.height).toBe(50); // bottom edge held
      expect(box.width).toBe(16);
      expect(box.height).toBe(16);
    });

    test('keepAspect locks the ratio on corners AND edges (RF keepAspectRatio parity)', () => {
      const box = resizeBox(start, 'se', 100, 0, { keepAspect: true });
      expect(box.width / box.height).toBeCloseTo(100 / 50, 6);

      // resize-ux CONTRACT CHANGE: React Flow's keepAspectRatio applies to its
      // line controls too, so an edge drag now scales both axes (cross axis
      // centred — see selection-tools.resize-ux.spec.ts for the full pin).
      const edge = resizeBox(start, 'e', 100, 0, { keepAspect: true });
      expect(edge.width / edge.height).toBeCloseTo(100 / 50, 6);
      expect(edge.width).toBe(200); // dragged edge still follows the pointer
    });
  });

  describe('applyResizeToNode (rotation-aware)', () => {
    test('unrotated: position + size follow the box directly', () => {
      const next = applyResizeToNode(
        { position: { x: 10, y: 20 }, size: { width: 100, height: 50 }, rotation: 0 },
        'nw',
        10,
        10
      );
      expect(next.position).toEqual({ x: 20, y: 30 });
      expect(next.size).toEqual({ width: 90, height: 40 });
    });

    test('rotated 90°: the drag is applied in the node LOCAL frame', () => {
      // At 90° the world +x direction is the node's local −y.
      const next = applyResizeToNode(
        { position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, rotation: 90 },
        'se',
        20,
        0
      );
      // Local dy = -20 ⇒ 'se' shrinks the height by 20 (width untouched: local dx = 0).
      expect(next.size.width).toBeCloseTo(100, 6);
      expect(next.size.height).toBeCloseTo(30, 6);
    });

    test('rotated resize keeps the ANCHORED corner visually still', () => {
      const start = { position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, rotation: 30 };
      const startCenter = { x: 50, y: 25 };
      // The NW corner is anchored when the SE handle is dragged.
      const anchorBefore = rotatePoint({ x: 0, y: 0 }, startCenter, 30);

      const next = applyResizeToNode(start, 'se', 15, 25);
      const newCenter = {
        x: next.position.x + next.size.width / 2,
        y: next.position.y + next.size.height / 2,
      };
      const anchorAfter = rotatePoint(next.position, newCenter, 30);

      expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
      expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 6);
    });
  });

  describe('rotation maths', () => {
    test('angleAt is 0° north and grows clockwise', () => {
      const c = { x: 0, y: 0 };
      expect(angleAt(c, { x: 0, y: -10 })).toBeCloseTo(0, 6);
      expect(angleAt(c, { x: 10, y: 0 })).toBeCloseTo(90, 6);
      expect(angleAt(c, { x: 0, y: 10 })).toBeCloseTo(180, 6);
      expect(angleAt(c, { x: -10, y: 0 })).toBeCloseTo(270, 6);
    });

    test('snapAngle quantises and normalises', () => {
      expect(snapAngle(43, 15)).toBe(45);
      expect(snapAngle(-10, 15)).toBe(345);
      expect(snapAngle(43, 0)).toBe(43);
    });
  });

  // ==========================================================================
  // Gestures → undoable commands
  // ==========================================================================

  describe('resize gesture', () => {
    test('drag mutates the model live, and the commit is ONE undoable step', async () => {
      const node = addNode(0, 0, 100, 50);
      diagram.selectNode(node);
      const layer = tools.computeLayer(engine);
      const se = layer.handles.find((h) => h.handleId === 'se')!;

      expect(tools.beginResize(se, engine, 100, 50)).toBe(true);
      tools.updateResize(engine, 140, 80);
      expect(node.size).toMatchObject({ width: 140, height: 80 });

      const command = tools.endGesture(engine)!;
      expect(command).toBeInstanceOf(ResizeNodeCommand); // no move: SE anchors the origin
      await engine.commandManager.execute(command);
      expect(node.size).toMatchObject({ width: 140, height: 80 });

      await engine.undo();
      expect(node.size).toMatchObject({ width: 100, height: 50 });
    });

    test('a corner that MOVES the node commits a MacroCommand (move + resize) — one undo', async () => {
      const node = addNode(100, 100, 100, 50);
      diagram.selectNode(node);
      const nw = tools.computeLayer(engine).handles.find((h) => h.handleId === 'nw')!;

      tools.beginResize(nw, engine, 100, 100);
      tools.updateResize(engine, 120, 120);
      expect(node.position).toMatchObject({ x: 120, y: 120 });
      expect(node.size).toMatchObject({ width: 80, height: 30 });

      const command = tools.endGesture(engine)!;
      expect(command).toBeInstanceOf(MacroCommand);
      await engine.commandManager.execute(command);

      await engine.undo();
      expect(node.position).toMatchObject({ x: 100, y: 100 });
      expect(node.size).toMatchObject({ width: 100, height: 50 });
    });

    test('a resize that changes nothing adds NO history entry', () => {
      const node = addNode(0, 0);
      diagram.selectNode(node);
      const se = tools.computeLayer(engine).handles.find((h) => h.handleId === 'se')!;

      tools.beginResize(se, engine, 100, 50);
      tools.updateResize(engine, 100, 50);
      expect(tools.endGesture(engine)).toBeNull();
    });

    test('the snap hook can quantise the box mid-drag', () => {
      const node = addNode(0, 0, 100, 50);
      diagram.selectNode(node);
      const se = tools.computeLayer(engine).handles.find((h) => h.handleId === 'se')!;

      tools.beginResize(se, engine, 100, 50);
      tools.updateResize(engine, 137, 63, {}, (box) => ({
        ...box,
        width: Math.round(box.width / 20) * 20,
        height: Math.round(box.height / 20) * 20,
      }));
      expect(node.size).toMatchObject({ width: 140, height: 60 });
    });

    test('cancelGesture restores the pre-drag geometry', () => {
      const node = addNode(10, 10, 100, 50);
      diagram.selectNode(node);
      const se = tools.computeLayer(engine).handles.find((h) => h.handleId === 'se')!;

      tools.beginResize(se, engine, 110, 60);
      tools.updateResize(engine, 300, 300);
      tools.cancelGesture(engine);

      expect(node.position).toMatchObject({ x: 10, y: 10 });
      expect(node.size).toMatchObject({ width: 100, height: 50 });
      expect(tools.isActive()).toBe(false);
    });
  });

  describe('rotate gesture', () => {
    test('rotates live and commits ONE undoable RotateNodeCommand', async () => {
      const node = addNode(0, 0, 100, 50);
      node.behavior.rotatable = true;
      diagram.selectNode(node);
      const rotate = tools.computeLayer(engine).handles.find((h) => h.kind === 'rotate')!;

      // Grab the handle (due north of the centre) and swing to due east.
      tools.beginRotate(rotate, engine, 50, -20);
      tools.updateRotate(engine, 200, 25);
      expect(node.rotation).toBeCloseTo(90, 6);

      const command = tools.endGesture(engine)!;
      expect(command).toBeInstanceOf(RotateNodeCommand);
      await engine.commandManager.execute(command);
      expect(node.rotation).toBeCloseTo(90, 6);

      await engine.undo();
      expect(node.rotation).toBe(0);
    });

    test('Shift snaps the rotation to 15° steps', () => {
      const node = addNode(0, 0, 100, 50);
      node.behavior.rotatable = true;
      diagram.selectNode(node);
      const rotate = tools.computeLayer(engine).handles.find((h) => h.kind === 'rotate')!;

      tools.beginRotate(rotate, engine, 50, -20);
      tools.updateRotate(engine, 60, -20, { shift: true });
      expect(node.rotation % 15).toBeCloseTo(0, 6);
    });
  });

  describe('vertex tools', () => {
    test('add-vertex inserts a point and is undoable', async () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = linkBetween(a, b);
      link.setState('selected');

      const add = tools.computeLayer(engine).handles.find((h) => h.kind === 'vertex-add')!;
      const command = tools.addVertexCommand(add, engine)!;
      expect(command).toBeInstanceOf(SetLinkPointsCommand);

      await engine.commandManager.execute(command);
      expect(link.points).toHaveLength(3);
      expect(link.points[1]).toEqual({ x: 200, y: 25 });
      expect(link.getMetadata('hasManualWaypoints')).toBe(true);

      await engine.undo();
      expect(link.points).toHaveLength(2);
      expect(link.getMetadata('hasManualWaypoints')).toBe(false);
    });

    test('remove-vertex drops the point and is undoable', async () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = linkBetween(a, b);
      link.setPoints([
        { x: 100, y: 25 },
        { x: 200, y: 100 },
        { x: 300, y: 25 },
      ]);
      link.setState('selected');

      const remove = tools.computeLayer(engine).handles.find((h) => h.kind === 'vertex-remove')!;
      await engine.commandManager.execute(tools.removeVertexCommand(remove, engine)!);
      expect(link.points).toHaveLength(2);

      await engine.undo();
      expect(link.points).toHaveLength(3);
      expect(link.points[1]).toEqual({ x: 200, y: 100 });
    });

    test('dragging a vertex commits ONE undoable SetLinkPointsCommand', async () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = linkBetween(a, b);
      link.setPoints([
        { x: 100, y: 25 },
        { x: 200, y: 25 },
        { x: 300, y: 25 },
      ]);
      link.setState('selected');

      const handle = tools.computeLayer(engine).handles.find((h) => h.kind === 'vertex-remove')!;
      expect(tools.beginVertexDrag(handle, engine)).toBe(true);
      tools.updateVertexDrag(engine, 220, 90);
      expect(link.points[1]).toEqual({ x: 220, y: 90 });

      await engine.commandManager.execute(tools.endGesture(engine)!);
      await engine.undo();
      expect(link.points[1]).toEqual({ x: 200, y: 25 });
    });
  });

  describe('halo + remove commands', () => {
    test('remove drops the whole selection in one undo step', async () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = linkBetween(a, b);
      diagram.selectNode(a);
      diagram.toggleNodeSelection(b);
      link.setState('selected');

      const command = tools.removeSelectionCommand(engine)!;
      await engine.commandManager.execute(command);
      expect(diagram.getNodes()).toHaveLength(0);
      expect(diagram.getLinks()).toHaveLength(0);

      await engine.undo();
      expect(diagram.getNodes()).toHaveLength(2);
      expect(diagram.getLinks()).toHaveLength(1);
    });

    test('clone adds a copy with FRESH port ids (never shared with the source)', async () => {
      const node = addNode(0, 0);
      const command = tools.cloneNodeCommand(engine, node.id)!;
      await engine.commandManager.execute(command);

      expect(diagram.getNodes()).toHaveLength(2);
      const clone = diagram.getNodes().find((n) => n.id !== node.id)!;
      expect(clone.position.x).toBe(40);
      expect(clone.position.y).toBe(40);

      const originalPortIds = new Set(node.getPorts().map((p) => p.id));
      clone.getPorts().forEach((p) => expect(originalPortIds.has(p.id)).toBe(false));

      await engine.undo();
      expect(diagram.getNodes()).toHaveLength(1);
    });

    test('fork clones AND links the original to the clone — one undo step', async () => {
      const node = addNode(0, 0);
      const command = tools.forkNodeCommand(engine, node.id)!;
      await engine.commandManager.execute(command);

      expect(diagram.getNodes()).toHaveLength(2);
      expect(diagram.getLinks()).toHaveLength(1);

      const link = diagram.getLinks()[0]!;
      const clone = diagram.getNodes().find((n) => n.id !== node.id)!;
      expect(node.getPort(link.sourcePortId)).toBeDefined();
      expect(clone.getPort(link.targetPortId)).toBeDefined();

      await engine.undo();
      expect(diagram.getNodes()).toHaveLength(1);
      expect(diagram.getLinks()).toHaveLength(0);
    });
  });
});
