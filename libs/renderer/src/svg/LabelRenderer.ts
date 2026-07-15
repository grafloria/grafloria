// LabelRenderer.ts
// Renders labels on link paths (Phase 1.2)
//
// Wave 4 (Edges & links), Card 5 — this used to be SVG-`<text>`-ONLY. It can now
// also emit:
//   • ARBITRARY HTML, in a `foreignObject` (the same seam nodes already use),
//   • a registered LABEL TEMPLATE (author code returning VNodes),
// and it understands the three edge SLOTS (start / center / end) that ngx-vflow
// ships, so authors stop hand-computing `position` fractions.
//
// Wave 4, Card 7 — the label's OFFSET may be overridden by the diagram-wide edge
// optimizer, which moves `autoOffset` labels off nodes/labels/links. The
// override is passed in rather than read from the model, because it is a
// per-frame placement decision, not persisted state.

import { linkLabelPosition, type LinkLabel, type LinkModel, type Point } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import type { Theme } from '../types/theme.types';
import { renderTextBlock } from './text-block';
import { getLabelTemplate, htmlLabelVNode, type LabelTemplateContext } from './edge-templates';

/** Default box for an HTML / template label (a `foreignObject` needs a size). */
export const DEFAULT_HTML_LABEL_WIDTH = 120;
export const DEFAULT_HTML_LABEL_HEIGHT = 28;

/** Extra, per-frame context — none of it belongs on the persisted model. */
export interface LabelRenderContext {
  /**
   * Card 7: the offset the edge optimizer settled on. Overrides `label.offset`
   * when present (it IS `label.offset` for any label that did not opt into
   * `autoOffset`).
   */
  offset?: Point;
  theme?: Theme;
}

/**
 * LabelRenderer generates SVG (or HTML) VNodes for link labels.
 *
 * Features:
 * - Position labels at any point along path (0-1), or in one of three slots
 * - Auto-rotation with path or fixed angle
 * - Text wrapping with maxWidth
 * - Multiple labels per link
 * - Rich styling support
 * - HTML content and author templates (Card 5)
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
   * @param context Per-frame extras (optimizer offset, theme)
   * @returns VNode representing the label, or null if invalid
   */
  renderLabel(label: LinkLabel, link: LinkModel, context: LabelRenderContext = {}): VNode | null {
    const position = linkLabelPosition(label);

    // Get position on path
    const point = link.getPointAtPosition(position);
    if (!point) {
      return null; // No valid position
    }

    // Apply offset — the optimizer's, when it placed this label (Card 7).
    const offset = context.offset ?? label.offset ?? { x: 0, y: 0 };
    const finalX = point.x + offset.x;
    const finalY = point.y + offset.y;

    // Calculate rotation
    const rotation = this.resolveRotation(label, link, position);

    // --- Card 5: an author TEMPLATE replaces everything below ---------------
    if (label.template) {
      const template = getLabelTemplate(label.template);
      if (template) {
        const ctx: LabelTemplateContext = {
          label,
          link,
          anchor: { x: finalX, y: finalY },
          rotation,
          // The theme is optional on this path only because renderLabel is a
          // public API older than themes-on-labels; the renderer always passes it.
          theme: context.theme as Theme,
        };
        const produced = template(ctx);
        if (!produced) return null;
        const children = Array.isArray(produced) ? produced : [produced];
        return {
          type: 'g',
          key: `link-label-${label.id}`,
          props: { className: 'link-label-group link-label-template' },
          children,
        };
      }
      // Unregistered template name: fall through to the built-in rendering
      // rather than silently dropping the label.
    }

    // --- Card 5: raw HTML in a foreignObject --------------------------------
    if (label.html !== undefined) {
      const width = label.width ?? DEFAULT_HTML_LABEL_WIDTH;
      const height = label.height ?? DEFAULT_HTML_LABEL_HEIGHT;
      const fo = htmlLabelVNode({
        id: label.id,
        html: label.html,
        anchor: { x: finalX, y: finalY },
        width,
        height,
      });
      // Rotation rides on a wrapper <g>: a foreignObject positions itself with
      // x/y, so rotating it directly would rotate about the SVG origin.
      return {
        type: 'g',
        key: `link-label-${label.id}`,
        props: {
          className: 'link-label-group link-label-html-group',
          ...(rotation !== undefined
            ? { transform: `rotate(${rotation}, ${finalX}, ${finalY})` }
            : {}),
        },
        children: [fo],
      };
    }

    // --- built-in SVG text --------------------------------------------------
    // Build transform
    let transform = `translate(${finalX}, ${finalY})`;
    if (rotation !== undefined) {
      transform += ` rotate(${rotation})`;
    }

    // Get style properties
    const fontSize = label.style?.fontSize ?? this.defaultFontSize;
    const fontFamily = label.style?.fontFamily;
    const color = label.style?.color ?? this.defaultColor;
    // A label rides ON the stroke — without a chip the line strikes straight
    // through the text (the screenshot audit caught exactly that). Default to
    // the theme's canvas surface so the chip reads as "the line passes behind";
    // `background: 'none'` opts back out.
    const themedSurface = (context.theme as Theme | undefined)?.colors.background.surface;
    const rawBackground = label.style?.background ?? themedSurface;
    const background = rawBackground === 'none' ? undefined : rawBackground;
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
   * Estimated on-screen box of a label, in LOCAL units (before the path anchor
   * and offset are applied). The edge optimizer needs a box to test collisions
   * against; HTML/template labels declare their own, and text labels are
   * measured with the same estimator the background rect already uses.
   */
  labelBox(label: LinkLabel): { width: number; height: number } {
    if (label.html !== undefined || label.template) {
      return {
        width: label.width ?? DEFAULT_HTML_LABEL_WIDTH,
        height: label.height ?? DEFAULT_HTML_LABEL_HEIGHT,
      };
    }
    const fontSize = label.style?.fontSize ?? this.defaultFontSize;
    const padding = label.style?.padding ?? this.defaultPadding;
    return {
      width: this.estimateTextWidth(label.text, fontSize) + padding * 2,
      height: fontSize + padding * 2,
    };
  }

  /** Resolve `rotation: 'auto' | number` against the path, honouring keepUpright. */
  private resolveRotation(
    label: LinkLabel,
    link: LinkModel,
    position: number
  ): number | undefined {
    if (label.rotation === 'auto') {
      const angle = link.getAngleAt(position);
      if (angle === null) return undefined;

      let rotation = angle;

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
      return rotation;
    }

    if (typeof label.rotation === 'number') {
      return label.rotation;
    }

    return undefined;
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
