// SVG paint servers (Styling & theming — Card 2)
//
// First-class support for gradient / pattern fills and drop-shadow filters.
// When a node/link `style.fill` or `style.stroke` is a SPEC OBJECT (not a
// colour string), or `style.shadow` is a Shadow spec, the renderer materialises
// a `<linearGradient>` / `<radialGradient>` / `<pattern>` / `<filter>` inside a
// single deduped `<defs>` block and references it via `url(#grafloria-def-<hash>)`.
//
// Two identical specs hash to the SAME id, so they share ONE def — the renderer
// keeps a per-frame Map<id, VNode> and only registers a def the first time it
// sees that id in a frame.
//
// These helpers are PURE (no renderer state) so they can be unit-tested in
// isolation; the renderer owns the per-frame dedup Map and the resolve() glue.

import type { VNode } from '../types';
import type { LinearGradient, RadialGradient, Pattern, Shadow, GradientStop } from '@grafloria/engine';

/** A fill/stroke paint that resolves to an SVG paint server (not a colour). */
export type PaintSpec = LinearGradient | RadialGradient | Pattern;

const GRADIENT_TYPES = new Set(['linear', 'radial']);
const PATTERN_TYPES = new Set(['dots', 'lines', 'grid', 'hatch', 'crosshatch']);

/** True when a fill/stroke value is a paint-server spec object (vs a colour string). */
export function isPaintSpec(value: unknown): value is PaintSpec {
  if (value == null || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && (GRADIENT_TYPES.has(type) || PATTERN_TYPES.has(type));
}

/** True when a `style.shadow` value is a Shadow spec object (vs the legacy boolean). */
export function isShadowSpec(value: unknown): value is Shadow {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { blur?: unknown }).blur === 'number' &&
    typeof (value as { offsetX?: unknown }).offsetX === 'number'
  );
}

/**
 * The one flat colour that best stands in for a paint server.
 *
 * wave8/culling — Card 4: at a far-zoom LOD tier the renderer stops emitting
 * paint servers entirely and paints this instead. A gradient across a shape that
 * is 35x17 CSS pixels resolves to about one colour on the display anyway; what it
 * costs is a `<defs>` entry, a `url(#…)` indirection, and — the expensive part —
 * a VNode-cache bypass for every gradient entity in the scene, every frame.
 *
 * For a gradient that stand-in is the stop nearest the MIDDLE, not the first one:
 * a two-stop white→black gradient read as "white" is a bigger visual lie than
 * reading it as mid-grey, and the middle stop is what the eye integrates to.
 * For a pattern it is the background it is drawn on — the marks are sub-pixel and
 * what survives is the field they sit on.
 */
export function flattenPaint(spec: PaintSpec): string {
  if (spec.type === 'linear' || spec.type === 'radial') {
    const stops = spec.stops ?? [];
    if (stops.length === 0) return FLATTEN_FALLBACK;

    let best = stops[0];
    let bestDelta = Math.abs((best.offset ?? 0) - 0.5);
    for (const stop of stops) {
      const delta = Math.abs((stop.offset ?? 0) - 0.5);
      if (delta < bestDelta) {
        best = stop;
        bestDelta = delta;
      }
    }
    return best.color ?? FLATTEN_FALLBACK;
  }

  // Pattern: dots/lines/grid/hatch/crosshatch.
  return spec.backgroundColor ?? spec.color ?? FLATTEN_FALLBACK;
}

/** Used only when a spec carries no colour at all — a malformed spec still paints. */
const FLATTEN_FALLBACK = '#888888';

// ---------------------------------------------------------------------------
// Stable hashing — identical specs (regardless of key order) share one def id.
// ---------------------------------------------------------------------------

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/** FNV-1a 32-bit → base36. Short, stable, collision-resistant enough for def ids. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Stable `<defs>` element id for a paint/shadow spec (identical specs → same id). */
export function paintDefId(spec: object): string {
  return `grafloria-def-${fnv1a(stableStringify(spec))}`;
}

// ---------------------------------------------------------------------------
// VNode builders (pure) — turn a spec + id into the SVG def element.
// ---------------------------------------------------------------------------

function buildStops(stops: GradientStop[]): VNode[] {
  return (stops ?? []).map((s, i) => ({
    type: 'stop',
    key: `stop-${i}`,
    props: {
      offset: s.offset,
      'stop-color': s.color,
      ...(s.opacity !== undefined ? { 'stop-opacity': s.opacity } : {}),
    },
  }));
}

function buildLinearGradient(id: string, g: LinearGradient): VNode {
  // Coordinates are 0–1 normalized → SVG default gradientUnits="objectBoundingBox".
  return {
    type: 'linearGradient',
    key: id,
    props: { id, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 },
    children: buildStops(g.stops),
  };
}

function buildRadialGradient(id: string, g: RadialGradient): VNode {
  return {
    type: 'radialGradient',
    key: id,
    props: { id, cx: g.cx, cy: g.cy, r: g.r },
    children: buildStops(g.stops),
  };
}

function buildPattern(id: string, p: Pattern): VNode {
  const tile = Math.max(1, p.spacing ?? 8); // repeat period (user units)
  const feature = Math.max(0.5, p.size ?? 2); // dot radius / line thickness
  const color = p.color ?? '#000000';
  const c = tile / 2;

  const children: VNode[] = [];
  if (p.backgroundColor) {
    children.push({
      type: 'rect',
      key: 'bg',
      props: { x: 0, y: 0, width: tile, height: tile, fill: p.backgroundColor },
    });
  }

  const line = (x1: number, y1: number, x2: number, y2: number, key: string): VNode => ({
    type: 'line',
    key,
    props: { x1, y1, x2, y2, stroke: color, strokeWidth: feature },
  });

  switch (p.type) {
    case 'dots':
      children.push({ type: 'circle', key: 'dot', props: { cx: c, cy: c, r: feature, fill: color } });
      break;
    case 'lines':
      children.push(line(0, c, tile, c, 'h'));
      break;
    case 'grid':
      children.push(line(0, c, tile, c, 'h'), line(c, 0, c, tile, 'v'));
      break;
    case 'hatch':
      children.push(line(0, tile, tile, 0, 'd'));
      break;
    case 'crosshatch':
      children.push(line(0, tile, tile, 0, 'd1'), line(0, 0, tile, tile, 'd2'));
      break;
  }

  return {
    type: 'pattern',
    key: id,
    props: { id, width: tile, height: tile, patternUnits: 'userSpaceOnUse' },
    children,
  };
}

/** Build the `<linearGradient>` / `<radialGradient>` / `<pattern>` def for a paint spec. */
export function buildPaintServerVNode(id: string, spec: PaintSpec): VNode {
  switch (spec.type) {
    case 'linear':
      return buildLinearGradient(id, spec);
    case 'radial':
      return buildRadialGradient(id, spec);
    default:
      return buildPattern(id, spec as Pattern);
  }
}

/** Build the `<filter>` (feDropShadow) def for a Shadow spec. */
export function buildShadowFilterVNode(id: string, shadow: Shadow): VNode {
  return {
    type: 'filter',
    key: id,
    // Room around the element so the blurred shadow isn't clipped. The filter
    // region is expressed as percentage strings, whereas VNodeProps types
    // x/y/width/height as numbers — hence the `as any` on this one props object.
    props: { id, x: '-50%', y: '-50%', width: '200%', height: '200%' } as any,
    children: [
      {
        type: 'feDropShadow',
        key: 'drop',
        props: {
          dx: shadow.offsetX,
          dy: shadow.offsetY,
          stdDeviation: shadow.blur,
          'flood-color': shadow.color,
        },
      },
    ],
  };
}
