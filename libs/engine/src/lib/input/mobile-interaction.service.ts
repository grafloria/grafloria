import { TouchHandler, TouchGestureEvent, TouchPoint } from './touch-handler';

// Note: DiagramEngine import will be resolved at runtime
// This service is designed to work with any diagram engine that provides these methods
export interface IMobileEngine {
  // Selection methods
  getNodeAt?(x: number, y: number): any;
  selectNode?(node: any): void;
  deselectAll?(): void;

  // Zoom/Pan methods
  getZoom(): number;
  setZoom(zoom: number): void;
  zoomTo?(zoom: number, x: number, y: number): void;
  zoomToFit?(options?: { maxScale?: number; padding?: number }): void;
  getPan(): { x: number; y: number };
  setPan(x: number, y: number): void;

  // Canvas methods
  getCanvas?(): HTMLElement | null;
  repaint?(): void;

  // Event system
  emit?(event: string, data: any): void;
  on?(event: string, handler: (data: any) => void): void;
}

export interface MobileConfig {
  enablePinchZoom: boolean;
  enableTwoFingerPan: boolean;
  enableDoubleTapZoom: boolean;
  enableLongPressMenu: boolean;
  minZoom: number;
  maxZoom: number;
  zoomSpeed: number;
  doubleTapZoomFactor: number;
}

export class MobileInteractionService {
  private touchHandler?: TouchHandler;
  private lastTapTime = 0;
  private doubleTapDelay = 300; // ms
  private isDraggingNode = false;
  private draggedNode: any = null;

  private config: MobileConfig = {
    enablePinchZoom: true,
    enableTwoFingerPan: true,
    enableDoubleTapZoom: true,
    enableLongPressMenu: true,
    minZoom: 0.1,
    maxZoom: 4,
    zoomSpeed: 1,
    doubleTapZoomFactor: 2,
  };

  constructor(private engine: IMobileEngine) {}

  /**
   * Initialize mobile interactions
   */
  initialize(canvas: HTMLElement, config?: Partial<MobileConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Create touch handler
    this.touchHandler = new TouchHandler(canvas);

    // Register gesture handlers
    this.touchHandler.on('tap', this.handleTap.bind(this));
    this.touchHandler.on('long-press', this.handleLongPress.bind(this));
    this.touchHandler.on('drag', this.handleDrag.bind(this));
    this.touchHandler.on('pinch', this.handlePinch.bind(this));
  }

  /**
   * Handle tap gesture
   */
  private handleTap(event: TouchGestureEvent) {
    const now = Date.now();

    // Check for double-tap
    if (this.config.enableDoubleTapZoom && now - this.lastTapTime < this.doubleTapDelay) {
      this.handleDoubleTap(event);
      this.lastTapTime = 0; // Reset
    } else {
      // Single tap - select node or deselect
      if (event.originalEvent.changedTouches.length > 0) {
        const touch = event.originalEvent.changedTouches[0];
        const coords = this.getEventCoords(touch);

        if (this.engine.getNodeAt) {
          const node = this.engine.getNodeAt(coords.x, coords.y);

          if (node) {
            if (this.engine.selectNode) {
              this.engine.selectNode(node);
            }
          } else {
            if (this.engine.deselectAll) {
              this.engine.deselectAll();
            }
          }
        }
      }

      this.lastTapTime = now;
    }
  }

  /**
   * Handle double-tap gesture
   */
  private handleDoubleTap(event: TouchGestureEvent) {
    if (event.originalEvent.changedTouches.length > 0) {
      const touch = event.originalEvent.changedTouches[0];
      const coords = this.getEventCoords(touch);

      // Zoom in at tap location
      const currentZoom = this.engine.getZoom();
      const newZoom = Math.min(
        currentZoom * this.config.doubleTapZoomFactor,
        this.config.maxZoom
      );

      if (this.engine.zoomTo) {
        this.engine.zoomTo(newZoom, coords.x, coords.y);
      } else {
        this.engine.setZoom(newZoom);
      }
    }
  }

  /**
   * Handle long-press gesture
   */
  private handleLongPress(event: TouchGestureEvent) {
    if (!this.config.enableLongPressMenu) {
      return;
    }

    if (event.touches.length > 0) {
      const touch = event.touches[0];
      const coords = this.getEventCoords(touch);

      if (this.engine.getNodeAt && this.engine.emit) {
        const node = this.engine.getNodeAt(coords.x, coords.y);

        if (node) {
          // Show context menu for node
          this.engine.emit('node:context-menu', {
            node,
            x: touch.clientX,
            y: touch.clientY,
          });
        } else {
          // Show canvas context menu
          this.engine.emit('canvas:context-menu', {
            x: touch.clientX,
            y: touch.clientY,
          });
        }
      }
    }
  }

  /**
   * Handle drag gesture
   */
  private handleDrag(event: TouchGestureEvent) {
    const touches = event.touches;

    if (touches.length === 1) {
      // Single finger drag: move node or pan canvas
      const touch = touches[0];
      const coords = this.getEventCoords(touch);

      // Check if we're starting a drag on a node
      if (!this.isDraggingNode && this.engine.getNodeAt) {
        const node = this.engine.getNodeAt(coords.x, coords.y);
        if (node && !node.isLocked?.()) {
          this.isDraggingNode = true;
          this.draggedNode = node;
        }
      }

      if (this.isDraggingNode && this.draggedNode) {
        // Drag node
        if (this.engine.emit) {
          this.engine.emit('node:drag', {
            node: this.draggedNode,
            x: coords.x,
            y: coords.y
          });
        }
      } else {
        // Pan canvas
        if (event.deltaX !== undefined && event.deltaY !== undefined) {
          const pan = this.engine.getPan();
          this.engine.setPan(pan.x + event.deltaX, pan.y + event.deltaY);
        }
      }
    } else if (touches.length === 2 && this.config.enableTwoFingerPan) {
      // Two finger drag: always pan canvas
      if (event.deltaX !== undefined && event.deltaY !== undefined) {
        const pan = this.engine.getPan();
        this.engine.setPan(pan.x + event.deltaX, pan.y + event.deltaY);
      }
    }
  }

  /**
   * Handle pinch gesture
   */
  private handlePinch(event: TouchGestureEvent) {
    if (!this.config.enablePinchZoom || !event.scale) {
      return;
    }

    const currentZoom = this.engine.getZoom();
    const newZoom = Math.max(
      this.config.minZoom,
      Math.min(currentZoom * event.scale * this.config.zoomSpeed, this.config.maxZoom)
    );

    // Zoom at center of pinch
    const touches = event.touches;
    if (touches.length >= 2 && this.engine.zoomTo) {
      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;

      this.engine.zoomTo(newZoom, centerX, centerY);
    } else {
      this.engine.setZoom(newZoom);
    }
  }

  /**
   * Get event coordinates (convert to diagram coordinates)
   */
  private getEventCoords(touch: Touch | TouchPoint): {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } {
    const canvas = this.engine.getCanvas?.();
    if (!canvas) {
      return {
        x: 0,
        y: 0,
        clientX: 0,
        clientY: 0,
      };
    }

    const rect = canvas.getBoundingClientRect();
    const zoom = this.engine.getZoom();
    const pan = this.engine.getPan();

    const clientX = 'clientX' in touch ? touch.clientX : 0;
    const clientY = 'clientY' in touch ? touch.clientY : 0;

    // Convert screen coordinates to diagram coordinates
    const diagramX = (clientX - rect.left - pan.x) / zoom;
    const diagramY = (clientY - rect.top - pan.y) / zoom;

    return {
      x: diagramX,
      y: diagramY,
      clientX,
      clientY,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MobileConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MobileConfig {
    return { ...this.config };
  }

  /**
   * Destroy service
   */
  destroy() {
    if (this.touchHandler) {
      this.touchHandler.destroy();
    }
    this.isDraggingNode = false;
    this.draggedNode = null;
  }
}
