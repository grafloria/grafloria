// port-type-registry.ts — Wave 6 (Ports & connections), Card 7.
//
// Typed data-flow ports. A port declares `dataType: 'number'`; the registry says
// what a `number` may attach to and what colour it wears. Link validity and
// visual affordance then DERIVE from the type instead of being hand-wired per
// diagram — which is the whole point of the node-editor pattern (Blender,
// Unreal Blueprints, n8n, Node-RED all work this way).
//
// Deliberately dependency-free: no models, no renderer. The validator imports
// `arePortDataTypesCompatible`, the renderer imports `portTypeColor`. One source
// of truth, two consumers, no cycle.

import type { PortDataTypeDefinition } from './port-types';

/** The wildcard: a port typed `*` (or declared compatible with `*`) fits anything. */
export const ANY_PORT_TYPE = '*';

export class PortTypeRegistry {
  private types = new Map<string, PortDataTypeDefinition>();

  register(definition: PortDataTypeDefinition): void {
    this.types.set(definition.name, definition);
  }

  registerAll(definitions: PortDataTypeDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  get(name: string): PortDataTypeDefinition | undefined {
    return this.types.get(name);
  }

  has(name: string): boolean {
    return this.types.has(name);
  }

  unregister(name: string): void {
    this.types.delete(name);
  }

  clear(): void {
    this.types.clear();
  }

  /**
   * May a link carry `from` into `to`?
   *
   * - either side UNTYPED  → yes (an untyped port is unconstrained; this is what
   *   keeps every pre-wave-6 diagram connecting exactly as it did)
   * - either side is `*`    → yes
   * - identical names       → yes
   * - `from`'s registered `compatibleWith` lists `to` (or `*`) → yes
   * - otherwise             → no
   *
   * Compatibility is DIRECTIONAL on purpose: `int → float` is a widening that a
   * host may well allow while `float → int` is a lossy one it may not.
   */
  isCompatible(from: string | undefined, to: string | undefined): boolean {
    if (!from || !to) return true;
    if (from === ANY_PORT_TYPE || to === ANY_PORT_TYPE) return true;
    if (from === to) return true;

    const definition = this.types.get(from);
    if (!definition?.compatibleWith?.length) return false;
    return definition.compatibleWith.includes(to) || definition.compatibleWith.includes(ANY_PORT_TYPE);
  }

  /** The glyph colour for a data type, if one was registered. */
  colorFor(name: string | undefined): string | undefined {
    if (!name) return undefined;
    return this.types.get(name)?.color;
  }
}

/** The process-wide registry. Hosts register their data types at bootstrap. */
export const portTypeRegistry = new PortTypeRegistry();

/** Free-function facade over the singleton — what PortModel/validators import. */
export function arePortDataTypesCompatible(from: string | undefined, to: string | undefined): boolean {
  return portTypeRegistry.isCompatible(from, to);
}

/** Free-function facade over the singleton — what the renderer imports. */
export function portTypeColor(name: string | undefined): string | undefined {
  return portTypeRegistry.colorFor(name);
}
