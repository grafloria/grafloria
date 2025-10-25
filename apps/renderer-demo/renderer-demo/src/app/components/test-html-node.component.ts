import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GrafloriaHandleDirective } from '@grafloria/renderer-angular';
import type { DiagramEngine } from '@grafloria/engine';

/**
 * Test component for Phase 2 HTML layer with handles
 *
 * This component tests:
 * - HTML layer rendering (metadata.useHTMLLayer = true)
 * - Handle registration via grafloriaHandle directive
 * - Handle bounds calculation
 * - Component positioning
 * - Port visibility modes (always, on-hover, hidden)
 */
@Component({
  selector: 'app-test-html-node',
  standalone: true,
  imports: [CommonModule, GrafloriaHandleDirective],
  template: `
    <div class="test-node"
         (mouseenter)="onMouseEnter()"
         (mouseleave)="onMouseLeave()">
      <div class="node-header">
        <h4>{{ node?.type || 'Test Node' }}</h4>
        <small>ID: {{ node?.id }}</small>
      </div>

      <div class="node-content">
        <p>HTML Layer Test</p>
        <p>Position: {{ node?.position?.x }}, {{ node?.position?.y }}</p>
      </div>

      <!-- Test Handles - Visibility controlled by port visibility mode -->
      <div class="handles" [class.handles-visible]="handlesVisible">
        <!-- Top handle (target) -->
        <div
          grafloriaHandle="target"
          handleId="input-top"
          handlePosition="top"
          class="handle handle-top">
          <div class="handle-dot"></div>
        </div>

        <!-- Right handle (source) -->
        <div
          grafloriaHandle="source"
          handleId="output-right"
          handlePosition="right"
          class="handle handle-right">
          <div class="handle-dot"></div>
        </div>

        <!-- Bottom handle (source) -->
        <div
          grafloriaHandle="source"
          handleId="output-bottom"
          handlePosition="bottom"
          class="handle handle-bottom">
          <div class="handle-dot"></div>
        </div>

        <!-- Left handle (target) -->
        <div
          grafloriaHandle="target"
          handleId="input-left"
          handlePosition="left"
          class="handle handle-left">
          <div class="handle-dot"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .test-node {
      position: relative;
      width: 200px;
      background: white;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      font-family: system-ui, -apple-system, sans-serif;
      pointer-events: auto; /* Allow events on the node */
    }

    .node-header {
      padding: 12px;
      background: #3b82f6;
      color: white;
      border-radius: 6px 6px 0 0;
    }

    .node-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .node-header small {
      font-size: 11px;
      opacity: 0.8;
    }

    .node-content {
      padding: 12px;
    }

    .node-content p {
      margin: 4px 0;
      font-size: 12px;
      color: #666;
    }

    /* Handle Styles */
    .handles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 100; /* Ensure handles container is above everything */
    }

    /* Port visibility modes */
    .handles .handle {
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
    }

    /* Always visible mode */
    .handles.handles-visible .handle {
      opacity: 1;
      visibility: visible;
    }

    .handle {
      position: absolute;
      pointer-events: all;
      z-index: 1000; /* Very high z-index to be above node content */
      cursor: crosshair;
    }

    .handle-dot {
      width: 12px;
      height: 12px;
      background: #3b82f6;
      border: 2px solid white;
      border-radius: 50%;
      cursor: crosshair;
      transition: all 0.2s;
    }

    .handle-dot:hover {
      width: 16px;
      height: 16px;
      background: #2563eb;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
    }

    /* Handle Positions */
    .handle-top {
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
    }

    .handle-right {
      top: 50%;
      right: -6px;
      transform: translateY(-50%);
    }

    .handle-bottom {
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
    }

    .handle-left {
      top: 50%;
      left: -6px;
      transform: translateY(-50%);
    }

    /* Target handles are green */
    .handle[grafloriaHandle="target"] .handle-dot {
      background: #10b981;
    }

    .handle[grafloriaHandle="target"] .handle-dot:hover {
      background: #059669;
      box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
    }
  `]
})
export class TestHtmlNodeComponent implements OnInit, OnDestroy {
  @Input() node: any;
  @Input() engine?: DiagramEngine;

  /**
   * Whether handles should be visible
   * Controlled by port visibility mode
   */
  handlesVisible = false;

  /**
   * Whether mouse is currently hovering over node
   */
  private isHovering = false;

  /**
   * Subscription to interaction config changes
   */
  private configUnsubscribe?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Get initial visibility based on port visibility mode
    this.updateHandleVisibility();

    // Subscribe to interaction config changes
    if (this.engine) {
      const eventBus = (this.engine as any)['eventBus'];
      if (eventBus) {
        const handler = () => {
          this.updateHandleVisibility();
          this.cdr.markForCheck();
        };
        eventBus.on('config:interaction-changed', handler);
        this.configUnsubscribe = () => {
          eventBus.off('config:interaction-changed', handler);
        };
      }
    }
  }

  ngOnDestroy(): void {
    if (this.configUnsubscribe) {
      this.configUnsubscribe();
    }
  }

  /**
   * Handle mouse enter
   */
  onMouseEnter(): void {
    this.isHovering = true;
    this.updateHandleVisibility();
  }

  /**
   * Handle mouse leave
   */
  onMouseLeave(): void {
    this.isHovering = false;
    this.updateHandleVisibility();
  }

  /**
   * Update handle visibility based on port visibility mode
   */
  private updateHandleVisibility(): void {
    if (!this.engine) {
      // Default to always visible if no engine
      this.handlesVisible = true;
      return;
    }

    const config = this.engine.getInteractionConfig();
    const portVisibility = config?.portVisibility || 'always';

    switch (portVisibility) {
      case 'always':
        this.handlesVisible = true;
        break;
      case 'on-hover':
        this.handlesVisible = this.isHovering;
        break;
      case 'hidden':
        // TODO: Show handles during connection drag
        this.handlesVisible = false;
        break;
      default:
        this.handlesVisible = true;
    }
  }
}
