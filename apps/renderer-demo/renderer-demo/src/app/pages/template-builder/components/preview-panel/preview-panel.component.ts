import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  NodeFactory,
  TemplateRegistry,
  type NodeTemplate
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { PerformanceMonitorService } from '../../services/performance-monitor.service';

/**
 * Preview Panel Component
 *
 * Live preview of the node template being edited.
 * Renders the node in a diagram canvas with zoom and pan controls.
 *
 * Features:
 * - Real-time preview updates
 * - Zoom controls
 * - Pan controls
 * - Performance measurement
 *
 * ~180 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule, DiagramCanvasComponent],
  selector: 'app-preview-panel',
  templateUrl: './preview-panel.component.html',
  styleUrl: './preview-panel.component.css'
})
export class PreviewPanelComponent implements OnInit, OnDestroy, OnChanges {

  @Input() template = '';
  @Input() htmlLayer = '';
  @Input() cssLayer = '';

  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 800, height: 600 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  templateRegistry!: TemplateRegistry;
  nodeFactory!: NodeFactory;
  previewNode: NodeModel | null = null;

  errorMessage = '';

  private performanceMonitor = inject(PerformanceMonitorService);

  ngOnInit(): void {
    this.initializeEngine();
    this.updatePreview();
  }

  ngOnDestroy(): void {
    // Cleanup
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['template'] && !changes['template'].firstChange) ||
        (changes['htmlLayer'] && !changes['htmlLayer'].firstChange) ||
        (changes['cssLayer'] && !changes['cssLayer'].firstChange)) {
      this.updatePreview();
    }
  }

  /**
   * Initialize diagram engine
   */
  private initializeEngine(): void {
    this.engine = new DiagramEngine();
    const diagram = this.engine.createDiagram('Template Preview');

    this.templateRegistry = new TemplateRegistry(this.engine.eventBus);
    this.nodeFactory = new NodeFactory(this.templateRegistry, diagram);

    console.log('✅ Preview engine initialized');
  }

  /**
   * Update preview with current template
   */
  private updatePreview(): void {
    try {
      this.performanceMonitor.startMeasure('template-preview');

      // Parse template
      const templateData: NodeTemplate = JSON.parse(this.template);

      // Apply HTML layer if provided
      if (this.htmlLayer && this.htmlLayer.trim()) {
        if (!templateData.structure.html) {
          templateData.structure.html = {} as any;
        }
        templateData.structure.html.template = this.htmlLayer;
        templateData.structure.html.mode = 'template';
      }

      // Apply CSS layer if provided (store in html.style)
      if (this.cssLayer && this.cssLayer.trim()) {
        if (!templateData.structure.html) {
          templateData.structure.html = {} as any;
        }
        templateData.structure.html.style = this.cssLayer;
      }

      // Clear previous preview
      const diagram = this.engine.getDiagram();
      if (!diagram) {
        throw new Error('Diagram not initialized');
      }

      // Remove old preview node
      if (this.previewNode) {
        diagram.removeNode(this.previewNode.id);
        this.previewNode = null;
      }

      // Register template
      this.templateRegistry.register(templateData);

      // Create node from template
      this.previewNode = this.nodeFactory.createFromTemplate(
        templateData.id,
        templateData.defaultData || {},
        { x: 400, y: 300 } // Center position
      );

      // Fit to view
      diagram.fitToView(50);
      this.updateViewportFromDiagram();

      this.errorMessage = '';

      // End performance measurement
      setTimeout(() => {
        this.performanceMonitor.endMeasure('template-preview');
      }, 100);

      console.log('✅ Preview updated');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Invalid template JSON';
      console.error('❌ Preview update failed:', error);
      this.performanceMonitor.reset();
    }
  }

  /**
   * Update viewport from diagram
   */
  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      this.viewport = diagram.getViewport();
      this.zoom = diagram.getViewport().zoom;
    }
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const currentZoom = diagram.getViewport().zoom;
      diagram.setZoom(Math.min(4.0, currentZoom + 0.1));
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const currentZoom = diagram.getViewport().zoom;
      diagram.setZoom(Math.max(0.25, currentZoom - 0.1));
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Reset zoom
   */
  resetZoom(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.setZoom(1.0);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Fit to view
   */
  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(50);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Refresh preview
   */
  refresh(): void {
    this.updatePreview();
  }
}
