import { Injectable } from '@angular/core';

/**
 * HTML Handle metadata (stored in registry)
 */
export interface HTMLHandle {
  id: string;
  type: 'source' | 'target';
  position: 'top' | 'right' | 'bottom' | 'left';
  element: HTMLElement;
}

/**
 * Handle bounds (calculated from DOM)
 * Used for connection drawing and hit testing
 */
export interface HandleBounds {
  id: string;
  type: 'source' | 'target';
  nodeId: string;
  position: 'top' | 'right' | 'bottom' | 'left';
  x: number;  // Relative to node
  y: number;  // Relative to node
  width: number;
  height: number;
  // Absolute screen coordinates (for hit testing)
  absoluteX?: number;
  absoluteY?: number;
}

/**
 * Service to track HTML handles and query their DOM positions
 * Similar to React Flow's handle detection system
 *
 * Phase 2: Hybrid HTML+SVG Rendering
 *
 * This service:
 * - Tracks all HTML handles registered via GrafloriaHandleDirective
 * - Queries DOM positions using getBoundingClientRect() like React Flow
 * - Provides handle bounds for connection drawing
 * - Enables hit testing for connection drag operations
 *
 * SHAPE AWARENESS:
 * This service queries actual DOM positions, so it automatically supports all shape types
 * (rect, circle, ellipse, diamond, hexagon) as long as the handles are positioned correctly
 * in the template. Handle positioning is done by diagram-canvas.component.ts using
 * getPortPositionForShape() which provides shape-aware positioning.
 */
@Injectable({ providedIn: 'root' })
export class HandleRegistryService {
  /**
   * Registry of handles by node ID
   * Map: nodeId → HTMLHandle[]
   */
  private handles = new Map<string, HTMLHandle[]>();

  /**
   * Register a handle for a node
   * Called by GrafloriaHandleDirective on init
   */
  registerHandle(nodeId: string, handle: HTMLHandle): void {
    if (!this.handles.has(nodeId)) {
      this.handles.set(nodeId, []);
    }

    const nodeHandles = this.handles.get(nodeId)!;

    // Check for duplicate handle IDs
    const existingHandle = nodeHandles.find(h => h.id === handle.id);
    if (existingHandle) {
      console.warn(
        `[HandleRegistry] Duplicate handle ID "${handle.id}" for node "${nodeId}". ` +
        `This may cause connection issues.`
      );
    }

    nodeHandles.push(handle);

    console.log(
      `📍 [HandleRegistry] Registered ${handle.type} handle "${handle.id}" ` +
      `for node "${nodeId}" (total: ${nodeHandles.length} handles)`
    );
  }

  /**
   * Unregister a handle
   * Called by GrafloriaHandleDirective on destroy
   */
  unregisterHandle(nodeId: string, handleId: string): void {
    const nodeHandles = this.handles.get(nodeId);
    if (!nodeHandles) {
      return;
    }

    const index = nodeHandles.findIndex(h => h.id === handleId);
    if (index >= 0) {
      nodeHandles.splice(index, 1);

      console.log(
        `🗑️  [HandleRegistry] Unregistered handle "${handleId}" ` +
        `from node "${nodeId}" (remaining: ${nodeHandles.length} handles)`
      );

      // Clean up empty node entries
      if (nodeHandles.length === 0) {
        this.handles.delete(nodeId);
      }
    }
  }

  /**
   * Get all handles for a node
   */
  getHandles(nodeId: string): HTMLHandle[] {
    return this.handles.get(nodeId) || [];
  }

  /**
   * Get bounds for a specific handle (React Flow style)
   * Queries DOM using getBoundingClientRect()
   *
   * @param nodeId - Node ID
   * @param handleId - Handle ID
   * @param zoom - Current zoom level
   * @returns Handle bounds or null if not found
   */
  getHandleBounds(
    nodeId: string,
    handleId: string,
    zoom: number = 1
  ): HandleBounds | null {
    const nodeHandles = this.handles.get(nodeId);
    if (!nodeHandles) {
      return null;
    }

    const handle = nodeHandles.find(h => h.id === handleId);
    if (!handle) {
      return null;
    }

    // Query DOM position (like React Flow)
    const handleBounds = handle.element.getBoundingClientRect();
    const nodeBounds = this.getNodeBounds(nodeId);

    if (!nodeBounds) {
      console.warn(
        `[HandleRegistry] Could not find node bounds for "${nodeId}"`
      );
      return null;
    }

    // Calculate position relative to node (accounting for zoom)
    const relativeX = (handleBounds.left - nodeBounds.left) / zoom;
    const relativeY = (handleBounds.top - nodeBounds.top) / zoom;

    return {
      id: handle.id,
      type: handle.type,
      nodeId,
      position: handle.position,
      x: relativeX,
      y: relativeY,
      width: handleBounds.width,
      height: handleBounds.height,
      absoluteX: handleBounds.left,
      absoluteY: handleBounds.top,
    };
  }

  /**
   * Get bounds for all handles in the diagram
   * Used for connection drag operations
   *
   * @param zoom - Current zoom level
   * @returns Map of nodeId → HandleBounds[]
   */
  getAllHandleBounds(zoom: number = 1): Map<string, HandleBounds[]> {
    const result = new Map<string, HandleBounds[]>();

    this.handles.forEach((handles, nodeId) => {
      const nodeBounds: HandleBounds[] = [];

      handles.forEach(handle => {
        const bounds = this.getHandleBounds(nodeId, handle.id, zoom);
        if (bounds) {
          nodeBounds.push(bounds);
        }
      });

      if (nodeBounds.length > 0) {
        result.set(nodeId, nodeBounds);
      }
    });

    return result;
  }

  /**
   * Get node element bounds
   * Looks for element with data-node-id attribute
   */
  private getNodeBounds(nodeId: string): DOMRect | null {
    const nodeElement = document.querySelector(
      `[data-node-id="${nodeId}"]`
    ) as HTMLElement;

    if (!nodeElement) {
      return null;
    }

    return nodeElement.getBoundingClientRect();
  }

  /**
   * Find handle at screen coordinates (for hit testing)
   *
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @param zoom - Current zoom level
   * @returns Handle info or null if no handle at coordinates
   */
  getHandleAtPoint(
    screenX: number,
    screenY: number,
    zoom: number = 1
  ): { nodeId: string; handleId: string; handle: HTMLHandle } | null {
    console.log('🔍 [HandleRegistry] getHandleAtPoint called with:', { screenX, screenY, zoom, totalHandles: this.handles.size });

    for (const [nodeId, handles] of this.handles.entries()) {
      console.log(`🔍 [HandleRegistry] Checking node ${nodeId} with ${handles.length} handles`);

      for (const handle of handles) {
        const bounds = handle.element.getBoundingClientRect();

        console.log(`🔍 [HandleRegistry] Handle "${handle.id}" bounds:`, {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
          clickPoint: { screenX, screenY }
        });

        // Check if point is inside handle bounds
        if (
          screenX >= bounds.left &&
          screenX <= bounds.right &&
          screenY >= bounds.top &&
          screenY <= bounds.bottom
        ) {
          console.log(`✅ [HandleRegistry] Handle "${handle.id}" HIT!`);
          return { nodeId, handleId: handle.id, handle };
        }
      }
    }

    console.log('❌ [HandleRegistry] No handle found at point');
    return null;
  }

  /**
   * Get count of registered nodes and handles
   * Useful for debugging
   */
  getStats(): { nodeCount: number; handleCount: number } {
    let handleCount = 0;
    this.handles.forEach(handles => {
      handleCount += handles.length;
    });

    return {
      nodeCount: this.handles.size,
      handleCount,
    };
  }

  /**
   * Clear all registered handles
   * Useful for cleanup/reset
   */
  clear(): void {
    this.handles.clear();
    console.log('[HandleRegistry] Cleared all handles');
  }
}
