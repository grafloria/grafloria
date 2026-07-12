/**
 * @jest-environment jsdom
 */
import {
  PointerInputController,
  PointerInputControllerOptions,
  PointerInputEvent,
  ScreenToWorldFn,
} from './pointer-input';

/**
 * Build + dispatch a pointer-ish event on `el`.
 *
 * jsdom does not ship a reliable `PointerEvent` constructor, so we base the
 * event on `MouseEvent` (which supports clientX/clientY/button/buttons/modifier
 * init) and augment it with the pointer-only fields the controller reads. The
 * controller only ever *reads* these properties, so this faithfully exercises
 * the real addEventListener wiring + dispatch path.
 */
function dispatchPointer(
  el: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: {
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    pointerType?: string;
    pressure?: number;
    button?: number;
    buttons?: number;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  } = {},
): void {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
    buttons: init.buttons ?? 0,
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    metaKey: init.metaKey ?? false,
  }) as MouseEvent & {
    pointerId: number;
    pointerType: string;
    pressure: number;
  };
  ev.pointerId = init.pointerId ?? 1;
  ev.pointerType = init.pointerType ?? 'mouse';
  ev.pressure = init.pressure ?? 0;
  el.dispatchEvent(ev);
}

describe('PointerInputController', () => {
  let el: HTMLElement;
  let events: PointerInputEvent[];
  let screenToWorld: jest.Mock<{ worldX: number; worldY: number }, [number, number]>;
  let options: PointerInputControllerOptions;
  let controller: PointerInputController;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);

    // jsdom elements lack pointer-capture methods — provide spy-able stubs.
    (el as unknown as { setPointerCapture: jest.Mock }).setPointerCapture = jest.fn();
    (el as unknown as { releasePointerCapture: jest.Mock }).releasePointerCapture = jest.fn();

    events = [];
    // Identity-ish transform so world != screen and we can prove the injection.
    screenToWorld = jest.fn((x: number, y: number) => ({ worldX: x + 1000, worldY: y + 2000 }));
    options = {
      screenToWorld: screenToWorld as unknown as ScreenToWorldFn,
      onEvent: (e) => events.push(e),
      dragThreshold: 4,
    };
    controller = new PointerInputController(el, options);
  });

  afterEach(() => {
    controller.dispose();
    document.body.removeChild(el);
  });

  describe('canonicalization', () => {
    it('maps a pointerdown into a fully canonical event', () => {
      dispatchPointer(el, 'pointerdown', {
        clientX: 30,
        clientY: 40,
        pointerId: 7,
        pointerType: 'pen',
        pressure: 0.5,
        button: 0,
        buttons: 1,
        shiftKey: true,
        metaKey: true,
      });

      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.type).toBe('down');
      expect(e.screenX).toBe(30);
      expect(e.screenY).toBe(40);
      expect(e.worldX).toBe(1030); // via injected transform (30 + 1000)
      expect(e.worldY).toBe(2040); // (40 + 2000)
      expect(e.pointerId).toBe(7);
      expect(e.pointerType).toBe('pen');
      expect(e.pressure).toBe(0.5);
      expect(e.button).toBe(0);
      expect(e.buttons).toBe(1);
      expect(e.modifiers).toEqual({ shift: true, ctrl: false, alt: false, meta: true });
      expect(e.isDrag).toBe(false);
      expect(e.target).toBe(el);
      expect(e.originalEvent).toBeInstanceOf(MouseEvent);
    });

    it('calls the injected transform with element-local screen coords (rect offset applied)', () => {
      // Host offset 100/200 — screen coords must subtract the rect origin.
      jest.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 200,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 100,
        y: 200,
        toJSON: () => ({}),
      } as DOMRect);

      dispatchPointer(el, 'pointerdown', { clientX: 130, clientY: 250, pointerId: 1 });

      expect(screenToWorld).toHaveBeenCalledWith(30, 50);
      expect(events[0].screenX).toBe(30);
      expect(events[0].screenY).toBe(50);
    });

    it('normalizes pointerType: pen/touch kept, unknown/empty → mouse', () => {
      dispatchPointer(el, 'pointerdown', { pointerId: 1, pointerType: 'touch' });
      dispatchPointer(el, 'pointerup', { pointerId: 1, pointerType: 'touch' });
      dispatchPointer(el, 'pointerdown', { pointerId: 2, pointerType: '' });
      dispatchPointer(el, 'pointerup', { pointerId: 2, pointerType: '' });
      dispatchPointer(el, 'pointerdown', { pointerId: 3, pointerType: 'weird-device' });

      const types = events.filter((e) => e.type === 'down').map((e) => e.pointerType);
      expect(types).toEqual(['touch', 'mouse', 'mouse']);
    });

    it('reports button -1 on a hover move with no buttons pressed', () => {
      dispatchPointer(el, 'pointermove', { clientX: 5, clientY: 5, button: -1, buttons: 0 });
      expect(events[0].type).toBe('move');
      expect(events[0].button).toBe(-1);
      expect(events[0].buttons).toBe(0);
    });
  });

  describe('pointer capture', () => {
    it('captures on down and releases on up', () => {
      const setCap = (el as unknown as { setPointerCapture: jest.Mock }).setPointerCapture;
      const relCap = (el as unknown as { releasePointerCapture: jest.Mock }).releasePointerCapture;

      dispatchPointer(el, 'pointerdown', { pointerId: 9 });
      expect(setCap).toHaveBeenCalledWith(9);
      expect(relCap).not.toHaveBeenCalled();

      dispatchPointer(el, 'pointerup', { pointerId: 9 });
      expect(relCap).toHaveBeenCalledWith(9);
    });

    it('releases capture on cancel', () => {
      const relCap = (el as unknown as { releasePointerCapture: jest.Mock }).releasePointerCapture;
      dispatchPointer(el, 'pointerdown', { pointerId: 3 });
      dispatchPointer(el, 'pointercancel', { pointerId: 3 });
      expect(relCap).toHaveBeenCalledWith(3);
    });

    it('does not throw when capture APIs are absent (guarded)', () => {
      delete (el as unknown as { setPointerCapture?: unknown }).setPointerCapture;
      delete (el as unknown as { releasePointerCapture?: unknown }).releasePointerCapture;
      expect(() => {
        dispatchPointer(el, 'pointerdown', { pointerId: 1 });
        dispatchPointer(el, 'pointerup', { pointerId: 1 });
      }).not.toThrow();
      expect(events.map((e) => e.type)).toEqual(['down', 'up']);
    });
  });

  describe('drag vs click threshold', () => {
    it('stays a click when movement is within the threshold', () => {
      dispatchPointer(el, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1, buttons: 1 });
      dispatchPointer(el, 'pointermove', { clientX: 2, clientY: 2, pointerId: 1, buttons: 1 }); // dist ~2.8 < 4
      dispatchPointer(el, 'pointerup', { clientX: 2, clientY: 2, pointerId: 1 });

      expect(events.map((e) => e.isDrag)).toEqual([false, false, false]);
      expect(controller.isDragging(1)).toBe(false);
    });

    it('becomes a drag once movement exceeds the threshold and stays so through up', () => {
      dispatchPointer(el, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1, buttons: 1 });
      dispatchPointer(el, 'pointermove', { clientX: 3, clientY: 0, pointerId: 1, buttons: 1 }); // 3 < 4
      dispatchPointer(el, 'pointermove', { clientX: 10, clientY: 0, pointerId: 1, buttons: 1 }); // 10 > 4
      dispatchPointer(el, 'pointermove', { clientX: 11, clientY: 0, pointerId: 1, buttons: 1 });
      dispatchPointer(el, 'pointerup', { clientX: 11, clientY: 0, pointerId: 1 });

      // down, move(no), move(yes), move(yes), up(yes)
      expect(events.map((e) => e.isDrag)).toEqual([false, false, true, true, true]);
    });

    it('honors a custom dragThreshold of 0 (any move is a drag)', () => {
      controller.dispose();
      controller = new PointerInputController(el, { ...options, dragThreshold: 0 });
      dispatchPointer(el, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1 });
      dispatchPointer(el, 'pointermove', { clientX: 1, clientY: 0, pointerId: 1 });
      expect(events.map((e) => e.isDrag)).toEqual([false, true]);
    });
  });

  describe('active-pointer bookkeeping', () => {
    it('tracks hasActivePointers across a full gesture', () => {
      expect(controller.hasActivePointers).toBe(false);
      dispatchPointer(el, 'pointerdown', { pointerId: 1 });
      expect(controller.hasActivePointers).toBe(true);
      dispatchPointer(el, 'pointerup', { pointerId: 1 });
      expect(controller.hasActivePointers).toBe(false);
    });

    it('clears pointer state on cancel', () => {
      dispatchPointer(el, 'pointerdown', { pointerId: 1 });
      dispatchPointer(el, 'pointercancel', { pointerId: 1 });
      expect(controller.hasActivePointers).toBe(false);
      expect(events.map((e) => e.type)).toEqual(['down', 'cancel']);
    });

    it('emits hover moves with no active pointer and isDrag false', () => {
      dispatchPointer(el, 'pointermove', { clientX: 5, clientY: 5 });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('move');
      expect(events[0].isDrag).toBe(false);
      expect(controller.hasActivePointers).toBe(false);
    });
  });

  describe('disposal (leak fix)', () => {
    it('emits nothing after dispose', () => {
      controller.dispose();
      dispatchPointer(el, 'pointerdown', { pointerId: 1 });
      dispatchPointer(el, 'pointermove', { pointerId: 1 });
      dispatchPointer(el, 'pointerup', { pointerId: 1 });
      expect(events).toHaveLength(0);
    });

    it('removes the EXACT listener refs it added (no .bind() leak)', () => {
      const freshEl = document.createElement('div');
      const addSpy = jest.spyOn(freshEl, 'addEventListener');
      const removeSpy = jest.spyOn(freshEl, 'removeEventListener');

      const c = new PointerInputController(freshEl, options);
      const added = new Map<string, EventListenerOrEventListenerObject>();
      for (const call of addSpy.mock.calls) {
        added.set(call[0] as string, call[1] as EventListenerOrEventListenerObject);
      }
      expect(added.size).toBe(4); // down/move/up/cancel

      c.dispose();

      // Each removed listener must be the SAME function identity that was added.
      for (const [type, ref] of added) {
        expect(removeSpy).toHaveBeenCalledWith(type, ref);
      }
    });

    it('is idempotent', () => {
      expect(() => {
        controller.dispose();
        controller.dispose();
      }).not.toThrow();
    });
  });
});
