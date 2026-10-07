import { Command, CommandContext, SerializedCommand } from '../Command';
import type { GroupModel } from '../../models/GroupModel';
import type { DiagramModel } from '../../models/DiagramModel';
import type { GroupFrameSnapshot } from './MoveGroupCommand';

/**
 * Adds a node, link or group to a group, as one undoable step.
 *
 * A member that joins from outside the frame is taken in: the frame grows (it
 * never shrinks) to contain the member plus the group's padding and header
 * band, and each enclosing group grows to contain the grown frame —
 * `GroupModel.addMember` does that itself, on every path. On top of it, a
 * group with no frame yet gets one fitted around its members here. Undo
 * removes the member and puts every frame back exactly as it was.
 *
 * Frames that something else owns are left alone (see
 * `GroupModel.ownsItsFrame`): a collapsed group, a layout container, a lane
 * or pool, a confining group, and a group drawn without a frame.
 */
export class AddToGroupCommand extends Command {
  /** The frames this execution changed, outermost last, for undo. */
  private refitted: Array<{ groupId: string; before: GroupFrameSnapshot }> = [];

  constructor(
    private groupId: string,
    private entityId: string
  ) {
    super('Add To Group');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const group = diagram.getGroup(this.groupId);
    if (!group) {
      throw new Error(`Group ${this.groupId} not found`);
    }

    const joined = !group.members.has(this.entityId);
    // Snapshot BEFORE addMember: the model grows the frames as the member joins.
    const before = joined ? frameChain(diagram, group) : [];
    group.addMember(this.entityId);
    this.refitted = [];
    if (!joined || !group.members.has(this.entityId)) return;
    // A group with no frame yet: the model leaves it to whoever fits it; a
    // deliberate join through the command gives it one.
    if (!group.size && group.ownsItsFrame()) group.growToFitMembers(diagram);
    for (const snap of before) {
      const now = diagram.getGroup(snap.groupId);
      if (now && !sameFrame(now, snap.before)) this.refitted.push(snap);
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const group = diagram.getGroup(this.groupId);
    if (!group) {
      throw new Error(`Group ${this.groupId} not found`);
    }

    group.removeMember(this.entityId);
    for (const { groupId, before } of [...this.refitted].reverse()) {
      diagram.getGroup(groupId)?.restoreGeometry({
        position: { ...before.position },
        size: before.size ? { ...before.size } : undefined,
        bounds: before.bounds ? { ...before.bounds } : undefined,
      });
    }
    this.refitted = [];
  }

  override canExecute(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    // Check group exists
    const group = context.diagram.getGroup(this.groupId);
    if (!group) {
      return false;
    }

    // Check entity exists (node, link, or nested group). Groups may be members
    // of groups for compound-graph nesting.
    const entityExists =
      context.diagram.nodes.has(this.entityId) ||
      context.diagram.links.has(this.entityId) ||
      context.diagram.groups.has(this.entityId);

    return entityExists;
  }

  override canUndo(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    const group = context.diagram.getGroup(this.groupId);
    return !!group && group.members.has(this.entityId);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        entityId: this.entityId,
      },
    };
  }

  override getDescription(): string {
    return `Add entity ${this.entityId} to group ${this.groupId}`;
  }
}

/** `group` and each enclosing group, with their frames as they are now. */
function frameChain(
  diagram: DiagramModel,
  group: GroupModel
): Array<{ groupId: string; before: GroupFrameSnapshot }> {
  const out: Array<{ groupId: string; before: GroupFrameSnapshot }> = [];
  const seen = new Set<string>();
  let current: GroupModel | undefined = group;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push({
      groupId: current.id,
      before: {
        position: { ...current.position },
        size: current.size ? { ...current.size } : undefined,
        bounds: current.bounds ? { ...current.bounds } : undefined,
      },
    });
    current = current.parentGroupId ? diagram.getGroup(current.parentGroupId) : undefined;
  }
  return out;
}

function sameFrame(group: GroupModel, frame: GroupFrameSnapshot): boolean {
  const s = group.size;
  const b = group.bounds;
  return (
    group.position.x === frame.position.x &&
    group.position.y === frame.position.y &&
    s?.width === frame.size?.width &&
    s?.height === frame.size?.height &&
    b?.x === frame.bounds?.x &&
    b?.y === frame.bounds?.y &&
    b?.width === frame.bounds?.width &&
    b?.height === frame.bounds?.height
  );
}
