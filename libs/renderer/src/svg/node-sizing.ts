// Per-node sizing constraints (Wave 5 / Nodes & shapes — shared by Card 6 + 7)
//
// One config seam owns every "how big may this node be" rule: the interactive
// resizer (Card 6) reads it to clamp a drag DURING the gesture, and the
// content-aware auto-sizer (Card 7) reads it to floor/ceil a computed desired
// size. Keeping it in ONE place is deliberate — the two features must agree
// about a node's min/max, or a user could drag a node to a size auto-sizing
// would immediately fight.
//
// It lives on `node.metadata.sizing` so it serializes for free (metadata is part
// of SerializedNode) and needs no NodeModel schema change.

import type { NodeModel } from '@grafloria/engine';

/**
 * Sizing constraints for a single node. Every field is optional; an absent
 * field means "no constraint" (the global resizer minimum still applies as a
 * safety floor).
 */
export interface NodeSizing {
  /** Content-aware auto-sizing: the node grows to fit its label + panel. */
  auto?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /**
   * Aspect lock. `true` locks to the node's CURRENT width/height ratio; a number
   * locks to that explicit width÷height ratio. Honored during a resize gesture
   * even without the Shift modifier.
   */
  aspectLock?: boolean | number;
  /** Content padding (px) reserved around the label when auto-sizing. */
  padding?: number;
}

/** Read a node's sizing config (never null — an absent config is `{}`). */
export function getNodeSizing(node: NodeModel): NodeSizing {
  const raw = node.getMetadata('sizing');
  return raw && typeof raw === 'object' ? (raw as NodeSizing) : {};
}

/** True when the node opts into content-aware auto-sizing. */
export function isAutoSized(node: NodeModel): boolean {
  return getNodeSizing(node).auto === true;
}

/**
 * The explicit aspect ratio (w÷h) a node is locked to, or null when unlocked.
 * `aspectLock: true` resolves against a supplied current size.
 */
export function resolveAspectRatio(
  sizing: NodeSizing,
  current?: { width: number; height: number }
): number | null {
  if (typeof sizing.aspectLock === 'number' && sizing.aspectLock > 0) {
    return sizing.aspectLock;
  }
  if (sizing.aspectLock === true && current && current.height > 0) {
    return current.width / current.height;
  }
  return null;
}

/** Clamp a scalar into `[min, max]`, tolerating an inverted or absent bound. */
export function clampValue(value: number, min?: number, max?: number): number {
  let out = value;
  if (typeof max === 'number' && isFinite(max)) out = Math.min(out, max);
  if (typeof min === 'number' && isFinite(min)) out = Math.max(out, min);
  return out;
}

export interface ClampOptions {
  /** Global floor applied when the node declares no `minWidth`/`minHeight`. */
  floorWidth?: number;
  floorHeight?: number;
}

/**
 * Clamp a candidate width/height to a node's sizing constraints. The per-node
 * min/max win; a global floor (the resizer's `minWidth`/`minHeight`) fills in
 * when the node sets none. Used identically by the resizer and the auto-sizer,
 * so both cannot disagree about the legal range.
 */
export function clampSizeToConstraints(
  width: number,
  height: number,
  sizing: NodeSizing,
  opts: ClampOptions = {}
): { width: number; height: number } {
  const minW = sizing.minWidth ?? opts.floorWidth;
  const minH = sizing.minHeight ?? opts.floorHeight;
  return {
    width: clampValue(width, minW, sizing.maxWidth),
    height: clampValue(height, minH, sizing.maxHeight),
  };
}
