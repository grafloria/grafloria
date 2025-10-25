import {
  Directive,
  ElementRef,
  Input,
  AfterViewInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { HandleRegistryService } from '../services/handle-registry.service';

/**
 * Directive to mark HTML elements as connection handles (React Flow style)
 *
 * Usage:
 * ```html
 * <div grafloriaHandle="source" handleId="output-1" handlePosition="right">
 *   Connect Here
 * </div>
 * ```
 *
 * The directive automatically:
 * - Registers the handle with HandleRegistryService on init
 * - Unregisters on destroy
 * - Allows DOM-based position queries for connections
 *
 * Phase 2: Hybrid HTML+SVG Rendering
 */
@Directive({
  selector: '[grafloriaHandle]',
  standalone: true,
})
export class GrafloriaHandleDirective implements AfterViewInit, OnDestroy {
  /**
   * Handle type: 'source' (output) or 'target' (input)
   * Required.
   */
  @Input({ required: true }) grafloriaHandle!: 'source' | 'target';

  /**
   * Unique handle ID within the node
   * If not provided, will be auto-generated
   */
  @Input() handleId?: string;

  /**
   * Handle position relative to node
   * Affects how connections are drawn
   */
  @Input() handlePosition?: 'top' | 'right' | 'bottom' | 'left';

  private elementRef = inject(ElementRef<HTMLElement>);
  private handleRegistry = inject(HandleRegistryService);
  private registeredNodeId: string | null = null;
  private registeredHandleId: string | null = null;

  ngAfterViewInit(): void {
    // Find parent node ID by traversing DOM
    const nodeId = this.getParentNodeId();

    if (!nodeId) {
      console.warn(
        '[GrafloriaHandle] No parent node with data-node-id found. ' +
        'Ensure the handle is inside an HTML node component with [attr.data-node-id]'
      );
      return;
    }

    // Generate handle ID if not provided
    const handleId = this.handleId || this.generateHandleId();

    // Register with HandleRegistryService
    this.handleRegistry.registerHandle(nodeId, {
      id: handleId,
      type: this.grafloriaHandle,
      position: this.handlePosition || 'right',
      element: this.elementRef.nativeElement,
    });

    // Track for cleanup
    this.registeredNodeId = nodeId;
    this.registeredHandleId = handleId;

    console.log(
      `✅ [GrafloriaHandle] Registered ${this.grafloriaHandle} handle "${handleId}" ` +
      `for node "${nodeId}" at position ${this.handlePosition || 'right'}`
    );
  }

  ngOnDestroy(): void {
    // Unregister handle on destroy
    if (this.registeredNodeId && this.registeredHandleId) {
      this.handleRegistry.unregisterHandle(
        this.registeredNodeId,
        this.registeredHandleId
      );

      console.log(
        `🗑️  [GrafloriaHandle] Unregistered handle "${this.registeredHandleId}" ` +
        `from node "${this.registeredNodeId}"`
      );
    }
  }

  /**
   * Find parent node ID by traversing up the DOM tree
   * Looks for element with data-node-id attribute
   */
  private getParentNodeId(): string | null {
    let element = this.elementRef.nativeElement.parentElement;

    while (element) {
      if (element.hasAttribute('data-node-id')) {
        return element.getAttribute('data-node-id');
      }
      element = element.parentElement;
    }

    return null;
  }

  /**
   * Generate a unique handle ID
   */
  private generateHandleId(): string {
    return `handle-${Math.random().toString(36).substring(2, 11)}`;
  }
}
