// ConnectionGroupValidator - Validates connections based on node connection groups (Phase 3)

import type { PortModel } from '../models/PortModel';
import type { DiagramEngine } from '../engine/DiagramEngine';

/**
 * Creates a connection validator that enforces connection group restrictions
 *
 * Rules:
 * - Nodes in the same connection group can connect to each other
 * - Nodes with no connection group can connect to any node
 * - Nodes in different connection groups cannot connect
 *
 * Usage:
 * ```typescript
 * const validator = createConnectionGroupValidator(engine);
 * connectionStateManager.addValidator(validator);
 * ```
 */
export function createConnectionGroupValidator(engine: DiagramEngine) {
  return (sourcePort: PortModel, targetPort: PortModel): boolean => {
    const diagram = engine.getDiagram();
    if (!diagram) {
      return false; // No diagram, reject connection
    }

    // Find nodes for the ports
    const sourceNode = diagram.getNodeByPortId(sourcePort.id);
    const targetNode = diagram.getNodeByPortId(targetPort.id);

    if (!sourceNode || !targetNode) {
      return false; // Can't find nodes, reject connection
    }

    // Get connection groups
    const sourceGroup = sourceNode.getConnectionGroup?.();
    const targetGroup = targetNode.getConnectionGroup?.();

    // If neither has a group, allow connection (unrestricted)
    if (!sourceGroup && !targetGroup) {
      return true;
    }

    // If only one has a group, allow connection (unrestricted node can connect to any group)
    if (!sourceGroup || !targetGroup) {
      return true;
    }

    // Both have groups - must match
    return sourceGroup === targetGroup;
  };
}

/**
 * Check if a connection between two ports is allowed based on connection groups
 * This is a standalone function that doesn't require a validator to be registered
 */
export function isConnectionAllowedByGroup(
  sourcePort: PortModel,
  targetPort: PortModel,
  engine: DiagramEngine
): boolean {
  const validator = createConnectionGroupValidator(engine);
  return validator(sourcePort, targetPort);
}
