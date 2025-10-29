import { MobilePerformanceService } from './mobile-performance.service';

describe('MobilePerformanceService', () => {
  let service: MobilePerformanceService;

  beforeEach(() => {
    service = new MobilePerformanceService();
  });

  describe('Device detection', () => {
    it('should detect mobile devices', () => {
      // Mock mobile user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true,
      });

      expect(MobilePerformanceService.isMobileDevice()).toBe(true);
    });

    it('should detect desktop devices', () => {
      // Mock desktop user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true,
      });

      expect(MobilePerformanceService.isMobileDevice()).toBe(false);
    });

    it('should detect low-power devices', () => {
      // Mock low-power device
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 2,
        configurable: true,
      });

      expect(MobilePerformanceService.isLowPowerDevice()).toBe(true);
    });

    it('should detect high-power devices', () => {
      // Mock high-power device
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 8,
        configurable: true,
      });

      expect(MobilePerformanceService.isLowPowerDevice()).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      service.initialize();

      const config = service.getConfig();
      expect(config.enableThrottling).toBeDefined();
      expect(config.touchMoveThrottle).toBe(16);
    });

    it('should initialize with custom config', () => {
      service.initialize({
        enableThrottling: false,
        touchMoveThrottle: 32,
      });

      const config = service.getConfig();
      expect(config.enableThrottling).toBe(false);
      expect(config.touchMoveThrottle).toBe(32);
    });

    it('should update config', () => {
      service.initialize();
      service.updateConfig({
        lowPowerMode: true,
      });

      const config = service.getConfig();
      expect(config.lowPowerMode).toBe(true);
    });
  });

  describe('Throttle function', () => {
    it('should throttle function calls', (done) => {
      service.initialize();
      let callCount = 0;
      const fn = jest.fn(() => callCount++);

      const throttled = service.throttle('test', fn, 100);

      // Call multiple times rapidly
      throttled();
      throttled();
      throttled();

      // Should only call once immediately
      expect(callCount).toBe(1);

      // Wait for throttle period
      setTimeout(() => {
        throttled();
        expect(callCount).toBe(2);
        done();
      }, 150);
    });
  });

  describe('Render quality', () => {
    it('should return high quality for normal devices', () => {
      service.initialize({
        lowPowerMode: false,
        reducedRendering: false,
      });

      expect(service.getRenderQuality()).toBe('high');
    });

    it('should return medium quality for reduced rendering', () => {
      service.initialize({
        lowPowerMode: false,
        reducedRendering: true,
      });

      expect(service.getRenderQuality()).toBe('medium');
    });

    it('should return low quality for low-power mode', () => {
      service.initialize({
        lowPowerMode: true,
      });

      expect(service.getRenderQuality()).toBe('low');
    });
  });

  describe('Render skipping', () => {
    it('should not skip render when below threshold', () => {
      service.initialize({
        reducedRendering: true,
        maxVisibleNodes: 500,
      });

      expect(service.shouldSkipRender(300)).toBe(false);
    });

    it('should skip render when above threshold', () => {
      service.initialize({
        reducedRendering: true,
        maxVisibleNodes: 500,
      });

      expect(service.shouldSkipRender(600)).toBe(true);
    });

    it('should not skip render when reduced rendering is disabled', () => {
      service.initialize({
        reducedRendering: false,
        maxVisibleNodes: 500,
      });

      expect(service.shouldSkipRender(1000)).toBe(false);
    });
  });
});
