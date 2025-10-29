/**
 * Layout Constraints System
 *
 * Provides fine-grained control over node positioning during layout operations.
 * This allows for interactive editing, incremental layouts, and hierarchical positioning.
 */

/**
 * Types of layout constraints that can be applied to nodes
 */
export type ConstraintType = 'pin' | 'fix-x' | 'fix-y' | 'boundary';

/**
 * Boundary definition for constraining node movement
 */
export interface Boundary {
  /** Minimum X coordinate (inclusive) */
  minX?: number;
  /** Maximum X coordinate (inclusive) */
  maxX?: number;
  /** Minimum Y coordinate (inclusive) */
  minY?: number;
  /** Maximum Y coordinate (inclusive) */
  maxY?: number;
}

/**
 * Position definition for pinned nodes
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Constraint definition for a single node
 */
export interface NodeConstraint {
  /** ID of the node this constraint applies to */
  nodeId: string;

  /** Type of constraint */
  type: ConstraintType;

  /**
   * Fixed position for 'pin' constraint
   * The node will be locked to this exact position
   */
  position?: Position;

  /**
   * Fixed value for 'fix-x' or 'fix-y' constraints
   * - For 'fix-x': The X coordinate is locked to this value, Y can vary
   * - For 'fix-y': The Y coordinate is locked to this value, X can vary
   */
  value?: number;

  /**
   * Boundary limits for 'boundary' constraint
   * The node position will be clamped within these bounds
   */
  boundary?: Boundary;

  /**
   * Priority of this constraint (higher = more important)
   * Used when constraints conflict (default: 0)
   */
  priority?: number;
}

/**
 * Collection of layout constraints to apply
 */
export interface LayoutConstraints {
  /** Array of node constraints */
  constraints: NodeConstraint[];

  /**
   * Strategy for handling conflicting constraints
   * - 'priority': Use constraint priority to resolve conflicts
   * - 'first': First constraint wins
   * - 'last': Last constraint wins
   */
  conflictResolution?: 'priority' | 'first' | 'last';
}

/**
 * Helper class for managing and applying layout constraints
 */
export class ConstraintManager {
  private constraints: Map<string, NodeConstraint[]>;

  constructor(constraints?: LayoutConstraints) {
    this.constraints = new Map();
    if (constraints) {
      this.addConstraints(constraints);
    }
  }

  /**
   * Add constraints to the manager
   */
  addConstraints(constraints: LayoutConstraints): void {
    for (const constraint of constraints.constraints) {
      const existing = this.constraints.get(constraint.nodeId) || [];
      existing.push(constraint);
      this.constraints.set(constraint.nodeId, existing);
    }
  }

  /**
   * Get all constraints for a specific node
   */
  getConstraints(nodeId: string): NodeConstraint[] {
    return this.constraints.get(nodeId) || [];
  }

  /**
   * Check if a node has any constraints
   */
  hasConstraints(nodeId: string): boolean {
    return this.constraints.has(nodeId);
  }

  /**
   * Apply constraints to a position, returning the constrained position
   */
  applyConstraints(
    nodeId: string,
    proposedPosition: Position,
    conflictResolution: 'priority' | 'first' | 'last' = 'priority'
  ): Position {
    const nodeConstraints = this.getConstraints(nodeId);
    if (nodeConstraints.length === 0) {
      return proposedPosition;
    }

    // Sort constraints based on resolution strategy
    const sorted = this.sortConstraints(nodeConstraints, conflictResolution);

    let { x, y } = proposedPosition;

    // Apply each constraint in order
    for (const constraint of sorted) {
      switch (constraint.type) {
        case 'pin':
          if (constraint.position) {
            x = constraint.position.x;
            y = constraint.position.y;
          }
          break;

        case 'fix-x':
          if (constraint.value !== undefined) {
            x = constraint.value;
          }
          break;

        case 'fix-y':
          if (constraint.value !== undefined) {
            y = constraint.value;
          }
          break;

        case 'boundary':
          if (constraint.boundary) {
            const b = constraint.boundary;
            if (b.minX !== undefined) x = Math.max(x, b.minX);
            if (b.maxX !== undefined) x = Math.min(x, b.maxX);
            if (b.minY !== undefined) y = Math.max(y, b.minY);
            if (b.maxY !== undefined) y = Math.min(y, b.maxY);
          }
          break;
      }
    }

    return { x, y };
  }

  /**
   * Sort constraints based on conflict resolution strategy
   */
  private sortConstraints(
    constraints: NodeConstraint[],
    strategy: 'priority' | 'first' | 'last'
  ): NodeConstraint[] {
    const sorted = [...constraints];

    switch (strategy) {
      case 'priority':
        // Sort by priority (higher first), then by original order
        sorted.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        break;

      case 'first':
        // Keep original order
        break;

      case 'last':
        // Reverse order
        sorted.reverse();
        break;
    }

    return sorted;
  }

  /**
   * Clear all constraints
   */
  clear(): void {
    this.constraints.clear();
  }

  /**
   * Remove constraints for a specific node
   */
  removeConstraints(nodeId: string): void {
    this.constraints.delete(nodeId);
  }

  /**
   * Get total number of constrained nodes
   */
  getConstrainedNodeCount(): number {
    return this.constraints.size;
  }

  /**
   * Get all constrained node IDs
   */
  getConstrainedNodeIds(): string[] {
    return Array.from(this.constraints.keys());
  }
}
