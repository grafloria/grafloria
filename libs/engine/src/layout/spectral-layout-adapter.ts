/**
 * Spectral Layout Adapter
 *
 * Uses graph spectral theory (eigenvalues/eigenvectors) for optimal node placement.
 * Minimizes edge crossings and preserves graph symmetry mathematically.
 *
 * Best for:
 * - Circuit diagrams
 * - Network topology
 * - Symmetric graphs
 * - Mathematical optimization
 *
 * Algorithm: Graph Laplacian spectral decomposition
 *
 * @module layout/spectral-layout-adapter
 */

import { NodeModel } from '../models/NodeModel';
import { createLayoutRng, type LayoutRng } from './rng';
import { LinkModel } from '../models/LinkModel';
import { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
import { LayoutQualityMetrics } from './layout-quality-metrics';

/**
 * Spectral layout options
 */
export interface SpectralLayoutOptions extends LayoutOptions {
  /** Use normalized Laplacian (default: true) */
  normalized?: boolean;

  /** Number of dimensions to compute (default: 2) */
  dimensions?: number;

  /** Scale factor for positions (default: 500) */
  scale?: number;

  /** Center the layout (default: true) */
  center?: boolean;

  /** Power iteration convergence threshold (default: 1e-6) */
  convergenceThreshold?: number;

  /** Maximum power iterations (default: 1000) */
  maxIterations?: number;
}

/**
 * Matrix helper class
 */
class Matrix {
  data: number[][];
  rows: number;
  cols: number;

  constructor(rows: number, cols: number, fill = 0) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(rows)
      .fill(0)
      .map(() => Array(cols).fill(fill));
  }

  get(i: number, j: number): number {
    return this.data[i][j];
  }

  set(i: number, j: number, value: number): void {
    this.data[i][j] = value;
  }

  add(other: Matrix): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j) + other.get(i, j));
      }
    }
    return result;
  }

  subtract(other: Matrix): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j) - other.get(i, j));
      }
    }
    return result;
  }

  multiply(scalar: number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j) * scalar);
      }
    }
    return result;
  }

  multiplyVector(v: number[]): number[] {
    const result = new Array(this.rows).fill(0);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result[i] += this.get(i, j) * v[j];
      }
    }
    return result;
  }

  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(j, i, this.get(i, j));
      }
    }
    return result;
  }
}

/**
 * Vector operations
 */
class VectorOps {
  static dot(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  static norm(v: number[]): number {
    return Math.sqrt(this.dot(v, v));
  }

  static normalize(v: number[]): number[] {
    const n = this.norm(v);
    return v.map(x => x / (n + 1e-10));
  }

  static subtract(a: number[], b: number[]): number[] {
    return a.map((x, i) => x - b[i]);
  }

  static add(a: number[], b: number[]): number[] {
    return a.map((x, i) => x + b[i]);
  }

  static multiply(v: number[], scalar: number): number[] {
    return v.map(x => x * scalar);
  }
}

/**
 * Spectral Layout Adapter
 *
 * Uses eigendecomposition of graph Laplacian for optimal layout.
 */
export class SpectralLayoutAdapter implements LayoutAdapter {
  readonly name = 'spectral';

  /**
   * Card 0: the run's seeded generator. Established once per apply() so every
   * helper below draws from the SAME reproducible stream — the seed alone is not
   * enough if each helper mints its own generator.
   */
  private rng: LayoutRng = createLayoutRng();

  /**
   * Apply spectral layout
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<SpectralLayoutOptions> = {}
  ): Promise<LayoutResult> {
    this.rng = createLayoutRng((options as { seed?: number } | undefined)?.seed);
    const startTime = performance.now();

    // Merge with defaults
    const opts: SpectralLayoutOptions = {
      normalized: options.normalized ?? true,
      dimensions: options.dimensions ?? 2,
      scale: options.scale ?? 500,
      center: options.center ?? true,
      convergenceThreshold: options.convergenceThreshold ?? 1e-6,
      maxIterations: options.maxIterations ?? 1000,
      ...options,
    };

    const n = nodes.length;

    if (n === 0) {
      return {
        nodePositions: new Map(),
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        metadata: {
          algorithm: 'spectral',
          executionTime: performance.now() - startTime,
          nodeCount: 0,
          linkCount: 0,
        },
      };
    }

    // Build node index map
    const nodeIndexMap = new Map(nodes.map((node, i) => [node.id, i]));

    // Build adjacency matrix
    const adjacency = new Matrix(n, n, 0);
    const validLinks = links.filter(
      link => link.sourceNodeId && link.targetNodeId
    );

    for (const link of validLinks) {
      const i = nodeIndexMap.get(link.sourceNodeId!);
      const j = nodeIndexMap.get(link.targetNodeId!);

      if (i !== undefined && j !== undefined) {
        adjacency.set(i, j, 1);
        adjacency.set(j, i, 1); // Undirected
      }
    }

    // Build degree matrix
    const degree = new Matrix(n, n, 0);
    for (let i = 0; i < n; i++) {
      let deg = 0;
      for (let j = 0; j < n; j++) {
        deg += adjacency.get(i, j);
      }
      degree.set(i, i, deg);
    }

    // Build Laplacian matrix: L = D - A
    const laplacian = degree.subtract(adjacency);

    // For normalized Laplacian: L_norm = D^(-1/2) * L * D^(-1/2)
    let L = laplacian;
    if (opts.normalized) {
      const D_inv_sqrt = new Matrix(n, n, 0);
      for (let i = 0; i < n; i++) {
        const deg = degree.get(i, i);
        D_inv_sqrt.set(i, i, deg > 0 ? 1 / Math.sqrt(deg) : 0);
      }

      // L_norm = D^(-1/2) * L * D^(-1/2)
      const temp = new Matrix(n, n, 0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          let sum = 0;
          for (let k = 0; k < n; k++) {
            sum += D_inv_sqrt.get(i, k) * laplacian.get(k, j);
          }
          temp.set(i, j, sum);
        }
      }

      L = new Matrix(n, n, 0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          let sum = 0;
          for (let k = 0; k < n; k++) {
            sum += temp.get(i, k) * D_inv_sqrt.get(k, j);
          }
          L.set(i, j, sum);
        }
      }
    }

    // Compute smallest non-zero eigenvectors using power iteration
    // For spectral layout, we want eigenvectors 2 and 3 (after trivial eigenvector)
    const eigenvectors: number[][] = [];

    for (let dim = 0; dim < Math.min(opts.dimensions!, n - 1); dim++) {
      const eigenvector = this.computeEigenvector(
        L,
        eigenvectors,
        opts.maxIterations!,
        opts.convergenceThreshold!
      );
      eigenvectors.push(eigenvector);
    }

    // If we have fewer eigenvectors than dimensions, pad with random
    while (eigenvectors.length < opts.dimensions!) {
      eigenvectors.push(
        Array(n)
          .fill(0)
          .map(() => this.rng.next() - 0.5) // Card 0: seeded, was Math.random()
      );
    }

    // Build positions from eigenvectors
    const nodePositions = new Map<string, { x: number; y: number }>();

    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const x = eigenvectors[0][i] * opts.scale!;
      const y = eigenvectors[1][i] * opts.scale!;

      nodePositions.set(node.id, { x, y });
    }

    // Center the layout
    if (opts.center) {
      let cx = 0, cy = 0;
      nodePositions.forEach(pos => {
        cx += pos.x;
        cy += pos.y;
      });
      cx /= nodePositions.size;
      cy /= nodePositions.size;

      nodePositions.forEach((pos, id) => {
        nodePositions.set(id, {
          x: pos.x - cx,
          y: pos.y - cy,
        });
      });
    }

    // Apply positions to nodes
    nodes.forEach(node => {
      const position = nodePositions.get(node.id);
      if (position) {
        node.setPosition(position.x, position.y);
      }
    });

    // Calculate bounds
    const bounds = this.calculateBounds(nodePositions);

    const endTime = performance.now();

    // Calculate quality metrics if requested
    let quality = undefined;
    if (options.calculateQuality) {
      quality = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
        canvasDimensions: options.canvasDimensions,
      });
    }

    return {
      nodePositions,
      bounds,
      metadata: {
        algorithm: 'spectral',
        normalized: opts.normalized,
        dimensions: opts.dimensions,
        executionTime: endTime - startTime,
        nodeCount: nodes.length,
        linkCount: links.length,
      },
      quality,
    };
  }

  /**
   * Compute eigenvector using power iteration
   */
  private computeEigenvector(
    matrix: Matrix,
    previousEigenvectors: number[][],
    maxIterations: number,
    threshold: number
  ): number[] {
    const n = matrix.rows;

    // Initialize with random vector
    let v = Array(n)
      .fill(0)
      .map(() => this.rng.next() - 0.5); // Card 0: seeded, was Math.random()
    v = VectorOps.normalize(v);

    // Orthogonalize against previous eigenvectors
    for (const prev of previousEigenvectors) {
      const dot = VectorOps.dot(v, prev);
      v = VectorOps.subtract(v, VectorOps.multiply(prev, dot));
    }
    v = VectorOps.normalize(v);

    let converged = false;
    let iteration = 0;

    while (!converged && iteration < maxIterations) {
      // v_new = L * v
      const v_new_raw = matrix.multiplyVector(v);

      // Orthogonalize
      let v_new = v_new_raw;
      for (const prev of previousEigenvectors) {
        const dot = VectorOps.dot(v_new, prev);
        v_new = VectorOps.subtract(v_new, VectorOps.multiply(prev, dot));
      }

      // Normalize
      v_new = VectorOps.normalize(v_new);

      // Check convergence
      const diff = VectorOps.subtract(v_new, v);
      const change = VectorOps.norm(diff);

      if (change < threshold) {
        converged = true;
      }

      v = v_new;
      iteration++;
    }

    return v;
  }

  /**
   * Calculate bounding box
   */
  private calculateBounds(
    positions: Map<string, { x: number; y: number }>
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (positions.size === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

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
    layoutOptions?: Partial<SpectralLayoutOptions>
  ): Promise<LayoutResult & { incremental: any }> {
    // Spectral layout doesn't support true incremental layout
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
  validateOptions(options: Partial<SpectralLayoutOptions>): boolean {
    if (options.dimensions !== undefined && options.dimensions < 1) {
      return false;
    }
    if (options.scale !== undefined && options.scale <= 0) {
      return false;
    }
    if (options.maxIterations !== undefined && options.maxIterations < 1) {
      return false;
    }
    return true;
  }
}
