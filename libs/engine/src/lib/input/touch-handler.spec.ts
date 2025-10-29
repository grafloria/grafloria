import { TouchHandler, TouchGestureEvent } from './touch-handler';

describe('TouchHandler', () => {
  let element: HTMLElement;
  let touchHandler: TouchHandler;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
    touchHandler = new TouchHandler(element);
  });

  afterEach(() => {
    touchHandler.destroy();
    document.body.removeChild(element);
  });

  describe('Tap gesture', () => {
    it('should detect a tap gesture', (done) => {
      touchHandler.on('tap', (event: TouchGestureEvent) => {
        expect(event.type).toBe('tap');
        done();
      });

      // Simulate touch start
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      // Simulate touch end quickly (within tap duration)
      setTimeout(() => {
        const touchEnd = new TouchEvent('touchend', {
          changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        });
        element.dispatchEvent(touchEnd);
      }, 100);
    });

    it('should not detect a tap if movement exceeds threshold', (done) => {
      let tapDetected = false;

      touchHandler.on('tap', () => {
        tapDetected = true;
      });

      // Simulate touch start
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      // Simulate touch move (beyond threshold)
      const touchMove = new TouchEvent('touchmove', {
        touches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
      });
      element.dispatchEvent(touchMove);

      // Simulate touch end
      setTimeout(() => {
        const touchEnd = new TouchEvent('touchend', {
          changedTouches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
        });
        element.dispatchEvent(touchEnd);

        setTimeout(() => {
          expect(tapDetected).toBe(false);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('Long-press gesture', () => {
    it('should detect a long-press gesture', (done) => {
      touchHandler.on('long-press', (event: TouchGestureEvent) => {
        expect(event.type).toBe('long-press');
        done();
      });

      // Simulate touch start
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      // Long-press should fire after 500ms
    });

    it('should cancel long-press if touch moves', (done) => {
      let longPressDetected = false;

      touchHandler.on('long-press', () => {
        longPressDetected = true;
      });

      // Simulate touch start
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      // Simulate touch move (beyond threshold)
      setTimeout(() => {
        const touchMove = new TouchEvent('touchmove', {
          touches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
          changedTouches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
        });
        element.dispatchEvent(touchMove);

        setTimeout(() => {
          expect(longPressDetected).toBe(false);
          done();
        }, 600);
      }, 100);
    });
  });

  describe('Drag gesture', () => {
    it('should detect a drag gesture', (done) => {
      let dragEvents = 0;

      touchHandler.on('drag', (event: TouchGestureEvent) => {
        expect(event.type).toBe('drag');
        dragEvents++;
        if (dragEvents >= 1) {
          done();
        }
      });

      // Simulate touch start
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      // Simulate touch move
      setTimeout(() => {
        const touchMove = new TouchEvent('touchmove', {
          touches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
          changedTouches: [{ identifier: 0, clientX: 120, clientY: 120, pageX: 120, pageY: 120 } as Touch],
        });
        element.dispatchEvent(touchMove);
      }, 50);
    });
  });

  describe('Pinch gesture', () => {
    it('should detect a pinch gesture', (done) => {
      touchHandler.on('pinch', (event: TouchGestureEvent) => {
        expect(event.type).toBe('pinch');
        expect(event.scale).toBeDefined();
        done();
      });

      // Simulate two-finger touch start
      const touchStart = new TouchEvent('touchstart', {
        touches: [
          { identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch,
          { identifier: 1, clientX: 200, clientY: 100, pageX: 200, pageY: 100 } as Touch,
        ],
        changedTouches: [
          { identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch,
          { identifier: 1, clientX: 200, clientY: 100, pageX: 200, pageY: 100 } as Touch,
        ],
      });
      element.dispatchEvent(touchStart);

      // Simulate pinch (fingers moving closer)
      setTimeout(() => {
        const touchMove = new TouchEvent('touchmove', {
          touches: [
            { identifier: 0, clientX: 110, clientY: 100, pageX: 110, pageY: 100 } as Touch,
            { identifier: 1, clientX: 190, clientY: 100, pageX: 190, pageY: 100 } as Touch,
          ],
          changedTouches: [
            { identifier: 0, clientX: 110, clientY: 100, pageX: 110, pageY: 100 } as Touch,
            { identifier: 1, clientX: 190, clientY: 100, pageX: 190, pageY: 100 } as Touch,
          ],
        });
        element.dispatchEvent(touchMove);
      }, 50);
    });
  });

  describe('Event listeners', () => {
    it('should register and trigger event listeners', (done) => {
      const callback = jest.fn((event: TouchGestureEvent) => {
        expect(event.type).toBe('tap');
        expect(callback).toHaveBeenCalled();
        done();
      });

      touchHandler.on('tap', callback);

      // Simulate tap
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      setTimeout(() => {
        const touchEnd = new TouchEvent('touchend', {
          changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        });
        element.dispatchEvent(touchEnd);
      }, 100);
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();

      touchHandler.on('tap', callback);
      touchHandler.off('tap', callback);

      // Simulate tap
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      const touchEnd = new TouchEvent('touchend', {
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchEnd);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clean up on destroy', () => {
      const callback = jest.fn();
      touchHandler.on('tap', callback);
      touchHandler.destroy();

      // Simulate tap after destroy
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100 } as Touch],
      });
      element.dispatchEvent(touchStart);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
