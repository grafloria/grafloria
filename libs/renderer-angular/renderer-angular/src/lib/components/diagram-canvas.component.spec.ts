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

    test('should re-render when zoom changes', () => {
      fixture.detectChanges();

      const spy = jest.spyOn(component as any, 'renderDiagram');

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
    test('should re-render when theme changes', () => {
      fixture.detectChanges();

      const spy = jest.spyOn(component as any, 'renderDiagram');

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
});
