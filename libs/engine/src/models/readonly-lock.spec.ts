/**
 * Read-only / presentation mode — Wave 9, Card 7.
 *
 * THE POINT OF THIS FILE. `DiagramMode.VIEW` / `PRESENTATION` and
 * `ModeManager.isReadOnlyMode()` shipped long ago and enforced NOTHING — a
 * "read-only" diagram accepted drags, deletes, pastes and programmatic writes
 * alike. A read-only mode that only hides the UI is a security-shaped lie.
 *
 * So this suite is written the way a security boundary must be written: for every
 * mutation ENTRY POINT, prove the document is REFUSED. And then prove the inverse —
 * that a locked document is still fully VIEWABLE (pan, zoom, select, hover, focus,
 * auto-size, routing), because a lock that breaks reading is just a broken diagram.
 */
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramMode } from '../engine/DiagramMode';
import { MoveNodeCommand } from '../commands/basic/MoveNodeCommand';

const mkNode = (id: string, x = 0, y = 0) =>
  new NodeModel({ id, type: 'default', position: { x, y }, size: { width: 100, height: 50 } });

/** A diagram with two connected nodes, then LOCKED. */
function lockedDiagram() {
  const diagram = new DiagramModel();
  const a = mkNode('a', 0, 0);
  const b = mkNode('b', 300, 0);
  diagram.addNode(a);
  diagram.addNode(b);
  diagram.connectNodes(a, b);
  const link = diagram.getLinks()[0];
  diagram.setReadonly(true);
  return { diagram, a, b, link };
}

describe('read-only lock — the enforcement boundary', () => {
  describe('NodeModel: document writes are REFUSED', () => {
    it('refuses geometry writes (the node-drag path)', () => {
      const { a } = lockedDiagram();
      a.setPosition(999, 999);
      a.move(10, 10);
      a.setSize(1, 1);
      a.resize(5, 5);
      a.setRotation(45);

      expect(a.position).toMatchObject({ x: 0, y: 0 });
      expect(a.size).toMatchObject({ width: 100, height: 50 });
      expect(a.rotation ?? 0).toBe(0);
    });

    it('refuses content + structure writes', () => {
      const { a } = lockedDiagram();
      a.setData('k', 'v');
      a.setStyle({ fill: 'red' });
      a.addClass('danger');
      a.setParent('b');

      expect(a.getData('k')).toBeUndefined();
      expect(a.style.fill).not.toBe('red');
      expect(a.parentId).toBeUndefined();
    });

    it('refuses state writes that are DOCUMENT state (locked / visible / expanded)', () => {
      const { a } = lockedDiagram();
      a.setState({ visible: false, locked: true, expanded: false });
      expect(a.state.visible).toBe(true); // unchanged
      expect(a.state.locked).toBe(false);
    });
  });

  describe('NodeModel: VIEW state is still writable (a locked diagram must stay readable)', () => {
    it('allows selection / hover / highlight / a11y focus', () => {
      const { a } = lockedDiagram();
      a.setState({ selected: true, hovered: true, highlighted: true, focused: true });
      expect(a.state.selected).toBe(true);
      expect(a.state.hovered).toBe(true);
      expect(a.state.highlighted).toBe(true);
      expect(a.state.focused).toBe(true);
    });

    it('allows setSelected / setHighlighted (the screen-reader + roving-tabindex path)', () => {
      const { a } = lockedDiagram();
      a.setSelected(true);
      a.setHighlighted(true);
      expect(a.isSelected()).toBe(true);
      expect(a.isHighlighted()).toBe(true);
    });

    it('a mixed setState keeps the view keys and drops the document keys', () => {
      const { a } = lockedDiagram();
      a.setState({ selected: true, locked: true });
      expect(a.state.selected).toBe(true); // kept
      expect(a.state.locked).toBe(false); // dropped
    });
  });

  describe('LinkModel: the edits the interaction controller makes are REFUSED', () => {
    it('refuses waypoints, labels, style and reconnection', () => {
      const { link } = lockedDiagram();
      const before = link.points.map((p) => ({ ...p }));

      link.setPoints([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
      link.addPoint({ x: 5, y: 5 });
      link.addLabel({ text: 'hello', position: 0.5 });
      link.updateStyle({ stroke: 'red' });
      link.reconnectSource('bogus-port');
      link.setPathType('direct');

      expect(link.points).toEqual(before);
      expect(link.labels).toHaveLength(0);
      expect(link.style.stroke).not.toBe('red');
      expect(link.sourcePortId).not.toBe('bogus-port');
    });

    it('still allows link VIEW state (hover/select), so the link stays readable', () => {
      const { link } = lockedDiagram();
      link.setState('selected');
      expect(link.state).toBe('selected');
    });

    it('the new diagram back-reference is NON-ENUMERABLE (no circular serialization)', () => {
      const { link } = lockedDiagram();
      expect(link.diagram).toBeDefined();
      expect(Object.keys(link)).not.toContain('diagram');
      expect(() => JSON.stringify(link.serialize())).not.toThrow();
    });
  });

  describe('DiagramModel: structural writes are REFUSED', () => {
    it('refuses add/remove of nodes and links, and deleteSelected', () => {
      const { diagram, a } = lockedDiagram();
      a.setSelected(true);

      diagram.addNode(mkNode('intruder', 5, 5));
      expect(diagram.getNode('intruder')).toBeUndefined();

      diagram.removeNode('a');
      expect(diagram.getNode('a')).toBeDefined();

      const linkCount = diagram.getLinks().length;
      diagram.removeLink(diagram.getLinks()[0].id);
      expect(diagram.getLinks()).toHaveLength(linkCount);

      expect(diagram.deleteSelected()).toBe(0);
      expect(diagram.getNode('a')).toBeDefined();
    });

    it('still allows SELECTION (viewing is not editing)', () => {
      const { diagram, a } = lockedDiagram();
      diagram.selectNode(a);
      expect(diagram.getSelectedNodes().map((n) => n.id)).toEqual(['a']);
      diagram.clearSelection();
      expect(diagram.getSelectedNodes()).toHaveLength(0);
      diagram.selectAll();
      expect(diagram.getSelectedNodes().length).toBeGreaterThan(0);
    });

    it('still allows viewport + zoom (pan/zoom is the WHOLE point of presentation mode)', () => {
      const { diagram } = lockedDiagram();
      diagram.setZoom(2.5);
      diagram.setViewport(10, 20, 800, 600);
      expect(diagram.getViewport().zoom).toBe(2.5);
      expect(diagram.getViewport()).toMatchObject({ x: 10, y: 20, width: 800, height: 600 });
    });
  });

  describe('a DETACHED model is still mutable (you must be able to BUILD before you add)', () => {
    it('a node not yet in any diagram is freely writable', () => {
      const loose = mkNode('loose', 1, 1);
      loose.setPosition(50, 60);
      expect(loose.position).toMatchObject({ x: 50, y: 60 });
    });

    it('a link not yet in any diagram is freely writable', () => {
      const loose = new LinkModel('p1', 'p2');
      loose.setPoints([{ x: 3, y: 3 }]);
      expect(loose.points).toHaveLength(1);
    });
  });

  describe('system writes: the renderer must still be able to draw a locked document', () => {
    it('runSystemWrite permits a derived write that user input cannot make', () => {
      const { diagram, a } = lockedDiagram();
      a.setSize(123, 45); // user path — refused
      expect(a.size.width).toBe(100);

      diagram.runSystemWrite(() => a.setSize(123, 45)); // auto-size path — allowed
      expect(a.size.width).toBe(123);
    });

    it('is re-entrant and exception-safe — a throwing measurement cannot leave the lock OPEN', () => {
      const { diagram, a } = lockedDiagram();
      expect(() =>
        diagram.runSystemWrite(() => {
          diagram.runSystemWrite(() => a.setSize(200, 100)); // nested
          throw new Error('measurement blew up');
        })
      ).toThrow('measurement blew up');

      // The lock must be intact afterwards. If the depth counter leaked, the
      // document would be silently unlocked forever — the worst failure mode.
      expect(diagram.blocksDocumentWrite()).toBe(true);
      a.setPosition(777, 777);
      expect(a.position.x).toBe(0);
    });
  });

  describe('CommandManager: every command-shaped mutation is REFUSED', () => {
    it('refuses execute() — this is what blocks clipboard/paste and the a11y keyboard layer', async () => {
      const engine = new DiagramEngine();
      const diagram = new DiagramModel();
      const a = mkNode('a', 0, 0);
      diagram.addNode(a);
      engine.setDiagram(diagram);

      diagram.setReadonly(true);
      await engine.commandManager.execute(new MoveNodeCommand('a', { x: 500, y: 500 }));

      expect(a.position).toMatchObject({ x: 0, y: 0 });
    });

    it('refuses undo() and redo() — they bypass executeCommand and would be an open door', async () => {
      const engine = new DiagramEngine();
      const diagram = new DiagramModel();
      const a = mkNode('a', 0, 0);
      diagram.addNode(a);
      engine.setDiagram(diagram);

      // A legitimate edit while UNLOCKED.
      await engine.commandManager.execute(new MoveNodeCommand('a', { x: 40, y: 40 }));
      expect(a.position).toMatchObject({ x: 40, y: 40 });

      // Now lock, and try to rewind history.
      diagram.setReadonly(true);
      await engine.commandManager.undo();
      expect(a.position).toMatchObject({ x: 40, y: 40 }); // undo refused

      diagram.setReadonly(false);
      await engine.commandManager.undo();
      expect(a.position).toMatchObject({ x: 0, y: 0 }); // and it works again when unlocked

      diagram.setReadonly(true);
      await engine.commandManager.redo();
      expect(a.position).toMatchObject({ x: 0, y: 0 }); // redo refused
    });
  });

  describe('DEFENCE IN DEPTH: the model refuses even when the CommandManager is bypassed', () => {
    it('a command executed DIRECTLY (not via CommandManager) is still refused', async () => {
      // This is why enforcement lives at the MODEL and not only at the choke point.
      // The Wave-6 a11y keyboard layer is a command FACTORY — it hands the host a
      // `Command` and the host decides how to run it. A host that calls
      // `command.execute(ctx)` itself would sail straight past CommandManager's
      // guard. The model guard underneath is what makes that a no-op instead of an
      // edit, so read-only is a property of the DOCUMENT, not of one code path.
      const engine = new DiagramEngine();
      const diagram = new DiagramModel();
      const a = mkNode('a', 0, 0);
      diagram.addNode(a);
      engine.setDiagram(diagram);
      diagram.setReadonly(true);

      const command = new MoveNodeCommand('a', { x: 500, y: 500 });
      await command.execute({
        diagram,
        eventBus: (engine as unknown as { eventBus: unknown }).eventBus,
      } as never);

      expect(a.position).toMatchObject({ x: 0, y: 0 });
    });

    it('a raw model write from ANY caller is refused (no privileged path)', () => {
      const { diagram, a, link } = lockedDiagram();
      // Whatever the caller — a plugin, a host, a stray setTimeout — the document
      // is inert.
      a.setPosition(1, 1);
      link.setPoints([{ x: 9, y: 9 }]);
      diagram.deleteSelected();

      expect(a.position).toMatchObject({ x: 0, y: 0 });
      expect(diagram.getNodes()).toHaveLength(2);
    });
  });

  describe('DiagramMode is finally WIRED (it gated nothing before this wave)', () => {
    it('setMode(PRESENTATION) locks the document; DESIGNER unlocks it', () => {
      const engine = new DiagramEngine();
      const diagram = new DiagramModel();
      const a = mkNode('a', 0, 0);
      diagram.addNode(a);
      engine.setDiagram(diagram);

      expect(diagram.isReadonly()).toBe(false);

      engine.setMode(DiagramMode.PRESENTATION);
      expect(diagram.isReadonly()).toBe(true);
      a.setPosition(600, 600);
      expect(a.position).toMatchObject({ x: 0, y: 0 });

      engine.setMode(DiagramMode.DESIGNER);
      expect(diagram.isReadonly()).toBe(false);
      a.setPosition(600, 600);
      expect(a.position).toMatchObject({ x: 600, y: 600 });
    });

    it('VIEW mode locks too', () => {
      const engine = new DiagramEngine();
      const diagram = new DiagramModel();
      engine.setDiagram(diagram);
      engine.setMode(DiagramMode.VIEW);
      expect(diagram.isReadonly()).toBe(true);
    });

    it('a diagram attached to an engine ALREADY in presentation mode comes up LOCKED', () => {
      // The ordering race: without syncing on attach, read-only would depend on
      // whether the host called setMode() before or after loading the document.
      const engine = new DiagramEngine();
      engine.setMode(DiagramMode.PRESENTATION);

      const diagram = new DiagramModel();
      const a = mkNode('a', 0, 0);
      diagram.addNode(a); // added BEFORE attach, while the model is still free
      engine.setDiagram(diagram);

      expect(diagram.isReadonly()).toBe(true);
      a.setPosition(900, 900);
      expect(a.position).toMatchObject({ x: 0, y: 0 });
    });
  });
});
