// port-groups.ts — Wave 6 (Ports & connections), Card 3.
//
// Named port groups with inheritance. A group is a reusable bundle of port
// config declared once on a NODE TYPE (or on one node); each port names its
// group and overrides only what it needs.
//
// This replaces the old `PortsConfig` model, which had exactly four slots —
// `top` / `right` / `bottom` / `left`, each a single `{enabled, visibility,
// type, maxConnections}` — and therefore could not express the thing every real
// node editor needs: "N typed, labelled inputs down the left edge".
//
// RESOLUTION ORDER (last wins):
//   1. hard defaults (DEFAULT_PORT_GATING & friends — all pre-wave-6 behaviour)
//   2. the group registered for the node's TYPE
//   3. the group declared on the NODE itself (metadata `portGroups`)
//   4. the port's own fields
//
// Groups are DATA, so a group can be swapped/registered without touching
// renderer code, and a port with no group resolves to exactly the old defaults.

import type { NodeModel } from '../models/NodeModel';
import type { PortModel } from '../models/PortModel';
import {
  DEFAULT_PORT_GATING,
  type PortEdge,
  type PortGatingSpec,
  type PortGroupDefinition,
  type PortLabelSpec,
  type ResolvedPortConfig,
  type ResolvedPortGating,
} from './port-types';

/** Node metadata key holding per-node group definitions. */
export const PORT_GROUPS_METADATA_KEY = 'portGroups';

/**
 * Groups registered per node TYPE. A node type declares its port groups once
 * ("the `and-gate` type has an `in` group and an `out` group"), and every node
 * of that type inherits them.
 */
export class PortGroupRegistry {
  private byNodeType = new Map<string, Map<string, PortGroupDefinition>>();

  register(nodeType: string, group: PortGroupDefinition): void {
    let groups = this.byNodeType.get(nodeType);
    if (!groups) {
      groups = new Map();
      this.byNodeType.set(nodeType, groups);
    }
    groups.set(group.id, group);
  }

  registerAll(nodeType: string, groups: PortGroupDefinition[]): void {
    for (const group of groups) this.register(nodeType, group);
  }

  get(nodeType: string, groupId: string): PortGroupDefinition | undefined {
    return this.byNodeType.get(nodeType)?.get(groupId);
  }

  getAll(nodeType: string): PortGroupDefinition[] {
    return Array.from(this.byNodeType.get(nodeType)?.values() ?? []);
  }

  unregister(nodeType: string, groupId?: string): void {
    if (groupId === undefined) {
      this.byNodeType.delete(nodeType);
      return;
    }
    this.byNodeType.get(nodeType)?.delete(groupId);
  }

  clear(): void {
    this.byNodeType.clear();
  }
}

/** The process-wide registry. Hosts register node-type groups at bootstrap. */
export const portGroupRegistry = new PortGroupRegistry();

/**
 * Per-node group definitions, stored in node metadata so they serialize with the
 * diagram (a node can carry a one-off group without registering a node type).
 */
export function getNodePortGroups(node: NodeModel | undefined): Record<string, PortGroupDefinition> {
  const raw = node?.getMetadata?.(PORT_GROUPS_METADATA_KEY);
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, PortGroupDefinition>;
}

export function setNodePortGroups(node: NodeModel, groups: Record<string, PortGroupDefinition>): void {
  node.setMetadata(PORT_GROUPS_METADATA_KEY, groups);
}

/**
 * Find the group a port belongs to: the node's own definitions first (most
 * specific), then the registry for the node's type.
 */
export function findPortGroup(
  port: PortModel,
  node: NodeModel | undefined
): PortGroupDefinition | undefined {
  const groupId = port.group;
  if (!groupId) return undefined;
  const onNode = getNodePortGroups(node)[groupId];
  if (onNode) return onNode;
  if (node?.type) return portGroupRegistry.get(node.type, groupId);
  return undefined;
}

/** `undefined` loses; `null` and `false` and `0` WIN (they are real choices). */
function pick<T>(...candidates: Array<T | undefined>): T | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function mergeGating(
  group: PortGatingSpec | undefined,
  own: PortGatingSpec | undefined
): ResolvedPortGating {
  return {
    isConnectableStart: pick(own?.isConnectableStart, group?.isConnectableStart, DEFAULT_PORT_GATING.isConnectableStart)!,
    isConnectableEnd: pick(own?.isConnectableEnd, group?.isConnectableEnd, DEFAULT_PORT_GATING.isConnectableEnd)!,
    allowSelfLink: pick(own?.allowSelfLink, group?.allowSelfLink, DEFAULT_PORT_GATING.allowSelfLink)!,
    allowDuplicateLinks: pick(own?.allowDuplicateLinks, group?.allowDuplicateLinks, DEFAULT_PORT_GATING.allowDuplicateLinks)!,
    fromMaxLinks: pick(own?.fromMaxLinks, group?.fromMaxLinks, DEFAULT_PORT_GATING.fromMaxLinks) ?? null,
    toMaxLinks: pick(own?.toMaxLinks, group?.toMaxLinks, DEFAULT_PORT_GATING.toMaxLinks) ?? null,
    maxConnections: pick(own?.maxConnections, group?.maxConnections, DEFAULT_PORT_GATING.maxConnections) ?? null,
    allowedTypes: own?.allowedTypes?.length
      ? [...own.allowedTypes]
      : group?.allowedTypes?.length
        ? [...group.allowedTypes]
        : [],
  };
}

function mergeLabel(
  group: Partial<PortLabelSpec> | undefined,
  own: PortLabelSpec | undefined
): PortLabelSpec | undefined {
  if (!group && !own) return undefined;
  const merged = { ...(group ?? {}), ...(own ?? {}) } as PortLabelSpec;
  // A label with no text is not a label. (A group may legitimately define only
  // the layout/offset/font and let each member supply its own text.)
  if (typeof merged.text !== 'string' || merged.text.length === 0) return undefined;
  return merged;
}

/**
 * Fold a port's group into its own fields. THE resolution seam — the renderer,
 * the layout engine and the connection validator all read the result of this
 * function and never the raw port fields, so group inheritance can never
 * silently apply in one place and not another.
 *
 * A port with no group and no wave-6 fields resolves to the pre-wave-6 defaults
 * (circle glyph via `shape: undefined`, `always/on-hover` visibility from the
 * existing precedence chain, unlimited unrestricted connectability).
 */
export function resolvePortConfig(port: PortModel, node?: NodeModel): ResolvedPortConfig {
  const group = findPortGroup(port, node);

  // The port's own gating fields, lifted out of the flat model into a spec.
  // `maxConnections` bridges the legacy numeric field: Infinity → null.
  const ownGating: PortGatingSpec = {
    isConnectableStart: port.isConnectableStart,
    isConnectableEnd: port.isConnectableEnd,
    fromMaxLinks: port.fromMaxLinks,
    toMaxLinks: port.toMaxLinks,
    maxConnections: Number.isFinite(port.maxConnections) ? port.maxConnections : null,
    allowSelfLink: port.allowSelfLink,
    allowDuplicateLinks: port.allowDuplicateLinks,
    allowedTypes: Array.from(port.allowedTypes),
  };

  // The port's OWN side wins only when it was actually declared. A port that
  // just says `group: 'in'` inherits the group's side — otherwise the
  // constructor's `side: 'right'` default would silently beat every group.
  const side: PortEdge = (
    port.explicitSide ? port.alignment?.side : (group?.side ?? port.alignment?.side)
  ) ?? 'right';

  return {
    side,
    layout: pick(port.layout, group?.layout),
    shape: pick(port.shape, group?.shape),
    // Port style wins per-key over group style — the whole point of "override
    // only what you need".
    style: { ...(group?.style ?? {}), ...(port.style ?? {}) },
    label: mergeLabel(group?.label, port.label),
    visibility: pick(port.renderingConfig?.visibility, group?.visibility),
    gating: mergeGating(group?.gating, ownGating),
    dataType: pick(port.dataType, group?.dataType),
    fromSpot: pick(port.fromSpot, group?.fromSpot),
    toSpot: pick(port.toSpot, group?.toSpot),
    spread: pick(port.spread, group?.spread),
    dynamic: group?.dynamic,
    groupId: group?.id,
  };
}
