import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RendererSwitcherComponent } from './renderer-switcher.component';
import { DiagramRendererService } from '../../services/diagram-renderer.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { IRenderer } from '../../../../../../renderer/src/core/renderer.interface';
import type { VNode } from '@grafloria/renderer';

// Mock renderer
class MockRenderer implements IRenderer {
  type: string;
  capabilities = {
    supportsHitTest: true,
    supportsBatching: true,
    supportsExport: true,
    supportsMeasurement: true,
    supportsForeignObject: true,
    supportsFilters: true,
    supportsOffscreen: true,
  };

  constructor(type: string) {
    this.type = type;
  }

  initialize(): void {}
  async render(): Promise<void> {}
  async update(): Promise<void> {}
  clear(): void {}
  measureText(): any { return { width: 100, height: 20, baseline: 15 }; }
  measureElement(): any { return { x: 0, y: 0, width: 100, height: 100 }; }
  hitTest(): VNode | null { return null; }
  async export(): Promise<string> { return 'data:image/png;base64,'; }
  destroy(): void {}
}

describe('RendererSwitcherComponent', () => {
  let component: RendererSwitcherComponent;
  let fixture: ComponentFixture<RendererSwitcherComponent>;
  let service: DiagramRendererService;
  let container: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RendererSwitcherComponent],
      providers: [DiagramRendererService],
    }).compileComponents();

    fixture = TestBed.createComponent(RendererSwitcherComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(DiagramRendererService);

    container = document.createElement('div');
    document.body.appendChild(container);
    component.container = container;

    // Register mock renderers
    service.registerRenderer('svg', new MockRenderer('svg'));
    service.registerRenderer('canvas', new MockRenderer('canvas'));
  });

  afterEach(() => {
    service.destroy();
    document.body.removeChild(container);
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should load available renderers on init', () => {
      fixture.detectChanges();

      expect(component.availableRenderers.length).toBe(2);
      expect(component.availableRenderers).toContain('svg');
      expect(component.availableRenderers).toContain('canvas');
    });

    it('should set initial selected renderer', async () => {
      await service.switchRenderer('svg', container);
      fixture.detectChanges();

      expect(component.selectedRenderer).toBe('svg');
    });
  });

  describe('renderer switching', () => {
    beforeEach(async () => {
      await service.switchRenderer('svg', container);
      fixture.detectChanges();
    });

    it('should switch renderer when selection changes', async () => {
      component.selectedRenderer = 'canvas';
      await component.onRendererChange();

      expect(service.getActiveRenderer()?.type).toBe('canvas');
    });

    it('should update selected renderer when changed externally', async () => {
      await service.switchRenderer('canvas', container);
      fixture.detectChanges();

      // Give observables time to emit
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(component.selectedRenderer).toBe('canvas');
    });

    it('should emit rendererChanged event', async () => {
      spyOn(component.rendererChanged, 'emit');

      component.selectedRenderer = 'canvas';
      await component.onRendererChange();

      expect(component.rendererChanged.emit).toHaveBeenCalledWith('canvas');
    });
  });

  describe('recommendations', () => {
    beforeEach(async () => {
      await service.switchRenderer('svg', container);
      fixture.detectChanges();
    });

    it('should show recommendation when enabled', () => {
      component.showRecommendation = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.recommendation')).toBeTruthy();
    });

    it('should get recommendation from service', () => {
      component.showRecommendation = true;
      component.recommendationCriteria = { nodeCount: 5000 };
      fixture.detectChanges();

      const recommendation = component.getCurrentRecommendation();
      expect(recommendation).toBeTruthy();
      expect(recommendation?.recommendedRenderer).toBe('canvas'); // Should recommend canvas for large diagrams
    });

    it('should apply recommendation when clicked', async () => {
      component.showRecommendation = true;
      component.recommendationCriteria = { nodeCount: 5000 };
      fixture.detectChanges();

      await component.applyRecommendation();

      expect(service.getActiveRenderer()?.type).toBe('canvas');
    });
  });

  describe('template rendering', () => {
    beforeEach(async () => {
      await service.switchRenderer('svg', container);
      fixture.detectChanges();
    });

    it('should render dropdown with available renderers', () => {
      const compiled = fixture.nativeElement;
      const select = compiled.querySelector('select');

      expect(select).toBeTruthy();
      expect(select.options.length).toBe(2);
    });

    it('should show current renderer as selected', () => {
      const compiled = fixture.nativeElement;
      const select = compiled.querySelector('select') as HTMLSelectElement;

      expect(select.value).toBe('svg');
    });

    it('should trigger change on selection', async () => {
      spyOn(component, 'onRendererChange');
      const compiled = fixture.nativeElement;
      const select = compiled.querySelector('select') as HTMLSelectElement;

      select.value = 'canvas';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(component.onRendererChange).toHaveBeenCalled();
    });
  });

  describe('custom styling', () => {
    it('should accept custom CSS class', () => {
      component.customClass = 'my-custom-class';
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const wrapper = compiled.querySelector('.renderer-switcher');

      expect(wrapper?.classList.contains('my-custom-class')).toBe(true);
    });

    it('should show label when provided', () => {
      component.label = 'Select Renderer:';
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const label = compiled.querySelector('label');

      expect(label?.textContent).toContain('Select Renderer:');
    });
  });

  describe('lifecycle', () => {
    it('should cleanup on destroy', () => {
      fixture.detectChanges();
      component.ngOnDestroy();

      // Should not throw
      expect(component).toBeTruthy();
    });

    it('should unsubscribe from observables', () => {
      fixture.detectChanges();
      const spy = spyOn(component['destroy$'], 'next');

      component.ngOnDestroy();

      expect(spy).toHaveBeenCalled();
    });
  });
});
