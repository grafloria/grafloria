/**
 * @jest-environment jsdom
 */

// D — THE PER-NODE LOCK IS AUTHORITATIVE.
//
// `state.locked` was honoured by the input layers and by NOTHING ELSE. No model
// mutator asked. So `node.setPosition()` from a command, a script, an importer —
// or from the engine's own auto-layout — moved a "locked" node without complaint.
// Same shape of lie the Wave-9 document lock was built to kill, one scope down.
//
// ## The semantics chosen here (and why)
//
// 1. A locked node refuses DOCUMENT writes to its GEOMETRY: setPosition, move,
//    setSize, resize, setRotation, setScale. Refusal is a silent no-op, matching
//    readonly-lock.ts — a locked node should be inert, not explosive.
// 2. SYSTEM writes still pass. `ReadonlyLock.runSystemWrite` marks the engine's own
//    measured/derived writes (auto-size measures text, portals place themselves).
//    Blocking those would render a locked node at the wrong size — the lock would
//    pass its unit test and wreck the product. Exactly the distinction Wave 9 drew
//    for the document lock; a per-node lock has no business drawing a different one.
// 3. NON-geometry writes are unaffected: style, data, classes, selection, and
//    `setState` itself. You must be able to un-lock a locked node, and locking a
//    widget should not freeze its colour.
// 4. AUTO-LAYOUT SKIPS LOCKED MEMBERS. A locked member keeps its position AND its
//    size, but still consumes its slot in the flow so the container never stacks
//    another widget on top of it. This is what "pin this tile" means in a dashboard,
//    and it is the precedent `LayoutManager` already set (it restores locked node
//    positions after every graph layout).

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { GroupModel } from './GroupModel';

function node(): NodeModel {
  return new NodeModel({
    type: 'box',
    position: { x: 10, y: 20 },
    size: { width: 100, height: 50, depth: 0 },
  });
}

describe('NodeModel — per-node lock is authoritative (D)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('lock');
  });

  function locked(): NodeModel {
    const n = node();
    diagram.addNode(n);
    n.setState({ locked: true });
    return n;
  }

  describe('geometry document writes are refused', () => {
    it('refuses setPosition', () => {
      const n = locked();
      n.setPosition(999, 999);
      expect(n.position).toMatchObject({ x: 10, y: 20 });
    });

    it('refuses move', () => {
      const n = locked();
      n.move(5, 5);
      expect(n.position).toMatchObject({ x: 10, y: 20 });
    });

    it('refuses setSize', () => {
      const n = locked();
      n.setSize(1, 1, 0);
      expect(n.size).toMatchObject({ width: 100, height: 50 });
    });

    it('refuses resize', () => {
      const n = locked();
      n.resize(10, 10);
      expect(n.size).toMatchObject({ width: 100, height: 50 });
    });

    it('refuses setRotation and setScale', () => {
      const n = locked();
      n.setRotation(45);
      n.setScale(2, 2);
      expect(n.rotation).toBe(0);
      expect(n.scale).toMatchObject({ x: 1, y: 1 });
    });

    it('resumes accepting writes once unlocked', () => {
      const n = locked();
      n.setPosition(1, 1);
      expect(n.position).toMatchObject({ x: 10, y: 20 });

      n.setState({ locked: false });
      n.setPosition(1, 1);
      expect(n.position).toMatchObject({ x: 1, y: 1 });
    });
  });

  describe('system writes still pass', () => {
    it('permits a measured setSize inside runSystemWrite', () => {
      const n = locked();
      diagram.runSystemWrite(() => n.setSize(222, 111, 0));
      expect(n.size).toMatchObject({ width: 222, height: 111 });
    });
  });

  describe('non-geometry writes are unaffected', () => {
    it('permits style, data and un-locking', () => {
      const n = locked();
      n.setStyle({ fill: 'red' });
      n.setData('k', 'v');
      expect(n.style.fill).toBe('red');
      expect(n.getData('k')).toBe('v');

      n.setState({ locked: false });
      expect(n.state.locked).toBe(false);
    });
  });

  describe('a detached node has no lock to enforce through', () => {
    it('is freely mutable even with state.locked set, until it joins a diagram', () => {
      const n = node();
      n.setState({ locked: true });
      // No diagram back-reference => nothing owns this node yet. It must stay
      // buildable, exactly as the document lock treats a detached node.
      n.setPosition(7, 7);
      expect(n.position).toMatchObject({ x: 7, y: 7 });
    });
  });

  describe('auto-layout skips locked members but keeps their slot', () => {
    it('leaves a locked widget where it is while reflowing the rest', () => {
      const g = new GroupModel({ name: 'Dashboard' });
      g.size = { width: 1200, height: 800, depth: 0 };
      diagram.addGroup(g);
      g.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
        columns: 12,
      });

      const free = new NodeModel({
        type: 'w',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 100, depth: 0 },
      });
      const pinned = new NodeModel({
        type: 'w',
        position: { x: 777, y: 888 },
        size: { width: 42, height: 100, depth: 0 },
      });
      free.setMetadata('columnSpan', 6);
      pinned.setMetadata('columnSpan', 6);
      diagram.addNode(free);
      diagram.addNode(pinned);
      pinned.setState({ locked: true });

      g.addMember(free.id);
      g.addMember(pinned.id);
      g.applyLayout(diagram);

      // The free widget is laid out…
      expect(free.position).toMatchObject({ x: 0, y: 0 });
      expect(free.size.width).toBe(600);

      // …the pinned one keeps BOTH its position and its size.
      expect(pinned.position).toMatchObject({ x: 777, y: 888 });
      expect(pinned.size.width).toBe(42);
    });

    it('still consumes its column slot so nothing is stacked on top of it', () => {
      const g = new GroupModel({ name: 'Dashboard' });
      g.size = { width: 1200, height: 800, depth: 0 };
      diagram.addGroup(g);
      g.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
        columns: 12,
      });

      const pinned = new NodeModel({
        type: 'w',
        position: { x: 0, y: 0 },
        size: { width: 600, height: 100, depth: 0 },
      });
      const after = new NodeModel({
        type: 'w',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 100, depth: 0 },
      });
      pinned.setMetadata('columnSpan', 6);
      after.setMetadata('columnSpan', 6);
      diagram.addNode(pinned);
      diagram.addNode(after);
      pinned.setState({ locked: true });

      g.addMember(pinned.id);
      g.addMember(after.id);
      g.applyLayout(diagram);

      // `after` is placed as if the locked widget occupied columns 1-6.
      expect(after.position.x).toBe(600);
      expect(after.position.y).toBe(0);
    });
  });
});
