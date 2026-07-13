/**
 * Force-Directed (Organic) Layout Adapter
 *
 * Physics-based layout where nodes repel each other and edges act as springs.
 * Creates natural-looking layouts that reveal clustering patterns.
 *
 * Best for:
 * - Social networks
 * - Biological networks
 * - General graphs without clear hierarchy
 * - Discovering natural clusters
 *
 * Algorithm: Fruchterman-Reingold with Barnes-Hut optimization
 *
 * @module layout/force-layout-adapter
 */

import { NodeModel } from '../models/NodeModel';
import { createLayoutRng } from './rng';
import { LinkModel } from '../models/LinkModel';
import { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
import { LayoutQualityMetrics } from './layout-quality-metrics';
import type { LayoutRun, SteppableLayoutAdapter } from './steppable-layout';

/**
 * Force-directed layout options
 */
export interface ForceLayoutOptions extends LayoutOptions {
  /** Repulsion strength between nodes (default: 100) */
  repulsion?: number;

  /** Attraction strength along edges (default: 0.1) */
  attraction?: number;

  /** Gravity pulling nodes to center (default: 0.1) */
  gravity?: number;

  /** Initial temperature (default: 100) */
  temperature?: number;

  /** Cooling factor per iteration (default: 0.95) */
  cooling?: number;

  /** Number of iterations (default: 300) */
  iterations?: number;

  /** Minimum movement to continue (default: 0.1) */
  threshold?: number;

  /** Use Barnes-Hut approximation for large graphs (default: true) */
  useBarnesHut?: boolean;

  /** Barnes-Hut theta parameter (default: 0.9) */
  theta?: number;

  /** Edge length (default: 100) */
  linkDistance?: number;

  /** Randomize initial positions (default: true) */
  randomize?: boolean;
}

/**
 * Vector 2D helper
 */
interface Vector2D {
  x: number;
  y: number;
}

/**
 * Force simulation node
 */
interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  mass: number;
  fixed: boolean;
}

/**
 * Barnes-Hut quadtree node
 */
interface QuadTreeNode {
  x: number;
  y: number;
  mass: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  children?: QuadTreeNode[];
  node?: ForceNode;
}

/**
 * Force-Directed Layout Adapter
 *
 * Implements Fruchterman-Reingold algorithm with Barnes-Hut optimization.
 */
export class ForceLayoutAdapter implements SteppableLayoutAdapter {
  readonly name = 'force';

  /**
   * Wave 7 Card 3 — the simulation, exposed one iteration at a time.
   *
   * This is where the physics lives, and it is the ONLY place it lives: `apply()`
   * below is now just "drive this to convergence". Splitting the loop out (rather
   * than copying it into a worker-flavoured twin) is what keeps the off-thread
   * path honest — the worker and the main thread run the same arithmetic in the
   * same order, so they cannot drift.
   *
   * Pure and synchronous: no clock, no DOM, and randomness only through the
   * seeded generator. Those three abstinences are the whole reason a worker run
   * and an inline run produce byte-identical coordinates.
   *
   * `snapshot()` is meaningful after ANY number of steps, which is what makes a
   * cancelled force layout return the 200-iteration picture it already has
   * instead of throwing it away.
   */
  createRun(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<ForceLayoutOptions> = {}
  ): LayoutRun {
    // Merge with defaults
    const opts: ForceLayoutOptions = {
      repulsion: options.repulsion ?? 100,
      attraction: options.attraction ?? 0.1,
      gravity: options.gravity ?? 0.1,
      temperature: options.temperature ?? 100,
      cooling: options.cooling ?? 0.95,
      iterations: options.iterations ?? 300,
      threshold: options.threshold ?? 0.1,
      useBarnesHut: options.useBarnesHut ?? true,
      theta: options.theta ?? 0.9,
      linkDistance: options.linkDistance ?? 100,
      randomize: options.randomize ?? true,
      ...options,
    };

    // Initialize force nodes
    const forceNodes = this.initializeNodes(nodes, opts);
    const forceNodeMap = new Map(forceNodes.map(n => [n.id, n]));

    // Build edge list
    const edges = links
      .filter(link => link.sourceNodeId && link.targetNodeId)
      .map(link => ({
        source: forceNodeMap.get(link.sourceNodeId!)!,
        target: forceNodeMap.get(link.targetNodeId!)!,
      }))
      .filter(edge => edge.source && edge.target);

    // Apply constraints (pin nodes)
    if (options.constraints) {
      forceNodes.forEach(node => {
        const constraints = options.constraints!.constraints.filter(c => c.nodeId === node.id);
        if (constraints.length > 0) {
          const constraint = constraints[0];
          if (constraint.type === 'pin' && constraint.position) {
            node.x = constraint.position.x;
            node.y = constraint.position.y;
            node.fixed = true;
          }
        }
      });
    }

    const adapter = this;
    let temperature = opts.temperature!;
    let iteration = 0;
    let maxMovement = Infinity;

    // Exactly the original `while` condition, hoisted so `step()` can consult it
    // both before doing work (so a zero-iteration run does none) and after (so
    // the caller learns there is no more).
    const shouldContinue = (): boolean =>
      iteration < opts.iterations! && maxMovement > opts.threshold!;

    return {
      get iteration() {
        return iteration;
      },
      get totalIterations() {
        return opts.iterations!;
      },

      step(): boolean {
        if (!shouldContinue()) return false;

        // Reset forces
        forceNodes.forEach(node => {
          node.fx = 0;
          node.fy = 0;
        });

        // Repulsion forces (using Barnes-Hut if enabled)
        if (opts.useBarnesHut && forceNodes.length > 50) {
          adapter.applyBarnesHutRepulsion(forceNodes, opts);
        } else {
          adapter.applyRepulsion(forceNodes, opts);
        }

        // Attraction forces along edges
        adapter.applyAttraction(edges, opts);

        // Gravity to center
        adapter.applyGravity(forceNodes, opts);

        // Update positions
        maxMovement = adapter.updatePositions(forceNodes, temperature);

        // Cool down
        temperature *= opts.cooling!;
        iteration++;

        return shouldContinue();
      },

      snapshot(): LayoutResult {
        const nodePositions = new Map<string, { x: number; y: number }>();
        forceNodes.forEach(node => {
          nodePositions.set(node.id, { x: node.x, y: node.y });
        });

        return {
          nodePositions,
          bounds: adapter.calculateBounds(forceNodes),
          metadata: {
            algorithm: 'force',
            iterations: iteration,
            finalTemperature: temperature,
            // The clock is the caller's business, not the simulation's: a run
            // that timed itself could not produce identical output twice.
            executionTime: 0,
            nodeCount: nodes.length,
            linkCount: links.length,
          },
        };
      },
    };
  }

  /**
   * Apply force-directed layout (run the simulation to convergence).
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<ForceLayoutOptions> = {}
  ): Promise<LayoutResult> {
    const startTime = performance.now();

    const run = this.createRun(nodes, links, options);
    while (run.step()) {
      // run to convergence or the iteration cap, whichever comes first
    }
    const result = run.snapshot();

    // Apply positions to nodes
    nodes.forEach(node => {
      const position = result.nodePositions.get(node.id);
      if (position) {
        node.setPosition(position.x, position.y);
      }
    });

    // Calculate quality metrics if requested
    let quality = undefined;
    if (options.calculateQuality) {
      quality = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
        canvasDimensions: options.canvasDimensions,
      });
    }

    return {
      ...result,
      metadata: {
        ...result.metadata,
        algorithm: 'force',
        executionTime: performance.now() - startTime,
      },
      quality,
    };
  }

  /**
   * Initialize force nodes with random or existing positions
   */
  private initializeNodes(nodes: NodeModel[], options: ForceLayoutOptions): ForceNode[] {
    const forceNodes: ForceNode[] = [];
    const rng = createLayoutRng((options as { seed?: number }).seed);

    for (const node of nodes) {
      let x: number, y: number;

      if (options.randomize) {
        // Card 0: SEEDED. This was `Math.random()`, so the same graph produced a
        // different picture on every run — untestable, unreproducible on reload,
        // and it makes the mental-map card undefinable (you cannot minimise
        // movement against a baseline that itself moves).
        x = rng.between(-250, 250);
        y = rng.between(-250, 250);
      } else {
        // Use existing position
        x = node.position.x;
        y = node.position.y;
      }

      forceNodes.push({
        id: node.id,
        x,
        y,
        vx: 0,
        vy: 0,
        fx: 0,
        fy: 0,
        mass: 1,
        fixed: false,
      });
    }

    return forceNodes;
  }

  /**
   * Apply repulsion forces between all node pairs
   */
  private applyRepulsion(nodes: ForceNode[], options: ForceLayoutOptions): void {
    const k = options.repulsion!;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const distSq = dx * dx + dy * dy + 0.01; // Avoid division by zero
        const dist = Math.sqrt(distSq);

        // Repulsion force (inversely proportional to distance)
        const force = (k * k) / distSq;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        n1.fx -= fx;
        n1.fy -= fy;
        n2.fx += fx;
        n2.fy += fy;
      }
    }
  }

  /**
   * Apply Barnes-Hut approximation for repulsion (O(n log n))
   */
  private applyBarnesHutRepulsion(nodes: ForceNode[], options: ForceLayoutOptions): void {
    // Build quadtree
    const quadtree = this.buildQuadTree(nodes);

    // Apply repulsion using quadtree
    const k = options.repulsion!;
    const theta = options.theta!;

    for (const node of nodes) {
      this.applyNodeRepulsion(node, quadtree, k, theta);
    }
  }

  /**
   * Build quadtree for Barnes-Hut
   */
  private buildQuadTree(nodes: ForceNode[]): QuadTreeNode {
    if (nodes.length === 0) {
      return {
        x: 0,
        y: 0,
        mass: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      };
    }

    // Calculate bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }

    // Create root
    const root: QuadTreeNode = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      mass: 0,
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
    };

    // Insert nodes
    for (const node of nodes) {
      this.insertIntoQuadTree(root, node);
    }

    return root;
  }

  /**
   * Insert node into quadtree
   */
  private insertIntoQuadTree(tree: QuadTreeNode, node: ForceNode): void {
    // Update mass and center of mass
    const totalMass = tree.mass + node.mass;
    tree.x = (tree.x * tree.mass + node.x * node.mass) / totalMass;
    tree.y = (tree.y * tree.mass + node.y * node.mass) / totalMass;
    tree.mass = totalMass;

    // If this is a leaf, either store the node or subdivide
    if (!tree.children) {
      if (!tree.node) {
        tree.node = node;
      } else {
        // Subdivide
        this.subdivideQuadTree(tree);
        this.insertIntoQuadTree(tree, tree.node);
        this.insertIntoQuadTree(tree, node);
        tree.node = undefined;
      }
    } else {
      // Insert into appropriate child
      const childIndex = this.getQuadrant(tree, node);
      this.insertIntoQuadTree(tree.children[childIndex], node);
    }
  }

  /**
   * Subdivide quadtree node
   */
  private subdivideQuadTree(tree: QuadTreeNode): void {
    const midX = (tree.left + tree.right) / 2;
    const midY = (tree.top + tree.bottom) / 2;

    tree.children = [
      // NW
      {
        x: (tree.left + midX) / 2,
        y: (tree.top + midY) / 2,
        mass: 0,
        left: tree.left,
        top: tree.top,
        right: midX,
        bottom: midY,
      },
      // NE
      {
        x: (midX + tree.right) / 2,
        y: (tree.top + midY) / 2,
        mass: 0,
        left: midX,
        top: tree.top,
        right: tree.right,
        bottom: midY,
      },
      // SW
      {
        x: (tree.left + midX) / 2,
        y: (midY + tree.bottom) / 2,
        mass: 0,
        left: tree.left,
        top: midY,
        right: midX,
        bottom: tree.bottom,
      },
      // SE
      {
        x: (midX + tree.right) / 2,
        y: (midY + tree.bottom) / 2,
        mass: 0,
        left: midX,
        top: midY,
        right: tree.right,
        bottom: tree.bottom,
      },
    ];
  }

  /**
   * Get quadrant for node
   */
  private getQuadrant(tree: QuadTreeNode, node: ForceNode): number {
    const midX = (tree.left + tree.right) / 2;
    const midY = (tree.top + tree.bottom) / 2;

    if (node.x < midX) {
      return node.y < midY ? 0 : 2; // NW or SW
    } else {
      return node.y < midY ? 1 : 3; // NE or SE
    }
  }

  /**
   * Apply repulsion from quadtree to node
   */
  private applyNodeRepulsion(
    node: ForceNode,
    tree: QuadTreeNode,
    k: number,
    theta: number
  ): void {
    if (tree.mass === 0) {
      return;
    }

    const dx = tree.x - node.x;
    const dy = tree.y - node.y;
    const distSq = dx * dx + dy * dy + 0.01;
    const dist = Math.sqrt(distSq);

    // Calculate width of quadrant
    const width = tree.right - tree.left;

    // If far enough, use approximation
    if (width / dist < theta) {
      const force = (k * k * tree.mass) / distSq;
      node.fx -= (dx / dist) * force;
      node.fy -= (dy / dist) * force;
    } else if (tree.children) {
      // Recurse into children
      for (const child of tree.children) {
        this.applyNodeRepulsion(node, child, k, theta);
      }
    } else if (tree.node && tree.node !== node) {
      // Apply direct repulsion
      const force = (k * k) / distSq;
      node.fx -= (dx / dist) * force;
      node.fy -= (dy / dist) * force;
    }
  }

  /**
   * Apply attraction forces along edges
   */
  private applyAttraction(
    edges: Array<{ source: ForceNode; target: ForceNode }>,
    options: ForceLayoutOptions
  ): void {
    const k = options.attraction!;
    const idealLength = options.linkDistance!;

    for (const edge of edges) {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;

      // Spring force (Hooke's law)
      const force = k * (dist - idealLength);

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      edge.source.fx += fx;
      edge.source.fy += fy;
      edge.target.fx -= fx;
      edge.target.fy -= fy;
    }
  }

  /**
   * Apply gravity pulling nodes to center
   */
  private applyGravity(nodes: ForceNode[], options: ForceLayoutOptions): void {
    const g = options.gravity!;

    // Calculate center
    let cx = 0, cy = 0;
    for (const node of nodes) {
      cx += node.x;
      cy += node.y;
    }
    cx /= nodes.length;
    cy /= nodes.length;

    // Apply gravity
    for (const node of nodes) {
      const dx = cx - node.x;
      const dy = cy - node.y;

      node.fx += dx * g;
      node.fy += dy * g;
    }
  }

  /**
   * Update node positions based on forces
   */
  private updatePositions(nodes: ForceNode[], temperature: number): number {
    let maxMovement = 0;

    for (const node of nodes) {
      if (node.fixed) {
        continue;
      }

      // Update velocity
      node.vx += node.fx;
      node.vy += node.fy;

      // Apply damping
      node.vx *= 0.9;
      node.vy *= 0.9;

      // Limit velocity by temperature
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > temperature) {
        node.vx = (node.vx / speed) * temperature;
        node.vy = (node.vy / speed) * temperature;
      }

      // Update position
      node.x += node.vx;
      node.y += node.vy;

      // Track movement
      const movement = Math.abs(node.vx) + Math.abs(node.vy);
      maxMovement = Math.max(maxMovement, movement);
    }

    return maxMovement;
  }

  /**
   * Calculate bounding box
   */
  private calculateBounds(nodes: ForceNode[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (nodes.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }

    // Add padding
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Apply incremental layout (Phase 1 compatibility)
   */
  async applyIncremental(
    nodes: NodeModel[],
    links: LinkModel[],
    incrementalOptions: any,
    layoutOptions?: Partial<ForceLayoutOptions>
  ): Promise<LayoutResult & { incremental: any }> {
    // Force-directed layout doesn't support true incremental layout
    // Just apply full layout
    const result = await this.apply(nodes, links, layoutOptions);

    return {
      ...result,
      incremental: {
        newNodeIds: incrementalOptions.newNodeIds || [],
        pinnedNodeIds: [],
        movedNodeIds: nodes.map(n => n.id),
        strategy: 'full-relayout',
        constraintsApplied: 0,
      },
    };
  }

  /**
   * Validate options
   */
  validateOptions(options: Partial<ForceLayoutOptions>): boolean {
    if (options.repulsion !== undefined && options.repulsion < 0) {
      return false;
    }
    if (options.attraction !== undefined && options.attraction < 0) {
      return false;
    }
    if (options.iterations !== undefined && options.iterations < 1) {
      return false;
    }
    if (options.cooling !== undefined && (options.cooling <= 0 || options.cooling > 1)) {
      return false;
    }
    if (options.theta !== undefined && (options.theta <= 0 || options.theta > 1)) {
      return false;
    }
    return true;
  }
}
