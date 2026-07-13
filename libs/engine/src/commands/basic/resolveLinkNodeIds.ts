// Shared link-endpoint → owning-node resolution for clipboard/delete commands

/**
 * Resolve the ids of the nodes a link is attached to.
 *
 * WHY THIS EXISTS: a link's `sourcePortId`/`targetPortId` are PORT ids — engine
 * nanoids — NOT `"nodeId:portName"` strings. Commands that used
 * `portId.split(':')[0]` to get a node id therefore resolved nothing for links
 * created the production way (`diagram.connectNodes()` / the interactive connect
 * path), which silently:
 *   - made CopyCommand skip every link between the copied nodes, and
 *   - made DeleteSelectionCommand leave ORPHAN links behind when it deleted the
 *     nodes at both ends (`removeNode()` does not cascade to links).
 *
 * Resolution order:
 *   1. the ids LinkModel caches (`sourceNodeId` / `targetNodeId`, backfilled by
 *      `addLink()` / `restoreLink()` from the port index),
 *   2. the diagram's O(1) port index (`getNodeByPortId`),
 *   3. the legacy `"nodeId:portName"` convention — still used by hand-built test
 *      links and older documents — but only when it names a node that actually
 *      exists.
 *
 * @returns the owning node ids; either may be `undefined` for a dangling endpoint.
 */
export function resolveLinkNodeIds(
  diagram: any,
  link: { sourcePortId: string; targetPortId: string; sourceNodeId?: string; targetNodeId?: string }
): { sourceNodeId?: string; targetNodeId?: string } {
  return {
    sourceNodeId: resolveEndpointNodeId(diagram, link.sourcePortId, link.sourceNodeId),
    targetNodeId: resolveEndpointNodeId(diagram, link.targetPortId, link.targetNodeId),
  };
}

function resolveEndpointNodeId(
  diagram: any,
  portId: string,
  cachedNodeId?: string
): string | undefined {
  if (cachedNodeId && diagram.getNode(cachedNodeId)) {
    return cachedNodeId;
  }

  const owner = diagram.getNodeByPortId?.(portId);
  if (owner) {
    return owner.id;
  }

  // Legacy "nodeId:portName" endpoints.
  const legacyId = portId.split(':')[0];
  if (legacyId && legacyId !== portId && diagram.getNode(legacyId)) {
    return legacyId;
  }

  return undefined;
}
