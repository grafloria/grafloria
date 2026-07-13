import type { DiagramEngine, NodeModel, LinkModel, Point, Command } from '@grafloria/engine';
import {
  PortModel,
  MacroCommand,
  MoveNodeCommand,
  LinkModel as LinkModelCtor,
  NodeModel as NodeModelCtor,
  AddLinkCommand,
  AddNodeCommand,
  RemoveNodeCommand,
  RemoveLinkCommand,
  SetParentCommand,
} from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import { canConnectPorts } from './snapping';
// wave6/a11y: the graph-aware half of navigation. Focus is a keyboard concern,
// but "where can I go from here" is a TOPOLOGY question — so it is answered by
// the a11y module's pure analysis, not re-derived here.
import { diagramOf, sourceNodeIdOf, targetNodeIdOf } from '../a11y/semantics';
import { incidentEdges, analyseTopology, type Incidence } from '../a11y/graph-topology';
import { positionContext, buildOutline } from '../a11y/diagram-outline';

/**
 * KeyboardNavigationController — a fully keyboard-operable, screen-reader-
 * announced canvas (Card 7, wave4/interaction).
 *
 * No diagramming competitor does this: Mermaid is read-only, and React Flow /
 * JointJS+ / GoJS are pointer-first with, at best, arrow-key nudging. This class
 * owns the whole keyboard model:
 *
 *  - a FOCUS ring that walks nodes and links (Tab / Shift+Tab, arrow keys for
 *    spatial movement) — focus is distinct from selection, as in every native UI;
 *  - arrow-key NUDGE of the selection (Shift = coarse step), committed as ONE
 *    undoable command per key press;
 *  - Enter to edit the focused node's label (the host opens the editor);
 *  - keyboard CONNECT: pick a source port, then a target node/port, commit;
 *  - ARIA ANNOUNCEMENTS for selection and structure changes, which the host pipes
 *    into an `aria-live` region.
 *
 * Framework-agnostic: it emits state + {@link Command}s, and never renders.
 */

export type FocusTargetType = 'node' | 'link';

export interface FocusTarget {
  type: FocusTargetType;
  id: string;
}

/** What the host draws as the visible focus ring. */
export interface FocusRing {
  type: FocusTargetType;
  id: string;
  /** Nodes: the padded world box. */
  bounds?: Rectangle;
  rotation?: number;
  /** Links: the routed polyline. */
  points?: Point[];
  /** The accessible name announced for this target. */
  label: string;
}

export interface Announcement {
  message: string;
  /** `assertive` interrupts the screen reader (errors); default polite. */
  politeness: 'polite' | 'assertive';
  /** Monotonic counter — hosts re-announce only when this changes. */
  seq: number;
}

export type AnnouncementListener = (announcement: Announcement) => void;
/** Remove an announcement listener. (Named to avoid clashing with the
 *  viewport module's `Unsubscribe`, which is re-exported from the same barrel.) */
export type AnnouncementUnsubscribe = () => void;

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export interface KeyboardNavConfig {
  /** Fine nudge step, world units (arrow key). */
  nudgeStep: number;
  /** Coarse nudge step, world units (Shift + arrow). */
  coarseNudgeStep: number;
  /** Focus wraps around at the ends of the order. */
  wrapFocus: boolean;
  /** World padding of the focus ring around a node's box. */
  focusRingPadding: number;
}

export const DEFAULT_KEYBOARD_NAV_CONFIG: KeyboardNavConfig = {
  nudgeStep: 1,
  coarseNudgeStep: 10,
  wrapFocus: true,
  focusRingPadding: 6,
};

/** The keyboard-connect state machine. */
export interface KeyboardConnectState {
  phase: 'source' | 'target';
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId?: string;
  targetPortId?: string;
  /** True when the current source/target pair is a legal link. */
  valid: boolean;
}

export class KeyboardNavigationController {
  protected config: KeyboardNavConfig;
  protected focused: FocusTarget | null = null;
  protected connectState: KeyboardConnectState | null = null;
  protected listeners = new Set<AnnouncementListener>();
  protected lastAnnouncement: Announcement | null = null;
  protected seq = 0;

  constructor(config: Partial<KeyboardNavConfig> = {}) {
    this.config = { ...DEFAULT_KEYBOARD_NAV_CONFIG, ...config };
  }

  getConfig(): KeyboardNavConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<KeyboardNavConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  // ==========================================================================
  // Focus order + movement
  // ==========================================================================

  /**
   * Tab order: nodes in reading order (top-to-bottom, then left-to-right), then
   * links ordered by their source node's place in that same order — so tabbing
   * walks the structure the way a sighted user reads it.
   */
  getFocusOrder(engine: DiagramEngine): FocusTarget[] {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return [];

    const nodes = (diagram.getNodes() as NodeModel[])
      .filter((n) => n.state?.visible !== false && n.behavior?.selectable !== false)
      .sort((a, b) => {
        const ay = a.getBoundingBox().top;
        const by = b.getBoundingBox().top;
        if (Math.abs(ay - by) > 1) return ay - by;
        return a.getBoundingBox().left - b.getBoundingBox().left;
      });

    const rank = new Map<string, number>();
    nodes.forEach((node, i) => rank.set(node.id, i));

    const links = (diagram.getLinks() as LinkModel[]).slice().sort((a, b) => {
      const ar = rank.get(this.sourceNodeIdOf(a, diagram)) ?? Number.MAX_SAFE_INTEGER;
      const br = rank.get(this.sourceNodeIdOf(b, diagram)) ?? Number.MAX_SAFE_INTEGER;
      return ar - br;
    });

    return [
      ...nodes.map((n): FocusTarget => ({ type: 'node', id: n.id })),
      ...links.map((l): FocusTarget => ({ type: 'link', id: l.id })),
    ];
  }

  getFocused(): FocusTarget | null {
    return this.focused ? { ...this.focused } : null;
  }

  /** Set focus (null clears it) and announce the new target. */
  setFocus(target: FocusTarget | null, engine?: DiagramEngine): FocusTarget | null {
    this.focused = target ? { ...target } : null;
    if (target && engine) {
      this.announce(this.describe(engine, target));
    }
    return this.getFocused();
  }

  /** Tab. */
  focusNext(engine: DiagramEngine): FocusTarget | null {
    return this.step(engine, +1);
  }

  /** Shift+Tab. */
  focusPrevious(engine: DiagramEngine): FocusTarget | null {
    return this.step(engine, -1);
  }

  protected step(engine: DiagramEngine, delta: number): FocusTarget | null {
    const order = this.getFocusOrder(engine);
    if (order.length === 0) return this.setFocus(null);

    const index = this.focused
      ? order.findIndex((t) => t.type === this.focused!.type && t.id === this.focused!.id)
      : -1;

    let next = index + delta;
    if (index === -1) {
      next = delta > 0 ? 0 : order.length - 1;
    } else if (next < 0 || next >= order.length) {
      if (!this.config.wrapFocus) return this.getFocused();
      next = (next + order.length) % order.length;
    }

    return this.setFocus(order[next]!, engine);
  }

  /**
   * Spatial arrow-key focus movement across NODES: pick the nearest node whose
   * centre lies in the requested half-plane, preferring small perpendicular
   * offset (the standard "directional focus" heuristic).
   */
  focusDirection(engine: DiagramEngine, direction: NavDirection): FocusTarget | null {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return this.getFocused();

    const nodes = (diagram.getNodes() as NodeModel[]).filter(
      (n) => n.state?.visible !== false && n.behavior?.selectable !== false
    );
    if (nodes.length === 0) return this.getFocused();

    const current = this.focused?.type === 'node' ? diagram.getNode(this.focused.id) : undefined;
    if (!current) {
      // No node focused yet → enter at the first node in reading order.
      const order = this.getFocusOrder(engine).find((t) => t.type === 'node');
      return order ? this.setFocus(order, engine) : this.getFocused();
    }

    const from = centerOf(current);
    let best: { node: NodeModel; score: number } | null = null;

    for (const node of nodes) {
      if (node.id === current.id) continue;
      const to = centerOf(node);
      const dx = to.x - from.x;
      const dy = to.y - from.y;

      const along =
        direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      if (along <= 0) continue; // wrong side

      const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      // Perpendicular drift costs double — keeps focus travelling in a straight line.
      const score = along + across * 2;
      if (!best || score < best.score) {
        best = { node, score };
      }
    }

    if (!best) return this.getFocused();
    return this.setFocus({ type: 'node', id: best.node.id }, engine);
  }

  /** The visible focus ring for the current target (null when nothing is focused). */
  getFocusRing(engine: DiagramEngine): FocusRing | null {
    const diagram = engine?.getDiagram?.();
    const target = this.focused;
    if (!diagram || !target) return null;

    if (target.type === 'node') {
      const node = diagram.getNode(target.id);
      if (!node) return null;
      const box = node.getBoundingBox();
      const pad = this.config.focusRingPadding;
      return {
        type: 'node',
        id: node.id,
        bounds: {
          x: box.left - pad,
          y: box.top - pad,
          width: box.right - box.left + pad * 2,
          height: box.bottom - box.top + pad * 2,
        },
        rotation: node.rotation || 0,
        label: this.describe(engine, target),
      };
    }

    const link = diagram.getLink(target.id);
    if (!link || !link.points || link.points.length < 2) return null;
    return {
      type: 'link',
      id: link.id,
      points: link.points.map((p: Point) => ({ ...p })),
      label: this.describe(engine, target),
    };
  }

  /**
   * Make the focused entity the selection (Space, or Enter on a link).
   * Selection lives on the model, which is what the renderer draws and what the
   * clipboard/delete commands read once the host syncs it to the store.
   */
  selectFocused(engine: DiagramEngine, additive = false): boolean {
    const diagram = engine?.getDiagram?.();
    const target = this.focused;
    if (!diagram || !target) return false;

    if (target.type === 'node') {
      const node = diagram.getNode(target.id);
      if (!node) return false;
      if (additive) {
        diagram.toggleNodeSelection(node);
      } else {
        diagram.selectNode(node);
      }
    } else {
      const link = diagram.getLink(target.id);
      if (!link) return false;
      if (!additive) {
        diagram.clearSelection();
        diagram.getLinks().forEach((l: LinkModel) => {
          if (l.id !== link.id && l.state === 'selected') l.setState('default');
        });
      }
      link.setState(link.state === 'selected' ? 'default' : 'selected');
    }

    this.announceSelection(engine);
    return true;
  }

  // ==========================================================================
  // wave6/a11y (card 2) — GRAPH-AWARE traversal.
  //
  // Wave 4 shipped SPATIAL arrow focus: "give me the nearest node to the right".
  // That is geometry, not topology — and geometry is exactly the information a
  // screen-reader user does not have. What they need is to walk the GRAPH:
  // "from here, where can I go?" These methods follow real edges.
  // ==========================================================================

  /** The edges incident on the focused node, in a stable traversal order. */
  incidentEdgesOfFocus(engine: DiagramEngine): Incidence[] {
    const diagram = diagramOf(engine);
    if (!diagram || this.focused?.type !== 'node') return [];
    return incidentEdges(this.focused.id, diagram);
  }

  /**
   * FOLLOW-EDGE NAVIGATION. From a focused node, step along its Nth incident
   * edge to the node at the far end. From a focused EDGE, step to its endpoints.
   *
   * This is the move that makes a diagram traversable without sight: you are on
   * "Is order valid?", you are told it has 2 outgoing edges, and you walk one.
   */
  followEdge(engine: DiagramEngine, index = 0): FocusTarget | null {
    const diagram = diagramOf(engine);
    if (!diagram || !this.focused) return this.getFocused();

    // On an edge: hop to the node at its far end.
    if (this.focused.type === 'link') {
      const link = diagram.getLink(this.focused.id);
      if (!link) return this.getFocused();
      const targetId = index <= 0
        ? targetNodeIdOf(link, diagram)
        : sourceNodeIdOf(link, diagram);
      if (!targetId || !diagram.getNode(targetId)) return this.getFocused();
      return this.setFocus({ type: 'node', id: targetId }, engine);
    }

    const edges = incidentEdges(this.focused.id, diagram);
    if (edges.length === 0) {
      this.announce(
        `${this.nodeName(diagram.getNode(this.focused.id)!)} has no connections`,
        'polite'
      );
      return this.getFocused();
    }

    const edge = edges[Math.max(0, Math.min(index, edges.length - 1))]!;
    const next = diagram.getNode(edge.otherId);
    if (!next) return this.getFocused();

    // Announce the EDGE we walked, then the node we landed on — otherwise the
    // user teleports with no idea which of three branches they took.
    this.announce(
      `Following ${edge.direction} edge ${index + 1} of ${edges.length}. ` +
        `${this.describe(engine, { type: 'node', id: next.id })}`
    );
    this.focused = { type: 'node', id: next.id };
    return this.getFocused();
  }

  /** Walk to the Nth node this one points AT. */
  followOutgoing(engine: DiagramEngine, index = 0): FocusTarget | null {
    return this.followDirected(engine, 'outgoing', index);
  }

  /** Walk back to the Nth node that points at this one. */
  followIncoming(engine: DiagramEngine, index = 0): FocusTarget | null {
    return this.followDirected(engine, 'incoming', index);
  }

  protected followDirected(
    engine: DiagramEngine,
    direction: 'outgoing' | 'incoming',
    index: number
  ): FocusTarget | null {
    const diagram = diagramOf(engine);
    if (!diagram || this.focused?.type !== 'node') return this.getFocused();

    const edges = incidentEdges(this.focused.id, diagram).filter(
      (e) => e.direction === direction
    );
    if (edges.length === 0) {
      const node = diagram.getNode(this.focused.id);
      this.announce(
        `${node ? this.nodeName(node) : 'Node'} has no ${direction} connections`
      );
      return this.getFocused();
    }

    const edge = edges[Math.max(0, Math.min(index, edges.length - 1))]!;
    const next = diagram.getNode(edge.otherId);
    if (!next) return this.getFocused();

    this.announce(
      `${direction} ${index + 1} of ${edges.length}. ` +
        this.describe(engine, { type: 'node', id: next.id })
    );
    this.focused = { type: 'node', id: next.id };
    return this.getFocused();
  }

  /** Focus the EDGE itself (rather than jumping over it) — so it can be deleted. */
  focusIncidentEdge(engine: DiagramEngine, index = 0): FocusTarget | null {
    const edges = this.incidentEdgesOfFocus(engine);
    if (edges.length === 0) return this.getFocused();
    const edge = edges[Math.max(0, Math.min(index, edges.length - 1))]!;
    return this.setFocus({ type: 'link', id: edge.link.id }, engine);
  }

  /** Jump to the first entry point — "take me back to the start of the flow". */
  focusEntryPoint(engine: DiagramEngine, index = 0): FocusTarget | null {
    const diagram = diagramOf(engine);
    if (!diagram) return this.getFocused();

    const entries = analyseTopology(diagram).entryPoints;
    if (entries.length === 0) return this.getFocused();

    const node = entries[Math.max(0, Math.min(index, entries.length - 1))]!;
    return this.setFocus({ type: 'node', id: node.id }, engine);
  }

  /**
   * The POSITION CONTEXT for the focused node — "node 3 of 12, 2 incoming,
   * 1 outgoing". The orientation a sighted user gets for free from the picture.
   */
  positionContextOfFocus(engine: DiagramEngine): string {
    const diagram = diagramOf(engine);
    if (!diagram || this.focused?.type !== 'node') return '';
    return positionContext(this.focused.id, diagram);
  }

  /** Announce where we are in the graph. Bound to a key in the host. */
  announcePosition(engine: DiagramEngine): Announcement | null {
    const context = this.positionContextOfFocus(engine);
    if (!context) return null;
    const diagram = diagramOf(engine);
    const node = diagram?.getNode(this.focused!.id);
    return this.announce(`${node ? this.nodeName(node) : ''}, ${context}`);
  }

  /** The whole-diagram natural-language summary, announced on entry. */
  announceSummary(engine: DiagramEngine): Announcement | null {
    const diagram = diagramOf(engine);
    if (!diagram) return null;
    return this.announce(buildOutline(diagram).summary);
  }

  // ==========================================================================
  // wave6/a11y (card 3) — keyboard-only EDITING.
  //
  // Wave 4 shipped move (nudge) and connect. The holes it left were delete,
  // duplicate and reparent — so a keyboard-only user could build a graph but
  // never restructure one. Each returns ONE undoable command; the host executes
  // it, exactly as it already does for nudge and connect.
  // ==========================================================================

  /**
   * Delete the selection (or, with nothing selected, the focused entity), as one
   * undoable macro. Deleting a node takes its incident edges with it — leaving
   * dangling links is how a keyboard user silently corrupts a diagram.
   */
  deleteCommand(engine: DiagramEngine): Command | null {
    const diagram = diagramOf(engine);
    if (!diagram) return null;

    const nodes = (diagram.getNodes() as NodeModel[]).filter(
      (n) => n.isSelected() && n.state?.locked !== true
    );
    const links = (diagram.getLinks() as LinkModel[]).filter((l) => l.state === 'selected');

    // Nothing selected → act on focus, which is what the user is looking at.
    if (nodes.length === 0 && links.length === 0 && this.focused) {
      if (this.focused.type === 'node') {
        const node = diagram.getNode(this.focused.id);
        if (node && node.state?.locked !== true) nodes.push(node);
      } else {
        const link = diagram.getLink(this.focused.id);
        if (link) links.push(link);
      }
    }

    if (nodes.length === 0 && links.length === 0) return null;

    const doomedNodeIds = new Set(nodes.map((n) => n.id));
    const doomedLinkIds = new Set(links.map((l) => l.id));

    // Any edge touching a doomed node dies with it.
    for (const link of diagram.getLinks() as LinkModel[]) {
      const s = sourceNodeIdOf(link, diagram);
      const t = targetNodeIdOf(link, diagram);
      if (doomedNodeIds.has(s) || doomedNodeIds.has(t)) doomedLinkIds.add(link.id);
    }

    const macro = new MacroCommand('Delete');
    // Links FIRST — removing a node out from under its links can strand them.
    for (const id of doomedLinkIds) macro.addSteps([new RemoveLinkCommand(id)]);
    for (const id of doomedNodeIds) macro.addSteps([new RemoveNodeCommand(id)]);

    const parts: string[] = [];
    if (doomedNodeIds.size) parts.push(`${doomedNodeIds.size} node${doomedNodeIds.size === 1 ? '' : 's'}`);
    if (doomedLinkIds.size) parts.push(`${doomedLinkIds.size} edge${doomedLinkIds.size === 1 ? '' : 's'}`);
    this.announce(`Deleted ${parts.join(' and ')}`);

    // Focus cannot stay on something that no longer exists.
    if (
      this.focused &&
      ((this.focused.type === 'node' && doomedNodeIds.has(this.focused.id)) ||
        (this.focused.type === 'link' && doomedLinkIds.has(this.focused.id)))
    ) {
      this.focused = null;
    }

    return macro;
  }

  /**
   * Duplicate the focused/selected nodes at an offset, carrying any edge that
   * runs BETWEEN two duplicated nodes (an edge to a node you did not copy has
   * no meaningful counterpart, so it is dropped — the same rule the pointer
   * duplicate uses).
   */
  duplicateCommand(engine: DiagramEngine, offset: Point = { x: 24, y: 24 }): Command | null {
    const diagram = diagramOf(engine);
    if (!diagram) return null;

    let nodes = (diagram.getNodes() as NodeModel[]).filter((n) => n.isSelected());
    if (nodes.length === 0 && this.focused?.type === 'node') {
      const node = diagram.getNode(this.focused.id);
      if (node) nodes = [node];
    }
    if (nodes.length === 0) return null;

    const macro = new MacroCommand(`Duplicate ${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
    const idMap = new Map<string, NodeModel>();

    for (const node of nodes) {
      const clone = new NodeModelCtor({
        type: node.type,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
          z: node.position.z,
        },
        size: { ...node.size },
      });
      // Carry the label and the author's metadata — a duplicate that loses its
      // name is useless, and doubly so to someone who navigates BY name.
      for (const [key, value] of node.metadata) {
        clone.setMetadata(key, value);
      }
      clone.style = { ...node.style };
      if (node.parentId) clone.parentId = node.parentId;

      idMap.set(node.id, clone);
      macro.addSteps([new AddNodeCommand(clone)]);
    }

    for (const link of diagram.getLinks() as LinkModel[]) {
      const s = idMap.get(sourceNodeIdOf(link, diagram));
      const t = idMap.get(targetNodeIdOf(link, diagram));
      if (!s || !t) continue; // an edge leaving the copied set has no counterpart

      const sourcePort = s.getPortBySide?.('right') ?? s.getPorts()[0];
      const targetPort = t.getPortBySide?.('left') ?? t.getPorts()[0];
      if (!sourcePort || !targetPort) continue;

      const clone = new LinkModelCtor(sourcePort.id, targetPort.id);
      clone.setSourcePort(sourcePort.id, s.id);
      clone.setTargetPort(targetPort.id, t.id);
      macro.addSteps([new AddLinkCommand(clone)]);
    }

    this.announce(`Duplicated ${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
    return macro;
  }

  /**
   * REPARENT the focused node into (or out of) a container — the last thing that
   * was pointer-only. `null` unparents.
   *
   * `SetParentCommand` already rejects a cycle; we catch it EARLY so the user
   * gets an assertive "cannot" instead of an exception thrown into the void.
   */
  reparentCommand(engine: DiagramEngine, parentId: string | null): Command | null {
    const diagram = diagramOf(engine);
    if (!diagram || this.focused?.type !== 'node') return null;

    const node = diagram.getNode(this.focused.id);
    if (!node) return null;

    if (parentId) {
      const parent = diagram.getNode(parentId);
      if (!parent) {
        this.announce(`Cannot reparent: container not found`, 'assertive');
        return null;
      }
      if (parentId === node.id) {
        this.announce('Cannot reparent a node into itself', 'assertive');
        return null;
      }
      // Would it create a cycle? (Is the prospective parent already OUR child?)
      const descendants = new Set<string>();
      const walk = (id: string): void => {
        for (const candidate of diagram.getNodes() as NodeModel[]) {
          if (candidate.parentId === id && !descendants.has(candidate.id)) {
            descendants.add(candidate.id);
            walk(candidate.id);
          }
        }
      };
      walk(node.id);
      if (descendants.has(parentId)) {
        this.announce(
          `Cannot move ${this.nodeName(node)} into ${this.nodeName(parent)}: it would create a loop`,
          'assertive'
        );
        return null;
      }

      this.announce(`Moved ${this.nodeName(node)} into ${this.nodeName(parent)}`);
    } else {
      if (!node.parentId) return null; // already top-level — nothing to do
      this.announce(`Moved ${this.nodeName(node)} out of its container`);
    }

    return new SetParentCommand(node.id, parentId ?? undefined);
  }

  /**
   * The containers the focused node could legally be reparented into — what a
   * host puts in a "move to…" list. Excludes itself and its own descendants.
   */
  reparentCandidates(engine: DiagramEngine): NodeModel[] {
    const diagram = diagramOf(engine);
    if (!diagram || this.focused?.type !== 'node') return [];

    const node = diagram.getNode(this.focused.id);
    if (!node) return [];

    const descendants = new Set<string>([node.id]);
    const walk = (id: string): void => {
      for (const candidate of diagram.getNodes() as NodeModel[]) {
        if (candidate.parentId === id && !descendants.has(candidate.id)) {
          descendants.add(candidate.id);
          walk(candidate.id);
        }
      }
    };
    walk(node.id);

    return (diagram.getNodes() as NodeModel[]).filter(
      (n) => !descendants.has(n.id) && n.id !== node.parentId
    );
  }

  // ==========================================================================
  // Nudge
  // ==========================================================================

  /** World delta for an arrow key (null when the key is not an arrow). */
  nudgeDelta(key: string, coarse = false): Point | null {
    const step = coarse ? this.config.coarseNudgeStep : this.config.nudgeStep;
    switch (key) {
      case 'ArrowLeft':
        return { x: -step, y: 0 };
      case 'ArrowRight':
        return { x: step, y: 0 };
      case 'ArrowUp':
        return { x: 0, y: -step };
      case 'ArrowDown':
        return { x: 0, y: step };
      default:
        return null;
    }
  }

  /**
   * Move the selection (or, with nothing selected, the focused node) by a world
   * delta, as ONE undoable command per key press. Locked / undraggable nodes are
   * skipped; returns null when there is nothing to move.
   */
  nudgeCommand(engine: DiagramEngine, dx: number, dy: number): Command | null {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return null;

    let nodes = (diagram.getSelectedNodes() as NodeModel[]).filter((n) => n.isDraggable());
    if (nodes.length === 0 && this.focused?.type === 'node') {
      const node = diagram.getNode(this.focused.id);
      if (node?.isDraggable()) nodes = [node];
    }
    if (nodes.length === 0) return null;

    const commands = nodes.map(
      (node) =>
        new MoveNodeCommand(
          node.id,
          { x: node.position.x + dx, y: node.position.y + dy, z: node.position.z },
          { x: node.position.x, y: node.position.y, z: node.position.z },
          { mergeable: false }
        )
    );

    this.announce(
      `Moved ${
        commands.length === 1 ? this.nodeName(nodes[0]!) : `${commands.length} nodes`
      } by ${Math.round(dx)}, ${Math.round(dy)}`
    );

    if (commands.length === 1) return commands[0]!;
    const macro = new MacroCommand(`Nudge ${commands.length} Nodes`);
    macro.addSteps(commands);
    return macro;
  }

  // ==========================================================================
  // Keyboard connect
  // ==========================================================================

  getConnectState(): KeyboardConnectState | null {
    return this.connectState ? { ...this.connectState } : null;
  }

  isConnecting(): boolean {
    return this.connectState !== null;
  }

  /**
   * Start a keyboard connection from the focused node: phase 1 picks the SOURCE
   * port (arrow keys cycle it), Enter confirms and moves to phase 2, where Tab
   * cycles the target node and arrows its port. Returns false when the focused
   * node has no connectable port.
   */
  beginConnect(engine: DiagramEngine): boolean {
    const diagram = engine?.getDiagram?.();
    const target = this.focused;
    if (!diagram || target?.type !== 'node') return false;

    const node = diagram.getNode(target.id);
    if (!node || node.behavior?.connectable === false) return false;

    const ports = this.connectablePorts(node);
    if (ports.length === 0) {
      this.announce('No connectable ports on this node', 'assertive');
      return false;
    }

    this.connectState = {
      phase: 'source',
      sourceNodeId: node.id,
      sourcePortId: ports[0]!.id,
      valid: false,
    };
    this.announce(
      `Connect from ${this.nodeName(node)}, port ${this.portName(
        ports[0]!
      )}. Arrow keys change port, Enter to choose target.`
    );
    return true;
  }

  /** Cycle the port being picked in the current phase. */
  cyclePort(engine: DiagramEngine, delta: number): boolean {
    const state = this.connectState;
    const diagram = engine?.getDiagram?.();
    if (!state || !diagram) return false;

    const nodeId = state.phase === 'source' ? state.sourceNodeId : state.targetNodeId;
    if (!nodeId) return false;
    const node = diagram.getNode(nodeId);
    if (!node) return false;

    const ports = this.connectablePorts(node);
    if (ports.length === 0) return false;

    const currentId = state.phase === 'source' ? state.sourcePortId : state.targetPortId;
    const index = Math.max(
      0,
      ports.findIndex((p) => p.id === currentId)
    );
    const next = ports[(index + delta + ports.length) % ports.length]!;

    if (state.phase === 'source') {
      state.sourcePortId = next.id;
    } else {
      state.targetPortId = next.id;
    }
    this.refreshConnectValidity(engine);
    this.announce(
      `Port ${this.portName(next)}${
        state.phase === 'target'
          ? state.valid
            ? ', valid target'
            : ', not a valid target'
          : ''
      }`
    );
    return true;
  }

  /** Cycle the TARGET node (Tab during phase 2). */
  cycleTargetNode(engine: DiagramEngine, delta: number): boolean {
    const state = this.connectState;
    const diagram = engine?.getDiagram?.();
    if (!state || !diagram || state.phase !== 'target') return false;

    const candidates = this.getFocusOrder(engine)
      .filter((t) => t.type === 'node' && t.id !== state.sourceNodeId)
      .map((t) => diagram.getNode(t.id))
      .filter((n): n is NodeModel => !!n && n.behavior?.connectable !== false);
    if (candidates.length === 0) return false;

    const index = Math.max(
      0,
      candidates.findIndex((n) => n.id === state.targetNodeId)
    );
    const next = candidates[(index + delta + candidates.length) % candidates.length]!;

    state.targetNodeId = next.id;
    state.targetPortId = this.connectablePorts(next)[0]?.id;
    this.refreshConnectValidity(engine);
    this.announce(
      `Target ${this.nodeName(next)}${state.valid ? ', valid' : ', not a valid target'}`
    );
    return true;
  }

  /**
   * Enter: phase 1 → confirm the source and enter phase 2 (seeding the first
   * candidate target); phase 2 → COMMIT, returning the undoable AddLinkCommand
   * (null when the pair is not legal).
   */
  confirmConnect(engine: DiagramEngine): Command | null {
    const state = this.connectState;
    const diagram = engine?.getDiagram?.();
    if (!state || !diagram) return null;

    if (state.phase === 'source') {
      state.phase = 'target';
      const first = this.getFocusOrder(engine)
        .filter((t) => t.type === 'node' && t.id !== state.sourceNodeId)
        .map((t) => diagram.getNode(t.id))
        .find((n): n is NodeModel => !!n && n.behavior?.connectable !== false);
      if (!first) {
        this.announce('No other node to connect to', 'assertive');
        this.connectState = null;
        return null;
      }
      state.targetNodeId = first.id;
      state.targetPortId = this.connectablePorts(first)[0]?.id;
      this.refreshConnectValidity(engine);
      this.announce(
        `Choose target. ${this.nodeName(first)}${
          state.valid ? ', valid' : ', not a valid target'
        }. Tab cycles nodes, Enter connects.`
      );
      return null;
    }

    // Commit.
    this.refreshConnectValidity(engine);
    if (!state.valid || !state.targetPortId || !state.targetNodeId) {
      this.announce('Cannot connect these ports', 'assertive');
      return null;
    }

    const link = new LinkModelCtor(state.sourcePortId, state.targetPortId);
    link.setSourcePort(state.sourcePortId, state.sourceNodeId);
    link.setTargetPort(state.targetPortId, state.targetNodeId);

    const sourceNode = diagram.getNode(state.sourceNodeId);
    const targetNode = diagram.getNode(state.targetNodeId);
    this.announce(
      `Connected ${sourceNode ? this.nodeName(sourceNode) : 'source'} to ${
        targetNode ? this.nodeName(targetNode) : 'target'
      }`
    );

    this.connectState = null;
    return new AddLinkCommand(link);
  }

  /** Escape. */
  cancelConnect(): void {
    if (!this.connectState) return;
    this.connectState = null;
    this.announce('Connection cancelled');
  }

  /** Re-evaluate the source/target pair against the shared connection rule. */
  protected refreshConnectValidity(engine: DiagramEngine): void {
    const state = this.connectState;
    const diagram = engine?.getDiagram?.();
    if (!state || !diagram) return;

    if (state.phase === 'source' || !state.targetNodeId || !state.targetPortId) {
      state.valid = false;
      return;
    }

    const sourceNode = diagram.getNode(state.sourceNodeId);
    const targetNode = diagram.getNode(state.targetNodeId);
    const sourcePort = sourceNode?.getPort(state.sourcePortId);
    const targetPort = targetNode?.getPort(state.targetPortId);
    if (!sourceNode || !targetNode || !sourcePort || !targetPort) {
      state.valid = false;
      return;
    }

    state.valid = canConnectPorts(sourcePort, targetPort, sourceNode, targetNode, engine, diagram);
  }

  protected connectablePorts(node: NodeModel): PortModel[] {
    return node.getPorts();
  }

  // ==========================================================================
  // Announcements (the aria-live seam)
  // ==========================================================================

  onAnnounce(listener: AnnouncementListener): AnnouncementUnsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLastAnnouncement(): Announcement | null {
    return this.lastAnnouncement ? { ...this.lastAnnouncement } : null;
  }

  announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): Announcement {
    const announcement: Announcement = { message, politeness, seq: ++this.seq };
    this.lastAnnouncement = announcement;
    this.listeners.forEach((listener) => listener(announcement));
    return announcement;
  }

  /** "2 nodes and 1 link selected" — announced whenever the selection changes. */
  announceSelection(engine: DiagramEngine): Announcement | null {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return null;

    const nodes = (diagram.getNodes() as NodeModel[]).filter((n) => n.isSelected());
    const links = (diagram.getLinks() as LinkModel[]).filter((l) => l.state === 'selected');

    if (nodes.length === 0 && links.length === 0) {
      return this.announce('Selection cleared');
    }
    // `describe()` already ends in ", selected" for a selected entity — appending
    // another "selected" here made the screen reader say it twice.
    if (nodes.length === 1 && links.length === 0) {
      return this.announce(this.describe(engine, { type: 'node', id: nodes[0]!.id }));
    }
    if (nodes.length === 0 && links.length === 1) {
      return this.announce(this.describe(engine, { type: 'link', id: links[0]!.id }));
    }

    const parts: string[] = [];
    if (nodes.length) parts.push(`${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
    if (links.length) parts.push(`${links.length} link${links.length === 1 ? '' : 's'}`);
    return this.announce(`${parts.join(' and ')} selected`);
  }

  /** "Node Start added. 4 nodes, 3 links." — for structure changes. */
  announceStructure(engine: DiagramEngine, change: string): Announcement | null {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return null;
    const nodes = diagram.getNodes().length;
    const links = diagram.getLinks().length;
    return this.announce(
      `${change}. ${nodes} node${nodes === 1 ? '' : 's'}, ${links} link${links === 1 ? '' : 's'}.`
    );
  }

  /**
   * The accessible name of a target: what a screen reader reads on focus, and
   * what the host puts in `aria-label` on the rendered element.
   */
  describe(engine: DiagramEngine, target: FocusTarget): string {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return '';

    if (target.type === 'node') {
      const node = diagram.getNode(target.id);
      if (!node) return '';
      const links = diagram
        .getLinks()
        .filter(
          (l: LinkModel) =>
            this.sourceNodeIdOf(l, diagram) === node.id ||
            this.targetNodeIdOf(l, diagram) === node.id
        ).length;
      const bits = [`${node.type} node`, this.nodeName(node)];
      bits.push(`${links} connection${links === 1 ? '' : 's'}`);
      if (node.isSelected()) bits.push('selected');
      if (node.state?.locked) bits.push('locked');
      return bits.join(', ');
    }

    const link = diagram.getLink(target.id);
    if (!link) return '';
    const source = diagram.getNode(this.sourceNodeIdOf(link, diagram));
    const target2 = diagram.getNode(this.targetNodeIdOf(link, diagram));
    const bits = [
      'link',
      `from ${source ? this.nodeName(source) : 'unknown'}`,
      `to ${target2 ? this.nodeName(target2) : 'unknown'}`,
    ];
    if (link.state === 'selected') bits.push('selected');
    return bits.join(', ');
  }

  /** Human name of a node: its label, else its type + short id. */
  nodeName(node: NodeModel): string {
    const label = node.getMetadata('label');
    if (typeof label === 'string' && label.trim().length > 0) return label;
    return `${node.type} ${node.id.slice(0, 4)}`;
  }

  protected portName(port: PortModel): string {
    const label = port.getMetadata?.('label');
    if (typeof label === 'string' && label.trim().length > 0) return label;
    return `${port.alignment?.side ?? 'port'} ${port.type}`;
  }

  protected sourceNodeIdOf(link: LinkModel, diagram: any): string {
    return link.sourceNodeId ?? diagram.getNodeByPortId(link.sourcePortId)?.id ?? '';
  }

  protected targetNodeIdOf(link: LinkModel, diagram: any): string {
    return link.targetNodeId ?? diagram.getNodeByPortId(link.targetPortId)?.id ?? '';
  }

  dispose(): void {
    this.listeners.clear();
    this.focused = null;
    this.connectState = null;
  }
}

function centerOf(node: NodeModel): Point {
  const box = node.getBoundingBox();
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}
