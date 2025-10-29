/**
 * Layout Worker Script
 *
 * Runs in Web Worker context to compute layouts off the main thread.
 * This keeps the UI responsive during expensive layout computations.
 *
 * NOTE: This file needs to be compiled as a separate Web Worker bundle.
 * It should be included in the build output as a standalone script.
 *
 * @module layout/layout.worker
 */

/// <reference lib="webworker" />

import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import {
  WorkerRequest,
  LayoutWorkerRequest,
  CancelWorkerRequest,
  ProgressWorkerResponse,
  ResultWorkerResponse,
  ErrorWorkerResponse,
  WorkerSerializedNode,
  WorkerSerializedLink,
} from './layout-worker.interface';
import { LayoutOptions, LayoutResult } from './layout-adapter.interface';

// Worker context
const ctx: Worker = self as any;

// Current layout adapter
let currentAdapter: DagreLayoutAdapter | ELKLayoutAdapter | null = null;

// Cancellation flag
let isCancelled = false;

/**
 * Convert serialized node to NodeModel
 */
function deserializeNode(serialized: WorkerSerializedNode): NodeModel {
  const node = new NodeModel({
    id: serialized.id,
    type: serialized.nodeType || 'default',
    position: serialized.position,
    size: serialized.size,
  });

  if (serialized.data) {
    node.data = serialized.data;
  }

  return node;
}

/**
 * Convert serialized link to LinkModel
 */
function deserializeLink(serialized: WorkerSerializedLink): LinkModel {
  // Create link with required port IDs (use empty strings as placeholders if not provided)
  const link = new LinkModel(
    serialized.sourcePortId || '',
    serialized.targetPortId || ''
  );

  // Set the actual node IDs for layout computation
  if (serialized.sourceNodeId) {
    link.sourceNodeId = serialized.sourceNodeId;
  }
  if (serialized.targetNodeId) {
    link.targetNodeId = serialized.targetNodeId;
  }

  if (serialized.data) {
    link.data = serialized.data;
  }

  return link;
}

/**
 * Send progress update to main thread
 */
function sendProgress(
  requestId: string,
  progress: number,
  message?: string,
  iteration?: number,
  totalIterations?: number
): void {
  if (isCancelled) {
    return;
  }

  const response: ProgressWorkerResponse = {
    type: 'progress',
    id: requestId,
    payload: {
      progress,
      message,
      iteration,
      totalIterations,
    },
  };

  ctx.postMessage(response);
}

/**
 * Send result to main thread
 */
function sendResult(
  requestId: string,
  result: LayoutResult,
  computationTime: number
): void {
  const response: ResultWorkerResponse = {
    type: 'result',
    id: requestId,
    payload: {
      result,
      computationTime,
    },
  };

  ctx.postMessage(response);
}

/**
 * Send error to main thread
 */
function sendError(requestId: string, error: Error): void {
  const response: ErrorWorkerResponse = {
    type: 'error',
    id: requestId,
    payload: {
      message: error.message,
      stack: error.stack,
    },
  };

  ctx.postMessage(response);
}

/**
 * Handle layout computation request
 */
async function handleLayoutRequest(request: LayoutWorkerRequest): Promise<void> {
  const startTime = performance.now();
  isCancelled = false;

  try {
    // Deserialize nodes and links
    const nodes = request.payload.nodes.map(deserializeNode);
    const links = request.payload.links.map(deserializeLink);
    const options = request.payload.options;

    // Send initial progress
    sendProgress(request.id, 0, 'Starting layout computation...');

    // Determine which adapter to use
    if (!currentAdapter) {
      // Default to Dagre if not initialized
      currentAdapter = new DagreLayoutAdapter();
    }

    // Check for cancellation before starting
    if (isCancelled) {
      return;
    }

    // Send progress updates periodically
    // For now, we'll send updates at key points
    sendProgress(request.id, 10, 'Preparing graph structure...');

    if (isCancelled) {
      return;
    }

    sendProgress(request.id, 30, 'Computing node positions...');

    // Compute layout
    const result = await currentAdapter.apply(nodes, links, options);

    if (isCancelled) {
      return;
    }

    sendProgress(request.id, 90, 'Finalizing layout...');

    const computationTime = performance.now() - startTime;

    // Send result
    sendProgress(request.id, 100, 'Layout complete');
    sendResult(request.id, result, computationTime);

  } catch (error) {
    sendError(request.id, error as Error);
  }
}

/**
 * Handle cancel request
 */
function handleCancelRequest(request: CancelWorkerRequest): void {
  isCancelled = true;
  // Note: Actual cancellation depends on checking isCancelled flag in layout algorithms
  // For now, we set the flag and hope the algorithm checks it periodically
}

/**
 * Handle initialization request
 */
function handleInitRequest(request: WorkerRequest): void {
  if (request.payload?.adapterType === 'elk') {
    currentAdapter = new ELKLayoutAdapter();
  } else {
    currentAdapter = new DagreLayoutAdapter();
  }
}

/**
 * Message handler
 */
ctx.addEventListener('message', async (event: MessageEvent) => {
  const request = event.data as WorkerRequest;

  switch (request.type) {
    case 'init':
      handleInitRequest(request);
      break;

    case 'layout':
      await handleLayoutRequest(request as LayoutWorkerRequest);
      break;

    case 'cancel':
      handleCancelRequest(request as CancelWorkerRequest);
      break;

    default:
      console.warn('Unknown worker request type:', request.type);
  }
});

/**
 * Error handler
 */
ctx.addEventListener('error', (event: ErrorEvent) => {
  console.error('Worker error:', event);
});

// Signal that worker is ready
console.log('Layout worker initialized');
