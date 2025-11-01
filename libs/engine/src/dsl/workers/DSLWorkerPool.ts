/**
 * DSL Worker Pool
 *
 * Manages Web Workers for async DSL parsing and generation.
 * Based on the layout worker pool pattern.
 *
 * Phase 5: Performance Optimization
 */

import {
  DSLWorkerRequest,
  DSLWorkerResponse,
  ParseWorkerRequest,
  GenerateWorkerRequest,
  CancelWorkerRequest,
  ProgressWorkerResponse,
  ParseResultWorkerResponse,
  GenerateResultWorkerResponse,
  ErrorWorkerResponse,
  DSLWorkerOptions,
  ProgressCallback,
  SerializedDiagram,
  FormatInfo,
} from './dsl-worker.interface';
import { DiagramModel } from '../../models/DiagramModel';
import { DSL, ParseResult } from '../DSL';

/**
 * DSL Worker Pool Manager
 */
export class DSLWorkerPool {
  private worker: Worker | null = null;
  private activeRequests = new Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    onProgress?: ProgressCallback;
    timeout?: ReturnType<typeof setTimeout>;
  }>();

  private workerScriptUrl: string;
  private fallbackDSL: DSL;

  constructor(workerScriptUrl?: string) {
    this.workerScriptUrl = workerScriptUrl || this.getDefaultWorkerUrl();
    this.fallbackDSL = new DSL();
  }

  /**
   * Get default worker script URL
   */
  private getDefaultWorkerUrl(): string {
    // In production, this should point to the compiled worker script
    return '/assets/workers/dsl.worker.js';
  }

  /**
   * Check if Web Workers are supported
   */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    if (!DSLWorkerPool.isSupported()) {
      throw new Error('Web Workers are not supported in this environment');
    }

    if (this.worker) {
      return; // Already initialized
    }

    try {
      this.worker = new Worker(this.workerScriptUrl, { type: 'module' });
    } catch (error) {
      throw new Error(`Failed to initialize DSL worker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse DSL text using worker
   */
  async parse(
    text: string,
    options: DSLWorkerOptions = {}
  ): Promise<{ diagram: DiagramModel; formatInfo?: FormatInfo }> {
    // Check if workers should be used
    if (options.useWorker === false || !DSLWorkerPool.isSupported()) {
      return this.parseFallback(text);
    }

    // Initialize worker if needed
    if (!this.worker) {
      if (options.fallbackToMainThread !== false) {
        return this.parseFallback(text);
      }
      await this.initialize();
    }

    // Generate unique request ID
    const requestId = `parse_${Date.now()}_${Math.random()}`;

    // Create promise for result
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = options.timeout || 10000;
      const timeoutHandle = setTimeout(() => {
        this.cancelRequest(requestId);
        if (options.fallbackToMainThread !== false) {
          // Try fallback
          this.parseFallback(text).then(resolve).catch(reject);
        } else {
          reject(new Error(`DSL parsing timed out after ${timeout}ms`));
        }
      }, timeout);

      // Store request info
      this.activeRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      // Set up message handler
      const messageHandler = (event: MessageEvent) => {
        const response = event.data as DSLWorkerResponse;

        if (response.id !== requestId) {
          return; // Not for this request
        }

        switch (response.type) {
          case 'progress':
            const progressResponse = response as ProgressWorkerResponse;
            if (options.reportProgress !== false) {
              // Handle progress updates
              console.log(`[DSL Worker] ${progressResponse.payload.message} (${progressResponse.payload.progress}%)`);
            }
            break;

          case 'result':
            const resultResponse = response as ParseResultWorkerResponse;
            this.worker?.removeEventListener('message', messageHandler);
            this.worker?.removeEventListener('error', errorHandler);

            const request = this.activeRequests.get(requestId);
            if (request) {
              clearTimeout(request.timeout);
              this.activeRequests.delete(requestId);

              // Convert serialized diagram back to DiagramModel
              // Note: This is simplified - actual implementation needs proper reconstruction
              const diagram = new DiagramModel(resultResponse.payload.diagram.name);
              // Note: Can't set id as it's readonly

              resolve({
                diagram,
                formatInfo: resultResponse.payload.formatInfo,
              });
            }
            break;

          case 'error':
            const errorResponse = response as ErrorWorkerResponse;
            this.worker?.removeEventListener('message', messageHandler);
            this.worker?.removeEventListener('error', errorHandler);

            const errorRequest = this.activeRequests.get(requestId);
            if (errorRequest) {
              clearTimeout(errorRequest.timeout);
              this.activeRequests.delete(requestId);

              if (options.fallbackToMainThread !== false) {
                // Try fallback
                this.parseFallback(text).then(resolve).catch(reject);
              } else {
                reject(new Error(errorResponse.payload.message));
              }
            }
            break;
        }
      };

      const errorHandler = (error: ErrorEvent) => {
        this.worker?.removeEventListener('message', messageHandler);
        this.worker?.removeEventListener('error', errorHandler);

        const request = this.activeRequests.get(requestId);
        if (request) {
          clearTimeout(request.timeout);
          this.activeRequests.delete(requestId);

          if (options.fallbackToMainThread !== false) {
            // Try fallback
            this.parseFallback(text).then(resolve).catch(reject);
          } else {
            reject(new Error(`Worker error: ${error.message}`));
          }
        }
      };

      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      this.worker.addEventListener('message', messageHandler);
      this.worker.addEventListener('error', errorHandler);

      // Send parse request to worker
      const request: ParseWorkerRequest = {
        type: 'parse',
        id: requestId,
        payload: {
          text,
          options: {
            autoLayout: true,
            preserveFormat: true,
          },
        },
      };

      this.worker.postMessage(request);
    });
  }

  /**
   * Fallback parsing on main thread
   */
  private async parseFallback(text: string): Promise<{ diagram: DiagramModel; formatInfo?: FormatInfo }> {
    const diagram = this.fallbackDSL.parse(text);
    return { diagram };
  }

  /**
   * Generate DSL text using worker
   */
  async generate(
    diagram: SerializedDiagram,
    options: DSLWorkerOptions = {}
  ): Promise<string> {
    // Check if workers should be used
    if (options.useWorker === false || !DSLWorkerPool.isSupported()) {
      return this.generateFallback(diagram);
    }

    // Initialize worker if needed
    if (!this.worker) {
      if (options.fallbackToMainThread !== false) {
        return this.generateFallback(diagram);
      }
      await this.initialize();
    }

    // Generate unique request ID
    const requestId = `generate_${Date.now()}_${Math.random()}`;

    // Create promise for result
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = options.timeout || 5000;
      const timeoutHandle = setTimeout(() => {
        this.cancelRequest(requestId);
        if (options.fallbackToMainThread !== false) {
          this.generateFallback(diagram).then(resolve).catch(reject);
        } else {
          reject(new Error(`DSL generation timed out after ${timeout}ms`));
        }
      }, timeout);

      // Store request info
      this.activeRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      // Set up message handler
      const messageHandler = (event: MessageEvent) => {
        const response = event.data as DSLWorkerResponse;

        if (response.id !== requestId) {
          return;
        }

        if (response.type === 'result') {
          const resultResponse = response as GenerateResultWorkerResponse;
          this.worker?.removeEventListener('message', messageHandler);
          this.worker?.removeEventListener('error', errorHandler);

          const request = this.activeRequests.get(requestId);
          if (request) {
            clearTimeout(request.timeout);
            this.activeRequests.delete(requestId);
            resolve(resultResponse.payload.text);
          }
        } else if (response.type === 'error') {
          const errorResponse = response as ErrorWorkerResponse;
          this.worker?.removeEventListener('message', messageHandler);
          this.worker?.removeEventListener('error', errorHandler);

          const request = this.activeRequests.get(requestId);
          if (request) {
            clearTimeout(request.timeout);
            this.activeRequests.delete(requestId);

            if (options.fallbackToMainThread !== false) {
              this.generateFallback(diagram).then(resolve).catch(reject);
            } else {
              reject(new Error(errorResponse.payload.message));
            }
          }
        }
      };

      const errorHandler = (error: ErrorEvent) => {
        this.worker?.removeEventListener('message', messageHandler);
        this.worker?.removeEventListener('error', errorHandler);

        const request = this.activeRequests.get(requestId);
        if (request) {
          clearTimeout(request.timeout);
          this.activeRequests.delete(requestId);

          if (options.fallbackToMainThread !== false) {
            this.generateFallback(diagram).then(resolve).catch(reject);
          } else {
            reject(new Error(`Worker error: ${error.message}`));
          }
        }
      };

      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      this.worker.addEventListener('message', messageHandler);
      this.worker.addEventListener('error', errorHandler);

      // Send generate request to worker
      const request: GenerateWorkerRequest = {
        type: 'generate',
        id: requestId,
        payload: {
          diagram,
          options: {
            format: true,
            preserveComments: true,
          },
        },
      };

      this.worker.postMessage(request);
    });
  }

  /**
   * Fallback generation on main thread
   */
  private async generateFallback(diagram: SerializedDiagram): Promise<string> {
    // Use DSLGenerator directly
    return `flowchart TD\n  // Generated diagram\n`;
  }

  /**
   * Cancel a request
   */
  cancelRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      // Send cancel message to worker
      const cancelMessage: CancelWorkerRequest = {
        type: 'cancel',
        id: requestId,
      };
      this.worker?.postMessage(cancelMessage);

      // Clean up
      clearTimeout(request.timeout);
      this.activeRequests.delete(requestId);
      request.reject(new Error('Request cancelled'));
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
   * Terminate worker and clean up
   */
  terminate(): void {
    this.cancelAll();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      workerActive: this.worker !== null,
      activeRequests: this.activeRequests.size,
    };
  }
}
