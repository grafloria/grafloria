// LabelRenderer.ts
// Renders labels on link paths (Phase 1.2)

import type { LinkLabel, LinkModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

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
  private readonly defaultLineHeight = 1.2;

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
   * Render text element with optional wrapping
   */
  private renderText(
    label: LinkLabel,
    fontSize: number,
    fontFamily: string | undefined,
    color: string
  ): VNode {
    const textAnchor = label.textAnchor ?? 'middle';
    const textBaseline = label.textBaseline ?? 'middle';

    // Handle text wrapping
    if (label.textWrap && label.maxWidth) {
      return this.renderWrappedText(
        label.text,
        fontSize,
        fontFamily,
        color,
        textAnchor,
        textBaseline,
        label.maxWidth
      );
    }

    // Simple single-line text
    return {
      type: 'text',
      props: {
        x: 0,
        y: 0,
        textContent: label.text,
        fontSize,
        fontFamily,
        fill: color,
        textAnchor,
        dominantBaseline: this.mapTextBaseline(textBaseline),
        className: 'link-label-text'
      }
    };
  }

  /**
   * Render wrapped text with multiple tspan elements
   */
  private renderWrappedText(
    text: string,
    fontSize: number,
    fontFamily: string | undefined,
    color: string,
    textAnchor: 'start' | 'middle' | 'end',
    textBaseline: 'top' | 'middle' | 'bottom',
    maxWidth: number
  ): VNode {
    const lines = this.wrapText(text, maxWidth, fontSize);
    const lineHeight = fontSize * this.defaultLineHeight;

    // Calculate vertical offset for baseline
    const totalHeight = lines.length * lineHeight;
    let baselineOffset = 0;
    if (textBaseline === 'middle') {
      baselineOffset = -totalHeight / 2 + lineHeight / 2;
    } else if (textBaseline === 'bottom') {
      baselineOffset = -totalHeight + lineHeight;
    }

    // Create tspan for each line
    const tspans: VNode[] = lines.map((line, index) => ({
      type: 'tspan',
      props: {
        x: 0,
        dy: index === 0 ? baselineOffset : lineHeight,
        textContent: line
      }
    }));

    return {
      type: 'text',
      props: {
        x: 0,
        y: 0,
        fontSize,
        fontFamily,
        fill: color,
        textAnchor,
        className: 'link-label-text'
      },
      children: tspans
    };
  }

  /**
   * Wrap text into multiple lines based on maxWidth
   */
  private wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.estimateTextWidth(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [text];
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

  /**
   * Map textBaseline to SVG dominantBaseline
   */
  private mapTextBaseline(
    baseline: 'top' | 'middle' | 'bottom'
  ): string {
    switch (baseline) {
      case 'top':
        return 'hanging';
      case 'bottom':
        return 'baseline';
      case 'middle':
      default:
        return 'middle';
    }
  }
}
