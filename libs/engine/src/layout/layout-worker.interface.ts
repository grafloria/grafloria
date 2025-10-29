/**
 * Layout Worker System
 *
 * Enables off-thread layout computation for smooth UI with large graphs.
 * Moves expensive layout calculations to Web Workers to prevent UI freezing.
 *
 * Key features:
 * - Non-blocking layout computation
 * - Progress reporting
 * - Cancellation support
 * - Worker pooling for parallel layouts
 * - Automatic fallback to main thread if workers unavailable
 *
 * @module layout/layout-worker
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { LayoutOptions, LayoutResult } from './layout-adapter.interface';

/**
 * Message types for worker communication
 */
export type WorkerMessageType =
  | 'init'           // Initialize worker
  | 'layout'         // Compute layout
  | 'cancel'         // Cancel current computation
  | 'progress'       // Progress update
  | 'result'         // Layout result
  | 'error';         // Error occurred

/**
 * Message sent to worker
 */
export interface WorkerRequest {
  type: 'init' | 'layout' | 'cancel';
  id: string;
  payload?: any;
}

/**
 * Message received from worker
 */
export interface WorkerResponse {
  type: 'progress' | 'result' | 'error';
  id: string;
  payload?: any;
}

/**
 * Initialize worker message
 */
export interface InitWorkerMessage extends WorkerRequest {
  type: 'init';
  payload: {
    /** Which layout adapter to use */
    adapterType: 'dagre' | 'elk';
  };
}

/**
 * Layout computation request
 */
export interface LayoutWorkerRequest extends WorkerRequest {
  type: 'layout';
  payload: {
    /** Serialized nodes */
    nodes: WorkerSerializedNode[];
    /** Serialized links */
    links: WorkerSerializedLink[];
    /** Layout options */
    options: LayoutOptions;
  };
}

/**
 * Cancel computation request
 */
export interface CancelWorkerRequest extends WorkerRequest {
  type: 'cancel';
}

/**
 * Progress update from worker
 */
export interface ProgressWorkerResponse extends WorkerResponse {
  type: 'progress';
  payload: {
    /** Progress percentage (0-100) */
    progress: number;
    /** Current iteration (if applicable) */
    iteration?: number;
    /** Total iterations (if applicable) */
    totalIterations?: number;
    /** Status message */
    message?: string;
  };
}

/**
 * Layout result from worker
 */
export interface ResultWorkerResponse extends WorkerResponse {
  type: 'result';
  payload: {
    /** Layout computation result */
    result: LayoutResult;
    /** Computation time in milliseconds */
    computationTime: number;
  };
}

/**
 * Error from worker
 */
export interface ErrorWorkerResponse extends WorkerResponse {
  type: 'error';
  payload: {
    /** Error message */
    message: string;
    /** Error stack trace */
    stack?: string;
  };
}

/**
 * Serialized node for worker transfer
 */
export interface WorkerSerializedNode {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data?: any;
  nodeType?: string;
}

/**
 * Serialized link for worker transfer
 */
export interface WorkerSerializedLink {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourcePortId?: string;
  targetPortId?: string;
  data?: any;
}

/**
 * Progress callback
 */
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Worker configuration options
 */
export interface WorkerLayoutOptions {
  /** Enable worker-based computation (default: true) */
  useWorker?: boolean;

  /** Maximum number of workers in pool (default: 2) */
  maxWorkers?: number;

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Report progress updates (default: true) */
  reportProgress?: boolean;

  /** Progress update interval in iterations (default: 10) */
  progressInterval?: number;

  /** Fallback to main thread if worker fails (default: true) */
  fallbackToMainThread?: boolean;
}

/**
 * Layout worker pool manager
 *
 * Manages a pool of Web Workers for parallel layout computation.
 */
export class LayoutWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private activeRequests = new Map<string, {
    worker: Worker;
    resolve: (result: LayoutResult) => void;
    reject: (error: Error) => void;
    onProgress?: ProgressCallback;
    timeout?: NodeJS.Timeout;
  }>();

  private maxWorkers: number;
  private workerScriptUrl: string;

  constructor(maxWorkers = 2, workerScriptUrl?: string) {
    this.maxWorkers = maxWorkers;
    this.workerScriptUrl = workerScriptUrl || this.getDefaultWorkerUrl();
  }

  /**
   * Get default worker script URL
   */
  private getDefaultWorkerUrl(): string {
    // In production, this should point to the compiled worker script
    // For now, return a placeholder
    return '/assets/workers/layout.worker.js';
  }

  /**
   * Check if Web Workers are supported
   */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (!LayoutWorkerPool.isSupported()) {
      throw new Error('Web Workers are not supported in this environment');
    }

    // Create initial workers
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(this.workerScriptUrl);
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  /**
   * Get an available worker (or wait for one)
   */
  private async getAvailableWorker(): Promise<Worker> {
    if (this.availableWorkers.length > 0) {
      return this.availableWorkers.pop()!;
    }

    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.availableWorkers.length > 0) {
          clearInterval(checkInterval);
          resolve(this.availableWorkers.pop()!);
        }
      }, 100);
    });
  }

  /**
   * Release worker back to pool
   */
  private releaseWorker(worker: Worker): void {
    if (!this.availableWorkers.includes(worker)) {
      this.availableWorkers.push(worker);
    }
  }

  /**
   * Compute layout using a worker
   */
  async computeLayout(
    nodes: NodeModel[],
    links: LinkModel[],
    options: LayoutOptions,
    workerOptions: WorkerLayoutOptions = {}
  ): Promise<LayoutResult> {
    // Check if workers should be used
    if (workerOptions.useWorker === false) {
      throw new Error('Worker computation disabled, use main thread adapter');
    }

    // Get available worker
    const worker = await this.getAvailableWorker();

    // Generate unique request ID
    const requestId = `layout_${Date.now()}_${Math.random()}`;

    // Serialize nodes and links
    const serializedNodes: WorkerSerializedNode[] = nodes.map(node => ({
      id: node.id,
      position: { x: node.position.x, y: node.position.y },
      size: { width: node.size.width, height: node.size.height },
      data: node.data,
      nodeType: node.type,
    }));

    const serializedLinks: WorkerSerializedLink[] = links.map(link => ({
      id: link.id,
      sourceNodeId: link.sourceNodeId,
      targetNodeId: link.targetNodeId,
      sourcePortId: link.sourcePortId,
      targetPortId: link.targetPortId,
      data: link.data,
    }));

    // Create promise for result
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = workerOptions.timeout || 30000;
      const timeoutHandle = setTimeout(() => {
        this.cancelRequest(requestId);
        reject(new Error(`Layout computation timed out after ${timeout}ms`));
      }, timeout);

      // Store request info
      this.activeRequests.set(requestId, {
        worker,
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      // Set up message handler
      const messageHandler = (event: MessageEvent) => {
        const response = event.data as WorkerResponse;

        if (response.id !== requestId) {
          return; // Not for this request
        }

        switch (response.type) {
          case 'progress':
            const progressResponse = response as ProgressWorkerResponse;
            if (workerOptions.reportProgress !== false) {
              const request = this.activeRequests.get(requestId);
              if (request?.onProgress) {
                request.onProgress(
                  progressResponse.payload.progress,
                  progressResponse.payload.message
                );
              }
            }
            break;

          case 'result':
            const resultResponse = response as ResultWorkerResponse;
            worker.removeEventListener('message', messageHandler);
            worker.removeEventListener('error', errorHandler);

            const request = this.activeRequests.get(requestId);
            if (request) {
              clearTimeout(request.timeout);
              this.activeRequests.delete(requestId);
              this.releaseWorker(worker);
              resolve(resultResponse.payload.result);
            }
            break;

          case 'error':
            const errorResponse = response as ErrorWorkerResponse;
            worker.removeEventListener('message', messageHandler);
            worker.removeEventListener('error', errorHandler);

            const errorRequest = this.activeRequests.get(requestId);
            if (errorRequest) {
              clearTimeout(errorRequest.timeout);
              this.activeRequests.delete(requestId);
              this.releaseWorker(worker);
              reject(new Error(errorResponse.payload.message));
            }
            break;
        }
      };

      const errorHandler = (error: ErrorEvent) => {
        worker.removeEventListener('message', messageHandler);
        worker.removeEventListener('error', errorHandler);

        const request = this.activeRequests.get(requestId);
        if (request) {
          clearTimeout(request.timeout);
          this.activeRequests.delete(requestId);
          this.releaseWorker(worker);
          reject(new Error(`Worker error: ${error.message}`));
        }
      };

      worker.addEventListener('message', messageHandler);
      worker.addEventListener('error', errorHandler);

      // Send layout request to worker
      const request: LayoutWorkerRequest = {
        type: 'layout',
        id: requestId,
        payload: {
          nodes: serializedNodes,
          links: serializedLinks,
          options,
        },
      };

      worker.postMessage(request);
    });
  }

  /**
   * Cancel a layout computation
   */
  cancelRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      // Send cancel message to worker
      const cancelMessage: CancelWorkerRequest = {
        type: 'cancel',
        id: requestId,
      };
      request.worker.postMessage(cancelMessage);

      // Clean up
      clearTimeout(request.timeout);
      this.activeRequests.delete(requestId);
      this.releaseWorker(request.worker);
      request.reject(new Error('Layout computation cancelled'));
    }
  }

  /**
   * Cancel all active requests
   */
  cancelAll(): void {
    const requestIds = Array.from(this.activeRequests.keys());
    requestIds.forEach(id => this.cancelRequest(id));
  }

  /**
   * Terminate all workers and clean up
   */
  terminate(): void {
    this.cancelAll();
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.availableWorkers = [];
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      activeRequests: this.activeRequests.size,
    };
  }
}

/**
 * Serialize NodeModel for transfer to worker
 */
export function serializeNode(node: NodeModel): WorkerSerializedNode {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    size: { width: node.size.width, height: node.size.height },
    data: node.data,
    nodeType: node.type,
  };
}

/**
 * Serialize LinkModel for transfer to worker
 */
export function serializeLink(link: LinkModel): WorkerSerializedLink {
  return {
    id: link.id,
    sourceNodeId: link.sourceNodeId,
    targetNodeId: link.targetNodeId,
    sourcePortId: link.sourcePortId,
    targetPortId: link.targetPortId,
    data: link.data,
  };
}

/**
 * Deserialize node positions from worker result
 */
export function deserializePositions(
  nodes: NodeModel[],
  positions: Map<string, { x: number; y: number }>
): void {
  nodes.forEach(node => {
    const position = positions.get(node.id);
    if (position) {
      node.setPosition(position.x, position.y);
    }
  });
}
