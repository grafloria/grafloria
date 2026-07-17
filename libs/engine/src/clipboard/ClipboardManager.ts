// ClipboardManager - Manages copy/paste operations (Phase 1.8)

import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { GroupModel } from '../models/GroupModel';
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';

/**
 * Clipboard data format for diagram entities
 */
export interface ClipboardData {
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: SerializedGroup[];
  timestamp: number;
  sourceDiagramId?: string;
  /** @deprecated misspelling kept for payload back-compat — use sourceDiagramId */
  sourceDigramId?: string;
}

/**
 * ClipboardManager handles copy/paste operations for diagram entities
 *
 * Features:
 * - Serializes selected entities to clipboard format
 * - Handles relationship preservation (links between copied nodes)
 * - Supports cross-diagram paste (ID remapping)
 * - Maintains clipboard history
 */
export class ClipboardManager {
  private clipboard: ClipboardData | null = null;
  private history: ClipboardData[] = [];
  private readonly maxHistorySize: number = 10;
  private pasteSerial = 0;

  /**
   * Copy entities to clipboard
   */
  copy(data: {
    nodes: NodeModel[];
    links: LinkModel[];
    groups: GroupModel[];
    sourceDiagramId?: string;
  }): void {
    // Serialize entities
    const clipboardData: ClipboardData = {
      nodes: data.nodes.map(n => n.serialize()),
      links: data.links.map(l => l.serialize()),
      groups: data.groups.map(g => g.serialize()),
      timestamp: Date.now(),
      sourceDiagramId: data.sourceDiagramId,
      sourceDigramId: data.sourceDiagramId, // deprecated alias (back-compat)
    };

    // Store in clipboard
    this.clipboard = clipboardData;
    // A fresh copy starts a fresh paste cascade (see claimPasteSlot).
    this.pasteSerial = 0;

    // Add to history
    this.history.unshift(clipboardData);
    if (this.history.length > this.maxHistorySize) {
      this.history.pop();
    }
  }

  /**
   * Get clipboard data
   */
  get(): ClipboardData | null {
    return this.clipboard;
  }

  /**
   * Claim the next paste slot for the CURRENT clipboard payload (1-based).
   *
   * Repeat-pasting the same copy must cascade — the clipboard's serialized
   * positions are frozen at copy time, so a constant default offset lands
   * every paste on the exact same pixels and "paste" appears to work only
   * once (live report). Each PasteCommand claims its slot once (stable
   * across redo); a new copy() resets the cascade.
   */
  claimPasteSlot(): number {
    return ++this.pasteSerial;
  }

  /**
   * Check if clipboard has data
   */
  hasData(): boolean {
    return this.clipboard !== null && this.clipboard.nodes.length > 0;
  }

  /**
   * Clear clipboard
   */
  clear(): void {
    this.clipboard = null;
  }

  /**
   * Get clipboard history
   */
  getHistory(): ClipboardData[] {
    return [...this.history];
  }

  /**
   * Check if clipboard contains nodes from a specific diagram
   */
  isFromDiagram(diagramId: string): boolean {
    return (
      (this.clipboard?.sourceDiagramId ?? this.clipboard?.sourceDigramId) === diagramId
    );
  }

  /**
   * Get clipboard statistics
   */
  getStats(): {
    nodeCount: number;
    linkCount: number;
    groupCount: number;
    timestamp: number | null;
  } {
    if (!this.clipboard) {
      return {
        nodeCount: 0,
        linkCount: 0,
        groupCount: 0,
        timestamp: null,
      };
    }

    return {
      nodeCount: this.clipboard.nodes.length,
      linkCount: this.clipboard.links.length,
      groupCount: this.clipboard.groups.length,
      timestamp: this.clipboard.timestamp,
    };
  }
}
