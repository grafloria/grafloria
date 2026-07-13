/**
 * ============================================================================
 * Card 4 — the public reactive state API + imperative instance handle
 * ============================================================================
 *
 * SCOPE, STATED PLAINLY. This card is a DOCUMENTED SURFACE, not a new engine.
 * Waves 3/4 already shipped the machinery:
 *
 *   ViewportController    clientToWorld / worldToClient / zoomAtPoint /
 *                         fitToBounds / onChange          (framework-free camera)
 *   InteractionController the interaction brain
 *   createDiagram()       the headless instance + its event bus
 *
 * What was missing was a NAMED, stable, semver'd surface over them. A host had to
 * know that "screen → flow" is spelled `viewport.clientToWorld(x, y, rect)` and
 * had to fetch the rect itself; that there is no `zoomTo`; that to observe the
 * nodes you subscribe to a string-keyed event and re-read the model yourself; and
 * that `getIntersectingNodes` — table stakes for a marquee or a drop target —
 * simply did not exist anywhere.
 *
 * `createDiagramApi(instance)` is that surface. Everything here delegates; the
 * only genuinely NEW logic is `getIntersectingNodes` (rect/rect overlap) and the
 * selector-subscription plumbing.
 *
 * ---------------------------------------------------------------------------
 * Reactivity WITHOUT a framework
 * ---------------------------------------------------------------------------
 * `subscribe(selector, listener)` is a pull-on-push store: on any relevant
 * change we re-run the selector and notify ONLY if its value actually changed
 * (`Object.is` on the projected value, with a shallow array compare — the
 * selectors here all project arrays). That is what lets a React `useSyncExternal
 * Store`, a Vue `ref`, or a Svelte store bind to it without re-rendering on every
 * mousemove.
 *
 * Every subscribe() returns an unsubscribe, and `dispose()` drops the lot.
 */

import type { DiagramEngine, DiagramModel, LinkModel, NodeModel } from '@grafloria/engine';
import type { DiagramInstance } from '../instance/create-diagram';
import type { Rectangle } from '../types/geometry.types';
import type { Disposer } from './disposable';
import { DisposableStore } from './disposable';

export interface FlowPoint {
  x: number;
  y: number;
}

/** The reactive snapshot a host binds to. */
export interface DiagramSnapshot {
  nodes: NodeModel[];
  edges: LinkModel[];
  selectedNodes: NodeModel[];
  selectedEdges: LinkModel[];
  viewport: Rectangle;
  zoom: number;
}

export type Selector<T> = (snapshot: DiagramSnapshot) => T;

export interface GetIntersectingOptions {
  /**
   * Require FULL containment rather than any overlap. This is the difference
   * between a marquee that grabs everything it touches and one that only grabs
   * what it encloses — both are legitimate, so it is the caller's call.
   */
  fully?: boolean;
  /** Ignore hidden nodes. Default true. */
  visibleOnly?: boolean;
}

export interface DiagramApi {
  // -- reactive reads --------------------------------------------------------
  getNodes(): NodeModel[];
  getEdges(): LinkModel[];
  getSelectedNodes(): NodeModel[];
  getSelectedEdges(): LinkModel[];
  getViewport(): Rectangle;
  getZoom(): number;
  /** One consistent snapshot — never a torn read across two getters. */
  getSnapshot(): DiagramSnapshot;

  /**
   * Observe a projection of the state. The listener fires only when the
   * SELECTED value changes, not on every internal event.
   */
  subscribe<T>(selector: Selector<T>, listener: (value: T) => void): Disposer;

  // -- imperative handle -----------------------------------------------------
  /** Frame all content. */
  fitView(padding?: number): void;
  /** Set absolute zoom, about the viewport centre. */
  zoomTo(zoom: number): void;
  zoomIn(step?: number): void;
  zoomOut(step?: number): void;
  /** Pan so `point` sits at the centre of the viewport. */
  centerOn(point: FlowPoint): void;

  /** Screen (client) coordinates → world/flow coordinates. */
  screenToFlow(point: FlowPoint): FlowPoint;
  /** World/flow coordinates → screen (client) coordinates. */
  flowToScreen(point: FlowPoint): FlowPoint;

  /** Every node overlapping `rect` (world coords). The marquee/drop-target primitive. */
  getIntersectingNodes(rect: Rectangle, options?: GetIntersectingOptions): NodeModel[];
  /** The topmost node under a world point, or null. */
  getNodeAt(point: FlowPoint): NodeModel | null;

  /** Run an engine command through the undo/redo stack. Async — see the impl. */
  execute(command: unknown): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;

  dispose(): void;
}

/** World rect of a node, honouring group nesting. */
function nodeRect(node: NodeModel): Rectangle {
  const p =
    typeof node.getWorldPosition === 'function' ? node.getWorldPosition() : node.position;
  return { x: p.x, y: p.y, width: node.size.width, height: node.size.height };
}

const overlaps = (a: Rectangle, b: Rectangle): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const contains = (outer: Rectangle, inner: Rectangle): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Shallow equality — enough for the array projections these selectors produce. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  return false;
}

export function createDiagramApi(instance: DiagramInstance): DiagramApi {
  const store = new DisposableStore();
  const model = (): DiagramModel => instance.getModel();
  const engine = (): DiagramEngine => instance.getEngine();

  const rect = (): DOMRect => instance.container.getBoundingClientRect() as DOMRect;

  const getNodes = (): NodeModel[] => model().getNodes();
  const getEdges = (): LinkModel[] => model().getLinks();
  const getSelectedNodes = (): NodeModel[] => model().getSelectedNodes();
  const getSelectedEdges = (): LinkModel[] =>
    model().getLinks().filter((l: LinkModel) => l.state === 'selected');

  const getSnapshot = (): DiagramSnapshot => ({
    nodes: getNodes(),
    edges: getEdges(),
    selectedNodes: getSelectedNodes(),
    selectedEdges: getSelectedEdges(),
    viewport: instance.viewport.getViewport(),
    zoom: instance.viewport.getZoom(),
  });

  // -- the subscription hub ---------------------------------------------------
  // ONE set of upstream listeners feeds every selector, so N subscribers cost one
  // model subscription, not N.
  const subscribers = new Set<{ selector: Selector<unknown>; listener: (v: unknown) => void; last: unknown }>();

  const notify = (): void => {
    if (subscribers.size === 0) return;
    const snapshot = getSnapshot();
    for (const sub of [...subscribers]) {
      const next = sub.selector(snapshot);
      if (sameValue(next, sub.last)) continue;
      sub.last = next;
      sub.listener(next);
    }
  };

  for (const event of [
    'nodes:change',
    'edges:change',
    'selection:change',
    'viewport:change',
  ] as const) {
    store.add(instance.on(event, notify));
  }

  return {
    getNodes,
    getEdges,
    getSelectedNodes,
    getSelectedEdges,
    getViewport: () => instance.viewport.getViewport(),
    getZoom: () => instance.viewport.getZoom(),
    getSnapshot,

    subscribe<T>(selector: Selector<T>, listener: (value: T) => void): Disposer {
      const sub = {
        selector: selector as Selector<unknown>,
        listener: listener as (v: unknown) => void,
        last: selector(getSnapshot()) as unknown,
      };
      subscribers.add(sub);
      return store.add(() => subscribers.delete(sub));
    },

    fitView: (padding?: number) => instance.fitView(padding),

    zoomTo(zoom: number) {
      // About the viewport CENTRE — zooming about the world origin would fling
      // the content off-screen whenever the camera is not at (0,0).
      const before = instance.viewport.getViewport();
      const cx = before.x + before.width / 2;
      const cy = before.y + before.height / 2;
      instance.viewport.setZoom(zoom);
      const after = instance.viewport.getViewport();
      instance.viewport.setViewport({
        x: cx - after.width / 2,
        y: cy - after.height / 2,
        width: after.width,
        height: after.height,
      });
      instance.render();
    },

    zoomIn(step = 1.2) {
      this.zoomTo(instance.viewport.getZoom() * step);
    },
    zoomOut(step = 1.2) {
      this.zoomTo(instance.viewport.getZoom() / step);
    },

    centerOn(point: FlowPoint) {
      const v = instance.viewport.getViewport();
      instance.viewport.setViewport({
        x: point.x - v.width / 2,
        y: point.y - v.height / 2,
        width: v.width,
        height: v.height,
      });
      instance.render();
    },

    // The rect is fetched HERE. Making the caller pass it (as
    // `ViewportController.clientToWorld` does) is the single most common way to
    // get this wrong, because a stale rect silently offsets every conversion.
    screenToFlow: (point: FlowPoint) => instance.viewport.clientToWorld(point.x, point.y, rect()),
    flowToScreen: (point: FlowPoint) => instance.viewport.worldToClient(point.x, point.y, rect()),

    getIntersectingNodes(target: Rectangle, options: GetIntersectingOptions = {}) {
      const { fully = false, visibleOnly = true } = options;
      return getNodes().filter((node) => {
        if (visibleOnly && node.state?.visible === false) return false;
        const r = nodeRect(node);
        return fully ? contains(target, r) : overlaps(target, r);
      });
    },

    getNodeAt: (point: FlowPoint) => model().getNodeAtPosition(point.x, point.y) ?? null,

    // The engine's command stack is `engine.commandManager` (there is no
    // `executeCommand` on DiagramEngine), and undo/redo are ASYNC. We surface
    // them as promises rather than pretending they are synchronous — a caller
    // that awaits gets a correct "the model has settled" signal.
    async execute(command: unknown) {
      await engine().commandManager.execute(command as never);
      instance.render();
    },
    async undo() {
      await engine().undo();
      instance.render();
    },
    async redo() {
      await engine().redo();
      instance.render();
    },

    dispose: () => {
      subscribers.clear();
      store.dispose();
    },
  };
}
