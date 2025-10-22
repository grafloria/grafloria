// PluginManager tests

import { PluginManager } from './PluginManager';
import type { Plugin, PluginContext } from '../types/plugin.types';

describe('PluginManager', () => {
  let manager: PluginManager;
  let mockEngine: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockEngine = {};
    mockEventBus = {
      emit: jest.fn(),
    };
    manager = new PluginManager(mockEngine, mockEventBus);
  });

  describe('Plugin Registration', () => {
    it('should register a plugin', () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);

      expect(manager.has('test-plugin')).toBe(true);
      expect(manager.get('test-plugin')).toBe(plugin);
      expect(mockEventBus.emit).toHaveBeenCalledWith('plugin:registered', {
        name: 'test-plugin',
        metadata: plugin.metadata,
      });
    });

    it('should throw when registering duplicate plugin', () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);

      expect(() => manager.register(plugin)).toThrow("Plugin 'test-plugin' is already registered");
    });

    it('should unregister a plugin', async () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);
      await manager.unregister('test-plugin');

      expect(manager.has('test-plugin')).toBe(false);
    });
  });

  describe('Plugin Installation', () => {
    it('should install a plugin', async () => {
      const installFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: installFn,
      };

      manager.register(plugin);
      await manager.install('test-plugin');

      expect(installFn).toHaveBeenCalled();
      expect(manager.isInstalled('test-plugin')).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('plugin:installed', {
        name: 'test-plugin',
        metadata: plugin.metadata,
      });
    });

    it('should auto-activate plugin after installation', async () => {
      const onActivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: onActivateFn,
      };

      manager.register(plugin);
      await manager.install('test-plugin');

      expect(onActivateFn).toHaveBeenCalled();
      expect(manager.isActive('test-plugin')).toBe(true);
    });

    it('should not auto-activate when disabled', async () => {
      const managerNoAuto = new PluginManager(mockEngine, mockEventBus, {
        autoActivate: false,
      });

      const onActivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: onActivateFn,
      };

      managerNoAuto.register(plugin);
      await managerNoAuto.install('test-plugin');

      expect(onActivateFn).not.toHaveBeenCalled();
      expect(managerNoAuto.isActive('test-plugin')).toBe(false);
    });

    it('should throw when installing unregistered plugin', async () => {
      await expect(manager.install('nonexistent')).rejects.toThrow(
        "Plugin 'nonexistent' is not registered"
      );
    });

    it('should throw when installing already installed plugin', async () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);
      await manager.install('test-plugin');

      await expect(manager.install('test-plugin')).rejects.toThrow(
        "Plugin 'test-plugin' is already installed"
      );
    });

    it('should pass config to plugin context', async () => {
      let receivedContext: PluginContext | null = null;
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: (ctx) => {
          receivedContext = ctx;
        },
      };

      const config = { apiKey: 'test-key' };
      manager.register(plugin, config);
      await manager.install('test-plugin');

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.config).toEqual(config);
      expect(receivedContext!.engine).toBe(mockEngine);
      expect(receivedContext!.eventBus).toBe(mockEventBus);
    });
  });

  describe('Plugin Uninstallation', () => {
    it('should uninstall a plugin', async () => {
      const uninstallFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        uninstall: uninstallFn,
      };

      manager.register(plugin);
      await manager.install('test-plugin');
      await manager.uninstall('test-plugin');

      expect(uninstallFn).toHaveBeenCalled();
      expect(manager.isInstalled('test-plugin')).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith('plugin:uninstalled', {
        name: 'test-plugin',
        metadata: plugin.metadata,
      });
    });

    it('should deactivate before uninstalling', async () => {
      const onDeactivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: jest.fn(),
        onDeactivate: onDeactivateFn,
      };

      manager.register(plugin);
      await manager.install('test-plugin');
      await manager.uninstall('test-plugin');

      expect(onDeactivateFn).toHaveBeenCalled();
      expect(manager.isActive('test-plugin')).toBe(false);
    });

    it('should throw when uninstalling unregistered plugin', async () => {
      await expect(manager.uninstall('nonexistent')).rejects.toThrow(
        "Plugin 'nonexistent' is not registered"
      );
    });

    it('should throw when uninstalling not installed plugin', async () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);

      await expect(manager.uninstall('test-plugin')).rejects.toThrow(
        "Plugin 'test-plugin' is not installed"
      );
    });
  });

  describe('Plugin Activation', () => {
    it('should activate an installed plugin', async () => {
      const onActivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: onActivateFn,
      };

      const managerNoAuto = new PluginManager(mockEngine, mockEventBus, {
        autoActivate: false,
      });

      managerNoAuto.register(plugin);
      await managerNoAuto.install('test-plugin');
      await managerNoAuto.activate('test-plugin');

      expect(onActivateFn).toHaveBeenCalled();
      expect(managerNoAuto.isActive('test-plugin')).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('plugin:activated', {
        name: 'test-plugin',
        metadata: plugin.metadata,
      });
    });

    it('should skip activation if already active', async () => {
      const onActivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: onActivateFn,
      };

      manager.register(plugin);
      await manager.install('test-plugin'); // Auto-activates

      onActivateFn.mockClear();
      await manager.activate('test-plugin'); // Should skip

      expect(onActivateFn).not.toHaveBeenCalled();
    });

    it('should throw when activating unregistered plugin', async () => {
      await expect(manager.activate('nonexistent')).rejects.toThrow(
        "Plugin 'nonexistent' is not registered"
      );
    });

    it('should throw when activating uninstalled plugin', async () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);

      await expect(manager.activate('test-plugin')).rejects.toThrow(
        "Plugin 'test-plugin' is not installed"
      );
    });
  });

  describe('Plugin Deactivation', () => {
    it('should deactivate an active plugin', async () => {
      const onDeactivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: jest.fn(),
        onDeactivate: onDeactivateFn,
      };

      manager.register(plugin);
      await manager.install('test-plugin'); // Auto-activates
      await manager.deactivate('test-plugin');

      expect(onDeactivateFn).toHaveBeenCalled();
      expect(manager.isActive('test-plugin')).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith('plugin:deactivated', {
        name: 'test-plugin',
        metadata: plugin.metadata,
      });
    });

    it('should skip deactivation if already inactive', async () => {
      const onDeactivateFn = jest.fn();
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onDeactivate: onDeactivateFn,
      };

      const managerNoAuto = new PluginManager(mockEngine, mockEventBus, {
        autoActivate: false,
      });

      managerNoAuto.register(plugin);
      await managerNoAuto.install('test-plugin'); // Does not auto-activate
      await managerNoAuto.deactivate('test-plugin'); // Should skip

      expect(onDeactivateFn).not.toHaveBeenCalled();
    });
  });

  describe('Plugin Listing', () => {
    beforeEach(async () => {
      const plugin1: Plugin = {
        metadata: { name: 'plugin-1', version: '1.0.0' },
        install: jest.fn(),
      };
      const plugin2: Plugin = {
        metadata: { name: 'plugin-2', version: '2.0.0' },
        install: jest.fn(),
      };
      const plugin3: Plugin = {
        metadata: { name: 'plugin-3', version: '3.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin1);
      manager.register(plugin2);
      manager.register(plugin3);

      await manager.install('plugin-1');
      await manager.install('plugin-2');
      // plugin-3 not installed
    });

    it('should list all registered plugins', () => {
      const list = manager.list();

      expect(list).toHaveLength(3);
      expect(list.map((p) => p.name)).toEqual(['plugin-1', 'plugin-2', 'plugin-3']);
    });

    it('should list installed plugins', () => {
      const list = manager.listInstalled();

      expect(list).toHaveLength(2);
      expect(list.map((p) => p.name)).toEqual(['plugin-1', 'plugin-2']);
    });

    it('should list active plugins', () => {
      const list = manager.listActive();

      expect(list).toHaveLength(2); // Auto-activated
      expect(list.map((p) => p.name)).toEqual(['plugin-1', 'plugin-2']);
    });
  });

  describe('Bulk Operations', () => {
    it('should install all registered plugins', async () => {
      const plugin1: Plugin = {
        metadata: { name: 'plugin-1', version: '1.0.0' },
        install: jest.fn(),
      };
      const plugin2: Plugin = {
        metadata: { name: 'plugin-2', version: '2.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin1);
      manager.register(plugin2);

      await manager.installAll();

      expect(manager.isInstalled('plugin-1')).toBe(true);
      expect(manager.isInstalled('plugin-2')).toBe(true);
    });

    it('should uninstall all plugins', async () => {
      const plugin1: Plugin = {
        metadata: { name: 'plugin-1', version: '1.0.0' },
        install: jest.fn(),
      };
      const plugin2: Plugin = {
        metadata: { name: 'plugin-2', version: '2.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin1);
      manager.register(plugin2);
      await manager.installAll();
      await manager.uninstallAll();

      expect(manager.isInstalled('plugin-1')).toBe(false);
      expect(manager.isInstalled('plugin-2')).toBe(false);
    });

    it('should clear all plugins', async () => {
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
      };

      manager.register(plugin);
      await manager.install('test-plugin');
      await manager.clear();

      expect(manager.has('test-plugin')).toBe(false);
      expect(manager.list()).toHaveLength(0);
    });
  });

  describe('Dependency Management', () => {
    it('should install plugins in dependency order', async () => {
      const installOrder: string[] = [];

      const pluginA: Plugin = {
        metadata: { name: 'plugin-a', version: '1.0.0', dependencies: ['plugin-b'] },
        install: () => {
          installOrder.push('plugin-a');
        },
      };
      const pluginB: Plugin = {
        metadata: { name: 'plugin-b', version: '1.0.0' },
        install: () => {
          installOrder.push('plugin-b');
        },
      };

      manager.register(pluginA);
      manager.register(pluginB);

      await manager.installAll();

      expect(installOrder).toEqual(['plugin-b', 'plugin-a']);
    });

    it('should warn about missing dependencies in non-strict mode', async () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

      const plugin: Plugin = {
        metadata: { name: 'plugin-a', version: '1.0.0', dependencies: ['plugin-b'] },
        install: jest.fn(),
      };

      manager.register(plugin);
      await manager.install('plugin-a');

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining("Missing dependencies for plugin 'plugin-a'")
      );

      consoleWarn.mockRestore();
    });

    it('should throw on missing dependencies in strict mode', async () => {
      const strictManager = new PluginManager(mockEngine, mockEventBus, {
        strict: true,
      });

      const plugin: Plugin = {
        metadata: { name: 'plugin-a', version: '1.0.0', dependencies: ['plugin-b'] },
        install: jest.fn(),
      };

      strictManager.register(plugin);

      await expect(strictManager.install('plugin-a')).rejects.toThrow(
        "Missing dependencies for plugin 'plugin-a'"
      );
    });
  });

  describe('Error Handling', () => {
    it('should capture installation errors', async () => {
      const error = new Error('Installation failed');
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: () => {
          throw error;
        },
      };

      manager.register(plugin);

      await expect(manager.install('test-plugin')).rejects.toThrow('Installation failed');

      const state = manager.getState('test-plugin');
      expect(state?.error).toBe(error);
      expect(mockEventBus.emit).toHaveBeenCalledWith('plugin:error', {
        name: 'test-plugin',
        error,
      });
    });

    it('should capture activation errors', async () => {
      const error = new Error('Activation failed');
      const plugin: Plugin = {
        metadata: { name: 'test-plugin', version: '1.0.0' },
        install: jest.fn(),
        onActivate: () => {
          throw error;
        },
      };

      const managerNoAuto = new PluginManager(mockEngine, mockEventBus, {
        autoActivate: false,
      });

      managerNoAuto.register(plugin);
      await managerNoAuto.install('test-plugin');

      await expect(managerNoAuto.activate('test-plugin')).rejects.toThrow(
        'Activation failed'
      );

      const state = managerNoAuto.getState('test-plugin');
      expect(state?.error).toBe(error);
    });
  });
});
