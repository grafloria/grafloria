import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TouchResizeHandleComponent } from './touch-resize-handle.component';

describe('TouchResizeHandleComponent', () => {
  let component: TouchResizeHandleComponent;
  let fixture: ComponentFixture<TouchResizeHandleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TouchResizeHandleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TouchResizeHandleComponent);
    component = fixture.componentInstance;
    component.position = 'se'; // Southeast handle
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Touch events', () => {
    it('should emit resizeStart on touchstart', () => {
      jest.spyOn(component.resizeStart, 'emit');

      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      });

      component.onTouchStart(touchStart);

      expect(component.resizeStart.emit).toHaveBeenCalled();
    });

    it('should emit resize with delta on touchmove', () => {
      jest.spyOn(component.resize, 'emit');

      // Start touch
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      });
      component.onTouchStart(touchStart);

      // Move touch
      const touchMove = new TouchEvent('touchmove', {
        touches: [{ clientX: 120, clientY: 130 } as Touch],
      });
      component.onTouchMove(touchMove);

      expect(component.resize.emit).toHaveBeenCalledWith({
        deltaX: 20,
        deltaY: 30,
      });
    });

    it('should emit resizeEnd on touchend', () => {
      jest.spyOn(component.resizeEnd, 'emit');

      const touchEnd = new TouchEvent('touchend');
      component.onTouchEnd(touchEnd);

      expect(component.resizeEnd.emit).toHaveBeenCalled();
    });

    it('should prevent default and stop propagation', () => {
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      });

      const preventDefaultSpy = jest.spyOn(touchStart, 'preventDefault');
      const stopPropagationSpy = jest.spyOn(touchStart, 'stopPropagation');

      component.onTouchStart(touchStart);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  describe('Handle positioning', () => {
    it('should position handle correctly for each corner/edge', () => {
      const positions: Array<'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'> = [
        'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'
      ];

      positions.forEach(position => {
        component.position = position;
        fixture.detectChanges();

        const handle = fixture.nativeElement.querySelector('.touch-resize-handle');
        expect(handle.getAttribute('data-position')).toBe(position);
      });
    });
  });

  describe('Touch target size', () => {
    it('should have minimum 44px touch target', () => {
      const handle = fixture.nativeElement.querySelector('.touch-resize-handle');
      const styles = window.getComputedStyle(handle);

      expect(parseInt(styles.width)).toBeGreaterThanOrEqual(44);
      expect(parseInt(styles.height)).toBeGreaterThanOrEqual(44);
    });
  });

  describe('Multiple touch moves', () => {
    it('should calculate cumulative delta correctly', () => {
      jest.spyOn(component.resize, 'emit');

      // Start touch at 100, 100
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      });
      component.onTouchStart(touchStart);

      // First move to 120, 130
      const touchMove1 = new TouchEvent('touchmove', {
        touches: [{ clientX: 120, clientY: 130 } as Touch],
      });
      component.onTouchMove(touchMove1);

      expect(component.resize.emit).toHaveBeenCalledWith({
        deltaX: 20,
        deltaY: 30,
      });

      // Second move to 140, 150 (delta from previous position)
      const touchMove2 = new TouchEvent('touchmove', {
        touches: [{ clientX: 140, clientY: 150 } as Touch],
      });
      component.onTouchMove(touchMove2);

      expect(component.resize.emit).toHaveBeenCalledWith({
        deltaX: 20,
        deltaY: 20,
      });
    });
  });
});
