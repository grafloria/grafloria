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
   * Phase 0.5.2 Enhanced: Select optimal ports based on layout-aware algorithm
   *
   * Uses layout-aware analysis based on academic research:
   * - Considers layout direction (TB/LR/RL/BT)
   * - Classifies edges as forward/backward/cross relative to layout flow
   * - Uses hierarchical rank information when available
   * - Falls back to geometric analysis for non-hierarchical layouts
   *
   * Algorithm based on "Drawing Layered Graphs with Port Constraints" (Spönemann et al., 2013)
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @param layoutContext - Optional layout context with direction and rank information
   * @returns Object containing optimal source and target ports, or undefined if not found
   */
  selectOptimalPorts(
    sourceNode: NodeModel,
    targetNode: NodeModel,
    layoutContext?: {
      direction?: 'TB' | 'LR' | 'RL' | 'BT';
      ranks?: Map<string, number>;
    }
  ): { sourcePort: any; targetPort: any } | undefined {
    // Get node centers for geometric calculations
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

    let sourceSide: 'left' | 'right' | 'top' | 'bottom';
    let targetSide: 'left' | 'right' | 'top' | 'bottom';

    // ENHANCED: Layout-aware port selection
    if (layoutContext?.direction && layoutContext?.ranks) {
      const direction = layoutContext.direction;

      // Get node ranks to classify edge type
      const sourceRank = layoutContext.ranks.get(sourceNode.id) ?? 0;
      const targetRank = layoutContext.ranks.get(targetNode.id) ?? 0;

      // Classify edge type relative to layout flow
      const isForward = targetRank > sourceRank;   // Edge flows with layout direction
      const isBackward = targetRank < sourceRank;  // Edge flows against layout direction
      const isCross = targetRank === sourceRank;   // Edge between nodes at same rank

      // Apply layer-based port assignment algorithm
      if (direction === 'TB' || direction === 'BT') {
        // Vertical layout (Top-to-Bottom or Bottom-to-Top)
        if (isForward) {
          // Forward edge: consider position offset for branching nodes
          // Calculate offset ratio to detect if target is significantly to the side
          const parallelOffset = Math.abs(dy);
          const perpendicularOffset = Math.abs(dx);
          const offsetRatio = parallelOffset > 0 ? perpendicularOffset / parallelOffset : 0;

          // Threshold: if perpendicular offset > 20% of parallel offset, use side ports
          // This handles decision nodes with branches going left/right
          if (offsetRatio > 0.2 && perpendicularOffset > 10) {
            // Target is significantly to the side → use left/right ports for source
            sourceSide = dx > 0 ? 'right' : 'left';
            // Target port should face the source direction
            // Check if source is more above/below or more left/right
            if (Math.abs(dy) > Math.abs(dx)) {
              // Source is more above/below → target uses top/bottom
              targetSide = 'top';  // Since dy > 0 in TB layout (source is above)
            } else {
              // Source is more to the left/right → target uses left/right
              targetSide = dx > 0 ? 'left' : 'right';
            }
          } else {
            // Target is mostly below → use bottom port (standard forward edge)
            sourceSide = 'bottom';
            targetSide = 'top';
          }
        } else if (isBackward) {
          // Backward edge (cycle): source connects from top, target from bottom
          sourceSide = 'top';
          targetSide = 'bottom';
        } else {
          // Cross edge (same rank): use horizontal ports based on relative position
          if (dx > 0) {
            sourceSide = 'right';
            targetSide = 'left';
          } else if (dx < 0) {
            sourceSide = 'left';
            targetSide = 'right';
          } else {
            // Nodes at exact same position - use bottom→top as default
            sourceSide = 'bottom';
            targetSide = 'top';
          }
        }
      } else {
        // Horizontal layout (Left-to-Right or Right-to-Left)
        if (isForward) {
          // Forward edge: consider position offset for branching nodes
          // Calculate offset ratio to detect if target is significantly above/below
          const parallelOffset = Math.abs(dx);
          const perpendicularOffset = Math.abs(dy);
          const offsetRatio = parallelOffset > 0 ? perpendicularOffset / parallelOffset : 0;

          // Threshold: if perpendicular offset > 20% of parallel offset, use side ports
          // This handles decision nodes with branches going up/down
          if (offsetRatio > 0.2 && perpendicularOffset > 10) {
            // Target is significantly above/below → use top/bottom ports for source
            sourceSide = dy > 0 ? 'bottom' : 'top';
            // Target port should face the source direction
            // If source is to the left (dx > 0), target uses left port
            // But also check vertical alignment - if source is above/below, use top/bottom
            if (Math.abs(dx) > Math.abs(dy)) {
              // Source is more to the left/right → target uses left/right
              targetSide = 'left';  // Since dx > 0 in LR layout (source is to the left)
            } else {
              // Source is more above/below → target uses top/bottom
              targetSide = dy > 0 ? 'top' : 'bottom';
            }
          } else {
            // Target is mostly to the right → use right port (standard forward edge)
            sourceSide = 'right';
            targetSide = 'left';
          }
        } else if (isBackward) {
          // Backward edge (cycle): source connects from left, target from right
          sourceSide = 'left';
          targetSide = 'right';
        } else {
          // Cross edge (same rank): use vertical ports based on relative position
          if (dy > 0) {
            sourceSide = 'bottom';
            targetSide = 'top';
          } else if (dy < 0) {
            sourceSide = 'top';
            targetSide = 'bottom';
          } else {
            // Nodes at exact same position - use right→left as default
            sourceSide = 'right';
            targetSide = 'left';
          }
        }
      }
    } else {
      // FALLBACK: Geometric port selection (original algorithm)
      // Used when layout context is not available
      const isHorizontal = Math.abs(dx) > Math.abs(dy);

      if (isHorizontal) {
        // Horizontal connection
        if (dx > 0) {
          sourceSide = 'right';
          targetSide = 'left';
        } else {
          sourceSide = 'left';
          targetSide = 'right';
        }
      } else {
        // Vertical connection
        if (dy > 0) {
          sourceSide = 'bottom';
          targetSide = 'top';
        } else {
          sourceSide = 'top';
          targetSide = 'bottom';
        }
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
   * Phase 0.5.2 Enhanced: Optimize all connections after layout
   *
   * Reassigns ports for all links based on current node positions and layout context.
   * This ensures connections look natural after layout algorithms reposition nodes.
   *
   * Now public and layout-aware - uses hierarchical rank information when available
   * to apply academic research-based port assignment (Spönemann et al., 2013).
   *
   * @param layoutContext - Optional layout context with direction and rank information
   * @returns Number of connections optimized
   */
  public optimizeConnections(layoutContext?: {
    direction?: 'TB' | 'LR' | 'RL' | 'BT';
    ranks?: Map<string, number>;
  }): number {
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

      // Select optimal ports with layout context
      const optimalPorts = this.selectOptimalPorts(sourceNode, targetNode, layoutContext);

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
      const contextInfo = layoutContext?.direction
        ? ` using layout-aware algorithm (${layoutContext.direction})`
        : ' using geometric algorithm';
      console.log(`🎯 Optimized ${optimized} connections${contextInfo}`);
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
