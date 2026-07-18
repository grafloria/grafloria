/**
 * Wheel-over-scrollable-card delegation — the rule that makes scrollbars
 * inside HTML nodes (foreignObject cards: ER tables, class boxes, custom
 * cards) actually usable.
 *
 * Found empirically, in two layers:
 *  - the binder's plain-wheel PAN branch preventDefault()s every wheel, so
 *    native scroll never runs and the canvas pans instead;
 *  - card content is `pointer-events: none` (drag-through), so the wheel's
 *    target is the foreignObject / an SVG element — native scroll could never
 *    reach the card body even if the canvas yielded. The binder must scroll
 *    the content programmatically.
 */
import { delegateWheelToScrollable } from './wheel-scroll-yield';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A div with laid-out scroll metrics and a client rect (jsdom computes neither). */
function scrollable(
  overflowY: string,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number },
  rect: { left: number; top: number; width: number; height: number } = { left: 0, top: 0, width: 200, height: 200 }
): HTMLDivElement {
  const el = document.createElement('div');
  el.style.overflowY = overflowY;
  Object.defineProperty(el, 'scrollHeight', { value: metrics.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true });
  el.getBoundingClientRect = () =>
    ({ left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height,
       x: rect.left, y: rect.top, width: rect.width, height: rect.height, toJSON: () => ({}) } as DOMRect);
  el.scrollTop = metrics.scrollTop ?? 0;
  return el;
}

const wheel = (target: Element, deltaY: number, init: WheelEventInit = {}) => {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, clientX: 100, clientY: 100, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

/** foreignObject > .card > body — the kit-card DOM, with pointer-events:none content. */
function cardInForeignObject(body: HTMLDivElement): SVGForeignObjectElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('data-node-id', 'n1');
  group.classList.add('node-group');
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  const card = document.createElement('div');
  card.appendChild(body);
  fo.appendChild(card);
  group.appendChild(fo);
  svg.appendChild(group);
  document.body.appendChild(svg);
  return fo as SVGForeignObjectElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('delegateWheelToScrollable', () => {
  it('scrolls an HTML target with room and reports handled', () => {
    const box = scrollable('auto', { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    document.body.appendChild(box);
    const inner = document.createElement('span');
    box.appendChild(inner);
    expect(delegateWheelToScrollable(wheel(inner, 120))).toBe(true);
    expect(box.scrollTop).toBe(120);
  });

  it('absorbs an upward wheel even at the top (containment), and clamps at 0', () => {
    const box = scrollable('auto', { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    document.body.appendChild(box);
    // At the top, wheeling up is still the card's — it must not pan the canvas up.
    expect(delegateWheelToScrollable(wheel(box, -120))).toBe(true);
    expect(box.scrollTop).toBe(0);
    box.scrollTop = 50;
    expect(delegateWheelToScrollable(wheel(box, -120))).toBe(true);
    expect(box.scrollTop).toBe(0);
  });

  it('CONTAINS the wheel at the end of the range — the canvas must NOT pan', () => {
    // The reported bug: reaching the bottom of a card suddenly panned the whole
    // diagram. Containment: while the cursor is over a scrollable card, the card
    // absorbs the wheel even at its end (handled=true → caller does not pan).
    const box = scrollable('auto', { scrollHeight: 500, clientHeight: 200, scrollTop: 300 });
    document.body.appendChild(box);
    expect(delegateWheelToScrollable(wheel(box, 120))).toBe(true); // at bottom — still absorbed
    expect(box.scrollTop).toBe(300); // clamped, but the wheel is consumed
  });

  it('clamps a large delta to the range end and still reports handled', () => {
    const box = scrollable('auto', { scrollHeight: 500, clientHeight: 200, scrollTop: 100 });
    document.body.appendChild(box);
    expect(delegateWheelToScrollable(wheel(box, 6000))).toBe(true);
    expect(box.scrollTop).toBe(300);
  });

  it('never handles overflow hidden/visible or non-overflowing content', () => {
    const hidden = scrollable('hidden', { scrollHeight: 500, clientHeight: 200 });
    document.body.appendChild(hidden);
    expect(delegateWheelToScrollable(wheel(hidden, 120))).toBe(false);
    const fits = scrollable('auto', { scrollHeight: 180, clientHeight: 200 });
    document.body.appendChild(fits);
    expect(delegateWheelToScrollable(wheel(fits, 120))).toBe(false);
  });

  it('never handles ctrl/⌘ wheel — pinch-zoom always belongs to the canvas', () => {
    const box = scrollable('auto', { scrollHeight: 500, clientHeight: 200 });
    document.body.appendChild(box);
    expect(delegateWheelToScrollable(wheel(box, 120, { ctrlKey: true }))).toBe(false);
    expect(delegateWheelToScrollable(wheel(box, 120, { metaKey: true }))).toBe(false);
    expect(box.scrollTop).toBe(0);
  });

  it('SVG target (pointer-events:none card): scrolls the body under the cursor via the foreignObject', () => {
    const body = scrollable('auto', { scrollHeight: 500, clientHeight: 160, scrollTop: 0 }, { left: 40, top: 40, width: 200, height: 160 });
    body.className = 'axk-entity-body';
    const fo = cardInForeignObject(body);
    expect(delegateWheelToScrollable(wheel(fo, 120))).toBe(true);
    expect(body.scrollTop).toBe(120);
  });

  it('SVG target: a wheel OUTSIDE the body rect is not delegated', () => {
    const body = scrollable('auto', { scrollHeight: 500, clientHeight: 160 }, { left: 400, top: 400, width: 200, height: 160 });
    const fo = cardInForeignObject(body);
    expect(delegateWheelToScrollable(wheel(fo, 120))).toBe(false); // cursor at 100,100 — off the card body
    expect(body.scrollTop).toBe(0);
  });

  it('SVG target resolves through the node group when the hit is a sibling shape', () => {
    const body = scrollable('auto', { scrollHeight: 500, clientHeight: 160, scrollTop: 0 }, { left: 40, top: 40, width: 200, height: 160 });
    const fo = cardInForeignObject(body);
    const group = fo.parentElement as Element;
    const rect = document.createElementNS(SVG_NS, 'rect');
    group.appendChild(rect);
    expect(delegateWheelToScrollable(wheel(rect, 120))).toBe(true);
    expect(body.scrollTop).toBe(120);
  });

  it('deepest scrollable under the cursor owns the wheel and CONTAINS it (no chaining to outer)', () => {
    const outer = scrollable('auto', { scrollHeight: 800, clientHeight: 300, scrollTop: 0 }, { left: 0, top: 0, width: 300, height: 300 });
    const inner = scrollable('auto', { scrollHeight: 400, clientHeight: 100, scrollTop: 95 }, { left: 50, top: 50, width: 200, height: 100 });
    outer.appendChild(inner);
    const fo = cardInForeignObject(outer as HTMLDivElement);
    expect(delegateWheelToScrollable(wheel(fo, 120))).toBe(true);
    expect(inner.scrollTop).toBe(215); // inner scrolled, outer untouched
    expect(outer.scrollTop).toBe(0);
    inner.scrollTop = 300; // inner exhausted (400-100)
    expect(delegateWheelToScrollable(wheel(fo, 120))).toBe(true); // still absorbed by inner
    expect(inner.scrollTop).toBe(300); // inner clamped
    expect(outer.scrollTop).toBe(0);  // containment: the wheel does NOT chain to the outer
  });
});
