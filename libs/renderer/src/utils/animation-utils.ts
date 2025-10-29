/**
 * Animation Utilities
 *
 * Phase 1: Helper functions for working with animations
 * - Animation class building
 * - Dynamic style generation
 * - Animation timing calculations
 */

import { LinkAnimation } from '../../../engine/src/types/model.types';

/**
 * Generate dynamic CSS for gradient border animation
 *
 * @param colors - Array of gradient colors
 * @param duration - Animation duration in seconds
 * @returns CSS string for gradient animation
 */
export function generateGradientBorderCSS(colors: string[], duration: number = 3): string {
  if (colors.length < 2) {
    colors = ['#667eea', '#764ba2']; // Default colors
  }

  // Create gradient stops
  const stops = colors.map((color, index) => {
    const percentage = (index * 100) / (colors.length - 1);
    return `${color} ${percentage}%`;
  }).join(', ');

  // Duplicate colors to create seamless loop
  const seamlessStops = [
    ...colors.map((color, index) => `${color} ${(index * 25)}%`),
    colors[0] + ' 100%'
  ].join(', ');

  return `
    background: linear-gradient(90deg, ${seamlessStops});
    background-size: 200% 100%;
    animation-duration: ${duration}s;
  `;
}

/**
 * Calculate animation duration based on speed setting
 *
 * @param baseSpeed - Base animation speed ('slow' | 'normal' | 'fast')
 * @param baseDuration - Base duration in seconds (default: 1)
 * @returns Duration in seconds
 */
export function calculateAnimationDuration(
  baseSpeed: 'slow' | 'normal' | 'fast' | undefined,
  baseDuration: number = 1
): number {
  switch (baseSpeed) {
    case 'slow':
      return baseDuration * 2;
    case 'fast':
      return baseDuration * 0.5;
    case 'normal':
    default:
      return baseDuration;
  }
}

/**
 * Build animation class string from individual parts
 *
 * @param parts - Array of class name parts (filters out empty/undefined)
 * @returns Space-separated class string
 */
export function buildAnimationClass(...parts: (string | undefined | null | false)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Create link animation configuration
 *
 * @param type - Animation type
 * @param options - Additional options
 * @returns LinkAnimation object
 */
export function createLinkAnimation(
  type: 'marching-ants' | 'flow' | 'pulse' | 'none',
  options: {
    speed?: 'slow' | 'normal' | 'fast';
    direction?: 'forward' | 'reverse';
    duration?: number;
  } = {}
): LinkAnimation {
  return {
    type,
    speed: options.speed || 'normal',
    direction: options.direction || 'forward',
    duration: options.duration
  };
}

/**
 * Check if animation should be simplified for performance
 *
 * @param animationCount - Number of currently animating elements
 * @param performanceThreshold - Threshold for simplification (default: 50)
 * @returns Whether to simplify animations
 */
export function shouldSimplifyAnimations(
  animationCount: number,
  performanceThreshold: number = 50
): boolean {
  return animationCount > performanceThreshold;
}

/**
 * Get optimal animation settings based on browser performance
 *
 * @returns Recommended animation settings
 */
export function getOptimalAnimationSettings(): {
  maxAnimatedEdges: number;
  maxAnimatedNodes: number;
  preferredAnimationType: 'simple' | 'complex';
} {
  // Check if we're on a low-end device
  const isLowEnd = typeof navigator !== 'undefined' &&
    ((navigator as any).deviceMemory && (navigator as any).deviceMemory < 4) ||
    ((navigator as any).hardwareConcurrency && (navigator as any).hardwareConcurrency < 4);

  if (isLowEnd) {
    return {
      maxAnimatedEdges: 25,
      maxAnimatedNodes: 15,
      preferredAnimationType: 'simple'
    };
  }

  return {
    maxAnimatedEdges: 100,
    maxAnimatedNodes: 50,
    preferredAnimationType: 'complex'
  };
}

/**
 * Convert animation duration from milliseconds to seconds
 *
 * @param milliseconds - Duration in milliseconds
 * @returns Duration in seconds
 */
export function msToSeconds(milliseconds: number): number {
  return milliseconds / 1000;
}

/**
 * Convert animation duration from seconds to milliseconds
 *
 * @param seconds - Duration in seconds
 * @returns Duration in milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/**
 * Create CSS custom properties object for animation
 *
 * @param options - Animation options
 * @returns Object with CSS custom properties
 */
export function createAnimationCustomProperties(options: {
  duration?: number;
  strokeWidth?: number;
  color?: string;
  glowColor?: string;
}): Record<string, string> {
  const props: Record<string, string> = {};

  if (options.duration !== undefined) {
    props['--animation-duration'] = `${options.duration}s`;
  }

  if (options.strokeWidth !== undefined) {
    props['--link-stroke-width'] = `${options.strokeWidth}px`;
  }

  if (options.color) {
    props['--animation-color'] = options.color;
  }

  if (options.glowColor) {
    props['--glow-color'] = options.glowColor;
  }

  return props;
}

/**
 * Check if browser supports CSS animations
 *
 * @returns Whether CSS animations are supported
 */
export function supportsAnimations(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const element = document.createElement('div');
  return 'animation' in element.style ||
         'webkitAnimation' in element.style ||
         'mozAnimation' in element.style;
}

/**
 * Check if user prefers reduced motion
 *
 * @returns Whether user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Debounce function for performance optimization
 * Useful for animation updates during resize/scroll
 *
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for performance optimization
 * Useful for animation updates during continuous events
 *
 * @param func - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Request animation frame wrapper with fallback
 *
 * @param callback - Function to call on next frame
 * @returns Request ID
 */
export function requestAnimFrame(callback: () => void): number {
  if (typeof window === 'undefined') {
    return setTimeout(callback, 16) as any;
  }

  return (
    window.requestAnimationFrame ||
    (window as any).webkitRequestAnimationFrame ||
    (window as any).mozRequestAnimationFrame ||
    (window as any).oRequestAnimationFrame ||
    (window as any).msRequestAnimationFrame ||
    function(cb: () => void) { return setTimeout(cb, 16); }
  )(callback);
}

/**
 * Cancel animation frame wrapper with fallback
 *
 * @param id - Request ID to cancel
 */
export function cancelAnimFrame(id: number): void {
  if (typeof window === 'undefined') {
    clearTimeout(id);
    return;
  }

  (
    window.cancelAnimationFrame ||
    (window as any).webkitCancelAnimationFrame ||
    (window as any).mozCancelAnimationFrame ||
    (window as any).oCancelAnimationFrame ||
    (window as any).msCancelAnimationFrame ||
    clearTimeout
  )(id);
}

/**
 * Measure animation FPS (for debugging/performance monitoring)
 *
 * @param duration - Duration to measure in milliseconds
 * @returns Promise that resolves to average FPS
 */
export function measureAnimationFPS(duration: number = 1000): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    let lastTime = performance.now();
    const endTime = lastTime + duration;

    function countFrame() {
      frames++;
      const currentTime = performance.now();

      if (currentTime < endTime) {
        requestAnimFrame(countFrame);
      } else {
        const elapsed = currentTime - lastTime;
        const fps = (frames / elapsed) * 1000;
        resolve(Math.round(fps));
      }
    }

    requestAnimFrame(countFrame);
  });
}

/**
 * Validate animation type
 *
 * @param type - Animation type to validate
 * @returns Whether the type is valid
 */
export function isValidAnimationType(
  type: any
): type is 'marching-ants' | 'flow' | 'pulse' | 'none' {
  return ['marching-ants', 'flow', 'pulse', 'none'].includes(type);
}

/**
 * Validate border animation type
 *
 * @param type - Border animation type to validate
 * @returns Whether the type is valid
 */
export function isValidBorderAnimationType(
  type: any
): type is 'gradient' | 'pulse' | 'breathe' | 'shimmer' | 'none' {
  return ['gradient', 'pulse', 'breathe', 'shimmer', 'none'].includes(type);
}

/**
 * Validate status type
 *
 * @param status - Status to validate
 * @returns Whether the status is valid
 */
export function isValidStatus(
  status: any
): status is 'idle' | 'pending' | 'running' | 'completed' | 'error' | 'warning' {
  return ['idle', 'pending', 'running', 'completed', 'error', 'warning'].includes(status);
}
