/**
 * Layout Service
 *
 * Central service for managing layout adapters and applying layouts to diagrams.
 * Handles adapter registration, layout application, animation, and viewport fitting.
 */

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';

/**
 * Configuration for applying a layout
 */
export interface ApplyLayoutConfig {
  /** Layout adapter to use (name or instance) */
  adapter: 'dagre' | 'elk' | LayoutAdapter;
  /** Layout-specific options */
  options?: Partial<LayoutOptions>;
  /** Whether to animate to new positions */
  animate?: boolean;
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Whether to fit viewport after layout */
  fit?: boolean;
  /** Canvas dimensions for viewport fitting */
  canvasDimensions?: { width: number; height: number };
  /** Progress callback for long-running layouts */
  onProgress?: (progress: number) => void;
}

/**
 * Layout Service
 *
 * Manages layout adapters and provides a unified API for applying layouts.
 * Can be used as a singleton or instantiated per diagram.
 */
export class LayoutService {
  private adapters = new Map<string, LayoutAdapter>();

  constructor() {
    // Register built-in adapters
    this.registerAdapter(new DagreLayoutAdapter());
    this.registerAdapter(new ELKLayoutAdapter());
  }

  /**
   * Register a custom layout adapter
   *
   * @param adapter - Layout adapter to register
   */
  registerAdapter(adapter: LayoutAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get a registered adapter by name
   *
   * @param name - Name of the adapter
   * @returns The adapter, or undefined if not found
   */
  getAdapter(name: string): LayoutAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapter names
   *
   * @returns Array of adapter names
   */
  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Apply layout to diagram
   *
   * @param diagram - Diagram to layout
   * @param config - Layout configuration
   * @returns Layout result with positions and metadata
   */
  async applyLayout(diagram: DiagramModel, config: ApplyLayoutConfig): Promise<LayoutResult> {
    // Get adapter
    const adapter =
      typeof config.adapter === 'string' ? this.adapters.get(config.adapter) : config.adapter;

    if (!adapter) {
      throw new Error(`Layout adapter not found: ${config.adapter}`);
    }

    // Validate options
    if (config.options && !adapter.validateOptions(config.options)) {
      throw new Error(`Invalid layout options for adapter: ${adapter.name}`);
    }

    // Get nodes and links from diagram
    const nodes = Array.from(diagram.getNodes().values());
    const links = Array.from(diagram.getLinks().values());

    if (nodes.length === 0) {
      // Empty diagram, return empty result
      return {
        nodePositions: new Map(),
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        metadata: {
          algorithm: adapter.name,
          executionTime: 0,
        },
      };
    }

    // Apply layout algorithm
    const result = await adapter.apply(nodes, links, config.options);

    // Update node positions (with or without animation)
    if (config.animate) {
      await this.animateToPositions(
        diagram,
        result.nodePositions,
        config.animationDuration || 300
      );
    } else {
      this.applyPositions(diagram, result.nodePositions);
    }

    // CRITICAL: Regenerate all link paths after nodes have been repositioned
    // This ensures links connect properly to nodes at their new positions
    this.regenerateLinkPaths(diagram);

    // Fit viewport if requested and canvas dimensions provided
    if (config.fit && config.canvasDimensions && diagram.zoomToFit) {
      const padding = config.options?.padding || 50;
      diagram.zoomToFit(
        config.canvasDimensions.width,
        config.canvasDimensions.height,
        padding
      );
    }

    return result;
  }

  /**
   * Apply positions immediately without animation
   *
   * @param diagram - Diagram to update
   * @param positions - Map of node IDs to positions
   */
  private applyPositions(
    diagram: DiagramModel,
    positions: Map<string, { x: number; y: number }>
  ): void {
    positions.forEach((pos, nodeId) => {
      const node = diagram.getNode(nodeId);
      if (node) {
        node.setPosition(pos.x, pos.y);
      }
    });
  }

  /**
   * Animate nodes to new positions
   *
   * Uses requestAnimationFrame for smooth 60fps animation.
   * Applies ease-out-cubic easing for natural motion.
   *
   * @param diagram - Diagram to update
   * @param positions - Map of node IDs to target positions
   * @param duration - Animation duration in milliseconds
   */
  private async animateToPositions(
    diagram: DiagramModel,
    positions: Map<string, { x: number; y: number }>,
    duration: number
  ): Promise<void> {
    // Store start positions
    const startPositions = new Map<string, { x: number; y: number }>();

    positions.forEach((_, nodeId) => {
      const node = diagram.getNode(nodeId);
      if (node) {
        startPositions.set(nodeId, {
          x: node.position.x,
          y: node.position.y,
        });
      }
    });

    // Animate
    return new Promise<void>((resolve) => {
      const startTime = performance.now();

      const animate = () => {
        const now = performance.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out-cubic easing function
        const eased = 1 - Math.pow(1 - progress, 3);

        // Update positions
        positions.forEach((endPos, nodeId) => {
          const startPos = startPositions.get(nodeId);
          const node = diagram.getNode(nodeId);

          if (startPos && node) {
            const x = startPos.x + (endPos.x - startPos.x) * eased;
            const y = startPos.y + (endPos.y - startPos.y) * eased;
            node.setPosition(x, y);
          }
        });

        // Continue animation or resolve
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * Regenerate paths for all links in the diagram
   *
   * This is called after layout to ensure links connect properly to nodes
   * at their new positions. Without this, links appear disconnected.
   *
   * @param diagram - Diagram containing the links to update
   */
  private regenerateLinkPaths(diagram: DiagramModel): void {
    const links = Array.from(diagram.getLinks().values());

    links.forEach((link) => {
      // Get source and target nodes
      const sourceNode = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : null;
      const targetNode = link.targetNodeId ? diagram.getNode(link.targetNodeId) : null;

      if (!sourceNode || !targetNode) {
        return; // Skip links without valid nodes
      }

      // Get source and target ports
      const sourcePort = link.sourcePortId ? sourceNode.getPort(link.sourcePortId) : null;
      const targetPort = link.targetPortId ? targetNode.getPort(link.targetPortId) : null;

      if (!sourcePort || !targetPort) {
        return; // Skip links without valid ports
      }

      // Calculate absolute positions of ports
      const sourceBounds = sourceNode.getBoundingBox();
      const targetBounds = targetNode.getBoundingBox();
      const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
      const targetPoint = targetPort.getAbsolutePosition(targetBounds);

      // Get port directions
      const sourceDirection = sourcePort.alignment?.side;
      const targetDirection = targetPort.alignment?.side;

      // Regenerate the link path
      link.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);
    });
  }
}

/**
 * Singleton instance of LayoutService
 *
 * Can be used across the application for convenience.
 */
export const layoutService = new LayoutService();
