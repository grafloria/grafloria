/**
 * DSL Worker System
 *
 * Enables off-thread DSL parsing for smooth UI with large diagrams.
 * Moves expensive parsing and transformation to Web Workers to prevent UI freezing.
 *
 * Key features:
 * - Non-blocking DSL parsing
 * - Progress reporting
 * - Cancellation support
 * - Format preservation
 * - Automatic fallback to main thread if workers unavailable
 *
 * Phase 5: Performance Optimization
 *
 * @module dsl/workers
 */

import { DiagramModel } from '../../models/DiagramModel';
import { ParseResult } from '../DSL';

/**
 * Message types for worker communication
 */
export type DSLWorkerMessageType =
  | 'parse'          // Parse DSL text
  | 'generate'       // Generate DSL from diagram
  | 'cancel'         // Cancel current operation
  | 'progress'       // Progress update
  | 'result'         // Operation result
  | 'error';         // Error occurred

/**
 * Message sent to worker
 */
export interface DSLWorkerRequest {
  type: 'parse' | 'generate' | 'cancel';
  id: string;
  payload?: any;
}

/**
 * Message received from worker
 */
export interface DSLWorkerResponse {
  type: 'progress' | 'result' | 'error';
  id: string;
  payload?: any;
}

/**
 * Parse DSL request
 */
export interface ParseWorkerRequest extends DSLWorkerRequest {
  type: 'parse';
  payload: {
    /** DSL text to parse */
    text: string;
    /** Parser options */
    options?: {
      autoLayout?: boolean;
      preserveFormat?: boolean;
      debug?: boolean;
    };
  };
}

/**
 * Generate DSL request
 */
export interface GenerateWorkerRequest extends DSLWorkerRequest {
  type: 'generate';
  payload: {
    /** Serialized diagram */
    diagram: SerializedDiagram;
    /** Generator options */
    options?: {
      format?: boolean;
      preserveComments?: boolean;
    };
  };
}

/**
 * Cancel request
 */
export interface CancelWorkerRequest extends DSLWorkerRequest {
  type: 'cancel';
}

/**
 * Progress update from worker
 */
export interface ProgressWorkerResponse extends DSLWorkerResponse {
  type: 'progress';
  payload: {
    /** Progress percentage (0-100) */
    progress: number;
    /** Current step */
    step?: string;
    /** Status message */
    message?: string;
  };
}

/**
 * Parse result from worker
 */
export interface ParseResultWorkerResponse extends DSLWorkerResponse {
  type: 'result';
  payload: {
    /** Serialized diagram model */
    diagram: SerializedDiagram;
    /** Parse statistics */
    stats: {
      nodeCount: number;
      linkCount: number;
      parseTime: number;
    };
    /** Layout suggestion */
    layoutSuggestion?: {
      presetId: string;
      confidence: number;
      reasoning: string;
    };
    /** Preserved format information */
    formatInfo?: FormatInfo;
  };
}

/**
 * Generate result from worker
 */
export interface GenerateResultWorkerResponse extends DSLWorkerResponse {
  type: 'result';
  payload: {
    /** Generated DSL text */
    text: string;
    /** Generation time */
    generationTime: number;
  };
}

/**
 * Error from worker
 */
export interface ErrorWorkerResponse extends DSLWorkerResponse {
  type: 'error';
  payload: {
    /** Error message */
    message: string;
    /** Error stack trace */
    stack?: string;
    /** Error line number (for parse errors) */
    line?: number;
    /** Error column number (for parse errors) */
    column?: number;
  };
}

/**
 * Serialized diagram for worker transfer
 */
export interface SerializedDiagram {
  id: string;
  name: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  metadata: Record<string, any>;
}

/**
 * Serialized node
 */
export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: Record<string, any>;
  style: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Serialized link
 */
export interface SerializedLink {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourcePortId: string;
  targetPortId: string;
  pathType: string;
  data: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Format preservation information
 */
export interface FormatInfo {
  /** Original text for reference */
  originalText: string;
  /** Preserved comments */
  comments: CommentInfo[];
  /** Preserved whitespace patterns */
  whitespace: WhitespaceInfo;
  /** Indentation style detected */
  indentStyle: 'spaces' | 'tabs';
  /** Indent size (if spaces) */
  indentSize: number;
  /** Line ending style */
  lineEnding: '\n' | '\r\n';
}

/**
 * Comment information
 */
export interface CommentInfo {
  /** Comment text */
  text: string;
  /** Line number */
  line: number;
  /** Type of comment */
  type: 'line' | 'block';
  /** Associated node ID (if applicable) */
  nodeId?: string;
}

/**
 * Whitespace information
 */
export interface WhitespaceInfo {
  /** Blank lines between sections */
  sectionSpacing: number;
  /** Space around arrows */
  arrowSpacing: boolean;
  /** Space after colons */
  colonSpacing: boolean;
}

/**
 * Progress callback
 */
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Worker configuration options
 */
export interface DSLWorkerOptions {
  /** Enable worker-based computation (default: true) */
  useWorker?: boolean;

  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Report progress updates (default: true) */
  reportProgress?: boolean;

  /** Fallback to main thread if worker fails (default: true) */
  fallbackToMainThread?: boolean;

  /** Worker script URL (default: auto-detect) */
  workerScriptUrl?: string;
}

/**
 * Serialize DiagramModel for transfer to worker
 */
export function serializeDiagram(diagram: DiagramModel): SerializedDiagram {
  return {
    id: diagram.id,
    name: diagram.name,
    nodes: diagram.getNodes().map(node => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      size: { width: node.size.width, height: node.size.height },
      data: { ...node.data },
      style: { ...node.style },
      metadata: Object.fromEntries(node.metadata),
    })),
    links: diagram.getLinks().map(link => ({
      id: link.id,
      sourceNodeId: link.sourceNodeId,
      targetNodeId: link.targetNodeId,
      sourcePortId: link.sourcePortId,
      targetPortId: link.targetPortId,
      pathType: link.pathType,
      data: { ...link.data },
      metadata: Object.fromEntries(link.metadata),
    })),
    metadata: Object.fromEntries(diagram.metadata),
  };
}

/**
 * Deserialize diagram from worker result
 */
export function deserializeDiagram(serialized: SerializedDiagram): DiagramModel {
  const diagram = new DiagramModel(serialized.name);
  // Note: Can't set id as it's readonly - would need to modify constructor or use Object.defineProperty

  // Restore metadata
  for (const [key, value] of Object.entries(serialized.metadata)) {
    diagram.setMetadata(key, value);
  }

  // Note: Nodes and links should be created through proper factory methods
  // This is a simplified version - actual implementation would need proper reconstruction
  return diagram;
}
