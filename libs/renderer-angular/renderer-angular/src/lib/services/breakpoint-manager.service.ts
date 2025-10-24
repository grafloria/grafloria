import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Breakpoint type
 */
export enum BreakpointType {
  /** Break before node execution */
  BEFORE = 'before',
  /** Break after node execution */
  AFTER = 'after',
  /** Break on condition */
  CONDITIONAL = 'conditional',
}

/**
 * Breakpoint condition function
 */
export type BreakpointCondition = (context: any) => boolean;

/**
 * Breakpoint definition
 */
export interface Breakpoint {
  /** Unique breakpoint ID */
  id: string;

  /** Node ID where breakpoint is set */
  nodeId: string;

  /** Breakpoint type */
  type: BreakpointType;

  /** Whether breakpoint is enabled */
  enabled: boolean;

  /** Condition for conditional breakpoints */
  condition?: BreakpointCondition;

  /** Condition expression (for display) */
  conditionExpression?: string;

  /** Hit count (how many times breakpoint was hit) */
  hitCount: number;

  /** Creation timestamp */
  createdAt: number;

  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Breakpoint hit event
 */
export interface BreakpointHitEvent {
  /** Breakpoint that was hit */
  breakpoint: Breakpoint;

  /** Node ID */
  nodeId: string;

  /** Execution context at breakpoint */
  context: any;

  /** Timestamp */
  timestamp: number;
}

/**
 * BreakpointManager Service
 *
 * Manages breakpoints for debugging diagram execution.
 *
 * Features:
 * - Set/remove breakpoints on nodes
 * - Conditional breakpoints
 * - Enable/disable breakpoints
 * - Hit count tracking
 * - Breakpoint hit notifications
 *
 * @example
 * ```typescript
 * constructor(
 *   private breakpointManager: BreakpointManagerService
 * ) {}
 *
 * setDebugBreakpoint(nodeId: string) {
 *   // Set breakpoint before node execution
 *   const breakpoint = this.breakpointManager.addBreakpoint(
 *     nodeId,
 *     BreakpointType.BEFORE
 *   );
 *
 *   // Listen for hits
 *   this.breakpointManager.breakpointHit$.subscribe(event => {
 *     console.log('Breakpoint hit:', event.nodeId);
 *     // Pause execution, show debugger, etc.
 *   });
 * }
 *
 * setConditionalBreakpoint(nodeId: string) {
 *   // Set conditional breakpoint
 *   this.breakpointManager.addBreakpoint(
 *     nodeId,
 *     BreakpointType.CONDITIONAL,
 *     (context) => context.value > 100,
 *     'value > 100'
 *   );
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class BreakpointManagerService {
  private breakpoints = new Map<string, Breakpoint>();
  private breakpointIdCounter = 0;

  private breakpointsSubject = new BehaviorSubject<Breakpoint[]>([]);
  private breakpointHitSubject = new BehaviorSubject<BreakpointHitEvent | null>(null);

  /**
   * Observable of all breakpoints.
   * Emits whenever breakpoints change.
   */
  readonly breakpoints$ = this.breakpointsSubject.asObservable();

  /**
   * Observable of breakpoint hit events.
   * Emits when a breakpoint is hit during execution.
   */
  readonly breakpointHit$ = this.breakpointHitSubject.asObservable();

  // ============================================================================
  // Breakpoint Management
  // ============================================================================

  /**
   * Add breakpoint to node.
   *
   * @param nodeId - Node ID
   * @param type - Breakpoint type
   * @param condition - Optional condition function (for conditional breakpoints)
   * @param conditionExpression - Optional condition expression string (for display)
   * @param metadata - Optional metadata
   * @returns Breakpoint
   *
   * @example
   * ```typescript
   * // Simple breakpoint
   * const bp1 = breakpointManager.addBreakpoint('node-1', BreakpointType.BEFORE);
   *
   * // Conditional breakpoint
   * const bp2 = breakpointManager.addBreakpoint(
   *   'node-2',
   *   BreakpointType.CONDITIONAL,
   *   (ctx) => ctx.count > 5,
   *   'count > 5'
   * );
   * ```
   */
  addBreakpoint(
    nodeId: string,
    type: BreakpointType,
    condition?: BreakpointCondition,
    conditionExpression?: string,
    metadata?: Record<string, any>
  ): Breakpoint {
    const id = this.generateBreakpointId();

    const breakpoint: Breakpoint = {
      id,
      nodeId,
      type,
      enabled: true,
      condition,
      conditionExpression,
      hitCount: 0,
      createdAt: Date.now(),
      metadata,
    };

    this.breakpoints.set(id, breakpoint);
    this.emitBreakpoints();

    return breakpoint;
  }

  /**
   * Remove breakpoint by ID.
   *
   * @param breakpointId - Breakpoint ID
   * @returns True if removed, false if not found
   */
  removeBreakpoint(breakpointId: string): boolean {
    const deleted = this.breakpoints.delete(breakpointId);
    if (deleted) {
      this.emitBreakpoints();
    }
    return deleted;
  }

  /**
   * Remove all breakpoints for node.
   *
   * @param nodeId - Node ID
   * @returns Number of breakpoints removed
   */
  removeBreakpointsForNode(nodeId: string): number {
    const breakpointsToRemove = Array.from(this.breakpoints.values())
      .filter(bp => bp.nodeId === nodeId);

    for (const bp of breakpointsToRemove) {
      this.breakpoints.delete(bp.id);
    }

    if (breakpointsToRemove.length > 0) {
      this.emitBreakpoints();
    }

    return breakpointsToRemove.length;
  }

  /**
   * Remove all breakpoints.
   */
  clearBreakpoints(): void {
    this.breakpoints.clear();
    this.emitBreakpoints();
  }

  /**
   * Enable breakpoint.
   *
   * @param breakpointId - Breakpoint ID
   */
  enableBreakpoint(breakpointId: string): void {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (breakpoint) {
      breakpoint.enabled = true;
      this.emitBreakpoints();
    }
  }

  /**
   * Disable breakpoint.
   *
   * @param breakpointId - Breakpoint ID
   */
  disableBreakpoint(breakpointId: string): void {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (breakpoint) {
      breakpoint.enabled = false;
      this.emitBreakpoints();
    }
  }

  /**
   * Toggle breakpoint enabled/disabled.
   *
   * @param breakpointId - Breakpoint ID
   */
  toggleBreakpoint(breakpointId: string): void {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (breakpoint) {
      breakpoint.enabled = !breakpoint.enabled;
      this.emitBreakpoints();
    }
  }

  // ============================================================================
  // Breakpoint Queries
  // ============================================================================

  /**
   * Get breakpoint by ID.
   *
   * @param breakpointId - Breakpoint ID
   * @returns Breakpoint or null
   */
  getBreakpoint(breakpointId: string): Breakpoint | null {
    return this.breakpoints.get(breakpointId) || null;
  }

  /**
   * Get all breakpoints.
   *
   * @returns Array of breakpoints
   */
  getAllBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get breakpoints for node.
   *
   * @param nodeId - Node ID
   * @returns Array of breakpoints
   */
  getBreakpointsForNode(nodeId: string): Breakpoint[] {
    return Array.from(this.breakpoints.values())
      .filter(bp => bp.nodeId === nodeId);
  }

  /**
   * Check if node has breakpoint.
   *
   * @param nodeId - Node ID
   * @param type - Optional breakpoint type filter
   * @returns True if node has breakpoint
   */
  hasBreakpoint(nodeId: string, type?: BreakpointType): boolean {
    return Array.from(this.breakpoints.values()).some(
      bp => bp.nodeId === nodeId &&
           bp.enabled &&
           (type === undefined || bp.type === type)
    );
  }

  /**
   * Get breakpoint count.
   *
   * @returns Total number of breakpoints
   */
  getBreakpointCount(): number {
    return this.breakpoints.size;
  }

  /**
   * Get enabled breakpoint count.
   *
   * @returns Number of enabled breakpoints
   */
  getEnabledBreakpointCount(): number {
    return Array.from(this.breakpoints.values())
      .filter(bp => bp.enabled).length;
  }

  // ============================================================================
  // Breakpoint Execution
  // ============================================================================

  /**
   * Check if breakpoint should hit at node.
   * Call this during execution before/after node execution.
   *
   * @param nodeId - Node ID
   * @param type - Breakpoint type to check
   * @param context - Execution context
   * @returns True if should break, false otherwise
   *
   * @example
   * ```typescript
   * // Before node execution
   * if (breakpointManager.shouldBreak('node-1', BreakpointType.BEFORE, context)) {
   *   // Pause execution
   *   this.pauseExecution();
   * }
   * ```
   */
  shouldBreak(nodeId: string, type: BreakpointType, context?: any): boolean {
    const breakpoints = Array.from(this.breakpoints.values())
      .filter(bp =>
        bp.nodeId === nodeId &&
        bp.enabled &&
        bp.type === type
      );

    for (const breakpoint of breakpoints) {
      // For conditional breakpoints, evaluate condition
      if (breakpoint.type === BreakpointType.CONDITIONAL && breakpoint.condition) {
        try {
          if (!breakpoint.condition(context)) {
            continue; // Condition not met, skip this breakpoint
          }
        } catch (error) {
          console.error('Breakpoint condition error:', error);
          continue;
        }
      }

      // Breakpoint hit!
      this.recordBreakpointHit(breakpoint, context);
      return true;
    }

    return false;
  }

  /**
   * Manually trigger breakpoint hit.
   * Useful for testing or custom breakpoint logic.
   *
   * @param breakpointId - Breakpoint ID
   * @param context - Execution context
   */
  triggerBreakpointHit(breakpointId: string, context?: any): void {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (breakpoint && breakpoint.enabled) {
      this.recordBreakpointHit(breakpoint, context);
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Reset hit count for breakpoint.
   *
   * @param breakpointId - Breakpoint ID
   */
  resetHitCount(breakpointId: string): void {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (breakpoint) {
      breakpoint.hitCount = 0;
      this.emitBreakpoints();
    }
  }

  /**
   * Reset hit counts for all breakpoints.
   */
  resetAllHitCounts(): void {
    for (const breakpoint of this.breakpoints.values()) {
      breakpoint.hitCount = 0;
    }
    this.emitBreakpoints();
  }

  /**
   * Get breakpoint statistics.
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<BreakpointType, number>;
    totalHits: number;
  } {
    const breakpoints = Array.from(this.breakpoints.values());

    return {
      total: breakpoints.length,
      enabled: breakpoints.filter(bp => bp.enabled).length,
      disabled: breakpoints.filter(bp => !bp.enabled).length,
      byType: {
        [BreakpointType.BEFORE]: breakpoints.filter(bp => bp.type === BreakpointType.BEFORE).length,
        [BreakpointType.AFTER]: breakpoints.filter(bp => bp.type === BreakpointType.AFTER).length,
        [BreakpointType.CONDITIONAL]: breakpoints.filter(bp => bp.type === BreakpointType.CONDITIONAL).length,
      },
      totalHits: breakpoints.reduce((sum, bp) => sum + bp.hitCount, 0),
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateBreakpointId(): string {
    return `bp-${++this.breakpointIdCounter}`;
  }

  private recordBreakpointHit(breakpoint: Breakpoint, context?: any): void {
    breakpoint.hitCount++;

    const event: BreakpointHitEvent = {
      breakpoint: { ...breakpoint },
      nodeId: breakpoint.nodeId,
      context,
      timestamp: Date.now(),
    };

    this.breakpointHitSubject.next(event);
    this.emitBreakpoints();
  }

  private emitBreakpoints(): void {
    this.breakpointsSubject.next(Array.from(this.breakpoints.values()));
  }
}
