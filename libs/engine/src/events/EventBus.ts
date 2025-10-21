// EventBus - Central event dispatcher for the diagram engine

import { EventEmitter } from 'eventemitter3';

export interface EventLogEntry {
  timestamp: number;
  event: string;
  data: any;
  namespace: string;
  action: string;
}

export interface ParsedEvent {
  namespace: string;
  action: string;
  full: string;
}

export class EventBus {
  private emitter: EventEmitter;
  private eventLog: EventLogEntry[] = [];
  private maxLogSize: number = 1000;
  private suspended: boolean = false;
  private recording: boolean = false;
  private batchMode: boolean = false;
  private batchedEvents: Array<{ event: string; data: any }> = [];

  constructor() {
    this.emitter = new EventEmitter();
  }

  /**
   * Emit an event
   */
  emit(event: string, data?: any): void {
    if (this.suspended) return;

    if (this.batchMode) {
      this.batchedEvents.push({ event, data });
      return;
    }

    const parsed = this.parseEvent(event);

    if (this.recording) {
      this.logEvent(event, data, parsed);
    }

    // Emit specific event
    this.emitter.emit(event, data);

    // Emit wildcard events
    this.emitter.emit('*', { event, data });
    this.emitter.emit(`${parsed.namespace}:*`, { action: parsed.action, data });
  }

  /**
   * Subscribe to events
   */
  on(pattern: string, handler: Function): () => void {
    this.emitter.on(pattern, handler as any);
    return () => this.off(pattern, handler);
  }

  /**
   * Subscribe once
   */
  once(pattern: string, handler: Function): void {
    this.emitter.once(pattern, handler as any);
  }

  /**
   * Unsubscribe from events
   */
  off(pattern: string, handler: Function): void {
    this.emitter.off(pattern, handler as any);
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(pattern?: string): void {
    if (pattern) {
      this.emitter.removeAllListeners(pattern);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  /**
   * Filtered subscription
   */
  onFiltered(
    event: string,
    filter: (data: any) => boolean,
    handler: Function
  ): () => void {
    const wrappedHandler = (data: any) => {
      if (filter(data)) {
        handler(data);
      }
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Mapped subscription
   */
  onMapped<T, R>(
    event: string,
    mapper: (data: T) => R,
    handler: (data: R) => void
  ): () => void {
    const wrappedHandler = (data: T) => {
      handler(mapper(data));
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Debounced subscription
   */
  onDebounced(
    event: string,
    delay: number,
    handler: Function
  ): () => void {
    let timeout: NodeJS.Timeout;
    const wrappedHandler = (data: any) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => handler(data), delay);
    };

    const unsubscribe = this.on(event, wrappedHandler);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }

  /**
   * Throttled subscription
   */
  onThrottled(
    event: string,
    delay: number,
    handler: Function
  ): () => void {
    let lastCall = 0;
    const wrappedHandler = (data: any) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        handler(data);
      }
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Batch events
   */
  batch(fn: () => void): void {
    this.batchMode = true;
    this.batchedEvents = [];

    try {
      fn();
    } finally {
      const events = [...this.batchedEvents];
      this.batchMode = false;
      this.batchedEvents = [];

      // Emit all batched events
      events.forEach(({ event, data }) => {
        this.emit(event, data);
      });

      // Emit batch complete
      this.emit('batch:complete', events);
    }
  }

  /**
   * Suspend event emission
   */
  suspend(): void {
    this.suspended = true;
  }

  /**
   * Resume event emission
   */
  resume(): void {
    this.suspended = false;
  }

  /**
   * Start recording events
   */
  startRecording(): void {
    this.recording = true;
    this.eventLog = [];
  }

  /**
   * Stop recording
   */
  stopRecording(): EventLogEntry[] {
    this.recording = false;
    return [...this.eventLog];
  }

  /**
   * Get event log
   */
  getEventLog(): ReadonlyArray<EventLogEntry> {
    return [...this.eventLog];
  }

  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  /**
   * Replay events
   */
  replay(events: EventLogEntry[]): void {
    const wasSuspended = this.suspended;
    this.suspended = false;

    events.forEach((entry) => {
      this.emit(entry.event, entry.data);
    });

    this.suspended = wasSuspended;
  }

  /**
   * Parse event string
   */
  private parseEvent(event: string): ParsedEvent {
    const parts = event.split(':');
    return {
      namespace: parts[0] || '',
      action: parts[1] || '',
      full: event,
    };
  }

  /**
   * Log event
   */
  private logEvent(event: string, data: any, parsed: ParsedEvent): void {
    this.eventLog.push({
      timestamp: Date.now(),
      event,
      data,
      namespace: parsed.namespace,
      action: parsed.action,
    });

    // Trim log if too large
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Get listener count
   */
  listenerCount(event: string): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Get all event names
   */
  eventNames(): string[] {
    return this.emitter.eventNames() as string[];
  }
}
