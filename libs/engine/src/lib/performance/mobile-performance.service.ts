export interface MobilePerformanceConfig {
  enableThrottling: boolean;
  touchMoveThrottle: number; // ms
  reducedRendering: boolean;
  maxVisibleNodes: number;
  lowPowerMode: boolean;
}

export class MobilePerformanceService {
  private config: MobilePerformanceConfig = {
    enableThrottling: true,
    touchMoveThrottle: 16, // ~60 FPS
    reducedRendering: false,
    maxVisibleNodes: 500,
    lowPowerMode: false,
  };

  private throttleTimers: Map<string, number> = new Map();

  /**
   * Detect if running on mobile device
   */
  static isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  /**
   * Detect if low-power device
   */
  static isLowPowerDevice(): boolean {
    // Check hardware concurrency (CPU cores)
    const cores = navigator.hardwareConcurrency || 4;

    // Check device memory (if available)
    const memory = (navigator as any).deviceMemory || 4;

    return cores <= 2 || memory <= 2;
  }

  /**
   * Initialize with auto-detection
   */
  initialize(customConfig?: Partial<MobilePerformanceConfig>) {
    if (MobilePerformanceService.isMobileDevice()) {
      this.config.enableThrottling = true;

      if (MobilePerformanceService.isLowPowerDevice()) {
        this.config.lowPowerMode = true;
        this.config.reducedRendering = true;
        this.config.maxVisibleNodes = 200;
      }
    }

    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
  }

  /**
   * Throttle function execution
   */
  throttle<T extends (...args: any[]) => any>(
    key: string,
    fn: T,
    wait: number = this.config.touchMoveThrottle
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      const now = Date.now();
      const lastRun = this.throttleTimers.get(key) || 0;

      if (now - lastRun >= wait) {
        fn(...args);
        this.throttleTimers.set(key, now);
      }
    };
  }

  /**
   * Get recommended render quality based on device
   */
  getRenderQuality(): 'high' | 'medium' | 'low' {
    if (this.config.lowPowerMode) {
      return 'low';
    }

    if (this.config.reducedRendering) {
      return 'medium';
    }

    return 'high';
  }

  /**
   * Should skip rendering based on performance config
   */
  shouldSkipRender(nodeCount: number): boolean {
    if (!this.config.reducedRendering) {
      return false;
    }

    return nodeCount > this.config.maxVisibleNodes;
  }

  /**
   * Get configuration
   */
  getConfig(): MobilePerformanceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MobilePerformanceConfig>) {
    this.config = { ...this.config, ...config };
  }
}
