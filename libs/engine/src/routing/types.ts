// Routing Types - Core types for smart routing system

import type { Point } from '../types';

/**
 * Rectangle shape
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
export interface Obstacle extends Rectangle {
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
}

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
}

/**
 * Interface for routing algorithms
 */
export interface IRouter {
  /**
   * Calculate a route from start to end
   */
  route(request: RouteRequest): RoutedPath | null;

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
