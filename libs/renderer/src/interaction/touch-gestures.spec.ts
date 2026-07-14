/**
 * TouchGestureController — Wave 9, Card 2.
 *
 * ## READ THIS BEFORE TRUSTING THIS FILE
 *
 * These are unit tests of the gesture STATE MACHINE (tap vs drag vs long-press,
 * pinch arithmetic, cleanup). They are NOT the proof that touch works, and they
 * must never be mistaken for it:
 *
 *   - jsdom implements **no PointerEvent at all**, so the events below are hand-made
 *     objects. A real browser would never deliver exactly these.
 *   - jsdom does not implement `touch-action`, so the single line the whole feature
 *     depends on — without which Chrome silently stops delivering `pointermove`
 *     mid-gesture — is INVISIBLE here. This suite would stay green on a canvas that
 *     no human being could pan.
 *
 * The real proof is `libs/renderer/e2e/touch-run.mjs`: 26 assertions driving REAL
 * touch through Chromium (`hasTouch`, CDP `Input.dispatchTouchEvent` for genuine
 * multi-touch), including a control that sets `touch-action: auto` and asserts the
 * canvas STOPS panning. This file exists for the fast loop; that one decides.
 */
import { TouchGestureController, TOUCH_HIT_SLOP_PX } from './touch-gestures';
import { ViewportController } from '../viewport/viewport-controller';

// --- a fake host -------------------------------------------------------------
function makeHost(overrides: Record<string, unknown> = {}) {
  const viewport = new ViewportController({
    viewport: { x: 0, y: 0, width: 1000, height: 800 },
    zoom: 1,
  });

  const emitted: Array<{ event: string; payload: unknown }> = [];
  const hitSlops: number[] = [];

  const interaction = {
    handleMouseMove: jest.fn(),
    handleConnectionDrag: jest.fn(),
    startConnection: jest.fn(),
    completeConnection: jest.fn(),
    cancelConnection: jest.fn(),
    invalidatePortHitCache: jest.fn(),
    getLinkAtPosition: jest.fn(() => null),
    selectLink: jest.fn(),
    getState: jest.fn(() => ({ hoveredPort: null, hoveredLink: null })),
    setHitSlop: jest.fn((s: number) => hitSlops.push(s)),
    getHitSlop: jest.fn(() => hitSlops[hitSlops.length - 1] ?? 0),
  };

  const diagram = {
    getNodeAtPosition: jest.fn(() => null),
    getSelectedNodes: jest.fn(() => []),
    getNode: jest.fn(() => undefined),
    getLinks: jest.fn(() => []),
    selectNode: jest.fn(),
    clearSelection: jest.fn(),
  };

  const engine = { getDiagram: () => diagram };

  const host = {
    getEngine: () => engine as never,
    viewport,
    interaction: interaction as never,
    getRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    requestRender: jest.fn(),
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    isReadonly: () => false,
    ...overrides,
  };

  return { host, viewport, interaction, diagram, emitted, hitSlops };
}

/** jsdom has no PointerEvent; a structural stand-in is all the controller reads. */
const pointer = (id: number, x: number, y: number) =>
  ({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch' }) as unknown as PointerEvent;

describe('TouchGestureController', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  describe('one finger', () => {
    it('drag on empty canvas pans the camera', () => {
      const { host, viewport } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      t.onPointerMove(pointer(1, 400, 330));
      t.onPointerUp(pointer(1, 400, 330));

      // Dragged left/up ⇒ camera moves right/down.
      expect(viewport.getViewport()).toMatchObject({ x: 100, y: 70 });
    });

    it('a short, still press is a TAP and clears the selection on empty canvas', () => {
      const { host, diagram, emitted } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      t.onPointerUp(pointer(1, 500, 400));

      expect(diagram.clearSelection).toHaveBeenCalled();
      expect(emitted.some((e) => e.event === 'selection:change')).toBe(true);
    });

    it('a press that MOVES past tolerance is a drag, not a tap', () => {
      const { host, diagram } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      t.onPointerMove(pointer(1, 560, 400)); // 60px — well past the 10px tolerance
      t.onPointerUp(pointer(1, 560, 400));

      expect(diagram.clearSelection).not.toHaveBeenCalled();
    });
  });

  describe('long press', () => {
    it('fires contextmenu after 500ms of a stationary finger', () => {
      const { host, emitted } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      expect(emitted.some((e) => e.event === 'contextmenu')).toBe(false);

      jest.advanceTimersByTime(500);

      const menu = emitted.find((e) => e.event === 'contextmenu');
      expect(menu).toBeDefined();
      expect((menu!.payload as { source: string }).source).toBe('touch');
    });

    it('a finger that moves CANCELS the pending long-press', () => {
      const { host, emitted } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      t.onPointerMove(pointer(1, 540, 400)); // 40px — cancels
      jest.advanceTimersByTime(1000);

      expect(emitted.some((e) => e.event === 'contextmenu')).toBe(false);
    });

    it('a SECOND finger cancels the long-press (a pinch is not a menu)', () => {
      const { host, emitted } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      t.onPointerDown(pointer(2, 600, 400));
      jest.advanceTimersByTime(1000);

      expect(emitted.some((e) => e.event === 'contextmenu')).toBe(false);
      expect(t.isPinching).toBe(true);
    });
  });

  describe('two fingers', () => {
    it('pinching apart zooms IN, by the ratio of the finger gap to its start', () => {
      const { host, viewport } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 400, 400));
      t.onPointerDown(pointer(2, 600, 400)); // gap 200, zoom 1
      t.onPointerMove(pointer(2, 800, 400)); // gap 400 ⇒ 2x

      expect(viewport.getZoom()).toBeCloseTo(2, 5);
    });

    it('zoom is RATIO-TO-START, so a slow pinch does not drift', () => {
      // The incremental formulation (zoom *= gap/lastGap) accumulates float error
      // across many small moves. Ratio-to-start lands on the same zoom for the same
      // finger spread no matter how many events it took to get there — which is what
      // makes a pinch feel like it is holding the canvas.
      const { host, viewport } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 400, 400));
      t.onPointerDown(pointer(2, 600, 400)); // gap 200

      for (let g = 205; g <= 400; g += 5) {
        t.onPointerMove(pointer(2, 400 + g, 400)); // creep out to gap 400
      }

      expect(viewport.getZoom()).toBeCloseTo(2, 5); // exactly 2x, not 1.97 or 2.04
    });

    it('lifting ONE finger out of a pinch does not become a one-finger pan', () => {
      // The remaining finger has been stationary for the whole pinch; resuming a pan
      // from it would jump the canvas by the accumulated distance.
      const { host, viewport } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 400, 400));
      t.onPointerDown(pointer(2, 600, 400));
      t.onPointerMove(pointer(2, 800, 400));

      const afterPinch = viewport.getViewport();

      t.onPointerUp(pointer(2, 800, 400)); // one finger lifts
      t.onPointerMove(pointer(1, 200, 200)); // the other now moves a long way

      expect(viewport.getViewport()).toEqual(afterPinch); // inert
    });
  });

  describe('touch hit slop', () => {
    it('is applied on touch down and cleared when the last finger lifts', () => {
      const { host, interaction } = makeHost();
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      expect(interaction.setHitSlop).toHaveBeenLastCalledWith(TOUCH_HIT_SLOP_PX);

      t.onPointerUp(pointer(1, 500, 400));
      expect(interaction.setHitSlop).toHaveBeenLastCalledWith(0);
    });

    it('is scaled into WORLD units — zoomed out, a fingertip must cover MORE world', () => {
      const { host, viewport, interaction } = makeHost();
      viewport.setZoom(0.5);
      const t = new TouchGestureController(host);

      t.onPointerDown(pointer(1, 500, 400));
      // 16 CSS px at 0.5x = 32 world units. A screen-space slop would shrink to
      // nothing exactly when zoomed out — when targets are smallest and you need it.
      expect(interaction.setHitSlop).toHaveBeenLastCalledWith(TOUCH_HIT_SLOP_PX / 0.5);
    });
  });

  describe('read-only', () => {
    it('refuses a node drag but still pans', () => {
      const { host, viewport, diagram } = makeHost({ isReadonly: () => true });
      const node = {
        id: 'n1',
        isDraggable: () => true,
        position: { x: 0, y: 0 },
        state: { locked: false },
        setPosition: jest.fn(),
      };
      diagram.getNodeAtPosition = jest.fn(() => node) as never;

      const t = new TouchGestureController(host);
      t.onPointerDown(pointer(1, 500, 400));
      t.onPointerMove(pointer(1, 400, 330));

      expect(node.setPosition).not.toHaveBeenCalled(); // the node did not move
      expect(viewport.getViewport()).toMatchObject({ x: 100, y: 70 }); // but we panned
    });

    it('refuses drag-to-connect from a port', () => {
      const { host, interaction } = makeHost({ isReadonly: () => true });
      interaction.getState = jest.fn(() => ({ hoveredPort: { id: 'p1' }, hoveredLink: null })) as never;

      const t = new TouchGestureController(host);
      t.onPointerDown(pointer(1, 500, 400));

      expect(interaction.startConnection).not.toHaveBeenCalled();
    });
  });

  it('pointercancel (an OS interruption) aborts cleanly and leaves no state', () => {
    const { host, interaction } = makeHost();
    interaction.getState = jest.fn(() => ({ hoveredPort: { id: 'p1' }, hoveredLink: null })) as never;

    const t = new TouchGestureController(host);
    t.onPointerDown(pointer(1, 500, 400));
    expect(interaction.startConnection).toHaveBeenCalled();

    t.onPointerCancel(pointer(1, 500, 400));

    expect(interaction.cancelConnection).toHaveBeenCalled();
    expect(t.activePointerCount).toBe(0);
    expect(interaction.setHitSlop).toHaveBeenLastCalledWith(0);
  });
});
