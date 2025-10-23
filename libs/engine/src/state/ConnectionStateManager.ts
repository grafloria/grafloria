// ConnectionStateManager - Manages connection drag state
// This is part of Phase 1: Engine Foundation for interaction modes

import type { PortModel } from '../models/PortModel';
import type { LinkModel } from '../models/LinkModel';
import type { Point } from '../types';
import type { EventBus } from '../events/EventBus';

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

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.state = this.createInitialState();
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
      isOverValidTarget: false,
    };
  }

  /**
   * Start connection drag from a port
   */
  startConnection(sourcePort: PortModel, startPoint: Point): void {
    this.state = {
      isConnecting: true,
      sourcePort,
      targetPort: null,
      currentMousePosition: startPoint,
      previewPath: [startPoint],
      validTargetNodes: new Set(),
      validTargetPorts: new Set(),
      isOverValidTarget: false,
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

    // Check if over valid target
    const wasOverValid = this.state.isOverValidTarget;
    this.state.isOverValidTarget = hoveredPort
      ? this.isValidConnection(hoveredPort)
      : false;

    // Emit update event
    this.eventBus.emit('connection:update', {
      currentPoint,
      targetPort: hoveredPort,
      isValid: this.state.isOverValidTarget,
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
   * Check if connection to target port is valid
   */
  private isValidConnection(targetPort: PortModel): boolean {
    if (!this.state.sourcePort) {
      return false;
    }

    const sourcePort = this.state.sourcePort;

    // Can't connect to same port
    if (sourcePort.id === targetPort.id) {
      return false;
    }

    // Can't connect to same node
    if (sourcePort.nodeId === targetPort.nodeId) {
      return false;
    }

    // Check port types (input can't connect to input, output can't connect to output)
    if (sourcePort.type === 'input' && targetPort.type === 'input') {
      return false;
    }
    if (sourcePort.type === 'output' && targetPort.type === 'output') {
      return false;
    }

    // Check if target port is in valid set
    if (!this.state.validTargetPorts.has(targetPort.id)) {
      return false;
    }

    // Run custom validators
    for (const validator of this.validators) {
      if (!validator(sourcePort, targetPort)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate valid connection targets based on source port
   */
  private calculateValidTargets(sourcePort: PortModel): void {
    // This will be populated by DiagramEngine based on:
    // 1. Type registry rules
    // 2. Port types (input/output/bi)
    // 3. Port max connections
    // 4. Custom validation rules

    // For now, we just mark that calculation is needed
    // DiagramEngine will call setValidTargets() after analyzing the diagram
  }

  /**
   * Set valid target ports (called by DiagramEngine)
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
