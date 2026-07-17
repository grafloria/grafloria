// CopyCommand - Copy selected entities to clipboard (Phase 1.8)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { ClipboardManager } from '../../clipboard/ClipboardManager';
import { resolveLinkNodeIds } from './resolveLinkNodeIds';

/**
 * CopyCommand copies selected entities to clipboard
 *
 * Features:
 * - Copies selected nodes
 * - Includes links between selected nodes
 * - Optionally includes groups containing selected nodes
 * - Non-destructive (doesn't modify diagram)
 */
export class CopyCommand extends Command {
  private copiedNodeIds: string[] = [];
  private copiedLinkIds: string[] = [];
  private copiedGroupIds: string[] = [];

  constructor(
    private clipboard: ClipboardManager,
    private options: {
      includeGroups?: boolean; // Include groups (default: false)
      includeLinks?: boolean;  // Include links between copied nodes (default: true)
    } = {}
  ) {
    super('Copy');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Get selected nodes — from the DIAGRAM, the same source Delete and
    // select-all use. The store's 'selectedNodes' set is only written by
    // SelectionManager API calls; a MOUSE click selects through
    // diagram.selectNode() and never touches it, so reading the store made
    // ⌘C throw "No nodes selected" for anything a visitor clicked (live
    // audit: copy-paste dead end-to-end while the API-driven demo assert
    // stayed green — the click-vs-API seam). The store set is kept as a
    // fallback for headless callers that only used the SelectionManager.
    const diagramSelection = diagram.getSelectedNodes().map((n: { id: string }) => n.id);
    const storeSelection = context.store?.get('selectedNodes') as Set<string> | undefined;
    const selectedNodeIds = diagramSelection.length > 0 ? diagramSelection : Array.from(storeSelection ?? []);
    if (selectedNodeIds.length === 0) {
      throw new Error('No nodes selected');
    }

    this.copiedNodeIds = selectedNodeIds;

    // Get nodes
    const nodes = this.copiedNodeIds
      .map(id => diagram.getNode(id))
      .filter(n => n !== undefined);

    // Get links between selected nodes (if enabled)
    const links = [];
    if (this.options.includeLinks !== false) {
      const nodeIdSet = new Set(this.copiedNodeIds);
      const allLinks = diagram.getLinks();

      for (const link of allLinks) {
        // Include link if both source and target nodes are selected.
        // Endpoints are PORT ids (nanoids), so the owning nodes must be resolved
        // through the port index — see resolveLinkNodeIds().
        const { sourceNodeId, targetNodeId } = resolveLinkNodeIds(diagram, link);

        if (sourceNodeId && targetNodeId &&
            nodeIdSet.has(sourceNodeId) &&
            nodeIdSet.has(targetNodeId)) {
          links.push(link);
          this.copiedLinkIds.push(link.id);
        }
      }
    }

    // Get groups (if enabled)
    const groups = [];
    if (this.options.includeGroups) {
      const allGroups = diagram.getGroups();
      const nodeIdSet = new Set(this.copiedNodeIds);

      for (const group of allGroups) {
        // Include group if any of its members are selected
        const hasSelectedMember = (Array.from(group.members) as string[]).some(
          memberId => nodeIdSet.has(memberId)
        );

        if (hasSelectedMember) {
          groups.push(group);
          this.copiedGroupIds.push(group.id);
        }
      }
    }

    // Copy to clipboard
    this.clipboard.copy({
      nodes,
      links,
      groups,
      sourceDiagramId: diagram.id,
    });
  }

  override undo(context: CommandContext): void {
    // Copy is non-destructive, no undo needed
    // But we could restore previous clipboard state if needed
  }

  override canExecute(context: CommandContext): boolean {
    if (!context.diagram) return false;

    if (context.diagram.getSelectedNodes().length > 0) return true;
    const selectedNodes = context.store?.get('selectedNodes') as Set<string> | undefined;
    return selectedNodes !== undefined && selectedNodes.size > 0;
  }

  override canUndo(context: CommandContext): boolean {
    // Copy doesn't modify diagram, no undo needed
    return false;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        copiedNodeIds: this.copiedNodeIds,
        copiedLinkIds: this.copiedLinkIds,
        copiedGroupIds: this.copiedGroupIds,
        options: this.options,
      },
    };
  }

  override getDescription(): string {
    const count = this.copiedNodeIds.length;
    return `Copy ${count} node${count !== 1 ? 's' : ''}`;
  }
}
