import { Injectable, ComponentRef, ViewContainerRef, TemplateRef, createComponent, EnvironmentInjector, inject } from '@angular/core';
import { NodeModel, DiagramEngine } from '@grafloria/engine';
import { NodeToolbarComponent, ToolbarAction, ToolbarPosition, ToolbarAlignment, ToolbarBehaviorConfig, ToolbarStyleConfig } from './node-toolbar.component';

export interface ToolbarConfig {
  position?: ToolbarPosition;
  alignment?: ToolbarAlignment;
  actions?: ToolbarAction[];
  template?: TemplateRef<any>;
  offset?: number;
  canvasElement?: HTMLElement;
  viewport?: { x: number; y: number; width: number; height: number };
  zoom?: number;
  behavior?: ToolbarBehaviorConfig;
  style?: ToolbarStyleConfig;
}

/**
 * NodeToolbarService
 *
 * Manages the lifecycle of node toolbars in the diagram.
 * Provides methods to show, hide, and update toolbars programmatically.
 *
 * @example
 * ```typescript
 * constructor(private toolbarService: NodeToolbarService) {}
 *
 * ngOnInit() {
 *   this.toolbarService.setViewContainer(this.viewContainerRef);
 * }
 *
 * showToolbar(node: NodeModel) {
 *   this.toolbarService.show(node, this.engine, {
 *     position: 'top',
 *     actions: this.actions
 *   });
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NodeToolbarService {
  private toolbars = new Map<string, ComponentRef<NodeToolbarComponent>>();
  private viewContainerRef?: ViewContainerRef;
  private environmentInjector?: EnvironmentInjector;

  // Track viewport and zoom for all toolbars
  private globalViewport = { x: 0, y: 0, width: 800, height: 600 };
  private globalZoom = 1.0;
  private globalCanvasElement?: HTMLElement;

  /**
   * Set the view container for creating toolbars
   */
  setViewContainer(vcr: ViewContainerRef) {
    this.viewContainerRef = vcr;
  }

  /**
   * Set the environment injector for creating components
   */
  setEnvironmentInjector(injector: EnvironmentInjector) {
    this.environmentInjector = injector;
  }

  /**
   * Set global canvas element for all toolbars
   */
  setCanvasElement(element: HTMLElement) {
    this.globalCanvasElement = element;

    // Update all existing toolbars
    this.toolbars.forEach(toolbar => {
      toolbar.instance.canvasElement = element;
      toolbar.instance.updatePosition();
    });
  }

  /**
   * Set global viewport for all toolbars
   */
  setViewport(viewport: { x: number; y: number; width: number; height: number }) {
    this.globalViewport = viewport;

    // Update all existing toolbars
    this.toolbars.forEach(toolbar => {
      toolbar.instance.viewport = viewport;
      toolbar.instance.updatePosition();
    });
  }

  /**
   * Set global zoom for all toolbars
   */
  setZoom(zoom: number) {
    this.globalZoom = zoom;

    // Update all existing toolbars
    this.toolbars.forEach(toolbar => {
      toolbar.instance.zoom = zoom;
      toolbar.instance.updatePosition();
    });
  }

  /**
   * Show toolbar for a node
   */
  show(
    node: NodeModel,
    engine: DiagramEngine,
    config: ToolbarConfig = {}
  ): ComponentRef<NodeToolbarComponent> {
    if (!this.viewContainerRef) {
      throw new Error('ViewContainerRef not set. Call setViewContainer() first.');
    }

    // Remove existing toolbar for this node if any
    this.hide(node.id);

    // Create toolbar component
    const componentRef = this.viewContainerRef.createComponent(NodeToolbarComponent);

    // Configure toolbar
    componentRef.instance.node = node;
    componentRef.instance.engine = engine;
    componentRef.instance.position = config.position || 'top';
    componentRef.instance.alignment = config.alignment || 'center';
    componentRef.instance.actions = config.actions || [];
    componentRef.instance.customTemplate = config.template;
    componentRef.instance.offset = config.offset ?? 8;
    componentRef.instance.canvasElement = config.canvasElement || this.globalCanvasElement;
    componentRef.instance.viewport = config.viewport || this.globalViewport;
    componentRef.instance.zoom = config.zoom ?? this.globalZoom;
    if (config.style) {
      componentRef.instance.styleConfig = config.style;
    }
    if (config.behavior) {
      componentRef.instance.config = {
        ...(componentRef.instance.config || {}),
        behavior: config.behavior,
      };
    }

    // Store reference
    this.toolbars.set(node.id, componentRef);

    // Show toolbar
    componentRef.instance.show();

    return componentRef;
  }

  /**
   * Hide toolbar for a node
   */
  hide(nodeId: string) {
    const toolbar = this.toolbars.get(nodeId);
    if (toolbar) {
      toolbar.destroy();
      this.toolbars.delete(nodeId);
    }
  }

  /**
   * Hide all toolbars
   */
  hideAll() {
    this.toolbars.forEach(toolbar => toolbar.destroy());
    this.toolbars.clear();
  }

  /**
   * Get toolbar for a node
   */
  get(nodeId: string): ComponentRef<NodeToolbarComponent> | undefined {
    return this.toolbars.get(nodeId);
  }

  /**
   * Check if toolbar is shown for a node
   */
  isShown(nodeId: string): boolean {
    return this.toolbars.has(nodeId);
  }

  /**
   * Update toolbar position for a node
   */
  updatePosition(nodeId: string) {
    const toolbar = this.toolbars.get(nodeId);
    if (toolbar) {
      toolbar.instance.updatePosition();
    }
  }

  /**
   * Update positions for all toolbars
   */
  updateAllPositions() {
    this.toolbars.forEach(toolbar => toolbar.instance.updatePosition());
  }

  /**
   * Update toolbar configuration
   */
  updateConfig(nodeId: string, config: Partial<ToolbarConfig>) {
    const toolbar = this.toolbars.get(nodeId);
    if (toolbar) {
      if (config.position !== undefined) {
        toolbar.instance.position = config.position;
      }
      if (config.alignment !== undefined) {
        toolbar.instance.alignment = config.alignment;
      }
      if (config.actions !== undefined) {
        toolbar.instance.actions = config.actions;
      }
      if (config.template !== undefined) {
        toolbar.instance.customTemplate = config.template;
      }
      if (config.offset !== undefined) {
        toolbar.instance.offset = config.offset;
      }
      if (config.canvasElement !== undefined) {
        toolbar.instance.canvasElement = config.canvasElement;
      }
      if (config.viewport !== undefined) {
        toolbar.instance.viewport = config.viewport;
      }
      if (config.zoom !== undefined) {
        toolbar.instance.zoom = config.zoom;
      }

      toolbar.instance.updatePosition();
    }
  }

  /**
   * Get the number of active toolbars
   */
  getCount(): number {
    return this.toolbars.size;
  }

  /**
   * Get all toolbar component references
   */
  getAll(): ComponentRef<NodeToolbarComponent>[] {
    return Array.from(this.toolbars.values());
  }
}
