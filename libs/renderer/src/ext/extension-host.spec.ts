/**
 * ExtensionHost — Cards 0 + 7.
 *
 * The point of these tests is NOT "the map stores the thing". It is:
 *   • the capability GRANT is enforced (you get only what you declared),
 *   • every registration is REVERSIBLE, and an override RESTORES the original,
 *   • a failed activate() leaves no shrapnel,
 *   • the semver gate actually rejects.
 */

import { DiagramEngine } from '@grafloria/engine';
import { ExtensionHost, createExtensionHost } from './extension-host';
import type { Extension } from './extension-host';
import {
  getShape,
  getShapeRegistryVersion,
  hasShape,
  listShapes,
  registerShape,
  unregisterShape,
} from '../svg/shape-registry';
import { listConnectors, getConnector } from './link-pipeline';
import { listTools, connectionValidatorCount, clearConnectionValidators, clearTools } from './tools';
import { satisfies } from './manifest';

describe('ExtensionHost (Card 0)', () => {
  let engine: DiagramEngine;
  let host: ExtensionHost;
  let root: HTMLElement;

  beforeEach(() => {
    engine = new DiagramEngine();
    engine.createDiagram('test');
    root = document.createElement('div');
    document.body.appendChild(root);
    host = createExtensionHost({ engine, root });
  });

  afterEach(() => {
    host.disposeAll();
    root.remove();
    clearTools();
    clearConnectionValidators();
    engine.destroy();
  });

  const shapesOnly: Extension<'shapes'> = {
    manifest: {
      id: 'test.shapes',
      version: '1.0.0',
      engines: { grafloria: '^1.0.0' },
      capabilities: ['shapes'],
      contributes: { shapes: ['test-star'] },
    },
    activate({ capabilities }) {
      capabilities.shapes.registerPath('test-star', 'M0,0 L10,0 L5,10 Z');
    },
  };

  it('activates an extension and its contribution reaches the REAL registry', () => {
    host.register(shapesOnly);

    expect(hasShape('test-star')).toBe(true);
    expect(listShapes()).toContain('test-star');
    expect(host.get('test.shapes')?.active).toBe(true);
  });

  it('disposing an extension removes every registration it made', () => {
    const dispose = host.register(shapesOnly);
    expect(hasShape('test-star')).toBe(true);

    dispose();

    expect(hasShape('test-star')).toBe(false);
    expect(host.has('test.shapes')).toBe(false);
  });

  // THE test for restore-on-dispose. A plugin that OVERRIDES a built-in and is
  // then unloaded must give the built-in back — not leave a hole that silently
  // falls through to the rect fallback.
  it('restores an OVERRIDDEN built-in shape on dispose, rather than deleting it', () => {
    const before = getShape('circle');
    expect(before.type).toBe('circle');

    const override: Extension<'shapes'> = {
      manifest: { id: 'test.override', version: '1.0.0', capabilities: ['shapes'] },
      activate({ capabilities }) {
        capabilities.shapes.register('circle', {
          outline: () => ({ el: 'rect', geom: { x: 0, y: 0, width: 1, height: 1 } }),
          boundaryPoint: () => null,
          portAnchor: (w: number, h: number) => ({ x: w, y: h }),
        });
      },
    };

    const dispose = host.register(override);
    expect(getShape('circle').outline(10, 10).el).toBe('rect'); // overridden

    dispose();

    const after = getShape('circle');
    expect(after.type).toBe('circle');
    expect(after.outline(10, 10).el).not.toBe('rect'); // the ORIGINAL is back
  });

  describe('capability grant (Card 7 — least privilege)', () => {
    it('materialises ONLY the declared capabilities', () => {
      let seen: string[] = [];

      host.register({
        manifest: { id: 'test.narrow', version: '1.0.0', capabilities: ['shapes'] },
        activate({ capabilities }) {
          seen = Object.keys(capabilities);
        },
      } as Extension<'shapes'>);

      expect(seen).toEqual(['shapes']);
      // The registries it did NOT ask for are not merely typed away — they are
      // absent at runtime, so there is nothing to reach for.
      expect(seen).not.toContain('routers');
      expect(seen).not.toContain('panels');
      expect(seen).not.toContain('tools');
    });

    it('grants several capabilities when several are declared', () => {
      let seen: string[] = [];
      host.register({
        manifest: {
          id: 'test.wide',
          version: '1.0.0',
          capabilities: ['shapes', 'links', 'tools', 'panels'],
        },
        activate({ capabilities }) {
          seen = Object.keys(capabilities).sort();
        },
      } as Extension<'shapes' | 'links' | 'tools' | 'panels'>);

      expect(seen).toEqual(['links', 'panels', 'shapes', 'tools']);
    });

    it("REFUSES an extension declaring 'panels' on a headless host (no DOM root)", () => {
      const headless = createExtensionHost({ engine });

      expect(() =>
        headless.register({
          manifest: { id: 'test.panels', version: '1.0.0', capabilities: ['panels'] },
          activate() {
            /* never runs */
          },
        } as Extension<'panels'>)
      ).toThrow(/no DOM root bound/);
    });

    it("REFUSES 'templates' when no TemplateRegistry is bound (the engine has no getter)", () => {
      expect(() =>
        host.register({
          manifest: { id: 'test.templates', version: '1.0.0', capabilities: ['templates'] },
          activate() {
            /* never runs */
          },
        } as Extension<'templates'>)
      ).toThrow(/no TemplateRegistry bound/);
    });

    it('rejects an unknown capability name', () => {
      expect(() =>
        host.register({
          manifest: {
            id: 'test.bogus',
            version: '1.0.0',
            capabilities: ['filesystem' as 'shapes'],
          },
          activate() {
            /* never runs */
          },
        })
      ).toThrow(/unknown capability/);
    });
  });

  describe('manifest validation + engine compat (Card 7)', () => {
    it('rejects an incompatible engine range BEFORE activating', () => {
      const activate = jest.fn();

      expect(() =>
        host.register({
          manifest: {
            id: 'test.old',
            version: '1.0.0',
            engines: { grafloria: '^0.5.0' }, // host is 1.0.0
            capabilities: [],
          },
          activate,
        })
      ).toThrow(/requires grafloria/);

      expect(activate).not.toHaveBeenCalled();
    });

    it('rejects a malformed version', () => {
      expect(() =>
        host.register({
          manifest: { id: 'test.bad', version: 'v1', capabilities: [] },
          activate: () => undefined,
        })
      ).toThrow(/invalid version/);
    });

    it('rejects a duplicate id', () => {
      host.register(shapesOnly);
      expect(() => host.register(shapesOnly)).toThrow(/already registered/);
    });
  });

  it('rolls back a FAILED activate() — a broken plugin leaves no shrapnel', () => {
    expect(() =>
      host.register({
        manifest: { id: 'test.broken', version: '1.0.0', capabilities: ['shapes'] },
        activate({ capabilities }) {
          capabilities.shapes.registerPath('half-registered', 'M0,0 L1,1 Z');
          throw new Error('boom');
        },
      } as Extension<'shapes'>)
    ).toThrow('boom');

    // The shape it managed to register before throwing must be gone.
    expect(hasShape('half-registered')).toBe(false);
    expect(host.has('test.broken')).toBe(false);
  });

  describe('lazy loading (Card 7)', () => {
    it('does NOT import the extension until activate() is called', async () => {
      const load = jest.fn(async () => shapesOnly);

      host.registerLazy(
        {
          id: 'test.shapes',
          version: '1.0.0',
          capabilities: ['shapes'],
          contributes: { shapes: ['test-star'] },
        },
        load
      );

      // Registered and INTROSPECTABLE, but not loaded — that is the whole point:
      // a palette can list its contributions without paying the import.
      expect(host.has('test.shapes')).toBe(true);
      expect(host.get('test.shapes')?.active).toBe(false);
      expect(host.get('test.shapes')?.manifest.contributes?.shapes).toEqual(['test-star']);
      expect(load).not.toHaveBeenCalled();
      expect(hasShape('test-star')).toBe(false);

      await host.activate('test.shapes');

      expect(load).toHaveBeenCalledTimes(1);
      expect(hasShape('test-star')).toBe(true);
    });

    it('validates the manifest at REGISTER time, not load time', () => {
      expect(() =>
        host.registerLazy(
          { id: 'test.lazy-bad', version: '1.0.0', engines: { grafloria: '^9.0.0' }, capabilities: [] },
          async () => shapesOnly
        )
      ).toThrow(/requires grafloria/);
    });

    it('refuses a lazy module that loads a DIFFERENT identity', async () => {
      host.registerLazy(
        { id: 'test.declared', version: '1.0.0', capabilities: ['shapes'] },
        async () => shapesOnly // manifest.id === 'test.shapes'
      );

      await expect(host.activate('test.declared')).rejects.toThrow(/may not change its identity/);
    });
  });

  it('disposeAll() unwinds every extension', () => {
    host.register(shapesOnly);
    host.register({
      manifest: { id: 'test.tool', version: '1.0.0', capabilities: ['tools'] },
      activate({ capabilities }) {
        capabilities.tools.register({ id: 'custom', hitTest: () => false });
        capabilities.tools.registerConnectionValidator(() => true);
      },
    } as Extension<'tools'>);

    expect(listTools()).toContain('custom');
    expect(connectionValidatorCount()).toBe(1);

    host.disposeAll();

    expect(hasShape('test-star')).toBe(false);
    expect(listTools()).not.toContain('custom');
    // The validator subscription is gone — this is the leak the "every
    // register() returns a disposer" rule exists to prevent.
    expect(connectionValidatorCount()).toBe(0);
  });

  it('reports registration counts per extension', () => {
    host.register({
      manifest: { id: 'test.many', version: '1.0.0', capabilities: ['links'] },
      activate({ capabilities }) {
        capabilities.links.registerConnector('c1', () => 'M0,0');
        capabilities.links.registerConnector('c2', () => 'M0,0');
      },
    } as Extension<'links'>);

    expect(host.get('test.many')?.registrationCount).toBe(2);
    expect(listConnectors()).toEqual(expect.arrayContaining(['c1', 'c2']));

    host.dispose('test.many');
    expect(getConnector('c1')).toBeUndefined();
  });
});

describe('semver matcher (Card 7)', () => {
  it.each([
    ['1.0.0', '^1.0.0', true],
    ['1.9.3', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.9.0', '^1.0.0', false],
    ['1.2.5', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    ['1.0.0', '>=1.0.0', true],
    ['0.9.9', '>=1.0.0', false],
    ['1.5.0', '1.x', true],
    ['2.0.0', '1.x', false],
    ['1.0.0', '*', true],
    ['1.0.0', '1.0.0', true],
    ['1.0.1', '1.0.0', false],
    ['2.0.0', '^1.0.0 || ^2.0.0', true],
    // ^0.x treats MINOR as the breaking axis.
    ['0.2.9', '^0.2.0', true],
    ['0.3.0', '^0.2.0', false],
  ])('satisfies(%s, %s) === %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });
});

describe('shape registry removal (the additive API the disposers needed)', () => {
  it('registerShape → unregisterShape round-trips', () => {
    registerShape('spec-temp', {
      outline: () => ({ el: 'rect', geom: {} }),
      boundaryPoint: () => null,
      portAnchor: (w: number, h: number) => ({ x: w, y: h }),
    });
    expect(hasShape('spec-temp')).toBe(true);

    expect(unregisterShape('spec-temp')).toBe(true);
    expect(hasShape('spec-temp')).toBe(false);
    expect(unregisterShape('spec-temp')).toBe(false); // idempotent
  });

  it('the version counter bumps on add AND remove (cache invalidation)', () => {
    const before = getShapeRegistryVersion();

    registerShape('spec-version', {
      outline: () => ({ el: 'rect', geom: {} }),
      boundaryPoint: () => null,
      portAnchor: (w: number, h: number) => ({ x: w, y: h }),
    });
    const afterAdd = getShapeRegistryVersion();
    expect(afterAdd).toBeGreaterThan(before);

    unregisterShape('spec-version');
    expect(getShapeRegistryVersion()).toBeGreaterThan(afterAdd);
  });
});
