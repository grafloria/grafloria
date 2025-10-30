/**
 * Sync State Manager - Tracks sync state and provides UI feedback
 *
 * Manages synchronization state for UI components:
 * - Sync status indicators
 * - Error tracking
 * - Performance metrics
 * - Conflict detection
 */

import { SyncDirection } from './BidirectionalSync';

export interface SyncStatus {
  /**
   * Current status
   */
  status: 'idle' | 'syncing' | 'error' | 'conflict';

  /**
   * Status message
   */
  message: string;

  /**
   * Last sync timestamp
   */
  lastSync?: Date;

  /**
   * Last sync duration (ms)
   */
  lastSyncDuration?: number;

  /**
   * Error message if status is 'error'
   */
  error?: string;
}

export interface SyncMetrics {
  /**
   * Total syncs performed
   */
  totalSyncs: number;

  /**
   * Text → Visual syncs
   */
  textToVisual: number;

  /**
   * Visual → Text syncs
   */
  visualToText: number;

  /**
   * Sync errors
   */
  errors: number;

  /**
   * Conflicts resolved
   */
  conflicts: number;

  /**
   * Average sync time (ms)
   */
  averageSyncTime: number;

  /**
   * Session duration (ms)
   */
  sessionDuration: number;
}

export interface ConflictInfo {
  /**
   * Timestamp of conflict
   */
  timestamp: Date;

  /**
   * Conflicting edit sources
   */
  sources: [SyncDirection, SyncDirection];

  /**
   * Resolution strategy used
   */
  resolution: 'last-write-wins' | 'user-choice' | 'merge';

  /**
   * Was conflict resolved
   */
  resolved: boolean;
}

export type StatusChangeCallback = (status: SyncStatus) => void;

export class SyncStateManager {
  private status: SyncStatus = {
    status: 'idle',
    message: 'Ready',
  };

  private metrics: SyncMetrics = {
    totalSyncs: 0,
    textToVisual: 0,
    visualToText: 0,
    errors: 0,
    conflicts: 0,
    averageSyncTime: 0,
    sessionDuration: 0,
  };

  private sessionStart: Date = new Date();
  private syncTimes: number[] = [];
  private conflicts: ConflictInfo[] = [];
  private callbacks: StatusChangeCallback[] = [];

  /**
   * Mark sync as started
   */
  startSync(direction: SyncDirection): void {
    this.status = {
      status: 'syncing',
      message: this.getSyncMessage(direction),
      lastSync: this.status.lastSync,
      lastSyncDuration: this.status.lastSyncDuration,
    };

    this.notifyCallbacks();
  }

  /**
   * Mark sync as completed
   */
  completeSync(direction: SyncDirection, duration: number): void {
    // Update metrics
    this.metrics.totalSyncs++;

    if (direction === 'text-to-visual') {
      this.metrics.textToVisual++;
    } else if (direction === 'visual-to-text') {
      this.metrics.visualToText++;
    }

    // Track sync time
    this.syncTimes.push(duration);
    if (this.syncTimes.length > 100) {
      this.syncTimes.shift(); // Keep last 100
    }

    // Calculate average
    this.metrics.averageSyncTime =
      this.syncTimes.reduce((a, b) => a + b, 0) / this.syncTimes.length;

    // Update session duration
    this.metrics.sessionDuration = Date.now() - this.sessionStart.getTime();

    // Update status
    this.status = {
      status: 'idle',
      message: 'Synced',
      lastSync: new Date(),
      lastSyncDuration: duration,
    };

    this.notifyCallbacks();
  }

  /**
   * Mark sync as failed
   */
  failSync(error: string): void {
    this.metrics.errors++;

    this.status = {
      status: 'error',
      message: 'Sync failed',
      error,
      lastSync: this.status.lastSync,
      lastSyncDuration: this.status.lastSyncDuration,
    };

    this.notifyCallbacks();
  }

  /**
   * Record a conflict
   */
  recordConflict(
    sources: [SyncDirection, SyncDirection],
    resolution: ConflictInfo['resolution']
  ): void {
    const conflict: ConflictInfo = {
      timestamp: new Date(),
      sources,
      resolution,
      resolved: true,
    };

    this.conflicts.push(conflict);
    this.metrics.conflicts++;

    this.status = {
      status: 'conflict',
      message: 'Conflict resolved',
      lastSync: new Date(),
    };

    this.notifyCallbacks();

    // Return to idle after brief display
    setTimeout(() => {
      if (this.status.status === 'conflict') {
        this.status = {
          status: 'idle',
          message: 'Ready',
          lastSync: this.status.lastSync,
          lastSyncDuration: this.status.lastSyncDuration,
        };
        this.notifyCallbacks();
      }
    }, 2000);
  }

  /**
   * Get current status
   */
  getStatus(): Readonly<SyncStatus> {
    return { ...this.status };
  }

  /**
   * Get metrics
   */
  getMetrics(): Readonly<SyncMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get recent conflicts
   */
  getConflicts(limit: number = 10): ConflictInfo[] {
    return this.conflicts.slice(-limit);
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify callbacks
   */
  private notifyCallbacks(): void {
    for (const callback of this.callbacks) {
      try {
        callback(this.status);
      } catch (error) {
        console.error('[SyncStateManager] Callback error:', error);
      }
    }
  }

  /**
   * Get sync message for direction
   */
  private getSyncMessage(direction: SyncDirection): string {
    switch (direction) {
      case 'text-to-visual':
        return 'Updating diagram...';
      case 'visual-to-text':
        return 'Updating text...';
      default:
        return 'Syncing...';
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalSyncs: 0,
      textToVisual: 0,
      visualToText: 0,
      errors: 0,
      conflicts: 0,
      averageSyncTime: 0,
      sessionDuration: 0,
    };

    this.sessionStart = new Date();
    this.syncTimes = [];
    this.conflicts = [];
  }

  /**
   * Get formatted status for display
   */
  getFormattedStatus(): string {
    const { status, message, lastSync, lastSyncDuration } = this.status;

    let formatted = `${this.getStatusIcon(status)} ${message}`;

    if (lastSync && status === 'idle') {
      const ago = Date.now() - lastSync.getTime();
      if (ago < 1000) {
        formatted += ' (just now)';
      } else if (ago < 60000) {
        formatted += ` (${Math.floor(ago / 1000)}s ago)`;
      } else {
        formatted += ` (${Math.floor(ago / 60000)}m ago)`;
      }
    }

    if (lastSyncDuration) {
      formatted += ` • ${lastSyncDuration.toFixed(0)}ms`;
    }

    return formatted;
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: SyncStatus['status']): string {
    switch (status) {
      case 'idle':
        return '✓';
      case 'syncing':
        return '⟳';
      case 'error':
        return '✗';
      case 'conflict':
        return '⚠';
      default:
        return '•';
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): string {
    const m = this.metrics;
    const lines = [
      `Total syncs: ${m.totalSyncs}`,
      `Text → Visual: ${m.textToVisual}`,
      `Visual → Text: ${m.visualToText}`,
      `Errors: ${m.errors}`,
      `Conflicts: ${m.conflicts}`,
      `Avg sync time: ${m.averageSyncTime.toFixed(2)}ms`,
      `Session: ${(m.sessionDuration / 1000).toFixed(0)}s`,
    ];
    return lines.join('\n');
  }
}
