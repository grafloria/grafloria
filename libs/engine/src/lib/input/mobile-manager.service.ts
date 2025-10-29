import { TouchHandler } from './touch-handler';
import { MobileInteractionService, MobileConfig, IMobileEngine } from './mobile-interaction.service';
import { MobilePerformanceService } from '../performance/mobile-performance.service';

/**
 * Configuration for MobileManager
 */
export interface MobileManagerConfig {
  // Auto-enable mobile mode on mobile devices
  autoEnable?: boolean;

  // Enable responsive canvas resizing
  enableResponsive?: boolean;

  // Mobile interaction settings
  interaction?: Partial<MobileConfig>;

  // Performance settings
  performance?: {
    enableThrottling?: boolean;
    touchMoveThrottle?: number;
    reducedRendering?: boolean;
  };

  // Callbacks
  onMobileEnabled?: () => void;
  onMobileDisabled?: () => void;
}

/**
 * Unified manager for all mobile features
 * Provides easy enable/disable toggle and manual control
 */
export class MobileManager {
  private canvas: HTMLElement | null = null;
  private engine: IMobileEngine;
  private config: MobileManagerConfig;

  // Services
  private mobileInteractionService: MobileInteractionService | null = null;
  private performanceService: MobilePerformanceService;
  private touchHandler: TouchHandler | null = null;

  // State
  private _enabled = false;
  private _responsiveEnabled = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: number | null = null;

  constructor(engine: IMobileEngine, config: MobileManagerConfig = {}) {
    this.engine = engine;
    this.config = {
      autoEnable: true,
      enableResponsive: true,
      ...config,
    };

    // Initialize performance service
    this.performanceService = new MobilePerformanceService();
    this.performanceService.initialize(config.performance);

    // Auto-enable on mobile devices if configured
    if (this.config.autoEnable && MobilePerformanceService.isMobileDevice()) {
      // Delay to allow canvas to be set
      setTimeout(() => {
        if (this.canvas) {
          this.enable();
        }
      }, 100);
    }
  }

  /**
   * Set the canvas element
   */
  setCanvas(canvas: HTMLElement) {
    this.canvas = canvas;

    // If mobile mode should be enabled, enable it now
    if (this.config.autoEnable && MobilePerformanceService.isMobileDevice()) {
      this.enable();
    }
  }

  /**
   * Enable mobile mode
   */
  enable() {
    if (this._enabled || !this.canvas) {
      return;
    }

    // Initialize mobile interaction service
    this.mobileInteractionService = new MobileInteractionService(this.engine);
    this.mobileInteractionService.initialize(this.canvas, this.config.interaction);

    // Enable responsive if configured
    if (this.config.enableResponsive) {
      this.enableResponsive();
    }

    this._enabled = true;

    // Call callback
    if (this.config.onMobileEnabled) {
      this.config.onMobileEnabled();
    }

    console.log('📱 Mobile mode enabled');
  }

  /**
   * Disable mobile mode
   */
  disable() {
    if (!this._enabled) {
      return;
    }

    // Destroy mobile interaction service
    if (this.mobileInteractionService) {
      this.mobileInteractionService.destroy();
      this.mobileInteractionService = null;
    }

    // Disable responsive
    if (this._responsiveEnabled) {
      this.disableResponsive();
    }

    this._enabled = false;

    // Call callback
    if (this.config.onMobileDisabled) {
      this.config.onMobileDisabled();
    }

    console.log('📱 Mobile mode disabled');
  }

  /**
   * Toggle mobile mode on/off
   */
  toggle() {
    if (this._enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Enable responsive canvas resizing
   */
  enableResponsive() {
    if (this._responsiveEnabled || !this.canvas) {
      return;
    }

    // Listen to window resize
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);

    // Use ResizeObserver for container resize
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.triggerResize();
      });
      this.resizeObserver.observe(this.canvas);
    }

    this._responsiveEnabled = true;
    console.log('📱 Responsive mode enabled');
  }

  /**
   * Disable responsive canvas resizing
   */
  disableResponsive() {
    if (!this._responsiveEnabled) {
      return;
    }

    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);

    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clear debounce timer
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }

    this._responsiveEnabled = false;
    console.log('📱 Responsive mode disabled');
  }

  /**
   * Toggle responsive mode on/off
   */
  toggleResponsive() {
    if (this._responsiveEnabled) {
      this.disableResponsive();
    } else {
      this.enableResponsive();
    }
  }

  /**
   * Manually trigger a resize/fit operation
   */
  triggerResize() {
    if (!this.canvas) {
      return;
    }

    // Debounce resize
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }

    this.resizeDebounceTimer = window.setTimeout(() => {
      this.performResize();
    }, 150);
  }

  /**
   * Manually trigger zoom to fit
   */
  triggerZoomToFit(options?: { maxScale?: number; padding?: number }) {
    if (this.engine.zoomToFit) {
      this.engine.zoomToFit(options);
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo() {
    return {
      isMobile: MobilePerformanceService.isMobileDevice(),
      isLowPower: MobilePerformanceService.isLowPowerDevice(),
      renderQuality: this.performanceService.getRenderQuality(),
      supportsTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    };
  }

  /**
   * Check if mobile mode is enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Check if responsive mode is enabled
   */
  isResponsiveEnabled(): boolean {
    return this._responsiveEnabled;
  }

  /**
   * Update mobile interaction configuration
   */
  updateConfig(config: Partial<MobileConfig>) {
    if (this.mobileInteractionService) {
      this.mobileInteractionService.updateConfig(config);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): MobileConfig | null {
    if (this.mobileInteractionService) {
      return this.mobileInteractionService.getConfig();
    }
    return null;
  }

  /**
   * Get performance service
   */
  getPerformanceService(): MobilePerformanceService {
    return this.performanceService;
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.disable();

    // Additional cleanup if needed
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
  }

  /**
   * Handle window resize (bound method)
   */
  private handleResize = () => {
    this.triggerResize();
  };

  /**
   * Handle orientation change (bound method)
   */
  private handleOrientationChange = () => {
    // Delay slightly for orientation change to complete
    setTimeout(() => {
      this.triggerResize();
    }, 200);
  };

  /**
   * Perform the actual resize operation
   */
  private performResize() {
    if (!this.canvas) {
      return;
    }

    const container = this.canvas.parentElement;
    if (!container) {
      return;
    }

    // Get current center point (before resize) to maintain it
    const oldCenter = this.getCanvasCenter();

    // Resize canvas to match container
    const rect = container.getBoundingClientRect();
    this.canvas.setAttribute('width', String(rect.width));
    this.canvas.setAttribute('height', String(rect.height));

    // For SVG, also set viewBox
    if (this.canvas.tagName.toLowerCase() === 'svg') {
      this.canvas.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    }

    // Restore center point
    if (oldCenter) {
      this.setCanvasCenter(oldCenter);
    }

    // Trigger repaint
    if (this.engine.repaint) {
      this.engine.repaint();
    }

    console.log('📱 Canvas resized:', rect.width, 'x', rect.height);
  }

  /**
   * Get current canvas center in diagram coordinates
   */
  private getCanvasCenter(): { x: number; y: number } | null {
    if (!this.canvas) {
      return null;
    }

    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.engine.getZoom();
    const pan = this.engine.getPan();

    const centerX = (rect.width / 2 - pan.x) / zoom;
    const centerY = (rect.height / 2 - pan.y) / zoom;

    return { x: centerX, y: centerY };
  }

  /**
   * Set canvas center to specific diagram coordinates
   */
  private setCanvasCenter(center: { x: number; y: number }) {
    if (!this.canvas) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.engine.getZoom();

    const panX = rect.width / 2 - center.x * zoom;
    const panY = rect.height / 2 - center.y * zoom;

    this.engine.setPan(panX, panY);
  }
}
