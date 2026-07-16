// DiagramEngine - Main orchestrator for diagram functionality

import { EventBus } from '../events/EventBus';
import { DiagramStore } from '../state/DiagramStore';
import { CommandManager } from '../commands/CommandManager';
import { PluginManager } from '../plugins/PluginManager';
import { TypeRegistry } from '../validation/TypeRegistry';
import { ValidationEngine } from '../validation/ValidationEngine';
import { DiagramSerializer, SerializedDiagram } from '../serialization/Serializer';
import { PerformanceMonitor, PerformanceReport } from '../performance/PerformanceMonitor';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { GroupModel } from '../models/GroupModel'; // Phase 1.6c
import { AddNodeCommand } from '../commands/basic/AddNodeCommand';
import { RemoveNodeCommand } from '../commands/basic/RemoveNodeCommand';
// Wave 6 (Card 7): dynamic auto-ports — spawned/retired through the command layer.
import type { Command } from '../commands/Command';
import { buildDynamicPortCommands } from '../ports/dynamic-ports';
import { AddLinkCommand } from '../commands/basic/AddLinkCommand';
import { RemoveLinkCommand } from '../commands/basic/RemoveLinkCommand';
import { AddGroupCommand, RemoveGroupCommand, AddToGroupCommand, RemoveFromGroupCommand, ExpandGroupCommand, CollapseGroupCommand } from '../commands/basic'; // Phase 1.6c
import type { CollapseOptions } from '../interaction/GroupCollapseService'; // Wave-5 Card 4
import { SetLayoutCommand, SetFlexItemCommand, SetGridItemCommand } from '../commands/basic'; // Phase 1.7
import { CopyCommand, PasteCommand, DuplicateCommand, DeleteSelectionCommand } from '../commands/basic'; // Phase 1.8
import { ClipboardManager } from '../clipboard/ClipboardManager'; // Phase 1.8
import { SelectionManager } from '../selection/SelectionManager'; // Phase 1.8a
import { DiagramMode, isValidDiagramMode, ModeChangeEvent } from './DiagramMode';
import { ModeManager } from './ModeManager';
// Phase 1: Interaction modes
import { ConnectionStateManager } from '../state/ConnectionStateManager';
import type { InteractionConfig } from '../config/InteractionConfig';
import { DEFAULT_INTERACTION_CONFIG } from '../config/InteractionConfig';
// Routing imports
import { RoutingEngine } from '../routing/RoutingEngine';
import { LiveReroutingEngine } from '../routing/LiveReroutingEngine'; // Phase 0.2
import { ObstacleMapBuilder } from '../routing/ObstacleMapBuilder';
import { StraightRouter } from '../routing/algorithms/StraightRouter';
import { OrthogonalRouter } from '../routing/algorithms/OrthogonalRouter';
import { AStarRouter } from '../routing/algorithms/AStarRouter';
import { DijkstraRouter } from '../routing/algorithms/DijkstraRouter';
import { VisibilityGraphRouter } from '../routing/algorithms/VisibilityGraphRouter';
import type {
  ModeGuardFunction,
  ModeGuardBlockedEvent,
  ModeViewportSettings,
  ViewportSettingsChangedEvent,
  ModeHistoryEntry,
  ModeAnalytics,
  ModeChangeHook,
  ModeChangeContext,
} from './DiagramModeTypes';
import type { Point, Size, Viewport } from '../types';
import type { Plugin } from '../types';
import type { ValidationResult } from '../validation/ValidationEngine';
import type { NodeTypeDefinition, LinkTypeDefinition, PortTypeDefinition, GroupTypeDefinition } from '../validation/TypeRegistry'; // Phase 2
// Wave 7 (Auto-layout) — Card 0: the unified layout entry point.
import {
  LayoutRegistry,
  createAutoLayout,
  DEFAULT_LAYOUT_NAME,
  fromAdapter,
  createBuiltInLayoutAdapters,
  translateOptions,
  type UnifiedLayoutOptions,
  type UnifiedLayoutResult,
  createDefaultLayoutRegistry,
  runLayout,
} from '../layout/layout-registry';
import { DEFAULT_LAYOUT_SEED } from '../layout/rng';
import { createLayeredLayout } from '../layout/sugiyama/layered-layout';
import {
  alignToPrevious,
  constraintsForStrategy,
  measureMovement,
  planTween,
  type IncrementalOptions,
  type MovementReport,
  type Positions,
  type TweenPlan,
} from '../layout/incremental/mental-map';
// Wave 7 — Card 4: nested container / subgraph layout.
import { CompoundLayoutService } from '../layout/CompoundLayoutService';
// Wave 7 — Card 3: off-main-thread layout.
import { LayoutHost, type LayoutPort } from '../layout/layout-host';
import { serializeGraph } from '../layout/layout-graph';
import type { LayoutType, LayoutConfig, FlexItemConfig, GridItemConfig } from '../types/layout.types'; // Phase 1.7

export interface DiagramEngineConfig {
  plugins?: Plugin[];
  mode?: DiagramMode;
  performance?: {
    enableMonitoring?: boolean;
    enableProfiling?: boolean;
    warnThreshold?: number;
  };
  validation?: {
    realTime?: boolean;
    strict?: boolean;
  };
  history?: {
    maxCommands?: number;
    maxSnapshots?: number;
  };
  // Phase 1: Interaction configuration
  interaction?: Partial<InteractionConfig>;
}

/**
 * Wave 2 (Edges & links): transient state for the endpoint-reconnection live
 * preview. Set by the interaction layer while an endpoint handle is being
 * dragged; read by the renderer to draw a ghost link from the stationary
 * endpoint to the cursor. Deliberately separate from {@link ConnectionStateManager}
 * (which owns NEW-link creation) so the two previews never double-render.
 */
export interface ReconnectionPreview {
  /** Id of the link whose endpoint is being reconnected. */
  linkId: string;
  /** Which endpoint the cursor is dragging (the OTHER end stays fixed). */
  endpoint: 'source' | 'target';
  /** Current cursor position in world coordinates. */
  mousePoint: Point;
  /** Whether the port/node currently under the cursor is a valid drop target. */
  isValid: boolean;
}

/**
 * wave12/connect-ergonomics: the port pair a proximity-connect DROP would link,
 * while a node drag is inside the radius. The renderer reads this to draw the
 * proposed wire itself — highlighting only the two ports left the proposal
 * nearly invisible (live report: "the wire isn't showing"). Same seam shape as
 * {@link ReconnectionPreview}: interaction layer writes, renderer reads,
 * cleared on drop/cancel.
 */
export interface ProximityPreview {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

/**
 * wave15/helper-lines: one drawable snap-guide segment, in world coordinates.
 * The interaction layer computes alignment / equal-spacing guides during a
 * node drag and publishes them here; the renderer draws them as dashed
 * overlay lines (spacing segments may carry a gap label). Cleared (null) when
 * the drag ends or nothing is within snapping distance.
 */
export interface SnapGuideSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'alignment' | 'spacing';
  label?: string;
}

export class DiagramEngine {
  // Core systems
  readonly eventBus: EventBus;
  readonly store: DiagramStore;
  readonly commandManager: CommandManager;
  readonly pluginManager: PluginManager;
  readonly typeRegistry: TypeRegistry;
  readonly validationEngine: ValidationEngine;
  readonly serializer: DiagramSerializer;
  readonly performanceMonitor: PerformanceMonitor;
  readonly modeManager: ModeManager;
  readonly clipboardManager: ClipboardManager; // Phase 1.8
  readonly selectionManager: SelectionManager; // Phase 1.8a
  readonly routingEngine: RoutingEngine; // Routing system for link paths

  // Phase 0.2: Live rerouting engine
  private liveReroutingEngine: LiveReroutingEngine | null = null;

  // Current diagram
  private diagram: DiagramModel | null = null;

  // Disposer functions for the engine's own listeners on the attached diagram.
  // Stored on attach and invoked on detach so switching diagrams unsubscribes
  // cleanly without accumulating duplicate handlers (and without touching the
  // diagram's contents).
  private diagramDisposers: Array<() => void> = [];

  // Configuration
  private config: DiagramEngineConfig;

  // Phase 1: Interaction configuration and state
  private interactionConfig: InteractionConfig;
  private connectionStateManager: ConnectionStateManager;

  // Wave 6 (Card 7): re-entry guard for the dynamic-port allocator.
  private reconcilingDynamicPorts = false;

  // Wave 2 (Edges & links): transient endpoint-reconnection preview (see type).
  private reconnectionPreview: ReconnectionPreview | null = null;
  private proximityPreview: ProximityPreview | null = null;
  private snapGuides: SnapGuideSegment[] | null = null;

  // State
  private initialized: boolean = false;
  private destroyed: boolean = false;

  constructor(config: DiagramEngineConfig = {}) {
    this.config = config;

    // Initialize core systems
    this.eventBus = new EventBus();
    this.store = new DiagramStore();

    // Phase 1: Initialize interaction config
    this.interactionConfig = {
      ...DEFAULT_INTERACTION_CONFIG,
      ...config.interaction,
    };

    // Phase 1: Initialize connection state manager
    this.connectionStateManager = new ConnectionStateManager(this.eventBus);

    // CRITICAL FIX: Listen for connection complete events and create the actual link
    this.eventBus.on('connection:complete', async (event: any) => {
      if (this.diagram && event.sourcePort && event.targetPort) {
        const sourcePort = event.sourcePort;
        const targetPort = event.targetPort;

        // Find the nodes that own these ports
        const nodes = this.diagram.getNodes();
        let sourceNode: any = null;
        let targetNode: any = null;

        for (const node of nodes) {
          if (node.getPort(sourcePort.id)) {
            sourceNode = node;
          }
          if (node.getPort(targetPort.id)) {
            targetNode = node;
          }
          if (sourceNode && targetNode) break;
        }

        if (sourceNode && targetNode) {
          // Determine path type from config
          // Map ConnectionLineStyle enum to LinkModel pathType
          let pathType: 'direct' | 'smooth' | 'orthogonal' | 'bezier' = 'smooth';

          switch (this.interactionConfig.connectionLineStyle) {
            case 'bezier':
              pathType = 'bezier';
              break;
            case 'step':
              pathType = 'orthogonal';
              break;
            case 'straight':
              pathType = 'direct';
              break;
            default:
              pathType = 'smooth';
          }

          console.log(`🔗 Creating link with pathType: ${pathType} (from connectionLineStyle: ${this.interactionConfig.connectionLineStyle})`);

          // Create the link manually (same logic as createSmartLink)
          const link = new LinkModel(sourcePort.id, targetPort.id, pathType);
          link.sourceNodeId = sourceNode.id;
          link.targetNodeId = targetNode.id;

          // Register connections in ports
          sourcePort.addConnection(link.id, 'source');
          targetPort.addConnection(link.id, 'target');

          // Calculate initial path using RoutingEngine
          const sourcePos = sourcePort.getAbsolutePosition(sourceNode.getBoundingBox());
          const targetPos = targetPort.getAbsolutePosition(targetNode.getBoundingBox());

          // Get port directions for routing
          const sourceDirection = sourcePort.alignment?.side;
          const targetDirection = targetPort.alignment?.side;

          // Use RoutingEngine to calculate path with obstacle avoidance
          await this.generateLinkPathWithRouting(link, sourcePos, targetPos, sourceDirection, targetDirection, sourceNode, targetNode);

          // Add link to diagram
          this.diagram.addLink(link);

          console.log('✅ Link created successfully:', link.id, 'from', sourcePort.id, 'to', targetPort.id);
        } else {
          console.error('❌ Failed to find nodes for ports');
        }
      }
    });

    // Initialize ModeManager with context provider
    this.modeManager = new ModeManager(
      this.eventBus,
      () => ({
        engine: this,
        diagram: this.diagram,
      }),
      config.mode
    );

    const context = {
      diagram: this.diagram!,
      eventBus: this.eventBus,
      store: this.store,
      engine: this,
    };

    this.commandManager = new CommandManager(context, this.eventBus);
    this.pluginManager = new PluginManager(this, this.eventBus);
    this.typeRegistry = new TypeRegistry();
    this.validationEngine = new ValidationEngine(this.typeRegistry, this.eventBus); // Phase 1 - Pass EventBus
    this.serializer = new DiagramSerializer();
    this.performanceMonitor = new PerformanceMonitor(config.performance);
    this.routingEngine = new RoutingEngine(); // Initialize routing engine with LRU cache
    this.clipboardManager = new ClipboardManager(); // Phase 1.8
    this.selectionManager = new SelectionManager(null, this.store, this.eventBus); // Phase 1.8a

    // Configure systems
    this.configureSystems();

    // Install plugins
    this.installPlugins();

    // Mark as initialized
    this.initialized = true;
    this.eventBus.emit('engine:initialized');
  }

  /**
   * Get current diagram
   */
  getDiagram(): DiagramModel | null {
    return this.diagram;
  }

  /**
   * Get configuration (Phase 1 - Critical Fixes)
   */
  getConfig(): DiagramEngineConfig {
    return this.config;
  }

  /**
   * Phase 1: Get interaction configuration
   * Returns the current interaction mode settings
   */
  getInteractionConfig(): InteractionConfig {
    return { ...this.interactionConfig };
  }

  /**
   * Phase 1: Set interaction configuration
   * Updates interaction mode settings and emits event
   */
  setInteractionConfig(config: Partial<InteractionConfig>): void {
    const oldConfig = { ...this.interactionConfig };
    this.interactionConfig = {
      ...this.interactionConfig,
      ...config,
    };

    this.eventBus.emit('config:interaction-changed', {
      oldConfig,
      newConfig: this.interactionConfig,
    });
  }

  /**
   * Phase 1: Get connection state manager
   * Used for managing connection drag operations
   */
  getConnectionStateManager(): ConnectionStateManager {
    return this.connectionStateManager;
  }

  /**
   * Wave 2 (Edges & links): current endpoint-reconnection preview, or null when
   * no endpoint is being dragged. The renderer reads this to draw a ghost link.
   */
  getReconnectionPreview(): ReconnectionPreview | null {
    return this.reconnectionPreview;
  }

  /**
   * Wave 2 (Edges & links): set (or clear, with null) the endpoint-reconnection
   * preview. Called by the interaction layer on start/move/end of an endpoint
   * drag. Does not emit — the interaction layer already triggers re-render.
   */
  setReconnectionPreview(preview: ReconnectionPreview | null): void {
    this.reconnectionPreview = preview;
  }

  /** The proximity-connect proposal the renderer draws as a live wire, or null. */
  getProximityPreview(): ProximityPreview | null {
    return this.proximityPreview;
  }

  /** Set (or clear, with null) the proximity-connect proposal. Does not emit —
   *  the node drag that drives it already triggers re-renders. */
  setProximityPreview(preview: ProximityPreview | null): void {
    this.proximityPreview = preview;
  }

  /** The live snap-guide segments a node drag is showing, or null. */
  getSnapGuides(): SnapGuideSegment[] | null {
    return this.snapGuides;
  }

  /** Set (or clear, with null) the live snap guides. Does not emit — the node
   *  drag that drives them already triggers re-renders. */
  setSnapGuides(guides: SnapGuideSegment[] | null): void {
    this.snapGuides = guides;
  }

  /**
   * Get routing engine
   * Used for calculating link paths with various algorithms
   */
  getRoutingEngine(): RoutingEngine {
    return this.routingEngine;
  }

  /**
   * Phase 0.2: Enable live rerouting
   * Automatically updates link paths when nodes move or resize
   */
  enableLiveRerouting(): void {
    if (!this.diagram) {
      console.warn('Cannot enable live rerouting: No diagram loaded');
      return;
    }

    if (!this.liveReroutingEngine) {
      this.liveReroutingEngine = new LiveReroutingEngine(this.routingEngine, this.diagram);
    }

    this.liveReroutingEngine.enable();
    console.log('✅ Live rerouting enabled');
  }

  /**
   * Phase 0.2: Disable live rerouting
   */
  disableLiveRerouting(): void {
    if (this.liveReroutingEngine) {
      this.liveReroutingEngine.disable();
      console.log('⚠️ Live rerouting disabled');
    }
  }

  /**
   * Phase 0.2: Get live rerouting engine
   */
  getLiveReroutingEngine(): LiveReroutingEngine | null {
    return this.liveReroutingEngine;
  }

  /**
   * Set diagram
   */
  setDiagram(diagram: DiagramModel | null): void {
    const oldDiagram = this.diagram;

    if (oldDiagram) {
      this.detachDiagram(oldDiagram);
    }

    this.diagram = diagram;

    if (diagram) {
      this.attachDiagram(diagram);
      // Wave 9 — Card 7: a diagram attached to an engine that is ALREADY in
      // VIEW/PRESENTATION mode must come up LOCKED. Without this, read-only would
      // depend on whether the host happened to call setMode() before or after
      // loading the document — a race the host cannot see.
      this.syncReadonlyLock();
    }

    this.store.set('diagram', diagram);
    this.eventBus.emit('diagram:changed', { oldDiagram, newDiagram: diagram });

    // Update command context
    this.commandManager.updateContext({ diagram });

    // Update selection manager diagram reference (Phase 1.8a)
    this.selectionManager.setDiagram(diagram);

    // Wave 6 (Card 6): the connection manager needs the graph to work out which
    // ports are valid targets. Without this its `calculateValidTargets()` has
    // nothing to walk — which is exactly why that method was a no-op stub and
    // `validTargetPorts` was empty for the whole life of the feature.
    this.connectionStateManager.setDiagram(diagram);
  }

  /**
   * Create new diagram
   */
  createDiagram(name: string = 'Untitled'): DiagramModel {
    const diagram = new DiagramModel(name);
    this.setDiagram(diagram);
    this.eventBus.emit('diagram:created', diagram);
    return diagram;
  }

  /**
   * Clear diagram
   */
  clearDiagram(): void {
    if (this.diagram) {
      this.diagram.clear();
      this.store.set('selectedNodes', new Set());
      this.store.set('selectedLinks', new Set());
      this.commandManager.clear();
      this.eventBus.emit('diagram:cleared');
    }
  }

  /**
   * Add node (from config)
   */
  async addNode(config: {
    type: string;
    position: Point;
    size?: Size;
    data?: any;
  }): Promise<NodeModel>;

  /**
   * Add node (pre-created NodeModel) (Phase 1.6b)
   */
  async addNode(node: NodeModel): Promise<NodeModel>;

  /**
   * Add node implementation
   */
  async addNode(configOrNode: { type: string; position: Point; size?: Size; data?: any } | NodeModel): Promise<NodeModel> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    return this.performanceMonitor.measure('addNode', async () => {
      // Determine if we received a config or a NodeModel
      let node: NodeModel;
      if (configOrNode instanceof NodeModel) {
        node = configOrNode;
      } else {
        node = new NodeModel(configOrNode);
      }

      // Validate
      if (this.config.validation?.strict) {
        const validation = this.validationEngine.validateNode(node);
        if (!validation.valid) {
          throw new Error(`Invalid node: ${validation.errors[0]?.message}`);
        }
      }

      // Add via command
      const command = new AddNodeCommand(node);
      await this.commandManager.execute(command);

      // Return the node that was actually added (might be deserialized)
      return (this.diagram && this.diagram.getNode(node.id)) || node;
    });
  }

  /**
   * Remove node
   *
   * Wave 14: async + awaited, mirroring removeGroup(). The execute() promise
   * used to float — a command failure became an unhandled rejection (fatal
   * under Node), and callers could not sequence on the removal completing.
   */
  async removeNode(nodeId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const command = new RemoveNodeCommand(nodeId);
    await this.commandManager.execute(command);
  }

  /**
   * Wave 6 (Card 7): top up (or trim) the dynamic port groups on the nodes at
   * either end of `link`.
   *
   * Runs through the COMMAND layer, so a spawned port is undoable and arrives
   * with the same events and dirty-tracking as any other model change. Guarded
   * against re-entry: an AddPortCommand does not itself add a link, but a host
   * validator could, and a self-feeding allocator would be a delightful way to
   * hang the app.
   */
  private reconcileDynamicPorts(nodeIds: Iterable<string>): void {
    if (this.reconcilingDynamicPorts || !this.diagram) return;

    // The LINKS are the source of truth for "is this port free" — the port's
    // own connection registry is derived state that `addLink()` never updates.
    const links = this.diagram.getLinks();

    const commands: Command[] = [];
    for (const nodeId of new Set(nodeIds)) {
      const node = this.diagram.getNode(nodeId);
      if (node) commands.push(...buildDynamicPortCommands(node, links));
    }
    if (commands.length === 0) return;

    this.reconcilingDynamicPorts = true;
    try {
      for (const command of commands) {
        // Port add/remove is synchronous; `execute` returns a promise only
        // because the Command contract allows async ones. Nothing here awaits it,
        // so the port is on the node by the time this returns — which is what the
        // renderer, mid-frame, is entitled to assume.
        void this.commandManager.execute(command);
      }
    } finally {
      this.reconcilingDynamicPorts = false;
    }
  }

  /** The nodes a link touches — resolved by id, or by searching for its ports. */
  private reconcileDynamicPortsFor(link: LinkModel): void {
    const diagram = this.diagram;
    if (!diagram) return;

    const nodeIds: string[] = [];
    for (const [nodeId, portId] of [
      [link.sourceNodeId, link.sourcePortId],
      [link.targetNodeId, link.targetPortId],
    ] as const) {
      if (nodeId) {
        nodeIds.push(nodeId);
      } else if (portId) {
        const owner = diagram.getNodeByPortId?.(portId);
        if (owner) nodeIds.push(owner.id);
      }
    }

    this.reconcileDynamicPorts(nodeIds);
  }

  /**
   * Add link
   */
  async addLink(config: {
    sourcePortId: string;
    targetPortId: string;
    type?: string;
    data?: any;
  }): Promise<LinkModel> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    return this.performanceMonitor.measure('addLink', async () => {
      // Check ports exist
      const sourcePort = this.findPort(config.sourcePortId);
      const targetPort = this.findPort(config.targetPortId);

      if (!sourcePort || !targetPort) {
        throw new Error('Invalid ports');
      }

      const link = new LinkModel(config.sourcePortId, config.targetPortId, config.type as any);

      // Validate
      const validation = this.validationEngine.validateLink(link, this.diagram!);
      if (!validation.valid) {
        throw new Error(`Invalid link: ${validation.errors[0]?.message}`);
      }

      // Add via command
      const command = new AddLinkCommand(link);
      await this.commandManager.execute(command);

      // Return the link that was actually added (might be deserialized)
      return (this.diagram && this.diagram.getLink(link.id)) || link;
    });
  }

  /**
   * Remove link
   *
   * Wave 14: async + awaited, mirroring removeGroup() — see removeNode().
   */
  async removeLink(linkId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const link = this.diagram.getLink(linkId);
    if (!link) {
      throw new Error(`Link ${linkId} not found`);
    }

    const command = new RemoveLinkCommand(linkId);
    await this.commandManager.execute(command);
  }

  /**
   * Add group (Phase 1.6c)
   */
  async addGroup(config: { name: string }): Promise<GroupModel> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    return this.performanceMonitor.measure('addGroup', async () => {
      const group = new GroupModel(config);

      // Add via command
      const command = new AddGroupCommand(group);
      await this.commandManager.execute(command);

      // Return the group that was actually added
      return (this.diagram && this.diagram.getGroup(group.id)) || group;
    });
  }

  /**
   * Remove group (Phase 1.6c)
   */
  async removeGroup(groupId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const group = this.diagram.getGroup(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const command = new RemoveGroupCommand(groupId);
    await this.commandManager.execute(command);
  }

  /**
   * Add entity to group (Phase 1.6c)
   */
  async addToGroup(groupId: string, entityId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const command = new AddToGroupCommand(groupId, entityId);
    await this.commandManager.execute(command);
  }

  /**
   * Remove entity from group (Phase 1.6c)
   */
  async removeFromGroup(groupId: string, entityId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const command = new RemoveFromGroupCommand(groupId, entityId);
    await this.commandManager.execute(command);
  }

  /**
   * Expand group (Phase 1.6c)
   */
  async expandGroup(groupId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const command = new ExpandGroupCommand(groupId);
    await this.commandManager.execute(command);
  }

  /**
   * Collapse group (Phase 1.6c)
   */
  async collapseGroup(groupId: string, options?: CollapseOptions): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const command = new CollapseGroupCommand(groupId, options);
    await this.commandManager.execute(command);
  }

  /**
   * Get group by ID (Phase 1.6c)
   */
  getGroup(groupId: string): GroupModel | undefined {
    return this.diagram?.getGroup(groupId);
  }

  /**
   * Get all groups (Phase 1.6c)
   */
  getGroups(): GroupModel[] {
    return this.diagram?.getGroups() || [];
  }

  /**
   * Set layout configuration on a group (Phase 1.7)
   */
  async setLayout(
    groupId: string,
    layoutType: 'flexbox' | 'grid',
    layoutConfig: LayoutConfig
  ): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const group = this.diagram.getGroup(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const command = new SetLayoutCommand(groupId, layoutType, layoutConfig);
    await this.commandManager.execute(command);
  }

  /**
   * Clear layout configuration from a group (Phase 1.7)
   */
  async clearLayout(groupId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const group = this.diagram.getGroup(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Clear layout by setting to 'none' (this triggers a command internally through the model)
    group.clearLayout();
  }

  /**
   * Get layout configuration from a group (Phase 1.7)
   */
  getLayout(groupId: string): { type: LayoutType; config?: LayoutConfig } | undefined {
    const group = this.diagram?.getGroup(groupId);
    return group?.getLayout();
  }

  /**
   * Set flex item configuration on a node (Phase 1.7)
   */
  async setFlexItem(nodeId: string, flexConfig: FlexItemConfig): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const command = new SetFlexItemCommand(nodeId, flexConfig);
    await this.commandManager.execute(command);
  }

  /**
   * Set grid item configuration on a node (Phase 1.7)
   */
  async setGridItem(nodeId: string, gridConfig: GridItemConfig): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const command = new SetGridItemCommand(nodeId, gridConfig);
    await this.commandManager.execute(command);
  }

  /**
   * Copy selected entities to clipboard (Phase 1.8)
   */
  async copy(options?: { includeGroups?: boolean; includeLinks?: boolean }): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const command = new CopyCommand(this.clipboardManager, options);
    await this.commandManager.execute(command);
  }

  /**
   * Paste entities from clipboard (Phase 1.8)
   */
  async paste(options?: { offset?: Point; selectPasted?: boolean }): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    if (!this.clipboardManager.hasData()) {
      throw new Error('Clipboard is empty');
    }

    const command = new PasteCommand(this.clipboardManager, options);
    await this.commandManager.execute(command);
  }

  /**
   * Duplicate selected entities (Phase 1.8)
   */
  async duplicate(options?: { offset?: Point; selectDuplicated?: boolean }): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const selectedNodeIds = this.store.get('selectedNodes') as Set<string> | undefined;
    if (!selectedNodeIds || selectedNodeIds.size === 0) {
      throw new Error('No nodes selected');
    }

    const command = new DuplicateCommand(options);
    await this.commandManager.execute(command);
  }

  /**
   * Delete selected entities (Phase 1.8)
   */
  async deleteSelection(options?: { deleteChildren?: boolean; deleteLinks?: boolean }): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const selectedNodeIds = this.store.get('selectedNodes') as Set<string> | undefined;
    const selectedLinkIds = this.store.get('selectedLinks') as Set<string> | undefined;

    if (
      (!selectedNodeIds || selectedNodeIds.size === 0) &&
      (!selectedLinkIds || selectedLinkIds.size === 0)
    ) {
      throw new Error('No entities selected');
    }

    const command = new DeleteSelectionCommand(options);
    await this.commandManager.execute(command);
  }

  /**
   * Get clipboard data (Phase 1.8)
   */
  getClipboardData() {
    return this.clipboardManager.get();
  }

  /**
   * Check if clipboard has data (Phase 1.8)
   */
  hasClipboardData(): boolean {
    return this.clipboardManager.hasData();
  }

  /**
   * Clear clipboard (Phase 1.8)
   */
  clearClipboard(): void {
    this.clipboardManager.clear();
  }

  /**
   * Get clipboard statistics (Phase 1.8)
   */
  getClipboardStats() {
    return this.clipboardManager.getStats();
  }

  // ============================================================================
  // Validation API (Phase 1 - Critical Fixes)
  // ============================================================================

  /**
   * Validate the entire diagram
   * @param options Validation options
   * @returns Validation result with errors and warnings
   */
  validateDiagram(options?: { validateTypes?: boolean; validateConnections?: boolean; validatePorts?: boolean; strict?: boolean }): ValidationResult {
    if (!this.diagram) {
      return {
        valid: false,
        errors: [{
          path: 'diagram',
          message: 'No diagram loaded',
          code: 'NO_DIAGRAM',
          severity: 'error'
        }],
        warnings: []
      };
    }
    return this.validationEngine.validateDiagram(this.diagram, options);
  }

  /**
   * Validate a specific node
   * @param nodeId Node ID to validate
   * @param options Validation options
   * @returns Validation result with errors and warnings
   */
  validateNode(nodeId: string, options?: { validateTypes?: boolean; validateConnections?: boolean; validatePorts?: boolean; strict?: boolean }): ValidationResult {
    if (!this.diagram) {
      return {
        valid: false,
        errors: [{
          path: `node.${nodeId}`,
          message: 'No diagram loaded',
          code: 'NO_DIAGRAM',
          severity: 'error'
        }],
        warnings: []
      };
    }

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      return {
        valid: false,
        errors: [{
          path: `node.${nodeId}`,
          message: `Node ${nodeId} not found`,
          code: 'NODE_NOT_FOUND',
          severity: 'error'
        }],
        warnings: []
      };
    }

    return this.validationEngine.validateNode(node, options);
  }

  /**
   * Validate a specific link
   * @param linkId Link ID to validate
   * @param options Validation options
   * @returns Validation result with errors and warnings
   */
  validateLink(linkId: string, options?: { validateTypes?: boolean; validateConnections?: boolean; validatePorts?: boolean; strict?: boolean }): ValidationResult {
    if (!this.diagram) {
      return {
        valid: false,
        errors: [{
          path: `link.${linkId}`,
          message: 'No diagram loaded',
          code: 'NO_DIAGRAM',
          severity: 'error'
        }],
        warnings: []
      };
    }

    const link = this.diagram.getLink(linkId);
    if (!link) {
      return {
        valid: false,
        errors: [{
          path: `link.${linkId}`,
          message: `Link ${linkId} not found`,
          code: 'LINK_NOT_FOUND',
          severity: 'error'
        }],
        warnings: []
      };
    }

    return this.validationEngine.validateLink(link, this.diagram, options);
  }

  /**
   * Validate a specific port
   * @param portId Port ID to validate
   * @param nodeId Node ID containing the port
   * @param options Validation options
   * @returns Validation result with errors and warnings
   */
  validatePort(portId: string, nodeId: string, options?: { validateTypes?: boolean; validateConnections?: boolean; validatePorts?: boolean; strict?: boolean }): ValidationResult {
    if (!this.diagram) {
      return {
        valid: false,
        errors: [{
          path: `node.${nodeId}.port.${portId}`,
          message: 'No diagram loaded',
          code: 'NO_DIAGRAM',
          severity: 'error'
        }],
        warnings: []
      };
    }

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      return {
        valid: false,
        errors: [{
          path: `node.${nodeId}.port.${portId}`,
          message: `Node ${nodeId} not found`,
          code: 'NODE_NOT_FOUND',
          severity: 'error'
        }],
        warnings: []
      };
    }

    const port = node.getPorts().find(p => p.id === portId);
    if (!port) {
      return {
        valid: false,
        errors: [{
          path: `node.${nodeId}.port.${portId}`,
          message: `Port ${portId} not found`,
          code: 'PORT_NOT_FOUND',
          severity: 'error'
        }],
        warnings: []
      };
    }

    return this.validationEngine.validatePort(port, node, options);
  }

  /**
   * Validate layout configuration for a group (Phase 3 - Layout validation)
   */
  validateLayout(groupId: string, options?: { strict?: boolean }): ValidationResult {
    if (!this.diagram) {
      return {
        valid: false,
        errors: [{
          path: `group.${groupId}.layout`,
          message: 'No diagram loaded',
          code: 'NO_DIAGRAM',
          severity: 'error'
        }],
        warnings: []
      };
    }

    const group = this.diagram.getGroup(groupId);
    if (!group) {
      return {
        valid: false,
        errors: [{
          path: `group.${groupId}.layout`,
          message: `Group ${groupId} not found`,
          code: 'GROUP_NOT_FOUND',
          severity: 'error'
        }],
        warnings: []
      };
    }

    return this.validationEngine.validateLayout(group, this.diagram, options);
  }

  /**
   * Register a node type definition
   * @param definition Node type definition
   */
  registerNodeType(definition: NodeTypeDefinition): void {
    this.typeRegistry.registerNodeType(definition);
  }

  /**
   * Register a port type definition
   * @param definition Port type definition
   */
  registerPortType(definition: PortTypeDefinition): void {
    this.typeRegistry.registerPortType(definition);
  }

  /**
   * Register a link type definition
   * @param definition Link type definition
   */
  registerLinkType(definition: LinkTypeDefinition): void {
    this.typeRegistry.registerLinkType(definition);
  }

  /**
   * Register a group type definition (Phase 2 - Group validation)
   * @param definition Group type definition
   */
  registerGroupType(definition: GroupTypeDefinition): void {
    this.typeRegistry.registerGroupType(definition);
  }

  /**
   * Enable real-time validation
   */
  enableRealTimeValidation(): void {
    this.validationEngine.enableRealTimeValidation();
  }

  /**
   * Disable real-time validation
   */
  disableRealTimeValidation(): void {
    this.validationEngine.disableRealTimeValidation();
  }

  /**
   * Check if real-time validation is enabled
   */
  isRealTimeValidationEnabled(): boolean {
    return this.validationEngine.isRealTimeValidationEnabled();
  }

  // ============================================================================
  // End Validation API
  // ============================================================================

  /**
   * Select nodes
   */
  selectNodes(nodeIds: string[]): void {
    const selectedNodes = new Set(nodeIds);
    this.store.set('selectedNodes', selectedNodes);

    // Update node states
    if (this.diagram) {
      this.diagram.getNodes().forEach((node) => {
        node.setState({ selected: selectedNodes.has(node.id) });
      });
    }

    this.eventBus.emit('selection:changed', { nodes: nodeIds });
  }

  /**
   * Select links
   */
  selectLinks(linkIds: string[]): void {
    const selectedLinks = new Set(linkIds);
    this.store.set('selectedLinks', selectedLinks);

    // Update link states
    if (this.diagram) {
      this.diagram.getLinks().forEach((link) => {
        link.setState(selectedLinks.has(link.id) ? 'selected' : 'default');
      });
    }

    this.eventBus.emit('selection:changed', { links: linkIds });
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectNodes([]);
    this.selectLinks([]);
    this.eventBus.emit('selection:cleared');
  }

  /**
   * Undo
   */
  async undo(): Promise<void> {
    await this.commandManager.undo();
  }

  /**
   * Redo
   */
  async redo(): Promise<void> {
    await this.commandManager.redo();
  }

  /**
   * Can undo
   */
  canUndo(): boolean {
    return this.commandManager.canUndo();
  }

  /**
   * Can redo
   */
  canRedo(): boolean {
    return this.commandManager.canRedo();
  }

  /**
   * Validate diagram
   */
  validate(): ValidationResult {
    if (!this.diagram) {
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    }

    return this.validationEngine.validateDiagram(this.diagram);
  }

  /**
   * Serialize diagram (with mode)
   */
  serialize(): SerializedDiagram | null {
    if (!this.diagram) {
      return null;
    }

    const serialized = this.serializer.serialize(this.diagram);
    // Include current mode
    serialized.mode = this.modeManager.serialize();
    return serialized;
  }

  /**
   * Deserialize diagram (with mode)
   */
  deserialize(data: SerializedDiagram, options?: import('../models/DiagramModel').DiagramLoadOptions): DiagramModel {
    const diagram = this.serializer.deserialize(data, options);
    this.setDiagram(diagram);

    // Restore mode if present
    this.modeManager.restore(data.mode);

    return diagram;
  }

  /**
   * Load diagram from JSON (with mode)
   */
  loadFromJSON(
    json: string | SerializedDiagram,
    options?: import('../models/DiagramModel').DiagramLoadOptions
  ): DiagramModel {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    return this.deserialize(data, options);
  }

  /**
   * Save diagram to JSON
   */
  saveToJSON(): string | null {
    const data = this.serialize();
    return data ? JSON.stringify(data, null, 2) : null;
  }

  /**
   * Register plugin
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    await this.pluginManager.register(plugin);
  }

  /**
   * Get plugin
   */
  getPlugin(name: string): Plugin | undefined {
    return this.pluginManager.get(name);
  }

  /**
   * Set viewport
   */
  setViewport(viewport: Viewport): void {
    this.store.set('viewport', viewport);
    this.eventBus.emit('viewport:changed', viewport);
  }

  /**
   * Set zoom
   */
  setZoom(zoom: number): void {
    const clampedZoom = Math.max(0.1, Math.min(5, zoom));
    this.store.set('zoom', clampedZoom);
    this.eventBus.emit('viewport:zoomed', clampedZoom);
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): PerformanceReport {
    return this.performanceMonitor.getReport();
  }

  // ============================================================================
  // Mode Management (Delegation to ModeManager)
  // ============================================================================

  /**
   * Get current diagram mode
   */
  getMode(): DiagramMode {
    return this.modeManager.getMode();
  }

  /**
   * Set diagram mode
   */
  setMode(mode: DiagramMode): void {
    this.modeManager.setMode(mode);
    this.syncReadonlyLock();
  }

  /**
   * Wave 9 — Card 7. Push the mode's read-only verdict down onto the DOCUMENT.
   *
   * Before this wave `DiagramMode.VIEW` / `PRESENTATION` and `isReadOnlyMode()`
   * existed, were documented as "all editing disabled" — and gated NOTHING. Not a
   * command, not a model mutator, not the event binder. They were a boolean nobody
   * asked. This is the line that makes the mode real: the model holds the lock, and
   * the model is where mutation actually happens.
   *
   * Call it after any mode change, and whenever a diagram is attached (a diagram
   * loaded into an engine that is ALREADY in presentation mode must come up locked,
   * or read-only would depend on the order the host happened to call things in).
   */
  private syncReadonlyLock(): void {
    this.diagram?.setReadonly(this.modeManager.isReadOnlyMode());
  }

  /**
   * Check if in designer mode
   */
  isDesignerMode(): boolean {
    return this.modeManager.isDesignerMode();
  }

  /**
   * Check if in running mode
   */
  isRunningMode(): boolean {
    return this.modeManager.isRunningMode();
  }

  /**
   * Check if in view mode
   */
  isViewMode(): boolean {
    return this.modeManager.isViewMode();
  }

  /**
   * Check if in debug mode
   */
  isDebugMode(): boolean {
    return this.modeManager.isDebugMode();
  }

  /**
   * Check if in presentation mode
   */
  isPresentationMode(): boolean {
    return this.modeManager.isPresentationMode();
  }

  /**
   * Check if in read-only mode (any mode except designer)
   */
  isReadOnlyMode(): boolean {
    return this.modeManager.isReadOnlyMode();
  }

  /**
   * Add mode transition guard
   */
  addModeGuard(name: string, guard: ModeGuardFunction): void {
    this.modeManager.addModeGuard(name, guard);
  }

  /**
   * Remove mode transition guard
   */
  removeModeGuard(name: string): void {
    this.modeManager.removeModeGuard(name);
  }

  /**
   * Clear all mode transition guards
   */
  clearModeGuards(): void {
    this.modeManager.clearModeGuards();
  }

  /**
   * Configure viewport settings for specific mode
   */
  configureModeViewport(mode: DiagramMode, settings: ModeViewportSettings): void {
    this.modeManager.configureModeViewport(mode, settings);
  }

  /**
   * Get viewport settings for specific mode
   */
  getModeViewportSettings(mode: DiagramMode): ModeViewportSettings {
    return this.modeManager.getModeViewportSettings(mode);
  }

  /**
   * Get mode history
   */
  getModeHistory(): ModeHistoryEntry[] {
    return this.modeManager.getModeHistory();
  }

  /**
   * Clear mode history
   */
  clearModeHistory(): void {
    this.modeManager.clearModeHistory();
  }

  /**
   * Navigate to previous mode
   */
  previousMode(): void {
    this.modeManager.previousMode();
  }

  /**
   * Navigate to next mode
   */
  nextMode(): void {
    this.modeManager.nextMode();
  }

  /**
   * Push mode onto stack (save current, switch to new)
   */
  pushMode(mode: DiagramMode): void {
    this.modeManager.pushMode(mode);
  }

  /**
   * Pop mode from stack (return to previous)
   */
  popMode(): void {
    this.modeManager.popMode();
  }

  /**
   * Get mode analytics
   */
  getModeAnalytics(): ModeAnalytics {
    return this.modeManager.getModeAnalytics();
  }

  /**
   * Register before mode change hook
   */
  beforeModeChange(hook: ModeChangeHook): () => void {
    return this.modeManager.beforeModeChange(hook);
  }

  /**
   * Register after mode change hook
   */
  afterModeChange(hook: ModeChangeHook): () => void {
    return this.modeManager.afterModeChange(hook);
  }

  // wave14/model — `getNodeBehaviorForMode` DELETED along with NodeModel.behaviorOverrides.
  // It had no caller outside its own spec; the real mode enforcement is the wave-9
  // ReadonlyLock on the model (see models/readonly-lock.ts), which every mutator actually
  // consults. (Its sibling getLinkBehaviorForMode below is equally caller-less — left in
  // place because it is outside this card's chain, flagged for a future sweep.)

  /**
   * Get link behavior adjusted for current mode
   */
  getLinkBehaviorForMode(baseBehavior: Partial<{ deletable: boolean; selectable: boolean }>): {
    deletable: boolean;
    selectable: boolean;
  } {
    const defaults = {
      deletable: true,
      selectable: true,
    };

    // Merge base behavior with defaults
    const merged = { ...defaults, ...baseBehavior };

    // Apply mode restrictions
    const currentMode = this.modeManager.getMode();
    switch (currentMode) {
      case DiagramMode.DESIGNER:
        // In designer mode, respect all base behavior settings
        return merged;

      case DiagramMode.RUNNING:
      case DiagramMode.VIEW:
      case DiagramMode.DEBUG:
      case DiagramMode.PRESENTATION:
        // In all other modes, disable editing but keep selectable
        return {
          deletable: false,
          selectable: merged.selectable,
        };

      default:
        return merged;
    }
  }

  /**
   * Initialize the engine
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.destroyed = false;
    this.eventBus.emit('engine:initialized');
  }

  /**
   * Get the store
   */
  getStore(): DiagramStore {
    return this.store;
  }

  /**
   * Subscribe to events
   */
  on(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.on(event, listener);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.off(event, listener);
  }

  /**
   * Destroy engine
   */
  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;

    // Emit destroyed event BEFORE removing listeners
    this.eventBus.emit('engine:destroyed');

    // Cleanup
    if (this.diagram) {
      this.detachDiagram(this.diagram);
    }

    // Reset mode through ModeManager
    this.modeManager.restore(DiagramMode.DESIGNER);
    this.initialized = false;

    // Note: PluginManager doesn't have destroy method yet
    // this.pluginManager.destroy();
    this.eventBus.removeAllListeners();
    this.store.reset();
  }

  /**
   * Configure systems
   */
  private configureSystems(): void {
    // Configure command manager
    if (this.config.history?.maxCommands) {
      this.commandManager.setMaxHistorySize(this.config.history.maxCommands);
    }

    // Configure validation
    if (this.config.validation?.realTime) {
      this.validationEngine.enableRealTimeValidation();
    }

    // Configure performance monitoring
    if (this.config.performance?.warnThreshold) {
      this.performanceMonitor.setWarnThreshold(this.config.performance.warnThreshold);
    }
  }

  /**
   * Install plugins
   */
  private async installPlugins(): Promise<void> {
    if (this.config.plugins) {
      for (const plugin of this.config.plugins) {
        await this.pluginManager.register(plugin);
      }
    }
  }

  /**
   * Register a node as an obstacle in the routing engine
   */
  private registerNodeAsObstacle(node: NodeModel): void {
    const obstacle = {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    };
    this.routingEngine.addObstacle(obstacle);
  }

  /**
   * Wave 5 (Edge routing) — Card 6: reconcile the shared ObstacleMap with the
   * diagram's GROUP state, idempotently:
   *
   *   - a COLLAPSED group (with geometry) is ONE solid obstacle;
   *   - members hidden under a collapsed group (at any depth) are NOT obstacles
   *     — they are not visible, and routing around invisible things produces
   *     inexplicable detours;
   *   - expanding restores the members and removes the group block.
   *
   * Runs on every group add/remove/collapse/expand. Public so the grouping
   * feature (which owns collapse SEMANTICS but not the ObstacleMap) can force a
   * reconcile after batch operations.
   */
  refreshGroupObstacles(): void {
    if (!this.diagram) return;
    const groups = this.diagram.getGroups();

    // ids of members hidden under a collapsed group at any depth
    const hidden = new Set<string>();
    for (const g of groups) {
      // a group's members are hidden if IT or any of its ancestors is collapsed
      let cur: GroupModel | undefined = g;
      let effectiveCollapsed = false;
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        if (cur.isCollapsed) { effectiveCollapsed = true; break; }
        cur = cur.parentGroupId ? this.diagram.getGroup(cur.parentGroupId) : undefined;
      }
      if (!effectiveCollapsed) continue;
      for (const memberId of g.members) hidden.add(memberId);
    }

    // hidden members: out of the map; visible ones: (re)registered
    for (const node of this.diagram.getNodes()) {
      if (hidden.has(node.id)) {
        this.routingEngine.removeObstacle(node.id);
      } else {
        this.routingEngine.updateObstacle({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: node.size.width,
          height: node.size.height,
          kind: 'node',
        });
      }
    }

    // group blocks: only VISIBLE collapsed groups block (a collapsed group
    // nested inside another collapsed group is itself hidden)
    for (const g of groups) {
      const rect = this.groupObstacleRect(g);
      if (g.isCollapsed && !hidden.has(g.id) && rect) {
        this.routingEngine.updateObstacle({ id: g.id, ...rect, kind: 'group' });
      } else {
        this.routingEngine.removeObstacle(g.id);
      }
    }
  }

  private groupObstacleRect(
    g: GroupModel
  ): { x: number; y: number; width: number; height: number } | null {
    if (g.size) {
      return { x: g.position.x, y: g.position.y, width: g.size.width, height: g.size.height };
    }
    if (g.bounds) return { ...g.bounds };
    return null;
  }

  /**
   * Update a node's obstacle when it moves or resizes
   * Also invalidates all links so they recalculate paths with new obstacle positions
   */
  private updateNodeObstacle(node: NodeModel): void {
    const obstacle = {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    };
    this.routingEngine.updateObstacle(obstacle);

    // NOTE: this method used to also mark EVERY link dirty "so they recalculate"
    // — a sledgehammer that was dead code while the subscription bug hid it
    // (see attachDiagram) and became a live perf regression the moment the fix
    // woke it up: one node move invalidated every link VNode in the diagram.
    // Link invalidation is owned by the renderer's per-frame route pre-pass +
    // markLinksWhoseFrameChanged (wave 4), which re-renders exactly the links
    // whose GEOMETRY actually changed.
  }

  /**
   * Unregister a node obstacle when node is removed
   */
  private unregisterNodeObstacle(nodeId: string): void {
    this.routingEngine.removeObstacle(nodeId);
  }

  /**
   * Attach diagram
   */
  private attachDiagram(diagram: DiagramModel): void {
    // Subscribe to diagram events. Every subscription returns a disposer which
    // we store so detachDiagram can unsubscribe the engine's own listeners
    // without accumulating duplicates across attach/detach cycles.
    this.diagramDisposers.push(
      diagram.on('node:added', (node: NodeModel) => {
        this.eventBus.emit('node:added', node);
        // Register node as obstacle for routing
        this.registerNodeAsObstacle(node);

        // Listen for node position/size changes
        this.diagramDisposers.push(
          // BUGFIX (wave 5, found by the nodes agent): NodeModel emits
          // `change:position` (via trackChange) — never bare `position`. This
          // listener had NEVER fired, so the shared ObstacleMap went stale on
          // every node move; only the renderer's per-request obstacle list kept
          // visible routing honest, while the a-star/dijkstra/visibility
          // adapters — which read the SHARED map — routed around yesterday's
          // positions.
          node.on('change:position', () => {
            this.updateNodeObstacle(node);
          })
        );
        this.diagramDisposers.push(
          node.on('change:size', () => {
            this.updateNodeObstacle(node);
          })
        );
      })
    );

    this.diagramDisposers.push(
      diagram.on('node:removed', (node: NodeModel) => {
        this.eventBus.emit('node:removed', node);
        // Unregister node obstacle
        this.unregisterNodeObstacle(node.id);
      })
    );

    this.diagramDisposers.push(
      diagram.on('link:added', (link: LinkModel) => {
        this.eventBus.emit('link:added', link);
        // Wave 6 (Card 7): wiring up the last free port in a dynamic group must
        // conjure the next one. This is the whole feature — a `dynamic` group
        // whose allocator never runs is just a group.
        this.reconcileDynamicPortsFor(link);
      })
    );

    // Wave 5 — Card 6: group state drives the obstacle map. `group:added` also
    // subscribes to that group's own collapse/expand emitter (DiagramModel does
    // not forward those); existing groups are wired below.
    const wireGroup = (group: GroupModel) => {
      this.diagramDisposers.push(group.on('collapsed', () => this.refreshGroupObstacles()));
      this.diagramDisposers.push(group.on('expanded', () => this.refreshGroupObstacles()));
    };
    this.diagramDisposers.push(
      diagram.on('group:added', (group: GroupModel) => {
        wireGroup(group);
        this.refreshGroupObstacles();
      })
    );
    this.diagramDisposers.push(
      diagram.on('group:removed', () => this.refreshGroupObstacles())
    );
    this.diagramDisposers.push(
      diagram.on('group:changed', () => this.refreshGroupObstacles())
    );
    diagram.getGroups().forEach(wireGroup);
    if (diagram.getGroups().length > 0) this.refreshGroupObstacles();

    this.diagramDisposers.push(
      diagram.on('link:removed', (link: LinkModel) => {
        this.eventBus.emit('link:removed', link);
        // Unwiring frees a port, which may leave the group with a SURPLUS of
        // spares — the allocator retires the ones it spawned.
        this.reconcileDynamicPortsFor(link);
      })
    );

    // Register all existing nodes as obstacles
    diagram.getNodes().forEach((node) => {
      this.registerNodeAsObstacle(node);

      // Listen for node position/size changes
      this.diagramDisposers.push(
        node.on('change:position', () => {
          this.updateNodeObstacle(node);
        })
      );
      this.diagramDisposers.push(
        node.on('change:size', () => {
          this.updateNodeObstacle(node);
        })
      );
    });
  }

  /**
   * Detach diagram
   */
  private detachDiagram(diagram: DiagramModel): void {
    // Unregister all node obstacles from routing engine so the old diagram's
    // nodes don't remain as obstacles affecting the newly attached diagram.
    // This only touches the routing engine's obstacle registry, not the diagram.
    diagram.getNodes().forEach((node) => {
      this.unregisterNodeObstacle(node.id);
    });

    // Unsubscribe the engine's own listeners that were registered in
    // attachDiagram. We deliberately do NOT clear() or otherwise mutate the old
    // diagram: it must stay fully intact so it can be re-attached later with all
    // of its nodes and links preserved. Disposing the stored handlers also
    // prevents duplicate handlers from accumulating across attach/detach cycles.
    for (const dispose of this.diagramDisposers) {
      dispose();
    }
    this.diagramDisposers = [];
  }

  /**
   * Find port in diagram
   */
  private findPort(portId: string): PortModel | undefined {
    if (!this.diagram) {
      return undefined;
    }

    for (const node of this.diagram.getNodes()) {
      const port = node.getPort(portId);
      if (port) {
        return port;
      }
    }

    return undefined;
  }

  /**
   * Get node that owns a port (Phase 1.6b)
   */
  private getNodeForPort(portId: string): NodeModel | undefined {
    if (!this.diagram) {
      return undefined;
    }

    for (const node of this.diagram.getNodes()) {
      if (node.getPort(portId)) {
        return node;
      }
    }

    return undefined;
  }

  /**
   * Get port position in global coordinates (Phase 1.6b)
   * @param portId Port ID
   * @returns Global position of the port
   */
  private getPortGlobalPosition(portId: string): Point {
    const port = this.findPort(portId);
    if (!port) {
      return { x: 0, y: 0 };
    }

    const node = this.getNodeForPort(portId);
    if (!node) {
      return { x: 0, y: 0 };
    }

    // Port position is normalized (0-1) relative to node size
    const localPortPos: Point = {
      x: (port.position?.x ?? 0.5) * node.size.width,
      y: (port.position?.y ?? 0.5) * node.size.height,
    };

    // Transform to global using node's global position
    const nodeGlobalPos = node.getGlobalPosition();

    return {
      x: nodeGlobalPos.x + localPortPos.x,
      y: nodeGlobalPos.y + localPortPos.y,
    };
  }

  /**
   * Compute link path using specified routing algorithm (Phase 1.6b)
   * @param linkId Link ID
   * @param algorithm Routing algorithm to use
   * @param options Routing options
   * @returns Array of points forming the path
   */
  private computeLinkPath(
    linkId: string,
    algorithm: 'straight' | 'orthogonal' | 'astar' | 'dijkstra' | 'visibility',
    options: any = {}
  ): Point[] {
    const link = this.diagram?.getLink(linkId);
    if (!link) {
      return [];
    }

    // Build obstacle map (excluding source and target nodes)
    const sourceNode = this.getNodeForPort(link.sourcePortId);
    const targetNode = this.getNodeForPort(link.targetPortId);
    const excludeIds = [sourceNode?.id, targetNode?.id].filter(
      (id) => id !== undefined
    ) as string[];

    const obstacleMap = ObstacleMapBuilder.fromDiagramExcluding(
      this.diagram!,
      excludeIds,
      { margin: options.obstacleMargin ?? 5 }
    );

    // Get port positions (in global coordinates)
    const start = this.getPortGlobalPosition(link.sourcePortId);
    const end = this.getPortGlobalPosition(link.targetPortId);

    // Route based on algorithm
    let points: Point[];
    switch (algorithm) {
      case 'straight': {
        const router = new StraightRouter();
        const result = router.route({ start, end, obstacles: obstacleMap.getObstacles(), options });
        points = result?.points || [start, end];
        break;
      }
      case 'orthogonal': {
        const router = new OrthogonalRouter();
        const result = router.route({ start, end, obstacles: obstacleMap.getObstacles(), options });
        points = result?.points || [start, end];
        break;
      }
      case 'astar': {
        const router = new AStarRouter(obstacleMap, options);
        points = router.route(start, end);
        // Fallback to direct path if no path found
        if (points.length === 0) {
          points = [start, end];
        }
        break;
      }
      case 'dijkstra': {
        const router = new DijkstraRouter(obstacleMap, options);
        points = router.route(start, end);
        // Fallback to direct path if no path found
        if (points.length === 0) {
          points = [start, end];
        }
        break;
      }
      case 'visibility': {
        const router = new VisibilityGraphRouter(obstacleMap, options);
        points = router.route(start, end);
        // Fallback to direct path if no path found
        if (points.length === 0) {
          points = [start, end];
        }
        break;
      }
      default:
        throw new Error(`Unknown routing algorithm: ${algorithm}`);
    }

    return points;
  }

  /**
   * Generate link path using RoutingEngine with obstacle avoidance
   * This ensures the final link respects the routing algorithm setting (A*, none, etc.)
   */
  private async generateLinkPathWithRouting(
    link: LinkModel,
    sourcePos: Point,
    targetPos: Point,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom',
    sourceNode?: any,
    targetNode?: any
  ): Promise<void> {
    // Get obstacles from diagram (INCLUDE ALL nodes, even source and target)
    // The routing algorithm uses gap offset to ensure paths start/end outside node boundaries
    const obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

    if (this.diagram) {
      this.diagram.getNodes().forEach(node => {
        // Include ALL nodes as obstacles - the gap offset ensures we start/end outside
        obstacles.push({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: node.size.width,
          height: node.size.height,
        });
      });
    }

    // Use the routing engine's default algorithm
    const algorithm = this.routingEngine.getDefaultAlgorithm();

    // Route the path with obstacle avoidance
    // IMPORTANT: avoidObstacles should be based on whether obstacles exist, not on the algorithm
    // - 'orthogonal' algorithm with avoidObstacles=true uses A* with orthogonal-only movement
    // - 'a-star', 'dijkstra', etc. also use obstacle avoidance
    // - 'straight' never avoids obstacles (direct line)
    const shouldAvoidObstacles = obstacles.length > 0 && algorithm !== 'straight';

    const routedPath = await this.routingEngine.routeAsync({
      start: sourcePos,
      end: targetPos,
      sourceDirection,
      targetDirection,
      obstacles,
      options: {
        algorithm,
        avoidObstacles: shouldAvoidObstacles,
        obstacleMargin: 20,
        gridSize: 10, // Grid size for A* pathfinding
      }
    });

    // Set the link points from the routed path.
    // Wave 9 — Card 7: a SYSTEM write. These points are DERIVED from geometry the
    // document already has; a read-only diagram must still route its links or it
    // renders with no path at all. Not reachable from user input.
    if (routedPath && routedPath.points.length > 0) {
      const points = routedPath.points;
      this.diagram
        ? this.diagram.runSystemWrite(() => link.setPoints(points))
        : link.setPoints(points);
    } else {
      // Fallback to simple path generation if routing failed
      link.generatePath(sourcePos, targetPos, sourceDirection, targetDirection);
    }
  }

  // ============================================================================
  // Layout Service Integration (Phase 2: Layout Adapters)
  // ============================================================================

  // Using type import to avoid circular dependency
  private layoutService?: {
    applyLayout(diagram: DiagramModel, config: any): Promise<any>;
  };

  /**
   * Set layout service for diagram layouts
   *
   * @param service - Layout service instance
   */
  setLayoutService(service: {
    applyLayout(diagram: DiagramModel, config: any): Promise<any>;
  }): void {
    this.layoutService = service;
  }

  // ==========================================================================
  // Wave 7 (Auto-layout) — Card 0: THE unified entry point.
  // ==========================================================================

  /** Lazily-built registry of the built-in layout engines. */
  private _layoutRegistry?: LayoutRegistry;

  /**
   * The named-algorithm registry, with the built-ins already registered.
   *
   * THE BUG THIS CLOSES: `applyLayout()` below requires `setLayoutService()` —
   * and NOTHING in the codebase ever called it (the only mention is a doc comment
   * in layout/index.ts). So dagre, ELK, force, spectral and community — thousands
   * of lines, several of them untested — were UNREACHABLE from the engine. That
   * is the whole "auto-layout is fragmented" finding. Layout now works out of the
   * box, with no setup call.
   */
  getLayoutRegistry(): LayoutRegistry {
    if (!this._layoutRegistry) {
      // ONE factory, shared with the preset applicator: adapters, then the Card-2
      // portfolio, then our layered engine, then the auto-selector (which takes the
      // registry, so its candidate pool is whatever is actually registered).
      this._layoutRegistry = createDefaultLayoutRegistry();
    }
    return this._layoutRegistry;
  }

  /**
   * Lay out the whole diagram.
   *
   *     await engine.layout('dagre', { direction: 'LR' });
   *
   * DETERMINISTIC and IDEMPOTENT: the same graph and seed produce byte-identical
   * coordinates, and running it twice changes nothing the second time. (The seed
   * defaults to a fixed constant, so an author who never thinks about seeds still
   * gets the same picture on every reload; randomness is opt-in.)
   *
   * NOT to be confused with `DiagramModel.getLayoutManager()`, which answers a
   * DIFFERENT question — "where should this ONE newly-added node go?" — and is a
   * placement strategy, not a graph layout. The audit called them "two parallel
   * stacks" and asked for them to be merged; they are not parallel, and merging
   * them would force a single-node placer to pretend it can lay out a graph.
   */
  async layout(
    name: string = DEFAULT_LAYOUT_NAME,
    options: UnifiedLayoutOptions = {}
  ): Promise<UnifiedLayoutResult> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const registered = this.getLayoutRegistry().get(name);
    if (!registered) {
      const available = this.getLayoutRegistry().names().join(', ');
      throw new Error(`Unknown layout '${name}'. Registered layouts: ${available}`);
    }

    const seed = options.seed ?? DEFAULT_LAYOUT_SEED;

    // Wave 7 Card 4 — nested container layout. On by default whenever the
    // diagram has containers, because the flat path is not just worse there, it
    // is WRONG: it interleaves members of different groups and never updates a
    // single group frame, so every container is left behind pointing at where
    // its members used to be. Opt out with `nested: false`.
    const hasGroups = this.diagram.getGroups().length > 0;
    if ((options.nested ?? hasGroups) && hasGroups) {
      const result = await new CompoundLayoutService(this.diagram, {
        defaultAlgorithm: name,
        adapters: this.getLayoutRegistry().adapters(),
        layoutTopLevel: true,
        defaultPadding: options.containerPadding,
        gridGap: options.groupSpacing,
        layoutOptions: { ...options, seed },
      }).layout();

      // CompoundLayoutService commits through setPosition/setFrame as it goes
      // (it has to — each level reads the geometry the level below produced).
      return {
        nodePositions: result.nodePositions,
        bounds: result.bounds,
        metadata: {
          algorithm: name,
          executionTime: 0,
          nested: true,
          containersLaidOut: result.laidOut,
          containersSkipped: result.skipped,
          containersCollapsed: result.collapsed,
        },
        algorithm: name,
        seed,
        // Card 3's run-status fields. A nested layout is a complete, synchronous
        // walk of the container tree — it is never cut short, so it reports itself
        // honestly as a finished single-pass run rather than leaving the caller to
        // guess from `undefined`.
        partial: false,
        iteration: 1,
        totalIterations: 1,
      };
    }

    // ---- the flat path -----------------------------------------------------
    //
    // Card 3 routes it through the layout HOST, which runs the algorithm inline
    // through the very same message loop a worker would run — so there is no second
    // code path to drift, and a test proves the two produce byte-identical
    // coordinates. (This replaces the direct runLayout() call: runLayout remains the
    // shared apply-and-commit path used by the preset applicator, and the host
    // commits through the same setPosition() route.)
    // A hand-rolled RegisteredLayout is an opaque closure over a DiagramModel.
    // A closure cannot cross a thread boundary, so it runs inline — not a
    // policy, just physics. Every built-in exposes its adapter and takes the
    // worker path below.
    if (!registered.adapter) {
      const result = await registered.apply(this.diagram, { ...options, seed });
      this.commitLayoutPositions(result.nodePositions);
      return {
        ...result,
        algorithm: name,
        seed,
        partial: false,
        iteration: 1,
        totalIterations: 1,
      };
    }

    // Wave 7 Card 3: ONE path, whether or not a worker port is attached. The
    // host runs the algorithm inline through the very same message loop the
    // worker would run, so there is no second code path to drift — and a test
    // proves the two produce byte-identical coordinates.
    const graph = serializeGraph(this.diagram.getNodes(), this.diagram.getLinks());
    const result = await this.getLayoutHost().run(
      name,
      graph,
      translateOptions(name, { ...options, seed }),
      {
        signal: options.signal,
        onProgress: options.onProgress,
        timeBudgetMs: options.timeBudgetMs,
        sliceMs: options.sliceMs,
        stopAfterIteration: options.stopAfterIteration,
      }
    );

    this.commitLayoutPositions(result.nodePositions);

    return { ...result, algorithm: name, seed };
  }

  /**
   * Wave 7 — Card 6: mental-map-preserving incremental layout.
   *
   *     await engine.layoutIncremental({ changed: [newNode.id], budget: { maxPerNode: 60 } });
   *
   * Mermaid re-renders the whole diagram from scratch on every edit and destroys the
   * user's spatial memory of their own diagram. This does the opposite:
   *
   *   1. everything outside the affected region becomes a Card-5 ANCHOR — an
   *      immovable obstacle the layout works AROUND (impossible before Card 5, when
   *      "constraints" were positions clamped after an unconstrained run);
   *   2. the result is RE-ALIGNED onto the previous layout by matching centroids —
   *      exactly the translation that minimises squared displacement, because a
   *      layered layout is defined only up to translation, so one new node widening
   *      a rank slides the whole picture sideways and makes every node "move" while
   *      the drawing is unchanged;
   *   3. movement is MEASURED against an explicit budget and reported.
   *
   * Returns a tween PLAN rather than animating: the engine says where things go at
   * time t, the host drives t — which is what keeps this runnable in a worker, in
   * SSR and in a test.
   *
   * ONE SEMANTIC, STATED PLAINLY. This runs the `layered` engine, because it is the
   * only one that honours anchors DURING coordinate assignment. If the diagram's
   * current positions came from a DIFFERENT engine, the first incremental pass
   * necessarily re-draws it — and that is not a bug to paper over: "move as little
   * as possible" is ill-posed across engines, because there is no meaningful small
   * move between two engines' idea of the same graph.
   */
  async layoutIncremental(
    options: IncrementalOptions & { name?: string } & UnifiedLayoutOptions = {}
  ): Promise<UnifiedLayoutResult & { movement: MovementReport; tween: TweenPlan }> {
    if (!this.diagram) throw new Error('No diagram loaded');

    // The baseline EXCLUDES the just-added nodes. A node the user has only now
    // created has no meaningful "previous position" — it sits wherever the model
    // defaulted it (usually 0,0). Counting it is not a cosmetic error in the report:
    // it DRAGS THE CENTROID, so the re-alignment translates the whole diagram to
    // accommodate a position that never meant anything.
    const changed = new Set(options.changed ?? []);
    const before: Positions = new Map(
      this.diagram
        .getNodes()
        .filter((n) => !changed.has(n.id))
        .map((n) => [n.id, { x: n.position.x, y: n.position.y }])
    );

    const semantic = constraintsForStrategy(this.diagram, before, options);

    const result = await this.layout(options.name ?? 'layered', {
      ...options,
      semantic,
    } as UnifiedLayoutOptions);

    // Re-align onto the previous picture — but ONLY when the layout was FREE.
    // Alignment cancels the arbitrary translation of a free layout; if a node is
    // anchored the frame of reference is already pinned, and translating on top of
    // that DRAGS THE ANCHORED NODES, which is the one thing they exist to prevent.
    const raw = new Map(result.nodePositions);
    const anchored = Object.keys(semantic.anchors ?? {}).length > 0;

    const naive = measureMovement(before, raw, options.budget);
    const aligned = anchored ? raw : alignToPrevious(raw, before).positions;
    const settled = measureMovement(before, aligned, options.budget);
    const movement: MovementReport = {
      ...settled,
      savedByAlignment: Math.max(0, naive.total - settled.total),
    };

    for (const [id, p] of aligned) {
      this.diagram.getNode(id)?.setPosition(p.x, p.y);
    }

    return {
      ...result,
      nodePositions: aligned,
      movement,
      tween: planTween(before, aligned),
    };
  }

  /**
   * Commit computed positions onto the real nodes.
   *
   * `setPosition()` rather than a raw write, so the spatial index, the routing
   * obstacle map and the renderer all see the move — the wave-5 lesson: a
   * subscription to an event nobody emits is a subscription to nothing.
   *
   * This is also the reason a partial result is USEFUL rather than merely
   * honest: the best-so-far positions land on the diagram exactly like final
   * ones, so a cancelled layout leaves a real, coherent picture behind.
   */
  private commitLayoutPositions(
    nodePositions: Map<string, { x: number; y: number }>
  ): void {
    for (const [nodeId, position] of nodePositions) {
      this.diagram?.getNode(nodeId)?.setPosition(position.x, position.y);
    }
  }

  /**
   * Run layout off the main thread.
   *
   * The engine does NOT construct the Worker — that would bake one bundler's URL
   * scheme into the engine, which is exactly what the old (never-instantiated)
   * `LayoutWorkerPool` did with its hardcoded `/assets/workers/layout.worker.js`.
   * The caller builds the worker however its toolchain likes and hands it in:
   *
   *     const worker = new Worker(new URL('./layout.worker', import.meta.url),
   *                               { type: 'module' });
   *     engine.setLayoutPort(worker as unknown as LayoutPort);
   *
   * Pass `undefined` to go back to running inline.
   */
  setLayoutPort(port?: LayoutPort): void {
    this.layoutPort = port;
    this.layoutHost = undefined; // rebuilt lazily against the new port
  }

  private layoutPort?: LayoutPort;
  private layoutHost?: LayoutHost;

  private getLayoutHost(): LayoutHost {
    if (!this.layoutHost) {
      this.layoutHost = new LayoutHost(this.layoutPort, {
        // Inline runs resolve against the LIVE registry, so a layout registered
        // at runtime (or a built-in that a host has replaced) is honoured. A
        // real worker cannot: functions do not survive postMessage.
        resolve: (layoutName) => this.getLayoutRegistry().get(layoutName)?.adapter,
      });
    }
    return this.layoutHost;
  }

  /**
   * Apply layout to current diagram
   *
   * @param config - Layout configuration
   * @returns Layout result with positions and metadata
   * @throws Error if no diagram is loaded or layout service is not initialized
   * @deprecated Wave 7 Card 0 — use {@link layout} instead. This path requires a
   * `setLayoutService()` call that nothing ever made, so it always threw.
   */
  async applyLayout(config: {
    adapter: string | any;
    options?: any;
    animate?: boolean;
    animationDuration?: number;
    fit?: boolean;
    canvasDimensions?: { width: number; height: number };
  }): Promise<{
    nodePositions: Map<string, { x: number; y: number }>;
    bounds: { x: number; y: number; width: number; height: number };
    metadata?: any;
  }> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    if (!this.layoutService) {
      throw new Error('LayoutService not initialized. Call setLayoutService() first.');
    }

    return this.layoutService.applyLayout(this.diagram, config);
  }

  /**
   * Quick helper: Apply Dagre layout
   *
   * @param options - Dagre layout options
   * @param canvasDimensions - Optional canvas dimensions for viewport fitting
   * @returns Layout result
   */
  async applyDagreLayout(
    options?: {
      rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
      align?: 'UL' | 'UR' | 'DL' | 'DR';
      nodesep?: number;
      edgesep?: number;
      ranksep?: number;
      marginx?: number;
      marginy?: number;
      ranker?: 'network-simplex' | 'tight-tree' | 'longest-path';
    },
    canvasDimensions?: { width: number; height: number }
  ): Promise<any> {
    return this.applyLayout({
      adapter: 'dagre',
      options,
      animate: true,
      fit: false, // Don't auto-fit by default to allow user control
      canvasDimensions,
    });
  }

  /**
   * Quick helper: Apply ELK layout
   *
   * @param options - ELK layout options
   * @param canvasDimensions - Optional canvas dimensions for viewport fitting
   * @returns Layout result
   */
  async applyELKLayout(
    options?: {
      algorithm?: 'layered' | 'force' | 'stress' | 'mrtree' | 'radial' | 'disco';
      'elk.direction'?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';
      'elk.spacing.nodeNode'?: number;
      [key: string]: any;
    },
    canvasDimensions?: { width: number; height: number }
  ): Promise<any> {
    return this.applyLayout({
      adapter: 'elk',
      options,
      animate: true,
      fit: false, // Don't auto-fit by default to allow user control
      canvasDimensions,
    });
  }

  /**
   * Cleanup and dispose of all resources
   * Should be called when the engine is no longer needed
   */
  dispose(): void {
    // Clear diagram
    if (this.diagram) {
      this.diagram.clear();
      this.diagram = null;
    }

    // Clear command history
    this.commandManager.clear();

    // Clear performance data
    this.performanceMonitor.clear();

    // Clear clipboard
    this.clipboardManager.clear();
  }
}
