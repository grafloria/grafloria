// label-paint-order.ts
// Labels over lines, as Mermaid paints them.
//
// Each link draws as one group — its line, then its labels — so a link painted
// LATER draws its line over an earlier link's label. Mermaid paints every edge
// label above every line; where its lines cross a label, the label's chip hides
// them. A fan of edges from one box (an Offer with six outcomes) crosses its
// neighbours' labels in both, but only ours showed the line through the words.
//
// The fix keeps each link's group whole and changes only the ORDER: when one
// link's line crosses another's label, that line paints first. A stable
// topological order (Kahn, by original position); links caught in a cycle keep
// their original order.

import { sampleBasis, type LinkModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** `vnodes[i]` is `links[i]`'s rendered group; returns the groups in paint order. */
export function labelsOverLines(links: readonly LinkModel[], vnodes: readonly VNode[]): VNode[] {
  const n = vnodes.length;
  const chips = vnodes.map(labelChips);
  if (chips.every((c) => c.length === 0)) return [...vnodes];
  const lines = links.map((l) => (l.style?.spline === 'basis' && l.points.length > 2 ? sampleBasis(l.points, 8) : l.points));

  const after: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  const before = new Array<number>(n).fill(0);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b || chips[b].length === 0 || after[a].has(b)) continue;
      if (chips[b].some((r) => crosses(lines[a], r))) {
        after[a].add(b);
        before[b]++;
      }
    }
  }

  const order: number[] = [];
  const placed = new Array<boolean>(n).fill(false);
  for (;;) {
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (!placed[i] && before[i] === 0) {
        next = i;
        break;
      }
    }
    if (next < 0) break;
    placed[next] = true;
    order.push(next);
    for (const b of after[next]) before[b]--;
  }
  for (let i = 0; i < n; i++) if (!placed[i]) order.push(i); // a cycle keeps its order
  return order.map((i) => vnodes[i]);
}

/** The world boxes of a link group's label chips (`translate(x, y)` + its background rect). */
function labelChips(vnode: VNode): Rect[] {
  const out: Rect[] = [];
  const walk = (v: VNode | null | undefined | string): void => {
    if (!v || typeof v !== 'object') return;
    const cls = String(v.props?.['className'] ?? '');
    if (cls.split(/\s+/).includes('link-label-group')) {
      const m = /translate\(\s*(-?[\d.e]+)[ ,]+(-?[\d.e]+)\s*\)/.exec(String(v.props?.['transform'] ?? ''));
      const bg = (v.children ?? []).find((c) => c && typeof c === 'object' && (c as VNode).type === 'rect') as VNode | undefined;
      if (m && bg) {
        const p = bg.props ?? {};
        out.push({ x: Number(m[1]) + Number(p['x'] ?? 0), y: Number(m[2]) + Number(p['y'] ?? 0), w: Number(p['width'] ?? 0), h: Number(p['height'] ?? 0) });
      }
      return;
    }
    for (const c of v.children ?? []) walk(c as VNode);
  };
  walk(vnode);
  return out.filter((r) => r.w > 0 && r.h > 0);
}

/** Does a polyline run through a box (2 px in from its edge)? */
function crosses(line: readonly Pt[], r: Rect): boolean {
  const box = { x0: r.x + 2, y0: r.y + 2, x1: r.x + r.w - 2, y1: r.y + r.h - 2 };
  if (box.x1 <= box.x0 || box.y1 <= box.y0) return false;
  for (let i = 0; i + 1 < line.length; i++) if (segmentHitsBox(line[i], line[i + 1], box)) return true;
  return false;
}

/** Liang–Barsky: does segment a→b enter the box? */
function segmentHitsBox(a: Pt, b: Pt, box: { x0: number; y0: number; x1: number; y1: number }): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - box.x0) && clip(dx, box.x1 - a.x) && clip(-dy, a.y - box.y0) && clip(dy, box.y1 - a.y) && t0 <= t1;
}
