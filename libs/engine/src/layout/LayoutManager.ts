/**
 * Layout Manager
 *
 * Manages layout algorithms and provides a unified API for layout operations.
 * Responsibilities:
 * - Register and switch between layout algorithms
 * - Calculate placement for new nodes
 * - Re-layout existing diagrams
 * - Emit layout events
 */

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { Point, Rectangle } from '../types';
import { ILayoutAlgorithm } from './ILayoutAlgorithm';
import {
  LayoutAlgorithmType,
  LayoutConfiguration,
  PlacementOptions,
  PlacementResult,
  DiagramLayoutEvent,
} from './types';
import { GridLayoutAlgorithm } from './algorithms/GridLayoutAlgorithm';

/**
 * Layout Manager
 */
export class LayoutManager {
  private algorithms: Map<LayoutAlgorithmType, ILayoutAlgorithm>;
  private currentAlgorithm: ILayoutAlgorithm;
  private diagram: DiagramModel;
  private eventListeners: Map<string, Array<(event: DiagramLayoutEvent) => void>>;

  constructor(diagram: DiagramModel, initialAlgorithm: LayoutAlgorithmType = 'grid') {
    this.diagram = diagram;
    this.algorithms = new Map();
    this.eventListeners = new Map();

    // Register built-in algorithms
    this.registerAlgorithm('grid', new GridLayoutAlgorithm());

    // TODO: Register other algorithms when implemented
    // this.registerAlgorithm('force-directed', new ForceDirectedLayoutAlgorithm());
    // this.registerAlgorithm('hierarchical', new HierarchicalLayoutAlgorithm());
    // this.registerAlgorithm('hybrid', new HybridLayoutAlgorithm());

    // Set initial algorithm
    this.currentAlgorithm = this.algorithms.get(initialAlgorithm)!;
    this.currentAlgorithm.onActivate?.();
  }

  /**
   * Register a layout algorithm
   */
  registerAlgorithm(type: LayoutAlgorithmType, algorithm: ILayoutAlgorithm): void {
    this.algorithms.set(type, algorithm);
  }

  /**
   * Get registered algorithm
   */
  getAlgorithm(type: LayoutAlgorithmType): ILayoutAlgorithm | undefined {
    return this.algorithms.get(type);
  }

  /**
   * Get all registered algorithm types
   */
  getAvailableAlgorithms(): LayoutAlgorithmType[] {
    return Array.from(this.algorithms.keys());
  }

  /**
   * Switch to a different layout algorithm
   */
  setAlgorithm(type: LayoutAlgorithmType, config?: LayoutConfiguration): void {
    const algorithm = this.algorithms.get(type);

    if (!algorithm) {
      throw new Error(`Layout algorithm '${type}' is not registered`);
    }

    // Validate if algorithm can be applied
    const validation = algorithm.canApply(this.diagram);
    if (!validation.valid) {
      throw new Error(
        `Cannot apply ${type} layout: ${validation.reason || 'Unknown reason'}`
      );
    }

    // Deactivate current algorithm
    this.currentAlgorithm.onDeactivate?.();

    // Switch to new algorithm
    this.currentAlgorithm = algorithm;

    // Configure if options provided
    if (config) {
      this.currentAlgorithm.configure(config);
    }

    // Activate new algorithm
    this.currentAlgorithm.onActivate?.();

    // Emit event
    this.emitEvent({
      type: 'layout:algorithm-changed',
      algorithmType: type,
      data: { previousAlgorithm: this.currentAlgorithm.getType() },
    });
  }

  /**
   * Get current layout algorithm
   */
  getCurrentAlgorithm(): ILayoutAlgorithm {
    return this.currentAlgorithm;
  }

  /**
   * Get current algorithm type
   */
  getCurrentAlgorithmType(): LayoutAlgorithmType {
    return this.currentAlgorithm.getType();
  }

  /**
   * Calculate placement for a new node
   */
  calculatePlacement(
    node: NodeModel,
    viewport: Rectangle,
    options?: Partial<PlacementOptions>
  ): PlacementResult {
    const existingNodes = this.diagram.getNodes();

    const placementOptions: PlacementOptions = {
      node,
      viewport,
      existingNodes,
      ...options,
    };

    try {
      const result = this.currentAlgorithm.calculatePlacement(placementOptions);

      // Emit event
      this.emitEvent({
        type: 'layout:node-placed',
        algorithmType: this.currentAlgorithm.getType(),
        data: {
          nodeId: node.id,
          position: result.position,
          metadata: result.metadata,
        },
      });

      return result;
    } catch (error) {
      console.error('Layout placement failed:', error);

      // Fallback to simple placement
      return {
        position: { x: 100, y: 100 },
        success: false,
      };
    }
  }

  /**
   * Re-layout all nodes using current algorithm
   */
  async reLayout(config?: LayoutConfiguration): Promise<void> {
    this.emitEvent({
      type: 'layout:started',
      algorithmType: this.currentAlgorithm.getType(),
    });

    try {
      // Calculate new positions
      const positions = this.currentAlgorithm.reLayout(this.diagram, config);

      // Apply positions to nodes
      positions.forEach((position, nodeId) => {
        const node = this.diagram.getNode(nodeId);
        if (node) {
          node.setPosition(position.x, position.y);
        }
      });

      this.emitEvent({
        type: 'layout:completed',
        algorithmType: this.currentAlgorithm.getType(),
        data: { nodeCount: positions.size },
      });
    } catch (error) {
      console.error('Layout failed:', error);

      this.emitEvent({
        type: 'layout:failed',
        algorithmType: this.currentAlgorithm.getType(),
        data: { error },
      });

      throw error;
    }
  }

  /**
   * Configure current layout algorithm
   */
  configure(config: LayoutConfiguration): void {
    this.currentAlgorithm.configure(config);
  }

  /**
   * Get current configuration
   */
  getConfiguration(): LayoutConfiguration {
    return this.currentAlgorithm.getConfiguration();
  }

  /**
   * Subscribe to layout events
   */
  on(eventType: string, callback: (event: DiagramLayoutEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
  }

  /**
   * Unsubscribe from layout events
   */
  off(eventType: string, callback: (event: DiagramLayoutEvent) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit layout event
   */
  private emitEvent(event: DiagramLayoutEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => callback(event));
    }

    // Also emit to wildcard listeners
    const wildcardListeners = this.eventListeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((callback) => callback(event));
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.currentAlgorithm.onDeactivate?.();
    this.eventListeners.clear();
  }
}
