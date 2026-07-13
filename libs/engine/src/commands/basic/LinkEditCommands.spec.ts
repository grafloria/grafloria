// Undoable link edits (wave4/edges)
//
// Wave 4 turns link STYLE and LABELS into live, user-facing state: self-loop
// size, parallel spacing, custom markers, a link template, HTML labels in three
// slots. `link.updateStyle()` and `link.addLabel()` mutate the model directly and
// are NOT undoable, so every one of those, when it comes from a gesture, has to
// go through a command. These are those commands.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { PortModel } from '../../models/PortModel';
import { LinkModel } from '../../models/LinkModel';
import { CommandContext } from '../Command';
import { CommandManager } from '../CommandManager';
import { UpdateLinkStyleCommand } from './UpdateLinkStyleCommand';
import { SetLinkLabelsCommand } from './SetLinkLabelsCommand';
import type { LinkLabel } from '../../types';

describe('Link edit commands (wave4/edges)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let manager: CommandManager;
  let link: LinkModel;

  beforeEach(() => {
    diagram = new DiagramModel();

    const a = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    a.addPort(new PortModel({ id: 'a-out', type: 'output', side: 'right' } as any));
    const b = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
    b.addPort(new PortModel({ id: 'b-in', type: 'input', side: 'left' } as any));
    diagram.addNode(a);
    diagram.addNode(b);

    link = new LinkModel('a-out', 'b-in');
    link.updateStyle({ stroke: '#111111', strokeWidth: 2 });
    diagram.addLink(link);

    context = { diagram, eventBus: { emit: jest.fn() }, store: new Map() };
    manager = new CommandManager(context, context.eventBus);
  });

  describe('UpdateLinkStyleCommand', () => {
    it('merges the new style in', async () => {
      await manager.execute(
        new UpdateLinkStyleCommand(link.id, { selfLoop: { size: 60 }, strokeWidth: 4 })
      );

      expect(link.style.selfLoop).toEqual({ size: 60 });
      expect(link.style.strokeWidth).toBe(4);
      // …without dropping what was already there
      expect(link.style.stroke).toBe('#111111');
    });

    it('undo REMOVES a property the command introduced (not just resets it)', async () => {
      await manager.execute(
        new UpdateLinkStyleCommand(link.id, { parallel: { spacing: 24 } })
      );
      expect(link.style.parallel).toEqual({ spacing: 24 });

      await manager.undo();

      // The naive implementation (merge the old style back over the new) would
      // leave `parallel` behind forever, because a merge cannot delete a key.
      expect(link.style.parallel).toBeUndefined();
      expect(link.style.stroke).toBe('#111111');
      expect(link.style.strokeWidth).toBe(2);
    });

    it('survives an execute → undo → redo → undo round trip', async () => {
      await manager.execute(new UpdateLinkStyleCommand(link.id, { template: 'audit' }));
      await manager.undo();
      expect(link.style.template).toBeUndefined();

      await manager.redo();
      expect(link.style.template).toBe('audit');

      await manager.undo();
      expect(link.style.template).toBeUndefined();
      expect(link.style.stroke).toBe('#111111');
    });

    it('is ONE undo entry per gesture', async () => {
      await manager.execute(
        new UpdateLinkStyleCommand(link.id, { cornerRadius: 9, curvature: 0.8 })
      );

      await manager.undo();
      expect(link.style.cornerRadius).toBeUndefined();
      expect(link.style.curvature).toBeUndefined();
    });

    it('refuses to execute against a link that is not in the diagram', () => {
      const command = new UpdateLinkStyleCommand('nope', { strokeWidth: 1 });
      expect(command.canExecute(context)).toBe(false);
    });
  });

  describe('SetLinkLabelsCommand', () => {
    const label = (id: string, text: string, extra: Partial<LinkLabel> = {}): LinkLabel => ({
      id,
      text,
      position: 0.5,
      offset: { x: 0, y: 0 },
      ...extra,
    });

    it('replaces the whole label array', async () => {
      await manager.execute(
        new SetLinkLabelsCommand(link.id, [
          label('l1', 'one', { slot: 'start' }),
          label('l2', 'two', { html: '<b>two</b>' }),
        ])
      );

      expect(link.labels).toHaveLength(2);
      expect(link.labels[0].slot).toBe('start');
      expect(link.labels[1].html).toBe('<b>two</b>');
    });

    it('undo restores the labels that were there before', async () => {
      link.addLabel({ id: 'original', text: 'original', position: 0.5 });

      await manager.execute(new SetLinkLabelsCommand(link.id, [label('new', 'new')]));
      expect(link.labels.map(l => l.id)).toEqual(['new']);

      await manager.undo();
      expect(link.labels.map(l => l.id)).toEqual(['original']);
    });

    it('undo restores an EMPTY label list (deleting the last label is undoable too)', async () => {
      link.addLabel({ id: 'only', text: 'only', position: 0.5 });

      await manager.execute(new SetLinkLabelsCommand(link.id, []));
      expect(link.labels).toHaveLength(0);

      await manager.undo();
      expect(link.labels).toHaveLength(1);
    });

    it('deep-copies, so mutating the caller\'s array afterwards cannot corrupt the model or the undo snapshot', async () => {
      const labels = [label('l1', 'one')];
      await manager.execute(new SetLinkLabelsCommand(link.id, labels));

      labels[0].text = 'MUTATED';
      labels[0].offset.x = 999;

      expect(link.labels[0].text).toBe('one');
      expect(link.labels[0].offset.x).toBe(0);
    });

    it('add-then-undo is ONE step, however many labels were added', async () => {
      await manager.execute(
        new SetLinkLabelsCommand(link.id, [
          label('a', 'a', { slot: 'start' }),
          label('b', 'b', { slot: 'center' }),
          label('c', 'c', { slot: 'end' }),
        ])
      );
      expect(link.labels).toHaveLength(3);

      await manager.undo();
      expect(link.labels).toHaveLength(0);
    });
  });
});
