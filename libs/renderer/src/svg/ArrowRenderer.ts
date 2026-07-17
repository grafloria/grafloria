// ArrowRenderer.ts
// Renders various arrow types for link endpoints (Phase 1.1)

import type { ArrowStyle } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import { getMarker, markerTipOffset, type MarkerContext } from './edge-templates';

/**
 * ArrowRenderer generates SVG VNodes for different arrow types.
 *
 * Supports:
 * - Basic arrows (arrow, circle, square, diamond)
 * - ERD arrows (crow-foot, one, zero-or-one, zero-or-many, one-or-many)
 * - UML arrows (hollow-diamond, filled-diamond, generalization, open-arrow, double-arrow)
 * - Additional arrows (cross, bar, dot, oval)
 * - Half-arrowheads (Mermaid 11.13) — `half-arrow-left` / `half-arrow-right`
 * - AUTHOR-DEFINED markers (Wave 4, Card 5): a raw SVG `path`, or anything
 *   registered with `registerMarker` — the catalogue is no longer a closed enum.
 *
 * @example
 * ```typescript
 * const renderer = new ArrowRenderer();
 * const arrowVNode = renderer.renderArrow({
 *   type: 'crow-foot',
 *   size: 10,
 *   filled: false,
 *   color: '#000'
 * }, 'translate(100, 50) rotate(45)');
 * ```
 *
 * @example A custom marker
 * ```typescript
 * registerMarker('feather', {
 *   tipOffset: style => style.size,
 *   render: ctx => ({ type: 'path', props: { d: `M0,0 L${ctx.size},0`, stroke: ctx.color, transform: ctx.transform } }),
 * });
 * link.updateStyle({ arrowHead: { type: 'feather', size: 12, filled: true } });
 * ```
 */
export class ArrowRenderer {
  private readonly defaultColor = '#000000';
  private readonly defaultStrokeWidth = 1.5;

  /**
   * Distance from the marker's local origin to its forward-most point (its
   * visual tip), in the +x direction the marker is rotated toward.
   *
   * The renderer positions markers by pulling the transform origin back from
   * the path endpoint by exactly this amount so every tip lands ON the port —
   * a uniform offset only fits the triangle family and left circles/diamonds
   * floating off the node.
   *
   * Wave 4 (Card 5): a custom marker declares its own. Precedence is
   * `style.tipOffset` (explicit) > the registered marker's > 0 (a raw `path`
   * marker is assumed to be drawn with its tip at the origin).
   */
  getTipOffset(style: ArrowStyle): number {
    const size = Math.max(0, style.size);
    if (size === 0 || style.type === 'none') return 0;

    // An explicit tipOffset always wins, whatever the type — it is the escape
    // hatch for a marker whose tip the renderer cannot possibly know about.
    if (typeof style.tipOffset === 'number' && isFinite(style.tipOffset)) {
      return style.tipOffset;
    }

    const custom = this.resolveMarker(style);
    if (custom) {
      return markerTipOffset(custom, style);
    }
    if (style.type === 'custom') {
      // A raw `path` with no registration and no declared tip: origin IS the tip.
      return 0;
    }

    switch (style.type) {
      // Wave 4 — Card 5: half-arrowheads. Same barb geometry as `arrow`, one
      // side only, so the same tip offset.
      case 'half-arrow-left':
      case 'half-arrow-right':
        return size;

      // Tip at local +size
      case 'arrow':
      case 'open-arrow':
      case 'double-arrow':
      case 'crow-foot':
      case 'zero-or-many':
      case 'one-or-many':
        return size;

      // Centered on the local origin: forward edge at +size/2
      case 'circle':
      case 'square':
      case 'cross':
      case 'oval':
      case 'dot':
        return size / 2;

      // Forward-most point at the local origin
      case 'diamond':
      case 'hollow-diamond':
      case 'filled-diamond':
      case 'generalization':
      case 'one':
      case 'zero-or-one':
      case 'bar':
        return 0;

      default:
        return size;
    }
  }

  /**
   * Render an arrow based on the provided style and transform
   *
   * @param style Arrow style configuration
   * @param transform SVG transform string
   * @param backgroundColor Fill for hollow (unfilled) markers — pass the theme
   *   background so hollow arrows don't glare white on dark themes
   * @returns VNode representing the arrow, or null if type is 'none'
   */
  renderArrow(
    style: ArrowStyle,
    transform: string,
    backgroundColor: string = 'white',
    end: 'source' | 'target' = 'target'
  ): VNode | null {
    // Handle none type
    if (style.type === 'none') {
      return null;
    }

    // Normalize size (handle edge cases)
    const size = Math.max(0, style.size);
    if (size === 0) {
      return null; // Don't render zero-size arrows
    }

    // Get color and width
    const color = style.color || this.defaultColor;
    const width = style.width || this.defaultStrokeWidth;

    // Wave 4 (Card 5): a REGISTERED marker wins over everything. Checked before
    // the switch so an author can also register a name that reads like a
    // built-in without the switch swallowing it.
    const custom = this.resolveMarker(style);
    if (custom) {
      const ctx: MarkerContext = {
        style,
        size,
        color,
        width,
        transform,
        backgroundColor,
        end,
      };
      return custom.render(ctx);
    }

    // Wave 4 (Card 5): raw SVG path data, no registration needed.
    if (style.type === 'custom') {
      return style.path
        ? this.renderCustomPath(style.path, style.filled, color, width, transform, backgroundColor)
        : null;
    }

    // Route to appropriate renderer based on type
    switch (style.type) {
      // Wave 4 — Card 5: half-arrowheads (Mermaid 11.13)
      case 'half-arrow-left':
        return this.renderHalfArrow(size, -1, style.filled, color, width, transform, backgroundColor);
      case 'half-arrow-right':
        return this.renderHalfArrow(size, 1, style.filled, color, width, transform, backgroundColor);

      // Basic arrows
      case 'arrow':
        return this.renderTriangleArrow(size, style.filled, color, width, transform, backgroundColor);
      case 'circle':
        return this.renderCircleArrow(size, style.filled, color, width, transform, backgroundColor);
      case 'square':
        return this.renderSquareArrow(size, style.filled, color, width, transform, backgroundColor);
      case 'diamond':
        return this.renderDiamondArrow(size, style.filled, color, width, transform, backgroundColor);

      // ERD arrows
      case 'crow-foot':
        return this.renderCrowFootArrow(size, color, width, transform);
      case 'one':
        return this.renderOneArrow(size, color, width, transform);
      case 'zero-or-one':
        return this.renderZeroOrOneArrow(size, color, width, transform);
      case 'zero-or-many':
        return this.renderZeroOrManyArrow(size, color, width, transform);
      case 'one-or-many':
        return this.renderOneOrManyArrow(size, color, width, transform);

      // UML arrows
      case 'hollow-diamond':
        return this.renderHollowDiamondArrow(size, color, width, transform, backgroundColor);
      case 'filled-diamond':
        return this.renderFilledDiamondArrow(size, color, width, transform);
      case 'generalization':
        return this.renderGeneralizationArrow(size, color, width, transform, backgroundColor);
      case 'open-arrow':
        return this.renderOpenArrow(size, color, width, transform);
      case 'double-arrow':
        return this.renderDoubleArrow(size, style.filled, color, width, transform, backgroundColor);

      // Additional arrows
      case 'cross':
        return this.renderCrossArrow(size, color, width, transform);
      case 'bar':
        return this.renderBarArrow(size, color, width, transform);
      case 'dot':
        return this.renderDotArrow(size, color, transform);
      case 'oval':
        return this.renderOvalArrow(size, style.filled, color, width, transform, backgroundColor);

      default:
        // Fallback to basic arrow for unknown types
        console.warn(`Unknown arrow type: ${style.type}, falling back to basic arrow`);
        return this.renderTriangleArrow(size, style.filled, color, width, transform, backgroundColor);
    }
  }

  // =========================================================================
  // Wave 4 (Edges & links), Card 5 — author-extensible markers
  // =========================================================================

  /**
   * The registered marker this style refers to, if any.
   *
   * Two ways to name one, because both read naturally:
   *   { type: 'custom', marker: 'feather' }   — explicit
   *   { type: 'feather' }                     — the registered name AS the type
   *
   * A registered name never shadows a built-in accidentally: the built-in switch
   * only runs when nothing is registered under that name.
   */
  private resolveMarker(style: ArrowStyle) {
    const name = style.marker ?? (style.type === 'custom' ? undefined : style.type);
    return name ? getMarker(name) : undefined;
  }

  /**
   * A marker from raw SVG path data (`{ type: 'custom', path: 'M0,0 …' }`).
   * Drawn in the marker's local frame — origin at the anchor, +x forward.
   */
  private renderCustomPath(
    d: string,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string
  ): VNode {
    return {
      type: 'path',
      props: {
        d,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-custom',
      },
    };
  }

  /**
   * Half-arrowhead (Mermaid 11.13): one barb of the triangle, on the given side
   * of the direction of travel. `side` is +1 for the RIGHT barb (screen-down
   * when travelling right) and -1 for the LEFT one.
   *
   * The shaft point (size, 0) is the tip, exactly as for the full triangle, so a
   * half arrow anchors on the port identically.
   */
  private renderHalfArrow(
    size: number,
    side: 1 | -1,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string
  ): VNode {
    return {
      type: 'polygon',
      props: {
        points: `0,0 ${size},0 0,${(size / 2) * side}`,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: `arrow arrow-half arrow-half-${side === 1 ? 'right' : 'left'}`,
      },
    };
  }

  /**
   * Basic triangle arrow (standard arrowhead)
   */
  private renderTriangleArrow(
    size: number,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    return {
      type: 'polygon',
      props: {
        points: `0,${-size / 2} ${size},0 0,${size / 2}`,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-triangle'
      }
    };
  }

  /**
   * Circle arrow
   */
  private renderCircleArrow(
    size: number,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    const radius = size / 2;
    return {
      type: 'circle',
      props: {
        cx: 0,
        cy: 0,
        r: radius,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-circle'
      }
    };
  }

  /**
   * Square arrow
   */
  private renderSquareArrow(
    size: number,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    return {
      type: 'rect',
      props: {
        x: -size / 2,
        y: -size / 2,
        width: size,
        height: size,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-square'
      }
    };
  }

  /**
   * Diamond arrow
   */
  private renderDiamondArrow(
    size: number,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    // Diamond: four points forming a rotated square
    return {
      type: 'polygon',
      props: {
        points: `0,0 ${-size / 2},${-size / 2} ${-size},0 ${-size / 2},${size / 2}`,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-diamond'
      }
    };
  }

  /**
   * ERD crow-foot arrow (one-to-many relationship)
   */
  private renderCrowFootArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'g',
      props: {
        transform,
        className: 'arrow arrow-crow-foot'
      },
      children: [
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: 0,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: size,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        }
      ]
    };
  }

  /**
   * ERD one arrow (exactly one - vertical bar)
   */
  private renderOneArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'line',
      props: {
        x1: 0,
        y1: -size / 2,
        x2: 0,
        y2: size / 2,
        style: { stroke: color, strokeWidth: width * 2 }, // Thicker line for emphasis
        transform,
        className: 'arrow arrow-one'
      }
    };
  }

  /**
   * ERD zero-or-one arrow (circle + bar)
   */
  private renderZeroOrOneArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'g',
      props: {
        transform,
        className: 'arrow arrow-zero-or-one'
      },
      children: [
        {
          type: 'circle',
          props: {
            cx: -size,
            cy: 0,
            r: size / 3,
            fill: 'none',
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size / 2,
            x2: 0,
            y2: size / 2,
            style: { stroke: color, strokeWidth: width * 2 }
          }
        }
      ]
    };
  }

  /**
   * ERD zero-or-many arrow (circle + crow-foot)
   */
  private renderZeroOrManyArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'g',
      props: {
        transform,
        className: 'arrow arrow-zero-or-many'
      },
      children: [
        {
          type: 'circle',
          props: {
            cx: -size * 1.5,
            cy: 0,
            r: size / 3,
            fill: 'none',
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: 0,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: size,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        }
      ]
    };
  }

  /**
   * ERD one-or-many arrow (bar + crow-foot)
   */
  private renderOneOrManyArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'g',
      props: {
        transform,
        className: 'arrow arrow-one-or-many'
      },
      children: [
        {
          type: 'line',
          props: {
            x1: -size,
            y1: -size / 2,
            x2: -size,
            y2: size / 2,
            style: { stroke: color, strokeWidth: width * 2 }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: 0,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: size,
            x2: size,
            y2: 0,
            style: { stroke: color, strokeWidth: width }
          }
        }
      ]
    };
  }

  /**
   * UML hollow diamond arrow (aggregation)
   */
  private renderHollowDiamondArrow(
    size: number,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    return {
      type: 'polygon',
      props: {
        points: `0,0 ${-size},${-size / 2} ${-size * 2},0 ${-size},${size / 2}`,
        style: { fill: bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-hollow-diamond'
      }
    };
  }

  /**
   * UML filled diamond arrow (composition)
   */
  private renderFilledDiamondArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'polygon',
      props: {
        points: `0,0 ${-size},${-size / 2} ${-size * 2},0 ${-size},${size / 2}`,
        style: { fill: color, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-filled-diamond'
      }
    };
  }

  /**
   * UML generalization arrow (inheritance - hollow triangle)
   */
  private renderGeneralizationArrow(
    size: number,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    return {
      type: 'polygon',
      props: {
        points: `0,0 ${-size},${-size / 2} ${-size},${size / 2}`,
        style: { fill: bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-generalization'
      }
    };
  }

  /**
   * UML open arrow (dependency - open triangle)
   */
  private renderOpenArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'polyline',
      props: {
        points: `0,${-size / 2} ${size},0 0,${size / 2}`,
        style: { fill: 'none', stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-open'
      }
    };
  }

  /**
   * UML double arrow (bidirectional)
   */
  private renderDoubleArrow(
    size: number,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    return {
      type: 'g',
      props: {
        transform,
        className: 'arrow arrow-double'
      },
      children: [
        {
          type: 'polygon',
          props: {
            points: `0,${-size / 2} ${size},0 0,${size / 2}`,
            style: { fill: filled ? color : bg, stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'polygon',
          props: {
            points: `${-size},${-size / 2} 0,0 ${-size},${size / 2}`,
            style: { fill: filled ? color : bg, stroke: color, strokeWidth: width }
          }
        }
      ]
    };
  }

  /**
   * Cross arrow (X mark)
   */
  private renderCrossArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'g',
      props: {
        transform,
        className: 'arrow arrow-cross'
      },
      children: [
        {
          type: 'line',
          props: {
            x1: -size / 2,
            y1: -size / 2,
            x2: size / 2,
            y2: size / 2,
            style: { stroke: color, strokeWidth: width }
          }
        },
        {
          type: 'line',
          props: {
            x1: -size / 2,
            y1: size / 2,
            x2: size / 2,
            y2: -size / 2,
            style: { stroke: color, strokeWidth: width }
          }
        }
      ]
    };
  }

  /**
   * Bar arrow (perpendicular line)
   */
  private renderBarArrow(
    size: number,
    color: string,
    width: number,
    transform: string
  ): VNode {
    return {
      type: 'line',
      props: {
        x1: 0,
        y1: -size / 2,
        x2: 0,
        y2: size / 2,
        stroke: color,
        strokeWidth: width * 2,
        transform,
        className: 'arrow arrow-bar'
      }
    };
  }

  /**
   * Dot arrow (simple dot)
   */
  private renderDotArrow(
    size: number,
    color: string,
    transform: string
  ): VNode {
    return {
      type: 'circle',
      props: {
        cx: 0,
        cy: 0,
        r: size / 2,
        fill: color,
        stroke: 'none',
        transform,
        className: 'arrow arrow-dot'
      }
    };
  }

  /**
   * Oval arrow
   */
  private renderOvalArrow(
    size: number,
    filled: boolean,
    color: string,
    width: number,
    transform: string,
    bg: string = 'white'
  ): VNode {
    return {
      type: 'ellipse',
      props: {
        cx: 0,
        cy: 0,
        rx: size / 2,
        ry: size / 3,
        // Paint through STYLE, not presentation attributes: the colour may be a
        // var(--grafloria-link-stroke, …) reference so a token bridge or theme swap
        // re-colours markers WITH the edge they cap — attributes cannot hold
        // var() (they painted the theme literal and mismatched bridged edges).
        style: { fill: filled ? color : bg, stroke: color, strokeWidth: width },
        transform,
        className: 'arrow arrow-oval'
      }
    };
  }
}
