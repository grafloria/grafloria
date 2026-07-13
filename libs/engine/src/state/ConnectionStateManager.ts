// ConnectionStateManager - Manages connection drag state
// This is part of Phase 1: Engine Foundation for interaction modes

import type { PortModel } from '../models/PortModel';
import type { LinkModel } from '../models/LinkModel';
import type { NodeModel } from '../models/NodeModel';
import type { DiagramModel } from '../models/DiagramModel';
import type { Point } from '../types';
import type { EventBus } from '../events/EventBus';
// Wave 6 (Card 2 + Card 6): THE connection validator. This class used to carry
// its own private copy of the input/output rules — one that silently skipped the
// capacity check the rest of the engine enforced.
import {
  evaluatePortConnection,
  type ConnectionRejectionReason,
  type ConnectionVerdict,
} from '../ports/connection-rules';

/**
 * Connection drag state
 * Tracks the state of an in-progress connection being dragged
 */
export interface ConnectionDragState {
  /**
   * Whether a connection is currently being dragged
   */
  isConnecting: boolean;

  /**
   * Source port where connection started
   */
  sourcePort: PortModel | null;

  /**
   * Target port currently hovered (if any)
   */
  targetPort: PortModel | null;

  /**
   * Current mouse position in world coordinates
   */
  currentMousePosition: Point | null;

  /**
   * Preview path points (for rendering connection line)
   */
  previewPath: Point[] | null;

  /**
   * Set of node IDs that can accept this connection
   */
  validTargetNodes: Set<string>;

  /**
   * Set of port IDs that can accept this connection
   */
  validTargetPorts: Set<string>;

  /**
   * Whether current hover position is over a valid target
   */
  isOverValidTarget: boolean;

  /**
   * Wave 6 (Card 6): every port the drag has REJECTED, and why.
   *
   * The renderer draws an explicit "no" cue on a rejected target and dims ports
   * whose data type is incompatible — it can only do that if the rejection is
   * data, not a silently-swallowed `false`. Populated alongside
   * `validTargetPorts` at drag start.
   */
  invalidTargetPorts: Map<string, ConnectionRejectionReason>;

  /** Why the CURRENT hover was rejected (undefined when it is valid). */
  rejectionReason?: ConnectionRejectionReason;
  /** Human-readable form of {@link rejectionReason}. */
  rejectionMessage?: string;
}

/**
 * Connection validation function
 * Returns true if connection is allowed
 */
export type ConnectionValidator = (
  sourcePort: PortModel,
  targetPort: PortModel
) => boolean;

/**
 * Manages connection creation state during drag operations
 */
export class ConnectionStateManager {
  private state: ConnectionDragState;
  private eventBus: EventBus;
  private validators: ConnectionValidator[] = [];

  /**
   * Wave 6 (Card 6): the diagram the drag is happening in.
   *
   * `calculateValidTargets()` was a comment-only stub — "DiagramEngine will call
   * setValidTargets() after analyzing the diagram" — and NOTHING in the tree ever
   * called `setValidTargets()`. So `validTargetPorts` was permanently empty, and
   * `InteractionController.updatePortHighlights()`, which loops over it to paint
   * the valid targets, painted nothing. The "highlight every valid target" feature
   * has never worked. Giving the manager the diagram is what finally lets it
   * answer its own question.
   */
  private diagram: DiagramModel | null = null;

  constructor(eventBus: EventBus, diagram: DiagramModel | null = null) {
    this.eventBus = eventBus;
    this.diagram = diagram;
    this.state = this.createInitialState();
  }

  /** Point the manager at the live diagram (DiagramEngine calls this on load). */
  setDiagram(diagram: DiagramModel | null): void {
    this.diagram = diagram;
  }

  /**
   * Create initial empty state
   */
  private createInitialState(): ConnectionDragState {
    return {
      isConnecting: false,
      sourcePort: null,
      targetPort: null,
      currentMousePosition: null,
      previewPath: null,
      validTargetNodes: new Set(),
      validTargetPorts: new Set(),
      invalidTargetPorts: new Map(),
      isOverValidTarget: false,
      rejectionReason: undefined,
      rejectionMessage: undefined,
    };
  }

  /**
   * Start connection drag from a port
   */
  startConnection(sourcePort: PortModel, startPoint: Point): void {
    this.state = {
      ...this.createInitialState(),
      isConnecting: true,
      sourcePort,
      currentMousePosition: startPoint,
      previewPath: [startPoint],
    };

    // Calculate valid targets based on port type and connection rules
    this.calculateValidTargets(sourcePort);

    // Emit event
    this.eventBus.emit('connection:start', {
      sourcePort,
      startPoint,
      validTargetPorts: Array.from(this.state.validTargetPorts),
    });
  }

  /**
   * Update connection drag position
   */
  updateConnection(currentPoint: Point, hoveredPort?: PortModel): void {
    if (!this.state.isConnecting || !this.state.sourcePort) {
      return;
    }

    const previousTargetPort = this.state.targetPort;
    this.state.currentMousePosition = currentPoint;
    this.state.targetPort = hoveredPort || null;

    // Update preview path
    // Get source port absolute position (will be calculated by renderer)
    this.state.previewPath = [currentPoint]; // Renderer will add source point

    // Check if over valid target. The VERDICT, not just the boolean — a rejected
    // target has to be able to say why (Card 6's invalid cue).
    const verdict: ConnectionVerdict = hoveredPort
      ? this.evaluate(hoveredPort)
      : { ok: false };
    this.state.isOverValidTarget = verdict.ok;
    this.state.rejectionReason = verdict.ok ? undefined : verdict.reason;
    this.state.rejectionMessage = verdict.ok ? undefined : verdict.message;

    // Emit update event
    this.eventBus.emit('connection:update', {
      currentPoint,
      targetPort: hoveredPort,
      isValid: this.state.isOverValidTarget,
      rejectionReason: this.state.rejectionReason,
      rejectionMessage: this.state.rejectionMessage,
      previousTargetPort,
    });

    // Emit hover events if target changed
    if (hoveredPort !== previousTargetPort) {
      if (previousTargetPort) {
        this.eventBus.emit('connection:port-leave', {
          port: previousTargetPort,
        });
      }
      if (hoveredPort) {
        this.eventBus.emit('connection:port-enter', {
          port: hoveredPort,
          isValid: this.state.isOverValidTarget,
          rejectionReason: this.state.rejectionReason,
          rejectionMessage: this.state.rejectionMessage,
        });
      }
    }
  }

  /**
   * Complete connection to target port
   */
  completeConnection(targetPort: PortModel): { success: boolean; link?: LinkModel } {
    if (!this.state.isConnecting || !this.state.sourcePort) {
      this.cancelConnection();
      return { success: false };
    }

    // Validate connection
    if (!this.isValidConnection(targetPort)) {
      this.cancelConnection();
      return { success: false };
    }

    const sourcePort = this.state.sourcePort;

    // Emit success event (DiagramEngine will create the actual link)
    this.eventBus.emit('connection:complete', {
      sourcePort,
      targetPort,
      sourcePortId: sourcePort.id,
      targetPortId: targetPort.id,
    });

    // Reset state
    this.resetState();

    return { success: true };
  }

  /**
   * Cancel connection
   */
  cancelConnection(): void {
    if (this.state.isConnecting) {
      this.eventBus.emit('connection:cancel', {
        sourcePort: this.state.sourcePort,
      });
    }

    this.resetState();
  }

  /**
   * The full verdict for a candidate target — the ONE place this class decides
   * what is legal. It delegates to `evaluatePortConnection`, the validator the
   * whole engine now shares.
   *
   * This used to be a private re-implementation of the input/output rules that
   * (a) never checked `maxConnections` — so an interactive drag would happily
   * overfill a port the rest of the engine considered full — and (b) disagreed
   * with the proximity-connect magnet about duplicates.
   */
  private evaluate(targetPort: PortModel): ConnectionVerdict {
    const sourcePort = this.state.sourcePort;
    if (!sourcePort) return { ok: false };

    const verdict = evaluatePortConnection(sourcePort, targetPort, {
      sourceNode: this.nodeOf(sourcePort),
      targetNode: this.nodeOf(targetPort),
      links: this.diagram?.getLinks(),
      validators: this.validators,
    });
    if (!verdict.ok) return verdict;

    // A host that explicitly narrowed the target set (setValidTargets) still wins.
    // Kept as a post-filter, and still only consulted when non-empty, so a host
    // that never calls it is unaffected.
    if (this.state.validTargetPorts.size > 0 && !this.state.validTargetPorts.has(targetPort.id)) {
      return { ok: false, reason: 'custom', message: 'This connection is not allowed.' };
    }

    return verdict;
  }

  /** Legacy boolean facade — kept because callers and tests rely on it. */
  private isValidConnection(targetPort: PortModel): boolean {
    return this.evaluate(targetPort).ok;
  }

  private nodeOf(port: PortModel): NodeModel | undefined {
    if (!this.diagram) return undefined;
    if (port.nodeId) {
      const byId = this.diagram.getNode(port.nodeId);
      if (byId) return byId;
    }
    return this.diagram.getNodeByPortId?.(port.id) ?? undefined;
  }

  /**
   * Wave 6 (Card 6): partition EVERY port in the diagram into valid targets and
   * rejected ones (with a reason), so the renderer can light up the whole graph
   * the moment a drag starts.
   *
   * This was a comment-only stub. Nothing called `setValidTargets()`, so the set
   * it promised to fill stayed empty forever and every downstream consumer —
   * `InteractionController.updatePortHighlights()`, the `connection:start` event
   * payload, the renderer's `isValidTarget` styling — silently had nothing to do.
   */
  private calculateValidTargets(sourcePort: PortModel): void {
    const validNodes = new Set<string>();
    const validPorts = new Set<string>();
    const invalidPorts = new Map<string, ConnectionRejectionReason>();

    const diagram = this.diagram;
    if (!diagram) {
      // No diagram wired in: leave the sets EMPTY, which the post-filter above
      // reads as "unconstrained". Same behaviour as before this method worked.
      this.state.validTargetNodes = validNodes;
      this.state.validTargetPorts = validPorts;
      this.state.invalidTargetPorts = invalidPorts;
      return;
    }

    const links = diagram.getLinks();
    const sourceNode = this.nodeOf(sourcePort);

    for (const node of diagram.getNodes()) {
      for (const port of node.getPorts()) {
        if (port.id === sourcePort.id) continue;

        const verdict = evaluatePortConnection(sourcePort, port, {
          sourceNode,
          targetNode: node,
          links,
          validators: this.validators,
        });

        if (verdict.ok) {
          validPorts.add(port.id);
          validNodes.add(node.id);
        } else {
          invalidPorts.set(port.id, verdict.reason ?? 'custom');
        }
      }
    }

    this.state.validTargetNodes = validNodes;
    this.state.validTargetPorts = validPorts;
    this.state.invalidTargetPorts = invalidPorts;
  }

  /**
   * Set valid target ports (called by a host that wants to narrow the set
   * further than the rules do — e.g. a wizard that only permits one legal move).
   */
  setValidTargets(nodeIds: Set<string>, portIds: Set<string>): void {
    this.state.validTargetNodes = nodeIds;
    this.state.validTargetPorts = portIds;
  }

  /**
   * Add a custom connection validator
   */
  addValidator(validator: ConnectionValidator): void {
    this.validators.push(validator);
  }

  /**
   * Remove a custom connection validator
   */
  removeValidator(validator: ConnectionValidator): void {
    const index = this.validators.indexOf(validator);
    if (index !== -1) {
      this.validators.splice(index, 1);
    }
  }

  /**
   * Clear all custom validators
   */
  clearValidators(): void {
    this.validators = [];
  }

  /**
   * Get current state (read-only)
   */
  getState(): Readonly<ConnectionDragState> {
    return {
      ...this.state,
      validTargetNodes: new Set(this.state.validTargetNodes),
      validTargetPorts: new Set(this.state.validTargetPorts),
      invalidTargetPorts: new Map(this.state.invalidTargetPorts),
    };
  }

  /**
   * Check if currently connecting
   */
  isConnecting(): boolean {
    return this.state.isConnecting;
  }

  /**
   * Get source port (if connecting)
   */
  getSourcePort(): PortModel | null {
    return this.state.sourcePort;
  }

  /**
   * Get target port (if hovering over one)
   */
  getTargetPort(): PortModel | null {
    return this.state.targetPort;
  }

  /**
   * Get current mouse position
   */
  getCurrentMousePosition(): Point | null {
    return this.state.currentMousePosition;
  }

  /**
   * Check if hovering over valid target
   */
  isOverValidTarget(): boolean {
    return this.state.isOverValidTarget;
  }

  /**
   * Reset state to initial
   */
  private resetState(): void {
    this.state = this.createInitialState();
  }
}
