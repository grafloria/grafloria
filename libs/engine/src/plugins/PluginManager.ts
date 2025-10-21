// PluginManager - Manages plugin lifecycle and dependencies

import type {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginConfig,
} from '../types/plugin.types';

export interface PluginState {
  plugin: Plugin;
  installed: boolean;
  active: boolean;
  config: Record<string, any>;
  error?: Error;
}

export interface PluginManagerConfig {
  autoActivate?: boolean; // Auto-activate plugins after installation
  strict?: boolean; // Throw on dependency errors
}

export class PluginManager {
  private plugins: Map<string, PluginState> = new Map();
  private context: PluginContext;
  private config: PluginManagerConfig;
  private installationOrder: string[] = [];

  constructor(
    engine: any,
    eventBus: any,
    config: PluginManagerConfig = {}
  ) {
    this.config = {
      autoActivate: true,
      strict: false,
      ...config,
    };

    this.context = {
      engine,
      eventBus,
      config: {},
    };
  }

  /**
   * Register a plugin (without installing)
   */
  register(plugin: Plugin, config: Record<string, any> = {}): void {
    const name = plugin.metadata.name;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin '${name}' is already registered`);
    }

    this.plugins.set(name, {
      plugin,
      installed: false,
      active: false,
      config,
      error: undefined,
    });

    this.context.eventBus?.emit('plugin:registered', { name, metadata: plugin.metadata });
  }

  /**
   * Install a plugin
   */
  async install(pluginName: string): Promise<void> {
    const state = this.plugins.get(pluginName);

    if (!state) {
      throw new Error(`Plugin '${pluginName}' is not registered`);
    }

    if (state.installed) {
      throw new Error(`Plugin '${pluginName}' is already installed`);
    }

    try {
      // Check dependencies
      await this.checkDependencies(state.plugin);

      // Create plugin context with config
      const pluginContext: PluginContext = {
        ...this.context,
        config: state.config,
      };

      // Call install hook
      await state.plugin.install(pluginContext);

      // Update state
      state.installed = true;
      this.installationOrder.push(pluginName);

      this.context.eventBus?.emit('plugin:installed', {
        name: pluginName,
        metadata: state.plugin.metadata,
      });

      // Auto-activate if configured
      if (this.config.autoActivate) {
        await this.activate(pluginName);
      }
    } catch (error) {
      state.error = error as Error;
      this.context.eventBus?.emit('plugin:error', {
        name: pluginName,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(pluginName: string): Promise<void> {
    const state = this.plugins.get(pluginName);

    if (!state) {
      throw new Error(`Plugin '${pluginName}' is not registered`);
    }

    if (!state.installed) {
      throw new Error(`Plugin '${pluginName}' is not installed`);
    }

    try {
      // Deactivate if active
      if (state.active) {
        await this.deactivate(pluginName);
      }

      // Create plugin context
      const pluginContext: PluginContext = {
        ...this.context,
        config: state.config,
      };

      // Call uninstall hook if exists
      if (state.plugin.uninstall) {
        await state.plugin.uninstall(pluginContext);
      }

      // Update state
      state.installed = false;
      state.error = undefined;

      // Remove from installation order
      const index = this.installationOrder.indexOf(pluginName);
      if (index !== -1) {
        this.installationOrder.splice(index, 1);
      }

      this.context.eventBus?.emit('plugin:uninstalled', {
        name: pluginName,
        metadata: state.plugin.metadata,
      });
    } catch (error) {
      state.error = error as Error;
      this.context.eventBus?.emit('plugin:error', {
        name: pluginName,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Activate a plugin
   */
  async activate(pluginName: string): Promise<void> {
    const state = this.plugins.get(pluginName);

    if (!state) {
      throw new Error(`Plugin '${pluginName}' is not registered`);
    }

    if (!state.installed) {
      throw new Error(`Plugin '${pluginName}' is not installed. Install it first.`);
    }

    if (state.active) {
      return; // Already active
    }

    try {
      // Create plugin context
      const pluginContext: PluginContext = {
        ...this.context,
        config: state.config,
      };

      // Call activate hook if exists
      if (state.plugin.onActivate) {
        state.plugin.onActivate(pluginContext);
      }

      // Update state
      state.active = true;

      this.context.eventBus?.emit('plugin:activated', {
        name: pluginName,
        metadata: state.plugin.metadata,
      });
    } catch (error) {
      state.error = error as Error;
      this.context.eventBus?.emit('plugin:error', {
        name: pluginName,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(pluginName: string): Promise<void> {
    const state = this.plugins.get(pluginName);

    if (!state) {
      throw new Error(`Plugin '${pluginName}' is not registered`);
    }

    if (!state.active) {
      return; // Already inactive
    }

    try {
      // Create plugin context
      const pluginContext: PluginContext = {
        ...this.context,
        config: state.config,
      };

      // Call deactivate hook if exists
      if (state.plugin.onDeactivate) {
        state.plugin.onDeactivate(pluginContext);
      }

      // Update state
      state.active = false;

      this.context.eventBus?.emit('plugin:deactivated', {
        name: pluginName,
        metadata: state.plugin.metadata,
      });
    } catch (error) {
      state.error = error as Error;
      this.context.eventBus?.emit('plugin:error', {
        name: pluginName,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Get plugin by name
   */
  get(pluginName: string): Plugin | undefined {
    return this.plugins.get(pluginName)?.plugin;
  }

  /**
   * Check if plugin is registered
   */
  has(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * Check if plugin is installed
   */
  isInstalled(pluginName: string): boolean {
    return this.plugins.get(pluginName)?.installed ?? false;
  }

  /**
   * Check if plugin is active
   */
  isActive(pluginName: string): boolean {
    return this.plugins.get(pluginName)?.active ?? false;
  }

  /**
   * Get plugin state
   */
  getState(pluginName: string): PluginState | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * List all registered plugins
   */
  list(): PluginMetadata[] {
    return Array.from(this.plugins.values()).map((state) => state.plugin.metadata);
  }

  /**
   * List installed plugins
   */
  listInstalled(): PluginMetadata[] {
    return Array.from(this.plugins.values())
      .filter((state) => state.installed)
      .map((state) => state.plugin.metadata);
  }

  /**
   * List active plugins
   */
  listActive(): PluginMetadata[] {
    return Array.from(this.plugins.values())
      .filter((state) => state.active)
      .map((state) => state.plugin.metadata);
  }

  /**
   * Unregister a plugin (removes from registry)
   */
  async unregister(pluginName: string): Promise<void> {
    const state = this.plugins.get(pluginName);

    if (!state) {
      return; // Not registered
    }

    // Uninstall if installed
    if (state.installed) {
      await this.uninstall(pluginName);
    }

    // Remove from registry
    this.plugins.delete(pluginName);

    this.context.eventBus?.emit('plugin:unregistered', {
      name: pluginName,
      metadata: state.plugin.metadata,
    });
  }

  /**
   * Install all registered plugins
   */
  async installAll(): Promise<void> {
    const pluginNames = Array.from(this.plugins.keys());

    // Sort by dependencies
    const sorted = await this.topologicalSort(pluginNames);

    for (const name of sorted) {
      const state = this.plugins.get(name);
      if (state && !state.installed) {
        await this.install(name);
      }
    }
  }

  /**
   * Uninstall all plugins
   */
  async uninstallAll(): Promise<void> {
    // Uninstall in reverse order
    const reversed = [...this.installationOrder].reverse();

    for (const name of reversed) {
      const state = this.plugins.get(name);
      if (state && state.installed) {
        await this.uninstall(name);
      }
    }
  }

  /**
   * Clear all plugins (uninstall and unregister)
   */
  async clear(): Promise<void> {
    await this.uninstallAll();

    this.plugins.clear();
    this.installationOrder = [];
  }

  /**
   * Check plugin dependencies
   */
  private async checkDependencies(plugin: Plugin): Promise<void> {
    if (!plugin.metadata.dependencies || plugin.metadata.dependencies.length === 0) {
      return;
    }

    const missing: string[] = [];
    const notInstalled: string[] = [];

    for (const dep of plugin.metadata.dependencies) {
      if (!this.has(dep)) {
        missing.push(dep);
      } else if (!this.isInstalled(dep)) {
        notInstalled.push(dep);
      }
    }

    if (missing.length > 0) {
      const error = `Missing dependencies for plugin '${plugin.metadata.name}': ${missing.join(', ')}`;
      if (this.config.strict) {
        throw new Error(error);
      } else {
        console.warn(error);
      }
    }

    if (notInstalled.length > 0) {
      const error = `Uninstalled dependencies for plugin '${plugin.metadata.name}': ${notInstalled.join(', ')}`;
      if (this.config.strict) {
        throw new Error(error);
      } else {
        console.warn(error);
      }
    }
  }

  /**
   * Topological sort for dependency resolution
   */
  private async topologicalSort(pluginNames: string[]): Promise<string[]> {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) {
        return;
      }

      visited.add(name);

      const plugin = this.plugins.get(name)?.plugin;
      if (plugin?.metadata.dependencies) {
        for (const dep of plugin.metadata.dependencies) {
          if (pluginNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      result.push(name);
    };

    for (const name of pluginNames) {
      visit(name);
    }

    return result;
  }
}
