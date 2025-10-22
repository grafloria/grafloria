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
import { AddNodeCommand } from '../commands/basic/AddNodeCommand';
import { RemoveNodeCommand } from '../commands/basic/RemoveNodeCommand';
import { AddLinkCommand } from '../commands/basic/AddLinkCommand';
import { RemoveLinkCommand } from '../commands/basic/RemoveLinkCommand';
import { DiagramMode, isValidDiagramMode, ModeChangeEvent } from './DiagramMode';
import { ModeManager } from './ModeManager';
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
import type { NodeTypeDefinition, LinkTypeDefinition } from '../validation/TypeRegistry';
import type { NodeBehavior } from '../types';

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

  // Current diagram
  private diagram: DiagramModel | null = null;

  // Configuration
  private config: DiagramEngineConfig;

  // State
  private initialized: boolean = false;
  private destroyed: boolean = false;

  constructor(config: DiagramEngineConfig = {}) {
    this.config = config;

    // Initialize core systems
    this.eventBus = new EventBus();
    this.store = new DiagramStore();

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
    this.validationEngine = new ValidationEngine(this.typeRegistry);
    this.serializer = new DiagramSerializer();
    this.performanceMonitor = new PerformanceMonitor(config.performance);

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
   * Add node
   */
  async addNode(config: {
    type: string;
    position: Point;
    size?: Size;
    data?: any;
  }): Promise<NodeModel> {
    if (!this.diagram) {
      throw new Error('No diagram loaded');
    }

    return this.performanceMonitor.measure('addNode', async () => {
      const node = new NodeModel(config);

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
   * Register node type
   */
  registerNodeType(descriptor: NodeTypeDefinition): void {
    this.typeRegistry.registerNodeType(descriptor);
  }

  /**
   * Register link type
   */
  registerLinkType(descriptor: LinkTypeDefinition): void {
    this.typeRegistry.registerLinkType(descriptor);
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
   * Attach diagram
   */
  private attachDiagram(diagram: DiagramModel): void {
    // Subscribe to diagram events
    diagram.on('node:added', (node: NodeModel) => {
      this.eventBus.emit('node:added', node);
    });

    diagram.on('node:removed', (node: NodeModel) => {
      this.eventBus.emit('node:removed', node);
    });

    diagram.on('link:added', (link: LinkModel) => {
      this.eventBus.emit('link:added', link);
    });

    diagram.on('link:removed', (link: LinkModel) => {
      this.eventBus.emit('link:removed', link);
    });
  }

  /**
   * Detach diagram
   */
  private detachDiagram(diagram: DiagramModel): void {
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
}
