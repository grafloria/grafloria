import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  HostListener,
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
   * Enable mouse wheel zoom (Phase 0.5 - Option B)
   */
  @Input() enableMouseWheelZoom = true;

  /**
   * Enable pan/drag with middle mouse button (Phase 0.5 - Option B)
   */
  @Input() enablePan = true;

  /**
   * Zoom sensitivity (Phase 0.5 - Option B)
   */
  @Input() zoomSensitivity = 0.1;

  /**
   * Minimum zoom level (Phase 0.5 - Option B)
   */
  @Input() minZoom = 0.1;

  /**
   * Maximum zoom level (Phase 0.5 - Option B)
   */
  @Input() maxZoom = 3.0;

  /**
   * Emit viewport changes (Phase 0.5 - Option B)
   */
  @Output() viewportChanged = new EventEmitter<Rectangle>();

  /**
   * Emit zoom changes (Phase 0.5 - Option B)
   */
  @Output() zoomChanged = new EventEmitter<number>();

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

  /**
   * Pan/drag state (Phase 0.5 - Option B)
   */
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private spaceKeyPressed = false;

  /**
   * Node drag state (Option 1: Node Interaction)
   */
  private isDraggingNode = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private draggedNodes: Map<string, { startX: number; startY: number }> = new Map();

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

    // Calculate actual viewport dimensions based on canvas size and zoom
    const actualViewport = this.calculateActualViewport();

    // Generate VNode tree using SVGRenderer
    const vnode = this.renderer.render(actualViewport, this.zoom);

    // Render VNode tree to DOM using VNodeRendererService
    this.vnodeRenderer.render(vnode, this.containerRef.nativeElement);
  }

  /**
   * Calculate the actual viewport in world-space coordinates
   * The viewport dimensions must scale with zoom level:
   * - At zoom = 1.0, viewport = canvas pixel dimensions
   * - At zoom = 0.5 (zoomed out), viewport = 2x canvas dimensions (see more)
   * - At zoom = 2.0 (zoomed in), viewport = 0.5x canvas dimensions (see less)
   */
  private calculateActualViewport(): Rectangle {
    const container = this.containerRef?.nativeElement;
    if (!container) {
      return this.viewport;
    }

    // Get actual canvas pixel dimensions
    const rect = container.getBoundingClientRect();
    const canvasWidth = rect.width || this.viewport.width;
    const canvasHeight = rect.height || this.viewport.height;

    // Calculate world-space dimensions based on zoom
    // worldWidth = pixelWidth / zoom
    const worldWidth = canvasWidth / this.zoom;
    const worldHeight = canvasHeight / this.zoom;

    return {
      x: this.viewport.x,
      y: this.viewport.y,
      width: worldWidth,
      height: worldHeight
    };
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
    diagram.on('node:added', () => {
      this.renderDiagram();
      this.cdr.detectChanges();
    });
    diagram.on('node:removed', () => {
      this.renderDiagram();
      this.cdr.detectChanges();
    });
    diagram.on('node:changed', () => {
      this.renderDiagram();
      this.cdr.detectChanges();
    });
    diagram.on('link:added', () => {
      this.renderDiagram();
      this.cdr.detectChanges();
    });
    diagram.on('link:removed', () => {
      this.renderDiagram();
      this.cdr.detectChanges();
    });
    diagram.on('link:changed', () => {
      this.renderDiagram();
      this.cdr.detectChanges();
    });
  }

  /**
   * Handle keydown for pan mode (Space key) - This is now merged with the other onKeyDown handler below
   * Kept as a comment for reference
   */
  // This method is merged with the onKeyDown method that handles Delete/Escape/Ctrl+A

  /**
   * Handle keyup to exit pan mode (Space key)
   */
  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceKeyPressed = false;
      this.isPanning = false;
      // Reset cursor
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = 'default';
      }
    }
  }

  /**
   * Handle mouse wheel for zooming (Phase 0.5 - Option B)
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!this.enableMouseWheelZoom || !this.engine) {
      return;
    }

    event.preventDefault();

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return;
    }

    // Calculate zoom delta based on wheel direction
    const delta = event.deltaY > 0 ? -this.zoomSensitivity : this.zoomSensitivity;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));

    // Update local zoom
    this.zoom = newZoom;

    // Update diagram zoom
    diagram.setZoom(newZoom);

    // Emit zoom change event
    this.zoomChanged.emit(newZoom);

    // Trigger re-render with updated viewport dimensions
    this.renderDiagram();
    this.cdr.markForCheck();
  }

  /**
   * Handle mouse down for panning and node selection (Phase 0.5 - Option B + Option 1)
   * Supports:
   * - Left click: Select/drag nodes
   * - Ctrl + Left click: Multi-select
   * - Middle mouse button: Pan
   * - Space + Left click: Pan
   */
  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (!this.engine) {
      return;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return;
    }

    // Middle mouse button (button === 1) for panning
    // OR left mouse button (button === 0) while Space key is pressed
    if (event.button === 1 || (event.button === 0 && this.spaceKeyPressed)) {
      if (!this.enablePan) {
        return;
      }

      event.preventDefault();
      this.isPanning = true;
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;

      // Change cursor to grabbing when panning starts
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = 'grabbing';
      }
      return;
    }

    // Left mouse button for node interaction
    if (event.button === 0 && !this.spaceKeyPressed) {
      // Convert client coordinates to world coordinates
      const rect = this.containerRef.nativeElement.getBoundingClientRect();
      const clientX = event.clientX - rect.left;
      const clientY = event.clientY - rect.top;

      // Convert to world coordinates
      const worldX = this.viewport.x + (clientX / this.zoom);
      const worldY = this.viewport.y + (clientY / this.zoom);

      // Check if clicking on a node
      const clickedNode = diagram.getNodeAtPosition(worldX, worldY);

      if (clickedNode) {
        event.preventDefault();

        // Handle selection
        if (event.ctrlKey || event.metaKey) {
          // Ctrl+Click: Toggle selection (multi-select)
          diagram.toggleNodeSelection(clickedNode);
        } else if (!clickedNode.isSelected()) {
          // Normal click on unselected node: Select only this node
          diagram.selectNode(clickedNode);
        }

        // Start drag if node is draggable
        if (clickedNode.isDraggable() && clickedNode.isSelected()) {
          this.isDraggingNode = true;
          this.dragStartX = event.clientX;
          this.dragStartY = event.clientY;

          // Store initial positions of all selected nodes
          const selectedNodes = diagram.getSelectedNodes();
          this.draggedNodes.clear();
          selectedNodes.forEach((node) => {
            this.draggedNodes.set(node.id, {
              startX: node.position.x,
              startY: node.position.y
            });
          });

          // Change cursor
          if (this.containerRef?.nativeElement) {
            this.containerRef.nativeElement.style.cursor = 'move';
          }
        }
      } else {
        // Clicked on empty space
        if (!event.ctrlKey && !event.metaKey) {
          // Clear selection if not holding Ctrl
          diagram.clearSelection();
        }
      }

      this.cdr.markForCheck();
    }
  }

  /**
   * Handle mouse move for panning, node dragging, and hover (Phase 0.5 - Option B + Option 1 + Option 2)
   */
  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.engine) {
      return;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return;
    }

    // Handle panning
    if (this.isPanning) {
      // Calculate pan delta in world-space coordinates
      const dx = (this.lastPanX - event.clientX) / this.zoom;
      const dy = (this.lastPanY - event.clientY) / this.zoom;

      // Update local viewport position
      this.viewport = {
        ...this.viewport,
        x: this.viewport.x + dx,
        y: this.viewport.y + dy
      };

      // Update diagram viewport
      diagram.pan(dx, dy);

      // Update last position
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;

      // Emit viewport change event with calculated viewport
      const actualViewport = this.calculateActualViewport();
      this.viewportChanged.emit(actualViewport);

      // Trigger re-render
      this.renderDiagram();
      this.cdr.markForCheck();
      return;
    }

    // Handle node dragging
    if (this.isDraggingNode) {
      // Calculate delta in world-space coordinates
      const dx = (event.clientX - this.dragStartX) / this.zoom;
      const dy = (event.clientY - this.dragStartY) / this.zoom;

      // Update all dragged nodes
      this.draggedNodes.forEach((initialPos, nodeId) => {
        const node = diagram.getNode(nodeId);
        if (node) {
          node.setPosition(
            initialPos.startX + dx,
            initialPos.startY + dy
          );
        }
      });

      // Trigger re-render
      this.renderDiagram();
      this.cdr.markForCheck();
      return;
    }

    // Handle hover detection (Option 2: Visual Enhancements)
    if (!this.spaceKeyPressed) {
      // Convert client coordinates to world coordinates
      const rect = this.containerRef.nativeElement.getBoundingClientRect();
      const clientX = event.clientX - rect.left;
      const clientY = event.clientY - rect.top;

      const worldX = this.viewport.x + (clientX / this.zoom);
      const worldY = this.viewport.y + (clientY / this.zoom);

      // Check if hovering over a node
      const hoveredNode = diagram.getNodeAtPosition(worldX, worldY);
      const allNodes = diagram.getNodes();

      // Update hover state for all nodes
      let needsRender = false;
      allNodes.forEach((node) => {
        const wasHovered = node.state.hovered;
        const isHovered = node === hoveredNode;

        if (wasHovered !== isHovered) {
          node.setState({ hovered: isHovered });
          needsRender = true;
        }
      });

      // Update cursor
      if (this.containerRef?.nativeElement) {
        if (hoveredNode) {
          this.containerRef.nativeElement.style.cursor = hoveredNode.isDraggable() ? 'pointer' : 'default';
        } else {
          this.containerRef.nativeElement.style.cursor = 'default';
        }
      }

      // Re-render if hover state changed
      if (needsRender) {
        this.renderDiagram();
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Handle mouse up to stop panning and node dragging (Phase 0.5 - Option B + Option 1)
   */
  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (event.button === 1 || event.button === 0) {
      // Stop panning
      if (this.isPanning) {
        this.isPanning = false;
      }

      // Stop node dragging
      if (this.isDraggingNode) {
        this.isDraggingNode = false;
        this.draggedNodes.clear();
      }

      // Restore cursor based on space key state
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = this.spaceKeyPressed ? 'grab' : 'default';
      }
    }
  }

  /**
   * Handle mouse leave to stop panning and node dragging (Phase 0.5 - Option B + Option 1)
   */
  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.isPanning = false;
    this.isDraggingNode = false;
    this.draggedNodes.clear();

    // Reset cursor
    if (this.containerRef?.nativeElement) {
      this.containerRef.nativeElement.style.cursor = 'default';
    }
  }

  /**
   * Handle keyboard events (Option 1: Node Interaction)
   * - Space: Pan mode cursor
   * - Delete/Backspace: Delete selected nodes
   * - Escape: Clear selection
   * - Ctrl+A: Select all
   */
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Handle Space key for pan mode cursor
    if (event.code === 'Space' && !this.spaceKeyPressed) {
      this.spaceKeyPressed = true;
      // Change cursor to indicate pan mode
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = 'grab';
      }
    }

    if (!this.engine) {
      return;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return;
    }

    // Handle Delete key
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Don't delete if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const deletedCount = diagram.deleteSelected();
      if (deletedCount > 0) {
        event.preventDefault();
        console.log(`🗑️  Deleted ${deletedCount} selected node(s)`);
        this.renderDiagram();
        this.cdr.markForCheck();
      }
    }

    // Handle Escape key - clear selection
    if (event.key === 'Escape') {
      diagram.clearSelection();
      this.renderDiagram();
      this.cdr.markForCheck();
    }

    // Handle Ctrl+A - select all
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      diagram.selectAll();
      this.renderDiagram();
      this.cdr.markForCheck();
    }
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
