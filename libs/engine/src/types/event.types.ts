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

  // Link events
  LINK_ADDED: 'link:added',
  LINK_REMOVED: 'link:removed',
  LINK_UPDATED: 'link:updated',
  LINK_SELECTED: 'link:selected',
  LINK_DESELECTED: 'link:deselected',

  // Port events
  PORT_ADDED: 'port:added',
  PORT_REMOVED: 'port:removed',
  PORT_CONNECTED: 'port:connected',
  PORT_DISCONNECTED: 'port:disconnected',

  // Connection events
  CONNECTION_START: 'connection:start',
  CONNECTION_CREATED: 'connection:created',
  CONNECTION_CANCELLED: 'connection:cancelled',

  // Diagram events
  DIAGRAM_UPDATED: 'diagram:updated',
  DIAGRAM_LOADED: 'diagram:loaded',
  DIAGRAM_CLEARED: 'diagram:cleared',

  // Selection events
  SELECTION_CHANGED: 'selection:changed',

  // State events
  STATE_CHANGED: 'state:changed',

  // Command events
  COMMAND_EXECUTED: 'command:executed',
  COMMAND_UNDONE: 'command:undone',
  COMMAND_REDONE: 'command:redone',
} as const;

export type DiagramEventType = typeof DiagramEventTypes[keyof typeof DiagramEventTypes];
