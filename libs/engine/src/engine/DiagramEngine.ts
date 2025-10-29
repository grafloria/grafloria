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
import { AddLinkCommand } from '../commands/basic/AddLinkCommand';
import { RemoveLinkCommand } from '../commands/basic/RemoveLinkCommand';
import { AddGroupCommand, RemoveGroupCommand, AddToGroupCommand, RemoveFromGroupCommand, ExpandGroupCommand, CollapseGroupCommand } from '../commands/basic'; // Phase 1.6c
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
import type { NodeBehavior } from '../types';
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

  // Configuration
  private config: DiagramEngineConfig;

  // Phase 1: Interaction configuration and state
  private interactionConfig: InteractionConfig;
  private connectionStateManager: ConnectionStateManager;

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
    this.eventBus.on('connection:complete', (event: any) => {
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
          sourcePort.addConnection(link.id);
          targetPort.addConnection(link.id);

          // Calculate initial path using RoutingEngine
          const sourcePos = sourcePort.getAbsolutePosition(sourceNode.getBoundingBox());
          const targetPos = targetPort.getAbsolutePosition(targetNode.getBoundingBox());

          // Get port directions for routing
          const sourceDirection = sourcePort.alignment?.side;
          const targetDirection = targetPort.alignment?.side;

          // Use RoutingEngine to calculate path with obstacle avoidance
          this.generateLinkPathWithRouting(link, sourcePos, targetPos, sourceDirection, targetDirection, sourceNode, targetNode);

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
    }

    this.store.set('diagram', diagram);
    this.eventBus.emit('diagram:changed', { oldDiagram, newDiagram: diagram });

    // Update command context
    this.commandManager.updateContext({ diagram });

    // Update selection manager diagram reference (Phase 1.8a)
    this.selectionManager.setDiagram(diagram);
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
   */
  removeNode(nodeId: string): void {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const node = this.diagram.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const command = new RemoveNodeCommand(nodeId);
    this.commandManager.execute(command);
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
   */
  removeLink(linkId: string): void {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const link = this.diagram.getLink(linkId);
    if (!link) {
      throw new Error(`Link ${linkId} not found`);
    }

    const command = new RemoveLinkCommand(linkId);
    this.commandManager.execute(command);
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
  async collapseGroup(groupId: string): Promise<void> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    const command = new CollapseGroupCommand(groupId);
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
  deserialize(data: SerializedDiagram): DiagramModel {
    const diagram = this.serializer.deserialize(data);
    this.setDiagram(diagram);

    // Restore mode if present
    this.modeManager.restore(data.mode);

    return diagram;
  }

  /**
   * Load diagram from JSON (with mode)
   */
  loadFromJSON(json: string | SerializedDiagram): DiagramModel {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    return this.deserialize(data);
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

  /**
   * Get node behavior adjusted for current mode (with per-node overrides)
   */
  getNodeBehaviorForMode(baseBehavior: Partial<NodeBehavior>, node?: NodeModel): NodeBehavior {
    const defaults: NodeBehavior = {
      selectable: true,
      draggable: true,
      resizable: true,
      rotatable: true,
      deletable: true,
      editable: true,
      connectable: true,
      groupable: true,
      cloneable: true,
    };

    // Merge base behavior with defaults
    let merged = { ...defaults, ...baseBehavior };

    // Check for per-node behavior override for current mode
    if (node) {
      const currentMode = this.modeManager.getMode();
      const override = node.getBehaviorOverride(currentMode);
      if (override) {
        merged = { ...merged, ...override };
        return merged; // Use override directly
      }
    }

    // Apply mode restrictions (if no override)
    const currentMode = this.modeManager.getMode();
    switch (currentMode) {
      case DiagramMode.DESIGNER:
        // In designer mode, respect all base behavior settings
        return merged;

      case DiagramMode.RUNNING:
      case DiagramMode.VIEW:
      case DiagramMode.DEBUG:
      case DiagramMode.PRESENTATION:
        // In all other modes, disable editing capabilities
        return {
          ...merged,
          draggable: false,
          resizable: false,
          rotatable: false,
          deletable: false,
          editable: false,
          connectable: false,
          groupable: false,
          cloneable: false,
          selectable: merged.selectable, // Keep selectable as-is
        };

      default:
        return merged;
    }
  }

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
    console.log(`🚧 Registered obstacle: ${node.data?.['label'] || node.id} at (${obstacle.x}, ${obstacle.y}) size ${obstacle.width}x${obstacle.height}`);
    console.log(`   Total obstacles: ${this.routingEngine.getObstacleCount()}`);
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

    // Mark all links as dirty so they recalculate their paths
    // This enables dynamic rerouting when nodes move through paths
    if (this.diagram) {
      this.diagram.getLinks().forEach(link => {
        link.markDirty();
      });
    }
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
    // Subscribe to diagram events
    diagram.on('node:added', (node: NodeModel) => {
      this.eventBus.emit('node:added', node);
      // Register node as obstacle for routing
      this.registerNodeAsObstacle(node);

      // Listen for node position/size changes
      node.on('position', () => {
        this.updateNodeObstacle(node);
      });

      node.on('size', () => {
        this.updateNodeObstacle(node);
      });
    });

    diagram.on('node:removed', (node: NodeModel) => {
      this.eventBus.emit('node:removed', node);
      // Unregister node obstacle
      this.unregisterNodeObstacle(node.id);
    });

    diagram.on('link:added', (link: LinkModel) => {
      this.eventBus.emit('link:added', link);
    });

    diagram.on('link:removed', (link: LinkModel) => {
      this.eventBus.emit('link:removed', link);
    });

    // Register all existing nodes as obstacles
    diagram.getNodes().forEach((node) => {
      this.registerNodeAsObstacle(node);

      // Listen for node position/size changes
      node.on('position', () => {
        this.updateNodeObstacle(node);
      });

      node.on('size', () => {
        this.updateNodeObstacle(node);
      });
    });
  }

  /**
   * Detach diagram
   */
  private detachDiagram(diagram: DiagramModel): void {
    // CRITICAL FIX: Unregister all node obstacles from routing engine
    // Without this, old diagram nodes remain as obstacles affecting new diagrams
    diagram.getNodes().forEach((node) => {
      this.unregisterNodeObstacle(node.id);
    });

    // CRITICAL FIX: Clear the old diagram to remove nodes from spatial index
    // Without this, old diagram nodes can interfere with hover detection in new diagrams
    // This ensures spatial indices and event listeners are cleaned up
    diagram.clear();

    // Unsubscribe from events
    // TODO: Store listener references in attachDiagram so we can remove them here
    // For now, leaving listeners attached as diagram might be reused
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
  private generateLinkPathWithRouting(
    link: LinkModel,
    sourcePos: Point,
    targetPos: Point,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom',
    sourceNode?: any,
    targetNode?: any
  ): void {
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

    const routedPath = this.routingEngine.route({
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

    // Set the link points from the routed path
    if (routedPath && routedPath.points.length > 0) {
      link.setPoints(routedPath.points);
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

  /**
   * Apply layout to current diagram
   *
   * @param config - Layout configuration
   * @returns Layout result with positions and metadata
   * @throws Error if no diagram is loaded or layout service is not initialized
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
