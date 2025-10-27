import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * Drag event data
 */
export interface DragEvent<T = any> {
  type: 'dragstart' | 'drag' | 'dragover' | 'drop' | 'dragend';
  data: T;
  event: MouseEvent | TouchEvent | DragEvent;
  target?: HTMLElement;
  dropZone?: string;
}

/**
 * Drop zone configuration
 */
export interface DropZone {
  id: string;
  element: HTMLElement;
  accepts?: string[];  // Accepted data types
  onDrop?: (data: any) => void;
  onDragOver?: (data: any) => boolean;  // Return false to reject drop
}

/**
 * Draggable item configuration
 */
export interface DraggableItem<T = any> {
  id: string;
  data: T;
  type?: string;
  element?: HTMLElement;
}

/**
 * Drag-and-Drop Service
 *
 * A comprehensive drag-and-drop service with:
 * - Mouse and touch event support
 * - Drop zones with accept filtering
 * - Visual feedback during drag
 * - Custom drag images
 * - Data transfer between components
 * - Event streams for reactive handling
 * - Reordering support
 * - Ghost element rendering
 *
 * Usage:
 * ```typescript
 * // Register a draggable item
 * dragDropService.registerDraggable({
 *   id: 'node-1',
 *   data: { name: 'Node 1' },
 *   type: 'node',
 *   element: element
 * });
 *
 * // Register a drop zone
 * dragDropService.registerDropZone({
 *   id: 'container-1',
 *   element: containerElement,
 *   accepts: ['node'],
 *   onDrop: (data) => { console.log('Dropped:', data); }
 * });
 *
 * // Subscribe to drag events
 * dragDropService.dragEvents$.subscribe(event => {
 *   console.log('Drag event:', event);
 * });
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  private dragEventsSubject = new Subject<DragEvent>();
  public dragEvents$: Observable<DragEvent> = this.dragEventsSubject.asObservable();

  private currentDrag: DraggableItem | null = null;
  private dropZones: Map<string, DropZone> = new Map();
  private draggables: Map<string, DraggableItem> = new Map();
  private ghostElement: HTMLElement | null = null;

  constructor() {}

  /**
   * Register a draggable item
   */
  registerDraggable<T>(item: DraggableItem<T>): void {
    this.draggables.set(item.id, item);

    if (item.element) {
      item.element.setAttribute('draggable', 'true');
      item.element.style.cursor = 'grab';

      // Add drag event listeners
      item.element.addEventListener('dragstart', (e) => this.onDragStart(e, item));
      item.element.addEventListener('dragend', (e) => this.onDragEnd(e, item));
    }
  }

  /**
   * Unregister a draggable item
   */
  unregisterDraggable(id: string): void {
    const item = this.draggables.get(id);
    if (item && item.element) {
      item.element.removeAttribute('draggable');
      item.element.style.cursor = '';
    }
    this.draggables.delete(id);
  }

  /**
   * Register a drop zone
   */
  registerDropZone(zone: DropZone): void {
    this.dropZones.set(zone.id, zone);

    zone.element.addEventListener('dragover', (e) => this.onDragOver(e, zone));
    zone.element.addEventListener('drop', (e) => this.onDrop(e, zone));
    zone.element.addEventListener('dragleave', (e) => this.onDragLeave(e, zone));
  }

  /**
   * Unregister a drop zone
   */
  unregisterDropZone(id: string): void {
    this.dropZones.delete(id);
  }

  /**
   * Get current drag data
   */
  getCurrentDrag(): DraggableItem | null {
    return this.currentDrag;
  }

  /**
   * Check if currently dragging
   */
  isDragging(): boolean {
    return this.currentDrag !== null;
  }

  /**
   * Handle drag start
   */
  private onDragStart(event: DragEvent, item: DraggableItem): void {
    this.currentDrag = item;

    // Set drag data
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.setData('application/json', JSON.stringify(item.data));

      // Create ghost element
      this.createGhostElement(item);
    }

    // Emit event
    this.dragEventsSubject.next({
      type: 'dragstart',
      data: item.data,
      event: event,
      target: item.element
    });

    // Add dragging class
    if (item.element) {
      item.element.classList.add('dragging');
      item.element.style.opacity = '0.5';
    }
  }

  /**
   * Handle drag over
   */
  private onDragOver(event: DragEvent, zone: DropZone): void {
    if (!this.currentDrag) return;

    // Check if drop zone accepts this type
    if (zone.accepts && this.currentDrag.type) {
      if (!zone.accepts.includes(this.currentDrag.type)) {
        event.dataTransfer!.dropEffect = 'none';
        return;
      }
    }

    // Check custom validation
    if (zone.onDragOver) {
      const allowed = zone.onDragOver(this.currentDrag.data);
      if (!allowed) {
        event.dataTransfer!.dropEffect = 'none';
        return;
      }
    }

    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';

    // Add hover class
    zone.element.classList.add('drag-over');

    // Emit event
    this.dragEventsSubject.next({
      type: 'dragover',
      data: this.currentDrag.data,
      event: event,
      target: zone.element,
      dropZone: zone.id
    });
  }

  /**
   * Handle drag leave
   */
  private onDragLeave(event: DragEvent, zone: DropZone): void {
    // Remove hover class
    zone.element.classList.remove('drag-over');
  }

  /**
   * Handle drop
   */
  private onDrop(event: DragEvent, zone: DropZone): void {
    event.preventDefault();

    if (!this.currentDrag) return;

    // Remove hover class
    zone.element.classList.remove('drag-over');

    // Execute drop callback
    if (zone.onDrop) {
      zone.onDrop(this.currentDrag.data);
    }

    // Emit event
    this.dragEventsSubject.next({
      type: 'drop',
      data: this.currentDrag.data,
      event: event,
      target: zone.element,
      dropZone: zone.id
    });
  }

  /**
   * Handle drag end
   */
  private onDragEnd(event: DragEvent, item: DraggableItem): void {
    // Remove dragging class
    if (item.element) {
      item.element.classList.remove('dragging');
      item.element.style.opacity = '';
    }

    // Remove ghost element
    this.removeGhostElement();

    // Emit event
    this.dragEventsSubject.next({
      type: 'dragend',
      data: item.data,
      event: event,
      target: item.element
    });

    // Clear current drag
    this.currentDrag = null;
  }

  /**
   * Create ghost element for drag feedback
   */
  private createGhostElement(item: DraggableItem): void {
    if (!item.element) return;

    this.ghostElement = item.element.cloneNode(true) as HTMLElement;
    this.ghostElement.style.position = 'fixed';
    this.ghostElement.style.pointerEvents = 'none';
    this.ghostElement.style.opacity = '0.8';
    this.ghostElement.style.zIndex = '10000';
    this.ghostElement.style.transform = 'scale(0.95)';
    this.ghostElement.classList.add('drag-ghost');

    document.body.appendChild(this.ghostElement);
  }

  /**
   * Remove ghost element
   */
  private removeGhostElement(): void {
    if (this.ghostElement && this.ghostElement.parentNode) {
      this.ghostElement.parentNode.removeChild(this.ghostElement);
      this.ghostElement = null;
    }
  }

  /**
   * Reorder items in an array
   */
  reorder<T>(array: T[], fromIndex: number, toIndex: number): T[] {
    const result = Array.from(array);
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return result;
  }

  /**
   * Move item between arrays
   */
  moveBetween<T>(
    sourceArray: T[],
    targetArray: T[],
    sourceIndex: number,
    targetIndex: number
  ): { source: T[]; target: T[] } {
    const source = Array.from(sourceArray);
    const target = Array.from(targetArray);
    const [removed] = source.splice(sourceIndex, 1);
    target.splice(targetIndex, 0, removed);
    return { source, target };
  }

  /**
   * Get element position
   */
  getElementPosition(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  /**
   * Check if point is inside element
   */
  isPointInElement(x: number, y: number, element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  /**
   * Get closest element
   */
  getClosestElement(
    x: number,
    y: number,
    elements: HTMLElement[]
  ): HTMLElement | null {
    let closest: HTMLElement | null = null;
    let closestDistance = Infinity;

    elements.forEach(element => {
      const pos = this.getElementPosition(element);
      const distance = Math.sqrt(
        Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closest = element;
      }
    });

    return closest;
  }

  /**
   * Add global drag styles to document
   */
  addDragStyles(): void {
    if (document.getElementById('drag-drop-styles')) return;

    const style = document.createElement('style');
    style.id = 'drag-drop-styles';
    style.textContent = `
      .dragging {
        opacity: 0.5 !important;
        cursor: grabbing !important;
      }

      .drag-over {
        background-color: rgba(102, 126, 234, 0.1) !important;
        border: 2px dashed #667eea !important;
      }

      .drag-ghost {
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2) !important;
        transition: transform 0.2s ease !important;
      }

      [draggable="true"] {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Remove global drag styles
   */
  removeDragStyles(): void {
    const style = document.getElementById('drag-drop-styles');
    if (style) {
      style.remove();
    }
  }

  /**
   * Clean up all registrations
   */
  cleanup(): void {
    this.draggables.clear();
    this.dropZones.clear();
    this.currentDrag = null;
    this.removeGhostElement();
  }
}
