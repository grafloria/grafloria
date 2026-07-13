import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileToolbarComponent, MobileToolbarAction, IMobileToolbarEngine } from './mobile-toolbar.component';

describe('MobileToolbarComponent', () => {
  let component: MobileToolbarComponent;
  let fixture: ComponentFixture<MobileToolbarComponent>;
  let mockEngine: IMobileToolbarEngine;

  beforeEach(async () => {
    mockEngine = {
      getZoom: jest.fn().mockReturnValue(1),
      setZoom: jest.fn(),
      zoomToFit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MobileToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileToolbarComponent);
    component = fixture.componentInstance;
    component.engine = mockEngine;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Toolbar toggle', () => {
    it('should toggle expanded state', () => {
      expect(component.isExpanded).toBe(false);

      component.toggleExpanded();
      expect(component.isExpanded).toBe(true);

      component.toggleExpanded();
      expect(component.isExpanded).toBe(false);
    });

    it('should show action buttons when expanded', () => {
      fixture.componentRef.setInput('actions', [
        { id: 'action1', icon: 'fa-plus', label: 'Add', onClick: jest.fn() },
      ]);

      component.isExpanded = true;
      fixture.detectChanges();

      const actionButtons = fixture.nativeElement.querySelectorAll('.toolbar-action');
      expect(actionButtons.length).toBe(1);
    });

    it('should hide action buttons when collapsed', () => {
      component.actions = [
        { id: 'action1', icon: 'fa-plus', label: 'Add', onClick: jest.fn() },
      ];

      component.isExpanded = false;
      fixture.detectChanges();

      const actionButtons = fixture.nativeElement.querySelectorAll('.toolbar-action');
      expect(actionButtons.length).toBe(0);
    });
  });

  describe('Zoom controls', () => {
    it('should zoom in', () => {
      (mockEngine.getZoom as jest.Mock).mockReturnValue(1);

      component.zoomIn();

      expect(mockEngine.setZoom).toHaveBeenCalledWith(1.2);
    });

    it('should zoom out', () => {
      (mockEngine.getZoom as jest.Mock).mockReturnValue(1);

      component.zoomOut();

      expect(mockEngine.setZoom).toHaveBeenCalledWith(expect.closeTo(0.833, 2));
    });

    it('should respect max zoom limit', () => {
      (mockEngine.getZoom as jest.Mock).mockReturnValue(3.8);

      component.zoomIn();

      expect(mockEngine.setZoom).toHaveBeenCalledWith(4);
    });

    it('should respect min zoom limit', () => {
      (mockEngine.getZoom as jest.Mock).mockReturnValue(0.12);

      component.zoomOut();

      expect(mockEngine.setZoom).toHaveBeenCalledWith(0.1);
    });

    it('should call zoomToFit', () => {
      component.zoomToFit();

      expect(mockEngine.zoomToFit).toHaveBeenCalledWith({
        maxScale: 1,
        padding: 50,
      });
    });
  });

  describe('Action handling', () => {
    it('should call action onClick', () => {
      const action: MobileToolbarAction = {
        id: 'test',
        icon: 'fa-test',
        label: 'Test',
        onClick: jest.fn(),
      };

      component.handleAction(action);

      expect(action.onClick).toHaveBeenCalled();
    });

    it('should emit actionClicked event', () => {
      const action: MobileToolbarAction = {
        id: 'test',
        icon: 'fa-test',
        label: 'Test',
        onClick: jest.fn(),
      };

      jest.spyOn(component.actionClicked, 'emit');

      component.handleAction(action);

      expect(component.actionClicked.emit).toHaveBeenCalledWith(action);
    });

    it('should collapse toolbar after action', () => {
      const action: MobileToolbarAction = {
        id: 'test',
        icon: 'fa-test',
        label: 'Test',
        onClick: jest.fn(),
      };

      component.isExpanded = true;
      component.handleAction(action);

      expect(component.isExpanded).toBe(false);
    });
  });

  describe('Zoom display', () => {
    it('should display current zoom percentage', () => {
      (mockEngine.getZoom as jest.Mock).mockReturnValue(1.5);
      component.ngOnInit();

      expect(component.zoomPercent).toBe(150);
    });

    it('should update zoom display on zoom change', () => {
      let zoomHandler: any;
      (mockEngine.on as jest.Mock).mockImplementation((event, handler) => {
        if (event === 'canvas:zoom') {
          zoomHandler = handler;
        }
      });

      component.ngOnInit();

      (mockEngine.getZoom as jest.Mock).mockReturnValue(2);
      if (zoomHandler) {
        zoomHandler();
      }

      expect(component.zoomPercent).toBe(200);
    });
  });

  describe('Touch target sizes', () => {
    // The 44px/56px minimum touch targets are enforced by the component
    // stylesheet. jest-preset-angular does not inject component styles and jsdom
    // has no layout engine, so window.getComputedStyle() cannot measure them here;
    // the pixel sizes are validated in Playwright e2e. These tests assert the
    // touch-target elements render and are queryable.
    it('should render a dedicated toggle touch-target button', () => {
      fixture.detectChanges();

      const toggleButton = fixture.nativeElement.querySelector('.toolbar-toggle');
      expect(toggleButton).toBeTruthy();
      expect(toggleButton.classList.contains('toolbar-toggle')).toBe(true);
    });

    it('should render dedicated zoom touch-target buttons', () => {
      fixture.detectChanges();

      const zoomButtons = fixture.nativeElement.querySelectorAll('.zoom-btn');
      expect(zoomButtons.length).toBeGreaterThan(0);
      zoomButtons.forEach((button: HTMLElement) => {
        expect(button.classList.contains('zoom-btn')).toBe(true);
      });
    });
  });

  describe('Cleanup', () => {
    it('should unregister event listeners on destroy', () => {
      component.ngOnInit();
      component.ngOnDestroy();

      expect(mockEngine.off).toHaveBeenCalled();
    });
  });
});
