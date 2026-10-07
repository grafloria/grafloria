/**
 * THE COMMIT (tile first, step 4a) — what a gesture writes into history.
 *
 * Every gesture ends the same way: each board it touched reports the tiles
 * whose cells or pixels differ from the snapshot taken when the gesture
 * entered it, and those deltas become commands. A widget's cell is on its
 * node (`SetGridItemCommand`, then the pixel move and resize the projection
 * derived); a container's cell is on its GROUP, together with the frame the
 * projection wrote. Both come out of ONE function here. Before this the node
 * path skipped groups "by design" and every site that could have displaced
 * a section rebuilt the group command by hand — six of them — and the one
 * that did not (the cross-board drop) dropped the target board's pushed
 * sections on the floor: the drop drew the push and never persisted it.
 */
import { Command, type DiagramModel } from '@grafloria/engine';
import { buildCommitCommands, gridItemFromCell, type CellRect, type TileDelta, type WorldRect } from './grid-mapping';

/**
 * A CONTAINER's cell lives in its group's metadata and its frame is what the
 * projection wrote for that cell: one command sets both, and undo puts both
 * back. (A node's cell rides on the node itself — see `buildCommitCommands`.)
 */
export class SetGroupCellCommand extends Command {
  constructor(
    private groupId: string,
    private cellBefore: CellRect,
    private cellAfter: CellRect,
    private frameBefore: WorldRect,
    private frameAfter: WorldRect
  ) {
    super('Resize section');
  }

  private apply(context: { diagram?: unknown }, cell: CellRect, frame: WorldRect): void {
    const diagram = context.diagram as DiagramModel | undefined;
    const grp = diagram?.getGroup(this.groupId);
    if (!grp) return;
    grp.setMetadata('gridItem', gridItemFromCell(cell));
    grp.setFrame({ ...frame });
  }

  override execute(context: { diagram?: unknown }): void {
    this.apply(context, this.cellAfter, this.frameAfter);
  }

  override undo(context: { diagram?: unknown }): void {
    this.apply(context, this.cellBefore, this.frameBefore);
  }

  override serialize() {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        cellBefore: this.cellBefore,
        cellAfter: this.cellAfter,
        frameBefore: this.frameBefore,
        frameAfter: this.frameAfter,
      },
    };
  }
}

/**
 * Steps that depend on each other's RESULT — create a group, then move a page
 * into it, then place the group on the board; or remove a member and then the
 * group it emptied — run as one history step. A batch checks every member's
 * `canExecute` before running any of them and every member's `canUndo` before
 * undoing any, and a membership command's precondition (its group exists) is
 * exactly what a neighbouring step creates or removes. This runs the chain in
 * order and reverses it on undo, judging nothing up front.
 */
export class SequenceCommand extends Command {
  constructor(name: string, private steps: Command[]) {
    super(name);
  }
  override execute(context: Parameters<Command['execute']>[0]): void {
    for (const c of this.steps) c.execute(context);
  }
  override undo(context: Parameters<Command['undo']>[0]): void {
    for (let i = this.steps.length - 1; i >= 0; i--) this.steps[i].undo(context);
  }
  override canExecute(): boolean {
    return true;
  }
  override canUndo(): boolean {
    return true;
  }
  override serialize() {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { steps: this.steps.map((c) => c.serialize()) } };
  }
}

const sameCell = (a: CellRect, b: CellRect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The frame a delta's pixels describe — a group's frame is its position and size in the model. */
const frameOf = (pos: { x: number; y: number }, size: { width: number; height: number }): WorldRect => ({
  x: pos.x,
  y: pos.y,
  width: size.width,
  height: size.height,
});

/**
 * The commands for every tile a board's deltas say moved — nodes AND groups,
 * in the deltas' order. A node's commands are its cell then its pixels; a
 * group's is one cell-and-frame command. A delta whose cell did not change
 * contributes nothing for a group (its frame follows its cell), and only the
 * pixel commands for a node (a fit board re-projects every tile when a row
 * comes or goes: the cells stand, the pixels move).
 */
export function tileCommands(deltas: TileDelta[]): Command[] {
  const out: Command[] = [];
  for (const d of deltas) {
    if (d.isGroup) {
      if (sameCell(d.cellBefore, d.cellAfter)) continue;
      out.push(new SetGroupCellCommand(d.id, d.cellBefore, d.cellAfter, frameOf(d.posBefore, d.sizeBefore), frameOf(d.posAfter, d.sizeAfter)));
      continue;
    }
    out.push(...buildCommitCommands([d]));
  }
  return out;
}
