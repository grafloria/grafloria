// Event type definitions

export interface DiagramEvent<T = any> {
  type: string;
  timestamp: number;
  data: T;
  source?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export type EventHandler<T = any> = (event: DiagramEvent<T>) => void;

export interface EventSubscription {
  unsubscribe: () => void;
}

// Event names as constants
export const DiagramEventTypes = {
  // Node events
  NODE_ADDED: 'node:added',
  NODE_REMOVED: 'node:removed',
  NODE_MOVED: 'node:moved',
  NODE_RESIZED: 'node:resized',
  NODE_SELECTED: 'node:selected',
  NODE_DESELECTED: 'node:deselected',
  NODE_UPDATED: 'node:updated',
  NODE_PARENT_CHANGED: 'node:parent-changed', // Phase 1.6

  // Link events
  LINK_ADDED: 'link:added',
  LINK_REMOVED: 'link:removed',
  LINK_UPDATED: 'link:updated',
  LINK_SELECTED: 'link:selected',
  LINK_DESELECTED: 'link:deselected',
  LINK_POINT_ADDED: 'link:point-added',
  LINK_PATH_CHANGED: 'link:path-changed',
  LINK_LABEL_ADDED: 'link:label-added',
  LINK_LABEL_REMOVED: 'link:label-removed',
  LINK_LABEL_UPDATED: 'link:label-updated',
  LINK_STATE_CHANGED: 'link:state-changed',
  LINK_STYLE_CHANGED: 'link:style-changed',

  // Port events
  PORT_ADDED: 'port:added',
  PORT_REMOVED: 'port:removed',
  PORT_CONNECTED: 'port:connected',
  PORT_DISCONNECTED: 'port:disconnected',

  // Connection events
  CONNECTION_START: 'connection:start',
  CONNECTION_CREATED: 'connection:created',
  CONNECTION_CANCELLED: 'connection:cancelled',

  // Group events (Phase 1.6c)
  GROUP_ADDED: 'group:added',
  GROUP_REMOVED: 'group:removed',
  GROUP_EXPANDED: 'group:expanded',
  GROUP_COLLAPSED: 'group:collapsed',
  MEMBER_ADDED: 'member:added',
  MEMBER_REMOVED: 'member:removed',

  // Hierarchy events (Phase 1.6)
  TRANSFORM_PROPAGATED: 'transform:propagated',

  // Layout events (Phase 1.7)
  LAYOUT_CHANGED: 'layout:changed',
  LAYOUT_CLEARED: 'layout:cleared',
  FLEX_ITEM_CHANGED: 'flex-item:changed',
  FLEX_ITEM_CLEARED: 'flex-item:cleared',
  GRID_ITEM_CHANGED: 'grid-item:changed',
  GRID_ITEM_CLEARED: 'grid-item:cleared',

  // Clipboard events (Phase 1.8)
  CLIPBOARD_COPIED: 'clipboard:copied',
  CLIPBOARD_PASTED: 'clipboard:pasted',
  CLIPBOARD_DUPLICATED: 'clipboard:duplicated',

  // Diagram events
  DIAGRAM_UPDATED: 'diagram:updated',
  DIAGRAM_LOADED: 'diagram:loaded',
  DIAGRAM_CLEARED: 'diagram:cleared',
  DIAGRAM_CHANGED: 'diagram:changed',
  DIAGRAM_CREATED: 'diagram:created',
  NODES_CLEARED: 'nodes:cleared',
  LINKS_CLEARED: 'links:cleared',
  GROUPS_CLEARED: 'groups:cleared',

  // Selection events (Phase 1.8a)
  SELECTION_CHANGED: 'selection:changed',
  SELECTION_CLEARED: 'selection:cleared',

  // Viewport events
  VIEWPORT_CHANGED: 'viewport:changed',
  VIEWPORT_ZOOMED: 'viewport:zoomed',
  VIEWPORT_SETTINGS_CHANGED: 'viewport-settings-changed',

  // Mode events
  MODE_CHANGED: 'mode:changed',
  MODE_GUARD_BLOCKED: 'mode:guard-blocked',

  // State events
  STATE_CHANGED: 'state:changed',

  // Command events
  COMMAND_EXECUTED: 'command:executed',
  COMMAND_UNDONE: 'command:undone',
  COMMAND_REDONE: 'command:redone',
  COMMAND_FAILED: 'command:failed',
  COMMAND_MERGED: 'command:merged',
  COMMAND_HISTORY_CLEARED: 'command:history:cleared',

  // Engine events
  ENGINE_INITIALIZED: 'engine:initialized',
  ENGINE_DESTROYED: 'engine:destroyed',
} as const;

export type DiagramEventType = typeof DiagramEventTypes[keyof typeof DiagramEventTypes];

// Typed event payload interfaces (Phase 1.8a)
export interface NodeEvent {
  nodeId: string;
  node?: any; // NodeModel (avoiding circular dependency)
}

export interface LinkEvent {
  linkId: string;
  link?: any; // LinkModel
}

export interface GroupEvent {
  groupId: string;
  group?: any; // GroupModel
}

export interface SelectionEvent {
  nodes?: string[];
  links?: string[];
  groups?: string[];
  source?: 'user' | 'api' | 'pattern';
  pattern?: string; // e.g., 'descendants', 'connected', 'filtered'
}

export interface LayoutEvent {
  groupId: string;
  type: 'flexbox' | 'grid' | 'none';
  config?: any; // LayoutConfig
}

export interface ClipboardEvent {
  nodeCount: number;
  linkCount: number;
  groupCount: number;
  operation: 'copy' | 'paste' | 'duplicate';
}

export interface ModeEvent {
  mode: 'design' | 'runtime' | 'readonly';
  previousMode?: 'design' | 'runtime' | 'readonly';
  reason?: string;
}

export interface CommandEvent {
  commandName: string;
  commandId: string;
  success?: boolean;
  error?: string;
}

export interface ViewportEvent {
  zoom?: number;
  position?: { x: number; y: number };
  settings?: any; // ModeViewportSettings
}
