// SemanticMembershipService — Wave-5 Card 7: rule-driven semantic membership.
//
// A group can declare a SERIALIZABLE predicate over node data (MembershipRule —
// a declarative matcher object, never eval'd code). This service keeps that
// group's membership in sync with the data REACTIVELY (subscribes to the model's
// node change/add/remove events — never polls). Auto-membership coexists with
// manual membership: nodes added by a rule are tagged, and only tagged members
// are auto-removed when they stop matching; manual members are never touched.
//
// Capacity/WIP limits (GroupModel.capacity) are enforced through the same
// GroupModel.canAddMember seam GroupMembershipService uses, so a full lane both
// reports a warning state (GroupModel.getWipState) and rejects auto-adds/drops.

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel, MembershipRule, MembershipLeaf } from '../models/GroupModel';
import type { NodeModel } from '../models/NodeModel';

/** Node metadata key holding the group ids a node was AUTO-added to. */
const AUTO_MEMBER_KEY = '__autoMemberOf';

/** Evaluate a declarative rule against a node's `data`. Pure + serializable. */
export function matchesRule(rule: MembershipRule, node: NodeModel): boolean {
  if ('all' in rule) {
    return rule.all.every((r) => matchesRule(r, node));
  }
  if ('any' in rule) {
    return rule.any.some((r) => matchesRule(r, node));
  }
  if ('not' in rule) {
    return !matchesRule(rule.not, node);
  }
  return matchesLeaf(rule, node);
}

function matchesLeaf(leaf: MembershipLeaf, node: NodeModel): boolean {
  const v = node.getData(leaf.field);
  const operand = leaf.value;
  switch (leaf.op) {
    case 'exists':
      return v !== undefined && v !== null;
    case 'eq':
      return v === operand;
    case 'ne':
      return v !== operand;
    case 'in':
      return Array.isArray(operand) && operand.includes(v);
    case 'nin':
      return Array.isArray(operand) && !operand.includes(v);
    case 'gt':
      return typeof v === 'number' && typeof operand === 'number' && v > operand;
    case 'gte':
      return typeof v === 'number' && typeof operand === 'number' && v >= operand;
    case 'lt':
      return typeof v === 'number' && typeof operand === 'number' && v < operand;
    case 'lte':
      return typeof v === 'number' && typeof operand === 'number' && v <= operand;
    case 'matches':
      try {
        return new RegExp(String(operand)).test(String(v ?? ''));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export class SemanticMembershipService {
  private readonly managed = new Set<string>();
  private readonly diagramDisposers: Array<() => void> = [];
  private evaluating = false;

  constructor(private readonly diagram: DiagramModel) {}

  /**
   * Start managing `group`'s auto-membership from its serialized
   * `membershipRule`. Runs an initial sweep and then keeps in sync reactively.
   * No-op if the group has no rule. Returns a disposer that stops managing it.
   */
  register(group: GroupModel): () => void {
    if (!group.membershipRule) {
      return () => undefined;
    }
    this.managed.add(group.id);
    this.ensureSubscribed();
    this.evaluateGroup(group);
    return () => this.managed.delete(group.id);
  }

  /** Stop managing every group and detach all model listeners. */
  dispose(): void {
    this.managed.clear();
    for (const off of this.diagramDisposers.splice(0)) off();
  }

  /** Re-evaluate a single node against every managed rule-group. */
  evaluateNode(node: NodeModel): void {
    if (this.evaluating) return;
    this.evaluating = true;
    try {
      for (const groupId of this.managed) {
        const group = this.diagram.getGroup(groupId);
        if (group?.membershipRule) {
          this.applyMembership(group, node, matchesRule(group.membershipRule, node));
        }
      }
    } finally {
      this.evaluating = false;
    }
  }

  /** Re-evaluate every node against one group's rule. */
  evaluateGroup(group: GroupModel): void {
    if (!group.membershipRule) return;
    const wasEvaluating = this.evaluating;
    this.evaluating = true;
    try {
      for (const node of this.diagram.getNodes()) {
        this.applyMembership(group, node, matchesRule(group.membershipRule, node));
      }
    } finally {
      this.evaluating = wasEvaluating;
    }
  }

  private applyMembership(group: GroupModel, node: NodeModel, matches: boolean): void {
    const isMember = group.members.has(node.id);
    const isAuto = this.autoGroups(node).includes(group.id);

    if (matches && !isMember) {
      // Honor capacity/validation — a full lane simply won't auto-absorb.
      if (group.canAddMember(node.id, this.diagram)) {
        group.addMember(node.id, this.diagram);
        this.tagAuto(node, group.id, true);
      }
      return;
    }

    if (!matches && isMember && isAuto) {
      // Only auto-added members are auto-removed; manual membership is sacred.
      group.removeMember(node.id, this.diagram);
      this.tagAuto(node, group.id, false);
    }
  }

  private autoGroups(node: NodeModel): string[] {
    const raw = node.getMetadata(AUTO_MEMBER_KEY);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  private tagAuto(node: NodeModel, groupId: string, on: boolean): void {
    const current = this.autoGroups(node);
    const next = on
      ? current.includes(groupId)
        ? current
        : [...current, groupId]
      : current.filter((id) => id !== groupId);
    if (next.length === current.length && on) return;
    node.setMetadata(AUTO_MEMBER_KEY, next);
  }

  private ensureSubscribed(): void {
    if (this.diagramDisposers.length > 0) return;
    const onNode = (node: NodeModel) => {
      if (node && !this.diagram.isProxyNode(node)) this.evaluateNode(node);
    };
    this.diagramDisposers.push(this.diagram.on('node:added', onNode));
    this.diagramDisposers.push(this.diagram.on('node:changed', onNode));
  }
}
