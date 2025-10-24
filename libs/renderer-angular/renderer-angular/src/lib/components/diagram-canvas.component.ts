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
import { InteractionHandlerService } from '../services/interaction-handler.service';

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
    private cdr: ChangeDetectorRef,
    private interactionHandler: InteractionHandlerService
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

    // CRITICAL FIX: Subscribe to interaction config changes
    // This ensures the diagram re-renders when port visibility, connection modes, etc. change
    const eventBus = this.engine['eventBus']; // Access private eventBus
    if (eventBus) {
      eventBus.on('config:interaction-changed', () => {
        this.renderDiagram();
        this.cdr.detectChanges();
      });
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

      // CRITICAL FIX: Get the current interaction state (from last mousemove)
      // We rely on mousemove to have already updated hover states
      const interactionState = this.interactionHandler.getState();

      // Phase 3: Check for port click (highest priority)
      if (interactionState.hoveredPort) {
        event.preventDefault();
        console.log('🖱️ Port clicked:', interactionState.hoveredPort.side, interactionState.hoveredPort.id);
        this.interactionHandler.startConnection(interactionState.hoveredPort, worldX, worldY, this.engine);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Phase 3: Check for link click (for selection)
      if (interactionState.hoveredLink) {
        event.preventDefault();
        console.log('🖱️ Link clicked:', interactionState.hoveredLink.id);
        this.interactionHandler.selectLink(interactionState.hoveredLink, this.engine);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Check if clicking on a node
      const clickedNode = diagram.getNodeAtPosition(worldX, worldY);
      console.log('🖱️ Click at world coords:', { x: worldX.toFixed(1), y: worldY.toFixed(1) }, 'Node:', clickedNode?.getMetadata('label') || 'none');

      if (clickedNode) {
        event.preventDefault();

        // Handle selection
        if (event.ctrlKey || event.metaKey) {
          // Ctrl+Click: Toggle selection (multi-select)
          diagram.toggleNodeSelection(clickedNode);
        } else if (!clickedNode.isSelected()) {
          // Normal click on unselected node: Select only this node (clearing others)
          diagram.selectNode(clickedNode);
        }
        // If clicking an already-selected node without Ctrl: Keep all selections for multi-drag

        // Force immediate render to show selection highlight instantly
        this.renderDiagram();

        // Start drag if node is draggable
        // Allow dragging if clicked node is draggable (even if other selected nodes are locked)
        if (clickedNode.isDraggable() && clickedNode.isSelected()) {
          this.isDraggingNode = true;
          this.dragStartX = event.clientX;
          this.dragStartY = event.clientY;

          // Store initial positions of all selected nodes (only draggable ones)
          const selectedNodes = diagram.getSelectedNodes();
          this.draggedNodes.clear();
          selectedNodes.forEach((node) => {
            // Only include draggable nodes (skip locked nodes)
            if (node.isDraggable()) {
              this.draggedNodes.set(node.id, {
                startX: node.position.x,
                startY: node.position.y
              });
            }
          });

          // Change cursor
          if (this.containerRef?.nativeElement) {
            this.containerRef.nativeElement.style.cursor = 'move';
          }
        }
      } else {
        // Clicked on empty space - always clear selection
        diagram.clearSelection();
        // Force immediate render to clear selection highlights instantly
        this.renderDiagram();
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

      // CRITICAL: Recalculate link paths for dragged nodes
      // Links don't automatically update when nodes move, we must regenerate their paths
      this.recalculateLinkPathsForNodes(diagram, Array.from(this.draggedNodes.keys()));

      // Trigger re-render
      this.renderDiagram();
      this.cdr.markForCheck();
      return;
    }

    // Phase 3: Handle hover detection and connection drag
    if (!this.spaceKeyPressed) {
      // Convert client coordinates to world coordinates
      const rect = this.containerRef.nativeElement.getBoundingClientRect();
      const clientX = event.clientX - rect.left;
      const clientY = event.clientY - rect.top;

      const worldX = this.viewport.x + (clientX / this.zoom);
      const worldY = this.viewport.y + (clientY / this.zoom);

      // Handle hover detection (nodes, ports, links)
      let needsRender = this.interactionHandler.handleMouseMove(worldX, worldY, this.engine);

      // Handle connection drag update
      if (this.interactionHandler.getState().isConnecting) {
        needsRender = this.interactionHandler.handleConnectionDrag(worldX, worldY, this.engine) || needsRender;
      }

      // Update cursor based on interaction state
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = this.interactionHandler.getCursor(this.engine);
      }

      // CRITICAL FIX: Always re-render on mousemove to ensure port visibility updates
      // This is necessary because port visibility depends on hover state
      // and we need to show/hide ports as the user moves the mouse
      this.renderDiagram();
      this.cdr.markForCheck();
    }
  }

  /**
   * Handle mouse up to stop panning, node dragging, and connections (Phase 0.5 - Option B + Option 1 + Phase 3)
   */
  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (event.button === 1 || event.button === 0) {
      // Phase 3: Complete connection if in progress
      const interactionState = this.interactionHandler.getState();
      if (interactionState.isConnecting) {
        event.preventDefault();
        const success = this.interactionHandler.completeConnection(this.engine);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Phase 3: Complete link reconnection if in progress
      if (interactionState.isReconnectingLink) {
        event.preventDefault();
        const success = this.interactionHandler.completeLinkReconnection(this.engine);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

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
   * Recalculate link paths for specific nodes
   * Called during node drag to keep links connected to moving nodes
   */
  private recalculateLinkPathsForNodes(diagram: any, nodeIds: string[]): void {
    const links = diagram.getLinks();
    const allNodes = diagram.getNodes();

    links.forEach((link: any) => {
      // Find source and target nodes
      const sourceNode = allNodes.find((n: any) =>
        n.getPorts().some((p: any) => p.id === link.sourcePortId)
      );
      const targetNode = allNodes.find((n: any) =>
        n.getPorts().some((p: any) => p.id === link.targetPortId)
      );

      if (!sourceNode || !targetNode) {
        return;
      }

      // Check if this link is connected to any of the dragged nodes
      const isConnected = nodeIds.includes(sourceNode.id) || nodeIds.includes(targetNode.id);
      if (!isConnected) {
        return; // Skip links not connected to dragged nodes
      }

      // Find the actual port objects
      const sourcePort = sourceNode.getPorts().find((p: any) => p.id === link.sourcePortId);
      const targetPort = targetNode.getPorts().find((p: any) => p.id === link.targetPortId);

      if (!sourcePort || !targetPort) {
        return;
      }

      // Get node bounding boxes
      const sourceBounds = sourceNode.getBoundingBox();
      const targetBounds = targetNode.getBoundingBox();

      // Calculate absolute port positions
      const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
      const targetPoint = targetPort.getAbsolutePosition(targetBounds);

      // Regenerate the link path with new port positions
      link.generatePath(sourcePoint, targetPoint);
      link.markDirty(); // Force re-render
    });
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

    // Handle Delete key (Phase 3: Also delete links)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Don't delete if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Try deleting selected link first
      const linkDeleted = this.interactionHandler.deleteSelectedLink(this.engine);
      if (linkDeleted) {
        event.preventDefault();
        console.log('🗑️ Deleted selected link');
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Otherwise delete selected nodes
      const deletedCount = diagram.deleteSelected();
      if (deletedCount > 0) {
        event.preventDefault();
        console.log(`🗑️ Deleted ${deletedCount} selected node(s)`);
        this.renderDiagram();
        this.cdr.markForCheck();
      }
    }

    // Handle Escape key - cancel connection or clear selection (Phase 3)
    if (event.key === 'Escape') {
      // Cancel connection if in progress
      const interactionState = this.interactionHandler.getState();
      if (interactionState.isConnecting || interactionState.isReconnectingLink) {
        this.interactionHandler.cancelConnection(this.engine);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Otherwise clear selection
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
