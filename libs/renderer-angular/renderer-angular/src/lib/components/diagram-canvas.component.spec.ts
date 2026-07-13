import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';

describe('DiagramCanvasComponent', () => {
  let component: DiagramCanvasComponent;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiagramCanvasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;

    // Create engine and diagram
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test Diagram');
    component.engine = engine;
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Initialization', () => {
    test('should create component', () => {
      expect(component).toBeTruthy();
    });

    test('should require engine input', () => {
      component.engine = null as any;
      fixture.detectChanges();

      // Component should handle missing engine gracefully
      expect(component).toBeTruthy();
    });

    test('should initialize with default viewport', () => {
      fixture.detectChanges();

      expect(component.viewport).toBeDefined();
      expect(component.viewport.width).toBeGreaterThan(0);
      expect(component.viewport.height).toBeGreaterThan(0);
    });

    test('should initialize with light theme by default', () => {
      fixture.detectChanges();

      expect(component.theme).toBeDefined();
      expect(component.theme.name).toBe('Light');
    });

    test('should accept custom theme input', () => {
      component.theme = DARK_THEME;
      fixture.detectChanges();

      expect(component.theme.name).toBe('Dark');
    });

    test('should use custom viewport if provided', () => {
      component.viewport = { x: 100, y: 100, width: 1000, height: 800 };
      fixture.detectChanges();

      expect(component.viewport.x).toBe(100);
      expect(component.viewport.y).toBe(100);
      expect(component.viewport.width).toBe(1000);
      expect(component.viewport.height).toBe(800);
    });
  });

  describe('Rendering', () => {
    test('should render SVG element', () => {
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    test('should render diagram with nodes', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });
      diagram.addNode(node);

      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();

      // Should have nodes layer
      const nodesLayer = svg.querySelector('.nodes-layer');
      expect(nodesLayer).toBeTruthy();
    });

    test('should update when diagram changes', (done) => {
      fixture.detectChanges();

      const initialChildren = fixture.nativeElement.querySelector('svg')?.children.length || 0;

      // Add a node
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });
      diagram.addNode(node);

      // Wait for change detection
      setTimeout(() => {
        fixture.detectChanges();
        const svg = fixture.nativeElement.querySelector('svg');
        expect(svg).toBeTruthy();
        done();
      }, 100);
    });

    test('should apply viewport dimensions to SVG', () => {
      component.viewport = { x: 0, y: 0, width: 1200, height: 900 };
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      // The SVGRenderer deliberately omits width/height attributes (sized to 100%
      // via CSS) and applies the viewport dimensions through the viewBox instead.
      expect(svg.getAttribute('viewBox')).toBe('0 0 1200 900');
    });

    test('should include viewBox attribute', () => {
      component.viewport = { x: 50, y: 50, width: 1000, height: 800 };
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg.getAttribute('viewBox')).toBe('50 50 1000 800');
    });
  });

  describe('Zoom', () => {
    test('should use default zoom level', () => {
      fixture.detectChanges();

      expect(component.zoom).toBe(1.0);
    });

    test('should accept custom zoom level', () => {
      component.zoom = 1.5;
      fixture.detectChanges();

      expect(component.zoom).toBe(1.5);
    });

    test('should schedule a re-render when zoom changes', () => {
      fixture.detectChanges();

      // wave2/rendering: renders are frame-coalesced, so ngOnChanges schedules
      // a frame rather than painting synchronously.
      const spy = jest.spyOn(component as any, 'scheduleRender');

      component.zoom = 2.0;
      component.ngOnChanges({
        zoom: {
          currentValue: 2.0,
          previousValue: 1.0,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Theme', () => {
    test('should schedule a re-render when theme changes', () => {
      fixture.detectChanges();

      const spy = jest.spyOn(component as any, 'scheduleRender');

      component.theme = DARK_THEME;
      component.ngOnChanges({
        theme: {
          currentValue: DARK_THEME,
          previousValue: LIGHT_THEME,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    test('should dispose renderer on destroy', () => {
      fixture.detectChanges();

      const renderer = (component as any).renderer;
      const disposeSpy = jest.spyOn(renderer, 'dispose');

      component.ngOnDestroy();

      expect(disposeSpy).toHaveBeenCalled();
    });

    test('should not throw if disposed multiple times', () => {
      fixture.detectChanges();

      expect(() => {
        component.ngOnDestroy();
        component.ngOnDestroy();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // wave2/rendering: frame-coalesced render loop + real metrics
  // ==========================================================================
  describe('Frame-coalesced render loop (wave2/rendering)', () => {
    let rafCallbacks: FrameRequestCallback[];
    let rafSpy: jest.SpyInstance;
    let cancelSpy: jest.SpyInstance;
    let nextRafId: number;

    // Deterministic rAF: capture callbacks and fire them on demand via flushRAF().
    const flushRAF = () => {
      const cbs = rafCallbacks;
      rafCallbacks = [];
      cbs.forEach((cb) => cb(performance.now()));
    };

    beforeEach(() => {
      rafCallbacks = [];
      nextRafId = 0;
      rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback) => {
          rafCallbacks.push(cb);
          return ++nextRafId;
        });
      cancelSpy = jest
        .spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined);
      // Mount synchronously (renderNow, no rAF). rafSpy stays clean for asserts.
      fixture.detectChanges();
      rafSpy.mockClear();
    });

    afterEach(() => {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    });

    test('coalesces N invalidations in one tick into a single animation frame', () => {
      component.scheduleRender();
      component.scheduleRender();
      component.scheduleRender();
      component.scheduleRender();
      component.scheduleRender();

      // Five schedule calls, exactly ONE frame queued.
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    test('renders exactly once for a burst of invalidations, when something is dirty', () => {
      // Dirty a real entity so the frame is not idle-skipped.
      const node = new NodeModel({
        type: 'basic',
        position: { x: 10, y: 10 },
        size: { width: 80, height: 40 },
      });
      diagram.addNode(node); // triggers node:added -> scheduleRender (1 frame)
      node.markDirty('test');
      component.scheduleRender();
      component.scheduleRender();

      const renderSpy = jest.spyOn(component as any, 'renderDiagram');
      expect(rafSpy).toHaveBeenCalledTimes(1); // all coalesced into one frame

      flushRAF();

      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    test('skips the frame when nothing is dirty and the viewport is unchanged', () => {
      // Post-mount, guarantee a clean, unchanged state.
      diagram.markAllClean();
      const renderSpy = jest.spyOn(component as any, 'renderDiagram');

      component.scheduleRender();
      expect(rafSpy).toHaveBeenCalledTimes(1); // a frame is still queued...
      flushRAF();

      // ...but it is idle-skipped: no actual paint happens.
      expect(renderSpy).not.toHaveBeenCalled();
    });

    test('performance metrics record one sample per painted frame and none per skip', () => {
      // Mount already painted one frame.
      const afterMount = component.getPerformanceMetrics();
      expect(afterMount.sampleCount).toBe(1);
      expect(typeof afterMount.fps).toBe('number');
      expect(typeof afterMount.frameTime).toBe('number');
      expect(afterMount.droppedFrames).toBeGreaterThanOrEqual(0);

      // A real (dirty) frame adds a sample.
      const node = new NodeModel({
        type: 'basic',
        position: { x: 10, y: 10 },
        size: { width: 80, height: 40 },
      });
      diagram.addNode(node);
      node.markDirty('test');
      component.scheduleRender();
      flushRAF();
      expect(component.getPerformanceMetrics().sampleCount).toBe(2);

      // A skipped (clean) frame adds nothing.
      diagram.markAllClean();
      component.scheduleRender();
      flushRAF();
      expect(component.getPerformanceMetrics().sampleCount).toBe(2);

      // Two painted frames → rolling FPS is a finite, non-negative number.
      const metrics = component.getPerformanceMetrics();
      expect(Number.isFinite(metrics.fps)).toBe(true);
      expect(metrics.fps).toBeGreaterThanOrEqual(0);
    });

    test('cancels the queued frame on destroy', () => {
      component.scheduleRender();
      expect(rafSpy).toHaveBeenCalledTimes(1);

      component.ngOnDestroy();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });
});
