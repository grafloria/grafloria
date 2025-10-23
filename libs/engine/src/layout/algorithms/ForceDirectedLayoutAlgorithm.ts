// ForceDirectedLayoutAlgorithm - Physics-based layout using force simulation
// Based on Fruchterman-Reingold algorithm

import { BaseLayoutAlgorithm, type ILayoutAlgorithm } from '../ILayoutAlgorithm';
import type { PlacementOptions, PlacementResult, LayoutConfiguration, ForceDirectedOptions } from '../types';
import type { DiagramModel } from '../../models/DiagramModel';
import type { NodeModel } from '../../models/NodeModel';
import type { Point } from '../../types';
import {
  calculateViewportTransform,
  applyTransform,
  calculateNodeBounds
} from '../ViewportTransform';

interface Vector2D {
  x: number;
  y: number;
}

interface NodeForce {
  node: NodeModel;
  position: Vector2D;
  velocity: Vector2D;
  force: Vector2D;
}

/**
 * ForceDirectedLayoutAlgorithm
 *
 * Physics-based layout where:
 * - Nodes repel each other (like magnets with same poles)
 * - Connected nodes attract each other (like springs)
 * - System settles into equilibrium over iterations
 *
 * Best for:
 * - Network diagrams
 * - Social graphs
 * - Relationship visualizations
 * - Organic, natural-looking layouts
 */
export class ForceDirectedLayoutAlgorithm extends BaseLayoutAlgorithm implements ILayoutAlgorithm {
  private forceOptions: ForceDirectedOptions;

  constructor(options?: ForceDirectedOptions) {
    super();
    this.forceOptions = {
      iterations: 50,
      repulsionStrength: 1.0,     // Reduced from 5000 - was causing explosion!
      attractionStrength: 0.05,   // Increased for better edge attraction
      damping: 0.85,              // Slightly less damping for smoother movement
      temperature: 10,            // Much lower initial temperature
      coolingFactor: 0.95,
      minDistance: 50,
      maxDistance: 500,
      centerGravity: 0.05,        // Reduced center gravity
      ...options,
    };
  }

  getName(): string {
    return 'Force-Directed Layout';
  }

  getType(): 'force-directed' {
    return 'force-directed';
  }

  override configure(config: LayoutConfiguration): void {
    if (config.options) {
      this.forceOptions = {
        ...this.forceOptions,
        ...config.options,
      };
    }
  }

  override getConfiguration(): LayoutConfiguration {
    return {
      type: 'force-directed',
      options: this.forceOptions,
    };
  }

  override canApply(diagram: DiagramModel): { valid: boolean; reason?: string } {
    const nodes = diagram.getNodes();

    if (nodes.length === 0) {
      return { valid: false, reason: 'No nodes to layout' };
    }

    if (nodes.length > 200) {
      return {
        valid: true,
        reason: 'Warning: Force-directed layout may be slow with many nodes. Consider using Grid or Hierarchical layout.'
      };
    }

    return { valid: true };
  }

  calculatePlacement(options: PlacementOptions): PlacementResult {
    const { node, viewport, existingNodes, preferredPosition, spacing = 100 } = options;

    // If there are no existing nodes, place in center
    if (existingNodes.length === 0) {
      const centerX = viewport.x + viewport.width / 2 - (node.size?.width || 200) / 2;
      const centerY = viewport.y + viewport.height / 2 - (node.size?.height || 100) / 2;
      return {
        position: { x: centerX, y: centerY },
        success: true,
        metadata: { reason: 'First node placed in center' },
      };
    }

    // If preferred position provided and no collision, use it
    if (preferredPosition) {
      const hasCol = this.hasCollision(
        preferredPosition,
        { width: node.size?.width || 200, height: node.size?.height || 100 },
        existingNodes,
        spacing
      );
      if (!hasCol) {
        return {
          position: preferredPosition,
          success: true,
          metadata: { reason: 'Preferred position used' },
        };
      }
    }

    // Calculate center of mass of existing nodes
    let centerX = 0;
    let centerY = 0;
    existingNodes.forEach((n: NodeModel) => {
      centerX += n.position.x + (n.size?.width || 200) / 2;
      centerY += n.position.y + (n.size?.height || 100) / 2;
    });
    centerX /= existingNodes.length;
    centerY /= existingNodes.length;

    // Place new node near center of mass, avoiding collisions
    const nodeWidth = node.size?.width || 200;
    const nodeHeight = node.size?.height || 100;

    // Try positions in a spiral pattern around center of mass
    const maxAttempts = 50;
    const angleStep = (Math.PI * 2) / 12; // 12 positions per ring
    let distance = spacing * 1.5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ring = Math.floor(attempt / 12);
      const angleIndex = attempt % 12;
      const angle = angleIndex * angleStep + (ring * angleStep / 2); // Offset each ring

      const testX = centerX + Math.cos(angle) * distance - nodeWidth / 2;
      const testY = centerY + Math.sin(angle) * distance - nodeHeight / 2;

      const hasCol = this.hasCollision(
        { x: testX, y: testY },
        { width: nodeWidth, height: nodeHeight },
        existingNodes,
        spacing
      );

      if (!hasCol) {
        return {
          position: { x: testX, y: testY },
          success: true,
          metadata: {
            reason: 'Placed near center of mass',
            attempt: attempt + 1,
          },
        };
      }

      // Increase distance for next ring
      if ((attempt + 1) % 12 === 0) {
        distance += spacing;
      }
    }

    // Fallback: place to the right of rightmost node
    const rightmost = existingNodes.reduce(
      (max: number, n: NodeModel) => Math.max(max, n.position.x + (n.size?.width || 200)),
      0
    );
    return {
      position: { x: rightmost + spacing, y: centerY - nodeHeight / 2 },
      success: true,
      metadata: { reason: 'Fallback position used' },
    };
  }

  reLayout(diagram: DiagramModel, config?: LayoutConfiguration): Map<string, Point> {
    if (config) {
      this.configure(config);
    }

    const nodes = diagram.getNodes();
    const links = diagram.getLinks();
    const positions = new Map<string, Point>();

    if (nodes.length === 0) {
      return positions;
    }

    // Initialize node forces with current or random positions
    const nodeForces: NodeForce[] = nodes.map((node) => {
      // Use existing position if available, otherwise random
      const hasPosition = node.position && (node.position.x !== 0 || node.position.y !== 0);
      const position = hasPosition
        ? { x: node.position.x, y: node.position.y }
        : {
            x: Math.random() * 1000,
            y: Math.random() * 800,
          };

      return {
        node,
        position,
        velocity: { x: 0, y: 0 },
        force: { x: 0, y: 0 },
      };
    });

    // Build adjacency map for quick lookup
    const adjacency = new Map<string, Set<string>>();
    links.forEach((link) => {
      if (link.sourceNodeId && link.targetNodeId) {
        if (!adjacency.has(link.sourceNodeId)) {
          adjacency.set(link.sourceNodeId, new Set());
        }
        if (!adjacency.has(link.targetNodeId)) {
          adjacency.set(link.targetNodeId, new Set());
        }
        adjacency.get(link.sourceNodeId)!.add(link.targetNodeId);
        adjacency.get(link.targetNodeId)!.add(link.sourceNodeId);
      }
    });

    // Phase 0.5: Use viewport from config if provided, otherwise fallback to default
    const viewport = config?.viewport || { x: 0, y: 0, width: 1200, height: 800 };

    // Calculate optimal k (ideal spring length) based on area and node count
    const area = viewport.width * viewport.height;
    const k = Math.sqrt(area / nodes.length);

    console.log(`🧲 Force-Directed: ${nodes.length} nodes, k=${k.toFixed(2)}, area=${area}`);

    // Simulation parameters
    let temperature = this.forceOptions.temperature || 100;
    const coolingFactor = this.forceOptions.coolingFactor || 0.95;
    const iterations = this.forceOptions.iterations || 100;

    // Run force-directed simulation
    for (let iter = 0; iter < iterations; iter++) {
      // Reset forces
      nodeForces.forEach((nf) => {
        nf.force.x = 0;
        nf.force.y = 0;
      });

      // Calculate repulsive forces (all pairs)
      for (let i = 0; i < nodeForces.length; i++) {
        for (let j = i + 1; j < nodeForces.length; j++) {
          const nf1 = nodeForces[i]!;
          const nf2 = nodeForces[j]!;

          const dx = nf2.position.x - nf1.position.x;
          const dy = nf2.position.y - nf1.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1; // Avoid division by zero

          // Fruchterman-Reingold repulsion: fr(d) = k^2 / d
          // Scale k by repulsionStrength for tuning
          const kScaled = k * (this.forceOptions.repulsionStrength || 1.0);
          const repulsionForce = (kScaled * kScaled) / distance;

          const fx = (dx / distance) * repulsionForce;
          const fy = (dy / distance) * repulsionForce;

          nf1.force.x -= fx;
          nf1.force.y -= fy;
          nf2.force.x += fx;
          nf2.force.y += fy;
        }
      }

      // Calculate attractive forces (connected nodes)
      links.forEach((link) => {
        if (!link.sourceNodeId || !link.targetNodeId) return;

        const nf1 = nodeForces.find((nf) => nf.node.id === link.sourceNodeId);
        const nf2 = nodeForces.find((nf) => nf.node.id === link.targetNodeId);

        if (!nf1 || !nf2) return;

        const dx = nf2.position.x - nf1.position.x;
        const dy = nf2.position.y - nf1.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // Fruchterman-Reingold attraction: fa(d) = d^2 / k
        // Scale by attractionStrength for tuning
        const kAttr = k / (this.forceOptions.attractionStrength || 1.0);
        const attractionForce = (distance * distance) / kAttr;

        const fx = (dx / distance) * attractionForce;
        const fy = (dy / distance) * attractionForce;

        nf1.force.x += fx;
        nf1.force.y += fy;
        nf2.force.x -= fx;
        nf2.force.y -= fy;
      });

      // Apply center gravity (keep nodes from drifting too far)
      const centerGravity = this.forceOptions.centerGravity || 0.1;
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;

      nodeForces.forEach((nf) => {
        const dx = centerX - nf.position.x;
        const dy = centerY - nf.position.y;
        nf.force.x += dx * centerGravity;
        nf.force.y += dy * centerGravity;
      });

      // Update positions using velocity Verlet integration
      const damping = this.forceOptions.damping || 0.9;

      nodeForces.forEach((nf) => {
        // Limit force magnitude to temperature
        const forceMag = Math.sqrt(nf.force.x * nf.force.x + nf.force.y * nf.force.y);
        if (forceMag > temperature) {
          nf.force.x = (nf.force.x / forceMag) * temperature;
          nf.force.y = (nf.force.y / forceMag) * temperature;
        }

        // Update velocity with damping
        nf.velocity.x = (nf.velocity.x + nf.force.x) * damping;
        nf.velocity.y = (nf.velocity.y + nf.force.y) * damping;

        // Update position
        nf.position.x += nf.velocity.x;
        nf.position.y += nf.velocity.y;

        // Prevent positions from exploding - clamp to reasonable bounds
        const maxCoord = 10000;
        nf.position.x = Math.max(-maxCoord, Math.min(maxCoord, nf.position.x));
        nf.position.y = Math.max(-maxCoord, Math.min(maxCoord, nf.position.y));
      });

      // Cool down temperature
      temperature *= coolingFactor;
    }

    // Extract final positions in relative space
    const relativePositions: Array<{ node: NodeModel; position: Point }> = nodeForces.map((nf) => ({
      node: nf.node,
      position: { x: nf.position.x, y: nf.position.y }
    }));

    // Phase 0.5: Apply viewport transform if viewport is provided
    if (config?.viewport) {
      // Calculate bounding box of force-directed layout
      const layoutBounds = calculateNodeBounds(
        relativePositions.map(({ node, position }) => ({
          position,
          size: node.size || { width: 200, height: 100 }
        }))
      );

      // Calculate transform to fit in viewport
      const transform = calculateViewportTransform(
        layoutBounds,
        config.viewport,
        config.margins || 50
      );

      // Apply transform to all positions
      relativePositions.forEach(({ node, position }) => {
        const transformedPos = applyTransform(position, transform);
        positions.set(node.id, transformedPos);
      });

      console.log(`🧲 Force-Directed layout: ${nodes.length} nodes fit in viewport (scale: ${transform.scale.toFixed(2)})`);
    } else {
      // No viewport - normalize to positive coordinates with padding (backward compatibility)
      let minX = Infinity;
      let minY = Infinity;

      relativePositions.forEach(({ position }) => {
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
      });

      const padding = 100;
      relativePositions.forEach(({ node, position }) => {
        positions.set(node.id, {
          x: position.x - minX + padding,
          y: position.y - minY + padding,
        });
      });
    }

    return positions;
  }

  onActivate(): void {
    console.log('🧲 Force-Directed layout activated');
  }

  onDeactivate(): void {
    console.log('🧲 Force-Directed layout deactivated');
  }
}
