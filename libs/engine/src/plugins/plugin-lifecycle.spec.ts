/**
 * THE PLUGIN FRONT DOOR.
 *
 * `PluginManager` is a complete, tested lifecycle (register → install →
 * activate, with dependency checks, ordering and teardown). But the engine's
 * two entry points — `registerPlugin()` and the `config.plugins` boot list —
 * both called `register()` ONLY, which merely records the plugin. So the
 * documented way to add a plugin left it permanently INERT: `install()` and
 * `activate()` never ran, and a plugin's hooks never fired. Probed live before
 * the fix: hooks fired = [].
 *
 * That is this repo's signature bug one more time — machinery wired to
 * nothing — reached through the front door rather than at the barrel.
 */
import { DiagramEngine } from '../engine/DiagramEngine';

interface Fired {
  fired: string[];
}

function probePlugin(name = 'probe'): { plugin: unknown } & Fired {
  const fired: string[] = [];
  const plugin = {
    metadata: { name, version: '1.0.0' },
    // The real contract (types/plugin.types.ts): install/uninstall +
    // onActivate/onDeactivate. My first probe used `activate`, which the
    // interface does not declare — so it silently never fired and told me
    // nothing. Use the DECLARED names.
    install: async () => void fired.push('install'),
    uninstall: async () => void fired.push('uninstall'),
    onActivate: () => void fired.push('activate'),
    onDeactivate: () => void fired.push('deactivate'),
  };
  return { plugin, fired };
}

describe('engine.registerPlugin() runs the whole lifecycle', () => {
  it('installs AND activates — a registered plugin is live, not inert', async () => {
    const { plugin, fired } = probePlugin();
    const engine = new DiagramEngine();
    engine.createDiagram('p');

    await engine.registerPlugin(plugin as never);

    expect(fired).toEqual(['install', 'activate']);
    expect(engine.getPlugin('probe')).toBeDefined();
  });

  it('boot-time config.plugins are live too', async () => {
    const { plugin, fired } = probePlugin('booted');
    const engine = new DiagramEngine({ plugins: [plugin] } as never);
    // installPlugins() runs on construction; give the async lifecycle a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toEqual(['install', 'activate']);
    expect(engine.getPlugin('booted')).toBeDefined();
  });

  it('a plugin that throws on install does not take the engine down', async () => {
    const engine = new DiagramEngine();
    engine.createDiagram('p');
    const bad = {
      metadata: { name: 'bad', version: '1.0.0' },
      install: async () => {
        throw new Error('boom');
      },
      onActivate: () => undefined,
    };
    await expect(engine.registerPlugin(bad as never)).resolves.toBeUndefined();
    // …and a healthy plugin registered afterwards still works.
    const { plugin, fired } = probePlugin('healthy');
    await engine.registerPlugin(plugin as never);
    expect(fired).toEqual(['install', 'activate']);
  });
});
