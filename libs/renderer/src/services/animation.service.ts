/**
 * Animation Service
 *
 * Phase 1: Manages diagram element animations
 * - Configuration management
 * - Reduced motion detection
 * - Animation class generation
 * - Global animation control
 *
 * @example
 * ```typescript
 * const animationService = new AnimationService();
 *
 * // Get animation classes for a link
 * const linkClasses = animationService.getEdgeAnimationClass(link);
 *
 * // Get animation classes for a node
 * const nodeClasses = animationService.getNodeAnimationClass(node);
 *
 * // Disable all animations
 * animationService.setEnabled(false);
 *
 * // Configure animation speed
 * animationService.updateConfig({ animationSpeed: 0.5 });
 * ```
 */

import type { LinkModel, NodeModel } from '@grafloria/engine';

export interface AnimationConfig {
  /** Enable/disable all animations globally */
  enabled: boolean;

  /** Respect user's prefers-reduced-motion system setting */
  reducedMotion: boolean;

  /** Default animation type for edges */
  defaultEdgeAnimation: 'marching-ants' | 'flow' | 'pulse' | 'none';

  /** Default border animation type for nodes */
  defaultNodeBorderAnimation: 'gradient' | 'pulse' | 'breathe' | 'shimmer' | 'none';

  /** Global speed multiplier (0.5 = half speed, 2 = double speed) */
  animationSpeed: number;

  /** Auto-detect and respect system motion preferences */
  autoDetectMotionPreference: boolean;

  /** Performance mode (simplifies animations) */
  performanceMode: boolean;

  /** Battery saving mode (disables expensive animations) */
  batterySavingMode: boolean;

  /** Lazy load CSS (only inject when first animation is used) */
  lazyLoadCSS: boolean;
}

/**
 * AnimationService - Manages all diagram animations
 *
 * Features:
 * - Detects and respects prefers-reduced-motion
 * - Provides global animation enable/disable
 * - Generates animation CSS classes for nodes and links
 * - Supports animation speed control
 * - Performance and battery saving modes
 */
export class AnimationService {
  private config: AnimationConfig = {
    enabled: true,
    reducedMotion: false,
    defaultEdgeAnimation: 'marching-ants',
    defaultNodeBorderAnimation: 'gradient',
    animationSpeed: 1.0,
    autoDetectMotionPreference: true,
    performanceMode: false,
    batterySavingMode: false,
    lazyLoadCSS: false
  };

  private motionMediaQuery: MediaQueryList | null = null;
  private batteryManager: any = null;  // Battery API (experimental)
  private listeners: Set<(config: AnimationConfig) => void> = new Set();

  // Phase 1.1: Lazy CSS loading
  private cssInjected: boolean = false;
  private styleElement: HTMLStyleElement | null = null;

  constructor(config?: Partial<AnimationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (this.config.autoDetectMotionPreference) {
      this.detectReducedMotionPreference();
    }

    // Optional: Detect battery status (experimental API)
    this.detectBatteryStatus();

    // Load persisted configuration
    this.loadConfig();

    // Apply initial configuration to DOM
    this.updateAllAnimations();
  }

  /**
   * Detect user's motion preference using matchMedia
   */
  private detectReducedMotionPreference(): void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    try {
      this.motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.config.reducedMotion = this.motionMediaQuery.matches;

      // Listen for changes
      const handler = (e: MediaQueryListEvent) => {
        this.config.reducedMotion = e.matches;
        this.updateAllAnimations();
        this.notifyListeners();
      };

      // Modern browsers
      if (this.motionMediaQuery.addEventListener) {
        this.motionMediaQuery.addEventListener('change', handler);
      }
      // Legacy browsers
      else if ((this.motionMediaQuery as any).addListener) {
        (this.motionMediaQuery as any).addListener(handler);
      }
    } catch (error) {
      console.warn('Failed to detect reduced motion preference:', error);
    }
  }

  /**
   * Detect battery status and enable battery saving mode when low
   * (Experimental Battery Status API - may not be available in all browsers)
   */
  private async detectBatteryStatus(): Promise<void> {
    if (typeof navigator === 'undefined' || !(navigator as any).getBattery) {
      return;
    }

    try {
      this.batteryManager = await (navigator as any).getBattery();

      const updateBatteryMode = () => {
        const battery = this.batteryManager;
        // Enable battery saving when < 20% and not charging
        const shouldEnableBatterySaving = battery.level < 0.2 && !battery.charging;

        if (shouldEnableBatterySaving !== this.config.batterySavingMode) {
          this.config.batterySavingMode = shouldEnableBatterySaving;
          this.updateAllAnimations();
          this.notifyListeners();
        }
      };

      this.batteryManager.addEventListener('levelchange', updateBatteryMode);
      this.batteryManager.addEventListener('chargingchange', updateBatteryMode);

      // Initial check
      updateBatteryMode();
    } catch (error) {
      // Battery API not supported or permission denied
      console.debug('Battery API not available:', error);
    }
  }

  /**
   * Enable or disable all animations globally
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.updateAllAnimations();
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<AnimationConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration (partial update)
   */
  updateConfig(config: Partial<AnimationConfig>): void {
    this.config = { ...this.config, ...config };
    this.updateAllAnimations();
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Check if animations should be disabled
   * (due to reduced motion, disabled state, or battery saving)
   */
  private shouldDisableAnimations(): boolean {
    return !this.config.enabled ||
           this.config.reducedMotion ||
           this.config.batterySavingMode;
  }

  /**
   * Get animation CSS classes for an edge (link)
   *
   * @param link - LinkModel to generate classes for
   * @returns Space-separated CSS class string
   */
  getEdgeAnimationClass(link: LinkModel): string {
    if (this.shouldDisableAnimations()) {
      return '';
    }

    // Phase 1.1: Lazy load CSS on first animation request
    if (this.config.lazyLoadCSS && !this.cssInjected) {
      this.injectCSS();
    }

    const animation = link.style?.animation;
    if (!animation || animation.type === 'none') {
      return '';
    }

    const classes: string[] = [];

    // Animation type
    const type = animation.type || this.config.defaultEdgeAnimation;
    classes.push(`link-animated-${type}`);

    // Animation speed
    const speed = animation.speed || 'normal';
    if (speed !== 'normal') {
      classes.push(`link-speed-${speed}`);
    }

    // Animation direction
    if (animation.direction === 'reverse') {
      classes.push('link-direction-reverse');
    }

    // Performance mode: use slower animations
    if (this.config.performanceMode) {
      classes.push('animation-speed-0-5x');
    }

    return classes.join(' ');
  }

  /**
   * Get animation CSS classes for a node
   *
   * @param node - NodeModel to generate classes for
   * @param useSVGVariant - Whether to use SVG-compatible animations (for pure SVG nodes without foreignObject)
   * @returns Space-separated CSS class string
   */
  getNodeAnimationClass(node: NodeModel, useSVGVariant: boolean = false): string {
    if (this.shouldDisableAnimations()) {
      return '';
    }

    // Phase 1.1: Lazy load CSS on first animation request
    if (this.config.lazyLoadCSS && !this.cssInjected) {
      this.injectCSS();
    }

    const classes: string[] = [];
    const svgSuffix = useSVGVariant ? '-svg' : '';

    // Border animation
    if (node.style?.animatedBorder) {
      let type = node.style.borderAnimationType || this.config.defaultNodeBorderAnimation;

      if (type !== 'none') {
        // Shimmer requires ::after pseudo-element, not available on pure SVG
        // Fall back to breathe animation for SVG nodes
        if (useSVGVariant && type === 'shimmer') {
          type = 'breathe';
        }

        // Skip expensive animations in performance mode
        if (this.config.performanceMode && (type === 'gradient' || type === 'shimmer')) {
          // Use simpler animation instead
          classes.push(`node-border-breathe${svgSuffix}`);
        } else {
          classes.push(`node-border-${type}${svgSuffix}`);
        }
      }
    }

    // Status animation
    if (node.state?.animateStatus && node.state?.status) {
      const status = node.state.status;

      if (status !== 'idle') {
        classes.push(`node-status-${status}${svgSuffix}`);
      }
    }

    return classes.join(' ');
  }

  /**
   * Calculate animation duration with speed multiplier applied
   *
   * @param baseDuration - Base duration in seconds
   * @returns Adjusted duration in seconds
   */
  getAnimationDuration(baseDuration: number): number {
    return baseDuration / this.config.animationSpeed;
  }

  /**
   * Update all animations in the DOM
   * Applies global CSS classes to body element
   */
  private updateAllAnimations(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const body = document.body;

    // Animations disabled
    body.classList.toggle('animations-disabled', !this.config.enabled);

    // Reduced motion
    body.classList.toggle('reduced-motion', this.config.reducedMotion);

    // Performance mode
    body.classList.toggle('performance-mode', this.config.performanceMode);

    // Battery saving mode
    body.classList.toggle('battery-saving', this.config.batterySavingMode);

    // Speed modifier (using CSS custom property)
    if (this.config.animationSpeed !== 1.0) {
      body.style.setProperty('--animation-speed-multiplier', this.config.animationSpeed.toString());
    } else {
      body.style.removeProperty('--animation-speed-multiplier');
    }
  }

  /**
   * Pause all animations (for debugging or screenshots)
   */
  pauseAllAnimations(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.classList.add('animations-paused');
  }

  /**
   * Resume all animations
   */
  resumeAllAnimations(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.classList.remove('animations-paused');
  }

  /**
   * Add listener for configuration changes
   *
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  onConfigChange(listener: (config: AnimationConfig) => void): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyListeners(): void {
    const config = { ...this.config };
    this.listeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('Error in animation config listener:', error);
      }
    });
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfig(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const configToSave = {
        enabled: this.config.enabled,
        animationSpeed: this.config.animationSpeed,
        defaultEdgeAnimation: this.config.defaultEdgeAnimation,
        defaultNodeBorderAnimation: this.config.defaultNodeBorderAnimation,
        performanceMode: this.config.performanceMode,
        autoDetectMotionPreference: this.config.autoDetectMotionPreference
      };

      localStorage.setItem('grafloria-animation-config', JSON.stringify(configToSave));
    } catch (error) {
      console.warn('Failed to save animation config:', error);
    }
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfig(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const saved = localStorage.getItem('grafloria-animation-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config = { ...this.config, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load animation config:', error);
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = {
      enabled: true,
      reducedMotion: this.motionMediaQuery?.matches || false,
      defaultEdgeAnimation: 'marching-ants',
      defaultNodeBorderAnimation: 'gradient',
      animationSpeed: 1.0,
      autoDetectMotionPreference: true,
      performanceMode: false,
      batterySavingMode: false,
      lazyLoadCSS: false
    };

    this.updateAllAnimations();
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Phase 1.1: Inject animation CSS into the document
   * This is called automatically when lazyLoadCSS is enabled and first animation is used
   */
  injectCSS(): void {
    if (typeof document === 'undefined' || this.cssInjected) {
      return;
    }

    try {
      // Create style element
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'grafloria-animations';
      this.styleElement.textContent = this.getAnimationCSS();

      // Inject into head
      document.head.appendChild(this.styleElement);
      this.cssInjected = true;

      console.debug('Animation CSS injected');
    } catch (error) {
      console.error('Failed to inject animation CSS:', error);
    }
  }

  /**
   * Phase 1.1: Remove injected animation CSS from the document
   */
  removeCSS(): void {
    if (typeof document === 'undefined' || !this.cssInjected) {
      return;
    }

    try {
      if (this.styleElement && this.styleElement.parentNode) {
        this.styleElement.parentNode.removeChild(this.styleElement);
      }

      this.styleElement = null;
      this.cssInjected = false;

      console.debug('Animation CSS removed');
    } catch (error) {
      console.error('Failed to remove animation CSS:', error);
    }
  }

  /**
   * Phase 1.1: Check if CSS has been injected
   */
  isCSSInjected(): boolean {
    return this.cssInjected;
  }

  /**
   * Phase 1.1: Get animation CSS content
   * This returns the complete CSS for all animations
   */
  private getAnimationCSS(): string {
    // Import CSS content from animations.css
    // Note: In a real implementation, this would import the actual CSS file content
    // For now, we'll return a minimal version. The full implementation would use
    // a bundler to inline the CSS or fetch it dynamically.
    return `
/* Phase 1: Diagram Animations - Injected by AnimationService */

/* ============================================================================
   EDGE ANIMATIONS
   ============================================================================ */

/* Marching Ants Animation */
@keyframes marching-ants {
  to { stroke-dashoffset: -20; }
}

.link-animated-marching-ants {
  stroke-dasharray: 5, 5;
  animation: marching-ants 1s linear infinite;
  will-change: stroke-dashoffset;
}

/* Flow Animation */
@keyframes flow {
  to { stroke-dashoffset: -30; }
}

.link-animated-flow {
  stroke-dasharray: 10, 5;
  animation: flow 2s linear infinite;
  will-change: stroke-dashoffset;
}

/* Pulse Animation */
@keyframes pulse-edge {
  0%, 100% { opacity: 1; stroke-width: 2; }
  50% { opacity: 0.6; stroke-width: 3; }
}

.link-animated-pulse {
  animation: pulse-edge 2s ease-in-out infinite;
  will-change: opacity, stroke-width;
}

/* Dash Flow Animation */
@keyframes dash-flow {
  to { stroke-dashoffset: -40; }
}

.link-animated-dash-flow {
  stroke-dasharray: 8, 12;
  animation: dash-flow 1.5s linear infinite;
  will-change: stroke-dashoffset;
}

/* Speed Variants */
.link-speed-slow { animation-duration: 3s !important; }
.link-speed-fast { animation-duration: 0.5s !important; }

/* Direction Variants */
.link-direction-reverse { animation-direction: reverse; }

/* ============================================================================
   NODE BORDER ANIMATIONS
   ============================================================================ */

/* Gradient Border Animation */
@keyframes gradient-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.node-border-gradient::before {
  content: '';
  position: absolute;
  top: -2px; right: -2px; bottom: -2px; left: -2px;
  background: linear-gradient(90deg, #667eea, #764ba2, #667eea);
  background-size: 200% 100%;
  border-radius: inherit;
  z-index: -1;
  animation: gradient-rotate 3s linear infinite;
  will-change: transform;
}

/* Pulse Border Animation */
@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
}

.node-border-pulse {
  animation: pulse-border 2s ease-out infinite;
  will-change: box-shadow;
}

/* Breathe Border Animation */
@keyframes breathe {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

.node-border-breathe {
  animation: breathe 3s ease-in-out infinite;
  will-change: transform, opacity;
}

/* Shimmer Border Animation */
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.node-border-shimmer::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  background-size: 200% 100%;
  border-radius: inherit;
  animation: shimmer 2s linear infinite;
  will-change: background-position;
}

/* SVG Variants */
.node-border-pulse-svg {
  animation: pulse-border 2s ease-out infinite;
  transform-origin: center center;
  transform-box: fill-box;
  will-change: transform;
}

.node-border-breathe-svg {
  animation: breathe 3s ease-in-out infinite;
  transform-origin: center center;
  transform-box: fill-box;
  will-change: transform, opacity;
}

.node-border-gradient-svg {
  animation: gradient-rotate 3s linear infinite;
  transform-origin: center center;
  transform-box: fill-box;
  will-change: transform;
}

/* ============================================================================
   STATUS ANIMATIONS
   ============================================================================ */

/* Running Status */
@keyframes running {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

.node-status-running {
  animation: running 1.5s ease-in-out infinite;
  will-change: opacity, transform;
}

/* Error Status */
@keyframes error-shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

.node-status-error {
  animation: error-shake 0.5s ease-in-out;
  will-change: transform;
}

/* Completed Status */
@keyframes completed-fade {
  0% { opacity: 0.5; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}

.node-status-completed {
  animation: completed-fade 0.3s ease-out;
  will-change: opacity, transform;
}

/* Warning Status */
@keyframes warning-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.node-status-warning {
  animation: warning-blink 1.5s ease-in-out infinite;
  will-change: opacity;
}

/* Pending Status */
@keyframes pending-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.node-status-pending {
  animation: pending-pulse 2s ease-in-out infinite;
  will-change: opacity;
}

/* ============================================================================
   GLOBAL CONTROLS
   ============================================================================ */

/* Paused animations */
.animations-paused * {
  animation-play-state: paused !important;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .link-animated-marching-ants,
  .link-animated-flow,
  .link-animated-pulse,
  .link-animated-dash-flow,
  .node-border-gradient,
  .node-border-pulse,
  .node-border-breathe,
  .node-border-shimmer,
  .node-status-running,
  .node-status-error,
  .node-status-warning,
  .node-status-pending {
    animation: none !important;
  }
}

/* Animations disabled */
.animations-disabled * {
  animation: none !important;
}

/* Performance mode */
.performance-mode .link-animated-marching-ants,
.performance-mode .link-animated-flow {
  animation-duration: 2s !important;
}

/* Battery saving mode */
.battery-saving * {
  animation: none !important;
}
`;
  }

  /**
   * Cleanup: Remove event listeners and injected CSS
   */
  destroy(): void {
    // Phase 1.1: Remove injected CSS
    this.removeCSS();

    // Remove motion preference listener
    if (this.motionMediaQuery) {
      // Modern browsers
      if (this.motionMediaQuery.removeEventListener) {
        this.motionMediaQuery.removeEventListener('change', () => {});
      }
      // Legacy browsers
      else if ((this.motionMediaQuery as any).removeListener) {
        (this.motionMediaQuery as any).removeListener(() => {});
      }
    }

    // Remove battery listeners
    if (this.batteryManager) {
      this.batteryManager.removeEventListener('levelchange', () => {});
      this.batteryManager.removeEventListener('chargingchange', () => {});
    }

    // Clear all listeners
    this.listeners.clear();
  }
}
