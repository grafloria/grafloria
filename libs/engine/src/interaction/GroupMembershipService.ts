// GroupMembershipService - interactive drag-in / drag-out group membership (Wave-2)
//
// Engine-side service the canvas can call on node drag-end. It hit-tests the
// pointer against group bounds using the shared SpatialIndex (never a linear
// scan) and re-parents the dragged node into the group under the cursor,
// unembedding it when dropped outside every group. Membership changes are
// dispatched as AddToGroupCommand / RemoveFromGroupCommand so undo works, and
// a per-group `memberValidation` predicate can veto a drop.
//
// Coordinate model: the whole engine stores ABSOLUTE coordinates (Wave-2
// containment decision). Re-parenting therefore leaves a node's stored position
// untouched — it stays exactly where the user dropped it — and we only recompute
// the affected groups' derived bounds. `translateOnReparent` is the single seam
// where a relative-coordinate model would translate; here it is the identity.

import type { Point } from '../types/geometry.types';
import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel } from '../models/GroupModel';
import type { NodeModel } from '../models/NodeModel';
import { SpatialIndex } from '../performance/SpatialIndex';
import { Command } from '../commands/Command';
import { AddToGroupCommand } from '../commands/basic/AddToGroupCommand';
import { RemoveFromGroupCommand } from '../commands/basic/RemoveFromGroupCommand';

/**
 * Minimal command dispatcher contract (satisfied by CommandManager). Injecting
 * this keeps membership changes on the shared undo stack.
 */
export interface CommandDispatcher {
  execute(command: Command): Promise<void> | void;
}

export interface GroupMembershipServiceOptions {
  diagram: DiagramModel;
  /**
   * Dispatcher for undoable membership changes (typically a CommandManager).
   * When omitted, commands are executed directly against the diagram (still
   * correct, but not tracked for undo/redo).
   */
  dispatcher?: CommandDispatcher;
  /** Grid cell size for the group spatial index (default 100). */
  cellSize?: number;
}

/** Options for a single hit-test. */
export interface HitTestOptions {
  /** Group ids to skip (e.g. the group being dragged + its descendants). */
  excludeGroupIds?: Set<string>;
}

/** Outcome of a node drag-end reparent attempt. */
export interface DropResult {
  nodeId: string;
  /** Group the node left (if it was a member of one). */
  fromGroupId?: string;
  /** Group the node joined (undefined when dropped outside all groups). */
  toGroupId?: string;
  /** Commands dispatched, in order (empty when nothing changed). */
  commands: Command[];
  /** Whether membership actually changed. */
  changed: boolean;
  /** A target group was under the cursor but rejected the node. */
  rejected: boolean;
}

export class GroupMembershipService {
  private readonly diagram: DiagramModel;
  private readonly dispatcher?: CommandDispatcher;
  private readonly index: SpatialIndex<GroupModel>;
  private hoveredGroupId?: string;

  constructor(options: GroupMembershipServiceOptions) {
    this.diagram = options.diagram;
    this.dispatcher = options.dispatcher;
    this.index = new SpatialIndex<GroupModel>({
      cellSize: options.cellSize ?? 100,
      getBounds: (group) => this.groupRect(group),
    });
  }

  /**
   * Rebuild the spatial index from the diagram's current groups. Group counts
   * are small relative to nodes, so a full refresh per interaction is cheap and
   * always reflects freshly-dragged geometry.
   */
  refresh(): void {
    this.index.clear();
    for (const group of this.diagram.getGroups()) {
      // Ensure a usable rectangle exists before indexing.
      if (!group.bounds && !group.size && group.members.size > 0) {
        group.calculateBounds(this.diagram);
      }
      const rect = this.groupRect(group);
      if (rect.width > 0 || rect.height > 0) {
        this.index.add(group);
      }
    }
  }

  /**
   * Hit-test a point against group rectangles using the spatial index and
   * return the innermost matching group (deepest nesting, then smallest area),
   * so a nested child wins over its parent. Returns undefined when the point is
   * outside every group.
   */
  hitTestGroup(point: Point, options?: HitTestOptions): GroupModel | undefined {
    this.refresh();

    // Query a degenerate 1x1 region at the point; SpatialIndex returns every
    // group whose cell overlaps, then we confirm true containment.
    const candidates = this.index.queryRegion(
      { x: point.x, y: point.y, width: 0, height: 0 },
      {
        filter: (group) =>
          !options?.excludeGroupIds?.has(group.id) &&
          this.rectContains(this.groupRect(group), point),
      }
    );

    if (candidates.length === 0) {
      return undefined;
    }

    // Innermost wins: sort by depth desc, then area asc.
    candidates.sort((a, b) => {
      const depthDiff = this.diagram.getDepth(b.id) - this.diagram.getDepth(a.id);
      if (depthDiff !== 0) {
        return depthDiff;
      }
      return this.rectArea(this.groupRect(a)) - this.rectArea(this.groupRect(b));
    });

    return candidates[0];
  }

  /**
   * Return the first group that currently contains `entityId` as a direct
   * member, or undefined. (Membership check over the small group set — this is
   * not the spatial hit-test.)
   */
  getContainingGroup(entityId: string): GroupModel | undefined {
    for (const group of this.diagram.getGroups()) {
      if (group.members.has(entityId)) {
        return group;
      }
    }
    return undefined;
  }

  /**
   * Highlight the group under the cursor during a drag and clear any previously
   * hovered group. Returns the hovered group (or undefined). Drives the group's
   * 'hover:changed' emitter so a renderer can outline the drop target.
   */
  updateHover(point: Point, options?: HitTestOptions): GroupModel | undefined {
    const target = this.hitTestGroup(point, options);
    if (target?.id === this.hoveredGroupId) {
      return target;
    }

    // Clear previous highlight.
    if (this.hoveredGroupId) {
      this.diagram.getGroup(this.hoveredGroupId)?.setHovered(false);
    }

    this.hoveredGroupId = target?.id;
    target?.setHovered(true);
    return target;
  }

  /** Clear any active hover highlight (call on drag-end / cancel). */
  clearHover(): void {
    if (this.hoveredGroupId) {
      this.diagram.getGroup(this.hoveredGroupId)?.setHovered(false);
      this.hoveredGroupId = undefined;
    }
  }

  /**
   * Handle a node drag-end at `point`: re-parent the node into the group under
   * the cursor, or unembed it when dropped outside every group. No-op when the
   * node is already in the target group. Rejected (no change) when the target
   * group's validation/cycle rules veto the node.
   */
  async handleNodeDragEnd(nodeId: string, point: Point): Promise<DropResult> {
    const result: DropResult = {
      nodeId,
      commands: [],
      changed: false,
      rejected: false,
    };

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      this.clearHover();
      return result;
    }

    const currentGroup = this.getContainingGroup(nodeId);
    const target = this.hitTestGroup(point);

    result.fromGroupId = currentGroup?.id;
    result.toGroupId = target?.id;

    // Dropped back into the same group (or stayed ungrouped): nothing to do.
    if ((target?.id ?? undefined) === (currentGroup?.id ?? undefined)) {
      this.clearHover();
      return result;
    }

    // Validate the destination before mutating anything.
    if (target && !target.canAddMember(nodeId, this.diagram)) {
      result.rejected = true;
      this.clearHover();
      return result;
    }

    // Leave the current group first so undo replays cleanly.
    if (currentGroup) {
      const remove = new RemoveFromGroupCommand(currentGroup.id, nodeId);
      await this.dispatch(remove);
      result.commands.push(remove);
    }

    // Join the target group (if any), translating coordinates on reparent.
    if (target) {
      this.translateOnReparent(node, currentGroup, target);
      const add = new AddToGroupCommand(target.id, nodeId);
      await this.dispatch(add);
      result.commands.push(add);
      target.calculateBounds(this.diagram);
    }

    // Refresh the source group's derived bounds now that it lost a member.
    if (currentGroup) {
      currentGroup.calculateBounds(this.diagram);
    }

    result.changed = result.commands.length > 0;
    this.clearHover();
    return result;
  }

  /**
   * Coordinate translation seam for reparenting. In the engine's ABSOLUTE model
   * a node keeps its world position across a reparent (it stays where it was
   * dropped), so this is the identity for `node.position`. Group bounds are
   * derived from absolute member positions and are recomputed by the caller.
   * Isolated here so a future relative-coordinate model has one place to change.
   */
  private translateOnReparent(
    _node: NodeModel,
    _fromGroup: GroupModel | undefined,
    _toGroup: GroupModel
  ): void {
    // Absolute storage: no position change on reparent (documented decision).
  }

  private async dispatch(command: Command): Promise<void> {
    if (this.dispatcher) {
      await this.dispatcher.execute(command);
    } else {
      // Fallback: execute directly (not undoable) against a minimal context.
      await command.execute({ diagram: this.diagram, eventBus: undefined });
    }
  }

  /** Resolve a group's screen rectangle for spatial indexing / hit-testing. */
  private groupRect(group: GroupModel): { x: number; y: number; width: number; height: number } {
    if (group.bounds) {
      return {
        x: group.bounds.x,
        y: group.bounds.y,
        width: group.bounds.width,
        height: group.bounds.height,
      };
    }
    if (group.size) {
      return {
        x: group.position.x,
        y: group.position.y,
        width: group.size.width,
        height: group.size.height,
      };
    }
    return { x: group.position.x, y: group.position.y, width: 0, height: 0 };
  }

  private rectContains(
    rect: { x: number; y: number; width: number; height: number },
    point: Point
  ): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  private rectArea(rect: { width: number; height: number }): number {
    return rect.width * rect.height;
  }
}
