import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ButtonComponent } from '../../shared/components/button/button.component';

/**
 * Event Log Entry
 */
export interface EventLogEntry {
  id: string;
  timestamp: number;
  eventName: string;
  domEventType?: string;
  payload: any;
  nodeId?: string;
  color: string;
}

/**
 * Event Statistics
 */
export interface EventStats {
  total: number;
  byType: Map<string, number>;
  last50: EventLogEntry[];
}

/**
 * Event Monitor Panel Component
 *
 * Monitors and displays all events fired in the template builder.
 * Features:
 * - Live event log
 * - Event filtering
 * - Payload inspection
 * - Event statistics
 * - Export events
 *
 * Usage:
 * <app-event-monitor-panel></app-event-monitor-panel>
 */
@Component({
  selector: 'app-event-monitor-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="event-monitor-panel">
      <!-- Header -->
      <div class="panel-header">
        <h3 class="panel-title">Event Monitor</h3>
        <div class="panel-actions">
          <span class="event-count">{{ events.length }} events</span>
          <app-button
            variant="ghost"
            size="sm"
            icon="📥"
            (clicked)="exportEvents()">
            Export
          </app-button>
          <app-button
            variant="secondary"
            size="sm"
            icon="🗑️"
            (clicked)="clearEvents()">
            Clear
          </app-button>
        </div>
      </div>

      <!-- Controls -->
      <div class="panel-controls">
        <div class="control-group">
          <label class="control-label">
            <input
              type="checkbox"
              [(ngModel)]="autoscroll"
              class="control-checkbox">
            Auto-scroll
          </label>
        </div>

        <div class="control-group">
          <input
            type="text"
            [(ngModel)]="filterQuery"
            (ngModelChange)="applyFilter()"
            placeholder="Filter events..."
            class="filter-input">
        </div>

        <div class="control-group">
          <select [(ngModel)]="filterType" (ngModelChange)="applyFilter()" class="filter-select">
            <option value="">All Types</option>
            <option value="click">Click</option>
            <option value="dblclick">Double Click</option>
            <option value="mouseenter">Mouse Enter</option>
            <option value="mouseleave">Mouse Leave</option>
            <option value="input">Input</option>
            <option value="change">Change</option>
            <option value="submit">Submit</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <!-- Event Log -->
      <div class="event-log" #eventLog>
        <div *ngIf="filteredEvents.length === 0" class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text">No events captured yet</div>
          <div class="empty-hint">
            {{ filterQuery || filterType ? 'Try adjusting your filters' : 'Interact with the preview to see events' }}
          </div>
        </div>

        <div
          *ngFor="let event of filteredEvents"
          class="event-entry"
          [class.expanded]="expandedEvent === event.id"
          (click)="toggleExpand(event.id)">

          <!-- Event Header -->
          <div class="event-header">
            <span class="event-indicator" [style.background]="event.color"></span>
            <span class="event-time">{{ formatTime(event.timestamp) }}</span>
            <span class="event-name">{{ event.eventName }}</span>
            <span class="event-type" *ngIf="event.domEventType">
              {{ event.domEventType }}
            </span>
            <span class="expand-icon">{{ expandedEvent === event.id ? '▼' : '▶' }}</span>
          </div>

          <!-- Event Payload (Expanded) -->
          <div class="event-payload" *ngIf="expandedEvent === event.id">
            <div class="payload-header">Payload:</div>
            <pre class="payload-content">{{ formatPayload(event.payload) }}</pre>
          </div>
        </div>
      </div>

      <!-- Statistics -->
      <div class="event-stats">
        <div class="stats-header" (click)="statsExpanded = !statsExpanded">
          <span class="expand-icon">{{ statsExpanded ? '▼' : '▶' }}</span>
          <span class="stats-title">Statistics</span>
        </div>
        <div class="stats-content" *ngIf="statsExpanded">
          <div class="stat-item">
            <span class="stat-label">Total Events:</span>
            <span class="stat-value">{{ getStats().total }}</span>
          </div>
          <div class="stat-group">
            <div class="stat-group-title">By Type:</div>
            <div *ngFor="let entry of getStatsByType()" class="stat-item small">
              <span class="stat-label">{{ entry.type }}:</span>
              <span class="stat-value">{{ entry.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .event-monitor-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .panel-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
    }

    .panel-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .event-count {
      font-size: 0.875rem;
      color: #6b7280;
      padding: 4px 8px;
      background: #f3f4f6;
      border-radius: 4px;
    }

    .panel-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: white;
      flex-wrap: wrap;
    }

    .control-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .control-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.875rem;
      color: #374151;
      cursor: pointer;
      user-select: none;
    }

    .control-checkbox {
      cursor: pointer;
    }

    .filter-input {
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
      min-width: 200px;
    }

    .filter-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .filter-select {
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
      cursor: pointer;
    }

    .filter-select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .event-log {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      background: #f9fafb;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 200px;
      color: #9ca3af;
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 16px;
    }

    .empty-text {
      font-size: 1.125rem;
      font-weight: 500;
      margin-bottom: 8px;
      color: #6b7280;
    }

    .empty-hint {
      font-size: 0.875rem;
      color: #9ca3af;
    }

    .event-entry {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .event-entry:hover {
      border-color: #667eea;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .event-entry.expanded {
      border-color: #667eea;
    }

    .event-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
    }

    .event-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .event-time {
      font-size: 0.75rem;
      color: #9ca3af;
      font-family: monospace;
      min-width: 80px;
    }

    .event-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
      flex: 1;
    }

    .event-type {
      font-size: 0.75rem;
      color: #6b7280;
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .expand-icon {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-left: auto;
    }

    .event-payload {
      padding: 12px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .payload-header {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
    }

    .payload-content {
      margin: 0;
      padding: 12px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
      color: #374151;
      overflow-x: auto;
      max-height: 300px;
    }

    .event-stats {
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .stats-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      cursor: pointer;
      user-select: none;
    }

    .stats-header:hover {
      background: #f3f4f6;
    }

    .stats-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
    }

    .stats-content {
      padding: 12px 16px;
      background: white;
    }

    .stat-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 0.875rem;
    }

    .stat-item.small {
      padding: 4px 0 4px 16px;
      font-size: 0.8125rem;
    }

    .stat-label {
      color: #6b7280;
    }

    .stat-value {
      font-weight: 600;
      color: #111827;
    }

    .stat-group {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
    }

    .stat-group-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 4px;
    }
  `]
})
export class EventMonitorPanelComponent implements OnInit, OnDestroy {

  events: EventLogEntry[] = [];
  filteredEvents: EventLogEntry[] = [];
  expandedEvent: string | null = null;
  filterQuery = '';
  filterType = '';
  autoscroll = true;
  statsExpanded = false;

  private destroy$ = new Subject<void>();
  private eventColors = new Map<string, string>([
    ['click', '#3b82f6'],
    ['dblclick', '#8b5cf6'],
    ['mouseenter', '#10b981'],
    ['mouseleave', '#f59e0b'],
    ['input', '#ec4899'],
    ['change', '#06b6d4'],
    ['submit', '#8b5cf6'],
    ['focus', '#14b8a6'],
    ['blur', '#f97316'],
    ['custom', '#667eea']
  ]);

  ngOnInit(): void {
    // In a real implementation, this would listen to an EventBus
    // For now, we'll add a method to manually add events for testing
    this.simulateEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Add an event to the log
   */
  addEvent(eventName: string, domEventType: string | undefined, payload: any): void {
    const event: EventLogEntry = {
      id: `event-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      eventName,
      domEventType,
      payload,
      color: this.getEventColor(domEventType || 'custom')
    };

    this.events.unshift(event);

    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(0, 1000);
    }

    this.applyFilter();

    // Auto-scroll to top if enabled
    if (this.autoscroll) {
      setTimeout(() => {
        const logElement = document.querySelector('.event-log');
        if (logElement) {
          logElement.scrollTop = 0;
        }
      }, 0);
    }
  }

  /**
   * Get color for event type
   */
  private getEventColor(type: string): string {
    return this.eventColors.get(type) || '#667eea';
  }

  /**
   * Toggle event expansion
   */
  toggleExpand(eventId: string): void {
    this.expandedEvent = this.expandedEvent === eventId ? null : eventId;
  }

  /**
   * Apply filters
   */
  applyFilter(): void {
    let filtered = [...this.events];

    // Filter by query
    if (this.filterQuery) {
      const query = this.filterQuery.toLowerCase();
      filtered = filtered.filter(event =>
        event.eventName.toLowerCase().includes(query) ||
        event.domEventType?.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (this.filterType) {
      filtered = filtered.filter(event =>
        event.domEventType === this.filterType ||
        (this.filterType === 'custom' && !event.domEventType)
      );
    }

    this.filteredEvents = filtered;
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
    this.filteredEvents = [];
    this.expandedEvent = null;
  }

  /**
   * Export events to JSON
   */
  exportEvents(): void {
    const data = JSON.stringify(this.events, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Format timestamp
   */
  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  }

  /**
   * Format payload for display
   */
  formatPayload(payload: any): string {
    try {
      // Remove circular references
      const cleaned = JSON.parse(JSON.stringify(payload, (key, value) => {
        if (key.startsWith('_') || key === 'target' || key === 'currentTarget') {
          return undefined;
        }
        return value;
      }));

      return JSON.stringify(cleaned, null, 2);
    } catch (error) {
      return String(payload);
    }
  }

  /**
   * Get statistics
   */
  getStats(): EventStats {
    const byType = new Map<string, number>();

    this.events.forEach(event => {
      const type = event.domEventType || 'custom';
      byType.set(type, (byType.get(type) || 0) + 1);
    });

    return {
      total: this.events.length,
      byType,
      last50: this.events.slice(0, 50)
    };
  }

  /**
   * Get statistics by type for display
   */
  getStatsByType(): Array<{ type: string; count: number }> {
    const stats = this.getStats();
    return Array.from(stats.byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Simulate some events for testing
   */
  private simulateEvents(): void {
    // This is just for demonstration
    // In real implementation, this would listen to actual events
    setTimeout(() => {
      this.addEvent('node:clicked', 'click', {
        nodeId: 'node-123',
        position: { x: 100, y: 200 }
      });
    }, 1000);

    setTimeout(() => {
      this.addEvent('node:hover-start', 'mouseenter', {
        nodeId: 'node-123'
      });
    }, 2000);

    setTimeout(() => {
      this.addEvent('form:value-changed', 'input', {
        field: 'name',
        value: 'John Doe'
      });
    }, 3000);
  }
}
