import { Command, CommandContext, SerializedCommand } from '../Command';
import type { GroupModel } from '../../models/GroupModel';
import type { DiagramModel } from '../../models/DiagramModel';
import type { GroupFrameSnapshot } from './MoveGroupCommand';

/**
 * Adds a node, link or group to a group, as one undoable step.
 *
 * A member that joins from outside the frame is taken in: the frame grows (it
 * never shrinks) to contain the member plus the group's padding and header
 * band, and each enclosing group grows to contain the grown frame. A group
 * with no frame yet gets one fitted around its members. Undo removes the
 * member and puts every frame back exactly as it was.
 *
 * Frames that something else owns are left alone: a collapsed group, a layout
 * container (`setLayout`), a swimlane or pool (`laneConfig`), a group that
 * confines its members (`constrainChildren`: its frame is the extent they are
 * kept inside), and a group drawn without a frame
 * (`metadata.frameChrome === 'none'`, as dashboard boards are).
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
    group.addMember(this.entityId);
    this.refitted = [];
    if (joined && group.members.has(this.entityId)) this.refit(diagram, group);
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

  /** Grow `group`, then each enclosing group, to contain what is inside it. */
  private refit(diagram: DiagramModel, group: GroupModel): void {
    const seen = new Set<string>();
    let current: GroupModel | undefined = group;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (!ownsItsFrame(current)) break;
      const before: GroupFrameSnapshot = {
        position: { ...current.position },
        size: current.size ? { ...current.size } : undefined,
        bounds: current.bounds ? { ...current.bounds } : undefined,
      };
      if (!current.growToFitMembers(diagram)) break;
      this.refitted.push({ groupId: current.id, before });
      current = current.parentGroupId ? diagram.getGroup(current.parentGroupId) : undefined;
    }
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

/** Whether a new member may grow this group's frame (see the class comment). */
function ownsItsFrame(group: GroupModel): boolean {
  return (
    !group.isCollapsed &&
    !group.hasLayout() &&
    !group.laneConfig &&
    group.constrainChildren !== true &&
    group.getMetadata('frameChrome') !== 'none'
  );
}
