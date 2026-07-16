/**
 * ============================================================================
 * Portals must not clobber HOST-owned chrome. (Regression lock.)
 * ============================================================================
 *
 * `Portal.element` is documented as "the element you render into" — hosts set
 * their own classes and inline styles on it (the node-toolbar demo styles its
 * bar via a `.nt-toolbar` stylesheet rule). The original `apply()` rebuilt
 * `className` and the whole `style` attribute on EVERY `setPosition()`/
 * `update()`, so the first real reposition silently wiped the host's class —
 * the toolbar lost its `transform: translate(-50%,-120%)` and flex layout and
 * "wasn't anchored" (live report, 2026-07: constant half-bar-width gap during
 * drags, because the follow glue worked but the styling class was gone).
 *
 * The contract these tests pin: the portal owns ONLY the classes and style
 * properties IT wrote last time; everything the host adds survives every
 * reposition. (The e2e proof — a real pointer drag with the toolbar riding the
 * node — is demos/nodes/node-toolbar.html assert 3b.)
 */

import { createPortal, createViewportPortal, createCounterScaledPortal } from './portal';
import { ViewportController } from '../viewport/viewport-controller';

describe('createViewportPortal — host chrome survives setPosition', () => {
  let layer: HTMLElement;

  beforeEach(() => {
    layer = document.createElement('div');
    document.body.appendChild(layer);
  });
  afterEach(() => layer.remove());

  it('keeps a host-set class across setPosition (the node-toolbar bug)', () => {
    const portal = createViewportPortal(layer, { x: 100, y: 50 });
    portal.element.classList.add('nt-toolbar');

    portal.setPosition(320, 180);

    expect(portal.element.classList.contains('nt-toolbar')).toBe(true);
    expect(portal.element.classList.contains('grafloria-world-portal')).toBe(true);
    expect(portal.element.style.left).toBe('320px');
    expect(portal.element.style.top).toBe('180px');
  });

  it('keeps host-set inline style properties across setPosition', () => {
    const portal = createViewportPortal(layer, { x: 0, y: 0 });
    portal.element.style.background = 'rgb(17, 24, 39)';
    portal.element.style.transform = 'translate(-50%, -120%)';

    portal.setPosition(10, 20);

    expect(portal.element.style.background).toBe('rgb(17, 24, 39)');
    expect(portal.element.style.transform).toBe('translate(-50%, -120%)');
    expect(portal.element.style.left).toBe('10px');
  });

  it('still applies its own options.className and options.style on every apply', () => {
    const portal = createViewportPortal(layer, {
      x: 5,
      y: 5,
      className: 'note sticky',
      style: 'padding:4px',
    });
    portal.setPosition(6, 6);

    expect(portal.element.classList.contains('note')).toBe(true);
    expect(portal.element.classList.contains('sticky')).toBe(true);
    expect(portal.element.style.padding).toBe('4px');
  });
});

describe('createPortal — host chrome survives update()', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => root.remove());

  it('keeps a host-set class and style property across update()', () => {
    const portal = createPortal(root, { placement: 'top-right' });
    portal.element.classList.add('my-panel');
    portal.element.style.background = 'red';

    portal.update({ placement: 'bottom-left', offset: 20 });

    expect(portal.element.classList.contains('my-panel')).toBe(true);
    expect(portal.element.style.background).toBe('red');
    expect(portal.element.classList.contains('grafloria-portal')).toBe(true);
  });

  it('a placement switch clears the OLD placement edges (portal-owned props are replaced, not leaked)', () => {
    const portal = createPortal(root, { placement: 'top-left', offset: 12 });
    expect(portal.element.style.top).toBe('12px');
    expect(portal.element.style.left).toBe('12px');

    portal.update({ placement: 'bottom-right', offset: 8 });

    expect(portal.element.style.bottom).toBe('8px');
    expect(portal.element.style.right).toBe('8px');
    // the previous corner's props must be GONE, or the panel pins to two corners
    expect(portal.element.style.top).toBe('');
    expect(portal.element.style.left).toBe('');
  });

  it('replacing options.className swaps the portal-owned class without touching host classes', () => {
    const portal = createPortal(root, { className: 'skin-a' });
    portal.element.classList.add('host-owned');

    portal.update({ className: 'skin-b' });

    expect(portal.element.classList.contains('skin-b')).toBe(true);
    expect(portal.element.classList.contains('skin-a')).toBe(false);
    expect(portal.element.classList.contains('host-owned')).toBe(true);
  });
});

describe('createCounterScaledPortal — counter-scale transform survives repositioning', () => {
  it('keeps the 1/zoom transform after setPosition', () => {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const viewport = new ViewportController();
    viewport.setZoom(2);

    const portal = createCounterScaledPortal(layer, viewport, { x: 0, y: 0 });
    portal.setPosition(40, 40);

    expect(portal.element.style.transform).toBe('scale(0.5)');
    expect(portal.element.style.left).toBe('40px');

    portal.dispose();
    layer.remove();
  });
});
