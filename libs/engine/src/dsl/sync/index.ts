/**
 * DSL Sync Module - Bidirectional synchronization components
 *
 * Provides real-time text ↔ visual editing with:
 * - 300ms debounced sync
 * - Auto-layout application
 * - State management and metrics
 * - Conflict resolution
 */

export {
  BidirectionalSync,
  type SyncOptions,
  type SyncDirection,
  type EditSource,
  type SyncState,
  type SyncCallback,
} from './BidirectionalSync';

export {
  LayoutApplicator,
  type LayoutApplicatorOptions,
  type LayoutApplicationResult,
} from './LayoutApplicator';

export {
  SyncStateManager,
  type SyncStatus,
  type SyncMetrics,
  type ConflictInfo,
  type StatusChangeCallback,
} from './SyncStateManager';

export {
  IntegratedSyncManager,
  type IntegratedSyncOptions,
  type TextChangeCallback,
  type DiagramChangeCallback,
  type StatusCallback,
} from './IntegratedSyncManager';
