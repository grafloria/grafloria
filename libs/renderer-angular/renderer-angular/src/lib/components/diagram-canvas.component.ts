import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DiagramEngine } from '@grafloria/engine';
import { SVGRenderer, LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { VNodeRendererService } from '../services/vnode-renderer.service';

/**
 * DiagramCanvasComponent
 *
 * Main Angular component for rendering diagrams using the framework-agnostic
 * SVGRenderer and engine integration.
 *
 * @example
 * ```html
 * <grafloria-diagram-canvas
 *   [engine]="diagramEngine"
 *   [viewport]="{ x: 0, y: 0, width: 800, height: 600 }"
 *   [zoom]="1.0"
 *   [theme]="LIGHT_THEME">
 * </grafloria-diagram-canvas>
 * ```
 */
@Component({
  selector: 'grafloria-diagram-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diagram-canvas.component.html',
  styleUrls: ['./diagram-canvas.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagramCanvasComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  /**
   * Diagram engine instance (required)
   */
  @Input() engine!: DiagramEngine;

  /**
   * Viewport configuration
   */
  @Input() viewport: Rectangle = { x: 0, y: 0, width: 800, height: 600 };

  /**
   * Zoom level
   */
  @Input() zoom = 1.0;

  /**
   * Theme configuration
   */
  @Input() theme: Theme = LIGHT_THEME;

  /**
   * SVG container reference
   */
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  /**
   * SVGRenderer instance
   */
  private renderer?: SVGRenderer;

  /**
   * Flag to track if component is destroyed
   */
  private destroyed = false;

  constructor(
    private vnodeRenderer: VNodeRendererService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Initialization logic if needed
  }

  ngAfterViewInit(): void {
    // Create renderer after view is initialized
    if (this.engine) {
      this.initializeRenderer();
      this.renderDiagram();
      this.subscribeToEngineEvents();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Re-render when inputs change
    if (changes['engine'] && !changes['engine'].firstChange) {
      this.initializeRenderer();
      this.renderDiagram();
    }

    if (changes['theme'] && !changes['theme'].firstChange) {
      if (this.renderer) {
        this.renderer.setTheme(this.theme);
        this.renderDiagram();
      }
    }

    if (changes['zoom'] && !changes['zoom'].firstChange) {
      this.renderDiagram();
      this.cdr.markForCheck();
    }

    if (changes['viewport'] && !changes['viewport'].firstChange) {
      this.renderDiagram();
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup();
  }

  /**
   * Initialize SVG renderer
   */
  private initializeRenderer(): void {
    // Dispose old renderer if exists
    if (this.renderer) {
      this.renderer.dispose();
    }

    // Create new renderer
    this.renderer = new SVGRenderer(
      this.engine,
      {
        enableCaching: true,
        useCSSMode: true,
      },
      this.theme
    );
  }

  /**
   * Render diagram to DOM
   */
  private renderDiagram(): void {
    if (!this.renderer || !this.containerRef || this.destroyed) {
      return;
    }

    // Generate VNode tree using SVGRenderer
    const vnode = this.renderer.render(this.viewport, this.zoom);

    // Render VNode tree to DOM using VNodeRendererService
    this.vnodeRenderer.render(vnode, this.containerRef.nativeElement);
  }

  /**
   * Subscribe to engine events to trigger re-renders
   */
  private subscribeToEngineEvents(): void {
    if (!this.engine) {
      return;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return;
    }

    // Re-render when entities are added/removed/changed
    diagram.on('node:added', () => this.renderDiagram());
    diagram.on('node:removed', () => this.renderDiagram());
    diagram.on('node:changed', () => this.renderDiagram());
    diagram.on('link:added', () => this.renderDiagram());
    diagram.on('link:removed', () => this.renderDiagram());
    diagram.on('link:changed', () => this.renderDiagram());
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = undefined;
    }
  }
}
