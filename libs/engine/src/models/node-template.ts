// Data-driven node TEMPLATES — the engine half.
//
// A host registers a resolver on the diagram (`setNodeTemplateResolver`): given
// a node, it answers the ports (and, optionally, the size) that node's CURRENT
// data calls for — a Switch with four rules answers four outputs. The resolver
// is the host's; the engine only applies its answer.
//
// `applyNodeTemplate` reconciles a node with that answer and hands back exactly
// what it changed, so a command can put it back: ports dropped (and every link
// attached to one, removed with its full serialized form), ports changed, ports
// added, the size. `restoreNodeTemplate` undoes it. `SetNodeDataCommand` runs
// both, which is what makes "edit the data → the card's ports follow, wires to
// a removed port go, and ONE undo brings all of it back" a single history step.
//
// With no resolver registered nothing here runs: opt-in by construction.

import type { NodeModel, SerializedNode } from './NodeModel';
import { PortModel } from './PortModel';
import type { SerializedPort } from './PortModel';
import { LinkModel } from './LinkModel';
import type { SerializedLink } from './LinkModel';
import type { DiagramModel } from './DiagramModel';

export interface NodeTemplateResolution {
  /** The node's ports for its current data, in order. Matched to the existing ports BY ID. */
  ports?: PortModel[];
  /** The node's size for its current data. */
  size?: { width: number; height: number };
}

/** Answer the node's ports/size for its current data, or undefined to leave it alone. */
export type NodeTemplateResolver = (node: NodeModel) => NodeTemplateResolution | undefined;

/** What one `applyNodeTemplate` changed — enough to put it back. */
export interface NodeTemplateChange {
  /** Every port before, serialized, in order. */
  portsBefore: SerializedPort[];
  /** Links removed because their port was dropped. */
  linksRemoved: SerializedLink[];
  sizeBefore?: { width: number; height: number };
}

const portKey = (p: PortModel): string => JSON.stringify(p.serialize());

/**
 * Bring `node`'s ports and size in line with `resolution`. Returns what changed
 * (null when nothing did).
 */
export function applyNodeTemplate(diagram: DiagramModel, node: NodeModel, resolution: NodeTemplateResolution): NodeTemplateChange | null {
  const current = [...node.ports.values()] as PortModel[];
  const change: NodeTemplateChange = { portsBefore: current.map((p) => p.serialize()), linksRemoved: [] };
  let changed = false;

  if (resolution.ports) {
    const want = new Map(resolution.ports.map((p) => [p.id, p]));
    for (const port of current) {
      if (want.has(port.id)) continue;
      for (const link of diagram.getLinksForPort(port.id) as LinkModel[]) {
        change.linksRemoved.push(link.serialize());
        diagram.removeLink(link.id);
      }
      node.removePort(port.id);
      changed = true;
    }
    for (const port of resolution.ports) {
      const existing = node.getPort(port.id) as PortModel | undefined;
      if (existing && portKey(existing) === portKey(port)) continue;
      if (existing) node.removePort(port.id);
      node.addPort(port);
      changed = true;
    }
  }

  if (resolution.size) {
    const { width, height } = resolution.size;
    if (node.size.width !== width || node.size.height !== height) {
      change.sizeBefore = { width: node.size.width, height: node.size.height };
      node.setSize(width, height);
      changed = true;
    }
  }
  return changed ? change : null;
}

/** Put back what `applyNodeTemplate` changed: the ports as they were, then their links, then the size. */
export function restoreNodeTemplate(diagram: DiagramModel, node: NodeModel, change: NodeTemplateChange): void {
  for (const id of [...node.ports.keys()]) node.removePort(id as string);
  for (const p of change.portsBefore) node.addPort(PortModel.fromJSON(p));
  for (const l of change.linksRemoved) if (!diagram.getLink(l.id)) diagram.addLink(LinkModel.fromJSON(l));
  if (change.sizeBefore) node.setSize(change.sizeBefore.width, change.sizeBefore.height);
}

/** For the type checker only: a serialized node carries its ports this way. */
export type { SerializedNode };
