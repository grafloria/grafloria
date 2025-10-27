/**
 * Angular Component Adapter
 *
 * Angular-specific implementation of ComponentAdapter interface.
 * Wraps ComponentRendererService to provide framework-agnostic API.
 *
 * Purpose:
 * - Decouple engine from Angular-specific APIs
 * - Enable React/Vue implementations to follow same pattern
 * - Provide unified API for component rendering across frameworks
 *
 * Pattern: Adapter Pattern (wraps ComponentRendererService)
 *
 * @example
 * ```typescript
 * // Register component
 * adapter.registerComponent('erd.table', ErdTableComponent);
 *
 * // Create instance
 * const node = new NodeModel({
 *   id: 'node-1',
 *   type: 'erd.table',
 *   position: { x: 100, y: 200 },
 *   data: { tableName: 'users', columns: [...] }
 * });
 *
 * const instance = adapter.createComponentInstance(node, viewContainerRef);
 *
 * // Update
 * node.data = { tableName: 'products', columns: [...] };
 * adapter.updateComponentInstance(instance, node);
 *
 * // Destroy
 * adapter.destroyComponentInstance(instance);
 * ```
 */

import { Injectable, Type, ViewContainerRef, ComponentRef } from '@angular/core';
import type { ComponentAdapter } from '@grafloria/engine';
import type { NodeModel } from '@grafloria/engine';
import { ComponentRendererService } from '../services/component-renderer.service';

/**
 * Angular implementation of ComponentAdapter interface
 *
 * Thin wrapper around ComponentRendererService that implements
 * framework-agnostic ComponentAdapter interface.
 */
@Injectable({ providedIn: 'root' })
export class AngularComponentAdapter implements ComponentAdapter {
  /**
   * Framework identifier
   */
  readonly framework = 'angular';

  /**
   * Map of component instance to node ID for updates/destroys
   * ComponentRef -> nodeId
   */
  private instanceToNodeId = new WeakMap<ComponentRef<any>, string>();

  constructor(private componentRenderer: ComponentRendererService) {}

  /**
   * Register Angular component for node type
   *
   * @param nodeType - Node type identifier (e.g., 'erd.table')
   * @param component - Angular component class
   */
  registerComponent(nodeType: string, component: Type<any>): void {
    this.componentRenderer.registerComponent(nodeType, component);
  }

  /**
   * Check if component is registered for node type
   *
   * @param nodeType - Node type identifier
   * @returns True if component registered
   */
  hasComponent(nodeType: string): boolean {
    return this.componentRenderer.hasComponent(nodeType);
  }

  /**
   * Get registered component class
   *
   * @param nodeType - Node type identifier
   * @returns Component class or undefined
   */
  getComponent(nodeType: string): Type<any> | undefined {
    const component = this.componentRenderer.getRegisteredComponent(nodeType);
    return component || undefined;
  }

  /**
   * Create Angular component instance for node
   *
   * Converts NodeModel to component inputs:
   * - Spreads node.data as inputs
   * - Passes positionX, positionY
   * - Passes nodeData (full node data object)
   *
   * @param node - NodeModel to render
   * @param container - ViewContainerRef to render into
   * @returns Angular ComponentRef
   * @throws Error if component not registered
   */
  createComponentInstance(node: NodeModel, container: ViewContainerRef): ComponentRef<any> {
    if (!container) {
      throw new Error('Container (ViewContainerRef) is required');
    }

    if (!node) {
      throw new Error('Node is required');
    }

    // Build inputs from node
    const inputs = this.nodeToInputs(node);

    // Render component using service
    const componentRef = this.componentRenderer.renderComponent(
      this.nodeToServiceNode(node),
      container,
      { inputs }
    );

    // Store mapping for updates/destroys
    this.instanceToNodeId.set(componentRef, node.id);

    return componentRef;
  }

  /**
   * Update component instance with new node data
   *
   * @param instance - Angular ComponentRef
   * @param node - Updated NodeModel
   */
  updateComponentInstance(instance: ComponentRef<any>, node: NodeModel): void {
    if (!instance) {
      return; // Gracefully handle null/undefined
    }

    const nodeId = this.instanceToNodeId.get(instance);
    if (!nodeId) {
      // Instance not tracked, can't update
      console.warn('Cannot update component instance: not tracked by adapter');
      return;
    }

    // Build updated inputs
    const inputs = this.nodeToInputs(node);

    // Update using service
    this.componentRenderer.updateComponent(nodeId, inputs);
  }

  /**
   * Destroy component instance
   *
   * @param instance - Angular ComponentRef
   */
  destroyComponentInstance(instance: ComponentRef<any>): void {
    if (!instance) {
      return; // Gracefully handle null/undefined
    }

    const nodeId = this.instanceToNodeId.get(instance);
    if (!nodeId) {
      // Instance not tracked, but still try to destroy
      // (in case it's managed by service directly)
      return;
    }

    // Destroy using service
    this.componentRenderer.destroyComponent(nodeId);

    // Clean up mapping
    this.instanceToNodeId.delete(instance);
  }

  /**
   * Get list of all registered node types
   *
   * @returns Array of registered node type strings
   */
  getRegisteredTypes(): string[] {
    // ComponentRendererService doesn't expose this directly,
    // so we need to track it or enhance the service
    // For now, we'll return empty array and enhance service later
    // TODO: Add getRegisteredTypes() to ComponentRendererService

    // Workaround: Use private registry accessor if available
    const service = this.componentRenderer as any;
    if (service.componentRegistry) {
      return Array.from(service.componentRegistry.keys());
    }

    return [];
  }

  /**
   * Destroy all component instances
   */
  destroyAll(): void {
    this.componentRenderer.destroyAll();
  }

  /**
   * Get count of active component instances
   */
  getActiveCount(): number {
    return this.componentRenderer.getActiveCount();
  }

  // Private helper methods

  /**
   * Convert NodeModel to component inputs
   *
   * Builds input object from node data and position
   */
  private nodeToInputs(node: NodeModel): Record<string, any> {
    return {
      // Spread node data as inputs
      ...(node.data || {}),

      // Add position as separate inputs
      positionX: node.position.x,
      positionY: node.position.y,

      // Add node data as separate input (for components that need full node)
      nodeData: node.data || {},

      // Add size if available
      ...(node.size ? { width: node.size.width, height: node.size.height } : {}),
    };
  }

  /**
   * Convert NodeModel to service DiagramNode
   *
   * ComponentRendererService expects DiagramNode interface
   */
  private nodeToServiceNode(node: NodeModel): any {
    return {
      id: node.id,
      type: node.type,
      getMetadata: () => node.data || {},
    };
  }
}
