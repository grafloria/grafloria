import { DiagramModel, GroupModel } from '@grafloria/engine';
import { SequenceCommand, SetGroupCellCommand, tileCommands } from './commit';
import type { TileDelta } from './grid-mapping';

const delta = (over: Partial<TileDelta> & { id: string }): TileDelta => ({
  cellBefore: { x: 0, y: 0, w: 2, h: 1 },
  cellAfter: { x: 0, y: 0, w: 2, h: 1 },
  posBefore: { x: 10, y: 10 },
  posAfter: { x: 10, y: 10 },
  sizeBefore: { width: 100, height: 50 },
  sizeAfter: { width: 100, height: 50 },
  ...over,
});

/** A command context with the model — the bus is never touched by these commands. */
const ctx = (model: DiagramModel) => ({ diagram: model, eventBus: {} }) as never;

const names = (cmds: { constructor: { name: string } }[]): string[] => cmds.map((c) => c.constructor.name);

describe('tileCommands — one rule for nodes and groups (tile first, step 4a)', () => {
  it('a node that moved gets its cell, then its pixels', () => {
    const cmds = tileCommands([delta({ id: 'w', cellAfter: { x: 3, y: 1, w: 2, h: 1 }, posAfter: { x: 310, y: 80 } })]);
    expect(names(cmds)).toEqual(['SetGridItemCommand', 'MoveNodeCommand']);
  });

  it('a node whose cell stood still but whose pixels moved (a fit board re-projected) gets only the pixel command', () => {
    const cmds = tileCommands([delta({ id: 'w', posAfter: { x: 10, y: 22 } })]);
    expect(names(cmds)).toEqual(['MoveNodeCommand']);
  });

  it('a GROUP that moved gets ONE cell-and-frame command, built from the delta itself — no site rebuilds it by hand', () => {
    const cmds = tileCommands([
      delta({ id: 'sec', isGroup: true, cellAfter: { x: 0, y: 5, w: 2, h: 1 }, posAfter: { x: 10, y: 360 }, sizeAfter: { width: 100, height: 50 } }),
    ]);
    expect(names(cmds)).toEqual(['SetGroupCellCommand']);
    // Applied to a model: the group's cell metadata and its frame both change, and undo restores both.
    const model = new DiagramModel('d');
    const grp = new GroupModel({ id: 'sec', name: 'Section' });
    grp.setFrame({ x: 10, y: 10, width: 100, height: 50 });
    grp.setMetadata('gridItem', { x: 0, y: 0, w: 2, h: 1 });
    model.addGroup(grp);
    cmds[0].execute(ctx(model));
    expect(model.getGroup('sec')!.getMetadata('gridItem')).toMatchObject({ columnStart: 1, columnEnd: 3, rowStart: 6, rowEnd: 7 }); // grid lines, 1-based
    expect(model.getGroup('sec')!.position).toEqual({ x: 10, y: 360 });
    cmds[0].undo(ctx(model));
    expect(model.getGroup('sec')!.getMetadata('gridItem')).toMatchObject({ columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 2 });
    expect(model.getGroup('sec')!.position).toEqual({ x: 10, y: 10 });
  });

  it('a group whose cell stood still contributes nothing — its frame follows its cell', () => {
    expect(tileCommands([delta({ id: 'sec', isGroup: true, posAfter: { x: 10, y: 22 } })])).toEqual([]);
  });

  it('a pinned node commits its cell and nothing else', () => {
    const cmds = tileCommands([delta({ id: 'w', locked: true, cellAfter: { x: 3, y: 1, w: 2, h: 1 }, posAfter: { x: 310, y: 80 } })]);
    expect(names(cmds)).toEqual(['SetGridItemCommand']);
  });

  it('keeps the deltas\' order across nodes and groups', () => {
    const cmds = tileCommands([
      delta({ id: 'a', cellAfter: { x: 1, y: 0, w: 2, h: 1 } }),
      delta({ id: 'sec', isGroup: true, cellAfter: { x: 0, y: 5, w: 2, h: 1 } }),
      delta({ id: 'b', cellAfter: { x: 4, y: 0, w: 2, h: 1 } }),
    ]);
    expect(names(cmds)).toEqual(['SetGridItemCommand', 'SetGroupCellCommand', 'SetGridItemCommand']);
  });
});

describe('SequenceCommand', () => {
  it('runs its steps in order and undoes them in reverse, judging nothing up front', () => {
    const log: string[] = [];
    const step = (n: string) =>
      new (class extends SequenceCommand {
        constructor() {
          super(n, []);
        }
        override execute(): void {
          log.push(`do ${n}`);
        }
        override undo(): void {
          log.push(`undo ${n}`);
        }
      })();
    const seq = new SequenceCommand('two', [step('a'), step('b')]);
    expect(seq.canExecute()).toBe(true);
    seq.execute({} as never);
    seq.undo({} as never);
    expect(log).toEqual(['do a', 'do b', 'undo b', 'undo a']);
    expect(seq.serialize().data.steps).toHaveLength(2);
  });
  it('SetGroupCellCommand serializes its cells and frames', () => {
    const c = new SetGroupCellCommand('g', { x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }, { x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 });
    expect(c.serialize().data).toMatchObject({ groupId: 'g', cellAfter: { x: 1, y: 0, w: 1, h: 1 }, frameAfter: { x: 10 } });
  });
});
