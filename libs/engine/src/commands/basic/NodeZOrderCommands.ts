// NodeZOrderCommands - undoable stacking-order edits for nodes (C)
//
// `GroupModel` has had `zIndex` + `bringToFront`/`sendToBack` since Wave-5, but
// there was no node equivalent and no command at all: restacking a node meant
// writing `style.zIndex` directly, which is invisible to undo and to the diff /
// collab layers. These are the document-write surface for `NodeModel.zIndex`.
//
// All three undo to the node's PREVIOUS z-index — including back to `undefined`
// ("never stated one"), which is a distinct state from `0` and must be restored as
// such or an undo would quietly promote every node above the legacy `style.zIndex`
// stack it used to defer to.

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { NodeModel } from '../../models/NodeModel';

/** Shared plumbing: snapshot the old z-index, restore it verbatim on undo. */
abstract class NodeZOrderCommand extends Command {
  protected oldZIndex?: number;
  protected captured = false;

  constructor(protected nodeId: string, name: string) {
    super(name);
  }

  protected resolve(context: CommandContext): NodeModel {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }
    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }
    return node;
  }

  override execute(context: CommandContext): void {
    const node = this.resolve(context);
    if (!this.captured) {
      this.oldZIndex = node.zIndex;
      this.captured = true;
    }
    this.applyTo(node, context);
  }

  protected abstract applyTo(node: NodeModel, context: CommandContext): void;

  override undo(context: CommandContext): void {
    this.resolve(context).setZIndex(this.oldZIndex);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram?.getNode?.(this.nodeId) !== undefined;
  }

  override canUndo(context: CommandContext): boolean {
    return this.canExecute(context);
  }
}

/** Set a node's stacking index to an explicit value. */
export class SetNodeZIndexCommand extends NodeZOrderCommand {
  constructor(nodeId: string, private zIndex: number) {
    super(nodeId, 'Set Node Z-Index');
  }

  protected override applyTo(node: NodeModel): void {
    node.setZIndex(this.zIndex);
  }

  override canMergeWith(other: Command): boolean {
    return other instanceof SetNodeZIndexCommand && other.nodeId === this.nodeId;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, zIndex: this.zIndex, oldZIndex: this.oldZIndex },
    };
  }

  override getDescription(): string {
    return `Set z-index of node ${this.nodeId} to ${this.zIndex}`;
  }
}

/** Lift a node above every other node in the diagram. */
export class BringNodeToFrontCommand extends NodeZOrderCommand {
  constructor(nodeId: string) {
    super(nodeId, 'Bring Node To Front');
  }

  protected override applyTo(node: NodeModel, context: CommandContext): void {
    node.bringToFront(context.diagram);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, oldZIndex: this.oldZIndex },
    };
  }

  override getDescription(): string {
    return `Bring node ${this.nodeId} to front`;
  }
}

/** Drop a node behind every other node in the diagram. */
export class SendNodeToBackCommand extends NodeZOrderCommand {
  constructor(nodeId: string) {
    super(nodeId, 'Send Node To Back');
  }

  protected override applyTo(node: NodeModel, context: CommandContext): void {
    node.sendToBack(context.diagram);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, oldZIndex: this.oldZIndex },
    };
  }

  override getDescription(): string {
    return `Send node ${this.nodeId} to back`;
  }
}
