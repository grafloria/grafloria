// Plugin system type definitions

export interface PluginMetadata {
  name: string;
  version: string;
  author?: string;
  description?: string;
  dependencies?: string[];
}

export interface PluginContext {
  engine: any; // Will be typed as DiagramEngine when available
  eventBus: any; // Will be typed as EventBus when available
  config: Record<string, any>;
}

export interface Plugin {
  metadata: PluginMetadata;
  install(context: PluginContext): void | Promise<void>;
  uninstall?(context: PluginContext): void | Promise<void>;
  onActivate?(context: PluginContext): void;
  onDeactivate?(context: PluginContext): void;
}

export interface PluginConfig {
  enabled: boolean;
  config?: Record<string, any>;
}

export interface PluginRegistry {
  register(plugin: Plugin): void;
  unregister(pluginName: string): void;
  get(pluginName: string): Plugin | undefined;
  has(pluginName: string): boolean;
  list(): PluginMetadata[];
}
