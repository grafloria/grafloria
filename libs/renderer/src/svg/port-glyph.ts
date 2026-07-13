// port-glyph.ts — Wave 6 (Ports & connections), Card 0.
//
// The port's rendered marker. Before wave 6 every port in Grafloria was a `<circle>`
// — hardcoded in `SVGRenderer.renderPort` — while THREE separate config surfaces
// claimed otherwise and were all dead:
//
//   * `PortModel.style`  — serialized, deserialized, read by nobody.
//   * `PortModel.visible` — same: round-tripped faithfully, never consulted.
//   * `PortRenderingConfig.svg.{shape,fill,stroke,strokeWidth}` and `.size` —
//     declared in the template system with shape: 'circle' | 'rect' | 'custom',
//     of which only `.mode` and `.visibility` were ever read.
//
// This module is where a port's glyph is actually decided. PURE: spec in, VNode
// in node-local coordinates out.

import type { PortShapeSpec } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

export interface PortGlyphInput {
  /** Node-local anchor: the port's position. The glyph is CENTRED on it. */
  x: number;
  y: number;
  /** Resolved glyph spec. Undefined → a circle of `radius` (the legacy glyph). */
  shape?: PortShapeSpec;
  /** The circle radius the interaction config asks for, and the size fallback. */
  radius: number;
  /** Presentation attributes (fill/stroke/…) already merged from theme+group+port. */
  props: Record<string, unknown>;
}

/** Half-extents of the glyph box, honouring size/width/height with `radius` fallback. */
export function glyphHalfExtents(
  shape: PortShapeSpec | undefined,
  radius: number
): { hw: number; hh: number } {
  const size = shape?.size;
  const width = shape?.width ?? size ?? radius * 2;
  const height = shape?.height ?? size ?? radius * 2;
  return { hw: width / 2, hh: height / 2 };
}

/** `rotate(deg cx cy)` — omitted entirely when the glyph isn't rotated. */
function rotationTransform(shape: PortShapeSpec | undefined, x: number, y: number): string | undefined {
  const degrees = shape?.rotation;
  if (!degrees) return undefined;
  return `rotate(${degrees} ${x} ${y})`;
}

/**
 * Build the port's glyph VNode.
 *
 * BYTE-STABILITY CONTRACT: with `shape` undefined this returns exactly the
 * `<circle cx cy r>` the renderer emitted before wave 6 — same element, same
 * prop set, same order, no rotation attribute. Every existing diagram's port
 * VNodes are unchanged.
 */
export function renderPortGlyph(input: PortGlyphInput): VNode {
  const { x, y, shape, radius, props } = input;
  const kind = shape?.shape ?? 'circle';
  const transform = rotationTransform(shape, x, y);
  const extra = transform ? { transform } : {};

  switch (kind) {
    case 'square': {
      const { hw, hh } = glyphHalfExtents(shape, radius);
      return {
        type: 'rect',
        props: { x: x - hw, y: y - hh, width: hw * 2, height: hh * 2, ...props, ...extra },
      };
    }

    case 'diamond': {
      const { hw, hh } = glyphHalfExtents(shape, radius);
      return {
        type: 'polygon',
        props: {
          points: `${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`,
          ...props,
          ...extra,
        },
      };
    }

    case 'triangle': {
      // Apex UP by default; `rotation` aims it anywhere (a 90° triangle is the
      // classic "signal flows this way" port of a node editor).
      const { hw, hh } = glyphHalfExtents(shape, radius);
      return {
        type: 'polygon',
        props: {
          points: `${x},${y - hh} ${x + hw},${y + hh} ${x - hw},${y + hh}`,
          ...props,
          ...extra,
        },
      };
    }

    case 'path': {
      // Author-supplied `d`, drawn in a box centred on (0,0) and translated onto
      // the anchor. A path glyph with no `d` degrades to the default circle
      // rather than emitting an empty <path> that hit-tests as nothing.
      if (!shape?.path) break;
      const translate = `translate(${x} ${y})`;
      return {
        type: 'path',
        props: {
          d: shape.path,
          ...props,
          transform: transform ? `${translate} rotate(${shape.rotation} 0 0)` : translate,
        },
      };
    }

    case 'circle':
    default:
      break;
  }

  // The legacy glyph. `r` honours an explicit size (size is a DIAMETER) but
  // falls back to the interaction config's radius — so an unconfigured port is
  // byte-for-byte what it always was.
  const r = shape?.size !== undefined ? shape.size / 2 : radius;
  return {
    type: 'circle',
    props: { cx: x, cy: y, r, ...props, ...extra },
  };
}
