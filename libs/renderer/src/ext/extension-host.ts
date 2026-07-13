/**
 * ============================================================================
 * Card 0 — the ExtensionHost, and Card 7 — the capability-scoped sandbox
 * ============================================================================
 *
 * Before Wave 6 the extension story was seven unrelated registries, reached by
 * importing whatever module happened to own them:
 *
 *   registerShape / registerPathShape        (renderer, module-global map)
 *   registerLinkTemplate / registerLabelTemplate / registerMarker
 *                                            (renderer, module-global maps)
 *   RoutingEngine.registerRouter             (engine, per-engine instance)
 *   TemplateRegistry.register                (engine, per-engine instance)
 *   CustomAnimationRegistry.register         (renderer, global singleton)
 *   PropertyEditorRegistryService            (ANGULAR-only — see note below)
 *   HandleRegistryService                    (ANGULAR-only)
 *
 * Not one of them returned a disposer, three had no removal path at all, and two
 * were reachable only from Angular. There was no way to answer "what did this
 * plugin add?" or "unload it".
 *
 * The ExtensionHost is the ONE public seam over those. It is a FACADE — it does
 * not reimplement a single registry — and it adds exactly what they lacked:
 *
 *   • ONE entry point, `host.register(extension)`.
 *   • LEAST PRIVILEGE. An extension declares `capabilities: ['shapes']` and
 *     receives an object with ONLY `shapes` on it. There is no `engine` handle,
 *     no `document`, no way to reach a registry it did not ask for. Asking for a
 *     capability the host was not given (e.g. `routers` with no engine bound)
 *     fails AT REGISTRATION, not at first use.
 *   • DISPOSERS EVERYWHERE. Every registration is tracked; `dispose()` unwinds
 *     the extension completely and RESTORES anything it overrode.
 *   • ENGINE COMPAT. A manifest declares the engine range it supports and is
 *     REJECTED — loudly — if it does not match.
 *   • LAZY LOADING. `registerLazy()` takes a `() => Promise<Extension>` and does
 *     not touch it until `activate(id)`.
 *
 * ---------------------------------------------------------------------------
 * NOTE — the two Angular-only registries
 * ---------------------------------------------------------------------------
 * `PropertyEditorRegistryService` and `HandleRegistryService` are Angular
 * `@Injectable`s living in `libs/renderer-angular`. `libs/renderer` may not
 * import Angular (hard rule), so they CANNOT be wrapped from here without first
 * being lowered into the framework-free core. That lowering is a real piece of
 * work and is NOT in this wave — stated plainly rather than faked with an
 * any-typed shim. The host is designed for it: adding `editors` / `handles` to
 * `CapabilityName` is additive and breaks nothing.
 */

import type { DiagramEngine } from '@grafloria/engine';
import type {
  CapabilityName,
  ExtensionCapabilities,
  ExtensionContext,
  HostBindings,
} from './capabilities';
import type { Disposer } from './disposable';
import { DisposableStore } from './disposable';
import { buildCapabilities } from './capability-factory';
import type { ExtensionManifest } from './manifest';
import { assertEngineCompatible, validateManifest } from './manifest';

/** The engine/host API version extensions declare compatibility against. */
export const EXTENSION_API_VERSION = '1.0.0';

/**
 * An extension. `activate` receives ONLY the capabilities its manifest declared.
 *
 * ```ts
 * const starPlugin: Extension<'shapes'> = {
 *   manifest: {
 *     id: 'acme.stars',
 *     version: '1.2.0',
 *     engines: { grafloria: '^1.0.0' },
 *     capabilities: ['shapes'],
 *   },
 *   activate({ capabilities }) {
 *     // `capabilities.routers` does not exist here — not typed, not present.
 *     capabilities.shapes.registerPath('star', starPath);
 *   },
 * };
 * host.register(starPlugin);
 * ```
 */
export interface Extension<C extends CapabilityName = CapabilityName> {
  manifest: ExtensionManifest<C>;
  /**
   * Set up. Anything you register is tracked and undone on dispose; you may also
   * return a disposer (or push onto `context.onDispose`) for your own resources.
   */
  activate(context: ExtensionContext<C>): void | Disposer | Promise<void | Disposer>;
  /** Optional explicit teardown, run before the tracked disposers. */
  deactivate?(): void;
}

/** A lazily-loaded extension: nothing is imported until `activate(id)`. */
export type LazyExtension<C extends CapabilityName = CapabilityName> = () => Promise<
  Extension<C> | { default: Extension<C> }
>;

export interface RegisteredExtension {
  readonly manifest: ExtensionManifest;
  readonly active: boolean;
  /** Registrations this extension currently holds. */
  readonly registrationCount: number;
}

export interface ExtensionHostOptions extends HostBindings {
  /** Reject manifests whose `engines.grafloria` range excludes this. */
  apiVersion?: string;
}

interface Entry {
  manifest: ExtensionManifest;
  extension?: Extension<CapabilityName>;
  lazy?: LazyExtension<CapabilityName>;
  store: DisposableStore;
  active: boolean;
}

export class ExtensionHost {
  private readonly entries = new Map<string, Entry>();
  private readonly bindings: HostBindings;
  private readonly apiVersion: string;
  private disposed = false;

  constructor(options: ExtensionHostOptions) {
    this.bindings = options;
    this.apiVersion = options.apiVersion ?? EXTENSION_API_VERSION;
  }

  /** The engine this host is bound to (hosts, not extensions, may ask). */
  get engine(): DiagramEngine {
    return this.bindings.engine;
  }

  /**
   * Register and ACTIVATE an extension.
   *
   * Throws — deliberately, and before any side effect — when the manifest is
   * malformed, the id is taken, the engine range excludes this host, or the
   * extension asks for a capability this host cannot grant. A plugin that half-
   * loads is worse than one that refuses to.
   */
  register<C extends CapabilityName>(extension: Extension<C>): Disposer {
    this.assertLive();
    const manifest = extension.manifest;
    validateManifest(manifest);
    assertEngineCompatible(manifest, this.apiVersion);
    this.assertIdFree(manifest.id);
    this.assertGrantable(manifest);

    const entry: Entry = {
      manifest: manifest as ExtensionManifest,
      extension: extension as unknown as Extension<CapabilityName>,
      store: new DisposableStore(),
      active: false,
    };
    this.entries.set(manifest.id, entry);

    try {
      this.activateEntry(entry);
    } catch (error) {
      // Roll back anything the failed activate() managed to register, so a
      // broken plugin cannot leave shrapnel in the registries.
      entry.store.dispose();
      this.entries.delete(manifest.id);
      throw error;
    }

    return () => this.dispose(manifest.id);
  }

  /**
   * Register WITHOUT loading. The factory is not called until `activate(id)`,
   * so a 500 KB plugin costs nothing until something needs it.
   *
   * The manifest is supplied up front precisely so the host can answer "what
   * shapes/routers exist?" and validate compatibility WITHOUT paying the import.
   */
  registerLazy<C extends CapabilityName>(
    manifest: ExtensionManifest<C>,
    load: LazyExtension<C>
  ): Disposer {
    this.assertLive();
    validateManifest(manifest);
    assertEngineCompatible(manifest, this.apiVersion);
    this.assertIdFree(manifest.id);
    this.assertGrantable(manifest);

    this.entries.set(manifest.id, {
      manifest: manifest as ExtensionManifest,
      lazy: load as unknown as LazyExtension<CapabilityName>,
      store: new DisposableStore(),
      active: false,
    });

    return () => this.dispose(manifest.id);
  }

  /** Activate a lazily-registered extension (imports it on first call). */
  async activate(id: string): Promise<void> {
    this.assertLive();
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`[ExtensionHost] unknown extension '${id}'`);
    if (entry.active) return;

    if (!entry.extension && entry.lazy) {
      const loaded = await entry.lazy();
      const resolved = (loaded as { default?: Extension<CapabilityName> }).default ?? loaded;
      entry.extension = resolved as Extension<CapabilityName>;

      // The lazily-loaded module could ship a manifest that disagrees with the
      // one we validated. Trust the DECLARED one (we gated on it) and refuse the
      // mismatch rather than silently widening the extension's privileges.
      const actual = entry.extension.manifest;
      if (actual && actual.id !== entry.manifest.id) {
        throw new Error(
          `[ExtensionHost] lazy extension '${entry.manifest.id}' loaded a manifest for ` +
            `'${actual.id}' — refusing (a plugin may not change its identity on load)`
        );
      }
    }

    if (!entry.extension) {
      throw new Error(`[ExtensionHost] extension '${id}' has no implementation`);
    }

    try {
      await this.activateEntry(entry);
    } catch (error) {
      entry.store.dispose();
      throw error;
    }
  }

  private activateEntry(entry: Entry): void | Promise<void> {
    const extension = entry.extension;
    if (!extension) return;

    const capabilities = buildCapabilities(
      entry.manifest.capabilities,
      this.bindings,
      entry.store
    );

    const context: ExtensionContext<CapabilityName> = {
      id: entry.manifest.id,
      capabilities: capabilities as Pick<ExtensionCapabilities, CapabilityName>,
      onDispose: (disposer) => {
        entry.store.add(disposer);
      },
    };

    const result = extension.activate(context);

    const finish = (returned: void | Disposer): void => {
      if (typeof returned === 'function') entry.store.add(returned);
      entry.active = true;
      // A contributed shape/connector changes the picture, so ask for a repaint.
      this.bindings.requestRender?.();
    };

    if (result && typeof (result as Promise<void>).then === 'function') {
      return (result as Promise<void | Disposer>).then(finish);
    }
    finish(result as void | Disposer);
  }

  /** Tear one extension down. Every registration it made is undone. */
  dispose(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);

    try {
      if (entry.active) entry.extension?.deactivate?.();
    } finally {
      // Even if deactivate() throws, the registrations MUST come out.
      entry.store.dispose();
      entry.active = false;
      this.bindings.requestRender?.();
    }
  }

  /** Tear everything down. The host is unusable afterwards. */
  disposeAll(): void {
    if (this.disposed) return;
    for (const id of [...this.entries.keys()]) this.dispose(id);
    this.disposed = true;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): RegisteredExtension | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    return {
      manifest: entry.manifest,
      active: entry.active,
      registrationCount: entry.store.size,
    };
  }

  /** Everything registered, loaded or not. */
  list(): RegisteredExtension[] {
    return [...this.entries.values()].map((entry) => ({
      manifest: entry.manifest,
      active: entry.active,
      registrationCount: entry.store.size,
    }));
  }

  // -- guards ---------------------------------------------------------------

  private assertLive(): void {
    if (this.disposed) throw new Error('[ExtensionHost] host has been disposed');
  }

  private assertIdFree(id: string): void {
    if (this.entries.has(id)) {
      throw new Error(`[ExtensionHost] extension '${id}' is already registered`);
    }
  }

  /**
   * Least privilege, enforced EARLY. An extension that declares `panels` in a
   * headless host (no DOM bound) is rejected here — not at first `createPanel()`
   * call three minutes into a session.
   */
  private assertGrantable(manifest: ExtensionManifest<CapabilityName>): void {
    for (const capability of manifest.capabilities) {
      if (capability === 'panels' && !this.bindings.root) {
        throw new Error(
          `[ExtensionHost] extension '${manifest.id}' declares the 'panels' capability, ` +
            `but this host has no DOM root bound (headless). Refusing to register.`
        );
      }
      if (capability === 'routers' && !this.bindings.engine) {
        throw new Error(
          `[ExtensionHost] extension '${manifest.id}' declares 'routers', but this ` +
            `host has no engine bound. Refusing to register.`
        );
      }
      if (capability === 'templates' && !this.bindings.templateRegistry) {
        throw new Error(
          `[ExtensionHost] extension '${manifest.id}' declares 'templates', but this host ` +
            `has no TemplateRegistry bound. Pass one as \`templateRegistry\` — the engine ` +
            `does not expose it, so the host cannot find it for you.`
        );
      }
    }
  }
}

/** Convenience: a host bound to a live `createDiagram()` instance. */
export function createExtensionHost(options: ExtensionHostOptions): ExtensionHost {
  return new ExtensionHost(options);
}
