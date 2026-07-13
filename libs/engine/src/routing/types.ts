// Routing Types - Core types for smart routing system

import type { Point, Rectangle as GeometryRectangle } from '../types';

// Re-export Rectangle for backward compatibility
export type { GeometryRectangle as Rectangle };

/**
 * A point in the routing grid/space
 */
export interface RoutePoint extends Point {
  /** Optional cost associated with this point */
  cost?: number;
}

/**
 * A segment of a route path
 */
export interface RouteSegment {
  start: RoutePoint;
  end: RoutePoint;
  /** Length of the segment */
  length: number;
  /** Angle in degrees */
  angle: number;
}

/**
 * A complete routed path
 */
export interface RoutedPath {
  /** Ordered points forming the path */
  points: RoutePoint[];
  /** Total path length */
  totalLength: number;
  /** Number of bends/turns in the path */
  bendCount: number;
  /** Optional cost of the path */
  cost?: number;
  /** Route segments */
  segments?: RouteSegment[];
}

/**
 * Obstacle in the routing space (usually a node)
 */
export interface Obstacle extends GeometryRectangle {
  /** Unique identifier */
  id: string;
  /** Optional padding/margin around obstacle */
  margin?: number;
}

/**
 * Routing algorithm type
 */
export type RoutingAlgorithm =
  | 'straight'
  | 'orthogonal'
  | 'manhattan'      // Wave 5 Card 3: grid router with JointJS+-parity knobs
  | 'elk'
  | 'a-star'
  | 'dijkstra'
  | 'visibility-graph'
  | 'custom';

/**
 * Routing options
 */
export interface RoutingOptions {
  /** Algorithm to use */
  algorithm?: RoutingAlgorithm;
  /** Avoid obstacles */
  avoidObstacles?: boolean;
  /** Grid cell size for grid-based algorithms */
  gridSize?: number;
  /** Margin around obstacles */
  obstacleMargin?: number;
  /** Minimize bends (for orthogonal) */
  minimizeBends?: boolean;
  /** Cost weights */
  costs?: {
    distance?: number;
    bends?: number;
    crossings?: number;
  };
  /** Maximum iterations for pathfinding */
  maxIterations?: number;
  /**
   * Wave 5 (Edge routing) — Card 1. Minimum port-anchor stub: the route must
   * leave the source and enter the target PERPENDICULAR to the port side for at
   * least this many px before the first bend. When set it also replaces the
   * built-in 20px breathing-room offset, and a link with FLOATING (direction-
   * less) anchors derives its exit sides from the relative geometry instead of
   * taking the stub-less midline fallback.
   *
   * Unset = legacy behaviour, byte-for-byte: best-effort 20px stubs that can
   * shrink on short links, midline routing for undirected anchors.
   */
  jetty?: number;
  /** Phase 2.2: Simplify path to reduce waypoint count */
  simplifyPath?: boolean;
  /** Phase 2.2: Simplification tolerance (epsilon) - higher values = more aggressive */
  simplificationEpsilon?: number;
}

/**
 * Port direction for routing algorithms that need to respect port orientation
 */
export type PortDirection = 'left' | 'right' | 'top' | 'bottom';

/**
 * Routing request
 */
export interface RouteRequest {
  /** Start point */
  start: Point;
  /** End point */
  end: Point;
  /** Obstacles to avoid */
  obstacles?: Obstacle[];
  /** Routing options */
  options?: RoutingOptions;
  /** Direction the source port points (for orthogonal routing) */
  sourceDirection?: PortDirection;
  /** Direction the target port points (for orthogonal routing) */
  targetDirection?: PortDirection;
}

/**
 * Interface for routing algorithms
 */
export interface IRouter {
  /**
   * Calculate a route from start to end
   * Can be synchronous or asynchronous (for algorithms like ELK.js)
   */
  route(request: RouteRequest): RoutedPath | null | Promise<RoutedPath | null>;

  /**
   * Get algorithm name
   */
  getName(): string;
}

/**
 * Heuristic function for pathfinding
 */
export type HeuristicFunction = (a: Point, b: Point) => number;

/**
 * Cost function for path evaluation
 */
export type CostFunction = (path: RoutedPath) => number;
