// ArrowRenderer.ts
// Renders various arrow types for link endpoints (Phase 1.1)

import type { ArrowStyle } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

/**
 * ArrowRenderer generates SVG VNodes for different arrow types.
 *
 * Supports:
 * - Basic arrows (arrow, circle, square, diamond)
 * - ERD arrows (crow-foot, one, zero-or-one, zero-or-many, one-or-many)
 * - UML arrows (hollow-diamond, filled-diamond, generalization, open-arrow, double-arrow)
 * - Additional arrows (cross, bar, dot, oval)
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
   */
  getTipOffset(style: ArrowStyle): number {
    const size = Math.max(0, style.size);
    if (size === 0 || style.type === 'none') return 0;

    switch (style.type) {
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
  renderArrow(style: ArrowStyle, transform: string, backgroundColor: string = 'white'): VNode | null {
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

    // Route to appropriate renderer based on type
    switch (style.type) {
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
        fill: filled ? color : bg,
        stroke: color,
        strokeWidth: width,
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
        fill: filled ? color : bg,
        stroke: color,
        strokeWidth: width,
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
        fill: filled ? color : bg,
        stroke: color,
        strokeWidth: width,
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
        fill: filled ? color : bg,
        stroke: color,
        strokeWidth: width,
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
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: 0,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: size,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
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
        stroke: color,
        strokeWidth: width * 2, // Thicker line for emphasis
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
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size / 2,
            x2: 0,
            y2: size / 2,
            stroke: color,
            strokeWidth: width * 2
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
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: 0,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: size,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
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
            stroke: color,
            strokeWidth: width * 2
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: -size,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: 0,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: 0,
            y1: size,
            x2: size,
            y2: 0,
            stroke: color,
            strokeWidth: width
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
        fill: bg,
        stroke: color,
        strokeWidth: width,
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
        fill: color,
        stroke: color,
        strokeWidth: width,
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
        fill: bg,
        stroke: color,
        strokeWidth: width,
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
        fill: 'none',
        stroke: color,
        strokeWidth: width,
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
            fill: filled ? color : bg,
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'polygon',
          props: {
            points: `${-size},${-size / 2} 0,0 ${-size},${size / 2}`,
            fill: filled ? color : bg,
            stroke: color,
            strokeWidth: width
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
            stroke: color,
            strokeWidth: width
          }
        },
        {
          type: 'line',
          props: {
            x1: -size / 2,
            y1: size / 2,
            x2: size / 2,
            y2: -size / 2,
            stroke: color,
            strokeWidth: width
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
        fill: filled ? color : bg,
        stroke: color,
        strokeWidth: width,
        transform,
        className: 'arrow arrow-oval'
      }
    };
  }
}
