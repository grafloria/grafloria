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
import { nodeSize } from './component-packing';
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

  /**
   * The engine-wide "give me the algorithm's raw output" escape hatch
   * (see UnifiedLayoutOptions in layout-registry.ts). `false` skips the
   * adapter's snapshot-time residual-overlap cleanup too, so what comes back
   * is literally the simulation state — same meaning as everywhere else.
   */
  removeOverlaps?: boolean;
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
  /** The node's box, so the physics can keep BOXES apart, not just points. */
  width: number;
  height: number;
  /** Half the box diagonal — the collision radius the forces reason about. */
  radius: number;
}

/**
 * Barnes-Hut quadtree node
 */
interface QuadTreeNode {
  x: number;
  y: number;
  mass: number;
  /** Mass-weighted mean collision radius of everything in this cell, so the
   *  far-field approximation stays size-aware (see applyBarnesHutRepulsion). */
  radius: number;
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
        // Hand over a picture whose BOXES do not overlap. The physics is
        // size-aware, but a run can stop early (iteration cap, threshold,
        // cancellation) with residue — and downstream overlap removal is an
        // x-only sweep, so any residue it inherits becomes pure horizontal
        // spread (the cigar). A uniform scale about the centroid clears it
        // while preserving the layout's shape exactly. Pure: sim state is
        // not mutated, so snapshot() stays valid mid-run.
        //
        // `removeOverlaps: false` is the caller saying "raw output, please" —
        // honour it here exactly as component-packing honours it downstream,
        // or the escape hatch would be a lie on the one algorithm anybody
        // would want it for.
        const nodePositions =
          opts.removeOverlaps === false
            ? new Map(forceNodes.map(n => [n.id, { x: n.x, y: n.y }]))
            : adapter.resolveResidualOverlap(forceNodes);

        return {
          nodePositions,
          bounds: adapter.calculateBounds([...nodePositions.values()]),
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

    // The cigar bug (wave: layout-cigar): initial positions must give the BOXES
    // room. The old ±250 random square holds ~50 default-sized boxes; seed 2000
    // nodes into it and the simulation freezes (the temperature schedule allows
    // only ~2000px of total travel) long before repulsion can inflate the cloud
    // to a viable density. The residue was a heavily box-overlapping blob, and
    // the downstream x-only overlap sweep then converted ALL of that overlap
    // into pure x-spread — the measured 6-7:1 horizontal cigar.
    //
    // So: start at the DENSITY THE BOXES NEED, not at a fixed size. A sunflower
    // (phyllotaxis) spiral with the ring pitch set to the mean box diagonal
    // packs n boxes into a disc with near-uniform, near-contact spacing — the
    // physics then only has to refine locally, which fits the travel budget at
    // every graph size. Seeded jitter keeps runs reproducible (Card 0) while
    // different seeds still give genuinely different pictures.
    let meanDiagonal = 0;
    for (const node of nodes) {
      const size = nodeSize(node);
      meanDiagonal += Math.hypot(size.width, size.height);
    }
    meanDiagonal /= Math.max(nodes.length, 1);
    const pitch = meanDiagonal + 16;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

    let index = 0;
    for (const node of nodes) {
      let x: number, y: number;

      if (options.randomize) {
        // Card 0: SEEDED. This was `Math.random()`, so the same graph produced a
        // different picture on every run — untestable, unreproducible on reload,
        // and it makes the mental-map card undefinable (you cannot minimise
        // movement against a baseline that itself moves).
        const r = pitch * Math.sqrt(index + 0.5);
        const angle = index * GOLDEN_ANGLE;
        x = r * Math.cos(angle) + rng.between(-0.3 * pitch, 0.3 * pitch);
        y = r * Math.sin(angle) + rng.between(-0.3 * pitch, 0.3 * pitch);
      } else {
        // Use existing position
        x = node.position.x;
        y = node.position.y;
      }
      index++;

      const size = nodeSize(node);
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
        width: size.width,
        height: size.height,
        radius: Math.hypot(size.width, size.height) / 2,
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

        // Repulse by BOX GAP, not centre distance: the force diverges as the
        // boxes approach contact, so the simulation itself keeps them apart
        // instead of leaving a pile for a post-pass to shove sideways.
        const gap = Math.max(dist - (n1.radius + n2.radius), 1);
        const force = (k * k) / (gap * gap);

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
    const kk = k * k;
    const theta = options.theta!;

    // Iterative traversal with one shared stack, hoisted locals, and a single
    // division per visited cell — (dx/dist)·(k²m/gap²) is algebraically
    // dx·k²m/(gap²·dist). This inner loop runs millions of times per layout
    // (~64 cell visits × n nodes × iterations) and was ~90% of the
    // simulation's wall time on a 900-node mesh; the flattening plus the
    // merged division roughly halve it. Same visit set, same forces.
    const stack: QuadTreeNode[] = [];
    for (const node of nodes) {
      const nx = node.x;
      const ny = node.y;
      const nr = node.radius;
      let fx = 0;
      let fy = 0;
      let top = 0;
      stack[top++] = quadtree;

      while (top > 0) {
        const tree = stack[--top];
        if (tree.mass === 0) continue;

        const dx = tree.x - nx;
        const dy = tree.y - ny;
        const dist = Math.sqrt(dx * dx + dy * dy + 0.01);

        if ((tree.right - tree.left) / dist < theta) {
          // Far enough: treat the whole cell as one size-aware body
          let gap = dist - nr - tree.radius;
          if (gap < 1) gap = 1;
          const f = (kk * tree.mass) / (gap * gap * dist);
          fx -= dx * f;
          fy -= dy * f;
        } else if (tree.children) {
          const children = tree.children;
          stack[top++] = children[0];
          stack[top++] = children[1];
          stack[top++] = children[2];
          stack[top++] = children[3];
        } else if (tree.node && tree.node !== node) {
          let gap = dist - nr - tree.node.radius;
          if (gap < 1) gap = 1;
          const f = kk / (gap * gap * dist);
          fx -= dx * f;
          fy -= dy * f;
        }
      }

      node.fx += fx;
      node.fy += fy;
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
        radius: 0,
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
      radius: 0,
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
    // Update mass, center of mass, and mean collision radius
    const totalMass = tree.mass + node.mass;
    tree.x = (tree.x * tree.mass + node.x * node.mass) / totalMass;
    tree.y = (tree.y * tree.mass + node.y * node.mass) / totalMass;
    tree.radius = (tree.radius * tree.mass + node.radius * node.mass) / totalMass;
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
        radius: 0,
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
        radius: 0,
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
        radius: 0,
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
        radius: 0,
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
   * Apply attraction forces along edges
   */
  private applyAttraction(
    edges: Array<{ source: ForceNode; target: ForceNode }>,
    options: ForceLayoutOptions
  ): void {
    const k = options.attraction!;
    const baseLength = options.linkDistance!;

    for (const edge of edges) {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;

      // Spring force (Hooke's law). `linkDistance` is the desired VISIBLE edge
      // — the space between the boxes — so the spring's rest length adds the
      // two collision radii. Without this, the default 100px rest length is
      // shorter than two default boxes side by side, and every edge actively
      // pulls its endpoints into overlap.
      const idealLength = baseLength + edge.source.radius + edge.target.radius;
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

    // A pull that grows linearly with distance forever is scale-dependent: on a
    // 900-node graph the rim sits thousands of px out, gravity dwarfs every
    // other force, and the graph is crushed into an overlapping blob (which the
    // x-only downstream sweep then smears into the cigar). Saturate the pull
    // beyond a couple of edge lengths — compact graphs (everything within
    // `gravityRange` of the centre) are numerically UNCHANGED, big graphs keep
    // a gentle, size-independent centring pressure.
    const gravityRange = 2 * options.linkDistance!;

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
      const dist = Math.hypot(dx, dy);

      if (dist <= gravityRange || dist === 0) {
        node.fx += dx * g;
        node.fy += dy * g;
      } else {
        const saturated = (g * gravityRange) / dist;
        node.fx += dx * saturated;
        node.fy += dy * saturated;
      }
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
   * The last line of defence against the cigar (wave: layout-cigar).
   *
   * The size-aware forces keep boxes apart at equilibrium, but a run can stop
   * before equilibrium (iteration cap, cooling, cancellation). Whatever box
   * overlap remains would otherwise be resolved by overlap-removal.ts, whose
   * sweep separates strictly along X — measured on a 15x15 mesh, that turned
   * an aspect-1.0 force layout into an aspect-6.7 horizontal wedge. So the
   * simulation cleans up after itself, axis-symmetrically:
   *
   *   1. ZOOM. If the field is BROADLY too dense, scale every position
   *      uniformly about the centroid — a pure zoom preserves the layout's
   *      shape exactly, and growing the scale never creates a new overlap.
   *      The factor is what clears 90% of the overlapping pairs (capped):
   *      chasing the single worst pair was measured to inflate a perfect
   *      3950px mesh 4.5x for the sake of a couple of stragglers.
   *   2. LOCAL PASSES. The stragglers are pushed apart pairwise along their
   *      minimum-translation axis, both nodes moving symmetrically. Pairwise
   *      relaxation famously does not converge on a PILE (see
   *      overlap-removal.ts's header) — but after the physics and the zoom
   *      there is no pile, only isolated collisions, which it resolves in a
   *      pass or two. Anything truly pathological is left for the downstream
   *      sweep, where a handful of x-only nudges cannot bend the aspect.
   *
   * Deterministic (stable orders, no randomness), pure with respect to the
   * simulation state, and skipped when a node is pinned — a pin is a promise
   * about absolute coordinates.
   */
  private resolveResidualOverlap(
    forceNodes: ForceNode[]
  ): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    forceNodes.forEach(node => {
      positions.set(node.id, { x: node.x, y: node.y });
    });
    if (forceNodes.length < 2 || forceNodes.some(n => n.fixed)) return positions;

    // Clearance to open between boxes that were overlapping. Anything > 0
    // makes the downstream sweep a no-op; a few px keeps boxes readable.
    const margin = 8;

    interface Box { id: string; x: number; y: number; width: number; height: number }
    const boxes: Box[] = forceNodes.map(n => ({
      id: n.id, x: n.x, y: n.y, width: n.width, height: n.height,
    }));

    // Overlapping pairs (within `margin`), via the same (x, id) sort-sweep
    // overlap-removal.ts uses to stay near-linear on a mostly-separated field.
    const overlappingPairs = (): Array<[Box, Box]> => {
      const sorted = [...boxes].sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
      const pairs: Array<[Box, Box]> = [];
      const active: Box[] = [];
      for (const box of sorted) {
        for (let i = active.length - 1; i >= 0; i--) {
          if (active[i].x + active[i].width + margin <= box.x) active.splice(i, 1);
        }
        for (const other of active) {
          if (
            box.x < other.x + other.width + margin &&
            other.x < box.x + box.width + margin &&
            box.y < other.y + other.height + margin &&
            other.y < box.y + box.height + margin
          ) {
            pairs.push([other, box]);
          }
        }
        active.push(box);
      }
      return pairs;
    };

    // ------------------------------------------------------------------ zoom
    const needs: number[] = [];
    for (const [a, b] of overlappingPairs()) {
      // After a zoom by s the delta between two positions is s·d, so clearing
      // a pair on ONE axis needs s·|d| ≥ (leading box's extent + margin) on
      // that axis; the pair needs its cheaper axis.
      const dx = b.x - a.x; // ≥ 0: `a` entered the sweep first
      const dy = b.y - a.y;
      const sx = dx > 0 ? (a.width + margin) / dx : Infinity;
      const sy =
        dy > 0 ? (a.height + margin) / dy
        : dy < 0 ? (b.height + margin) / -dy
        : Infinity;
      needs.push(Math.min(sx, sy));
    }

    if (needs.length > 0) {
      needs.sort((a, b) => a - b);
      const p90 = needs[Math.min(needs.length - 1, Math.ceil(needs.length * 0.9) - 1)];
      const scale = Math.min(Math.max(p90, 1), 2);
      if (scale > 1) {
        let cx = 0, cy = 0;
        for (const box of boxes) {
          cx += box.x;
          cy += box.y;
        }
        cx /= boxes.length;
        cy /= boxes.length;
        for (const box of boxes) {
          box.x = cx + (box.x - cx) * scale;
          box.y = cy + (box.y - cy) * scale;
        }
      }
    }

    // ---------------------------------------------------------- local passes
    for (let pass = 0; pass < 4; pass++) {
      const pairs = overlappingPairs();
      if (pairs.length === 0) break;
      for (const [a, b] of pairs) {
        const overlapX = Math.min(a.x + a.width, b.x + b.width) + margin - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) + margin - Math.max(a.y, b.y);
        if (overlapX <= 0 || overlapY <= 0) continue; // an earlier push freed it

        // Minimum-translation axis, split evenly so the pair's midpoint — and
        // with it the picture's balance — stays put.
        if (overlapX <= overlapY) {
          const push = overlapX / 2;
          if (a.x <= b.x) { a.x -= push; b.x += push; }
          else { a.x += push; b.x -= push; }
        } else {
          const push = overlapY / 2;
          if (a.y <= b.y) { a.y -= push; b.y += push; }
          else { a.y += push; b.y -= push; }
        }
      }
    }

    for (const box of boxes) {
      positions.set(box.id, { x: box.x, y: box.y });
    }
    return positions;
  }

  /**
   * Calculate bounding box
   */
  private calculateBounds(points: Array<{ x: number; y: number }>): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of points) {
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
