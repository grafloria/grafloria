import {
  Directive,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
} from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

// Simplified engine interface for responsive canvas
export interface IResponsiveCanvasEngine {
  getCanvas?(): HTMLElement | null;
  getZoom(): number;
  setZoom?(zoom: number): void;
  getPan(): { x: number; y: number };
  setPan(x: number, y: number): void;
  repaint?(): void;
}

@Directive({
  selector: '[grafloriaResponsiveCanvas]',
  standalone: true,
})
export class ResponsiveCanvasDirective implements OnInit, OnDestroy, OnChanges {
  @Input() engine!: IResponsiveCanvasEngine;
  @Input() maintainZoom = true; // Maintain zoom level on resize
  @Input() maintainCenter = true; // Keep same center point
  @Input() enabled = true; // Enable/disable responsive behavior
  @Input() autoEnable = true; // Auto-enable on init

  private destroy$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;
  private _isEnabled = false;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit() {
    // Auto-enable if configured
    if (this.autoEnable && this.enabled) {
      this.enable();
    }
  }

  ngOnChanges(changes: any) {
    // Handle enabled input changes
    if (changes.enabled) {
      if (changes.enabled.currentValue && !this._isEnabled) {
        this.enable();
      } else if (!changes.enabled.currentValue && this._isEnabled) {
        this.disable();
      }
    }
  }

  /**
   * Enable responsive behavior
   */
  enable() {
    if (this._isEnabled) {
      return;
    }

    // Handle window resize
    fromEvent(window, 'resize')
      .pipe(debounceTime(150), takeUntil(this.destroy$))
      .subscribe(() => this.handleResize());

    // Handle orientation change
    fromEvent(window, 'orientationchange')
      .pipe(debounceTime(200), takeUntil(this.destroy$))
      .subscribe(() => this.handleResize());

    // Use ResizeObserver for container resize (more accurate than window resize)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.el.nativeElement);
    }

    this._isEnabled = true;

    // Initial resize
    setTimeout(() => this.handleResize(), 100);
  }

  /**
   * Disable responsive behavior
   */
  disable() {
    if (!this._isEnabled) {
      return;
    }

    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    this._isEnabled = false;
  }

  /**
   * Toggle responsive behavior on/off
   */
  toggle() {
    if (this._isEnabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Check if responsive behavior is enabled
   */
  isEnabled(): boolean {
    return this._isEnabled;
  }

  /**
   * Manually trigger a resize operation
   */
  triggerResize() {
    if (this._isEnabled) {
      this.handleResize();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private handleResize() {
    if (!this.engine || !this._isEnabled) {
      return;
    }

    const container = this.el.nativeElement;
    const canvas = this.engine.getCanvas?.();

    if (!canvas) {
      return;
    }

    // Get current center point (before resize)
    const oldCenter = this.maintainCenter ? this.getCanvasCenter() : null;

    // Resize canvas to match container
    const rect = container.getBoundingClientRect();
    canvas.setAttribute('width', String(rect.width));
    canvas.setAttribute('height', String(rect.height));

    // For SVG, also set viewBox
    if (canvas.tagName.toLowerCase() === 'svg') {
      canvas.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    }

    // Restore center point (after resize)
    if (this.maintainCenter && oldCenter) {
      this.setCanvasCenter(oldCenter);
    }

    // Repaint
    if (this.engine.repaint) {
      this.engine.repaint();
    }
  }

  private getCanvasCenter(): { x: number; y: number } {
    const canvas = this.engine.getCanvas?.();
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const zoom = this.engine.getZoom();
    const pan = this.engine.getPan();

    // Calculate diagram coordinates of canvas center
    const centerX = (rect.width / 2 - pan.x) / zoom;
    const centerY = (rect.height / 2 - pan.y) / zoom;

    return { x: centerX, y: centerY };
  }

  private setCanvasCenter(center: { x: number; y: number }) {
    const canvas = this.engine.getCanvas?.();
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const zoom = this.engine.getZoom();

    // Calculate pan to center on the same diagram coordinates
    const panX = rect.width / 2 - center.x * zoom;
    const panY = rect.height / 2 - center.y * zoom;

    this.engine.setPan(panX, panY);
  }
}
