// dynamic-ports.ts — Wave 6 (Ports & connections), Card 7 (second half).
//
// Dynamic port allocation: the node-editor pattern. A group declares
// `dynamic: { enabled: true, spare: 1 }` and the group always offers exactly one
// free, unconnected port — so the moment the user wires up the last free input, a
// fresh one appears beneath it. Blender, Unreal Blueprints, n8n and Node-RED all
// do this; without it a node's fan-in is fixed at authoring time.
//
// The allocator is PURE: it computes a plan (which ports to add, which stale
// spares to remove) and hands back COMMANDS. Nothing here mutates the model —
// mutations go through the command layer, so spawning a port is undoable and
// arrives with the same event/dirty semantics as every other model change.

import { AddPortCommand, RemovePortCommand } from '../commands/basic/PortCommands';
import type { Command } from '../commands/Command';
import type { DiagramModel } from '../models/DiagramModel';
import type { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { findPortGroup } from './port-groups';
import type { DynamicPortSpec, PortGroupDefinition } from './port-types';

export interface DynamicPortPlan {
  /** Ports to create, in order. */
  add: PortModel[];
  /** Ids of surplus free ports to retire. */
  remove: string[];
}

const EMPTY_PLAN: DynamicPortPlan = { add: [], remove: [] };

function groupsOnNode(node: NodeModel): Map<string, PortGroupDefinition> {
  // Only groups that some port actually BELONGS to matter — a group nobody
  // joined has no members to top up.
  const groups = new Map<string, PortGroupDefinition>();
  for (const port of node.getPorts()) {
    if (!port.group || groups.has(port.group)) continue;
    const group = findPortGroup(port, node);
    if (group) groups.set(port.group, group);
  }
  return groups;
}

/** Members of `groupId`, in stable order (by `index`, then declaration order). */
function membersOf(node: NodeModel, groupId: string): PortModel[] {
  return node
    .getPorts()
    .filter((port) => port.group === groupId)
    .map((port, declarationOrder) => ({ port, declarationOrder }))
    .sort((a, b) => (a.port.index || 0) - (b.port.index || 0) || a.declarationOrder - b.declarationOrder)
    .map((entry) => entry.port);
}

/**
 * What must change so every dynamic group on `node` offers exactly `spare` free
 * ports? Idempotent: run it on a settled node and it returns an empty plan.
 *
 * A port is "free" when it carries no links. Only ports the allocator itself
 * spawned (`dynamic: true`) are ever REMOVED — an authored port the user simply
 * hasn't wired yet is not surplus, it is the design.
 */
export function planDynamicPorts(node: NodeModel): DynamicPortPlan {
  const groups = groupsOnNode(node);
  if (groups.size === 0) return EMPTY_PLAN;

  const plan: DynamicPortPlan = { add: [], remove: [] };

  for (const [groupId, group] of groups) {
    const spec: DynamicPortSpec | undefined = group.dynamic;
    if (!spec?.enabled) continue;

    const spare = Math.max(0, spec.spare ?? 1);
    const cap = spec.max && spec.max > 0 ? spec.max : Infinity;
    const members = membersOf(node, groupId);
    const free = members.filter((port) => port.getConnectionCount() === 0);

    if (free.length < spare) {
      const prefix = spec.idPrefix ?? `${groupId}-`;
      let nextIndex = members.reduce((max, port) => Math.max(max, port.index ?? 0), -1) + 1;
      const template = members[members.length - 1];

      const room = Math.max(0, cap - members.length);
      const wanted = Math.min(spare - free.length, room);

      for (let i = 0; i < wanted; i++, nextIndex++) {
        plan.add.push(
          new PortModel({
            id: `${prefix}${nextIndex}`,
            // Inherit the group's declared direction (or the last member's), so
            // a spawned port is indistinguishable from an authored sibling.
            type: group.type ?? template?.type ?? 'input',
            index: nextIndex,
            group: groupId,
            dynamic: true,
          })
        );
      }
    } else if (free.length > spare) {
      // Retire surplus spares — but only the ones WE spawned, newest first, so
      // the port ids the user has been looking at stay put.
      const surplus = free
        .filter((port) => port.dynamic === true)
        .sort((a, b) => (b.index || 0) - (a.index || 0))
        .slice(0, free.length - spare);
      plan.remove.push(...surplus.map((port) => port.id));
    }
  }

  return plan;
}

/**
 * The plan, as undoable commands. Empty array when nothing is due — so a caller
 * can drive this on every link change without polluting the undo stack.
 */
export function buildDynamicPortCommands(node: NodeModel): Command[] {
  const plan = planDynamicPorts(node);
  const commands: Command[] = [];
  for (const port of plan.add) commands.push(new AddPortCommand(node.id, port));
  for (const portId of plan.remove) commands.push(new RemovePortCommand(node.id, portId));
  return commands;
}

/** Every node in the diagram that owes the allocator work. */
export function buildDynamicPortCommandsForDiagram(diagram: DiagramModel): Command[] {
  const commands: Command[] = [];
  for (const node of diagram.getNodes()) {
    commands.push(...buildDynamicPortCommands(node));
  }
  return commands;
}
