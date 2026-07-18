/**
 * Wheel-over-scrollable-card delegation — makes scrollbars inside HTML nodes
 * (foreignObject cards: ER tables, class boxes, custom cards) usable, and
 * keeps a card's wheel from ever panning the canvas out from under the cursor.
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
 * So the binder finds the scrollable content under the cursor itself and
 * scrolls it programmatically. The rule is CONTAINMENT (overscroll-behavior:
 * contain), not scroll-chaining:
 *
 *  - ctrl/⌘ wheel (pinch-zoom) ALWAYS belongs to the canvas;
 *  - a plain wheel over a card that is scrollable in the wheel's axis belongs
 *    to THAT card — it scrolls as far as it can and, AT THE END OF ITS RANGE,
 *    the wheel is CONSUMED, not handed to the canvas. Reaching the bottom of a
 *    table must never suddenly pan the whole diagram (the reported bug). To
 *    pan, the cursor leaves the card;
 *  - a plain wheel that is NOT over such a card falls through to the canvas.
 */

const SCROLLABLE_OVERFLOW = /(auto|scroll)/;

/** Does `el` overflow in an axis this wheel drives (so the card owns the wheel)? */
function ownsWheel(el: HTMLElement, event: WheelEvent): boolean {
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!style) return false;
  const scrollableY = SCROLLABLE_OVERFLOW.test(style.overflowY) && el.scrollHeight > el.clientHeight;
  const scrollableX = SCROLLABLE_OVERFLOW.test(style.overflowX) && el.scrollWidth > el.clientWidth;
  return (event.deltaY !== 0 && scrollableY) || (event.deltaX !== 0 && scrollableX);
}

/** Scroll `el` by the event's deltas, clamped to its range. */
function applyScroll(el: HTMLElement, event: WheelEvent): void {
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!style) return;
  if (event.deltaY !== 0 && SCROLLABLE_OVERFLOW.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
    el.scrollTop = Math.max(0, Math.min(el.scrollTop + event.deltaY, el.scrollHeight - el.clientHeight));
  }
  if (event.deltaX !== 0 && SCROLLABLE_OVERFLOW.test(style.overflowX) && el.scrollWidth > el.clientWidth) {
    el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + event.deltaX, el.scrollWidth - el.clientWidth));
  }
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
 * If this wheel is over scrollable card content, scroll that content and
 * report the wheel HANDLED — the caller preventDefault()s and skips panning.
 * Handled is returned whenever the cursor is over such a card, INCLUDING at
 * the end of its scroll range (containment: the card, not the canvas, absorbs
 * the wheel). Returns false only for pinch-zoom or when no scrollable card is
 * under the cursor, so the canvas pans normally.
 */
export function delegateWheelToScrollable(event: WheelEvent): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;

  // Path 1 — the target IS HTML (overlay-layer nodes, or cards that enable
  // pointer events): the innermost element that owns the wheel absorbs it.
  let el: Element | null = target;
  while (el && el instanceof HTMLElement) {
    if (ownsWheel(el, event)) {
      applyScroll(el, event);
      return true;
    }
    el = el.parentElement;
  }

  // Path 2 — the target is SVG (the usual case: card content is
  // pointer-events:none, the foreignObject or node shape took the hit).
  // Find the deepest card element under the cursor that owns the wheel.
  const scope = scrollScope(target);
  if (!scope) return false;
  const { clientX, clientY } = event;
  const candidates: HTMLElement[] = [];
  for (const cand of Array.from(scope.querySelectorAll('*'))) {
    if (!(cand instanceof HTMLElement) || !ownsWheel(cand, event)) continue;
    const rect = cand.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
    candidates.push(cand);
  }
  // Document order lists ancestors before descendants — the deepest owner wins.
  const owner = candidates[candidates.length - 1];
  if (!owner) return false;
  applyScroll(owner, event);
  return true;
}
