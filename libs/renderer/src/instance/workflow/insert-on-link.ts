/**
 * `api.insertNodeOnLink(linkId, nodeSpec, options)` — A→B becomes A→N→B as ONE
 * undoable step.
 *
 * The new node lands in the gap between A's port and B's port, its entry port
 * level with A's. When the gap is too small, B and everything downstream of it
 * shift along the flow — only as far as the node needs, and nothing upstream
 * moves. The old link is removed by `RemoveLinkCommand`, which keeps its whole
 * serialized form, so one undo puts A→B back exactly: the same link id, labels,
 * style and route. The moves, the node and both halves ride in the same step.
 */
import {
  AddLinkCommand,
  AddNodeCommand,
  LinkModel,
  MacroCommand,
  MoveNodeCommand,
  RemoveLinkCommand,
} from '@grafloria/engine';
import type { DiagramEngine, LinkLabel, NodeModel, PortModel } from '@grafloria/engine';
import { buildNode } from '../model-input';
import type { NodeSpec } from '../model-input';
import { getPortPositionForShape, portWorldPosition } from '../../svg/port-positioning';

export interface InsertNodeOnLinkOptions {
  /** The new node's port the upstream half enters. Default: its first `input` port, else its left port. */
  inPort?: string;
  /** The new node's port the downstream half leaves from. Default: its first `output` port, else its right port. */
  outPort?: string;
  /** Free space kept on each side of the new node along the flow, in world px. Default 60. */
  gap?: number;
  /** The flow's axis. Default: from the link's own direction (wider than tall = `'LR'`). */
  direction?: 'LR' | 'TB';
  /**
   * Which half keeps the old link's labels — `'upstream'` (default: a branch
   * label such as "true" belongs to the source side), `'downstream'`, or `'none'`.
   */
  labels?: 'upstream' | 'downstream' | 'none';
}

export interface InsertNodeOnLinkResult {
  nodeId: string;
  /** A → N */
  upstreamLinkId: string;
  /** N → B */
  downstreamLinkId: string;
  /** Nodes shifted to make room (B and what lies downstream of it). */
  moved: string[];
}

let insertSeq = 0;

function pickPort(node: NodeModel, id: string | undefined, kind: 'input' | 'output', side: 'left' | 'right' | 'top' | 'bottom'): PortModel | undefined {
  if (id) return node.getPort(id) ?? undefined;
  const ports = [...node.ports.values()] as PortModel[];
  return ports.find((p) => p.type === kind) ?? node.getPortBySide(side) ?? ports[0];
}

/** Everything reachable from `start` along outgoing links, `start` included, `stop` excluded. */
function downstreamOf(engine: DiagramEngine, start: NodeModel, stop: Set<string>): NodeModel[] {
  const diagram = engine.getDiagram()!;
  const seen = new Set<string>([start.id]);
  const out: NodeModel[] = [start];
  for (let i = 0; i < out.length; i++) {
    const node = out[i]!;
    for (const port of node.ports.values() as Iterable<PortModel>) {
      for (const link of diagram.getLinksForPort(port.id) as LinkModel[]) {
        if (link.sourcePortId !== port.id) continue;
        const next = diagram.getNodeByPortId(link.targetPortId);
        if (!next || seen.has(next.id) || stop.has(next.id)) continue;
        seen.add(next.id);
        out.push(next);
      }
    }
  }
  return out;
}

export async function insertNodeOnLink(
  engine: DiagramEngine,
  linkId: string,
  spec: NodeSpec,
  options: InsertNodeOnLinkOptions = {}
): Promise<InsertNodeOnLinkResult | null> {
  const diagram = engine.getDiagram();
  const link: LinkModel | undefined = diagram?.getLink(linkId);
  if (!diagram || !link) return null;
  const a = diagram.getNodeByPortId(link.sourcePortId);
  const b = diagram.getNodeByPortId(link.targetPortId);
  const aPort = diagram.getPortById(link.sourcePortId) as PortModel | undefined;
  const bPort = diagram.getPortById(link.targetPortId) as PortModel | undefined;
  if (!a || !b || !aPort || !bPort) return null;

  let id = spec.id;
  if (!id) do id = `node-ins-${++insertSeq}`; while (diagram.getNode(id));
  if (diagram.getNode(id)) return null;
  const node = buildNode({ ...spec, id, position: { x: 0, y: 0 } }, 0);

  const from = portWorldPosition(aPort, a);
  const to = portWorldPosition(bPort, b);
  const direction = options.direction ?? (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'LR' : 'TB');
  const lr = direction === 'LR';
  const inPort = pickPort(node, options.inPort, 'input', lr ? 'left' : 'top');
  const outPort = pickPort(node, options.outPort, 'output', lr ? 'right' : 'bottom');
  if (!inPort || !outPort) return null;

  const gap = options.gap ?? 60;
  const w = node.size?.width ?? 0;
  const h = node.size?.height ?? 0;
  const inLocal = getPortPositionForShape(inPort, node);
  const length = lr ? w : h;
  const available = lr ? to.x - from.x : to.y - from.y;
  const needed = gap + length + gap;
  const shift = Math.max(0, needed - available);
  // In the middle of the gap when it is wide enough; otherwise one gap past A.
  const along = (lr ? from.x : from.y) + (shift > 0 ? gap : (available - length) / 2);
  const position = lr ? { x: along, y: from.y - inLocal.y } : { x: from.x - inLocal.x, y: along };
  node.setPosition(position.x, position.y);

  const upstream = new LinkModel(link.sourcePortId, inPort.id, link.pathType);
  const downstream = new LinkModel(outPort.id, link.targetPortId, link.pathType);
  upstream.style = { ...link.style };
  downstream.style = { ...link.style };
  // The arrowhead belongs to the downstream half, the tail to the upstream one.
  delete (upstream.style as { arrowHead?: unknown }).arrowHead;
  delete (downstream.style as { arrowTail?: unknown }).arrowTail;
  const labels = options.labels ?? 'upstream';
  const carry = (l: LinkLabel, i: number): LinkLabel => ({ ...l, id: `${l.id}~${labels === 'upstream' ? 'up' : 'down'}${i}` });
  const keeper = labels === 'upstream' ? upstream : labels === 'downstream' ? downstream : null;
  if (keeper) {
    keeper.labels = link.labels.map(carry);
    // The plain `label` (the link's name, drawn on the line) is metadata, not a LinkLabel.
    for (const key of ['label', 'labelPlacement']) {
      const value = link.getMetadata(key);
      if (value !== undefined) keeper.setMetadata(key, value);
    }
  }

  const macro = new MacroCommand('Insert node on link');
  const moved: string[] = [];
  if (shift > 0) {
    for (const n of downstreamOf(engine, b, new Set([a.id]))) {
      const p = n.position;
      macro.addStep(new MoveNodeCommand(n.id, lr ? { x: p.x + shift, y: p.y, z: p.z } : { x: p.x, y: p.y + shift, z: p.z }, { ...p }, { mergeable: false }));
      moved.push(n.id);
    }
  }
  macro.addStep(new RemoveLinkCommand(link.id));
  macro.addStep(new AddNodeCommand(node));
  macro.addStep(new AddLinkCommand(upstream));
  macro.addStep(new AddLinkCommand(downstream));
  await engine.commandManager.execute(macro);

  return { nodeId: node.id, upstreamLinkId: upstream.id, downstreamLinkId: downstream.id, moved };
}
