/**
 * Component Adapter Interface
 *
 * Framework-agnostic interface for rendering framework components in diagram nodes.
 * This abstraction allows the core engine to work with any UI framework
 * (Angular, React, Vue, etc.) through a unified API.
 *
 * Pattern: Adapter Pattern
 * Purpose: Decouple engine from framework-specific component systems
 *
 * Implementation Guide:
 * - Interface lives in @grafloria/engine (framework-agnostic)
 * - Implementations live in framework packages (@grafloria/angular, @grafloria/adapter-react)
 * - Each adapter wraps its framework's component system
 *
 * @example
 * ```typescript
 * // Angular Implementation
 * class AngularComponentAdapter implements ComponentAdapter {
 *   readonly framework = 'angular';
 *
 *   registerComponent(nodeType: string, component: Type<any>): void {
 *     this.componentRenderer.registerComponent(nodeType, component);
 *   }
 *
 *   createComponentInstance(node: NodeModel, container: ViewContainerRef): ComponentRef<any> {
 *     return this.componentRenderer.renderComponent(node, container, {
 *       inputs: { ...node.data, positionX: node.position.x, positionY: node.position.y }
 *     });
 *   }
 *
 *   // ... other methods
 * }
 * ```
 *
 * @example
 * ```typescript
 * // React Implementation
 * class ReactComponentAdapter implements ComponentAdapter {
 *   readonly framework = 'react';
 *
 *   registerComponent(nodeType: string, component: React.ComponentType): void {
 *     this.registry.set(nodeType, component);
 *   }
 *
 *   createComponentInstance(node: NodeModel, container: HTMLElement): ReactInstance {
 *     const Component = this.registry.get(node.type);
 *     const root = ReactDOM.createRoot(container);
 *     root.render(<Component {...node.data} x={node.position.x} y={node.position.y} />);
 *     return { root, node };
 *   }
 *
 *   // ... other methods
 * }
 * ```
 */

import type { NodeModel } from '../models/NodeModel';

/**
 * Framework-agnostic component adapter interface
 *
 * Provides unified API for framework component systems
 */
export interface ComponentAdapter {
  /**
   * Framework identifier (e.g., 'angular', 'react', 'vue')
   * Used for debugging and framework detection
   *
   * @readonly
   */
  readonly framework: string;

  /**
   * Register a framework component for a specific node type
   *
   * Associates a component class/function with a node type string.
   * When nodes of this type are rendered, this component will be instantiated.
   *
   * @param nodeType - Node type identifier (e.g., 'erd.table', 'bpmn.task')
   * @param component - Framework component (Angular: Type<any>, React: ComponentType, etc.)
   *
   * @example
   * ```typescript
   * // Angular
   * adapter.registerComponent('erd.table', ErdTableComponent);
   *
   * // React
   * adapter.registerComponent('erd.table', ErdTableComponent);
   * ```
   */
  registerComponent(nodeType: string, component: any): void;

  /**
   * Check if a component is registered for a node type
   *
   * @param nodeType - Node type identifier
   * @returns True if component is registered
   *
   * @example
   * ```typescript
   * if (adapter.hasComponent('erd.table')) {
   *   console.log('ERD table component is registered');
   * }
   * ```
   */
  hasComponent(nodeType: string): boolean;

  /**
   * Get registered component class for a node type
   *
   * @param nodeType - Node type identifier
   * @returns Component class or undefined if not registered
   *
   * @example
   * ```typescript
   * const component = adapter.getComponent('erd.table');
   * if (component) {
   *   console.log('Found component:', component.name);
   * }
   * ```
   */
  getComponent(nodeType: string): any | undefined;

  /**
   * Create component instance for a diagram node
   *
   * Instantiates the registered component for the node's type and passes:
   * - Node data as inputs/props
   * - Node position (x, y)
   * - Node size (width, height) if available
   * - Any other node metadata
   *
   * @param node - NodeModel to render
   * @param container - Framework-specific container (ViewContainerRef, HTMLElement, etc.)
   * @returns Framework-specific component instance
   * @throws Error if component not registered for node type
   *
   * @example
   * ```typescript
   * const node = new NodeModel({
   *   id: 'node-1',
   *   type: 'erd.table',
   *   position: { x: 100, y: 200 },
   *   data: { tableName: 'users', columns: [...] }
   * });
   *
   * // Angular
   * const componentRef = adapter.createComponentInstance(node, viewContainerRef);
   *
   * // React
   * const reactInstance = adapter.createComponentInstance(node, divElement);
   * ```
   */
  createComponentInstance(node: NodeModel, container: any): any;

  /**
   * Update component instance with new node data
   *
   * Efficiently updates component inputs/props without recreating instance.
   * Should trigger framework change detection/re-render.
   *
   * @param instance - Framework-specific component instance
   * @param node - Updated NodeModel with new data
   *
   * @example
   * ```typescript
   * // Update node data
   * node.data = { tableName: 'products', columns: [...] };
   * node.setPosition(300, 400);
   *
   * // Update component to reflect changes
   * adapter.updateComponentInstance(componentInstance, node);
   * ```
   */
  updateComponentInstance(instance: any, node: NodeModel): void;

  /**
   * Destroy component instance and clean up resources
   *
   * Calls framework lifecycle hooks (ngOnDestroy, componentWillUnmount, etc.),
   * unsubscribes from events, and removes from DOM.
   *
   * Should be idempotent - safe to call multiple times.
   *
   * @param instance - Framework-specific component instance
   *
   * @example
   * ```typescript
   * adapter.destroyComponentInstance(componentInstance);
   * // Instance is cleaned up, memory released
   * ```
   */
  destroyComponentInstance(instance: any): void;

  /**
   * Get list of all registered node type identifiers
   *
   * Useful for:
   * - Component palette UI (show available components)
   * - Validation (check if node type has component)
   * - Debugging (inspect registered components)
   *
   * @returns Array of registered node type strings
   *
   * @example
   * ```typescript
   * const types = adapter.getRegisteredTypes();
   * console.log('Available components:', types);
   * // ['erd.table', 'bpmn.task', 'bpmn.gateway', ...]
   * ```
   */
  getRegisteredTypes(): string[];

  /**
   * Destroy all component instances (optional)
   *
   * Convenience method to clean up all managed components at once.
   * Useful when clearing diagram or unmounting renderer.
   *
   * @example
   * ```typescript
   * // Clean up on diagram clear
   * adapter.destroyAll?.();
   * ```
   */
  destroyAll?(): void;

  /**
   * Get count of active component instances (optional)
   *
   * Useful for:
   * - Debugging
   * - Performance monitoring
   * - Memory leak detection
   *
   * @returns Number of active component instances
   *
   * @example
   * ```typescript
   * console.log('Active components:', adapter.getActiveCount?.() ?? 0);
   * ```
   */
  getActiveCount?(): number;
}

/**
 * Type guard to check if an object implements ComponentAdapter
 *
 * @param obj - Object to check
 * @returns True if object implements ComponentAdapter interface
 *
 * @example
 * ```typescript
 * if (isComponentAdapter(obj)) {
 *   obj.registerComponent('test', TestComponent);
 * }
 * ```
 */
export function isComponentAdapter(obj: any): obj is ComponentAdapter {
  return (
    obj &&
    typeof obj.framework === 'string' &&
    typeof obj.registerComponent === 'function' &&
    typeof obj.hasComponent === 'function' &&
    typeof obj.getComponent === 'function' &&
    typeof obj.createComponentInstance === 'function' &&
    typeof obj.updateComponentInstance === 'function' &&
    typeof obj.destroyComponentInstance === 'function' &&
    typeof obj.getRegisteredTypes === 'function'
  );
}

/**
 * Metadata for component registration
 *
 * Optional metadata that can be associated with registered components
 */
export interface ComponentMetadata {
  /** Display name for component palette */
  displayName?: string;

  /** Category for grouping in palette (e.g., 'ERD', 'BPMN', 'Flowchart') */
  category?: string;

  /** Icon identifier for palette */
  icon?: string;

  /** Brief description of component */
  description?: string;

  /** Tags for search/filtering */
  tags?: string[];

  /** Default size for new nodes */
  defaultSize?: { width: number; height: number };

  /** Whether component can be resized */
  resizable?: boolean;

  /** Whether component supports ports */
  supportsPorts?: boolean;
}

/**
 * Extended adapter interface with metadata support
 *
 * Optional extension for adapters that support component metadata
 */
export interface ComponentAdapterWithMetadata extends ComponentAdapter {
  /**
   * Register component with metadata
   *
   * @param nodeType - Node type identifier
   * @param component - Framework component
   * @param metadata - Component metadata
   */
  registerComponentWithMetadata(
    nodeType: string,
    component: any,
    metadata: ComponentMetadata
  ): void;

  /**
   * Get metadata for registered component
   *
   * @param nodeType - Node type identifier
   * @returns Component metadata or undefined
   */
  getComponentMetadata(nodeType: string): ComponentMetadata | undefined;

  /**
   * Get all components with their metadata
   *
   * @returns Map of node type to metadata
   */
  getAllComponentMetadata(): Map<string, ComponentMetadata>;
}
