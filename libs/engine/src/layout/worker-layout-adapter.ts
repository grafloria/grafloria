/**
 * Worker-Aware Layout Adapter
 *
 * Layout adapter that uses Web Workers for off-thread computation.
 * Provides same interface as regular adapters but runs computation in background.
 *
 * Features:
 * - Non-blocking layout computation
 * - Progress reporting
 * - Cancellation support
 * - Automatic fallback to main thread
 * - Worker pooling for parallel layouts
 *
 * @module layout/worker-layout-adapter
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import {
  LayoutAdapter,
  LayoutOptions,
  LayoutResult,
} from './layout-adapter.interface';
import {
  LayoutWorkerPool,
  WorkerLayoutOptions,
  ProgressCallback,
  serializeNode,
  serializeLink,
} from './layout-worker.interface';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';

/**
 * Worker-aware layout adapter options
 */
export interface WorkerLayoutAdapterOptions extends LayoutOptions {
  /** Worker-specific options */
  worker?: WorkerLayoutOptions;

  /** Progress callback */
  onProgress?: ProgressCallback;
}

/**
 * Worker-aware layout adapter
 *
 * Uses Web Workers for layout computation to keep UI responsive.
 * Automatically falls back to main thread if workers unavailable.
 */
export class WorkerLayoutAdapter implements LayoutAdapter {
  readonly name: string;

  private workerPool: LayoutWorkerPool | null = null;
  private fallbackAdapter: LayoutAdapter;
  private useWorkers: boolean;

  /**
   * Create worker-aware layout adapter
   *
   * @param baseAdapter - The adapter to use (dagre or elk)
   * @param workerScriptUrl - URL to worker script
   */
  constructor(
    baseAdapter: 'dagre' | 'elk' | LayoutAdapter,
    workerScriptUrl?: string
  ) {
    // Create fallback adapter for main thread computation
    if (typeof baseAdapter === 'string') {
      this.fallbackAdapter =
        baseAdapter === 'dagre'
          ? new DagreLayoutAdapter()
          : new ELKLayoutAdapter();
      this.name = `worker-${baseAdapter}`;
    } else {
      this.fallbackAdapter = baseAdapter;
      this.name = `worker-${baseAdapter.name}`;
    }

    // Check if workers are supported
    this.useWorkers = LayoutWorkerPool.isSupported();

    if (this.useWorkers) {
      try {
        // Initialize worker pool
        this.workerPool = new LayoutWorkerPool(2, workerScriptUrl);
      } catch (error) {
        console.warn('Failed to initialize worker pool, falling back to main thread:', error);
        this.useWorkers = false;
      }
    }
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.initialize();
    }
  }

  /**
   * Apply layout using workers (or fallback to main thread)
   *
   * @param nodes - Nodes to layout
   * @param links - Links connecting the nodes
   * @param options - Layout options
   * @returns Layout result with positions
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<WorkerLayoutAdapterOptions> = {}
  ): Promise<LayoutResult> {
    const workerOptions = options.worker || {};

    // Check if we should use workers
    const shouldUseWorkers =
      this.useWorkers &&
      this.workerPool &&
      workerOptions.useWorker !== false;

    if (!shouldUseWorkers) {
      // Fall back to main thread computation
      return this.fallbackAdapter.apply(nodes, links, options);
    }

    try {
      // Attempt worker computation
      const result = await this.workerPool!.computeLayout(
        nodes,
        links,
        options,
        workerOptions
      );

      // Apply positions to nodes
      result.nodePositions.forEach((position, nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          node.setPosition(position.x, position.y);
        }
      });

      return result;
    } catch (error) {
      // Worker failed, fall back to main thread
      if (workerOptions.fallbackToMainThread !== false) {
        console.warn('Worker computation failed, falling back to main thread:', error);
        return this.fallbackAdapter.apply(nodes, links, options);
      } else {
        throw error;
      }
    }
  }

  /**
   * Apply incremental layout (Phase 1 compatibility)
   */
  async applyIncremental(
    nodes: NodeModel[],
    links: LinkModel[],
    incrementalOptions: any,
    layoutOptions?: Partial<WorkerLayoutAdapterOptions>
  ): Promise<LayoutResult & { incremental: any }> {
    // Check if fallback adapter supports incremental
    if ('applyIncremental' in this.fallbackAdapter) {
      const fallback = this.fallbackAdapter as any;
      return fallback.applyIncremental(nodes, links, incrementalOptions, layoutOptions);
    }

    // Otherwise, just use regular apply
    const result = await this.apply(nodes, links, layoutOptions);
    return {
      ...result,
      incremental: {
        newNodeIds: [],
        pinnedNodeIds: [],
        movedNodeIds: [],
        strategy: 'none',
        constraintsApplied: 0,
      },
    };
  }

  /**
   * Validate options
   */
  validateOptions(options: Partial<LayoutOptions>): boolean {
    return this.fallbackAdapter.validateOptions(options);
  }

  /**
   * Cancel all active layout computations
   */
  cancelAll(): void {
    if (this.workerPool) {
      this.workerPool.cancelAll();
    }
  }

  /**
   * Terminate all workers and clean up
   */
  terminate(): void {
    if (this.workerPool) {
      this.workerPool.terminate();
      this.workerPool = null;
    }
  }

  /**
   * Get worker pool statistics
   */
  getWorkerStats() {
    if (this.workerPool) {
      return this.workerPool.getStats();
    }
    return {
      totalWorkers: 0,
      availableWorkers: 0,
      activeRequests: 0,
    };
  }

  /**
   * Check if workers are available
   */
  isUsingWorkers(): boolean {
    return this.useWorkers && this.workerPool !== null;
  }
}

/**
 * Create a worker-aware Dagre adapter
 */
export function createWorkerDagreAdapter(workerScriptUrl?: string): WorkerLayoutAdapter {
  return new WorkerLayoutAdapter('dagre', workerScriptUrl);
}

/**
 * Create a worker-aware ELK adapter
 */
export function createWorkerELKAdapter(workerScriptUrl?: string): WorkerLayoutAdapter {
  return new WorkerLayoutAdapter('elk', workerScriptUrl);
}
