// First-class subgraph serialization — ONE code path for clipboard fragments,
// templates, and cross-diagram slices.
//
// serializeSubgraph captures a selection as a self-contained document: the
// selected nodes, every link whose BOTH endpoints live inside the selection,
// and the selected groups with their membership filtered to the selection.
// Links that cross the boundary are recorded (not silently dropped) so
// callers can surface them.
//
// deserializeSubgraphInto installs a subgraph into a live diagram through the
// SAME unified restore path as document load (fully wired entities), with
// id/uuid remapping on by default — pasting twice must yield two independent
// copies, never id collisions.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel, type SerializedNode } from '../models/NodeModel';
import { LinkModel, type SerializedLink } from '../models/LinkModel';
import { GroupModel, type SerializedGroup } from '../models/GroupModel';
import { remapNodePortIds } from '../commands/basic/remapNodePortIds';
import { generateId, generateUUID } from '../utils/id';
import { DIAGRAM_SCHEMA_VERSION } from './DiagramMigrations';
import type { Point } from '../types';

export const SUBGRAPH_FORMAT = 'grafloria-subgraph' as const;

export interface SerializedSubgraph {
  format: typeof SUBGRAPH_FORMAT;
  schemaVersion: number;
  sourceDiagramId?: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: SerializedGroup[];
  /** Links that crossed the selection boundary and were therefore excluded. */
  boundaryLinks: Array<{ linkId: string; insideEnd: 'source' | 'target' }>;
}

export interface SubgraphSelection {
  nodeIds: Iterable<string>;
  groupIds?: Iterable<string>;
}

export function serializeSubgraph(
  diagram: DiagramModel,
  selection: SubgraphSelection
): SerializedSubgraph {
  const nodeIds = new Set(selection.nodeIds);
  const groupIds = new Set(selection.groupIds ?? []);

  const nodes: SerializedNode[] = [];
  const selectedPortIds = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = diagram.getNode(nodeId);
    if (!node) continue;
    nodes.push(node.serialize());
    for (const port of node.getPorts()) {
      selectedPortIds.add(port.id);
    }
  }

  const links: SerializedLink[] = [];
  const boundaryLinks: SerializedSubgraph['boundaryLinks'] = [];
  for (const link of diagram.getLinks()) {
    const sourceIn = selectedPortIds.has(link.sourcePortId);
    const targetIn = selectedPortIds.has(link.targetPortId);
    if (sourceIn && targetIn) {
      links.push(link.serialize());
    } else if (sourceIn || targetIn) {
      boundaryLinks.push({ linkId: link.id, insideEnd: sourceIn ? 'source' : 'target' });
    }
  }

  const groups: SerializedGroup[] = [];
  for (const groupId of groupIds) {
    const group = diagram.getGroup(groupId);
    if (!group) continue;
    const serialized = group.serialize();
    // Self-containment: membership and containment pointers may only
    // reference things that travel with the subgraph.
    serialized.members = serialized.members.filter(
      (m: string) => nodeIds.has(m) || groupIds.has(m)
    );
    if (serialized.parentGroupId !== undefined && !groupIds.has(serialized.parentGroupId)) {
      serialized.parentGroupId = undefined;
    }
    groups.push(serialized);
  }

  return {
    format: SUBGRAPH_FORMAT,
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    sourceDiagramId: diagram.id,
    nodes,
    links,
    groups,
    boundaryLinks,
  };
}

export interface DeserializeSubgraphOptions {
  /**
   * Mint fresh ids/uuids for every entity (default true). Turn off only when
   * importing into a diagram KNOWN not to contain the ids (e.g. template
   * instantiation into an empty document where stable ids are wanted).
   */
  remapIds?: boolean;
  /** Translate all node/group positions by this delta (paste-at-cursor). */
  offset?: Point;
}

export interface DeserializedSubgraph {
  nodes: NodeModel[];
  links: LinkModel[];
  groups: GroupModel[];
  /** oldId -> newId for nodes and groups (identity map when remapIds=false). */
  idMap: Map<string, string>;
  /** oldPortId -> newPortId (identity when remapIds=false). */
  portIdMap: Map<string, string>;
}

/**
 * Install a subgraph into a live diagram through the unified restore path.
 *
 * This is a USER MUTATION (unlike document load): entities are installed via
 * restore* so the normal node:added/link:added events fire for undo and
 * rendering, and port registries are reconciled at the end.
 */
export function deserializeSubgraphInto(
  diagram: DiagramModel,
  subgraph: SerializedSubgraph,
  options: DeserializeSubgraphOptions = {}
): DeserializedSubgraph {
  const remap = options.remapIds !== false;
  const offset = options.offset ?? { x: 0, y: 0 };

  const idMap = new Map<string, string>();
  const portIdMap = new Map<string, string>();

  // --- nodes ---------------------------------------------------------------
  const nodes: NodeModel[] = [];
  for (const nodeData of subgraph.nodes) {
    const node = NodeModel.fromJSON(nodeData);
    const oldId = node.id;
    if (remap) {
      const newId = generateId();
      (node as unknown as { id: string }).id = newId;
      idMap.set(oldId, newId);
      // Fresh port ids + uuids for the clone; records old->new port ids.
      remapNodePortIds(node, newId, portIdMap);
    } else {
      idMap.set(oldId, oldId);
      for (const port of node.getPorts()) {
        portIdMap.set(port.id, port.id);
      }
    }
    // Direct field write (not setPosition): applying the paste offset is part
    // of materializing the clone, not a user mutation to version-track.
    node.position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
    // Parent pointers may only reference nodes that travel with the subgraph.
    if (node.parentId) {
      node.parentId = idMap.get(node.parentId) ?? undefined;
    }
    diagram.restoreNode(node.serialize());
    // restoreNode re-creates from JSON; fetch the installed instance.
    const installed = diagram.getNode(node.id)!;
    nodes.push(installed);
  }

  // Second pass: parentId of an earlier node may reference a LATER node in
  // the subgraph — resolve any still-unmapped parents now that idMap is full.
  if (remap) {
    for (const installed of nodes) {
      if (installed.parentId && idMap.has(installed.parentId)) {
        installed.parentId = idMap.get(installed.parentId);
      }
    }
  }

  // --- links ---------------------------------------------------------------
  const links: LinkModel[] = [];
  for (const linkData of subgraph.links) {
    const sourcePortId = portIdMap.get(linkData.sourcePortId);
    const targetPortId = portIdMap.get(linkData.targetPortId);
    if (!sourcePortId || !targetPortId) {
      // Endpoint didn't travel with the subgraph — skip rather than install
      // a dangling link (serializeSubgraph should have excluded it already).
      continue;
    }
    const data: SerializedLink = {
      ...linkData,
      id: remap ? generateId() : linkData.id,
      uuid: remap ? generateUUID() : linkData.uuid,
      sourcePortId,
      targetPortId,
      sourceNodeId: linkData.sourceNodeId ? idMap.get(linkData.sourceNodeId) : undefined,
      targetNodeId: linkData.targetNodeId ? idMap.get(linkData.targetNodeId) : undefined,
    };
    const link = diagram.restoreLink(data);
    if (link) links.push(link);
  }

  // --- groups --------------------------------------------------------------
  const groups: GroupModel[] = [];
  // First mint group ids so nested parentGroupId can remap regardless of order.
  if (remap) {
    for (const groupData of subgraph.groups) {
      idMap.set(groupData.id, generateId());
    }
  } else {
    for (const groupData of subgraph.groups) {
      idMap.set(groupData.id, groupData.id);
    }
  }
  for (const groupData of subgraph.groups) {
    const data: SerializedGroup = {
      ...groupData,
      id: idMap.get(groupData.id)!,
      uuid: remap ? generateUUID() : groupData.uuid,
      members: groupData.members
        .map((m: string) => idMap.get(m))
        .filter((m): m is string => !!m),
      parentGroupId:
        groupData.parentGroupId !== undefined
          ? idMap.get(groupData.parentGroupId)
          : undefined,
      position: groupData.position
        ? { x: groupData.position.x + offset.x, y: groupData.position.y + offset.y }
        : groupData.position,
    };
    const group = diagram.restoreGroup(data);
    if (group) groups.push(group);
  }

  // --- derived state -------------------------------------------------------
  diagram.reconcilePortConnections();

  return { nodes, links, groups, idMap, portIdMap };
}
