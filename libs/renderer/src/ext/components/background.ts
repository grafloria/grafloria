/**
 * ============================================================================
 * Card 6 — <Background>: the rendered grid. GAP CLOSED.
 * ============================================================================
 *
 * The audit's finding was blunt: "no background grid". The engine had a
 * `gridEnabled` flag on `DiagramStore` with ZERO consumers — declared, defaulted
 * to `true`, and read by nobody. There were `gridSize` values all over the
 * renderer, but every one of them belonged to the A-star / Manhattan ROUTING
 * grid, not to anything drawn on screen. Nothing ever painted a pixel of grid.
 *
 * This is that grid, and it is wired to `DiagramStore.gridEnabled`, so the flag
 * now means something (see `attachBackground`, which subscribes to the store).
 *
 * ---------------------------------------------------------------------------
 * How it tracks the camera
 * ---------------------------------------------------------------------------
 * The background lives in its own layer BELOW the SVG layer, and is a single
 * `<rect>` filled with an SVG `<pattern>`. It is NOT re-tessellated per frame:
 * a pattern tile of `gap * zoom` CSS px, offset by the camera's fractional
 * remainder, gives an infinite grid for the cost of two attribute writes.
 *
 *     tile   = gap * zoom
 *     offset = -(world.x * zoom) mod tile     (likewise y)
 *
 * The modulo is what makes it infinite: only the SUB-TILE remainder matters, so
 * the numbers stay small no matter how far you pan. Panning to x = 10^7 does not
 * produce a 10^7-px pattern offset and lose float precision.
 *
 * ---------------------------------------------------------------------------
 * Why not draw it into the main VNode tree?
 * ---------------------------------------------------------------------------
 * Because the patcher reconciles that tree every frame against the diagram
 * model, and the grid is not part of the model. Keeping it in a sibling layer
 * means (a) zero interaction with the reconciler's keyed diff, (b) it costs
 * nothing when the model changes, and (c) it cannot be picked or hit-tested —
 * it is `pointer-events: none`, so it can never eat a click.
 */

import type { Disposer } from '../disposable';
import { once } from '../disposable';
import type { ViewportController } from '../../viewport/viewport-controller';

export const BACKGROUND_LAYER_CLASS = 'grafloria-background-layer';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type BackgroundVariant = 'dots' | 'lines' | 'cross' | 'none';

export interface BackgroundOptions {
  /** Pattern style. Default `'dots'`. */
  variant?: BackgroundVariant;
  /** Grid spacing in WORLD units. Default 20. */
  gap?: number;
  /** Dot radius / line thickness in CSS px. Default 1 (dots) or 1 (lines). */
  size?: number;
  /** Pattern colour. Default a theme-neutral grey. */
  color?: string;
  /** Page colour painted under the pattern. Default transparent. */
  backgroundColor?: string;
  /**
   * Draw a heavier line every N cells (graph-paper look). 0 = off (default).
   * Only meaningful for `'lines'` / `'cross'`.
   */
  majorEvery?: number;
  /** Colour of the major lines. Defaults to `color` at higher opacity. */
  majorColor?: string;
  /**
   * Hide the grid below this zoom, so it does not turn into visual mud when you
   * zoom way out. Default 0.25. Set 0 to always draw.
   */
  minZoom?: number;
  /** Unique-ish suffix for the pattern id, when several diagrams share a page. */
  idSuffix?: string;
}

export interface BackgroundHandle {
  readonly element: SVGSVGElement;
  /** Change any option; re-renders immediately. */
  update(options: Partial<BackgroundOptions>): void;
  /** Show/hide without tearing down (this is what `gridEnabled` drives). */
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  dispose(): void;
}

let backgroundSeq = 0;

/**
 * Create the background grid inside `root`, tracking `viewport`.
 *
 * Returns a handle whose `dispose()` unsubscribes from the camera — the
 * subscription is the leak that Wave 6's "every register() returns a disposer"
 * rule exists to prevent.
 */
export function createBackground(
  root: HTMLElement,
  viewport: ViewportController,
  options: BackgroundOptions = {}
): BackgroundHandle {
  const doc = root.ownerDocument;

  let opts: Required<Omit<BackgroundOptions, 'majorColor' | 'backgroundColor' | 'idSuffix'>> &
    Pick<BackgroundOptions, 'majorColor' | 'backgroundColor' | 'idSuffix'> = {
    variant: options.variant ?? 'dots',
    gap: options.gap ?? 20,
    size: options.size ?? 1,
    color: options.color ?? 'rgba(120,130,145,0.45)',
    majorEvery: options.majorEvery ?? 0,
    minZoom: options.minZoom ?? 0.25,
    majorColor: options.majorColor,
    backgroundColor: options.backgroundColor,
    idSuffix: options.idSuffix,
  };

  const uid = opts.idSuffix ?? `bg${++backgroundSeq}`;
  const patternId = `grafloria-grid-${uid}`;
  const majorId = `grafloria-grid-major-${uid}`;

  // -- layer (below the SVG layer) --------------------------------------------
  let layer = root.querySelector(`:scope > .${BACKGROUND_LAYER_CLASS}`) as HTMLElement | null;
  if (!layer) {
    layer = doc.createElement('div');
    layer.className = BACKGROUND_LAYER_CLASS;
    layer.setAttribute(
      'style',
      'position:absolute;inset:0;pointer-events:none;overflow:hidden'
    );
    // FIRST child ⇒ painted under the diagram.
    root.insertBefore(layer, root.firstChild);
  }

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('class', 'grafloria-background');
  svg.style.display = 'block';

  const defs = doc.createElementNS(SVG_NS, 'defs');
  const pattern = doc.createElementNS(SVG_NS, 'pattern');
  pattern.setAttribute('id', patternId);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const majorPattern = doc.createElementNS(SVG_NS, 'pattern');
  majorPattern.setAttribute('id', majorId);
  majorPattern.setAttribute('patternUnits', 'userSpaceOnUse');

  defs.appendChild(pattern);
  defs.appendChild(majorPattern);
  svg.appendChild(defs);

  const bgRect = doc.createElementNS(SVG_NS, 'rect');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  svg.appendChild(bgRect);

  const gridRect = doc.createElementNS(SVG_NS, 'rect');
  gridRect.setAttribute('width', '100%');
  gridRect.setAttribute('height', '100%');
  gridRect.setAttribute('fill', `url(#${patternId})`);
  svg.appendChild(gridRect);

  const majorRect = doc.createElementNS(SVG_NS, 'rect');
  majorRect.setAttribute('width', '100%');
  majorRect.setAttribute('height', '100%');
  majorRect.setAttribute('fill', `url(#${majorId})`);
  svg.appendChild(majorRect);

  layer.appendChild(svg);

  let visible = true;

  /** Fill one pattern element with the geometry for a given tile size. */
  const paintPattern = (
    target: SVGPatternElement,
    tile: number,
    offsetX: number,
    offsetY: number,
    color: string,
    thickness: number,
    variant: BackgroundVariant
  ): void => {
    target.setAttribute('width', String(tile));
    target.setAttribute('height', String(tile));
    target.setAttribute('patternTransform', `translate(${offsetX},${offsetY})`);
    while (target.firstChild) target.removeChild(target.firstChild);
    if (variant === 'none' || tile <= 0) return;

    if (variant === 'dots') {
      const dot = doc.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(thickness));
      dot.setAttribute('cy', String(thickness));
      dot.setAttribute('r', String(thickness));
      dot.setAttribute('fill', color);
      target.appendChild(dot);
      return;
    }

    if (variant === 'cross') {
      // Small plus signs at each intersection.
      const arm = Math.max(2, tile * 0.12);
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${-arm} 0 H ${arm} M 0 ${-arm} V ${arm}`);
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', String(thickness));
      path.setAttribute('fill', 'none');
      target.appendChild(path);
      return;
    }

    // 'lines' — one horizontal + one vertical edge per tile.
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${tile} 0 V ${tile} M 0 ${tile} H ${tile}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(thickness));
    path.setAttribute('fill', 'none');
    target.appendChild(path);
  };

  const render = (): void => {
    const zoom = viewport.getZoom() || 1;
    const world = viewport.getViewport();

    // Below minZoom the grid is noise, not information.
    const suppressed = opts.variant === 'none' || (opts.minZoom > 0 && zoom < opts.minZoom);
    svg.style.display = visible && !suppressed ? 'block' : 'none';
    if (!visible || suppressed) return;

    bgRect.setAttribute('fill', opts.backgroundColor ?? 'none');

    const tile = opts.gap * zoom;
    if (!(tile > 0.5) || !Number.isFinite(tile)) {
      // Degenerate camera (zoom→0, gap 0). Draw nothing rather than emit an
      // invalid pattern the browser will complain about.
      svg.style.display = 'none';
      return;
    }

    // Only the SUB-TILE remainder matters — see the header note on precision.
    const modulo = (v: number, m: number): number => ((v % m) + m) % m;
    const offsetX = modulo(-world.x * zoom, tile);
    const offsetY = modulo(-world.y * zoom, tile);

    paintPattern(pattern, tile, offsetX, offsetY, opts.color, opts.size, opts.variant);

    if (opts.majorEvery > 0 && opts.variant !== 'dots') {
      const majorTile = tile * opts.majorEvery;
      paintPattern(
        majorPattern,
        majorTile,
        modulo(-world.x * zoom, majorTile),
        modulo(-world.y * zoom, majorTile),
        opts.majorColor ?? opts.color,
        opts.size * 1.5,
        'lines'
      );
      majorRect.style.display = 'block';
    } else {
      majorRect.style.display = 'none';
    }
  };

  render();
  const unsubscribe = viewport.onChange(render);

  return {
    element: svg,
    update(next: Partial<BackgroundOptions>) {
      opts = { ...opts, ...next };
      render();
    },
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      render();
    },
    isVisible: () => visible,
    dispose: once(() => {
      unsubscribe();
      svg.remove();
      if (layer && layer.childElementCount === 0) layer.remove();
    }),
  };
}
