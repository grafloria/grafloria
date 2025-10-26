// HTML Template Renderer (Phase 3.4)
// Renders LemonadeJS templates with EventBus integration

import type { EventBus } from '../events/EventBus';
import type { HtmlConfig } from '../templates/NodeTemplate';
import type { NodeModel } from '../models/NodeModel';

/**
 * Render result containing rendered HTML and metadata
 */
export interface RenderResult {
  /**
   * Rendering mode used
   */
  mode: 'template' | 'component';

  /**
   * Rendered HTML string (for template mode)
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
   * Maps event names to handler functions
   */
  eventHandlers: Record<string, (event: any) => void>;

  /**
   * Data bindings resolved from node data
   */
  bindings: Record<string, any>;

  /**
   * Z-index for HTML layer
   */
  zIndex?: number;

  /**
   * Pointer events enabled
   */
  pointerEvents: boolean;

  /**
   * Node ID (for event context)
   */
  nodeId: string;

  /**
   * Node UUID (for event context)
   */
  nodeUuid: string;
}

/**
 * HTML Template Renderer
 * Phase 3.4: Framework-agnostic HTML template rendering with EventBus integration
 *
 * Features:
 * - LemonadeJS template rendering
 * - Data binding from NodeModel.data
 * - Event handlers connected to EventBus
 * - Component mode support (pass-through for framework-specific rendering)
 * - Proper resource cleanup to prevent memory leaks
 */
export class HtmlTemplateRenderer {
  /**
   * Track event handlers by node UUID for cleanup
   */
  private eventHandlers = new Map<string, Record<string, (event: any) => void>>();

  /**
   * Track rendered results by node UUID for cleanup
   */
  private renderResults = new Map<string, RenderResult>();

  constructor(private eventBus: EventBus) {}

  /**
   * Render HTML configuration to result
   * @param config - HTML configuration from template
   * @param node - Node model with data
   * @returns Render result with HTML, bindings, and event handlers
   */
  render(config: HtmlConfig, node: NodeModel): RenderResult {
    // Clean up any existing resources for this node before re-rendering
    this.disposeNode(node.uuid);

    // Determine rendering mode
    const mode = this.determineMode(config);

    // Common result properties
    const result: RenderResult = {
      mode,
      eventHandlers: {},
      bindings: {},
      pointerEvents: config.pointerEvents !== false, // Default true
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
    // Explicit mode
    if (config.mode) {
      return config.mode;
    }

    // Infer from config
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
  private renderComponentMode(config: HtmlConfig, result: RenderResult): RenderResult {
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
    result: RenderResult
  ): RenderResult {
    if (!config.template) {
      throw new Error('Template mode requires template property');
    }

    // Resolve data bindings
    result.bindings = this.resolveBindings(config, node);

    // Create event handlers
    if (config.events) {
      result.eventHandlers = this.createEventHandlers(config.events, node);
    }

    // Render template with bindings
    result.html = this.renderTemplate(config.template, result.bindings, result);

    // Track created resources for cleanup
    this.renderResults.set(node.uuid, result);
    if (Object.keys(result.eventHandlers).length > 0) {
      this.eventHandlers.set(node.uuid, result.eventHandlers);
    }

    return result;
  }

  /**
   * Resolve data bindings from node data
   */
  private resolveBindings(config: HtmlConfig, node: NodeModel): Record<string, any> {
    const bindings: Record<string, any> = {};

    // Auto-bind: Make node data available directly
    bindings['data'] = node.data || {};
    bindings['nodeId'] = node.id;
    bindings['nodeUuid'] = node.uuid;

    // Custom bindings from config
    if (config.bindings) {
      for (const [key, path] of Object.entries(config.bindings)) {
        bindings[key] = this.getValueByPath(node, path);
      }
    }

    return bindings;
  }

  /**
   * Get value from node by path (e.g., 'data.user.name')
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
   * Create event handlers that emit to EventBus
   */
  private createEventHandlers(
    events: Record<string, string>,
    node: NodeModel
  ): Record<string, (event: any) => void> {
    const handlers: Record<string, (event: any) => void> = {};

    for (const [domEvent, engineEvent] of Object.entries(events)) {
      handlers[domEvent] = (event: any) => {
        // Emit to EventBus with node context
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
   * Render template with bindings (simplified LemonadeJS-style)
   * In production, this would use actual LemonadeJS library
   *
   * Phase 3.4: Simple template rendering for testing
   * Real implementation will use LemonadeJS when package is available
   */
  private renderTemplate(
    template: string,
    bindings: Record<string, any>,
    result: RenderResult
  ): string {
    let html = template;

    // Simple {{variable}} replacement
    html = html.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const value = this.evaluateExpression(expression.trim(), bindings);
      return value != null ? String(value) : '';
    });

    // Wrap in container with className and style
    const containerAttrs: string[] = [];

    if (result.className) {
      containerAttrs.push(`class="${result.className}"`);
    }

    if (result.style) {
      const styleStr = Object.entries(result.style)
        .map(([key, value]) => `${this.camelToKebab(key)}: ${value}`)
        .join('; ');
      containerAttrs.push(`style="${styleStr}"`);
    }

    if (result.pointerEvents === false) {
      containerAttrs.push('style="pointer-events: none"');
    }

    if (result.zIndex !== undefined) {
      const existingStyle = containerAttrs.find((attr) => attr.startsWith('style='));
      if (existingStyle) {
        // Add to existing style
        containerAttrs[containerAttrs.indexOf(existingStyle)] = existingStyle.replace(
          '"',
          `"z-index: ${result.zIndex}; `
        );
      } else {
        containerAttrs.push(`style="z-index: ${result.zIndex}"`);
      }
    }

    // Wrap in container if we have attributes to apply
    if (containerAttrs.length > 0) {
      html = `<div ${containerAttrs.join(' ')}>${html}</div>`;
    }

    return html;
  }

  /**
   * Evaluate expression in binding context
   */
  private evaluateExpression(expression: string, bindings: Record<string, any>): any {
    try {
      // Handle simple property access (e.g., "data.user.name")
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
        renderer: 'HtmlTemplateRenderer',
      });
      return undefined;
    }
  }

  /**
   * Build className string from config
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
   * Convert camelCase to kebab-case for CSS properties
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Dispose resources for a specific node
   * @param nodeUuid - UUID of node to clean up
   */
  disposeNode(nodeUuid: string): void {
    // Remove event handlers
    const handlers = this.eventHandlers.get(nodeUuid);
    if (handlers) {
      // Event handlers will be garbage collected when references are removed
      Object.keys(handlers).forEach((key) => {
        delete handlers[key];
      });
    }
    this.eventHandlers.delete(nodeUuid);

    // Remove render result
    const result = this.renderResults.get(nodeUuid);
    if (result) {
      // Clear bindings and handlers
      if (result.bindings) {
        Object.keys(result.bindings).forEach((key) => {
          delete result.bindings[key];
        });
      }
      if (result.eventHandlers) {
        Object.keys(result.eventHandlers).forEach((key) => {
          delete result.eventHandlers[key];
        });
      }
    }
    this.renderResults.delete(nodeUuid);
  }

  /**
   * Cleanup all renderer resources
   */
  dispose(): void {
    // Dispose all tracked nodes
    const nodeUuids = Array.from(this.renderResults.keys());
    nodeUuids.forEach((uuid) => this.disposeNode(uuid));

    // Clear all tracking maps
    this.eventHandlers.clear();
    this.renderResults.clear();
  }
}
