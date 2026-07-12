// Shared port-id remapping for clone operations (Paste / Duplicate)

import type { NodeModel } from '../../models/NodeModel';
import { generateId } from '../../utils/id';

/**
 * Re-assign fresh ids to every port on a freshly-cloned node.
 *
 * Why this is needed: {@link NodeModel.fromJSON} restores each port with its
 * ORIGINAL serialized id, so a clone would otherwise share port ids with its
 * source node. Links reference the engine's nanoid port ids directly (they are
 * NOT `"nodeId:portName"` strings), and node lookup resolves a node by "which
 * node owns this port id" — duplicate port ids across nodes make that lookup
 * ambiguous and break pasted/duplicated links.
 *
 * For each port this:
 *  - generates a new port id and records `oldPortId -> newPortId` in `portIdMap`
 *    so the caller can remap link endpoints,
 *  - points the port back at its new owning node,
 *  - rebuilds the node's ports Map (whose KEYS are the port ids) so lookups by
 *    id keep working.
 *
 * @param node        the cloned node (mutated in place)
 * @param newNodeId   the clone's node id (ports' `nodeId` is set to this)
 * @param portIdMap   accumulates oldPortId -> newPortId across all cloned nodes
 */
export function remapNodePortIds(
  node: NodeModel,
  newNodeId: string,
  portIdMap: Map<string, string>,
): void {
  // Snapshot first — we are about to rewrite the very Map we would iterate.
  const ports = node.getPorts();
  node.ports.clear();

  for (const port of ports) {
    const oldPortId = port.id;
    const newPortId = generateId();
    portIdMap.set(oldPortId, newPortId);

    // `id` is readonly on DiagramEntity — same override pattern used for groups.
    (port as unknown as { id: string }).id = newPortId;
    port.nodeId = newNodeId;

    node.ports.set(newPortId, port);
  }
}
