// GroupCollapseService — Wave-5 Card 4: real collapse / expand.
//
// Collapse hides a group's members, shrinks the group to a titled placeholder,
// saves child positions, and RE-HOMES every member-incident edge to the group
// boundary — aggregating parallel same-direction crossings between the group
// and a given external node into ONE labelled proxy link.
//
// OWNERSHIP: this is a MODEL-level operation. The group is presented as an
// ordinary node endpoint by spawning a hidden placeholder NodeModel (the
// "group-as-node") through the public DiagramModel/NodeModel/LinkModel APIs, so
// proxy links are ordinary node↔node links the router handles with ZERO router
// changes. No obstacle/path geometry lives here.
//
// The whole operation is reversible from the snapshot stored on the group
// (GroupModel.collapsedState), which serializes — so a collapsed diagram
// round-trips and can still be expanded after a save/load. Commands wrap
// collapse()/expand() to make it a single undo step.

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel, CollapsedState } from '../models/GroupModel';
import type { LinkModel } from '../models/LinkModel';
import { NodeModel } from '../models/NodeModel';

/** Metadata key stamped on a placeholder node so it can be recognised/filtered. */
export const PROXY_NODE_GROUP_KEY = '__collapsedGroupId';
/** Metadata key stamped on a re-homed proxy link. */
export const PROXY_LINK_GROUP_KEY = '__proxyForGroup';

/** Default placeholder box the group shrinks to when collapsed. */
const PLACEHOLDER_WIDTH = 180;
const PLACEHOLDER_HEIGHT = 44;

/** Info handed to a caller's proxy-label hook. */
export interface ProxyLabelInfo {
  group: GroupModel;
  externalNodeId: string;
  /** 'out' = edges flow group→external; 'in' = external→group. */
  direction: 'out' | 'in';
  /** How many raw edges this proxy aggregates. */
  count: number;
}

export interface CollapseOptions {
  /**
   * Label for each aggregated proxy link. Default: the aggregated edge count as
   * a string when >1 (single crossings get no synthetic label). Return '' to
   * suppress.
   */
  proxyLabel?: (info: ProxyLabelInfo) => string;
}

export class GroupCollapseService {
  constructor(private readonly diagram: DiagramModel) {}

  /**
   * Collapse `group`: hide members, save layout, re-home boundary edges to an
   * aggregated proxy, and shrink the group to a placeholder. No-op if the group
   * is already collapsed. Members-less groups collapse "lightly" (flag only, no
   * placeholder) so trivial groups don't spawn stray nodes.
   */
  collapse(group: GroupModel, options?: CollapseOptions): void {
    if (group.isCollapsed) {
      return;
    }

    const memberNodeIds = this.collectMemberNodeIds(group);

    // Nothing to hide → keep it lightweight (old flag-only behaviour), but still
    // record an (empty) snapshot so expand() knows this was a managed collapse.
    if (memberNodeIds.size === 0) {
      group.collapse();
      this.setCollapsedState(group, {
        proxyNodeId: '',
        savedPositions: {},
        hiddenNodes: [],
        removedLinks: [],
        proxyLinks: [],
      });
      return;
    }

    const savedGeometry = {
      position: { x: group.position.x, y: group.position.y },
      size: group.size ? { ...group.size } : undefined,
      bounds: group.bounds ? { ...group.bounds } : undefined,
    };

    // 1) Save member positions (restored verbatim on expand).
    const savedPositions: Record<string, { x: number; y: number }> = {};
    for (const id of memberNodeIds) {
      const node = this.diagram.getNode(id);
      if (node) {
        savedPositions[id] = { x: node.position.x, y: node.position.y };
      }
    }

    // 2) Spawn the placeholder "group-as-node" at the group's top-left.
    const frame = group.getOuterBounds();
    const placeholder = new NodeModel({
      type: 'group-collapsed',
      position: { x: frame.x, y: frame.y },
      size: { width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_HEIGHT },
    });
    placeholder.setMetadata(PROXY_NODE_GROUP_KEY, group.id);
    placeholder.setMetadata('__isGroupProxy', true);
    placeholder.setData('label', group.name);
    this.diagram.addNode(placeholder);

    // 3) Partition member-incident links and aggregate boundary crossings.
    const { removedLinks, proxyLinks } = this.rehomeIncidentLinks(
      group,
      memberNodeIds,
      placeholder,
      options
    );

    // 4) Hide members (they keep their absolute positions, just invisible).
    const hiddenNodes: CollapsedState['hiddenNodes'] = [];
    for (const id of memberNodeIds) {
      const node = this.diagram.getNode(id);
      if (node) {
        hiddenNodes.push({ nodeId: id, prevVisible: node.state.visible !== false });
        node.setState({ visible: false });
      }
    }

    // 5) Flag + shrink the group to the placeholder rectangle.
    group.collapse();
    group.setFrame({
      x: frame.x,
      y: frame.y,
      width: PLACEHOLDER_WIDTH,
      height: PLACEHOLDER_HEIGHT,
    });

    this.setCollapsedState(group, {
      proxyNodeId: placeholder.id,
      savedGeometry,
      savedPositions,
      hiddenNodes,
      removedLinks,
      proxyLinks,
    });

    // Derived port registries changed (removed/re-homed links).
    this.diagram.reconcilePortConnections();
  }

  /**
   * Expand `group` back to exactly its pre-collapse state using the snapshot on
   * the group. No-op if the group is not collapsed / has no snapshot.
   */
  expand(group: GroupModel): void {
    const state = group.collapsedState;
    if (!state) {
      // Collapsed via the bare flag (no managed snapshot) — just unflag.
      if (group.isCollapsed) {
        group.expand();
      }
      return;
    }

    // 1) Restore the boundary survivors' original endpoints + strip proxy label.
    for (const entry of state.proxyLinks) {
      const link = this.diagram.getLink(entry.linkId);
      if (!link) continue;
      if (entry.end === 'source') {
        link.setSourcePort(entry.originalPortId, entry.originalNodeId);
      } else {
        link.setTargetPort(entry.originalPortId, entry.originalNodeId);
      }
      // Remove the synthetic aggregate label(s) we added.
      for (const label of [...link.labels]) {
        if (label.id?.startsWith('proxy-agg-')) {
          link.removeLabel(label.id);
        }
      }
      link.deleteMetadata(PROXY_LINK_GROUP_KEY);
      link.deleteMetadata('__proxyAggregateCount');
    }

    // 2) Re-create the links removed at collapse time (internal + aggregated).
    for (const data of state.removedLinks) {
      this.diagram.restoreLink(data);
    }

    // 3) Remove the placeholder node (its incident survivors were re-homed off it).
    if (state.proxyNodeId) {
      this.diagram.removeNode(state.proxyNodeId);
    }

    // 4) Restore member positions + visibility.
    for (const [nodeId, pos] of Object.entries(state.savedPositions)) {
      this.diagram.getNode(nodeId)?.setPosition(pos.x, pos.y);
    }
    for (const { nodeId, prevVisible } of state.hiddenNodes) {
      this.diagram.getNode(nodeId)?.setState({ visible: prevVisible });
    }

    // 5) Restore the group's exact prior geometry.
    if (state.savedGeometry) {
      group.restoreGeometry(state.savedGeometry);
    }

    group.expand();
    this.setCollapsedState(group, undefined);

    this.diagram.reconcilePortConnections();
  }

  /**
   * Re-home every member-incident link. Internal links (both ends inside the
   * group) are removed (saved for restore). Boundary links are bucketed by
   * (external node, direction); each bucket keeps ONE survivor re-pointed to the
   * placeholder and labelled with the crossing count, and the rest are removed.
   */
  private rehomeIncidentLinks(
    group: GroupModel,
    memberNodeIds: Set<string>,
    placeholder: NodeModel,
    options?: CollapseOptions
  ): { removedLinks: any[]; proxyLinks: CollapsedState['proxyLinks'] } {
    const removedLinks: any[] = [];
    const buckets = new Map<
      string,
      { direction: 'out' | 'in'; externalNodeId: string; links: LinkModel[] }
    >();

    for (const link of this.diagram.getLinks()) {
      const srcId = link.sourceNodeId ?? this.diagram.getNodeByPortId(link.sourcePortId)?.id;
      const tgtId = link.targetNodeId ?? this.diagram.getNodeByPortId(link.targetPortId)?.id;
      const srcIn = !!srcId && memberNodeIds.has(srcId);
      const tgtIn = !!tgtId && memberNodeIds.has(tgtId);

      if (!srcIn && !tgtIn) {
        continue; // untouched
      }
      if (srcIn && tgtIn) {
        // Internal link — hidden with the group; remove and remember.
        removedLinks.push(link.serialize());
        this.diagram.removeLink(link.id);
        continue;
      }

      // Boundary link: exactly one end is a member.
      const direction: 'out' | 'in' = srcIn ? 'out' : 'in';
      const externalNodeId = (srcIn ? tgtId : srcId) as string;
      const key = `${externalNodeId}|${direction}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { direction, externalNodeId, links: [] };
        buckets.set(key, bucket);
      }
      bucket.links.push(link);
    }

    // Collapse each bucket into a single labelled proxy survivor.
    const proxyLinks: CollapsedState['proxyLinks'] = [];
    for (const { direction, externalNodeId, links } of buckets.values()) {
      const survivor = links[0];
      const memberEnd: 'source' | 'target' = direction === 'out' ? 'source' : 'target';
      const originalPortId = memberEnd === 'source' ? survivor.sourcePortId : survivor.targetPortId;
      const originalNodeId = memberEnd === 'source' ? survivor.sourceNodeId : survivor.targetNodeId;

      // Placeholder attachment: source side for outgoing, target side for incoming.
      const placeholderPort =
        direction === 'out'
          ? placeholder.getPortBySide('right')
          : placeholder.getPortBySide('left');
      const portId = placeholderPort?.id ?? placeholder.getPorts()[0]?.id;

      if (memberEnd === 'source') {
        survivor.setSourcePort(portId!, placeholder.id);
      } else {
        survivor.setTargetPort(portId!, placeholder.id);
      }

      // Remove the aggregated-away parallels (saved for restore).
      for (let i = 1; i < links.length; i++) {
        removedLinks.push(links[i].serialize());
        this.diagram.removeLink(links[i].id);
      }

      // Label = count (or user hook).
      const labelText = options?.proxyLabel
        ? options.proxyLabel({ group, externalNodeId, direction, count: links.length })
        : links.length > 1
          ? String(links.length)
          : '';
      survivor.setMetadata(PROXY_LINK_GROUP_KEY, group.id);
      survivor.setMetadata('__proxyAggregateCount', links.length);
      if (labelText) {
        survivor.addLabel({ id: `proxy-agg-${survivor.id}`, text: labelText, position: 0.5 });
      }

      proxyLinks.push({
        linkId: survivor.id,
        end: memberEnd,
        originalPortId,
        originalNodeId,
        aggregatedCount: links.length,
      });
    }

    return { removedLinks, proxyLinks };
  }

  /**
   * All NODE ids contained (transitively) in `group`: direct node members plus
   * every node inside nested member-groups.
   */
  private collectMemberNodeIds(group: GroupModel): Set<string> {
    const out = new Set<string>();
    const walk = (g: GroupModel) => {
      for (const id of g.members) {
        if (this.diagram.getNode(id)) {
          out.add(id);
        } else {
          const child = this.diagram.getGroup(id);
          if (child) walk(child);
        }
      }
    };
    walk(group);
    return out;
  }

  /** Set/clear the snapshot and track it so the change is captured (diff/undo). */
  private setCollapsedState(group: GroupModel, state: CollapsedState | undefined): void {
    group.setCollapsedState(state);
  }
}
