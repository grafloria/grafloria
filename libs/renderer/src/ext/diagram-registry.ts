/**
 * ============================================================================
 * `DiagramRegistry` — one diagram's contribution surface
 * ============================================================================
 *
 * Every method here exists as a module-level function already. What this adds is
 * an ANSWER TO "WHOSE?".
 *
 *   registerShape('badge', …)          // the process. Everyone's.
 *   diagram.registry.registerShape(…)  // this diagram. Nobody else's.
 *
 * The two layer: a diagram resolves a name against its own table first and falls
 * through to the process-global registry, so an app that registers its shape
 * library once at import time keeps working unchanged in every diagram, and a
 * single diagram can still override one name for itself without mutating what
 * the diagram beside it sees.
 *
 * ONE IMPLEMENTATION, TWO BINDINGS. `GLOBAL_DIAGRAM_REGISTRY` is this same class
 * with a null scope, so the process-wide path and the per-diagram path are the
 * same code with the same disposer semantics. That is deliberate: the previous
 * arrangement had the ExtensionHost's restore-on-dispose logic written once, for
 * the global registries only, and the whole bug was that it then ran on behalf
 * of a diagram that did not own what it was restoring.
 *
 * DISPOSERS RESTORE, they do not merely delete — the rule `ext/disposable.ts`
 * states. Scoped disposers restore the SCOPE's previous entry, which may be
 * "nothing", in which case the global definition becomes visible again. That
 * layering is the point: unloading a diagram's override reveals the built-in,
 * it does not punch a hole through to the fallback.
 */

import type { Disposer } from './disposable';
import { once } from './disposable';
import {
  ANCHORS,
  CONNECTION_POINTS,
  CONNECTORS,
  LABEL_TEMPLATES,
  LINK_TEMPLATES,
  MARKERS,
  SHAPES,
  STYLES,
  RegistryScope,
  runInRegistryScope,
} from './registry-scope';

import {
  buildPathShapeDefinition,
  getShapeDefinition,
  hasShape,
  listShapes,
  notifyShapeRegistered,
  registerShape,
  unregisterShape,
} from '../svg/shape-registry';
import type {
  PathGeometry,
  PathShapeOptions,
  ShapeDefinition,
} from '../svg/shape-registry';

import {
  clearStyles,
  defineStyle,
  defineStyles,
  getStyle,
  hasStyle,
  listStyles,
  notifyStyleRegistryChanged,
  removeStyle,
} from '../themes/style-registry';
import type { NamedStyle } from '../themes/style-registry';

import {
  getLabelTemplate,
  getLinkTemplate,
  getMarker,
  hasMarker,
  listLabelTemplates,
  listLinkTemplates,
  listMarkers,
  notifyEdgeTemplatesChanged,
  registerLabelTemplate,
  registerLinkTemplate,
  registerMarker,
  unregisterLabelTemplate,
  unregisterLinkTemplate,
  unregisterMarker,
} from '../svg/edge-templates';
import type { LabelTemplate, LinkTemplate, MarkerDefinition } from '../svg/edge-templates';

import {
  listAnchors,
  listConnectionPoints,
  listConnectors,
  notifyLinkPipelineChanged,
  registerAnchor,
  registerConnectionPoint,
  registerConnector,
} from './link-pipeline';
import type { AnchorFn, ConnectionPointFn, ConnectorFn } from './link-pipeline';

import {
  CustomAnimationRegistry,
  getGlobalCustomAnimationRegistry,
} from '../services/custom-animation-registry';

/**
 * Write `value` into one of THIS diagram's tables and hand back the undo.
 *
 * `had` is captured separately from `previous` because a registration whose
 * value is legitimately `undefined` must still restore as "present", and
 * `previous === undefined` cannot tell those apart.
 */
function setScoped<V>(
  scope: RegistryScope,
  table: string,
  key: string,
  value: V,
  notify: () => void
): Disposer {
  const map = scope.table<V>(table);
  const had = map.has(key);
  const previous = map.get(key) as V;
  map.set(key, value);
  notify();
  return once(() => {
    if (had) map.set(key, previous);
    else map.delete(key);
    notify();
  });
}

/** Read the process-global registry even if a scope happens to be active. */
function global<T>(read: () => T): T {
  return runInRegistryScope(null, read);
}

/**
 * The contribution surface. Obtained from a diagram as `diagram.registry`, or as
 * {@link GLOBAL_DIAGRAM_REGISTRY} for the process-wide one.
 */
export class DiagramRegistry {
  /**
   * @param scope this diagram's private tables, or `null` for the
   *              process-global registries.
   */
  constructor(private readonly scope: RegistryScope | null = null) {}

  /** True when writes here are private to one diagram. */
  get isScoped(): boolean {
    return this.scope !== null;
  }

  // -- shapes ---------------------------------------------------------------

  registerShape(
    type: string,
    definition: Omit<ShapeDefinition, 'type'> & { type?: string }
  ): Disposer {
    const value = { ...definition, type } as ShapeDefinition;
    if (!this.scope) {
      const previous = global(() => getShapeDefinition(type));
      registerShape(type, definition);
      return once(() => {
        if (previous) registerShape(type, previous);
        else unregisterShape(type);
      });
    }
    return setScoped(this.scope, SHAPES, type, value, notifyShapeRegistered);
  }

  registerPathShape(type: string, path: PathGeometry, options?: PathShapeOptions): Disposer {
    // Built through the SAME builder the global path uses, so a scoped path
    // shape cannot differ in geometry from a global one.
    return this.registerShape(type, buildPathShapeDefinition(type, path, options));
  }

  unregisterShape(type: string): boolean {
    if (!this.scope) return unregisterShape(type);
    const map = this.scope.table<ShapeDefinition>(SHAPES);
    const existed = map.delete(type);
    if (existed) notifyShapeRegistered();
    return existed;
  }

  hasShape(type: string): boolean {
    return this.read(() => hasShape(type));
  }

  listShapes(): string[] {
    return this.read(() => listShapes());
  }

  getShapeDefinition(type: string): ShapeDefinition | undefined {
    return this.read(() => getShapeDefinition(type));
  }

  // -- named styles ---------------------------------------------------------

  defineStyle(name: string, style: NamedStyle): Disposer {
    if (!this.scope) {
      const previous = global(() => getStyle(name));
      defineStyle(name, style);
      return once(() => {
        if (previous) defineStyle(name, previous);
        else removeStyle(name);
      });
    }
    // Copied, matching `defineStyle`: later mutation of the caller's object
    // must not reach into the registry.
    return setScoped(this.scope, STYLES, name, { ...style }, notifyStyleRegistryChanged);
  }

  defineStyles(styles: Record<string, NamedStyle>): Disposer {
    if (!this.scope) {
      const undo = Object.keys(styles).map((name) => {
        const previous = global(() => getStyle(name));
        return () => (previous ? defineStyle(name, previous) : removeStyle(name));
      });
      defineStyles(styles);
      return once(() => undo.forEach((u) => u()));
    }
    const undo = Object.entries(styles).map(([name, style]) =>
      setScoped(this.scope as RegistryScope, STYLES, name, { ...style }, notifyStyleRegistryChanged)
    );
    return once(() => undo.forEach((u) => u()));
  }

  removeStyle(name: string): boolean {
    if (!this.scope) return removeStyle(name);
    const existed = this.scope.table<NamedStyle>(STYLES).delete(name);
    if (existed) notifyStyleRegistryChanged();
    return existed;
  }

  /**
   * Drop THIS diagram's named styles. The process-global ones are untouched and
   * become visible again — which is what makes this safe to call from a teardown
   * that has no idea what else is on the page.
   */
  clearStyles(): void {
    if (!this.scope) {
      clearStyles();
      return;
    }
    const map = this.scope.table<NamedStyle>(STYLES);
    if (map.size === 0) return;
    map.clear();
    notifyStyleRegistryChanged();
  }

  getStyle(name: string): NamedStyle | undefined {
    return this.read(() => getStyle(name));
  }

  hasStyle(name: string): boolean {
    return this.read(() => hasStyle(name));
  }

  listStyles(): string[] {
    return this.read(() => listStyles());
  }

  // -- link visuals ---------------------------------------------------------

  registerLinkTemplate(name: string, template: LinkTemplate): Disposer {
    if (!this.scope) {
      const previous = global(() => getLinkTemplate(name));
      registerLinkTemplate(name, template);
      return once(() =>
        previous ? registerLinkTemplate(name, previous) : void unregisterLinkTemplate(name)
      );
    }
    return setScoped(this.scope, LINK_TEMPLATES, name, template, notifyEdgeTemplatesChanged);
  }

  registerLabelTemplate(name: string, template: LabelTemplate): Disposer {
    if (!this.scope) {
      const previous = global(() => getLabelTemplate(name));
      registerLabelTemplate(name, template);
      return once(() =>
        previous ? registerLabelTemplate(name, previous) : void unregisterLabelTemplate(name)
      );
    }
    return setScoped(this.scope, LABEL_TEMPLATES, name, template, notifyEdgeTemplatesChanged);
  }

  registerMarker(name: string, definition: MarkerDefinition): Disposer {
    if (!this.scope) {
      const previous = global(() => getMarker(name));
      registerMarker(name, definition);
      return once(() => (previous ? registerMarker(name, previous) : void unregisterMarker(name)));
    }
    return setScoped(this.scope, MARKERS, name, definition, notifyEdgeTemplatesChanged);
  }

  getLinkTemplate(name: string): LinkTemplate | undefined {
    return this.read(() => getLinkTemplate(name));
  }

  getLabelTemplate(name: string): LabelTemplate | undefined {
    return this.read(() => getLabelTemplate(name));
  }

  getMarker(name: string): MarkerDefinition | undefined {
    return this.read(() => getMarker(name));
  }

  hasMarker(name: string): boolean {
    return this.read(() => hasMarker(name));
  }

  listLinkTemplates(): string[] {
    return this.read(() => listLinkTemplates());
  }

  listLabelTemplates(): string[] {
    return this.read(() => listLabelTemplates());
  }

  listMarkers(): string[] {
    return this.read(() => listMarkers());
  }

  // -- link pipeline --------------------------------------------------------
  //
  // The three global `register*` functions already return restore-on-dispose
  // disposers, so the unscoped branch delegates rather than re-deriving them.

  registerAnchor(name: string, anchor: AnchorFn): Disposer {
    if (!this.scope) return registerAnchor(name, anchor);
    return setScoped(this.scope, ANCHORS, name, anchor, notifyLinkPipelineChanged);
  }

  registerConnectionPoint(name: string, strategy: ConnectionPointFn): Disposer {
    if (!this.scope) return registerConnectionPoint(name, strategy);
    return setScoped(this.scope, CONNECTION_POINTS, name, strategy, notifyLinkPipelineChanged);
  }

  registerConnector(name: string, connector: ConnectorFn): Disposer {
    if (!this.scope) return registerConnector(name, connector);
    return setScoped(this.scope, CONNECTORS, name, connector, notifyLinkPipelineChanged);
  }

  listAnchors(): string[] {
    return this.read(() => listAnchors());
  }

  listConnectionPoints(): string[] {
    return this.read(() => listConnectionPoints());
  }

  listConnectors(): string[] {
    return this.read(() => listConnectors());
  }

  // -- animations -----------------------------------------------------------

  /**
   * This diagram's own {@link CustomAnimationRegistry}, or the process-global
   * singleton when unscoped.
   *
   * Lazy: the constructor appends a `<style>` element to the document, so a
   * diagram that never contributes an animation must not pay for one.
   */
  get animations(): CustomAnimationRegistry {
    if (!this.scope) return getGlobalCustomAnimationRegistry();
    if (!this.ownAnimations) this.ownAnimations = new CustomAnimationRegistry();
    return this.ownAnimations;
  }

  private ownAnimations: CustomAnimationRegistry | undefined;

  // -- lifecycle ------------------------------------------------------------

  /** Drop every contribution this diagram made. No-op on the global registry. */
  dispose(): void {
    if (!this.scope) return;
    const wasEmpty = this.scope.isEmpty();
    this.scope.clear();
    this.ownAnimations?.destroy();
    this.ownAnimations = undefined;
    // Anything cached against a definition that no longer exists must go.
    if (!wasEmpty) {
      notifyShapeRegistered();
      notifyStyleRegistryChanged();
      notifyEdgeTemplatesChanged();
      notifyLinkPipelineChanged();
    }
  }

  /**
   * Run a READ with this diagram's scope active.
   *
   * Every accessor above goes through here rather than reading the module maps,
   * because the shadowing rule (mine first, then the process) must be identical
   * whether a name is being resolved by a render pass or by a host asking
   * `listShapes()`. Two implementations of that rule would drift.
   */
  private read<T>(fn: () => T): T {
    return runInRegistryScope(this.scope, fn);
  }
}

/** The process-wide registry — what the module-level `register*` functions write to. */
export const GLOBAL_DIAGRAM_REGISTRY = new DiagramRegistry(null);
