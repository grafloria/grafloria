// The world rectangles the canvas paints for GROUP FRAMES — captions included.
//
// "Fit the view to the content" has to mean the content the user SEES. A group's
// frame reaches past its members (padding, an authored size, a lane pool's empty
// bands and its title strip), so a fit measured on nodes alone clipped a lane
// pool at the viewport edge (the docs review's "Delivery" pool). This is the one
// definition both canvases fit to; it mirrors `SVGRenderer.renderGroupsLayer`'s
// choice of WHICH frames are drawn and `renderGroupFrame`/`renderZoneFrame`'s
// placement of their captions.

import type { Rectangle } from '../types/geometry.types';

/** The slice of a GroupModel this needs (structural, so any diagram model fits). */
interface FrameGroup {
  name?: string;
  isCollapsed?: boolean;
  laneConfig?: { role?: string; orientation?: string; headerSize?: number } | null;
  getOuterBounds(): { x: number; y: number; width: number; height: number };
  getMetadata?(key: string): unknown;
}

export interface GroupFrameBoundsOptions {
  /** Caption font size for theme frames (the theme's `fontSize.sm`). Default 12. */
  captionFontSize?: number;
}

/**
 * A caption's width, estimated. Layout is not available here (and must not be: this
 * runs headless), so use the average advance of a proportional sans face — about 0.6em
 * per character, which errs wide, the safe side for "keep it in view".
 */
function captionWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

/**
 * Every drawn group frame's world rectangle, grown to take in a caption that runs past
 * the frame. Frames the renderer does not draw — a layout container with
 * `frameChrome: 'none'` (unless collapsed, which always draws) or a group with no
 * geometry yet — are left out.
 */
export function groupFrameRects(
  diagram: { getGroups?: () => FrameGroup[] } | null | undefined,
  options: GroupFrameBoundsOptions = {}
): Rectangle[] {
  const groups = diagram?.getGroups?.() ?? [];
  const themeFont = options.captionFontSize ?? 12;
  const out: Rectangle[] = [];

  for (const g of groups) {
    if (!g.isCollapsed && g.getMetadata?.('frameChrome') === 'none') continue;
    const b = g.getOuterBounds();
    if (!(b.width > 0 && b.height > 0)) continue;

    let left = b.x;
    let top = b.y;
    let right = b.x + b.width;
    let bottom = b.y + b.height;

    const name = typeof g.name === 'string' ? g.name : '';
    if (name) {
      const zone = !g.isCollapsed
        ? (g.getMetadata?.('frameStyle') as { labelPlacement?: string; fontSize?: unknown } | undefined)
        : undefined;
      const lc = g.laneConfig;
      const sideStrip =
        !g.isCollapsed && lc?.role === 'pool' && lc.orientation === 'horizontal'
          ? Math.min(lc.headerSize ?? 0, b.width)
          : 0;

      if (zone) {
        // renderZoneFrame: inset 16px from the side it is anchored to.
        const size = typeof zone.fontSize === 'number' && Number.isFinite(zone.fontSize) ? zone.fontSize : 11;
        const w = captionWidth(name, size);
        const placement = zone.labelPlacement ?? 'top-left';
        if (placement.endsWith('left')) right = Math.max(right, b.x + 16 + w);
        else if (placement.endsWith('right')) left = Math.min(left, b.x + b.width - 16 - w);
        else {
          const mid = b.x + b.width / 2;
          left = Math.min(left, mid - w / 2);
          right = Math.max(right, mid + w / 2);
        }
      } else if (sideStrip > 0) {
        // A horizontal pool's title is rotated −90° and centred in its strip.
        const w = captionWidth(name, themeFont);
        const mid = b.y + b.height / 2;
        top = Math.min(top, mid - w / 2);
        bottom = Math.max(bottom, mid + w / 2);
      } else {
        // renderGroupFrame: 8px in from the left of the title band.
        right = Math.max(right, b.x + 8 + captionWidth(name, themeFont));
      }
    }

    out.push({ x: left, y: top, width: right - left, height: bottom - top });
  }
  return out;
}
