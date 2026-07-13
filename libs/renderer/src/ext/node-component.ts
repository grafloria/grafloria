/**
 * ============================================================================
 * Card 3 — the custom node/edge component AUTHORING CONTRACT
 * ============================================================================
 *
 * SCOPE, STATED PLAINLY. Wave 4 shipped the HOST HOOK (`renderCustomNode(node,
 * element)` on `createDiagram`) and wave 5 shipped HTML/foreignObject nodes with
 * content-hash keying. Both are mechanisms: "here is a div, do what you like".
 * Neither is an authoring CONTRACT — there was no typed prop bag, no lifecycle,
 * and no way to get a component's MEASURED size back into the model, which is the
 * hard half (a node whose height depends on its content cannot be laid out or
 * routed to until something measures it).
 *
 * This is that contract, built ON those hooks rather than forking them.
 *
 *   defineNodeComponent({ render, onUpdate, onDestroy, autoSize })
 *   mountNodeComponents(instance, registry)   ← wires into renderCustomNode
 *
 * ---------------------------------------------------------------------------
 * MEASURED SIZE — the part that actually matters
 * ---------------------------------------------------------------------------
 * A component that renders text of unknown length must be able to say "I turned
 * out to be 214 px tall" and have the engine believe it: the node model resizes,
 * links re-route to the new boundary, and the layout re-flows.
 *
 * We measure with a `ResizeObserver` on the component's own host element, and
 * write the result back through `node.setSize()`. Two hazards, both handled:
 *
 *   1. FEEDBACK LOOP. Writing the size re-renders the node, which can resize the
 *      host, which fires the observer again. We break it by only writing when the
 *      measurement differs by more than a threshold (sub-pixel jitter from
 *      fractional zoom is not a resize).
 *
 *   2. ZOOM. `getBoundingClientRect()` on the host returns SCREEN px, which is
 *      world px × zoom. Writing that straight into the model would make a node
 *      grow every time you zoomed in. We use `offsetWidth/offsetHeight` (layout
 *      px, unaffected by the CSS transform on the layer) and fall back to
 *      dividing the client rect by the zoom.
 */

import type { NodeModel } from '@grafloria/engine';
import type { DiagramInstance } from '../instance/create-diagram';
import type { VNode } from '../types';
import type { Disposer } from './disposable';
import { DisposableStore, once } from './disposable';

/** The typed props a node component receives. Recomputed on every update. */
export interface NodeComponentProps<D = Record<string, unknown>> {
  readonly id: string;
  /** The node's own data bag (`node.data` / metadata). */
  readonly data: D;
  readonly selected: boolean;
  readonly dragging: boolean;
  readonly hovered: boolean;
  /** Current camera zoom — for LOD rendering ("hide the detail below 0.5"). */
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  /** The node's ports, so a component can position its own handles. */
  readonly ports: ReadonlyArray<{ id: string; side: string; type: string }>;
  /** Escape hatch: the live model. Prefer the fields above. */
  readonly node: NodeModel;
}

/**
 * A component's render function.
 *
 * Return a `VNode` to have the renderer patch it (the framework-agnostic path),
 * or take the `HTMLElement` and own it yourself (the React/Angular/Vue path —
 * mount a portal into it and return `void`).
 */
export type NodeRenderFn<D = Record<string, unknown>> = (
  props: NodeComponentProps<D>,
  element: HTMLElement
) => VNode | void;

export interface NodeComponent<D = Record<string, unknown>> {
  render: NodeRenderFn<D>;
  /** Called on every prop change AFTER the first render. Optional fast path. */
  onUpdate?: (props: NodeComponentProps<D>, element: HTMLElement) => void;
  /** Unmount your framework's subtree here. */
  onDestroy?: (element: HTMLElement) => void;
  /**
   * Measure the rendered element and write the size back into the model, so
   * layout + routing see the node's REAL extent. Default false — a node whose
   * size is authored should not be silently overridden by its content.
   */
  autoSize?: boolean;
  /** Ignore measurement deltas smaller than this (px). Default 1. */
  sizeThreshold?: number;
}

export function defineNodeComponent<D = Record<string, unknown>>(
  component: NodeComponent<D>
): NodeComponent<D> {
  return component;
}

/** type → component. */
export type NodeComponentRegistry = Record<string, NodeComponent<never>>;

function propsFor(node: NodeModel, zoom: number, dragging: boolean): NodeComponentProps<never> {
  return {
    id: node.id,
    data: ((node as { data?: unknown }).data ?? node.getMetadata?.('data') ?? {}) as never,
    selected: node.state?.selected === true,
    // NOTE: `dragging` is NOT on NodeState — node-drag lives in the DomEventBinder.
    // The instance exposes it via getDraggingNodeIds(); see Card 3 in that file.
    dragging,
    hovered: node.state?.hovered === true,
    zoom,
    width: node.size.width,
    height: node.size.height,
    ports: node.getPorts().map((p) => ({
      id: p.id,
      side: String(p.alignment?.side ?? 'right'),
      type: String(p.type),
    })),
    node,
  };
}

/**
 * Wire a component registry into a live diagram.
 *
 * Returns a disposer that unmounts every component and disconnects every
 * observer — the leak rule; a stranded ResizeObserver keeps its target's whole
 * subtree alive.
 */
export function mountNodeComponents(
  instance: DiagramInstance,
  registry: NodeComponentRegistry
): Disposer {
  const store = new DisposableStore();
  const mounted = new Map<string, { component: NodeComponent<never>; element: HTMLElement }>();
  const observers = new Map<string, ResizeObserver>();

  const componentFor = (node: NodeModel): NodeComponent<never> | undefined =>
    registry[String(node.type)] ?? registry[String(node.getMetadata?.('component') ?? '')];

  /** Measure → write back. See the two hazards in the header. */
  const measure = (node: NodeModel, element: HTMLElement, component: NodeComponent<never>): void => {
    if (!component.autoSize) return;

    const threshold = component.sizeThreshold ?? 1;
    const zoom = instance.viewport.getZoom() || 1;

    // offsetWidth/Height are LAYOUT px — immune to the CSS transform the HTML
    // layer carries. The client-rect fallback must be divided by the zoom, or the
    // node would grow every time the user zoomed in.
    const width = element.offsetWidth || element.getBoundingClientRect().width / zoom;
    const height = element.offsetHeight || element.getBoundingClientRect().height / zoom;
    if (!(width > 0) || !(height > 0)) return;

    if (
      Math.abs(width - node.size.width) < threshold &&
      Math.abs(height - node.size.height) < threshold
    ) {
      return; // sub-threshold jitter — writing it would loop
    }

    node.setSize(width, height);
    instance.render();
  };

  const renderInto = (node: NodeModel, element: HTMLElement, first: boolean): void => {
    const component = componentFor(node);
    if (!component) return;

    const dragging = instance.getDraggingNodeIds().includes(node.id);
    const props = propsFor(node, instance.viewport.getZoom(), dragging);

    if (first || !component.onUpdate) {
      const vnode = component.render(props, element);
      // A VNode-returning component gets patched for free; an element-owning one
      // returned void and has already done its own thing.
      if (vnode) instance.patcher.reconcile(element, vnode);
    } else {
      component.onUpdate(props, element);
    }

    measure(node, element, component);
  };

  // The host hook wave 4 shipped. We are a CONSUMER of it, not a replacement.
  const onCreate = (node: NodeModel, element: HTMLElement): void => {
    const component = componentFor(node);
    if (!component) return;

    mounted.set(node.id, { component, element });
    renderInto(node, element, true);

    if (component.autoSize && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure(node, element, component));
      observer.observe(element);
      observers.set(node.id, observer);
    }
  };

  const onRemove = (id: string, element: HTMLElement): void => {
    observers.get(id)?.disconnect();
    observers.delete(id);
    const entry = mounted.get(id);
    entry?.component.onDestroy?.(element);
    // Drop any VNode tree we patched in, so the patcher does not keep the old
    // DOM keyed against a node that no longer exists.
    if (entry) instance.patcher.unmount(element);
    mounted.delete(id);
  };

  // Re-render mounted components when their node or the camera changes (zoom is
  // a PROP — an LOD component must re-render when it crosses its threshold).
  const refresh = (): void => {
    for (const [id, entry] of mounted) {
      const node = instance.getModel().getNode(id);
      if (!node) continue;
      renderInto(node, entry.element, false);
    }
  };

  store.add(instance.on('nodes:change', refresh));
  store.add(instance.on('selection:change', refresh));
  store.add(instance.on('viewport:change', refresh));

  // Hand our hooks to the instance. NOTE: `createDiagram` takes these as OPTIONS,
  // so a diagram already running needs them installed here.
  const host = instance as DiagramInstance & {
    __nodeComponentHooks?: {
      renderCustomNode?: (node: NodeModel, element: HTMLElement) => void;
      removeCustomNode?: (id: string, element: HTMLElement) => void;
    };
  };
  host.__nodeComponentHooks = { renderCustomNode: onCreate, removeCustomNode: onRemove };

  store.add(() => {
    for (const [id, entry] of [...mounted]) onRemove(id, entry.element);
    mounted.clear();
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
    delete host.__nodeComponentHooks;
  });

  return once(() => store.dispose());
}

/**
 * The options you hand to `createDiagram()` to use a component registry from the
 * very first paint (preferred over `mountNodeComponents` on a running instance,
 * because the first render then already has the components).
 *
 * ```ts
 * const diagram = createDiagram(el, {
 *   nodes, edges,
 *   ...nodeComponentOptions(registry, () => diagram),
 * });
 * ```
 */
export function nodeComponentOptions(
  registry: NodeComponentRegistry,
  getInstance: () => DiagramInstance
): {
  renderCustomNode: (node: NodeModel, element: HTMLElement) => void;
  removeCustomNode: (id: string, element: HTMLElement) => void;
} {
  let disposer: Disposer | undefined;
  let wired = false;

  const ensure = (): DiagramInstance | undefined => {
    const instance = getInstance();
    if (!instance) return undefined;
    if (!wired) {
      wired = true;
      disposer = mountNodeComponents(instance, registry);
      void disposer;
    }
    return instance;
  };

  return {
    renderCustomNode(node, element) {
      const instance = ensure();
      if (!instance) return;
      const hooks = (
        instance as DiagramInstance & {
          __nodeComponentHooks?: { renderCustomNode?: (n: NodeModel, e: HTMLElement) => void };
        }
      ).__nodeComponentHooks;
      hooks?.renderCustomNode?.(node, element);
    },
    removeCustomNode(id, element) {
      const instance = getInstance();
      const hooks = (
        instance as DiagramInstance & {
          __nodeComponentHooks?: { removeCustomNode?: (i: string, e: HTMLElement) => void };
        }
      )?.__nodeComponentHooks;
      hooks?.removeCustomNode?.(id, element);
    },
  };
}
