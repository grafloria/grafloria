// connection-rules.ts — Wave 6 (Ports & connections), Card 2.
//
// THE connection validator. One function, one answer, one reason.
//
// Before wave 6 the "can these two ports connect?" question had THREE separate
// implementations that did not agree with each other:
//
//   1. `PortModel.canConnectTo`            — capacity + input/output rules
//   2. `ConnectionStateManager.isValidConnection` — capacity NOT checked, plus
//                                            same-node and same-port rules
//   3. `canConnectPorts` (renderer/snapping) — node.behavior, connection groups
//                                            and a no-duplicates rule the other
//                                            two had never heard of
//
// So the interactive drag would happily create a link the proximity-connect
// magnet considered illegal, and vice versa. Everything now funnels through
// `evaluatePortConnection`, which returns a REASON as well as a verdict — the
// renderer needs the reason to draw the "why not" cue on a rejected target
// (Card 6).
//
// Every wave-6 gate is opt-in and every default reproduces pre-wave-6 behaviour.

import type { LinkModel } from '../models/LinkModel';
import type { NodeModel } from '../models/NodeModel';
import type { PortModel } from '../models/PortModel';
import { resolvePortConfig } from './port-groups';
import { arePortDataTypesCompatible } from './port-type-registry';

export type ConnectionRejectionReason =
  | 'self-port'
  | 'self-link'
  | 'not-connectable-start'
  | 'not-connectable-end'
  | 'node-not-connectable'
  | 'direction'
  | 'data-type'
  | 'allowed-types'
  | 'max-connections'
  | 'from-max-links'
  | 'to-max-links'
  | 'duplicate-link'
  | 'connection-group'
  | 'custom';

export interface ConnectionVerdict {
  ok: boolean;
  reason?: ConnectionRejectionReason;
  /** Human-readable, safe to surface in a tooltip / live region. */
  message?: string;
}

export interface ConnectionRuleContext {
  sourceNode?: NodeModel;
  targetNode?: NodeModel;
  /** The diagram's links — needed for the duplicate-link rule. */
  links?: LinkModel[];
  /**
   * Reject a second link between the same ordered port pair EVEN when the ports
   * allow duplicates. Proximity-connect passes this (auto-linking a duplicate on
   * a drag-near is never what the user meant); the explicit connection drag does
   * not, preserving its historical permissiveness.
   */
  rejectDuplicatesByDefault?: boolean;
  /** Extra host rules (connection groups, ACLs…). Run last. */
  validators?: Array<(source: PortModel, target: PortModel) => boolean>;
}

const OK: ConnectionVerdict = { ok: true };

function no(reason: ConnectionRejectionReason, message: string): ConnectionVerdict {
  return { ok: false, reason, message };
}

/**
 * May a link be created FROM `source` TO `target`? Directional — swapping the
 * arguments is a different question and may well get a different answer.
 */
export function evaluatePortConnection(
  source: PortModel,
  target: PortModel,
  context: ConnectionRuleContext = {}
): ConnectionVerdict {
  const sourceNode = context.sourceNode;
  const targetNode = context.targetNode;

  const sourceConfig = resolvePortConfig(source, sourceNode);
  const targetConfig = resolvePortConfig(target, targetNode);
  const sourceGating = sourceConfig.gating;
  const targetGating = targetConfig.gating;

  // --- identity ------------------------------------------------------------
  const sameNode =
    (sourceNode && targetNode && sourceNode.id === targetNode.id) ||
    (!!source.nodeId && source.nodeId === target.nodeId);

  if (source.id === target.id) {
    // A port linked to ITSELF needs self-links allowed on that one port.
    if (!sourceGating.allowSelfLink) {
      return no('self-port', 'A port cannot connect to itself.');
    }
  } else if (sameNode && !(sourceGating.allowSelfLink && targetGating.allowSelfLink)) {
    return no('self-link', 'This node does not allow links to itself.');
  }

  // --- node-level opt-out (was only ever enforced in the snapping path) -----
  if (sourceNode?.behavior?.connectable === false || targetNode?.behavior?.connectable === false) {
    return no('node-not-connectable', 'This node cannot be connected.');
  }

  // --- drag handles are CHROME, not anatomy ---------------------------------
  // A node that declares itself a drag handle exists to move its parent. To the
  // user it IS part of the parent — wiring a window's title bar to the window's
  // body reads as "I connected the node to itself" (a live report). Handles
  // neither start nor receive links.
  if (
    sourceNode?.behavior?.dragHandler?.isDragHandler === true ||
    targetNode?.behavior?.dragHandler?.isDragHandler === true
  ) {
    return no('node-not-connectable', 'A drag handle cannot be wired.');
  }

  // --- directional connectability (Card 2) ---------------------------------
  if (!sourceGating.isConnectableStart) {
    return no('not-connectable-start', 'A link cannot start at this port.');
  }
  if (!targetGating.isConnectableEnd) {
    return no('not-connectable-end', 'A link cannot end at this port.');
  }

  // --- input/output direction ----------------------------------------------
  const isBi = (port: PortModel) => port.type === 'bi';
  if (!isBi(source) && !isBi(target) && source.type === target.type) {
    return no('direction', `A ${source.type} port cannot connect to another ${target.type} port.`);
  }

  // --- typed data flow (Card 7) --------------------------------------------
  if (!arePortDataTypesCompatible(sourceConfig.dataType, targetConfig.dataType)) {
    return no(
      'data-type',
      `Incompatible types: ${sourceConfig.dataType} cannot flow into ${targetConfig.dataType}.`
    );
  }

  // --- allowedTypes whitelist (dead config until wave 6) --------------------
  if (sourceGating.allowedTypes.length && !sourceGating.allowedTypes.includes(target.typeIdentity())) {
    return no('allowed-types', `This port does not accept "${target.typeIdentity()}".`);
  }
  if (targetGating.allowedTypes.length && !targetGating.allowedTypes.includes(source.typeIdentity())) {
    return no('allowed-types', `That port does not accept "${source.typeIdentity()}".`);
  }

  // --- capacity ------------------------------------------------------------
  // The TOTAL cap. `null` is the explicit "unlimited" sentinel — never coerce it
  // to 0, which is the exact bug that once made every port with an Infinity cap
  // permanently unconnectable after a JSON round-trip.
  if (sourceGating.maxConnections !== null && source.getConnectionCount() >= sourceGating.maxConnections) {
    return no('max-connections', 'This port has reached its connection limit.');
  }
  if (targetGating.maxConnections !== null && target.getConnectionCount() >= targetGating.maxConnections) {
    return no('max-connections', 'That port has reached its connection limit.');
  }
  if (sourceGating.fromMaxLinks !== null && source.getFromLinkCount() >= sourceGating.fromMaxLinks) {
    return no('from-max-links', 'This port has reached its outgoing-link limit.');
  }
  if (targetGating.toMaxLinks !== null && target.getToLinkCount() >= targetGating.toMaxLinks) {
    return no('to-max-links', 'That port has reached its incoming-link limit.');
  }

  // --- duplicates ----------------------------------------------------------
  const rejectDuplicates =
    !sourceGating.allowDuplicateLinks ||
    !targetGating.allowDuplicateLinks ||
    context.rejectDuplicatesByDefault === true;

  if (rejectDuplicates && context.links?.length) {
    const already = context.links.some(
      (link) =>
        (link.sourcePortId === source.id && link.targetPortId === target.id) ||
        (link.sourcePortId === target.id && link.targetPortId === source.id)
    );
    if (already) {
      return no('duplicate-link', 'These ports are already connected.');
    }
  }

  // --- host rules (connection groups, ACLs…) -------------------------------
  for (const validator of context.validators ?? []) {
    if (!validator(source, target)) {
      return no('custom', 'This connection is not allowed.');
    }
  }

  return OK;
}

/** Boolean facade for call sites that don't care WHY. */
export function canConnectPortsWithRules(
  source: PortModel,
  target: PortModel,
  context: ConnectionRuleContext = {}
): boolean {
  return evaluatePortConnection(source, target, context).ok;
}
