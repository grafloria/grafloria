/**
 * ============================================================================
 * The headless instance contract — NOW IMPLEMENTED
 * ============================================================================
 *
 * Wave 3 declared this contract as types-only and listed four blockers before a
 * real `createDiagram()` could ship. Wave 4 (framework-integration card) closed
 * all four, so the contract and its implementation are the same thing and live
 * together in `./create-diagram.ts`. This file is kept as the map:
 *
 *   1. **VNode → DOM materializer.** ✅ `VNodePatcher` (`../vnode/patch.ts`) —
 *      keyed reconciler, `foreignObject` subtrees opaque. *(wave 3)*
 *      Wave 4 added `hydrate()`: adopt server DOM without touching it.
 *
 *   2. **DOM event binding + handler orchestration.** ✅ `DomEventBinder`
 *      (`./dom-event-binder.ts`) — the mousedown priority ladder (port →
 *      control-point → waypoint → endpoint → label → link → node → empty),
 *      pan/zoom, threshold-gated node dragging, keyboard. It was the largest
 *      remaining piece and it is now framework-free.
 *
 *   3. **Render scheduling.** ✅ `RenderScheduler` (`./render-scheduler.ts`) —
 *      rAF coalescing + the idle-skip keyed on dirty entities + viewport/zoom.
 *
 *   4. **Custom / HTML-layer nodes.** ✅ `renderCustomNode(node, element)` on
 *      `CreateDiagramOptions`. The instance owns an absolutely-positioned host
 *      element per custom node inside the HTML layer; the framework owns what
 *      goes inside it (a React portal, a slotted `<template>`, an Angular
 *      component). Custom nodes are no longer Angular-only.
 *
 * Usage — identical from React, Vue, Svelte, a web component or a `<script>` tag:
 *
 * ```ts
 * const diagram = createDiagram(document.getElementById('canvas')!, {
 *   nodes, edges, theme: LIGHT_THEME,
 * });
 * const off = diagram.on('selection:change', ({ nodes }) => console.log(nodes));
 * diagram.setNodes(nextNodes);
 * diagram.dispose();
 * ```
 *
 * SSR (Card 6): call `renderToStaticSVG()` on the server and pass the returned
 * `snapshot` to `createDiagram(el, { hydrate: snapshot })` on the client — the
 * server DOM is adopted, not rebuilt.
 */

export { createDiagram, contentBounds } from './create-diagram';

export type {
  DiagramInstance,
  CreateDiagramOptions,
  DiagramEventMap,
  DiagramEventName,
  DiagramEventHandler,
  NodeInput,
  EdgeInput,
} from './create-diagram';

/** The factory's own signature, for hosts that store it. */
export type CreateDiagram = typeof import('./create-diagram').createDiagram;
