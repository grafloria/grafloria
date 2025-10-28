import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RendererSwitcherComponent } from './renderer-switcher.component';
import { DiagramRendererService } from '../../services/diagram-renderer.service';
import type { IRendererStrategy as IRenderer, VNode } from '@grafloria/renderer';

// Mock renderer for integration tests
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

/**
 * Integration tests for RendererSwitcherComponent with real renderers.
 * Tests the full flow from UI interaction to renderer switching.
 */

@Component({
  template: `
    <grafloria-renderer-switcher
      [container]="containerElement"
      [label]="'Select Renderer'"
      [showRecommendation]="true"
      [recommendationCriteria]="criteria"
      (rendererChanged)="onRendererChanged($event)">
    </grafloria-renderer-switcher>
  `
})
class TestHostComponent {
  @ViewChild(RendererSwitcherComponent) switcher!: RendererSwitcherComponent;

  containerElement: HTMLElement;
  criteria = { nodeCount: 100 };
  lastRendererChanged = '';

  constructor() {
    this.containerElement = document.createElement('div');
    this.containerElement.style.width = '800px';
    this.containerElement.style.height = '600px';
    document.body.appendChild(this.containerElement);
  }

  onRendererChanged(renderer: string) {
    this.lastRendererChanged = renderer;
  }

  ngOnDestroy() {
    if (this.containerElement.parentNode) {
      document.body.removeChild(this.containerElement);
    }
  }
}

describe('RendererSwitcher Integration Tests', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let rendererService: DiagramRendererService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent],
      imports: [CommonModule, FormsModule, RendererSwitcherComponent],
      providers: [DiagramRendererService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    rendererService = TestBed.inject(DiagramRendererService);
  });

  afterEach(() => {
    rendererService.destroy();
  });

  describe('end-to-end renderer switching', () => {
    it('should register renderers and switch via UI', async () => {
      // Create mock renderer instances
      const svgRenderer = new MockRenderer('svg');
      const canvasRenderer = new MockRenderer('canvas');

      // Register renderers
      rendererService.registerRenderer('svg', svgRenderer);
      rendererService.registerRenderer('canvas', canvasRenderer);

      // Initialize component
      fixture.detectChanges();
      await fixture.whenStable();

      // Switch to SVG via service
      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      // Verify switcher shows SVG
      expect(hostComponent.switcher.selectedRenderer).toBe('svg');

      // Simulate user changing dropdown to Canvas
      hostComponent.switcher.selectedRenderer = 'canvas';
      await hostComponent.switcher.onRendererChange();
      fixture.detectChanges();

      // Verify service switched to Canvas
      expect(rendererService.getActiveRenderer()?.type).toBe('canvas');

      // Verify event was emitted
      expect(hostComponent.lastRendererChanged).toBe('canvas');
    });
  });

  describe('recommendation integration', () => {
    beforeEach(() => {
      // Register mock renderers
      const svgRenderer = new MockRenderer('svg');
      const canvasRenderer = new MockRenderer('canvas');

      rendererService.registerRenderer('svg', svgRenderer);
      rendererService.registerRenderer('canvas', canvasRenderer);
    });

    it('should show recommendation based on criteria', async () => {
      // Set criteria for small diagram (should recommend SVG)
      hostComponent.criteria = { nodeCount: 50 };
      fixture.detectChanges();
      await fixture.whenStable();

      // Start with SVG
      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      const recommendation = hostComponent.switcher.getCurrentRecommendation();
      expect(recommendation?.recommendedRenderer).toBe('svg');
    });

    it('should recommend Canvas for large diagrams', async () => {
      // Set criteria for large diagram
      hostComponent.criteria = { nodeCount: 5000 };
      fixture.detectChanges();
      await fixture.whenStable();

      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      const recommendation = hostComponent.switcher.getCurrentRecommendation();
      expect(recommendation?.recommendedRenderer).toBe('canvas');
    });

    it('should apply recommendation and switch renderer', async () => {
      // Start with SVG
      await rendererService.switchRenderer('svg', hostComponent.containerElement);

      // Set criteria that recommends Canvas
      hostComponent.criteria = { nodeCount: 5000 };
      fixture.detectChanges();
      await fixture.whenStable();

      // Apply recommendation
      await hostComponent.switcher.applyRecommendation();
      fixture.detectChanges();

      // Should have switched to Canvas
      expect(rendererService.getActiveRenderer()?.type).toBe('canvas');
      expect(hostComponent.switcher.selectedRenderer).toBe('canvas');
    });
  });

  describe('bidirectional sync', () => {
    beforeEach(() => {
      const svgRenderer = new MockRenderer('svg');
      const canvasRenderer = new MockRenderer('canvas');

      rendererService.registerRenderer('svg', svgRenderer);
      rendererService.registerRenderer('canvas', canvasRenderer);
    });

    it('should sync when renderer changed via service', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      // Change via service
      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();
      await fixture.whenStable();

      // UI should update
      expect(hostComponent.switcher.selectedRenderer).toBe('svg');

      // Change to Canvas via service
      await rendererService.switchRenderer('canvas', hostComponent.containerElement);
      fixture.detectChanges();
      await fixture.whenStable();

      // UI should update again
      expect(hostComponent.switcher.selectedRenderer).toBe('canvas');
    });

    it('should sync when renderer changed via UI', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      // Change via UI
      hostComponent.switcher.selectedRenderer = 'canvas';
      await hostComponent.switcher.onRendererChange();
      fixture.detectChanges();

      // Service should update
      expect(rendererService.getActiveRenderer()?.type).toBe('canvas');
    });
  });

  describe('error handling', () => {
    it('should handle switching to unregistered renderer gracefully', async () => {
      const svgRenderer = new MockRenderer('svg');

      rendererService.registerRenderer('svg', svgRenderer);

      fixture.detectChanges();
      await fixture.whenStable();

      await rendererService.switchRenderer('svg', hostComponent.containerElement);

      // Try to switch to non-existent renderer
      hostComponent.switcher.selectedRenderer = 'webgl';

      // Should not throw
      await hostComponent.switcher.onRendererChange();

      // Should remain on SVG
      expect(rendererService.getActiveRenderer()?.type).toBe('svg');
    });
  });

  describe('UI rendering', () => {
    beforeEach(() => {
      const svgRenderer = new MockRenderer('svg');
      const canvasRenderer = new MockRenderer('canvas');

      rendererService.registerRenderer('svg', svgRenderer);
      rendererService.registerRenderer('canvas', canvasRenderer);
    });

    it('should render dropdown with all registered renderers', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const compiled = fixture.nativeElement;
      const select = compiled.querySelector('select');
      const options = select?.querySelectorAll('option');

      expect(options?.length).toBe(2);
      expect(Array.from(options || []).map((o: any) => o.value)).toEqual(['svg', 'canvas']);
    });

    it('should show label when provided', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const compiled = fixture.nativeElement;
      const label = compiled.querySelector('label');

      expect(label?.textContent).toContain('Select Renderer');
    });

    it('should show recommendation UI when enabled', async () => {
      hostComponent.criteria = { nodeCount: 5000 };
      fixture.detectChanges();
      await fixture.whenStable();

      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const recommendation = compiled.querySelector('.recommendation');

      expect(recommendation).toBeTruthy();
      expect(recommendation?.textContent).toContain('CANVAS');
    });

    it('should show apply button when not using recommended renderer', async () => {
      hostComponent.criteria = { nodeCount: 5000 }; // Recommends Canvas
      fixture.detectChanges();
      await fixture.whenStable();

      await rendererService.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const applyButton = compiled.querySelector('.apply-recommendation-btn');

      expect(applyButton).toBeTruthy();
    });
  });
});
