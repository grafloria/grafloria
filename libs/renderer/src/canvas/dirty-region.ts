// dirty-region.ts — which part of the canvas actually has to be repainted.
//
// Retained-mode canvas rendering only beats immediate-mode redraw if a frame
// that changed ONE node repaints roughly one node's worth of pixels. This module
// is the part that decides that.
//
// HOW IT KNOWS WHAT CHANGED — for free, from the VNode contract:
//
//   `SVGRenderer` caches VNodes per entity and re-serves THE SAME OBJECT for a
//   clean entity (that is the invariant `vnode/patch.ts` relies on to skip whole
//   subtrees: `oldVNode === newVNode ⇒ nothing changed`). So the canvas backend
//   gets change detection from object identity, exactly like the patcher does —
//   no model diffing, no engine hooks, no dirty-flag plumbing of its own.
//
//   changed entity  → dirty rect = union(old bounds, new bounds)
//   removed entity  → dirty rect = old bounds
//   added entity    → dirty rect = new bounds
//
// Bounds of an UNCHANGED entity are never recomputed: they are carried over from
// the previous frame, so a steady-state frame does no geometry work at all.
//
// A viewport / zoom / DPR / theme change invalidates everything — the whole
// canvas is one big dirty rect, and the tracker says so by returning `null`.

import type { VNode } from '../types/vnode.types';
import { type Bounds, boundsIntersect, boundsUnion } from './path-geometry';

/** The bounds of one top-level entity, and the VNode that produced them. */
export interface EntitySnapshot {
  vnode: VNode;
  bounds: Bounds | null;
}

export interface DirtyDiff {
  /**
   * World rects to repaint, or `null` for "repaint everything" (first frame,
   * camera move, theme swap, or too much changed to be worth clipping).
   */
  rects: Bounds[] | null;
  /** Entities whose VNode object is new this frame. */
  changed: string[];
  /** Entities that disappeared. */
  removed: string[];
}

/**
 * Above this many changed entities, a partial repaint stops paying: the clip
 * setup and per-rect clearing cost more than just redrawing the frame. (A drag
 * over a 5k-node diagram changes 1–2 entities; a layout run changes all of them.)
 */
const FULL_REDRAW_THRESHOLD = 64;

/** Merge rects that overlap or nearly touch, so we don't clip 40 slivers. */
export function mergeRects(rects: Bounds[], slack = 8): Bounds[] {
  if (rects.length <= 1) return rects;

  const out: Bounds[] = [];
  for (const rect of rects) {
    const grown = {
      minX: rect.minX - slack,
      minY: rect.minY - slack,
      maxX: rect.maxX + slack,
      maxY: rect.maxY + slack,
    };

    let merged = false;
    for (let i = 0; i < out.length; i++) {
      if (boundsIntersect(out[i], grown)) {
        out[i] = boundsUnion(out[i], rect) as Bounds;
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...rect });
  }

  // One more pass: the merges above can bring two output rects into contact.
  if (out.length > 1 && out.length < rects.length) return mergeRects(out, slack);
  return out;
}

export class DirtyRegionTracker {
  private prev = new Map<string, EntitySnapshot>();
  private forceFull = true;

  /** Next frame repaints everything (camera moved, theme swapped, resized …). */
  invalidateAll(): void {
    this.forceFull = true;
  }

  /** Forget everything (a new diagram, or a disposed renderer). */
  reset(): void {
    this.prev.clear();
    this.forceFull = true;
  }

  /**
   * Diff this frame's entities against the last one.
   *
   * @param current  entity key → this frame's VNode.
   * @param measure  computes an entity's world bounds. Called ONLY for entities
   *                 whose VNode object actually changed — an unchanged entity is
   *                 never measured at all.
   */
  diff(current: Map<string, VNode>, measure: (vnode: VNode) => Bounds | null): DirtyDiff {
    const changed: string[] = [];
    const removed: string[] = [];
    const rects: Bounds[] = [];

    const next = new Map<string, EntitySnapshot>();

    for (const [key, vnode] of current) {
      const before = this.prev.get(key);

      // Identity: the SVG renderer re-serves the same VNode object for a clean
      // entity, so this is a complete and exact change test.
      if (before && before.vnode === vnode) {
        next.set(key, before);
        continue;
      }

      const bounds = measure(vnode);
      next.set(key, { vnode, bounds });
      changed.push(key);

      const union = boundsUnion(before?.bounds ?? null, bounds);
      if (union) rects.push(union);
    }

    for (const [key, before] of this.prev) {
      if (current.has(key)) continue;
      removed.push(key);
      if (before.bounds) rects.push(before.bounds);
    }

    const wasForced = this.forceFull;
    this.forceFull = false;
    this.prev = next;

    if (wasForced || changed.length + removed.length > FULL_REDRAW_THRESHOLD) {
      return { rects: null, changed, removed };
    }

    return { rects: mergeRects(rects), changed, removed };
  }

  /** Bounds recorded for an entity on the last frame (testing / diagnostics). */
  getBounds(key: string): Bounds | null | undefined {
    return this.prev.get(key)?.bounds;
  }

  get size(): number {
    return this.prev.size;
  }
}

/**
 * The top-level entities of a rendered tree: every keyed child of the links and
 * nodes layers. These are the units of change — the granularity at which the SVG
 * renderer caches, and therefore the granularity at which identity means
 * "unchanged".
 *
 * The connection-preview layer is deliberately NOT an entity: it exists only
 * mid-drag, changes every frame, and is handled by {@link previewIsActive}.
 */
export function collectEntities(root: VNode): Map<string, VNode> {
  const out = new Map<string, VNode>();

  for (const layer of root.children ?? []) {
    if (!layer || layer.type !== 'g') continue;
    if (layer.key !== 'links-layer' && layer.key !== 'nodes-layer') continue;
    for (const child of layer.children ?? []) {
      if (child?.key) out.set(child.key, child);
    }
  }

  return out;
}

/**
 * True when the tree carries a live connection / reconnection preview. It has no
 * stable identity and moves with the pointer, so any frame containing one is
 * repainted whole — the honest, correct answer, and it only happens mid-drag.
 */
export function previewIsActive(root: VNode): boolean {
  for (const layer of root.children ?? []) {
    if (layer?.key === 'connection-preview-layer') {
      return (layer.children?.length ?? 0) > 0;
    }
  }
  return false;
}
