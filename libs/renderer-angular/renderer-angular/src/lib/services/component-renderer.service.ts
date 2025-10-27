import {
  ApplicationRef,
  ComponentRef,
  Injectable,
  Injector,
  OnChanges,
  SimpleChange,
  SimpleChanges,
  Type,
  ViewContainerRef,
} from '@angular/core';
import {
  ContainerIdGenerator,
  createForeignObject,
  type VNode,
} from '@grafloria/renderer';

/**
 * Options for rendering a component.
 */
export interface RenderComponentOptions {
  /** Initial input values */
  inputs?: Record<string, any>;

  /** Output event handlers */
  outputHandlers?: Record<string, (event: any) => void>;
}

/**
 * Component bounds for foreignObject.
 */
export interface ComponentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Component update for batch operations.
 */
export interface ComponentUpdate {
  nodeId: string;
  inputs: Record<string, any>;
}

/**
 * Mock DiagramNode interface (temporary - should come from @grafloria/engine)
 */
export interface DiagramNode {
  id: string;
  type: string;
  getMetadata?: () => Record<string, any>;
}

/**
 * Service for rendering Angular components inside SVG foreignObject elements.
 * Manages component lifecycle, inputs/outputs, and container management.
 *
 * @example
 * ```typescript
 * // Register a component
 * componentRenderer.registerComponent('ERD.TABLE', ErdTableComponent);
 *
 * // Render a component
 * const componentRef = componentRenderer.renderComponent(
 *   node,
 *   viewContainerRef,
 *   { inputs: { tableName: 'users', columns: [...] } }
 * );
 *
 * // Update component
 * componentRenderer.updateComponent(node.id, { tableName: 'products' });
 *
 * // Destroy component
 * componentRenderer.destroyComponent(node.id);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ComponentRendererService {
  private componentRegistry = new Map<string, Type<any>>();
  private componentInstances = new Map<string, ComponentRef<any>>();
  private containerMap = new Map<string, string>(); // nodeId → containerId

  constructor(
    private injector: Injector,
    private applicationRef: ApplicationRef
  ) {}

  /**
   * Register an Angular component for a node type.
   * Component will be rendered inside foreignObject when node is displayed.
   *
   * @param nodeType - Node type identifier (e.g., 'ERD.TABLE', 'BPMN.TASK')
   * @param component - Angular component class
   * @throws Error if type already registered
   *
   * @example
   * ```typescript
   * @Component({ selector: 'erd-table', template: '...' })
   * export class ErdTableComponent {
   *   @Input() tableName: string;
   *   @Input() columns: Column[];
   *   @Output() columnAdded = new EventEmitter<Column>();
   * }
   *
   * componentRenderer.registerComponent('ERD.TABLE', ErdTableComponent);
   * ```
   */
  registerComponent(nodeType: string, component: Type<any>): void {
    if (this.componentRegistry.has(nodeType)) {
      throw new Error(`Component for type '${nodeType}' is already registered`);
    }

    this.componentRegistry.set(nodeType, component);
  }

  /**
   * Check if component is registered for node type.
   *
   * @param nodeType - Node type identifier
   * @returns True if component registered
   */
  hasComponent(nodeType: string): boolean {
    return this.componentRegistry.has(nodeType);
  }

  /**
   * Get registered component class for node type.
   *
   * @param nodeType - Node type identifier
   * @returns Component class or null
   */
  getRegisteredComponent(nodeType: string): Type<any> | null {
    return this.componentRegistry.get(nodeType) || null;
  }

  /**
   * Render a component for a diagram node.
   * Creates component instance, passes inputs, subscribes to outputs.
   *
   * @param node - Diagram node
   * @param viewContainerRef - Angular ViewContainerRef to render into
   * @param options - Rendering options
   * @returns Component reference
   * @throws Error if component not registered or instantiation fails
   *
   * @example
   * ```typescript
   * const componentRef = componentRenderer.renderComponent(
   *   node,
   *   this.viewContainer,
   *   { inputs: { tableName: 'users', columns: [...] } }
   * );
   * ```
   */
  renderComponent(
    node: DiagramNode,
    viewContainerRef: ViewContainerRef,
    options?: RenderComponentOptions
  ): ComponentRef<any> {
    const componentClass = this.componentRegistry.get(node.type);

    if (!componentClass) {
      throw new Error(
        `No component registered for type '${node.type}'. Call registerComponent() first.`
      );
    }

    try {
      // Create component
      const componentRef = viewContainerRef.createComponent(componentClass, {
        injector: this.injector,
      });

      // Apply inputs
      if (options?.inputs) {
        this.applyInputs(componentRef, options.inputs);
      }

      // Subscribe to outputs
      if (options?.outputHandlers) {
        this.subscribeToOutputs(componentRef, node, options.outputHandlers);
      }

      // Store instance
      this.componentInstances.set(node.id, componentRef);

      // Generate container ID
      const containerId = ContainerIdGenerator.generate(node.id);
      this.containerMap.set(node.id, containerId);

      // Trigger change detection
      componentRef.changeDetectorRef.detectChanges();

      return componentRef;
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Component instantiation failed: ${errorMessage}`);
    }
  }

  /**
   * Update component inputs without recreating component.
   * More efficient than destroy + render.
   *
   * @param nodeId - Node ID
   * @param inputs - New input values
   * @throws Error if component not rendered
   *
   * @example
   * ```typescript
   * componentRenderer.updateComponent(node.id, {
   *   tableName: 'products',
   *   columns: [...]
   * });
   * ```
   */
  updateComponent(nodeId: string, inputs: Record<string, any>): void {
    const componentRef = this.componentInstances.get(nodeId);

    if (!componentRef) {
      throw new Error(
        `Component for node ${nodeId} not found. Call renderComponent() first.`
      );
    }

    // Calculate changes
    const changes = this.calculateInputChanges(componentRef, inputs);

    // Apply new inputs
    this.applyInputs(componentRef, inputs);

    // Trigger ngOnChanges if implemented
    if ('ngOnChanges' in componentRef.instance) {
      (componentRef.instance as OnChanges).ngOnChanges(changes);
    }

    // Trigger change detection
    componentRef.changeDetectorRef.detectChanges();
  }

  /**
   * Destroy a component and clean up resources.
   * Calls ngOnDestroy, unsubscribes, removes from DOM.
   *
   * @param nodeId - Node ID
   *
   * @example
   * ```typescript
   * componentRenderer.destroyComponent(node.id);
   * ```
   */
  destroyComponent(nodeId: string): void {
    const componentRef = this.componentInstances.get(nodeId);

    if (!componentRef) {
      return; // Already destroyed or never rendered
    }

    // Destroy component (calls ngOnDestroy)
    componentRef.destroy();

    // Clean up maps
    this.componentInstances.delete(nodeId);
    this.containerMap.delete(nodeId);
  }

  /**
   * Get component reference for a node.
   * Allows programmatic access to component instance.
   *
   * @param nodeId - Node ID
   * @returns Component reference or null
   *
   * @example
   * ```typescript
   * const componentRef = componentRenderer.getComponent(node.id);
   * if (componentRef) {
   *   const instance = componentRef.instance as ErdTableComponent;
   *   instance.refreshData();
   * }
   * ```
   */
  getComponent<T = any>(nodeId: string): ComponentRef<T> | null {
    return (this.componentInstances.get(nodeId) as ComponentRef<T>) || null;
  }

  /**
   * Get foreignObject container ID for a node.
   *
   * @param nodeId - Node ID
   * @returns Container ID or null
   */
  getContainerId(nodeId: string): string | null {
    return this.containerMap.get(nodeId) || null;
  }

  /**
   * Create foreignObject VNode for a component.
   * Used by rendering pipeline to embed component in SVG.
   *
   * @param node - Diagram node
   * @param bounds - Component bounds (x, y, width, height)
   * @returns VNode for foreignObject
   *
   * @example
   * ```typescript
   * const vnode = componentRenderer.createForeignObjectVNode(node, {
   *   x: 100,
   *   y: 100,
   *   width: 300,
   *   height: 200
   * });
   * ```
   */
  createForeignObjectVNode(
    node: DiagramNode,
    bounds: ComponentBounds
  ): VNode {
    const containerId =
      this.containerMap.get(node.id) || ContainerIdGenerator.generate(node.id);

    this.containerMap.set(node.id, containerId);

    return createForeignObject({
      nodeId: node.id,
      containerId,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      children: [
        {
          type: 'div',
          props: {
            id: containerId,
            class: 'diagram-component-container',
            style: {
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            },
          },
        },
      ],
    });
  }

  /**
   * Batch update multiple components.
   * More efficient than individual updates.
   *
   * @param updates - Array of node ID + inputs
   *
   * @example
   * ```typescript
   * componentRenderer.batchUpdate([
   *   { nodeId: 'node1', inputs: { tableName: 'users' } },
   *   { nodeId: 'node2', inputs: { tableName: 'products' } }
   * ]);
   * ```
   */
  batchUpdate(updates: ComponentUpdate[]): void {
    // Detach change detection for performance
    this.componentInstances.forEach((ref) => {
      ref.changeDetectorRef.detach();
    });

    // Apply all updates
    for (const update of updates) {
      const componentRef = this.componentInstances.get(update.nodeId);
      if (componentRef) {
        this.applyInputs(componentRef, update.inputs);
      }
    }

    // Reattach and detect changes once
    this.componentInstances.forEach((ref) => {
      ref.changeDetectorRef.reattach();
      ref.changeDetectorRef.detectChanges();
    });
  }

  /**
   * Destroy all components.
   * Called when diagram is cleared or component unmounted.
   */
  destroyAll(): void {
    for (const nodeId of Array.from(this.componentInstances.keys())) {
      this.destroyComponent(nodeId);
    }
  }

  /**
   * Get count of active component instances.
   * Useful for debugging and performance monitoring.
   */
  getActiveCount(): number {
    return this.componentInstances.size;
  }

  /**
   * Get list of all registered node types.
   * Useful for component palette UI and validation.
   *
   * @returns Array of registered node type strings
   *
   * @example
   * ```typescript
   * const types = componentRenderer.getRegisteredTypes();
   * console.log('Available components:', types);
   * // ['ERD.TABLE', 'BPMN.TASK', ...]
   * ```
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.componentRegistry.keys());
  }

  // Private helper methods

  /**
   * Apply inputs to component instance
   */
  private applyInputs(
    componentRef: ComponentRef<any>,
    inputs: Record<string, any>
  ): void {
    for (const [key, value] of Object.entries(inputs)) {
      if (key in componentRef.instance) {
        componentRef.instance[key] = value;
      } else {
        console.warn(
          `Input '${key}' does not exist on component ${componentRef.componentType.name}`
        );
      }
    }
  }

  /**
   * Subscribe to component outputs
   */
  private subscribeToOutputs(
    componentRef: ComponentRef<any>,
    node: DiagramNode,
    handlers: Record<string, (event: any) => void>
  ): void {
    for (const [outputName, handler] of Object.entries(handlers)) {
      const output = componentRef.instance[outputName];

      if (output && typeof output.subscribe === 'function') {
        const subscription = output.subscribe((event: any) => {
          handler(event);
        });

        // Store subscription for cleanup
        componentRef.onDestroy(() => subscription.unsubscribe());
      } else {
        console.warn(
          `Output '${outputName}' does not exist on component ${componentRef.componentType.name}`
        );
      }
    }
  }

  /**
   * Calculate input changes for ngOnChanges
   */
  private calculateInputChanges(
    componentRef: ComponentRef<any>,
    newInputs: Record<string, any>
  ): SimpleChanges {
    const changes: SimpleChanges = {};

    for (const [key, newValue] of Object.entries(newInputs)) {
      const previousValue = componentRef.instance[key];

      if (previousValue !== newValue) {
        changes[key] = new SimpleChange(previousValue, newValue, false);
      }
    }

    return changes;
  }
}
