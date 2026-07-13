/**
 * Wave 4 — Card 5: in-place text editing.
 *
 * The point of these tests is the COMMIT path: editing a node label — and, for
 * the first time, an edge label — goes through the command layer, so it undoes.
 */
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  SetNodeLabelCommand,
  SetLinkLabelCommand,
} from '@grafloria/engine';
import { InPlaceTextEditor } from './in-place-editor';

describe('Card 5 — InPlaceTextEditor', () => {
  let editor: InPlaceTextEditor;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    editor = new InPlaceTextEditor();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-editor');
  });

  afterEach(() => engine.destroy());

  function addNode(label?: string): NodeModel {
    const node = new NodeModel({
      type: 'test',
      position: { x: 100, y: 100 },
      size: { width: 120, height: 60, depth: 0 },
    });
    if (label) node.setMetadata('label', label);
    diagram.addNode(node);
    return node;
  }

  describe('node labels', () => {
    test('begin reports the current text and the box to cover', () => {
      const node = addNode('Hello');
      const session = editor.begin(engine, { type: 'node', nodeId: node.id })!;

      expect(session.value).toBe('Hello');
      expect(session.bounds).toEqual({ x: 100, y: 100, width: 120, height: 60 });
      expect(session.center).toEqual({ x: 160, y: 130 });
      expect(session.multiline).toBe(true);
      expect(editor.isEditing()).toBe(true);
    });

    test('commit returns ONE undoable SetNodeLabelCommand', async () => {
      const node = addNode('Old');
      editor.begin(engine, { type: 'node', nodeId: node.id });

      const command = editor.commit(engine, 'New')!;
      expect(command).toBeInstanceOf(SetNodeLabelCommand);
      await engine.commandManager.execute(command);
      expect(node.getMetadata('label')).toBe('New');

      await engine.undo();
      expect(node.getMetadata('label')).toBe('Old');
    });

    test('an unchanged value commits nothing (no empty undo entry)', () => {
      const node = addNode('Same');
      editor.begin(engine, { type: 'node', nodeId: node.id });
      expect(editor.commit(engine, 'Same')).toBeNull();
      expect(editor.isEditing()).toBe(false);
    });

    test('refuses to open on a locked or non-editable node', () => {
      const locked = addNode('L');
      locked.setState({ locked: true });
      expect(editor.begin(engine, { type: 'node', nodeId: locked.id })).toBeNull();

      const readonly = addNode('R');
      readonly.behavior.editable = false;
      expect(editor.begin(engine, { type: 'node', nodeId: readonly.id })).toBeNull();
    });

    test('cancel leaves the model untouched', () => {
      const node = addNode('Keep');
      editor.begin(engine, { type: 'node', nodeId: node.id });
      editor.cancel();

      expect(editor.isEditing()).toBe(false);
      expect(node.getMetadata('label')).toBe('Keep');
    });
  });

  describe('link labels', () => {
    function linkWithLabel(text: string): LinkModel {
      const a = addNode();
      const b = addNode();
      const link = new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id);
      link.setPoints([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);
      link.labels = [{ id: 'l1', text, position: 0.5, offset: { x: 0, y: -6 } } as any];
      diagram.addLink(link);
      return link;
    }

    test('the editor is anchored ON the label (route point + its offset)', () => {
      const link = linkWithLabel('yes');
      const session = editor.begin(engine, {
        type: 'link-label',
        linkId: link.id,
        labelIndex: 0,
      })!;

      expect(session.value).toBe('yes');
      expect(session.center).toEqual({ x: 50, y: -6 }); // midpoint + offset
      expect(session.multiline).toBe(false);
    });

    test('committing an edge label is UNDOABLE (it never was before)', async () => {
      const link = linkWithLabel('old');
      editor.begin(engine, { type: 'link-label', linkId: link.id, labelIndex: 0 });

      const command = editor.commit(engine, 'new')!;
      expect(command).toBeInstanceOf(SetLinkLabelCommand);
      await engine.commandManager.execute(command);
      expect(link.labels[0]!.text).toBe('new');

      await engine.undo();
      expect(link.labels[0]!.text).toBe('old');
    });

    test('a missing label opens nothing', () => {
      const link = linkWithLabel('x');
      expect(
        editor.begin(engine, { type: 'link-label', linkId: link.id, labelIndex: 7 })
      ).toBeNull();
    });
  });
});
