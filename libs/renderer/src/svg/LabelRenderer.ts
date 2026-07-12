// LabelRenderer.ts
// Renders labels on link paths (Phase 1.2)

import type { LinkLabel, LinkModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import { renderTextBlock } from './text-block';

/**
 * LabelRenderer generates SVG VNodes for link labels.
 *
 * Features:
 * - Position labels at any point along path (0-1)
 * - Auto-rotation with path or fixed angle
 * - Text wrapping with maxWidth
 * - Multiple labels per link
 * - Rich styling support
 *
 * Architecture:
 * Uses LinkModel utilities (getPointAtPosition, getAngleAt) for positioning.
 * Returns VNode tree compatible with framework-agnostic rendering.
 */
export class LabelRenderer {
  private readonly defaultFontSize = 12;
  private readonly defaultColor = '#000000';
  private readonly defaultPadding = 4;

  /**
   * Render a label on a link
   *
   * @param label Label configuration
   * @param link Link model for positioning calculations
   * @returns VNode representing the label, or null if invalid
   */
  renderLabel(label: LinkLabel, link: LinkModel): VNode | null {
    // Get position on path
    const point = link.getPointAtPosition(label.position);
    if (!point) {
      return null; // No valid position
    }

    // Apply offset
    const finalX = point.x + label.offset.x;
    const finalY = point.y + label.offset.y;

    // Calculate rotation
    let rotation: number | undefined;
    if (label.rotation === 'auto') {
      const angle = link.getAngleAt(label.position);
      if (angle !== null) {
        rotation = angle;

        // Apply rotation offset
        if (label.rotationOffset) {
          rotation += label.rotationOffset;
        }

        // Keep upright logic
        if (label.keepUpright) {
          // Normalize angle to -180 to 180
          while (rotation > 180) rotation -= 360;
          while (rotation < -180) rotation += 360;

          // Flip if upside down (angle > 90 or < -90)
          if (rotation > 90) {
            rotation -= 180;
          } else if (rotation < -90) {
            rotation += 180;
          }
        }
      }
    } else if (typeof label.rotation === 'number') {
      rotation = label.rotation;
    }

    // Build transform
    let transform = `translate(${finalX}, ${finalY})`;
    if (rotation !== undefined) {
      transform += ` rotate(${rotation})`;
    }

    // Get style properties
    const fontSize = label.style?.fontSize ?? this.defaultFontSize;
    const fontFamily = label.style?.fontFamily;
    const color = label.style?.color ?? this.defaultColor;
    const background = label.style?.background;
    const padding = label.style?.padding ?? this.defaultPadding;
    const borderRadius = label.style?.borderRadius ?? 3;

    // Build children array
    const children: VNode[] = [];

    // Add background if specified
    if (background) {
      // Estimate text dimensions for background
      const textWidth = this.estimateTextWidth(label.text, fontSize);
      const textHeight = fontSize;

      const bgRect: VNode = {
        type: 'rect',
        props: {
          x: this.getBackgroundX(label.textAnchor, textWidth, padding),
          y: -textHeight / 2 - padding,
          width: textWidth + padding * 2,
          height: textHeight + padding * 2,
          fill: background,
          stroke: label.style?.border,
          rx: borderRadius,
          className: 'link-label-bg'
        }
      };
      children.push(bgRect);
    }

    // Build text element
    const textVNode = this.renderText(label, fontSize, fontFamily, color);
    children.push(textVNode);

    // Return group container
    return {
      type: 'g',
      key: `link-label-${label.id}`,
      props: {
        transform,
        className: 'link-label-group'
      },
      children
    };
  }

  /**
   * Render the label's text element (single-line or wrapped).
   *
   * Delegates to the shared, link-agnostic {@link renderTextBlock} engine —
   * the same code path node labels use — so wrapping / multi-line / vertical
   * alignment behave identically for both. The link label is drawn at the group
   * origin (0,0); the enclosing <g> carries the position + rotation transform.
   */
  private renderText(
    label: LinkLabel,
    fontSize: number,
    fontFamily: string | undefined,
    color: string
  ): VNode {
    return renderTextBlock({
      text: label.text,
      x: 0,
      y: 0,
      maxWidth: label.textWrap ? label.maxWidth : undefined,
      align: label.textAnchor ?? 'middle',
      valign: label.textBaseline ?? 'middle',
      fontSize,
      fontFamily,
      color,
      className: 'link-label-text',
    });
  }

  /**
   * Estimate text width (approximate)
   * For accurate measurement, this would need canvas measureText,
   * but approximation is sufficient for most cases
   */
  private estimateTextWidth(text: string, fontSize: number): number {
    // Rough estimate: average character width is ~0.6 of fontSize
    return text.length * fontSize * 0.6;
  }

  /**
   * Calculate background X position based on text anchor
   */
  private getBackgroundX(
    textAnchor: 'start' | 'middle' | 'end' | undefined,
    textWidth: number,
    padding: number
  ): number {
    switch (textAnchor) {
      case 'start':
        return -padding;
      case 'end':
        return -textWidth - padding;
      case 'middle':
      default:
        return -textWidth / 2 - padding;
    }
  }
}
