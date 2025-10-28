import { NodeModel, LinkModel } from '@grafloria/engine';

/**
 * Multi-Node Canvas State
 *
 * Manages the state of multiple nodes and connections in the preview canvas.
 */
export interface MultiNodeState {
  nodes: PreviewNodeInfo[];
  connections: ConnectionInfo[];
  selectedNodeIds: string[];
  canvasPosition: { x: number; y: number };
  zoom: number;
}

/**
 * Preview Node Information
 *
 * Represents a single node in the preview canvas with its template and data.
 */
export interface PreviewNodeInfo {
  /** Unique ID for this preview node instance */
  id: string;

  /** ID of the template this node was created from */
  templateId: string;

  /** Position in canvas (world coordinates) */
  position: { x: number; y: number };

  /** Reference to the actual NodeModel in the diagram */
  nodeModel: NodeModel;

  /** Data bound to this node instance */
  data: any;

  /** Timestamp when node was added */
  createdAt: number;
}

/**
 * Connection Information
 *
 * Represents a link/edge between two nodes in the preview canvas.
 */
export interface ConnectionInfo {
  /** Unique ID for this connection */
  id: string;

  /** ID of the source preview node */
  sourceNodeId: string;

  /** ID of the target preview node */
  targetNodeId: string;

  /** ID of the source port */
  sourcePortId: string;

  /** ID of the target port */
  targetPortId: string;

  /** Visual style of the connection line */
  style: ConnectionStyle;

  /** Reference to the actual LinkModel in the diagram */
  linkModel: LinkModel;

  /** Optional label for the connection */
  label?: string;

  /** Timestamp when connection was added */
  createdAt: number;
}

/**
 * Connection Style Options
 */
export type ConnectionStyle = 'straight' | 'curved' | 'orthogonal';

/**
 * Node Selection State
 */
export interface NodeSelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  multiSelectEnabled: boolean;
}

/**
 * Canvas Layout Configuration
 */
export interface CanvasLayoutConfig {
  type: 'grid' | 'tree' | 'circular' | 'force';
  columns?: number; // For grid layout
  spacing?: { x: number; y: number };
  startOffset?: { x: number; y: number };
}

/**
 * Default canvas layout configuration
 */
export const DEFAULT_LAYOUT_CONFIG: CanvasLayoutConfig = {
  type: 'grid',
  columns: 3,
  spacing: { x: 300, y: 250 },
  startOffset: { x: 150, y: 150 }
};
