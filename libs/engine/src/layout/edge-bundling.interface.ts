/**
 * Edge Bundling System
 *
 * Reduces visual clutter by routing similar edges together in bundles.
 * Supports multiple bundling strategies for different use cases.
 *
 * Key features:
 * - Stub bundling for common endpoint edges
 * - Force-directed edge bundling for general cases
 * - Configurable bundling strength and smoothness
 * - Compatible control point generation
 *
 * @module layout/edge-bundling
 */

/**
 * Bundling strategy
 */
export type EdgeBundlingStrategy = 'stub' | 'force-directed' | 'hierarchical' | 'none';

/**
 * Edge information for bundling
 */
export interface EdgeInfo {
  /** Edge unique identifier */
  id: string;

  /** Source node ID */
  sourceNodeId: string;

  /** Target node ID */
  targetNodeId: string;

  /** Source port ID (optional) */
  sourcePortId?: string;

  /** Target port ID (optional) */
  targetPortId?: string;

  /** Edge weight/importance */
  weight?: number;

  /** Group identifier for related edges */
  group?: string;
}

/**
 * Point in 2D space
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Bundled edge path with control points
 */
export interface BundledEdgePath {
  /** Edge ID */
  edgeId: string;

  /** Control points for smooth curve */
  controlPoints: Point2D[];

  /** Bundle ID this edge belongs to */
  bundleId?: string;

  /** Bundling strength applied (0-1) */
  strength: number;
}

/**
 * Configuration for edge bundling
 */
export interface EdgeBundlingOptions {
  /** Enable edge bundling */
  enabled: boolean;

  /** Bundling strategy to use */
  strategy?: EdgeBundlingStrategy;

  /** Bundling strength (0 = no bundling, 1 = maximum bundling) */
  strength?: number;

  /** Number of control points per edge */
  controlPoints?: number;

  /** Smoothness of bundled curves (0-1) */
  smoothness?: number;

  /** Number of iterations for force-directed bundling */
  iterations?: number;

  /** Spring constant for force-directed bundling */
  springConstant?: number;

  /** Compatibility threshold (0-1) for bundling edges together */
  compatibilityThreshold?: number;

  /** Whether to bundle only edges in same group */
  respectGroups?: boolean;

  /** Minimum edge length for bundling */
  minEdgeLength?: number;
}

/**
 * Result of edge bundling computation
 */
export interface EdgeBundlingResult {
  /** Map of edge ID to bundled path */
  bundledPaths: Map<string, BundledEdgePath>;

  /** Number of bundles created */
  bundleCount: number;

  /** Edges that were bundled */
  bundledEdges: string[];

  /** Edges that were not bundled */
  unbundledEdges: string[];

  /** Strategy used */
  strategy: EdgeBundlingStrategy;

  /** Actual strength applied */
  strength: number;
}

/**
 * Edge bundling computation utilities
 */
export class EdgeBundlingManager {
  private static readonly DEFAULT_CONTROL_POINTS = 5;
  private static readonly DEFAULT_STRENGTH = 0.8;
  private static readonly DEFAULT_SMOOTHNESS = 0.9;
  private static readonly DEFAULT_ITERATIONS = 60;
  private static readonly DEFAULT_SPRING_CONSTANT = 0.1;
  private static readonly DEFAULT_COMPATIBILITY_THRESHOLD = 0.6;
  private static readonly DEFAULT_MIN_EDGE_LENGTH = 50;

  /**
   * Compute edge bundling for a set of edges
   */
  static computeBundling(
    edges: EdgeInfo[],
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>,
    options: EdgeBundlingOptions
  ): EdgeBundlingResult {
    if (!options.enabled || !edges.length) {
      return this.createEmptyResult(options.strategy || 'none');
    }

    const strategy = options.strategy || 'stub';
    const strength = options.strength ?? this.DEFAULT_STRENGTH;

    switch (strategy) {
      case 'stub':
        return this.applyStubBundling(edges, nodePositions, portPositions, options);
      case 'force-directed':
        return this.applyForceDirectedBundling(edges, nodePositions, portPositions, options);
      case 'hierarchical':
        return this.applyHierarchicalBundling(edges, nodePositions, portPositions, options);
      default:
        return this.createEmptyResult('none');
    }
  }

  /**
   * Create empty bundling result
   */
  private static createEmptyResult(strategy: EdgeBundlingStrategy): EdgeBundlingResult {
    return {
      bundledPaths: new Map(),
      bundleCount: 0,
      bundledEdges: [],
      unbundledEdges: [],
      strategy,
      strength: 0,
    };
  }

  /**
   * Apply stub bundling - bundles edges sharing common endpoints
   */
  private static applyStubBundling(
    edges: EdgeInfo[],
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>,
    options: EdgeBundlingOptions
  ): EdgeBundlingResult {
    const bundledPaths = new Map<string, BundledEdgePath>();
    const strength = options.strength ?? this.DEFAULT_STRENGTH;
    const controlPointCount = options.controlPoints ?? this.DEFAULT_CONTROL_POINTS;
    const minLength = options.minEdgeLength ?? this.DEFAULT_MIN_EDGE_LENGTH;

    // Group edges by source-target pairs
    const edgeGroups = this.groupEdgesByEndpoints(edges, options.respectGroups);

    let bundleId = 0;
    const bundledEdges: string[] = [];
    const unbundledEdges: string[] = [];

    for (const [key, groupEdges] of edgeGroups) {
      if (groupEdges.length < 2) {
        // Single edge - no bundling needed
        for (const edge of groupEdges) {
          const path = this.createStraightPath(edge, nodePositions, portPositions, controlPointCount);
          if (path) {
            bundledPaths.set(edge.id, { ...path, strength: 0 });
            unbundledEdges.push(edge.id);
          }
        }
        continue;
      }

      // Multiple edges with same endpoints - apply stub bundling
      const bundleKey = `bundle-${bundleId++}`;

      for (let i = 0; i < groupEdges.length; i++) {
        const edge = groupEdges[i];
        const sourcePos = this.getEdgeEndpoint(edge, 'source', nodePositions, portPositions);
        const targetPos = this.getEdgeEndpoint(edge, 'target', nodePositions, portPositions);

        if (!sourcePos || !targetPos) continue;

        const edgeLength = this.distance(sourcePos, targetPos);
        if (edgeLength < minLength) {
          // Edge too short for bundling
          const path = this.createStraightPath(edge, nodePositions, portPositions, controlPointCount);
          if (path) {
            bundledPaths.set(edge.id, { ...path, strength: 0 });
            unbundledEdges.push(edge.id);
          }
          continue;
        }

        // Create bundled path with stub
        const offset = (i - (groupEdges.length - 1) / 2) * 20; // Spread edges
        const bundledPath = this.createStubBundledPath(
          edge,
          sourcePos,
          targetPos,
          offset,
          strength,
          controlPointCount,
          bundleKey
        );

        bundledPaths.set(edge.id, bundledPath);
        bundledEdges.push(edge.id);
      }
    }

    return {
      bundledPaths,
      bundleCount: bundleId,
      bundledEdges,
      unbundledEdges,
      strategy: 'stub',
      strength,
    };
  }

  /**
   * Create stub bundled path for an edge
   */
  private static createStubBundledPath(
    edge: EdgeInfo,
    source: Point2D,
    target: Point2D,
    offset: number,
    strength: number,
    controlPointCount: number,
    bundleId: string
  ): BundledEdgePath {
    const controlPoints: Point2D[] = [];

    // Calculate stub point (midpoint offset perpendicular to edge)
    const mid = {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2,
    };

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / length;
    const perpY = dx / length;

    const stubPoint = {
      x: mid.x + perpX * offset * strength,
      y: mid.y + perpY * offset * strength,
    };

    // Generate control points from source to stub to target
    for (let i = 0; i <= controlPointCount; i++) {
      const t = i / controlPointCount;

      if (t < 0.5) {
        // Source to stub
        const localT = t * 2;
        controlPoints.push({
          x: source.x + (stubPoint.x - source.x) * localT,
          y: source.y + (stubPoint.y - source.y) * localT,
        });
      } else {
        // Stub to target
        const localT = (t - 0.5) * 2;
        controlPoints.push({
          x: stubPoint.x + (target.x - stubPoint.x) * localT,
          y: stubPoint.y + (target.y - stubPoint.y) * localT,
        });
      }
    }

    return {
      edgeId: edge.id,
      controlPoints,
      bundleId,
      strength,
    };
  }

  /**
   * Apply force-directed edge bundling
   */
  private static applyForceDirectedBundling(
    edges: EdgeInfo[],
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>,
    options: EdgeBundlingOptions
  ): EdgeBundlingResult {
    const bundledPaths = new Map<string, BundledEdgePath>();
    const strength = options.strength ?? this.DEFAULT_STRENGTH;
    const controlPointCount = options.controlPoints ?? this.DEFAULT_CONTROL_POINTS;
    const iterations = options.iterations ?? this.DEFAULT_ITERATIONS;
    const springK = options.springConstant ?? this.DEFAULT_SPRING_CONSTANT;
    const compatThreshold = options.compatibilityThreshold ?? this.DEFAULT_COMPATIBILITY_THRESHOLD;

    // Initialize subdivision points for each edge
    const edgeSubdivisions = new Map<string, Point2D[]>();

    for (const edge of edges) {
      const sourcePos = this.getEdgeEndpoint(edge, 'source', nodePositions, portPositions);
      const targetPos = this.getEdgeEndpoint(edge, 'target', nodePositions, portPositions);

      if (!sourcePos || !targetPos) continue;

      // Create initial subdivision points (straight line)
      const points: Point2D[] = [];
      for (let i = 0; i <= controlPointCount; i++) {
        const t = i / controlPointCount;
        points.push({
          x: sourcePos.x + (targetPos.x - sourcePos.x) * t,
          y: sourcePos.y + (targetPos.y - sourcePos.y) * t,
        });
      }

      edgeSubdivisions.set(edge.id, points);
    }

    // Run force-directed iterations
    for (let iter = 0; iter < iterations; iter++) {
      // Calculate forces between compatible edges
      for (let i = 0; i < edges.length; i++) {
        const edge1 = edges[i];
        const points1 = edgeSubdivisions.get(edge1.id);
        if (!points1) continue;

        for (let j = i + 1; j < edges.length; j++) {
          const edge2 = edges[j];

          // Check compatibility
          if (options.respectGroups && edge1.group !== edge2.group) continue;

          const compatibility = this.calculateEdgeCompatibility(
            edge1,
            edge2,
            nodePositions,
            portPositions
          );

          if (compatibility < compatThreshold) continue;

          const points2 = edgeSubdivisions.get(edge2.id);
          if (!points2) continue;

          // Apply spring forces between corresponding subdivision points
          for (let k = 1; k < points1.length - 1; k++) {
            const p1 = points1[k];
            const p2 = points2[k];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
              const force = springK * compatibility * strength;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              p1.x += fx;
              p1.y += fy;
              p2.x -= fx;
              p2.y -= fy;
            }
          }
        }
      }
    }

    // Create bundled paths from subdivisions
    const bundledEdges: string[] = [];
    for (const edge of edges) {
      const points = edgeSubdivisions.get(edge.id);
      if (points) {
        bundledPaths.set(edge.id, {
          edgeId: edge.id,
          controlPoints: points,
          strength,
        });
        bundledEdges.push(edge.id);
      }
    }

    return {
      bundledPaths,
      bundleCount: Math.ceil(edges.length / 2), // Approximate
      bundledEdges,
      unbundledEdges: [],
      strategy: 'force-directed',
      strength,
    };
  }

  /**
   * Apply hierarchical edge bundling (placeholder for future implementation)
   */
  private static applyHierarchicalBundling(
    edges: EdgeInfo[],
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>,
    options: EdgeBundlingOptions
  ): EdgeBundlingResult {
    // Hierarchical bundling requires tree structure information
    // For now, fall back to stub bundling
    return this.applyStubBundling(edges, nodePositions, portPositions, options);
  }

  /**
   * Calculate compatibility between two edges
   */
  private static calculateEdgeCompatibility(
    edge1: EdgeInfo,
    edge2: EdgeInfo,
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>
  ): number {
    const p1 = this.getEdgeEndpoint(edge1, 'source', nodePositions, portPositions);
    const q1 = this.getEdgeEndpoint(edge1, 'target', nodePositions, portPositions);
    const p2 = this.getEdgeEndpoint(edge2, 'source', nodePositions, portPositions);
    const q2 = this.getEdgeEndpoint(edge2, 'target', nodePositions, portPositions);

    if (!p1 || !q1 || !p2 || !q2) return 0;

    // Angle compatibility
    const v1 = { x: q1.x - p1.x, y: q1.y - p1.y };
    const v2 = { x: q2.x - p2.x, y: q2.y - p2.y };
    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (len1 === 0 || len2 === 0) return 0;

    const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    const angleCompatibility = Math.abs(dot);

    // Scale compatibility
    const lmin = Math.min(len1, len2);
    const lmax = Math.max(len1, len2);
    const scaleCompatibility = 2 / (lmin / lmax + lmax / lmin);

    // Position compatibility
    const mid1 = { x: (p1.x + q1.x) / 2, y: (p1.y + q1.y) / 2 };
    const mid2 = { x: (p2.x + q2.x) / 2, y: (p2.y + q2.y) / 2 };
    const lavg = (len1 + len2) / 2;
    const midDist = this.distance(mid1, mid2);
    const positionCompatibility = lavg / (lavg + midDist);

    // Visibility compatibility
    const i0 = this.project(p2, p1, q1);
    const i1 = this.project(q2, p1, q1);
    const visibilityCompatibility = Math.max(
      0,
      1 - (2 * Math.max(this.distance(i0, mid1), this.distance(i1, mid1))) / this.distance(i0, i1)
    );

    // Combined compatibility
    return angleCompatibility * scaleCompatibility * positionCompatibility * visibilityCompatibility;
  }

  /**
   * Group edges by their endpoints
   */
  private static groupEdgesByEndpoints(
    edges: EdgeInfo[],
    respectGroups?: boolean
  ): Map<string, EdgeInfo[]> {
    const groups = new Map<string, EdgeInfo[]>();

    for (const edge of edges) {
      const key = respectGroups
        ? `${edge.sourceNodeId}-${edge.targetNodeId}-${edge.group || ''}`
        : `${edge.sourceNodeId}-${edge.targetNodeId}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(edge);
    }

    return groups;
  }

  /**
   * Create straight path for an edge (no bundling)
   */
  private static createStraightPath(
    edge: EdgeInfo,
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>,
    controlPointCount: number
  ): BundledEdgePath | null {
    const source = this.getEdgeEndpoint(edge, 'source', nodePositions, portPositions);
    const target = this.getEdgeEndpoint(edge, 'target', nodePositions, portPositions);

    if (!source || !target) return null;

    const controlPoints: Point2D[] = [];
    for (let i = 0; i <= controlPointCount; i++) {
      const t = i / controlPointCount;
      controlPoints.push({
        x: source.x + (target.x - source.x) * t,
        y: source.y + (target.y - source.y) * t,
      });
    }

    return {
      edgeId: edge.id,
      controlPoints,
      strength: 0,
    };
  }

  /**
   * Get endpoint position for an edge
   */
  private static getEdgeEndpoint(
    edge: EdgeInfo,
    end: 'source' | 'target',
    nodePositions: Map<string, Point2D>,
    portPositions: Map<string, Point2D>
  ): Point2D | null {
    const portId = end === 'source' ? edge.sourcePortId : edge.targetPortId;
    const nodeId = end === 'source' ? edge.sourceNodeId : edge.targetNodeId;

    // Try port position first
    if (portId && portPositions.has(portId)) {
      return portPositions.get(portId)!;
    }

    // Fall back to node position
    return nodePositions.get(nodeId) || null;
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private static distance(p1: Point2D, p2: Point2D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Project point onto line segment
   */
  private static project(point: Point2D, lineStart: Point2D, lineEnd: Point2D): Point2D {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return { ...lineStart };

    const t = Math.max(
      0,
      Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq)
    );

    return {
      x: lineStart.x + t * dx,
      y: lineStart.y + t * dy,
    };
  }
}
