// LemonadeJS Enhanced Renderer (Phase 3.4 - Complete)
// Full LemonadeJS integration with two-way binding and reactivity

import * as lemonade from 'lemonadejs';
import type { EventBus } from '../events/EventBus';
import type { HtmlConfig } from '../templates/NodeTemplate';
import type { NodeModel } from '../models/NodeModel';

/**
 * LemonadeJS render result with DOM element
 */
export interface LemonadeRenderResult {
  /**
   * Rendering mode used
   */
  mode: 'template' | 'component';

  /**
   * Rendered DOM element (LemonadeJS element)
   */
  element?: HTMLElement;

  /**
   * Rendered HTML string (for compatibility)
   */
  html?: string;

  /**
   * Component reference (for component mode)
   */
  componentRef?: string;

  /**
   * CSS class names
   */
  className?: string;

  /**
   * Inline styles
   */
  style?: Record<string, any>;

  /**
   * Event handlers bound to EventBus
   */
  eventHandlers: Record<string, (event: any) => void>;

  /**
   * Data bindings (reactive with LemonadeJS)
   */
  bindings: Record<string, any>;

  /**
   * LemonadeJS self object (for reactivity)
   */
  self?: any;

  /**
   * Z-index for HTML layer
   */
  zIndex?: number;

  /**
   * Pointer events enabled
   */
  pointerEvents: boolean;

  /**
   * Node ID
   */
  nodeId: string;

  /**
   * Node UUID
   */
  nodeUuid: string;
}

/**
 * LemonadeJS Enhanced Renderer
 * Phase 3.4 Complete: Full LemonadeJS runtime with two-way binding
 *
 * Features:
 * - Real LemonadeJS template rendering
 * - Two-way data binding (:bind)
 * - Reactive updates (automatic re-rendering on data changes)
 * - Event handlers (:click, :change, etc.)
 * - EventBus integration (all events flow through engine)
 * - Component mode support
 */
export class LemonadeJSRenderer {
  /**
   * Track rendered elements by node UUID for cleanup
   */
  private renderedElements = new Map<string, HTMLElement>();

  /**
   * Track LemonadeJS self objects by node UUID for cleanup
   */
  private selfObjects = new Map<string, any>();

  /**
   * Track event handlers by node UUID for cleanup
   */
  private eventHandlers = new Map<string, Record<string, (event: any) => void>>();

  /**
   * Track EventBus subscriptions by node UUID for cleanup
   */
  private eventSubscriptions = new Map<string, Array<() => void>>();

  constructor(private eventBus: EventBus) {}

  /**
   * Render HTML configuration to LemonadeJS element
   * @param config - HTML configuration from template
   * @param node - Node model with data
   * @returns Render result with LemonadeJS element
   */
  render(config: HtmlConfig, node: NodeModel): LemonadeRenderResult {
    // Clean up any existing resources for this node before re-rendering
    this.disposeNode(node.uuid);

    const mode = this.determineMode(config);

    const result: LemonadeRenderResult = {
      mode,
      eventHandlers: {},
      bindings: {},
      pointerEvents: config.pointerEvents !== false,
      zIndex: config.zIndex,
      className: this.buildClassName(config.className),
      style: config.style,
      nodeId: node.id,
      nodeUuid: node.uuid,
    };

    if (mode === 'component') {
      return this.renderComponentMode(config, result);
    } else {
      return this.renderTemplateMode(config, node, result);
    }
  }

  /**
   * Determine rendering mode from config
   */
  private determineMode(config: HtmlConfig): 'template' | 'component' {
    if (config.mode) {
      return config.mode;
    }

    if (config.template) {
      return 'template';
    }

    if (config.component) {
      return 'component';
    }

    throw new Error('HtmlConfig must specify either template or component');
  }

  /**
   * Render component mode (pass-through)
   */
  private renderComponentMode(
    config: HtmlConfig,
    result: LemonadeRenderResult
  ): LemonadeRenderResult {
    if (!config.component) {
      throw new Error('Component mode requires component property');
    }

    result.componentRef = config.component;
    return result;
  }

  /**
   * Render template mode with LemonadeJS
   */
  private renderTemplateMode(
    config: HtmlConfig,
    node: NodeModel,
    result: LemonadeRenderResult
  ): LemonadeRenderResult {
    if (!config.template) {
      throw new Error('Template mode requires template property');
    }

    // Create LemonadeJS self object with node data
    result.self = this.createSelfObject(node, config, result);

    // Create event handlers
    if (config.events) {
      result.eventHandlers = this.createEventHandlers(config.events, node);
    }

    // Resolve bindings
    result.bindings = this.resolveBindings(config, node);

    try {
      // Create LemonadeJS element with reactive data
      // Event handlers are attached via self object methods
      result.element = lemonade.element(config.template, result.self);

      // Apply additional styles/classes to the element
      if (result.element) {
        this.applyStyles(result.element, result);
      }

      // Get HTML string for compatibility
      result.html = result.element?.outerHTML;
    } catch (error) {
      // Emit error event through EventBus
      this.eventBus.emit('renderer:error', {
        nodeId: node.id,
        nodeUuid: node.uuid,
        error,
        message: 'LemonadeJS rendering error',
        phase: 'template-rendering',
      });

      // Fallback to simple rendering
      result.html = this.fallbackRender(config.template, result.bindings);
    }

    // Track created resources for cleanup
    if (result.element) {
      this.renderedElements.set(node.uuid, result.element);
    }
    if (result.self) {
      this.selfObjects.set(node.uuid, result.self);
    }
    if (Object.keys(result.eventHandlers).length > 0) {
      this.eventHandlers.set(node.uuid, result.eventHandlers);
    }

    return result;
  }

  /**
   * Create LemonadeJS self object with reactive data
   */
  private createSelfObject(
    node: NodeModel,
    config: HtmlConfig,
    result: LemonadeRenderResult
  ): any {
    const self: any = {
      // Node data (reactive)
      data: node.data || {},
      nodeId: node.id,
      nodeUuid: node.uuid,

      // Custom bindings
      ...(config.bindings ? this.resolveCustomBindings(config.bindings, node) : {}),
    };

    // Add event handler methods
    if (config.events) {
      Object.entries(config.events).forEach(([domEvent, engineEvent]) => {
        // Create method name from event (e.g., 'click' -> 'onClick')
        const methodName = `on${domEvent.charAt(0).toUpperCase()}${domEvent.slice(1)}`;

        self[methodName] = (e: any) => {
          // Emit to EventBus
          this.eventBus.emit(engineEvent, {
            nodeId: node.id,
            nodeUuid: node.uuid,
            nodeData: node.data,
            event: e,
            domEventType: domEvent,
          });
        };
      });
    }

    return self;
  }

  /**
   * Resolve custom bindings from config
   */
  private resolveCustomBindings(
    bindings: Record<string, string>,
    node: NodeModel
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, path] of Object.entries(bindings)) {
      resolved[key] = this.getValueByPath(node, path);
    }

    return resolved;
  }

  /**
   * Create event handlers that emit to EventBus
   */
  private createEventHandlers(
    events: Record<string, string>,
    node: NodeModel
  ): Record<string, (event: any) => void> {
    const handlers: Record<string, (event: any) => void> = {};

    for (const [domEvent, engineEvent] of Object.entries(events)) {
      handlers[domEvent] = (event: any) => {
        this.eventBus.emit(engineEvent, {
          nodeId: node.id,
          nodeUuid: node.uuid,
          nodeData: node.data,
          event,
          domEventType: domEvent,
        });
      };
    }

    return handlers;
  }

  /**
   * Resolve data bindings from node
   */
  private resolveBindings(config: HtmlConfig, node: NodeModel): Record<string, any> {
    const bindings: Record<string, any> = {
      data: node.data || {},
      nodeId: node.id,
      nodeUuid: node.uuid,
    };

    if (config.bindings) {
      for (const [key, path] of Object.entries(config.bindings)) {
        bindings[key] = this.getValueByPath(node, path);
      }
    }

    return bindings;
  }

  /**
   * Get value from node by path
   */
  private getValueByPath(node: NodeModel, path: string): any {
    const parts = path.split('.');
    let value: any = node;

    for (const part of parts) {
      if (value == null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Apply styles and classes to rendered element
   */
  private applyStyles(element: HTMLElement, result: LemonadeRenderResult): void {
    // Apply className
    if (result.className) {
      element.className = result.className;
    }

    // Apply inline styles
    if (result.style) {
      Object.entries(result.style).forEach(([key, value]) => {
        const cssKey = this.camelToKebab(key);
        element.style.setProperty(cssKey, String(value));
      });
    }

    // Apply z-index
    if (result.zIndex !== undefined) {
      element.style.zIndex = String(result.zIndex);
    }

    // Apply pointer events
    if (result.pointerEvents === false) {
      element.style.pointerEvents = 'none';
    }
  }

  /**
   * Fallback rendering (simple string replacement)
   */
  private fallbackRender(template: string, bindings: Record<string, any>): string {
    let html = template;

    // Simple {{variable}} replacement
    html = html.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const value = this.evaluateExpression(expression.trim(), bindings);
      return value != null ? String(value) : '';
    });

    return html;
  }

  /**
   * Evaluate expression in binding context
   */
  private evaluateExpression(expression: string, bindings: Record<string, any>): any {
    try {
      const parts = expression.split('.');
      let value: any = bindings;

      for (const part of parts) {
        if (value == null) {
          return undefined;
        }
        value = value[part];
      }

      return value;
    } catch (error) {
      // Emit warning event through EventBus
      this.eventBus.emit('renderer:warning', {
        message: 'Failed to evaluate expression',
        expression,
        error,
        phase: 'expression-evaluation',
      });
      return undefined;
    }
  }

  /**
   * Build className string
   */
  private buildClassName(className?: string | string[]): string | undefined {
    if (!className) {
      return undefined;
    }

    if (Array.isArray(className)) {
      return className.join(' ');
    }

    return className;
  }

  /**
   * Convert camelCase to kebab-case
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Dispose resources for a specific node
   * @param nodeUuid - UUID of node to clean up
   */
  disposeNode(nodeUuid: string): void {
    // Remove DOM element if it's still in the document
    const element = this.renderedElements.get(nodeUuid);
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
    this.renderedElements.delete(nodeUuid);

    // Clean up LemonadeJS self object
    const self = this.selfObjects.get(nodeUuid);
    if (self) {
      // If LemonadeJS provides a destroy method, call it
      if (typeof self.destroy === 'function') {
        self.destroy();
      }
      // Clear all reactive properties
      Object.keys(self).forEach((key) => {
        delete self[key];
      });
    }
    this.selfObjects.delete(nodeUuid);

    // Remove event handlers
    const handlers = this.eventHandlers.get(nodeUuid);
    if (handlers) {
      // Event handlers will be garbage collected when references are removed
      Object.keys(handlers).forEach((key) => {
        delete handlers[key];
      });
    }
    this.eventHandlers.delete(nodeUuid);

    // Clean up EventBus subscriptions
    const subscriptions = this.eventSubscriptions.get(nodeUuid);
    if (subscriptions) {
      subscriptions.forEach((unsubscribe) => unsubscribe());
    }
    this.eventSubscriptions.delete(nodeUuid);
  }

  /**
   * Cleanup all renderer resources
   */
  dispose(): void {
    // Dispose all tracked nodes
    const nodeUuids = Array.from(this.renderedElements.keys());
    nodeUuids.forEach((uuid) => this.disposeNode(uuid));

    // Clear all tracking maps
    this.renderedElements.clear();
    this.selfObjects.clear();
    this.eventHandlers.clear();
    this.eventSubscriptions.clear();
  }
}
