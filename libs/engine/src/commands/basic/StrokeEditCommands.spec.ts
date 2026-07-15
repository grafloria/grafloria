// Undoable stroke edits (wave13/stroke-edit)
//
// StrokeModel.setPoints existed, captured correctly, and was proven by the collab
// fuzz — but NOTHING undoable ever called it: there was no stroke command at all,
// so a gesture that moved ink could not be a history step. This is that command.

import { DiagramModel } from '../../models/DiagramModel';
import { StrokeModel, type StrokePoint } from '../../models/StrokeModel';
import { CommandContext } from '../Command';
import { CommandManager } from '../CommandManager';
import { SetStrokePointsCommand } from './SetStrokePointsCommand';

describe('SetStrokePointsCommand (wave13/stroke-edit)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let manager: CommandManager;
  let stroke: StrokeModel;

  const BASE: StrokePoint[] = [
    { x: 10, y: 10, pressure: 0.2 },
    { x: 60, y: 40, pressure: 0.6 },
    { x: 120, y: 30, pressure: 0.9 },
  ];

  const translate = (pts: readonly StrokePoint[], dx: number, dy: number): StrokePoint[] =>
    pts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));

  beforeEach(() => {
    diagram = new DiagramModel();
    stroke = new StrokeModel(BASE, { color: '#1f2933', width: 3 }, { id: 'ink-1' });
    diagram.addStroke(stroke);

    context = { diagram, eventBus: { emit: jest.fn() }, store: new Map() };
    manager = new CommandManager(context, context.eventBus);
  });

  it('replaces the geometry, and undo restores it EXACTLY — pressure included', async () => {
    const moved = translate(BASE, 150, -80);
    await manager.execute(new SetStrokePointsCommand('ink-1', moved));

    expect(stroke.getPoints()).toEqual(moved);

    await manager.undo();
    expect(stroke.getPoints()).toEqual(BASE);

    await manager.redo();
    expect(stroke.getPoints()).toEqual(moved);
  });

  it('a translate is ONE history step and calls setPoints ONCE per direction (one op on the wire)', async () => {
    const spy = jest.spyOn(stroke, 'setPoints');
    await manager.execute(new SetStrokePointsCommand('ink-1', translate(BASE, 5, 5)));
    expect(spy).toHaveBeenCalledTimes(1);

    await manager.undo();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(stroke.getPoints()).toEqual(BASE);
  });

  it('honours a caller-supplied FROM snapshot when the model already sits at TO (the gesture-commit pattern)', async () => {
    // The tool gave live feedback and the model is ALREADY at the destination…
    const moved = translate(BASE, 40, 25);
    stroke.setPoints(moved);

    // …so the command must trust the gesture-start snapshot, not a fresh read.
    await manager.execute(new SetStrokePointsCommand('ink-1', moved, BASE));
    expect(stroke.getPoints()).toEqual(moved);

    await manager.undo();
    expect(stroke.getPoints()).toEqual(BASE);
  });

  it('invalidates the bounds — a translated stroke is culled/hit-tested where it now IS', async () => {
    const before = stroke.getBounds();
    await manager.execute(new SetStrokePointsCommand('ink-1', translate(BASE, 200, 0)));
    const after = stroke.getBounds();
    expect(after.x).toBeCloseTo(before.x + 200);
    expect(stroke.hitTest(210, 10, 2)).toBe(true);
    expect(stroke.hitTest(10, 10, 2)).toBe(false);
  });

  it('refuses to execute against a stroke that does not exist', () => {
    const cmd = new SetStrokePointsCommand('no-such-ink', BASE);
    expect(cmd.canExecute(context)).toBe(false);
    expect(() => cmd.execute(context)).toThrow('no-such-ink');
  });

  it('never merges — one edit gesture is its own undo step', () => {
    const cmd = new SetStrokePointsCommand('ink-1', BASE);
    expect(cmd.canMergeWith()).toBe(false);
  });

  it('serializes its FROM and TO (the history-persistence contract)', async () => {
    const moved = translate(BASE, 1, 1);
    const cmd = new SetStrokePointsCommand('ink-1', moved);
    await manager.execute(cmd);
    const doc = cmd.serialize();
    expect(doc.data['strokeId']).toBe('ink-1');
    expect(doc.data['newPoints']).toEqual(moved);
    expect(doc.data['oldPoints']).toEqual(BASE);
  });
});
