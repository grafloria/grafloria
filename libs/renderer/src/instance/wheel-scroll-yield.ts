/**
 * Wheel-over-scrollable-card delegation — makes scrollbars inside HTML nodes
 * (foreignObject cards: ER tables, class boxes, custom cards) actually usable.
 *
 * Two facts, both found empirically, force this to be a DELEGATION and not a
 * mere yield:
 *
 *  1. The binder's plain-wheel PAN branch preventDefault()s every wheel, so
 *     native scroll never runs and the canvas pans under the cursor.
 *  2. Card content inside a foreignObject is `pointer-events: none` (so
 *     clicks and drags fall through to the node) — the wheel's target is the
 *     foreignObject or another SVG element, NEVER the scrollable div. Even if
 *     the canvas yielded, the browser would have nothing to scroll: a
 *     pointer-events:none element can't be an event target, and native scroll
 *     chains only walk UP from the target.
 *
 * So the binder must find the scrollable content under the cursor itself and
 * scroll it programmatically. The rule, matching every design tool with
 * scrollable cards:
 *
 *  - ctrl/⌘ wheel (pinch-zoom) ALWAYS belongs to the canvas;
 *  - a plain wheel over scrollable card content that can still move in the
 *    wheel's direction scrolls THAT content (deepest such element first) —
 *    the caller preventDefault()s and does not pan;
 *  - at the end of the scroll range nothing moves, delegation reports
 *    unhandled, and the canvas takes over again (the familiar "scroll the
 *    list, then the page continues" behaviour).
 */

const SCROLLABLE_OVERFLOW = /(auto|scroll)/;

/** Scroll `el` by the event's deltas, clamped. True if anything moved. */
function applyScroll(el: HTMLElement, event: WheelEvent): boolean {
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!style) return false;
  let moved = false;
  if (event.deltaY !== 0 && SCROLLABLE_OVERFLOW.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
    const before = el.scrollTop;
    const next = Math.max(0, Math.min(before + event.deltaY, el.scrollHeight - el.clientHeight));
    if (next !== before) {
      el.scrollTop = next;
      moved = true;
    }
  }
  if (event.deltaX !== 0 && SCROLLABLE_OVERFLOW.test(style.overflowX) && el.scrollWidth > el.clientWidth) {
    const before = el.scrollLeft;
    const next = Math.max(0, Math.min(before + event.deltaX, el.scrollWidth - el.clientWidth));
    if (next !== before) {
      el.scrollLeft = next;
      moved = true;
    }
  }
  return moved;
}

/** Nearest ancestor (self included) that is a foreignObject or a node group. */
function scrollScope(target: Element): Element | null {
  let el: Element | null = target;
  while (el) {
    const name = el.localName.toLowerCase();
    if (name === 'foreignobject') return el;
    if (el.hasAttribute?.('data-node-id') || el.classList?.contains('node-group')) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Try to hand this wheel event to scrollable HTML content under the cursor.
 * Returns true when content was actually scrolled — the caller must then
 * preventDefault() and skip panning. Returns false when the canvas should
 * handle the wheel (pinch-zoom, no scrollable content, or scroll range end).
 */
export function delegateWheelToScrollable(event: WheelEvent): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;

  // Path 1 — the target IS HTML (overlay-layer nodes, or cards that enable
  // pointer events): walk up through the HTML, innermost scrollable first.
  let el: Element | null = target;
  while (el && el instanceof HTMLElement) {
    if (applyScroll(el, event)) return true;
    el = el.parentElement;
  }

  // Path 2 — the target is SVG (the usual case: card content is
  // pointer-events:none, the foreignObject or node shape took the hit).
  // Search the containing foreignObject / node group for scrollable HTML
  // under the cursor, deepest first.
  const scope = scrollScope(target);
  if (!scope) return false;
  const { clientX, clientY } = event;
  const candidates: HTMLElement[] = [];
  for (const cand of Array.from(scope.querySelectorAll('*'))) {
    if (!(cand instanceof HTMLElement)) continue;
    if (cand.scrollHeight <= cand.clientHeight && cand.scrollWidth <= cand.clientWidth) continue;
    const rect = cand.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
    candidates.push(cand);
  }
  // querySelectorAll is document order: ancestors before descendants — walk
  // backwards so the deepest scrollable under the cursor gets the wheel.
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (applyScroll(candidates[i], event)) return true;
  }
  return false;
}
