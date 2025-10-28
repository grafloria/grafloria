import {
  Component,
  ComponentRef,
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
  ViewContainerRef,
  createComponent,
  EnvironmentInjector,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DiagramEngine } from '@grafloria/engine';
import { PortModel, NodeModel } from '@grafloria/engine';
import { SVGRenderer, LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { VNodeRendererService } from '../services/vnode-renderer.service';
import { InteractionHandlerService } from '../services/interaction-handler.service';
import { ComponentRendererService } from '../services/component-renderer.service';
import { HandleRegistryService } from '../services/handle-registry.service';
import { HtmlNodeRendererDirective } from '../directives/html-node-renderer.directive';

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
  imports: [CommonModule, HtmlNodeRendererDirective],
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
   * Main container reference
   */
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  /**
   * SVG layer reference (Phase 1: Hybrid Rendering)
   */
  @ViewChild('svgLayer', { static: true }) svgLayerRef!: ElementRef<HTMLDivElement>;

  /**
   * HTML layer reference (Phase 1: Hybrid Rendering)
   */
  @ViewChild('htmlLayer', { static: true }) htmlLayerRef!: ElementRef<HTMLDivElement>;

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

  /**
   * HTML layer transform (Phase 1: Hybrid Rendering)
   * Synced with viewport to keep HTML nodes aligned with SVG
   */
  htmlLayerTransform = '';

  /**
   * HTML nodes to render (DECLARATIVE APPROACH - React Flow style)
   * Exposed as a public property for template binding
   */
  htmlNodes: any[] = [];

  /**
   * HTML node component instances (Phase 1: Hybrid Rendering)
   * DEPRECATED: No longer used - switched to declarative rendering
   * Maps node ID to Angular ComponentRef for lifecycle management
   */
  private htmlNodeComponents = new Map<string, ComponentRef<any>>();

  constructor(
    private vnodeRenderer: VNodeRendererService,
    private cdr: ChangeDetectorRef,
    private interactionHandler: InteractionHandlerService,
    private componentRenderer: ComponentRendererService,
    private environmentInjector: EnvironmentInjector,
    private handleRegistry: HandleRegistryService
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

      // CRITICAL FIX: Force change detection after initial render
      // With OnPush strategy, initial render won't show until an event occurs
      // This ensures nodes created before AfterViewInit are immediately visible
      this.cdr.detectChanges();
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
        useCSSMode: false, // Disabled to allow shape metadata stroke to take effect
      },
      this.theme
    );
  }

  /**
   * Update HTML layer transform to sync with viewport (Phase 1: Hybrid Rendering)
   * The HTML layer uses CSS transform to match the SVG viewport pan/zoom
   * This keeps HTML nodes visually aligned with SVG edges
   */
  private updateHTMLLayerTransform(): void {
    // Calculate transform: translate by negative viewport position scaled by zoom
    // This mirrors how React Flow syncs their HTML viewport with panning
    const translateX = -this.viewport.x * this.zoom;
    const translateY = -this.viewport.y * this.zoom;

    this.htmlLayerTransform = `translate(${translateX}px, ${translateY}px) scale(${this.zoom})`;
  }

  /**
   * Render HTML nodes to HTML layer (Phase 2: Hybrid Rendering)
   * This method renders nodes with metadata.useHTMLLayer = true as HTML elements
   * outside the SVG canvas, similar to React Flow's approach
   *
   * Component Lifecycle:
   * 1. Detect nodes marked for HTML layer (metadata.useHTMLLayer = true)
   * 2. Create new component instances for new nodes
   * 3. Update existing components for changed nodes
   * 4. Destroy components for removed nodes
   * 5. Position all components based on node.position (accounting for zoom)
   */
  /**
   * Update HTML nodes array for declarative rendering (React Flow pattern)
   * Phase 3: REFACTORED to use Angular's declarative rendering instead of imperative createComponent
   *
   * PERFORMANCE FIX: Only update array when nodes actually change (add/remove)
   * Don't recreate array on every render cycle (mousemove)
   */
  private renderHTMLNodes(): void {
    const diagram = this.engine?.getDiagram();
    if (!diagram) {
      if (this.htmlNodes.length > 0) {
        this.htmlNodes = [];
      }
      return;
    }

    // Get all nodes AND groups that should render in HTML layer
    const nodes = diagram.getNodes();
    const groups = diagram.getGroups();

    // Combine nodes and groups, filtering for HTML layer rendering
    const htmlNodeModels = nodes.filter(node => node.getMetadata('useHTMLLayer') === true);
    const htmlGroupModels = groups.filter(group => group.getMetadata('useHTMLLayer') === true);
    const newHtmlNodes = [...htmlNodeModels, ...htmlGroupModels];

    // CRITICAL FIX: Only update array if the set of HTML nodes has actually changed
    // Compare IDs to avoid unnecessary array reassignment that triggers full re-render
    const currentIds = this.htmlNodes.map(n => n.id).sort().join(',');
    const newIds = newHtmlNodes.map(n => n.id).sort().join(',');

    if (currentIds !== newIds) {
      this.htmlNodes = newHtmlNodes;
      console.log(`🔄 [HTMLLayer DECLARATIVE] HTML nodes changed:`, {
        totalNodes: nodes.length,
        totalGroups: groups.length,
        htmlNodeCount: this.htmlNodes.length,
        htmlNodeIds: this.htmlNodes.map(n => n.id),
        positions: this.htmlNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }))
      });
    }
    // If nodes haven't changed, keep existing array reference to prevent re-render

    // No need for imperative component management - Angular template handles it with @for
  }

  /**
   * Create a new HTML node component (Phase 2)
   */
  private createHTMLNode(node: any): void {
    console.log(`🏗️  [HTMLLayer] createHTMLNode called for:`, {
      nodeId: node.id,
      nodeType: node.type,
      hasHtmlLayerRef: !!this.htmlLayerRef,
      hasComponent: this.componentRenderer.hasComponent(node.type)
    });

    if (!this.htmlLayerRef || !this.componentRenderer.hasComponent(node.type)) {
      console.log(`⏭️  [HTMLLayer] Skipping node "${node.id}" - no htmlLayerRef or component not registered`);
      // Component not registered for this node type - skip silently
      // (This is expected for nodes that haven't been migrated to HTML layer yet)
      return;
    }

    try {
      // Get component class
      const componentClass = this.componentRenderer.getRegisteredComponent(node.type);
      if (!componentClass) {
        console.log(`❌ [HTMLLayer] No component class found for type "${node.type}"`);
        return;
      }

      console.log(`🔧 [HTMLLayer] Creating component instance for node "${node.id}"`);

      // CRITICAL FIX: Create component WITHOUT specifying hostElement
      // Let Angular create its own host element, then we append it
      const componentRef = createComponent(componentClass, {
        environmentInjector: this.environmentInjector,
        // Do NOT pass hostElement here - it causes component reuse issues
      });

      // Get the host element that Angular created
      const hostElement = componentRef.location.nativeElement as HTMLElement;

      // Set node ID attribute for handle detection
      hostElement.setAttribute('data-node-id', node.id);
      hostElement.style.position = 'absolute';

      console.log(`📝 [HTMLLayer] Set data-node-id="${node.id}" on host element`);

      // Set initial inputs (if component has them)
      if ('node' in componentRef.instance) {
        componentRef.instance.node = node;
        console.log(`📥 [HTMLLayer] Set node input on component instance`);
      }

      // Position the component
      this.updateHTMLNodePosition(node, componentRef);

      // Store component reference BEFORE appending
      this.htmlNodeComponents.set(node.id, componentRef);
      console.log(`💾 [HTMLLayer] Stored component in Map, size=${this.htmlNodeComponents.size}`);

      // Append to HTML layer - this is where it actually gets added to the DOM
      this.htmlLayerRef.nativeElement.appendChild(hostElement);
      console.log(`📌 [HTMLLayer] Appended component to HTML layer DOM`);

      // Trigger change detection
      componentRef.changeDetectorRef.detectChanges();

      console.log(`✅ [HTMLLayer] Created component for node "${node.id}" of type "${node.type}"`);
    } catch (error) {
      console.error(`❌ [HTMLLayer] Failed to create component for node "${node.id}":`, error);
    }
  }

  /**
   * Update HTML node component position (Phase 2)
   * Position is relative to HTML layer (which is already transformed)
   * so we just use node.position directly
   */
  private updateHTMLNodePosition(node: any, componentRef: ComponentRef<any>): void {
    const hostElement = componentRef.location.nativeElement as HTMLElement;
    const position = node.position || { x: 0, y: 0 };

    // Position is already in world coordinates, HTML layer transform handles zoom/pan
    hostElement.style.left = `${position.x}px`;
    hostElement.style.top = `${position.y}px`;

    console.log(`📍 [HTMLLayer] Updated position for node "${node.id}":`, {
      nodeId: node.id,
      nodeLabel: node.getMetadata?.('label') || node.type,
      position: `(${position.x}, ${position.y})`,
      appliedCSS: {
        left: hostElement.style.left,
        top: hostElement.style.top,
        position: hostElement.style.position
      },
      computedPosition: {
        left: hostElement.offsetLeft,
        top: hostElement.offsetTop
      }
    });
  }

  /**
   * Render diagram to DOM
   * Phase 1: Updated to support hybrid HTML+SVG rendering
   */
  private renderDiagram(): void {
    if (!this.renderer || !this.containerRef || this.destroyed) {
      return;
    }

    // Phase 1: Update HTML layer transform FIRST (before rendering)
    // This ensures HTML nodes stay in sync with viewport changes
    this.updateHTMLLayerTransform();

    // Calculate actual viewport dimensions based on canvas size and zoom
    const actualViewport = this.calculateActualViewport();

    // Generate VNode tree using SVGRenderer (edges, pure SVG nodes, ports)
    const vnode = this.renderer.render(actualViewport, this.zoom);

    // Render SVG content to svgLayer div (Phase 1: changed from containerRef)
    if (this.svgLayerRef) {
      this.vnodeRenderer.render(vnode, this.svgLayerRef.nativeElement);
    }

    // Phase 1: Render HTML nodes to htmlLayer div
    // This renders nodes with metadata.useHTMLLayer = true
    this.renderHTMLNodes();
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
        // Sync editor configs (handle colors, etc.) with engine config
        this.interactionHandler.syncWithEngineConfig(this.engine);
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
    diagram.on('node:changed', (node: NodeModel) => {
      console.log('[DiagramCanvas] node:changed event received for node:', node?.id);
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
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Phase 3: Check for HTML handle click (Phase 2 integration - HIGHEST PRIORITY)
      // HTML handles need to be checked before SVG ports
      console.log('🔍 [Phase 3 Debug] Checking for HTML handle at:', {
        clientX: event.clientX,
        clientY: event.clientY,
        zoom: this.zoom,
        handleStats: this.handleRegistry.getStats()
      });

      const htmlHandleHit = this.handleRegistry.getHandleAtPoint(event.clientX, event.clientY, this.zoom);

      console.log('🔍 [Phase 3 Debug] Handle detection result:', htmlHandleHit);

      if (htmlHandleHit) {
        event.preventDefault();
        console.log('🧪 [Phase 3] HTML Handle clicked:', {
          nodeId: htmlHandleHit.nodeId,
          handleId: htmlHandleHit.handleId,
          type: htmlHandleHit.handle.type,
          position: htmlHandleHit.handle.position
        });

        // Create a temporary PortModel to work with existing connection system
        const tempPort = this.createTempPortFromHandle(htmlHandleHit, worldX, worldY);
        if (tempPort) {
          this.interactionHandler.startConnection(tempPort, worldX, worldY, this.engine);
          this.renderDiagram();
          this.cdr.markForCheck();
        }
        return;
      }

      // CRITICAL FIX: Get the current interaction state (from last mousemove)
      // We rely on mousemove to have already updated hover states
      const interactionState = this.interactionHandler.getState();

      // Phase 3: Check for SVG port click
      if (interactionState.hoveredPort) {
        event.preventDefault();
        console.log('🖱️ Port clicked:', interactionState.hoveredPort.side, interactionState.hoveredPort.id);
        this.interactionHandler.startConnection(interactionState.hoveredPort, worldX, worldY, this.engine);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Phase 2.3b: Check for control point click (if control point editing enabled and link is selected)
      const config = this.engine.getInteractionConfig();
      if (config.enableControlPointEditing && interactionState.hoveredLink && interactionState.hoveredLink.state === 'selected') {
        // Check if clicking on a control point handle
        const controlPointHit = this.interactionHandler.hitTestControlPoint(worldX, worldY, interactionState.hoveredLink);

        if (controlPointHit) {
          event.preventDefault();
          console.log('🟢 Control point handle clicked:', controlPointHit.controlType, 'of segment', controlPointHit.segmentIndex, 'on link', interactionState.hoveredLink.id);
          this.interactionHandler.startControlPointDrag(controlPointHit.segmentIndex, controlPointHit.controlType, interactionState.hoveredLink);
          this.cdr.markForCheck();
          return;
        }
      }

      // Phase 2.3a: Check for waypoint click (if waypoint editing enabled and link is selected)
      if (config.enableWaypointEditing && interactionState.hoveredLink && interactionState.hoveredLink.state === 'selected') {
        // Check if clicking on a waypoint handle
        const waypointIndex = this.interactionHandler.hitTestWaypoint(worldX, worldY, interactionState.hoveredLink);

        if (waypointIndex !== null) {
          event.preventDefault();
          console.log('🔵 Waypoint handle clicked:', waypointIndex, 'on link', interactionState.hoveredLink.id);
          this.interactionHandler.startWaypointDrag(waypointIndex, interactionState.hoveredLink);
          this.cdr.markForCheck();
          return;
        }

        // Check if clicking on link path (to add waypoint)
        const hitPath = this.interactionHandler.hitTestPath(worldX, worldY, interactionState.hoveredLink);
        if (hitPath) {
          event.preventDefault();
          console.log('🟢 Link path clicked, adding waypoint on link', interactionState.hoveredLink.id);
          const added = this.interactionHandler.addWaypoint(worldX, worldY, interactionState.hoveredLink);
          if (added) {
            this.renderDiagram();
            this.cdr.markForCheck();
          }
          return;
        }
      }

      // Phase 3: Check for link click (for selection)
      // FIXED: Use direct hit testing if hover state not available (e.g., on initial load)
      let linkToSelect = interactionState.hoveredLink;
      if (!linkToSelect) {
        linkToSelect = this.interactionHandler.getLinkAtPosition(worldX, worldY, this.engine);
      }

      if (linkToSelect) {
        event.preventDefault();
        const multiSelect = event.ctrlKey || event.metaKey;
        console.log('🖱️ Link clicked:', linkToSelect.id, multiSelect ? '(multi-select)' : '');
        this.interactionHandler.selectLink(linkToSelect, this.engine, multiSelect);
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
        // Clicked on empty space - always clear all selections
        diagram.clearSelection();

        // Also deselect all links
        diagram.getLinks().forEach((link: any) => {
          if (link.state === 'selected') {
            link.setState('default');
          }
        });

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

    // Phase 2.3b: Handle control point dragging
    const interactionState = this.interactionHandler.getState();
    if (interactionState.isDraggingControlPoint) {
      // Convert to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Move control point to new position
      const moved = this.interactionHandler.moveControlPoint(worldX, worldY, this.engine);
      if (moved) {
        this.renderDiagram();
        this.cdr.markForCheck();
      }
      return;
    }

    // Phase 2.3a: Handle waypoint dragging
    if (interactionState.isDraggingWaypoint) {
      // Convert to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Move waypoint to new position
      const moved = this.interactionHandler.moveWaypoint(worldX, worldY, this.engine);
      if (moved) {
        this.renderDiagram();
        this.cdr.markForCheck();
      }
      return;
    }

    // Phase 3: Handle hover detection and connection drag
    if (!this.spaceKeyPressed) {
      // Convert client coordinates to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Handle hover detection (nodes, ports, links)
      let needsRender = this.interactionHandler.handleMouseMove(worldX, worldY, this.engine);

      // Handle connection drag update
      if (this.interactionHandler.getState().isConnecting) {
        needsRender = this.interactionHandler.handleConnectionDrag(worldX, worldY, this.engine) || needsRender;
      }

      // Phase 2.3a: Update hovered waypoint for Delete key support
      const config = this.engine.getInteractionConfig();
      if (config.enableWaypointEditing) {
        const state = this.interactionHandler.getState();
        // Only track waypoint hover on selected links
        const selectedLink = state.hoveredLink && state.hoveredLink.state === 'selected' ? state.hoveredLink : null;
        this.interactionHandler.updateHoveredWaypoint(worldX, worldY, selectedLink);
      }

      // Phase 2.3b: Update hovered control point for Delete key support
      if (config.enableControlPointEditing) {
        const state = this.interactionHandler.getState();
        // Only track control point hover on selected links with segments
        const selectedLink = state.hoveredLink && state.hoveredLink.state === 'selected' ? state.hoveredLink : null;
        this.interactionHandler.updateHoveredControlPoint(worldX, worldY, selectedLink);
      }

      // Update cursor based on interaction state
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = this.interactionHandler.getCursor(this.engine);
      }

      // PERFORMANCE FIX: Only re-render if something actually changed
      // Previously we re-rendered on EVERY mousemove which was very expensive
      if (needsRender) {
        this.renderDiagram();
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Handle mouse up to stop panning, node dragging, and connections (Phase 0.5 - Option B + Option 1 + Phase 3)
   */
  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (event.button === 1 || event.button === 0) {
      // Phase 2.3b: End control point drag if in progress
      const interactionState = this.interactionHandler.getState();
      if (interactionState.isDraggingControlPoint) {
        event.preventDefault();
        this.interactionHandler.endControlPointDrag();
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Phase 2.3a: End waypoint drag if in progress
      if (interactionState.isDraggingWaypoint) {
        event.preventDefault();
        this.interactionHandler.endWaypointDrag();
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Phase 3: Complete connection if in progress
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

      // Get port directions for orthogonal routing
      const sourceDirection = sourcePort.alignment?.side;
      const targetDirection = targetPort.alignment?.side;

      // Regenerate the link path with new port positions and directions
      link.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);
      link.markDirty(); // Force re-render
    });
  }

  /**
   * CRITICAL FIX: Convert client coordinates to world coordinates
   * This must match the viewBox calculation in SVGRenderer which zooms around viewport center
   */
  private clientToWorld(clientX: number, clientY: number): { worldX: number; worldY: number } {
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    // SVGRenderer zooms around the viewport center, so we must calculate viewBox the same way
    const centerX = this.viewport.x + this.viewport.width / 2;
    const centerY = this.viewport.y + this.viewport.height / 2;

    const viewBoxWidth = this.viewport.width / this.zoom;
    const viewBoxHeight = this.viewport.height / this.zoom;
    const viewBoxX = centerX - viewBoxWidth / 2;
    const viewBoxY = centerY - viewBoxHeight / 2;

    // Convert local canvas coordinates to world coordinates using viewBox
    const worldX = viewBoxX + (localX / this.zoom);
    const worldY = viewBoxY + (localY / this.zoom);

    return { worldX, worldY };
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

    // Handle Delete key (Phase 3: Also delete links, Phase 2.3a: Also delete waypoints)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Don't delete if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Phase 2.3a: Try deleting hovered waypoint first (highest priority)
      const config = this.engine.getInteractionConfig();
      if (config.enableWaypointEditing) {
        const waypointDeleted = this.interactionHandler.deleteHoveredWaypoint();
        if (waypointDeleted) {
          event.preventDefault();
          console.log('🗑️ Deleted waypoint');
          this.renderDiagram();
          this.cdr.markForCheck();
          return;
        }
      }

      // Try deleting selected link
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
   * Create a temporary PortModel from an HTML handle (Phase 3)
   * This allows HTML handles to work with the existing connection system
   */
  private createTempPortFromHandle(
    htmlHandleHit: { nodeId: string; handleId: string; handle: any },
    worldX: number,
    worldY: number
  ): PortModel | null {
    const diagram = this.engine?.getDiagram();
    if (!diagram) return null;

    // Get the node that owns this handle
    const node = diagram.getNode(htmlHandleHit.nodeId);
    if (!node) {
      console.error(`❌ [Phase 3] Node not found: ${htmlHandleHit.nodeId}`);
      return null;
    }

    // Check if node already has a port for this handle
    // HTML handles map to virtual ports on the node
    const portId = `html-port-${htmlHandleHit.handleId}`;
    let port = node.getPort(portId);

    if (!port) {
      // Create a new virtual port for this HTML handle
      // Map handle type to port type
      const portType = htmlHandleHit.handle.type === 'source' ? 'output' : 'input';

      // Map handle position to port side
      const portSide = htmlHandleHit.handle.position; // 'top' | 'right' | 'bottom' | 'left'

      port = new PortModel({
        id: portId,
        type: portType,
        side: portSide,
      });

      // Add port to node
      node.addPort(port);

      console.log(`✅ [Phase 3] Created virtual port for HTML handle:`, {
        portId,
        type: portType,
        side: portSide,
        nodeId: node.id
      });
    }

    return port;
  }

  /**
   * Get absolute X position for a node (including parent offset)
   * Walks up the parent chain to calculate world coordinates
   */
  getAbsoluteX(node: any): number {
    let x = node.position.x;
    let currentNode = node;
    const diagram = this.engine?.getDiagram();

    // Walk up parent chain
    // FIXED: Use parentId instead of parent (NodeModel uses parentId property)
    while (currentNode.parentId && diagram) {
      const parentNode = diagram.getNode(currentNode.parentId);
      if (parentNode) {
        x += parentNode.position.x;
        currentNode = parentNode;
      } else {
        break;
      }
    }

    return x;
  }

  /**
   * Get absolute Y position for a node (including parent offset)
   * Walks up the parent chain to calculate world coordinates
   */
  getAbsoluteY(node: any): number {
    let y = node.position.y;
    let currentNode = node;
    const diagram = this.engine?.getDiagram();

    // Walk up parent chain
    // FIXED: Use parentId instead of parent (NodeModel uses parentId property)
    while (currentNode.parentId && diagram) {
      const parentNode = diagram.getNode(currentNode.parentId);
      if (parentNode) {
        y += parentNode.position.y;
        currentNode = parentNode;
      } else {
        break;
      }
    }

    return y;
  }

  /**
   * Cleanup resources
   * Phase 2: Also destroy HTML node components
   */
  private cleanup(): void {
    // Destroy all HTML node components
    for (const [nodeId, componentRef] of this.htmlNodeComponents.entries()) {
      console.log(`🗑️  [HTMLLayer] Destroying component for node "${nodeId}" (cleanup)`);
      componentRef.destroy();
    }
    this.htmlNodeComponents.clear();

    // Dispose SVG renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = undefined;
    }
  }
}
