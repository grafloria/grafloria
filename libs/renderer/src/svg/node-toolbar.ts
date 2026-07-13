// Per-node toolbar configuration (Wave 5 / Nodes & shapes — Card 6)
//
// Which floating tools appear around a selected node — the 8 resize handles, the
// rotate handle, the remove button, and which Halo actions — should be a
// per-node / per-type decision, not one global switch. A sticky-note node might
// allow resize but not rotate; a locked "system" node might show only the Halo
// `connect`. This config seam lets a node declare that on `metadata.toolbar`
// (serializes for free), with a controller-level resolver for per-TYPE policy.

import type { NodeModel } from '@grafloria/engine';

/** The Halo context-toolbar actions a node may expose. */
export type ToolbarHaloAction = 'connect' | 'clone' | 'fork' | 'delete';

/**
 * Per-node tool visibility. Every field is optional; an absent field means "use
 * the controller's global default". `halo: true` → all actions, an array → only
 * those actions, `false` → no halo.
 */
export interface NodeToolbarConfig {
  resize?: boolean;
  rotate?: boolean;
  remove?: boolean;
  halo?: boolean | ToolbarHaloAction[];
}

/** A per-TYPE policy the host installs on the controller. */
export type ToolbarResolver = (node: NodeModel) => NodeToolbarConfig | undefined;

/** Read a node's own toolbar config from metadata, or undefined. */
export function getNodeToolbar(node: NodeModel): NodeToolbarConfig | undefined {
  const raw = node.getMetadata('toolbar');
  return raw && typeof raw === 'object' ? (raw as NodeToolbarConfig) : undefined;
}

/**
 * The effective toolbar config for a node: the node's own metadata, with a
 * host-supplied resolver (per-type policy) layered on top.
 */
export function resolveToolbar(node: NodeModel, resolver?: ToolbarResolver): NodeToolbarConfig {
  return { ...(getNodeToolbar(node) ?? {}), ...(resolver?.(node) ?? {}) };
}

/** Whether a boolean tool (resize / rotate / remove) is enabled; `def` when unset. */
export function toolbarAllows(
  config: NodeToolbarConfig,
  tool: 'resize' | 'rotate' | 'remove',
  def = true
): boolean {
  const v = config[tool];
  return v === undefined ? def : v !== false;
}

/**
 * Whether a Halo action is enabled: `undefined` → `def`, `false` → never,
 * `true` → always, an array → membership.
 */
export function haloAllows(
  config: NodeToolbarConfig,
  action: ToolbarHaloAction,
  def = true
): boolean {
  const h = config.halo;
  if (h === undefined) return def;
  if (typeof h === 'boolean') return h;
  return h.includes(action);
}
