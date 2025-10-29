import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  HostListener,
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
  shortcut?: string; // Keyboard shortcut (e.g., 'Delete', 'Ctrl+D')
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

export interface ToolbarBehaviorConfig {
  autoHide?: boolean;
  closeOnClickOutside?: boolean;
  followNode?: boolean;
  enableKeyboardNav?: boolean;
}

export interface ToolbarAnimationConfig {
  enabled?: boolean;
  duration?: string;
  easing?: string;
}

/**
 * Comprehensive configuration object for NodeToolbar
 */
export interface NodeToolbarConfig {
  position?: ToolbarPosition;
  alignment?: ToolbarAlignment;
  offset?: number;
  actions?: ToolbarAction[];
  template?: TemplateRef<any>;
  style?: ToolbarStyleConfig;
  animation?: ToolbarAnimationConfig;
  behavior?: ToolbarBehaviorConfig;
  ariaLabel?: string;
}

/**
 * Effective configuration type with all required properties except template
 */
export type EffectiveToolbarConfig = Required<Omit<NodeToolbarConfig, 'template'>> & { template?: TemplateRef<any> };

/**
 * NodeToolbar Component
 *
 * A floating toolbar that attaches to nodes and provides contextual actions.
 * The toolbar automatically positions itself relative to the node and updates
 * its position when the node moves, the canvas zooms/pans, or the window resizes.
 *
 * Features:
 * - Smart positioning with boundary detection
 * - Keyboard navigation and accessibility (WCAG 2.1 Level AA)
 * - Custom styling with CSS variables
 * - Error boundaries for robust operation
 * - Configuration object pattern
 *
 * @example
 * ```html
 * <grafloria-node-toolbar
 *   [node]="selectedNode"
 *   [engine]="diagramEngine"
 *   [config]="toolbarConfig">
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
      role="toolbar"
      [attr.aria-label]="effectiveConfig.ariaLabel || 'Node actions'"
      [attr.aria-hidden]="!isVisible"
      [class.visible]="isVisible"
      [class.animated]="effectiveConfig.animation?.enabled !== false"
      [style.transform]="transform"
      [style.opacity]="isVisible ? 1 : 0"
      [style.--toolbar-bg]="effectiveConfig.style?.backgroundColor"
      [style.--toolbar-border]="effectiveConfig.style?.borderColor"
      [style.--toolbar-radius]="effectiveConfig.style?.borderRadius"
      [style.--toolbar-shadow]="effectiveConfig.style?.boxShadow"
      [style.--toolbar-padding]="effectiveConfig.style?.padding"
      [style.--toolbar-z]="effectiveConfig.style?.zIndex"
      [style.--toolbar-transition]="effectiveConfig.animation?.duration || '0.2s'"
      [attr.data-position]="effectiveConfig.position"
      (keydown)="handleKeyDown($event)"
    >
      <!-- Default toolbar content -->
      @if (!effectiveConfig.template) {
        <div class="toolbar-content" role="group">
          @for (action of visibleActions; track action.id; let idx = $index) {
            <button
              #actionButton
              type="button"
              role="button"
              class="toolbar-button"
              [attr.aria-label]="action.tooltip || action.label"
              [attr.aria-disabled]="action.disabled"
              [attr.data-action-id]="action.id"
              [attr.tabindex]="idx === focusedActionIndex ? 0 : -1"
              [disabled]="action.disabled"
              [title]="action.tooltip || action.label"
              (click)="handleActionClick(action)"
              (focus)="onActionFocus(idx)"
            >
              @if (action.icon) {
                <i [class]="action.icon" aria-hidden="true"></i>
              }
              <span>{{ action.label }}</span>
            </button>
          }
        </div>
      }

      <!-- Custom template content -->
      @if (effectiveConfig.template) {
        <ng-container *ngTemplateOutlet="effectiveConfig.template; context: { $implicit: node, actions: visibleActions, config: effectiveConfig }">
        </ng-container>
      }
    </div>
  `,
  styles: [`
    .grafloria-node-toolbar {
      position: absolute;
      background: var(--toolbar-bg, var(--grafloria-toolbar-bg, white));
      border: 1px solid var(--toolbar-border, var(--grafloria-toolbar-border, #e2e8f0));
      border-radius: var(--toolbar-radius, var(--grafloria-toolbar-radius, 8px));
      box-shadow: var(--toolbar-shadow, var(--grafloria-toolbar-shadow, 0 4px 6px rgba(0, 0, 0, 0.1)));
      padding: var(--toolbar-padding, var(--grafloria-toolbar-padding, 4px));
      display: flex;
      gap: 4px;
      z-index: var(--toolbar-z, var(--grafloria-toolbar-z, 1000));
      transition: opacity var(--toolbar-transition, 0.2s) ease;
      pointer-events: all;
      outline: none;
    }

    .grafloria-node-toolbar.animated {
      transition: opacity var(--toolbar-transition, 0.2s) ease,
                  transform var(--toolbar-transition, 0.2s) ease;
    }

    .grafloria-node-toolbar:focus-within {
      outline: 2px solid var(--grafloria-focus-color, #667eea);
      outline-offset: 2px;
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
      color: var(--grafloria-toolbar-text, #334155);
      transition: background-color 0.15s ease;
      white-space: nowrap;
      position: relative;
    }

    .toolbar-button:hover:not(:disabled) {
      background: var(--grafloria-toolbar-hover, #f1f5f9);
    }

    .toolbar-button:active:not(:disabled) {
      background: var(--grafloria-toolbar-active, #e2e8f0);
    }

    .toolbar-button:focus {
      outline: 2px solid var(--grafloria-focus-color, #667eea);
      outline-offset: -2px;
      z-index: 1;
    }

    .toolbar-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .toolbar-button[aria-disabled="true"] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .toolbar-button i {
      font-size: 16px;
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
      .grafloria-node-toolbar {
        border-width: 2px;
      }

      .toolbar-button:focus {
        outline-width: 3px;
      }
    }

    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .grafloria-node-toolbar,
      .toolbar-button {
        transition: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeToolbarComponent implements OnInit, OnChanges, OnDestroy {
  // Individual inputs (backward compatible)
  @Input() node!: NodeModel;
  @Input() engine!: DiagramEngine;
  @Input() canvasElement?: HTMLElement;
  @Input() viewport: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 800, height: 600 };
  @Input() zoom: number = 1.0;
  @Input() position: ToolbarPosition = 'top';
  @Input() alignment: ToolbarAlignment = 'center';
  @Input() offset: number = 8;
  @Input() actions: ToolbarAction[] = [];
  @Input() customTemplate?: TemplateRef<any>;
  @Input() visible: boolean = true;
  @Input() styleConfig?: ToolbarStyleConfig;
  @Input() enableAnimation: boolean = true;
  @Input() autoHide: boolean = false;

  // Configuration object (preferred approach)
  @Input() config?: NodeToolbarConfig;

  @Output() actionClicked = new EventEmitter<{ action: ToolbarAction; node: NodeModel }>();
  @Output() visibilityChanged = new EventEmitter<boolean>();
  @Output() positionUpdated = new EventEmitter<{ x: number; y: number }>();

  @ViewChild('toolbar', { read: ElementRef }) toolbarRef?: ElementRef<HTMLDivElement>;

  isVisible = false;
  transform = '';
  focusedActionIndex = 0;

  private destroy$ = new Subject<void>();
  private positionUpdatePending = false;
  private eventListeners: Array<{ event: string; handler: Function }> = [];
  private lastKnownPosition = { x: 0, y: 0 };

  constructor(private cdr: ChangeDetectorRef, private elementRef: ElementRef) {}

  /**
   * Effective configuration merging individual inputs with config object
   */
  get effectiveConfig(): EffectiveToolbarConfig {
    const defaults: EffectiveToolbarConfig = {
      position: 'top',
      alignment: 'center',
      offset: 8,
      actions: [],
      template: undefined as any,
      style: {},
      animation: { enabled: true, duration: '0.2s', easing: 'ease' },
      behavior: {
        autoHide: false,
        closeOnClickOutside: false,
        followNode: true,
        enableKeyboardNav: true
      },
      ariaLabel: 'Node actions'
    };

    // Merge config object with individual inputs (individual inputs take precedence)
    const merged = {
      ...defaults,
      ...(this.config || {}),
      position: this.position,
      alignment: this.alignment,
      offset: this.offset,
      actions: this.actions.length > 0 ? this.actions : (this.config?.actions || []),
      template: this.customTemplate || this.config?.template,
      style: { ...defaults.style, ...(this.config?.style || {}), ...(this.styleConfig || {}) },
      animation: {
        ...defaults.animation,
        ...(this.config?.animation || {}),
        enabled: this.enableAnimation
      },
      behavior: {
        ...defaults.behavior,
        ...(this.config?.behavior || {}),
        autoHide: this.autoHide
      },
      ariaLabel: this.config?.ariaLabel || 'Node actions'
    };

    return merged;
  }

  /**
   * Get visible actions based on visibility conditions
   */
  get visibleActions(): ToolbarAction[] {
    return this.effectiveConfig.actions.filter(action => {
      if (action.hidden) {
        return false;
      }
      if (action.visible && !action.visible(this.node)) {
        return false;
      }
      return true;
    });
  }

  ngOnInit() {
    this.isVisible = this.visible;
    setTimeout(() => this.updatePosition(), 0);
    this.setupEventListeners();
    this.setupKeyboardNavigation();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Update viewport/zoom when inputs change
    if (changes['viewport'] && !changes['viewport'].firstChange) {
      this.schedulePositionUpdate();
    }

    if (changes['zoom'] && !changes['zoom'].firstChange) {
      this.schedulePositionUpdate();
    }

    // Update visibility
    if (changes['visible']) {
      this.isVisible = this.visible;
      this.visibilityChanged.emit(this.isVisible);
    }

    // Re-render if config changes
    if (changes['config'] || changes['actions'] || changes['position']) {
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy() {
    this.cleanup();
  }

  /**
   * Setup engine event listeners
   */
  private setupEventListeners() {
    if (!this.engine) {
      return;
    }

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

    this.eventListeners.push(
      { event: 'canvas:zoom', handler: zoomHandler },
      { event: 'canvas:pan', handler: panHandler },
      { event: 'node:moved', handler: moveHandler },
      { event: 'node:resized', handler: resizeHandler }
    );

    // Window resize
    fromEvent(window, 'resize')
      .pipe(throttleTime(100), takeUntil(this.destroy$))
      .subscribe(() => this.updatePosition());
  }

  /**
   * Setup keyboard navigation
   */
  private setupKeyboardNavigation() {
    if (!this.effectiveConfig.behavior.enableKeyboardNav) {
      return;
    }

    // Will handle keyboard events via HostListener below
  }

  /**
   * Clean up resources
   */
  private cleanup() {
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
   * Schedule a position update (throttled)
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
   * Update toolbar position with error handling
   */
  updatePosition() {
    try {
      if (!this.toolbarRef || !this.node) {
        return;
      }

      const toolbarEl = this.toolbarRef.nativeElement;
      const canvasEl = this.getCanvasElement();

      if (!canvasEl) {
        console.warn('NodeToolbar: Canvas element not found');
        return;
      }

      const nodeRect = this.getNodeScreenRect(canvasEl);
      const toolbarRect = toolbarEl.getBoundingClientRect();

      let x = 0;
      let y = 0;

      // Calculate position
      switch (this.effectiveConfig.position) {
        case 'top':
          x = this.calculateAlignedX(nodeRect, toolbarRect.width);
          y = nodeRect.top - toolbarRect.height - this.effectiveConfig.offset;
          break;
        case 'bottom':
          x = this.calculateAlignedX(nodeRect, toolbarRect.width);
          y = nodeRect.bottom + this.effectiveConfig.offset;
          break;
        case 'left':
          x = nodeRect.left - toolbarRect.width - this.effectiveConfig.offset;
          y = this.calculateAlignedY(nodeRect, toolbarRect.height);
          break;
        case 'right':
          x = nodeRect.right + this.effectiveConfig.offset;
          y = this.calculateAlignedY(nodeRect, toolbarRect.height);
          break;
      }

      // Boundary detection
      const canvasRect = canvasEl.getBoundingClientRect();
      const margin = 8;
      x = Math.max(canvasRect.left + margin, Math.min(x, canvasRect.right - toolbarRect.width - margin));
      y = Math.max(canvasRect.top + margin, Math.min(y, canvasRect.bottom - toolbarRect.height - margin));

      // Store last known position
      this.lastKnownPosition = { x, y };

      // Update transform
      this.transform = `translate(${x}px, ${y}px)`;
      this.cdr.detectChanges();

      // Emit position update
      this.positionUpdated.emit({ x, y });

    } catch (error) {
      console.error('NodeToolbar: Failed to update position', error);
      // Fallback to last known position or origin
      const fallbackX = this.lastKnownPosition.x || 0;
      const fallbackY = this.lastKnownPosition.y || 0;
      this.transform = `translate(${fallbackX}px, ${fallbackY}px)`;
      this.cdr.detectChanges();
    }
  }

  /**
   * Get canvas element with fallback
   */
  private getCanvasElement(): HTMLElement | null {
    if (this.canvasElement) {
      return this.canvasElement;
    }

    // Try to find canvas element
    const selectors = [
      'grafloria-diagram-canvas',
      '.diagram-canvas',
      '[role="application"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement;
      if (el) {
        return el;
      }
    }

    return null;
  }

  /**
   * Calculate aligned X position
   */
  private calculateAlignedX(nodeRect: DOMRect, toolbarWidth: number): number {
    switch (this.effectiveConfig.alignment) {
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
   * Calculate aligned Y position
   */
  private calculateAlignedY(nodeRect: DOMRect, toolbarHeight: number): number {
    switch (this.effectiveConfig.alignment) {
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
   * Get node's screen coordinates
   */
  private getNodeScreenRect(canvasEl: HTMLElement): DOMRect {
    const nodeX = this.node.position.x;
    const nodeY = this.node.position.y;
    const nodeWidth = this.node.size.width;
    const nodeHeight = this.node.size.height;

    const canvasRect = canvasEl.getBoundingClientRect();

    const screenX = canvasRect.left + (nodeX * this.zoom + this.viewport.x);
    const screenY = canvasRect.top + (nodeY * this.zoom + this.viewport.y);
    const screenWidth = nodeWidth * this.zoom;
    const screenHeight = nodeHeight * this.zoom;

    return new DOMRect(screenX, screenY, screenWidth, screenHeight);
  }

  /**
   * Handle action click
   */
  handleActionClick(action: ToolbarAction) {
    if (!action.disabled) {
      try {
        action.onClick(this.node);
        this.actionClicked.emit({ action, node: this.node });
      } catch (error) {
        console.error('NodeToolbar: Action click handler failed', error);
      }
    }
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyDown(event: KeyboardEvent) {
    if (!this.effectiveConfig.behavior.enableKeyboardNav) {
      return;
    }

    const actions = this.visibleActions;
    if (actions.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.focusedActionIndex = (this.focusedActionIndex + 1) % actions.length;
        this.focusAction(this.focusedActionIndex);
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.focusedActionIndex = (this.focusedActionIndex - 1 + actions.length) % actions.length;
        this.focusAction(this.focusedActionIndex);
        break;

      case 'Home':
        event.preventDefault();
        this.focusedActionIndex = 0;
        this.focusAction(0);
        break;

      case 'End':
        event.preventDefault();
        this.focusedActionIndex = actions.length - 1;
        this.focusAction(actions.length - 1);
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        const action = actions[this.focusedActionIndex];
        if (action && !action.disabled) {
          this.handleActionClick(action);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.hide();
        break;
    }
  }

  /**
   * Focus a specific action button
   */
  private focusAction(index: number) {
    setTimeout(() => {
      const buttons = this.toolbarRef?.nativeElement.querySelectorAll('.toolbar-button');
      if (buttons && buttons[index]) {
        (buttons[index] as HTMLElement).focus();
      }
    }, 0);
  }

  /**
   * Handle action focus
   */
  onActionFocus(index: number) {
    this.focusedActionIndex = index;
  }

  /**
   * Show toolbar
   */
  show() {
    this.isVisible = true;
    this.updatePosition();
    this.visibilityChanged.emit(true);
    this.cdr.detectChanges();

    // Focus first action if keyboard nav enabled
    if (this.effectiveConfig.behavior.enableKeyboardNav) {
      setTimeout(() => this.focusAction(0), 100);
    }
  }

  /**
   * Hide toolbar
   */
  hide() {
    this.isVisible = false;
    this.visibilityChanged.emit(false);
    this.cdr.detectChanges();
  }

  /**
   * Toggle visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}
