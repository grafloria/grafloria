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
import { HierarchicalLayoutAlgorithm } from './algorithms/HierarchicalLayoutAlgorithm';
import { ForceDirectedLayoutAlgorithm } from './algorithms/ForceDirectedLayoutAlgorithm';
import { HybridLayoutAlgorithm } from './algorithms/HybridLayoutAlgorithm';

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
    this.registerAlgorithm('hierarchical', new HierarchicalLayoutAlgorithm());
    this.registerAlgorithm('force-directed', new ForceDirectedLayoutAlgorithm());
    this.registerAlgorithm('hybrid', new HybridLayoutAlgorithm());

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
   * Re-layout all nodes using current algorithm (Phase 0.5 - Viewport-aware)
   * Option 3: Supports animation and locked node constraints
   */
  async reLayout(config?: LayoutConfiguration): Promise<void> {
    this.emitEvent({
      type: 'layout:started',
      algorithmType: this.currentAlgorithm.getType(),
    });

    try {
      // Phase 0.5: Get viewport from diagram and pass to layout algorithm
      const viewport = this.diagram.getViewport();
      const enhancedConfig: LayoutConfiguration = {
        ...config,
        type: this.currentAlgorithm.getType(),
        viewport,
        margins: config?.margins || 50
      };

      // If direction shorthand is provided, merge it into hierarchical options
      if (config?.direction && this.currentAlgorithm.getType() === 'hierarchical') {
        enhancedConfig.options = {
          ...config.options,
          direction: config.direction
        };
      }

      // Option 3: Store old positions for animation
      const oldPositions = new Map<string, Point>();
      if (config?.animate) {
        this.diagram.getNodes().forEach((node) => {
          oldPositions.set(node.id, { ...node.position });
        });
      }

      // Calculate new positions (viewport-aware)
      const positions = this.currentAlgorithm.reLayout(this.diagram, enhancedConfig);

      // Option 3: Filter out locked nodes - they keep their current positions
      const lockedNodes = new Set<string>();
      this.diagram.getNodes().forEach((node) => {
        if (node.state.locked) {
          lockedNodes.add(node.id);
          // Restore locked node's original position
          positions.set(node.id, { ...node.position });
        }
      });

      if (lockedNodes.size > 0) {
        console.log(`📌 ${lockedNodes.size} locked node(s) preserved during layout`);
      }

      // Option 3: Apply animation if requested
      if (config?.animate && config.animationDuration) {
        await this.animateLayout(oldPositions, positions, config.animationDuration);
      } else {
        // Apply positions immediately (no animation)
        positions.forEach((position, nodeId) => {
          const node = this.diagram.getNode(nodeId);
          if (node) {
            node.setPosition(position.x, position.y);
          }
        });
      }

      // Phase 0.5.2: Optimize connections based on new node positions
      // This must happen BEFORE recalculating paths, so links use optimal ports
      this.optimizeConnections();

      // CRITICAL: Recalculate all link paths after nodes have moved
      // Links don't automatically update when nodes move - we must explicitly regenerate their paths
      this.recalculateLinkPaths();

      this.emitEvent({
        type: 'layout:completed',
        algorithmType: this.currentAlgorithm.getType(),
        data: { nodeCount: positions.size, lockedNodes: lockedNodes.size, animated: !!config?.animate },
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
   * Option 3: Animate layout transitions
   *
   * Smoothly transitions nodes from old positions to new positions over the specified duration.
   * Uses requestAnimationFrame for smooth 60fps animation.
   */
  private async animateLayout(
    oldPositions: Map<string, Point>,
    newPositions: Map<string, Point>,
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const easeInOutCubic = (t: number): number => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);

        // Interpolate positions
        newPositions.forEach((newPos, nodeId) => {
          const oldPos = oldPositions.get(nodeId);
          if (!oldPos) return;

          const node = this.diagram.getNode(nodeId);
          if (!node) return;

          // Linear interpolation
          const x = oldPos.x + (newPos.x - oldPos.x) * easedProgress;
          const y = oldPos.y + (newPos.y - oldPos.y) * easedProgress;

          node.setPosition(x, y);
        });

        // Update link paths during animation
        this.recalculateLinkPaths();

        // Emit progress event for renderer to update
        this.diagram.markDirty();

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
   * Recalculate all link paths based on current node/port positions
   *
   * CRITICAL: This must be called after moving nodes programmatically (e.g., layout algorithms)
   * because links don't automatically update their paths when nodes move.
   *
   * How it works:
   * 1. Get all links in the diagram
   * 2. For each link, find its source and target ports
   * 3. Calculate port absolute positions based on current node positions
   * 4. Call link.generatePath() to recalculate the path points
   */
  private recalculateLinkPaths(): void {
    const links = this.diagram.getLinks();
    let recalculated = 0;

    links.forEach((link) => {
      // Find source and target nodes
      const sourceNode = this.diagram.getNodes().find((n) =>
        n.getPorts().some((p) => p.id === link.sourcePortId)
      );
      const targetNode = this.diagram.getNodes().find((n) =>
        n.getPorts().some((p) => p.id === link.targetPortId)
      );

      if (!sourceNode || !targetNode) {
        console.warn(`⚠️ Link ${link.id} missing source or target node`);
        return;
      }

      // Find the actual port objects
      const sourcePort = sourceNode.getPorts().find((p) => p.id === link.sourcePortId);
      const targetPort = targetNode.getPorts().find((p) => p.id === link.targetPortId);

      if (!sourcePort || !targetPort) {
        console.warn(`⚠️ Link ${link.id} missing source or target port`);
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

      recalculated++;
    });

    console.log(`🔗 Recalculated ${recalculated} link paths after layout`);
  }

  /**
   * Phase 0.5.2: Select optimal ports based on node geometry
   *
   * Uses geometric analysis to determine the best ports for connection:
   * - Calculates relative position between nodes
   * - Selects ports that face each other
   * - Returns ports that create the shortest, most natural connection
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @returns Object containing optimal source and target ports, or undefined if not found
   */
  selectOptimalPorts(
    sourceNode: NodeModel,
    targetNode: NodeModel
  ): { sourcePort: any; targetPort: any } | undefined {
    // Get node centers
    const sourceBounds = sourceNode.getBoundingBox();
    const targetBounds = targetNode.getBoundingBox();

    const sourceCenter = {
      x: sourceBounds.left + sourceBounds.width / 2,
      y: sourceBounds.top + sourceBounds.height / 2,
    };

    const targetCenter = {
      x: targetBounds.left + targetBounds.width / 2,
      y: targetBounds.top + targetBounds.height / 2,
    };

    // Calculate relative position
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    // Determine dominant direction (horizontal vs vertical)
    const isHorizontal = Math.abs(dx) > Math.abs(dy);

    let sourceSide: 'left' | 'right' | 'top' | 'bottom';
    let targetSide: 'left' | 'right' | 'top' | 'bottom';

    if (isHorizontal) {
      // Horizontal connection
      if (dx > 0) {
        // Target is to the right of source
        sourceSide = 'right';
        targetSide = 'left';
      } else {
        // Target is to the left of source
        sourceSide = 'left';
        targetSide = 'right';
      }
    } else {
      // Vertical connection
      if (dy > 0) {
        // Target is below source
        sourceSide = 'bottom';
        targetSide = 'top';
      } else {
        // Target is above source
        sourceSide = 'top';
        targetSide = 'bottom';
      }
    }

    // Get ports by the determined sides
    const sourcePort = sourceNode.getPortBySide(sourceSide);
    const targetPort = targetNode.getPortBySide(targetSide);

    if (!sourcePort || !targetPort) {
      console.warn(`⚠️ Could not find optimal ports for nodes ${sourceNode.id} → ${targetNode.id}`);
      return undefined;
    }

    return { sourcePort, targetPort };
  }

  /**
   * Phase 0.5.2: Optimize all connections after layout
   *
   * Reassigns ports for all links based on current node positions.
   * This ensures connections look natural after layout algorithms reposition nodes.
   *
   * Called automatically after layout, fixes the "weird diagonal connections" issue.
   *
   * @returns Number of connections optimized
   */
  private optimizeConnections(): number {
    const links = this.diagram.getLinks();
    let optimized = 0;

    links.forEach((link) => {
      // Find source and target nodes
      const sourceNode = this.diagram.getNodes().find((n) =>
        n.getPorts().some((p) => p.id === link.sourcePortId)
      );
      const targetNode = this.diagram.getNodes().find((n) =>
        n.getPorts().some((p) => p.id === link.targetPortId)
      );

      if (!sourceNode || !targetNode) {
        return; // Skip if nodes not found
      }

      // Select optimal ports based on current node positions
      const optimalPorts = this.selectOptimalPorts(sourceNode, targetNode);

      if (optimalPorts) {
        const { sourcePort, targetPort } = optimalPorts;

        // Only reassign if ports changed
        if (link.sourcePortId !== sourcePort.id || link.targetPortId !== targetPort.id) {
          // Remove connection from old ports
          const oldSourcePort = sourceNode.getPorts().find((p) => p.id === link.sourcePortId);
          const oldTargetPort = targetNode.getPorts().find((p) => p.id === link.targetPortId);

          if (oldSourcePort) {
            oldSourcePort.removeConnection(link.id);
          }
          if (oldTargetPort) {
            oldTargetPort.removeConnection(link.id);
          }

          // Update link with new ports
          link.setSourcePort(sourcePort.id, sourceNode.id);
          link.setTargetPort(targetPort.id, targetNode.id);

          // Add connection to new ports
          sourcePort.addConnection(link.id);
          targetPort.addConnection(link.id);

          optimized++;
        }
      }
    });

    if (optimized > 0) {
      console.log(`🎯 Optimized ${optimized} connections based on node geometry`);
    }

    return optimized;
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
