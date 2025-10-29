import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  TemplateRef,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeModel } from '@grafloria/engine';
import type { DiagramEngine } from '@grafloria/engine';
import { Subject, fromEvent } from 'rxjs';
import { takeUntil, throttleTime } from 'rxjs/operators';

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';
export type ToolbarAlignment = 'start' | 'center' | 'end';

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  disabled?: boolean;
  hidden?: boolean; // Hide action without removing it
  visible?: (node: NodeModel) => boolean; // Dynamic visibility
  onClick: (node: NodeModel) => void;
  group?: string; // For grouping actions with separators
}

export interface ToolbarStyleConfig {
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: string;
  boxShadow?: string;
  padding?: string;
  zIndex?: number;
  transitionDuration?: string;
}

/**
 * NodeToolbar Component
 *
 * A floating toolbar that attaches to nodes and provides contextual actions.
 * The toolbar automatically positions itself relative to the node and updates
 * its position when the node moves, the canvas zooms/pans, or the window resizes.
 *
 * @example
 * ```html
 * <grafloria-node-toolbar
 *   [node]="selectedNode"
 *   [engine]="diagramEngine"
 *   [viewport]="viewport"
 *   [zoom]="zoom"
 *   [position]="'top'"
 *   [actions]="toolbarActions">
 * </grafloria-node-toolbar>
 * ```
 */
@Component({
  selector: 'grafloria-node-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      #toolbar
      class="grafloria-node-toolbar"
      [class.visible]="isVisible"
      [style.transform]="transform"
      [style.opacity]="isVisible ? 1 : 0"
      [attr.data-position]="position"
    >
      <!-- Default toolbar content -->
      @if (!customTemplate) {
        <div class="toolbar-content">
          @for (action of visibleActions; track action.id) {
            <button
              class="toolbar-button"
              [disabled]="action.disabled"
              [title]="action.tooltip || action.label"
              (click)="handleActionClick(action)"
            >
              @if (action.icon) {
                <i [class]="action.icon"></i>
              }
              <span>{{ action.label }}</span>
            </button>
          }
        </div>
      }

      <!-- Custom template content -->
      @if (customTemplate) {
        <ng-container *ngTemplateOutlet="customTemplate; context: { $implicit: node, actions: actions }">
        </ng-container>
      }
    </div>
  `,
  styles: [`
    .grafloria-node-toolbar {
      position: absolute;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 4px;
      display: flex;
      gap: 4px;
      z-index: 1000;
      transition: opacity 0.2s ease;
      pointer-events: all;
    }

    .grafloria-node-toolbar[data-position="top"],
    .grafloria-node-toolbar[data-position="bottom"] {
      flex-direction: row;
    }

    .grafloria-node-toolbar[data-position="left"],
    .grafloria-node-toolbar[data-position="right"] {
      flex-direction: column;
    }

    .toolbar-content {
      display: flex;
      gap: 4px;
    }

    .grafloria-node-toolbar[data-position="left"] .toolbar-content,
    .grafloria-node-toolbar[data-position="right"] .toolbar-content {
      flex-direction: column;
    }

    .toolbar-button {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      color: #334155;
      transition: background-color 0.15s ease;
      white-space: nowrap;
    }

    .toolbar-button:hover:not(:disabled) {
      background: #f1f5f9;
    }

    .toolbar-button:active:not(:disabled) {
      background: #e2e8f0;
    }

    .toolbar-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .toolbar-button i {
      font-size: 16px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeToolbarComponent implements OnInit, OnDestroy {
  @Input() node!: NodeModel;
  @Input() engine!: DiagramEngine;
  @Input() canvasElement?: HTMLElement; // The canvas container element
  @Input() viewport: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 800, height: 600 };
  @Input() zoom: number = 1.0;
  @Input() position: ToolbarPosition = 'top';
  @Input() alignment: ToolbarAlignment = 'center';
  @Input() offset: number = 8; // Distance from node in pixels
  @Input() actions: ToolbarAction[] = [];
  @Input() customTemplate?: TemplateRef<any>;
  @Input() visible: boolean = true;
  @Input() styleConfig?: ToolbarStyleConfig; // Custom styling
  @Input() enableAnimation: boolean = true; // Toggle animations
  @Input() autoHide: boolean = false; // Auto-hide when clicking outside

  @Output() actionClicked = new EventEmitter<{ action: ToolbarAction; node: NodeModel }>();

  @ViewChild('toolbar', { read: ElementRef }) toolbarRef?: ElementRef<HTMLDivElement>;

  isVisible = false;
  transform = '';

  private destroy$ = new Subject<void>();
  private positionUpdatePending = false;
  private eventListeners: Array<{ event: string; handler: Function }> = [];

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Get visible actions based on visibility conditions
   */
  get visibleActions(): ToolbarAction[] {
    return this.actions.filter(action => {
      // Check hidden flag
      if (action.hidden) {
        return false;
      }
      // Check dynamic visibility function
      if (action.visible && !action.visible(this.node)) {
        return false;
      }
      return true;
    });
  }

  ngOnInit() {
    // Show toolbar when component initializes
    this.isVisible = this.visible;

    // Update position initially
    setTimeout(() => this.updatePosition(), 0);

    // Listen to engine events to update position
    if (this.engine) {
      const zoomHandler = () => this.schedulePositionUpdate();
      const panHandler = () => this.schedulePositionUpdate();
      const moveHandler = (event: any) => {
        if (event.node?.id === this.node.id) {
          this.schedulePositionUpdate();
        }
      };
      const resizeHandler = (event: any) => {
        if (event.node?.id === this.node.id) {
          this.schedulePositionUpdate();
        }
      };

      this.engine.eventBus.on('canvas:zoom', zoomHandler);
      this.engine.eventBus.on('canvas:pan', panHandler);
      this.engine.eventBus.on('node:moved', moveHandler);
      this.engine.eventBus.on('node:resized', resizeHandler);

      // Store references for cleanup
      this.eventListeners.push(
        { event: 'canvas:zoom', handler: zoomHandler },
        { event: 'canvas:pan', handler: panHandler },
        { event: 'node:moved', handler: moveHandler },
        { event: 'node:resized', handler: resizeHandler }
      );
    }

    // Update position on window resize
    fromEvent(window, 'resize')
      .pipe(throttleTime(100), takeUntil(this.destroy$))
      .subscribe(() => this.updatePosition());
  }

  ngOnDestroy() {
    // Clean up event listeners
    if (this.engine) {
      this.eventListeners.forEach(({ event, handler }) => {
        this.engine.eventBus.off(event, handler);
      });
    }
    this.eventListeners = [];

    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Schedule a position update (throttled to prevent excessive updates)
   */
  private schedulePositionUpdate() {
    if (this.positionUpdatePending) {
      return;
    }

    this.positionUpdatePending = true;
    requestAnimationFrame(() => {
      this.updatePosition();
      this.positionUpdatePending = false;
    });
  }

  /**
   * Update toolbar position based on node position and zoom level
   */
  updatePosition() {
    if (!this.toolbarRef || !this.node) {
      return;
    }

    const toolbarEl = this.toolbarRef.nativeElement;

    // Get canvas element - try from input, fallback to finding it
    let canvasEl = this.canvasElement;
    if (!canvasEl) {
      // Try to find the canvas element by looking for grafloria-diagram-canvas or similar
      canvasEl = document.querySelector('grafloria-diagram-canvas') as HTMLElement;
      if (!canvasEl) {
        canvasEl = document.querySelector('.diagram-canvas') as HTMLElement;
      }
    }

    if (!canvasEl) {
      return;
    }

    // Get node bounding rect in screen coordinates
    const nodeRect = this.getNodeScreenRect(canvasEl);

    // Get toolbar size
    const toolbarRect = toolbarEl.getBoundingClientRect();

    // Calculate position based on position prop
    let x = 0;
    let y = 0;

    switch (this.position) {
      case 'top':
        x = this.calculateAlignedX(nodeRect, toolbarRect.width);
        y = nodeRect.top - toolbarRect.height - this.offset;
        break;

      case 'bottom':
        x = this.calculateAlignedX(nodeRect, toolbarRect.width);
        y = nodeRect.bottom + this.offset;
        break;

      case 'left':
        x = nodeRect.left - toolbarRect.width - this.offset;
        y = this.calculateAlignedY(nodeRect, toolbarRect.height);
        break;

      case 'right':
        x = nodeRect.right + this.offset;
        y = this.calculateAlignedY(nodeRect, toolbarRect.height);
        break;
    }

    // Adjust if toolbar would go off-screen
    const canvasRect = canvasEl.getBoundingClientRect();
    x = Math.max(canvasRect.left + 8, Math.min(x, canvasRect.right - toolbarRect.width - 8));
    y = Math.max(canvasRect.top + 8, Math.min(y, canvasRect.bottom - toolbarRect.height - 8));

    // Set transform
    this.transform = `translate(${x}px, ${y}px)`;
    this.cdr.detectChanges();
  }

  /**
   * Calculate X position based on alignment
   */
  private calculateAlignedX(nodeRect: DOMRect, toolbarWidth: number): number {
    switch (this.alignment) {
      case 'start':
        return nodeRect.left;
      case 'center':
        return nodeRect.left + nodeRect.width / 2 - toolbarWidth / 2;
      case 'end':
        return nodeRect.right - toolbarWidth;
      default:
        return nodeRect.left;
    }
  }

  /**
   * Calculate Y position based on alignment
   */
  private calculateAlignedY(nodeRect: DOMRect, toolbarHeight: number): number {
    switch (this.alignment) {
      case 'start':
        return nodeRect.top;
      case 'center':
        return nodeRect.top + nodeRect.height / 2 - toolbarHeight / 2;
      case 'end':
        return nodeRect.bottom - toolbarHeight;
      default:
        return nodeRect.top;
    }
  }

  /**
   * Get node's screen coordinates (accounting for zoom and pan)
   */
  private getNodeScreenRect(canvasEl: HTMLElement): DOMRect {
    const nodeX = this.node.position.x;
    const nodeY = this.node.position.y;
    const nodeWidth = this.node.size.width;
    const nodeHeight = this.node.size.height;

    const canvasRect = canvasEl.getBoundingClientRect();

    // Convert diagram coordinates to screen coordinates
    // Account for viewport pan and zoom
    const screenX = canvasRect.left + (nodeX * this.zoom + this.viewport.x);
    const screenY = canvasRect.top + (nodeY * this.zoom + this.viewport.y);
    const screenWidth = nodeWidth * this.zoom;
    const screenHeight = nodeHeight * this.zoom;

    return new DOMRect(screenX, screenY, screenWidth, screenHeight);
  }

  /**
   * Handle action button click
   */
  handleActionClick(action: ToolbarAction) {
    if (!action.disabled) {
      action.onClick(this.node);
      this.actionClicked.emit({ action, node: this.node });
    }
  }

  /**
   * Show toolbar
   */
  show() {
    this.isVisible = true;
    this.updatePosition();
    this.cdr.detectChanges();
  }

  /**
   * Hide toolbar
   */
  hide() {
    this.isVisible = false;
    this.cdr.detectChanges();
  }

  /**
   * Toggle toolbar visibility
   */
  toggle() {
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.updatePosition();
    }
    this.cdr.detectChanges();
  }
}
