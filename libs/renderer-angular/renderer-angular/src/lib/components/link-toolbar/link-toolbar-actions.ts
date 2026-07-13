import {
  AddLinkCommand,
  AddNodeCommand,
  DiagramEngine,
  LinkModel,
  MacroCommand,
  NodeModel,
  RemoveLinkCommand,
} from '@grafloria/engine';
import { Point, splitPolylineAt } from './rendered-link-path';

/**
 * Wave 3 (Edges & links), Card B — what a link-toolbar button is handed.
 *
 * Unlike a node action (which only needs the node), an edge action needs to
 * know WHERE on the edge it was invoked: "insert node here" is meaningless
 * without the split point.
 */
export interface LinkActionContext {
  link: LinkModel;
  engine: DiagramEngine;
  /** Fraction along the RENDERED path where the toolbar sits (0-1). */
  t: number;
  /** World-space point at `t` — i.e. exactly under the button the user pressed. */
  point: Point;
  /** Unit direction of travel at `t`; decides which sides an inserted node connects on. */
  tangent?: Point;
}

/**
 * Mirrors node-toolbar's ToolbarAction, retyped around LinkActionContext.
 * (Same shape, same rendering contract, same keyboard handling.)
 */
export interface LinkToolbarAction {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  disabled?: boolean;
  hidden?: boolean;
  visible?: (ctx: LinkActionContext) => boolean;
  onClick: (ctx: LinkActionContext) => void;
  group?: string;
  shortcut?: string;
}

export interface InsertNodeOnEdgeOptions {
  /** Type of the node dropped onto the edge (default `'basic'`). */
  nodeType?: string;
  /** Size of the inserted node (default 100×50). */
  size?: { width: number; height: number };
  /** Seed data/label for the new node. */
  data?: Record<string, any>;
  /** Label written to the node's `label` metadata (what most shapes render). */
  label?: string;
  /** Hook to customise the node before it is committed (set style, ports, …). */
  configure?: (node: NodeModel) => void;
}

/**
 * Delete the link. Routed through RemoveLinkCommand so it lands on the undo
 * stack (diagram.removeLink() alone is NOT undoable).
 */
export function createDeleteLinkAction(engine: DiagramEngine): LinkToolbarAction {
  return {
    id: 'delete-link',
    label: 'Delete',
    icon: 'fa fa-trash',
    tooltip: 'Delete link',
    onClick: (ctx: LinkActionContext) => {
      void engine.commandManager
        .execute(new RemoveLinkCommand(ctx.link.id))
        .catch(err => console.error('LinkToolbar: delete failed', err));
    },
  };
}

/**
 * Insert a node ON the edge: the link is split at the toolbar's anchor and the
 * new node is spliced in between the two halves.
 */
export function createInsertNodeAction(
  engine: DiagramEngine,
  options: InsertNodeOnEdgeOptions = {}
): LinkToolbarAction {
  return {
    id: 'insert-node',
    label: 'Insert node',
    icon: 'fa fa-plus',
    tooltip: 'Insert a node on this link',
    onClick: (ctx: LinkActionContext) => {
      void insertNodeOnEdge(engine, ctx.link, ctx.t, ctx.point, ctx.tangent, options).catch(err =>
        console.error('LinkToolbar: insert-node-on-edge failed', err)
      );
    },
  };
}

/** The two built-ins, in the order they read best on the toolbar. */
export function createDefaultLinkActions(engine: DiagramEngine): LinkToolbarAction[] {
  return [createInsertNodeAction(engine), createDeleteLinkAction(engine)];
}

/**
 * Split a link around a new node, as ONE undoable step.
 *
 * The whole splice is wrapped in a MacroCommand — remove the old link, add the
 * node, add the two halves — so a single Ctrl+Z restores the original edge
 * exactly (MacroCommand undoes its steps in reverse).
 *
 * MANUAL WAYPOINTS ARE RESPECTED: a hand-routed link keeps its shape. The
 * waypoints upstream of the split stay on the first half, the downstream ones
 * move to the second, and each half is re-flagged `hasManualWaypoints` only if
 * it actually inherited any (otherwise it auto-routes, as a fresh link should).
 *
 * @returns the ids of the created node and links, or null if the split was impossible.
 */
export async function insertNodeOnEdge(
  engine: DiagramEngine,
  link: LinkModel,
  t: number,
  point: Point,
  tangent?: Point,
  options: InsertNodeOnEdgeOptions = {}
): Promise<{ nodeId: string; sourceLinkId: string; targetLinkId: string } | null> {
  const diagram = engine.getDiagram();
  if (!diagram || !diagram.getLink(link.id)) {
    return null;
  }

  const size = options.size ?? { width: 100, height: 50 };

  // Centre the node ON the split point.
  const node = new NodeModel({
    type: options.nodeType ?? 'basic',
    position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
    size,
  });
  if (options.data) node.data = { ...node.data, ...options.data };
  if (options.label !== undefined) node.setMetadata('label', options.label);
  options.configure?.(node);

  // Enter/exit on the sides the path actually travels through, so the two
  // halves leave and re-join the node facing the way the edge was already going.
  const { entry, exit } = portSidesForTangent(tangent);
  const entryPort = node.getPortBySide(entry);
  const exitPort = node.getPortBySide(exit);
  if (!entryPort || !exitPort) {
    return null;
  }

  const upstream = new LinkModel(link.sourcePortId, entryPort.id, link.pathType);
  const downstream = new LinkModel(exitPort.id, link.targetPortId, link.pathType);

  // Inherit the look of the edge being split (stroke, arrows, corner radius…).
  upstream.style = { ...link.style };
  downstream.style = { ...link.style };
  // Only the DOWNSTREAM half keeps the arrowhead; only the upstream keeps the
  // tail — otherwise the arrow would now point at the middle of the new node.
  delete upstream.style.arrowHead;
  delete downstream.style.arrowTail;

  applyWaypointSplit(link, upstream, downstream, t);

  const macro = new MacroCommand('Insert node on link');
  macro.addStep(new RemoveLinkCommand(link.id));
  macro.addStep(new AddNodeCommand(node));
  macro.addStep(new AddLinkCommand(upstream));
  macro.addStep(new AddLinkCommand(downstream));

  await engine.commandManager.execute(macro);

  return { nodeId: node.id, sourceLinkId: upstream.id, targetLinkId: downstream.id };
}

/**
 * Hand each half the interior waypoints that fall on its side of the split.
 * No-op for auto-routed links — they are re-routed from scratch, which is what
 * you want when a node lands in the middle of them.
 */
function applyWaypointSplit(
  link: LinkModel,
  upstream: LinkModel,
  downstream: LinkModel,
  t: number
): void {
  if (link.getMetadata('hasManualWaypoints') !== true) {
    return;
  }

  const split = splitPolylineAt(link.points ?? [], t);
  if (!split) return;

  // > 2 points means the half actually inherited an interior waypoint; a bare
  // [start, end] pair is not "manually routed" and must stay auto-routed.
  if (split.before.length > 2) {
    upstream.points = split.before.map(p => ({ ...p }));
    upstream.setMetadata('hasManualWaypoints', true);
  }
  if (split.after.length > 2) {
    downstream.points = split.after.map(p => ({ ...p }));
    downstream.setMetadata('hasManualWaypoints', true);
  }
}

/**
 * Which sides of the inserted node the two halves connect to, from the edge's
 * direction of travel: a rightward edge enters on the LEFT and leaves on the
 * RIGHT, a downward edge enters on TOP and leaves at the BOTTOM, etc.
 */
export function portSidesForTangent(tangent?: Point): {
  entry: 'left' | 'right' | 'top' | 'bottom';
  exit: 'left' | 'right' | 'top' | 'bottom';
} {
  const tx = tangent?.x ?? 1;
  const ty = tangent?.y ?? 0;

  if (Math.abs(tx) >= Math.abs(ty)) {
    return tx >= 0 ? { entry: 'left', exit: 'right' } : { entry: 'right', exit: 'left' };
  }
  return ty >= 0 ? { entry: 'top', exit: 'bottom' } : { entry: 'bottom', exit: 'top' };
}
