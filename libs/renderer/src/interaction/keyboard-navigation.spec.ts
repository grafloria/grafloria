/**
 * Wave 4 — Card 7: keyboard-first & accessible canvas interaction.
 *
 * The differentiator card: no competitor makes a canvas fully keyboard-operable
 * and screen-reader-announced. These tests drive the whole model with a plain
 * `new` — focus order, spatial focus, nudge-as-a-command, the keyboard connect
 * state machine, and the announcements a host pipes into an aria-live region.
 */
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  MacroCommand,
  AddLinkCommand,
  MoveNodeCommand,
} from '@grafloria/engine';
import { KeyboardNavigationController } from './keyboard-navigation';

describe('Card 7 — KeyboardNavigationController', () => {
  let nav: KeyboardNavigationController;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    nav = new KeyboardNavigationController();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-keyboard');
  });

  afterEach(() => {
    nav.dispose();
    engine.destroy();
  });

  function addNode(x: number, y: number, label?: string): NodeModel {
    const node = new NodeModel({
      type: 'task',
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
    link.setPoints([
      { x: a.position.x + 100, y: a.position.y + 25 },
      { x: b.position.x, y: b.position.y + 25 },
    ]);
    diagram.addLink(link);
    return link;
  }

  // ==========================================================================
  // Focus
  // ==========================================================================

  describe('focus order (Tab)', () => {
    test('walks nodes in reading order, then links', () => {
      const bottom = addNode(0, 300, 'Bottom');
      const topRight = addNode(400, 0, 'Top right');
      const topLeft = addNode(0, 0, 'Top left');
      linkBetween(topLeft, bottom);

      const order = nav.getFocusOrder(engine);
      expect(order.map((t) => t.type)).toEqual(['node', 'node', 'node', 'link']);
      expect(order.slice(0, 3).map((t) => t.id)).toEqual([topLeft.id, topRight.id, bottom.id]);
    });

    test('Tab advances, Shift+Tab retreats, and focus wraps', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(200, 0, 'B');

      expect(nav.focusNext(engine)?.id).toBe(a.id);
      expect(nav.focusNext(engine)?.id).toBe(b.id);
      expect(nav.focusNext(engine)?.id).toBe(a.id); // wrapped
      expect(nav.focusPrevious(engine)?.id).toBe(b.id); // wrapped back
    });

    test('wrapFocus:false stops at the ends', () => {
      nav.updateConfig({ wrapFocus: false });
      addNode(0, 0);
      addNode(200, 0);

      nav.focusNext(engine);
      nav.focusNext(engine);
      const last = nav.getFocused();
      expect(nav.focusNext(engine)).toEqual(last); // no wrap
    });

    test('skips non-selectable nodes', () => {
      const a = addNode(0, 0);
      const hidden = addNode(200, 0);
      hidden.behavior.selectable = false;

      expect(nav.getFocusOrder(engine).map((t) => t.id)).toEqual([a.id]);
    });
  });

  describe('spatial focus (arrows with nothing selected)', () => {
    test('moves right / left / down between nodes', () => {
      const left = addNode(0, 0, 'Left');
      const right = addNode(300, 0, 'Right');
      const below = addNode(0, 300, 'Below');

      nav.setFocus({ type: 'node', id: left.id });
      expect(nav.focusDirection(engine, 'right')?.id).toBe(right.id);
      expect(nav.focusDirection(engine, 'left')?.id).toBe(left.id);
      expect(nav.focusDirection(engine, 'down')?.id).toBe(below.id);
    });

    test('a direction with nothing in it keeps the current focus', () => {
      const only = addNode(0, 0);
      nav.setFocus({ type: 'node', id: only.id });
      expect(nav.focusDirection(engine, 'up')?.id).toBe(only.id);
    });

    test('prefers a straight line over a nearer-but-skewed node', () => {
      const start = addNode(0, 0);
      const straight = addNode(400, 0, 'straight');
      addNode(200, 500, 'skewed'); // closer in raw distance, far off-axis

      nav.setFocus({ type: 'node', id: start.id });
      expect(nav.focusDirection(engine, 'right')?.id).toBe(straight.id);
    });
  });

  describe('focus ring', () => {
    test('is a padded box for a node and a polyline for a link', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      const link = linkBetween(a, b);

      nav.setFocus({ type: 'node', id: a.id });
      const nodeRing = nav.getFocusRing(engine)!;
      expect(nodeRing.bounds).toEqual({ x: -6, y: -6, width: 112, height: 62 });
      expect(nodeRing.label).toContain('A');

      nav.setFocus({ type: 'link', id: link.id });
      const linkRing = nav.getFocusRing(engine)!;
      expect(linkRing.points).toHaveLength(2);
      expect(linkRing.label).toContain('from A');
    });

    test('is null when nothing is focused', () => {
      addNode(0, 0);
      expect(nav.getFocusRing(engine)).toBeNull();
    });
  });

  // ==========================================================================
  // Nudge
  // ==========================================================================

  describe('arrow-key nudge', () => {
    test('fine step by default, coarse with Shift', () => {
      expect(nav.nudgeDelta('ArrowRight')).toEqual({ x: 1, y: 0 });
      expect(nav.nudgeDelta('ArrowUp', true)).toEqual({ x: 0, y: -10 });
      expect(nav.nudgeDelta('Enter')).toBeNull();
    });

    test('moves the SELECTION as ONE undoable command', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);

      const command = nav.nudgeCommand(engine, 0, -10)!;
      expect(command).toBeInstanceOf(MoveNodeCommand);
      await engine.commandManager.execute(command);
      expect(node.position).toMatchObject({ x: 100, y: 90 });

      await engine.undo();
      expect(node.position).toMatchObject({ x: 100, y: 100 });
    });

    test('a multi-node nudge is ONE MacroCommand → ONE undo step', async () => {
      const a = addNode(0, 0);
      const b = addNode(200, 0);
      diagram.selectNode(a);
      diagram.toggleNodeSelection(b);

      const command = nav.nudgeCommand(engine, 5, 0)!;
      expect(command).toBeInstanceOf(MacroCommand);
      await engine.commandManager.execute(command);
      expect(a.position.x).toBe(5);
      expect(b.position.x).toBe(205);

      await engine.undo();
      expect(a.position.x).toBe(0);
      expect(b.position.x).toBe(200);
    });

    test('with nothing selected it moves the FOCUSED node', async () => {
      const node = addNode(10, 10);
      nav.setFocus({ type: 'node', id: node.id });

      await engine.commandManager.execute(nav.nudgeCommand(engine, 3, 3)!);
      expect(node.position).toMatchObject({ x: 13, y: 13 });
    });

    test('refuses to move a locked node', () => {
      const node = addNode(0, 0);
      node.setState({ locked: true });
      diagram.selectNode(node);
      expect(nav.nudgeCommand(engine, 5, 0)).toBeNull();
    });

    test('announces the move', () => {
      const node = addNode(0, 0, 'Start');
      diagram.selectNode(node);
      nav.nudgeCommand(engine, 10, 0);
      expect(nav.getLastAnnouncement()?.message).toContain('Moved Start');
    });
  });

  // ==========================================================================
  // Keyboard connect
  // ==========================================================================

  describe('keyboard connect', () => {
    test('full flow: focus → C → Enter (pick target) → Enter (commit) = ONE undoable link', async () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');

      nav.setFocus({ type: 'node', id: a.id });
      expect(nav.beginConnect(engine)).toBe(true);
      expect(nav.getConnectState()).toMatchObject({ phase: 'source', sourceNodeId: a.id });

      // Enter #1: confirm the source, seed the first target candidate.
      expect(nav.confirmConnect(engine)).toBeNull();
      expect(nav.getConnectState()).toMatchObject({
        phase: 'target',
        targetNodeId: b.id,
        valid: true,
      });

      // Enter #2: commit.
      const command = nav.confirmConnect(engine)!;
      expect(command).toBeInstanceOf(AddLinkCommand);
      await engine.commandManager.execute(command);

      expect(diagram.getLinks()).toHaveLength(1);
      const link = diagram.getLinks()[0]!;
      expect(a.getPort(link.sourcePortId)).toBeDefined();
      expect(b.getPort(link.targetPortId)).toBeDefined();
      expect(nav.isConnecting()).toBe(false);

      await engine.undo();
      expect(diagram.getLinks()).toHaveLength(0);
    });

    test('arrows cycle the port being picked', () => {
      const a = addNode(0, 0);
      addNode(300, 0);
      nav.setFocus({ type: 'node', id: a.id });
      nav.beginConnect(engine);

      const first = nav.getConnectState()!.sourcePortId;
      nav.cyclePort(engine, 1);
      expect(nav.getConnectState()!.sourcePortId).not.toBe(first);
      nav.cyclePort(engine, -1);
      expect(nav.getConnectState()!.sourcePortId).toBe(first);
    });

    test('Tab cycles the target node during phase 2', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const c = addNode(600, 0);
      nav.setFocus({ type: 'node', id: a.id });
      nav.beginConnect(engine);
      nav.confirmConnect(engine);

      expect(nav.getConnectState()!.targetNodeId).toBe(b.id);
      nav.cycleTargetNode(engine, 1);
      expect(nav.getConnectState()!.targetNodeId).toBe(c.id);
    });

    test('refuses to commit an illegal pair (different connection groups), assertively', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      // Same rule the pointer-driven connect enforces (canConnectPorts).
      a.setConnectionGroup('alpha');
      b.setConnectionGroup('beta');

      nav.setFocus({ type: 'node', id: a.id });
      nav.beginConnect(engine);
      nav.confirmConnect(engine); // phase 2 — b is reachable but not connectable to
      expect(nav.getConnectState()!.valid).toBe(false);

      expect(nav.confirmConnect(engine)).toBeNull();
      expect(diagram.getLinks()).toHaveLength(0);
      expect(nav.getLastAnnouncement()).toMatchObject({
        politeness: 'assertive',
        message: 'Cannot connect these ports',
      });
    });

    test('with no connectable node to reach, the flow ends and says so', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      b.behavior.connectable = false;

      nav.setFocus({ type: 'node', id: a.id });
      nav.beginConnect(engine);
      expect(nav.confirmConnect(engine)).toBeNull();
      expect(nav.isConnecting()).toBe(false);
      expect(nav.getLastAnnouncement()).toMatchObject({
        politeness: 'assertive',
        message: 'No other node to connect to',
      });
    });

    test('Escape cancels', () => {
      const a = addNode(0, 0);
      addNode(300, 0);
      nav.setFocus({ type: 'node', id: a.id });
      nav.beginConnect(engine);

      nav.cancelConnect();
      expect(nav.isConnecting()).toBe(false);
      expect(nav.getLastAnnouncement()?.message).toBe('Connection cancelled');
    });
  });

  // ==========================================================================
  // Announcements (the aria-live seam)
  // ==========================================================================

  describe('announcements', () => {
    test('focusing announces the target, with its type, name and connection count', () => {
      const a = addNode(0, 0, 'Start');
      const b = addNode(300, 0, 'End');
      linkBetween(a, b);

      const heard: string[] = [];
      nav.onAnnounce((announcement) => heard.push(announcement.message));

      nav.focusNext(engine);
      expect(heard[0]).toBe('task node, Start, 1 connection');
    });

    test('selection changes are announced, singular and plural', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');

      diagram.selectNode(a);
      // The single-entity announcement is the entity's DESCRIPTION, which already
      // carries the selected state (it used to say "selected selected").
      expect(nav.announceSelection(engine)!.message).toBe('task node, A, 0 connections, selected');

      diagram.toggleNodeSelection(b);
      expect(nav.announceSelection(engine)!.message).toBe('2 nodes selected');

      diagram.clearSelection();
      expect(nav.announceSelection(engine)!.message).toBe('Selection cleared');
    });

    test('structure changes report the new shape of the diagram', () => {
      addNode(0, 0);
      addNode(300, 0);
      expect(nav.announceStructure(engine, 'Add Node')!.message).toBe(
        'Add Node. 2 nodes, 0 links.'
      );
    });

    test('selectFocused selects the focused entity and announces it', () => {
      const a = addNode(0, 0, 'A');
      nav.setFocus({ type: 'node', id: a.id });

      expect(nav.selectFocused(engine)).toBe(true);
      expect(a.isSelected()).toBe(true);
      expect(nav.getLastAnnouncement()?.message).toContain('selected');
    });

    test('unsubscribing stops delivery', () => {
      const heard: string[] = [];
      const off = nav.onAnnounce((a) => heard.push(a.message));
      nav.announce('one');
      off();
      nav.announce('two');
      expect(heard).toEqual(['one']);
      expect(nav.getLastAnnouncement()?.message).toBe('two'); // still recorded
    });
  });
});
