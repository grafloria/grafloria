// Wave 9 — Card 6: the comment PINS, in the canvas.
//
// A pure function from (threads, viewport) to a VNode layer. No DOM, no state, no
// side effects — so it renders identically in the live canvas, in `renderToStaticSVG`
// and in a PNG export, and a screen-reader user reading a server-rendered SVG gets the
// comments too.
//
// ===========================================================================
// WORLD COORDINATES, AND WHY THAT SENTENCE IS THE ENTIRE POSITIONING STORY
// ===========================================================================
// The root `<svg>` carries a viewBox — pan and zoom ARE the viewBox. So a child placed
// at world (640, 480) is on the diagram, not on the glass: it pans and zooms with the
// nodes because it is in the same coordinate space as the nodes, by construction, with
// no code. A pin drawn in screen coordinates would need to be re-derived on every pan
// frame, and would be wrong on the frames where somebody forgot.
//
// The pin's SIZE is the one thing that is not a world quantity. A pin drawn at a fixed
// world radius becomes a dot at zoom 0.1 and swallows the node at zoom 4. It is
// counter-scaled by `1/zoom` so it stays a constant number of SCREEN pixels — which is
// what a UI affordance is: a target for a finger, not a feature of the drawing.
//
// ===========================================================================
// ACCESSIBILITY IS NOT A LAYER ON TOP OF THIS. IT IS THE POINT.
// ===========================================================================
// A comment is TEXT WRITTEN BY A HUMAN FOR A HUMAN. It is exactly the content a screen
// reader user must be able to reach — and a pin that is a bare `<circle>` is a decoration
// that hides a conversation. So each pin:
//
//   • is a `role="button"` with a real accessible NAME that says what it is about, how
//     many replies it has, whether it is resolved, whether it is DETACHED, and how many
//     messages you have not read;
//   • carries `aria-expanded` so the AT can say "collapsed"/"expanded" as the panel opens;
//   • takes part in the diagram's ROVING TABINDEX — `tabindex=-1` unless it is the
//     focused element — because the canvas is ONE tab stop and a diagram with 40 comment
//     pins must not become a 40-stop tab trap;
//   • marks its own graphics `aria-hidden`, so the AT reads the name once instead of
//     announcing an unlabelled circle and a stray number.
//
// The pin is the POINTER to the conversation. The conversation itself is read in the
// panel (comment-panel.ts), which is real HTML with real headings and a real form —
// because reading a threaded discussion through SVG semantics would be a hostile joke.

import type { CommentThreadView } from '@grafloria/engine';
import type { VNode } from '../types';

export interface CommentPinsOptions {
  /** World rect currently on screen. Pins outside it are not built. */
  visibleRect?: { x: number; y: number; width: number; height: number };
  /** Current zoom, so the pin can be counter-scaled to a constant screen size. */
  zoom?: number;
  /** The thread whose panel is open — drawn selected, and `aria-expanded=true`. */
  selectedThreadId?: string | null;
  /** The comment the roving tabindex has focused, if any. */
  focusedThreadId?: string | null;
  /** Hide resolved threads (the default view — a resolved thread is answered). */
  showResolved?: boolean;
  /** Radius in SCREEN pixels. */
  radius?: number;
}

/** Screen-pixel radius of a pin. Big enough to be a touch target at any zoom. */
const DEFAULT_RADIUS = 11;

/**
 * The accessible name of a pin. This is the ONLY thing an AT user hears about a comment
 * before they decide whether to open it, so it has to answer the question they are
 * actually asking: what is this about, is it live, and is any of it new to me?
 */
export function commentPinAccessibleName(thread: CommentThreadView): string {
  const anchor = thread.resolvedAnchor;
  const live = thread.messages.filter((m) => !m.deleted);
  const replies = Math.max(0, live.length - 1);

  const about = !anchor.attached
    ? `a deleted ${anchor.targetKind === 'link' ? 'edge' : 'node'}, ${anchor.targetLabel}`
    : anchor.targetKind === 'region'
      ? 'a region of the canvas'
      : anchor.targetLabel;

  const bits = [`Comment thread on ${about}`];
  bits.push(replies === 1 ? '1 reply' : `${replies} replies`);
  if (thread.resolved) bits.push('resolved');
  // DETACHED IS SAID OUT LOUD, not encoded in a colour or a dash pattern. A sighted user
  // gets a broken ring; an AT user gets the word. WCAG 1.4.1 is not a styling rule.
  if (!anchor.attached) bits.push('detached');
  if (thread.unread > 0) bits.push(`${thread.unread} unread`);
  return bits.join(', ');
}

/** Is this thread's pin inside the visible world rect (pins are small; a small pad). */
function visible(
  t: CommentThreadView,
  rect: CommentPinsOptions['visibleRect'],
  pad: number
): boolean {
  if (!rect) return true;
  const { x, y } = t.resolvedAnchor.point;
  return (
    x >= rect.x - pad &&
    x <= rect.x + rect.width + pad &&
    y >= rect.y - pad &&
    y <= rect.y + rect.height + pad
  );
}

/**
 * Build the pin layer.
 *
 * Returns a `<g>` even when empty: a stable element keeps the patcher's keyed diff
 * simple, and an empty `<g>` costs nothing to reconcile.
 */
export function renderCommentPins(
  threads: readonly CommentThreadView[],
  options: CommentPinsOptions = {}
): VNode {
  const zoom = options.zoom && options.zoom > 0 ? options.zoom : 1;
  const r = options.radius ?? DEFAULT_RADIUS;
  const showResolved = options.showResolved ?? false;
  // Counter-scale: the pin is a UI affordance, so it lives in screen units.
  const scale = 1 / zoom;
  const pad = (r + 4) * scale;

  const children: VNode[] = [];
  for (const t of threads) {
    if (t.resolved && !showResolved) continue;
    if (!visible(t, options.visibleRect, pad)) continue;
    children.push(pin(t, r, scale, options));
  }

  return {
    type: 'g',
    key: 'comments-layer',
    props: {
      className: 'grafloria-comments-layer',
      // The LAYER is not a group in the a11y tree — the pins are. A wrapper role here
      // would just add a level of nesting an AT user has to walk past.
      'aria-hidden': children.length === 0 ? 'true' : undefined,
      'data-comment-count': String(children.length),
    },
    children,
  };
}

function pin(
  t: CommentThreadView,
  r: number,
  scale: number,
  options: CommentPinsOptions
): VNode {
  const { point, attached } = t.resolvedAnchor;
  const selected = options.selectedThreadId === t.id;
  const focused = options.focusedThreadId === t.id;
  const live = t.messages.filter((m) => !m.deleted);
  const count = live.length;

  const cls = [
    'grafloria-comment-pin',
    t.resolved ? 'grafloria-comment-pin--resolved' : '',
    attached ? '' : 'grafloria-comment-pin--detached',
    t.unread > 0 ? 'grafloria-comment-pin--unread' : '',
    selected ? 'grafloria-comment-pin--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body: VNode[] = [
    // The teardrop tail: points AT the thing. Drawn first so the disc covers its base.
    {
      type: 'path',
      key: 'tail',
      props: {
        d: `M 0 ${r * 1.55} L ${-r * 0.45} ${r * 0.55} L ${r * 0.45} ${r * 0.55} Z`,
        fill: 'currentColor',
        'aria-hidden': 'true',
      },
    },
    {
      type: 'circle',
      key: 'disc',
      props: {
        cx: 0,
        cy: 0,
        r,
        fill: 'currentColor',
        stroke: '#ffffff',
        'stroke-width': 1.5,
        'aria-hidden': 'true',
      },
    },
    {
      type: 'text',
      key: 'count',
      props: {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': r * 1.1,
        'font-family': 'system-ui, sans-serif',
        'font-weight': 600,
        fill: '#ffffff',
        // The name on the button already says "3 replies". Letting the AT also read the
        // bare glyph "3" would announce the same fact twice, badly.
        'aria-hidden': 'true',
        textContent: t.resolved ? '✓' : String(count),
      },
    },
  ];

  // NON-COLOUR ENCODING (WCAG 1.4.1). A detached thread gets a BROKEN RING, a resolved
  // one a CHECK — not merely a different fill. Colour alone would be invisible to ~8% of
  // men, and completely invisible in forced-colors mode.
  if (!attached) {
    body.push({
      type: 'circle',
      key: 'detached-ring',
      props: {
        cx: 0,
        cy: 0,
        r: r + 3.5,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.5,
        'stroke-dasharray': '2,3',
        'aria-hidden': 'true',
      },
    });
  }
  if (t.unread > 0) {
    body.push({
      type: 'circle',
      key: 'unread-dot',
      props: {
        cx: r * 0.78,
        cy: -r * 0.78,
        r: r * 0.36,
        fill: '#dc2626',
        stroke: '#ffffff',
        'stroke-width': 1,
        'aria-hidden': 'true',
      },
    });
  }

  return {
    type: 'g',
    key: `comment-${t.id}`,
    props: {
      // The pin is placed in WORLD space; only its own contents are counter-scaled, so
      // the anchor point stays exact at every zoom.
      transform: `translate(${point.x}, ${point.y}) scale(${scale})`,
      className: cls,
      role: 'button',
      'aria-label': commentPinAccessibleName(t),
      'aria-expanded': options.selectedThreadId === t.id ? 'true' : 'false',
      // ROVING TABINDEX: the canvas is ONE tab stop. Forty pins must not be forty of them.
      tabindex: focused ? '0' : '-1',
      ...(focused ? { 'data-focused': 'true' } : {}),
      'data-comment-thread-id': t.id,
      'data-comment-attached': attached ? 'true' : 'false',
      'data-comment-resolved': t.resolved ? 'true' : 'false',
      'data-comment-unread': String(t.unread),
      style: {
        // Colour is the SECONDARY cue everywhere; see the glyphs above.
        color: !attached ? '#b45309' : t.resolved ? '#15803d' : '#2563eb',
        cursor: 'pointer',
      },
    },
    children: body,
  };
}
