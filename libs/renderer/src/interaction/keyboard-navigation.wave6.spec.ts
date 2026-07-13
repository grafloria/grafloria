/**
 * Wave 6 — a11y cards 2 & 3: what wave 4's keyboard canvas did NOT ship.
 *
 * Wave 4 gave us Tab/arrow focus, an undoable nudge, and keyboard connect. Two
 * holes were left, and they are the two that matter most to someone who cannot
 * use a pointer:
 *
 *   card 2 — SPATIAL arrow focus is geometry ("the nearest node to the right").
 *            A screen-reader user has no geometry. They need to walk the GRAPH:
 *            "this node has 2 outgoing edges — follow the first."
 *   card 3 — you could MOVE and CONNECT by keyboard, but not DELETE, DUPLICATE
 *            or REPARENT. You could build a diagram and never restructure one.
 */
import { DiagramEngine, DiagramModel, NodeModel, LinkModel } from '@grafloria/engine';
import { KeyboardNavigationController } from './keyboard-navigation';

describe('wave6 — keyboard navigation, cards 2 & 3', () => {
  let nav: KeyboardNavigationController;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    nav = new KeyboardNavigationController();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave6-keyboard');
  });

  afterEach(() => {
    nav.dispose();
    engine.destroy();
  });

  function addNode(x: number, y: number, label?: string, type = 'task'): NodeModel {
    const node = new NodeModel({
      type,
      position: { x, y },
      size: { width: 100, height: 50, depth: 0 },
    });
    if (label) node.setMetadata('label', label);
    diagram.addNode(node);
    return node;
  }

  function linkBetween(a: NodeModel, b: NodeModel): LinkModel {
    const source = a.getPortBySide('right')!;
    const target = b.getPortBySide('left')!;
    const link = new LinkModel(source.id, target.id);
    link.setSourcePort(source.id, a.id);
    link.setTargetPort(target.id, b.id);
    diagram.addLink(link);
    return link;
  }

  /** Run a command the way the host does. */
  function run(command: { execute: (ctx: unknown) => void } | null): void {
    expect(command).not.toBeNull();
    command!.execute({ diagram, store: undefined } as never);
  }

  // ==========================================================================
  // Card 2 — follow-edge traversal
  // ==========================================================================

  describe('card 2 — follow-edge navigation', () => {
    test('walks along an OUTGOING edge to the neighbour', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      linkBetween(a, b);

      nav.setFocus({ type: 'node', id: a.id }, engine);
      const next = nav.followOutgoing(engine);

      expect(next).toEqual({ type: 'node', id: b.id });
    });

    test('walks BACK along an incoming edge', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      linkBetween(a, b);

      nav.setFocus({ type: 'node', id: b.id }, engine);
      expect(nav.followIncoming(engine)).toEqual({ type: 'node', id: a.id });
    });

    test('a decision with two branches: index picks the branch', () => {
      const decision = addNode(0, 0, 'Valid?', 'decision');
      const yes = addNode(300, 0, 'Ship');
      const no = addNode(300, 200, 'Reject');
      linkBetween(decision, yes);
      linkBetween(decision, no);

      nav.setFocus({ type: 'node', id: decision.id }, engine);
      expect(nav.followOutgoing(engine, 0)).toEqual({ type: 'node', id: yes.id });

      nav.setFocus({ type: 'node', id: decision.id }, engine);
      expect(nav.followOutgoing(engine, 1)).toEqual({ type: 'node', id: no.id });
    });

    test('the walk is ANNOUNCED — you must know which branch you took', () => {
      const decision = addNode(0, 0, 'Valid?', 'decision');
      const yes = addNode(300, 0, 'Ship');
      linkBetween(decision, yes);

      nav.setFocus({ type: 'node', id: decision.id }, engine);
      nav.followOutgoing(engine, 0);

      expect(nav.getLastAnnouncement()?.message).toContain('outgoing 1 of 1');
      expect(nav.getLastAnnouncement()?.message).toContain('Ship');
    });

    test('a dead end says so instead of silently doing nothing', () => {
      const lonely = addNode(0, 0, 'Lonely');
      nav.setFocus({ type: 'node', id: lonely.id }, engine);

      expect(nav.followOutgoing(engine)).toEqual({ type: 'node', id: lonely.id });
      expect(nav.getLastAnnouncement()?.message).toBe('Lonely has no outgoing connections');
    });

    test('focus can land on the EDGE itself, so it can be deleted', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      const link = linkBetween(a, b);

      nav.setFocus({ type: 'node', id: a.id }, engine);
      expect(nav.focusIncidentEdge(engine, 0)).toEqual({ type: 'link', id: link.id });
    });

    test('from an edge, follow it to the node at the far end', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      const link = linkBetween(a, b);

      nav.setFocus({ type: 'link', id: link.id }, engine);
      expect(nav.followEdge(engine, 0)).toEqual({ type: 'node', id: b.id });
    });

    test('"take me back to the start" jumps to an entry point', () => {
      const start = addNode(0, 0, 'Start', 'start');
      const mid = addNode(300, 0, 'Mid');
      const end = addNode(600, 0, 'End');
      linkBetween(start, mid);
      linkBetween(mid, end);

      nav.setFocus({ type: 'node', id: end.id }, engine);
      expect(nav.focusEntryPoint(engine)).toEqual({ type: 'node', id: start.id });
    });

    test('position context gives the orientation a sighted user gets for free', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      const c = addNode(600, 0, 'C');
      linkBetween(a, b);
      linkBetween(c, b);

      nav.setFocus({ type: 'node', id: b.id }, engine);
      expect(nav.positionContextOfFocus(engine)).toBe('node 2 of 3, 2 incoming, 0 outgoing');
    });
  });

  // ==========================================================================
  // Card 3 — keyboard-only editing
  // ==========================================================================

  describe('card 3 — delete', () => {
    test('deleting a node takes its edges with it (no dangling links)', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      linkBetween(a, b);

      nav.setFocus({ type: 'node', id: a.id }, engine);
      run(nav.deleteCommand(engine));

      expect(diagram.getNode(a.id)).toBeUndefined();
      expect(diagram.getLinks()).toHaveLength(0);
      expect(diagram.getNode(b.id)).toBeDefined();
    });

    test('a LOCKED node cannot be deleted from the keyboard either', () => {
      const locked = addNode(0, 0, 'Locked');
      locked.state.locked = true;

      nav.setFocus({ type: 'node', id: locked.id }, engine);
      expect(nav.deleteCommand(engine)).toBeNull();
    });

    test('deleting clears focus — it must not rest on something that is gone', () => {
      const a = addNode(0, 0, 'A');
      nav.setFocus({ type: 'node', id: a.id }, engine);

      run(nav.deleteCommand(engine));
      expect(nav.getFocused()).toBeNull();
    });

    test('a focused EDGE alone can be deleted, leaving its nodes', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      const link = linkBetween(a, b);

      nav.setFocus({ type: 'link', id: link.id }, engine);
      run(nav.deleteCommand(engine));

      expect(diagram.getLink(link.id)).toBeUndefined();
      expect(diagram.getNodes()).toHaveLength(2);
    });

    test('is undoable as ONE command', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      linkBetween(a, b);

      nav.setFocus({ type: 'node', id: a.id }, engine);
      const command = nav.deleteCommand(engine)!;
      command.execute({ diagram } as never);
      expect(diagram.getNodes()).toHaveLength(1);

      command.undo({ diagram } as never);
      expect(diagram.getNodes()).toHaveLength(2);
      expect(diagram.getLinks()).toHaveLength(1);
    });
  });

  describe('card 3 — duplicate', () => {
    test('duplicates the focused node at an offset, keeping its label', () => {
      const a = addNode(10, 20, 'Review');

      nav.setFocus({ type: 'node', id: a.id }, engine);
      run(nav.duplicateCommand(engine, { x: 24, y: 24 }));

      expect(diagram.getNodes()).toHaveLength(2);
      const copy = diagram.getNodes().find((n) => n.id !== a.id)!;
      expect(copy.getMetadata('label')).toBe('Review');
      expect(copy.position).toMatchObject({ x: 34, y: 44 });
    });

    test('an edge BETWEEN two duplicated nodes is duplicated too', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      linkBetween(a, b);
      diagram.selectNode(a);
      diagram.toggleNodeSelection(b);

      run(nav.duplicateCommand(engine));

      expect(diagram.getNodes()).toHaveLength(4);
      expect(diagram.getLinks()).toHaveLength(2);
    });

    test('an edge leaving the copied set is NOT duplicated (it has no counterpart)', () => {
      const a = addNode(0, 0, 'A');
      const outside = addNode(300, 0, 'Outside');
      linkBetween(a, outside);

      nav.setFocus({ type: 'node', id: a.id }, engine);
      run(nav.duplicateCommand(engine));

      expect(diagram.getNodes()).toHaveLength(3);
      expect(diagram.getLinks()).toHaveLength(1); // still just the original
    });
  });

  describe('card 3 — reparent', () => {
    test('moves the focused node into a container', () => {
      const container = addNode(0, 0, 'Group', 'container');
      const child = addNode(400, 0, 'Child');

      nav.setFocus({ type: 'node', id: child.id }, engine);
      run(nav.reparentCommand(engine, container.id));

      expect(diagram.getNode(child.id)!.parentId).toBe(container.id);
    });

    test('unparents back to the top level', () => {
      const container = addNode(0, 0, 'Group', 'container');
      const child = addNode(400, 0, 'Child');
      nav.setFocus({ type: 'node', id: child.id }, engine);
      run(nav.reparentCommand(engine, container.id));

      run(nav.reparentCommand(engine, null));
      expect(diagram.getNode(child.id)!.parentId).toBeUndefined();
    });

    test('REFUSES a cycle, assertively — instead of throwing into the void', () => {
      const parent = addNode(0, 0, 'Parent', 'container');
      const child = addNode(400, 0, 'Child');
      nav.setFocus({ type: 'node', id: child.id }, engine);
      run(nav.reparentCommand(engine, parent.id));

      // Now try to put the PARENT inside its own child.
      nav.setFocus({ type: 'node', id: parent.id }, engine);
      expect(nav.reparentCommand(engine, child.id)).toBeNull();

      const announcement = nav.getLastAnnouncement()!;
      expect(announcement.politeness).toBe('assertive');
      expect(announcement.message).toContain('would create a loop');
    });

    test('a node cannot be its own parent', () => {
      const a = addNode(0, 0, 'A');
      nav.setFocus({ type: 'node', id: a.id }, engine);

      expect(nav.reparentCommand(engine, a.id)).toBeNull();
      expect(nav.getLastAnnouncement()?.message).toBe('Cannot reparent a node into itself');
    });

    test('candidate containers exclude the node itself and its descendants', () => {
      const parent = addNode(0, 0, 'Parent', 'container');
      const child = addNode(400, 0, 'Child');
      const other = addNode(800, 0, 'Other');
      nav.setFocus({ type: 'node', id: child.id }, engine);
      run(nav.reparentCommand(engine, parent.id));

      nav.setFocus({ type: 'node', id: parent.id }, engine);
      const candidates = nav.reparentCandidates(engine).map((n) => n.id);

      expect(candidates).toContain(other.id);
      expect(candidates).not.toContain(parent.id); // itself
      expect(candidates).not.toContain(child.id); // its descendant
    });
  });
});
