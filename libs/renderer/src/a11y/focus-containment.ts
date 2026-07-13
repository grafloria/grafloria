import type { ViewportController } from '../viewport/viewport-controller';
import type { Rectangle } from '../types/geometry.types';
import { requestFrame, cancelFrame, now as platformNow } from '../platform/platform';
import { prefersReducedMotion } from '../utils/animation-utils';

/**
 * FOCUS CONTAINMENT — focus must never rest on geometry the user cannot see.
 *
 * This is a real WCAG failure (2.4.11 Focus Not Obscured / 2.4.7 Focus Visible)
 * and, before this wave, we failed it outright: keyboard focus walked the whole
 * graph while the camera sat still, so tabbing past the edge of the viewport
 * left the focus ring on a node that was scrolled off-screen — announced, but
 * invisible. A sighted keyboard user simply lost the cursor.
 *
 * The fix, in order of escalation:
 *
 *   1. Already fully visible (with padding) → DO NOTHING. Not panning is the
 *      most important case: a stationary camera is what makes the diagram
 *      readable, and gratuitous re-centring on every focus step is nauseating.
 *   2. Off-screen but it FITS at the current zoom → pan the minimum distance
 *      that brings it inside the padded box. Minimum, not centring: the user
 *      keeps their mental map.
 *   3. Too big to fit at the current zoom → zoom OUT via `fitToBounds`, which
 *      is the existing camera maths. We do not fork it.
 *
 * Motion honours `prefers-reduced-motion`: an animated pan becomes an instant
 * jump. All camera writes go through {@link ViewportController} — this class
 * owns policy, not geometry.
 *
 * Wave 6 (a11y card 4).
 */

export type ContainmentAction = 'none' | 'pan' | 'zoom';

export interface FocusContainmentOptions {
  /** CSS-pixel margin kept between the focused element and the viewport edge. */
  padding?: number;
  /** Pan animation duration, ms. 0 (or reduced motion) → instant. */
  durationMs?: number;
  /** Override reduced-motion detection (tests). */
  reducedMotion?: () => boolean;
  /** Injected clock/frame source (tests). */
  now?: () => number;
  requestFrame?: (cb: (t: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export interface ContainmentResult {
  action: ContainmentAction;
  /** World-space delta applied (or to be applied, when animating). */
  dx: number;
  dy: number;
  /** Zoom applied, when `action === 'zoom'`. */
  zoom?: number;
}

export class FocusContainmentController {
  private readonly viewport: ViewportController;
  private readonly padding: number;
  private readonly durationMs: number;
  private readonly reducedMotion: () => boolean;
  private readonly now: () => number;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly caf: (handle: number) => void;

  private animation: number | null = null;

  constructor(viewport: ViewportController, options: FocusContainmentOptions = {}) {
    this.viewport = viewport;
    this.padding = options.padding ?? 48;
    this.durationMs = options.durationMs ?? 180;
    this.reducedMotion = options.reducedMotion ?? (() => prefersReducedMotion());
    this.now = options.now ?? (() => platformNow());
    this.raf = options.requestFrame ?? ((cb) => requestFrame(cb));
    this.caf = options.cancelFrame ?? ((h) => cancelFrame(h));
  }

  /**
   * Is `bounds` fully inside the padded visible box? The predicate the whole
   * card turns on — and the one a test can assert directly.
   */
  isFullyVisible(bounds: Rectangle, padding = this.padding): boolean {
    const inner = this.paddedViewBox(padding);
    if (inner.width <= 0 || inner.height <= 0) return false;
    return (
      bounds.x >= inner.x &&
      bounds.y >= inner.y &&
      bounds.x + bounds.width <= inner.x + inner.width &&
      bounds.y + bounds.height <= inner.y + inner.height
    );
  }

  /** The visible world box, deflated by `padding` CSS pixels on every side. */
  paddedViewBox(padding = this.padding): Rectangle {
    const box = this.viewport.getViewBox();
    const zoom = this.viewport.getZoom() || 1;
    // Padding is specified in SCREEN pixels; the box is WORLD units.
    const pad = padding / zoom;
    return {
      x: box.x + pad,
      y: box.y + pad,
      width: box.width - pad * 2,
      height: box.height - pad * 2,
    };
  }

  /**
   * Compute what would have to happen to bring `bounds` fully into view —
   * WITHOUT touching the camera. Pure: this is what the tests assert, and what
   * `ensureVisible` then applies.
   */
  plan(bounds: Rectangle, padding = this.padding): ContainmentResult {
    if (!isFiniteRect(bounds)) return { action: 'none', dx: 0, dy: 0 };

    const inner = this.paddedViewBox(padding);

    // A canvas smaller than its own padding has no usable interior — treat it as
    // "cannot contain" and fit, rather than dividing by a negative box.
    if (inner.width <= 0 || inner.height <= 0) {
      return { action: 'zoom', dx: 0, dy: 0, zoom: this.viewport.getZoom() };
    }

    // (3) Does not fit at this zoom → zoom out to fit.
    if (bounds.width > inner.width || bounds.height > inner.height) {
      return { action: 'zoom', dx: 0, dy: 0, zoom: this.viewport.getZoom() };
    }

    // (2) Minimum pan that brings it inside.
    let dx = 0;
    let dy = 0;

    if (bounds.x < inner.x) dx = bounds.x - inner.x;
    else if (bounds.x + bounds.width > inner.x + inner.width) {
      dx = bounds.x + bounds.width - (inner.x + inner.width);
    }

    if (bounds.y < inner.y) dy = bounds.y - inner.y;
    else if (bounds.y + bounds.height > inner.y + inner.height) {
      dy = bounds.y + bounds.height - (inner.y + inner.height);
    }

    // (1) Already visible.
    if (dx === 0 && dy === 0) return { action: 'none', dx: 0, dy: 0 };

    return { action: 'pan', dx, dy };
  }

  /**
   * Bring `bounds` fully into view. Returns what it did — `'none'` when the
   * element was already visible, which is the common case and costs nothing.
   */
  ensureVisible(bounds: Rectangle, padding = this.padding): ContainmentResult {
    const plan = this.plan(bounds, padding);

    this.stop();

    if (plan.action === 'none') return plan;

    if (plan.action === 'zoom') {
      // Reuse the camera's own fit maths — do not reimplement it here.
      const zoom = this.viewport.fitToBounds(bounds, padding);
      return { action: 'zoom', dx: 0, dy: 0, zoom };
    }

    if (this.durationMs <= 0 || this.reducedMotion()) {
      this.viewport.pan(plan.dx, plan.dy);
      return plan;
    }

    this.animatePan(plan.dx, plan.dy);
    return plan;
  }

  /** Smoothly translate the camera by a world delta. */
  private animatePan(dx: number, dy: number): void {
    const start = this.now();
    let applied = 0;

    const step = (): void => {
      const elapsed = this.now() - start;
      const t = Math.min(1, elapsed / this.durationMs);
      const eased = easeOutCubic(t);

      // Apply the DELTA since the last frame, so we never fight another pan
      // that lands mid-animation — the camera is authoritative, not our copy.
      const target = eased;
      const delta = target - applied;
      applied = target;
      this.viewport.pan(dx * delta, dy * delta);

      if (t < 1) {
        this.animation = this.raf(step);
      } else {
        this.animation = null;
      }
    };

    this.animation = this.raf(step);
  }

  /** True while a containment pan is animating. */
  isAnimating(): boolean {
    return this.animation !== null;
  }

  /** Cancel any in-flight pan. */
  stop(): void {
    if (this.animation !== null) {
      this.caf(this.animation);
      this.animation = null;
    }
  }

  dispose(): void {
    this.stop();
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function isFiniteRect(r: Rectangle): boolean {
  return (
    Number.isFinite(r.x) && Number.isFinite(r.y) &&
    Number.isFinite(r.width) && Number.isFinite(r.height)
  );
}

/** The world bounds of a routed link — its polyline, grown a little. */
export function boundsOfPoints(
  points: { x: number; y: number }[],
  pad = 8
): Rectangle | null {
  if (!points || points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}
