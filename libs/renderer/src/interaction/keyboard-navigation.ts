import type { DiagramEngine, NodeModel, LinkModel, Point, Command } from '@grafloria/engine';
import {
  PortModel,
  MacroCommand,
  MoveNodeCommand,
  LinkModel as LinkModelCtor,
  AddLinkCommand,
} from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import { canConnectPorts } from './snapping';

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
