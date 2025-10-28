// LiveReroutingEngine.ts
// Automatic link rerouting on node movement (Phase 0.2)

import type { RoutingEngine } from './RoutingEngine';
import type { DiagramModel } from '../models/DiagramModel';
import type { Point } from '../types';

/**
 * LiveReroutingEngine automatically updates link paths when nodes move or resize.
 *
 * Features:
 * - Throttled rerouting for performance (60fps by default)
 * - Batches multiple node movements
 * - Can be enabled/disabled
 * - Configurable throttle time
 *
 * @example
 * ```typescript
 * const liveRerouting = new LiveReroutingEngine(routingEngine, diagram);
 * liveRerouting.enable();
 *
 * // Links will automatically update when nodes move
 * node.setPosition({ x: 100, y: 100 });
 * ```
 */
export class LiveReroutingEngine {
  private routingEngine: RoutingEngine;
  private diagram: DiagramModel;
  private enabled: boolean = true;
  private throttleMs: number = 16; // 60fps
  private throttleTimer: number | null = null;
  private pendingReroutes: Set<string> = new Set();

  constructor(routingEngine: RoutingEngine, diagram: DiagramModel) {
    this.routingEngine = routingEngine;
    this.diagram = diagram;

    // Listen to node movement and resize events
    this.diagram.on('node:moved', this.handleNodeMoved.bind(this));
    this.diagram.on('node:resized', this.handleNodeResized.bind(this));
  }

  /**
   * Handle node movement event
   */
  private handleNodeMoved(event: { nodeId: string; position: Point }): void {
    if (!this.enabled) return;

    this.addAffectedLinksToQueue(event.nodeId);
    this.scheduleReroute();
  }

  /**
   * Handle node resize event
   */
  private handleNodeResized(event: { nodeId: string; size: { width: number; height: number } }): void {
    if (!this.enabled) return;

    this.addAffectedLinksToQueue(event.nodeId);
    this.scheduleReroute();
  }

  /**
   * Find all links connected to a node and add them to pending reroutes
   */
  private addAffectedLinksToQueue(nodeId: string): void {
    const node = this.diagram.getNode(nodeId);
    if (!node) return;

    // Get all ports on this node
    const ports = node.getPorts();

    // For each port, find all connected links
    ports.forEach(port => {
      const links = this.diagram.getLinksForPort(port.id);
      links.forEach(link => {
        this.pendingReroutes.add(link.id);
      });
    });
  }

  /**
   * Schedule a throttled reroute operation
   */
  private scheduleReroute(): void {
    // If already scheduled, don't schedule again
    if (this.throttleTimer !== null) return;

    this.throttleTimer = window.setTimeout(() => {
      this.processReroutes();
      this.throttleTimer = null;
    }, this.throttleMs);
  }

  /**
   * Process all pending reroutes
   */
  private processReroutes(): void {
    if (this.pendingReroutes.size === 0) return;

    const reroutedCount = this.pendingReroutes.size;

    // Reroute each link
    this.pendingReroutes.forEach(linkId => {
      const link = this.diagram.getLink(linkId);
      if (!link) return;

      // TODO: Force path regeneration - requires sourcePoint and targetPoint
      // This is placeholder code until the API is properly integrated
      // link.generatePath();

      // Mark as dirty to trigger re-render
      link.markDirty();
    });

    // Clear pending reroutes
    this.pendingReroutes.clear();

    // TODO: Emit event for renderer to update - DiagramModel doesn't expose emit() publicly
    // this.diagram.emit('links:rerouted', { count: reroutedCount });
  }

  /**
   * Enable live rerouting
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable live rerouting
   */
  disable(): void {
    this.enabled = false;

    // Clear any pending reroutes
    if (this.throttleTimer !== null) {
      window.clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingReroutes.clear();
  }

  /**
   * Set throttle time in milliseconds
   * @param ms Throttle time (e.g., 16 for 60fps, 33 for 30fps)
   */
  setThrottle(ms: number): void {
    this.throttleMs = Math.max(0, ms);
  }

  /**
   * Manually trigger reroute of all links in the diagram
   * Useful for manual refresh or after bulk operations
   */
  rerouteAll(): void {
    const links = this.diagram.getLinks();

    links.forEach(link => {
      // TODO: Force path regeneration - requires sourcePoint and targetPoint
      // link.generatePath();
      link.markDirty();
    });

    // TODO: Emit event for renderer to update - DiagramModel doesn't expose emit() publicly
    // this.diagram.emit('links:rerouted', { count: links.length });
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.disable();

    // TODO: Remove event listeners - DiagramModel doesn't expose off() publicly
    // Need to store the unsubscribe functions from on() calls instead
    // this.diagram.off('node:moved', this.handleNodeMoved.bind(this));
    // this.diagram.off('node:resized', this.handleNodeResized.bind(this));
  }
}
