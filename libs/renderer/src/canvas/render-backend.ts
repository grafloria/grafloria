// render-backend.ts — the per-diagram, runtime-switchable backend.
//
//     backend.setMode('canvas')   // scale: 10k+ elements, O(1) picking
//     backend.setMode('svg')      // text selection, accessibility, CSS, export
//
// Both modes are driven by ONE `SVGRenderer` — the VNode producer — which is
// what makes the switch cheap and safe: the diagram, the styles, the routing,
// the LOD tiers and the culling are all computed once, in a backend-agnostic
// form, and only the CONSUMER of that tree changes:
//
//        DiagramEngine
//             │
//        SVGRenderer.render(viewport, zoom)  ──►  VNode tree
//             │                                      │
//             ├── svg mode ──►  VNodePatcher   ──►  SVG DOM
//             └── canvas mode ─►  VNodePainter ──►  Canvas 2D  (+ hit canvas)
//
// HIT-TESTING IS SHARED. Both modes answer `hitTest(worldX, worldY)` from the
// SAME hit records, produced from the SAME VNode tree by the SAME painter pass.
// Canvas mode additionally has the colour-keyed pixel accelerator; when it is
// available the two agree (asserted in the specs and in the browser e2e), and
// when it is not, canvas mode simply uses the shared geometric path that SVG
// mode uses. A backend switch therefore cannot change what is under the cursor.

import type { DiagramEngine } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import type { SVGRendererConfig } from '../types/renderer.interface';
import type { Theme } from '../types/theme.types';
import type { VNode } from '../types/vnode.types';
import { LIGHT_THEME } from '../themes';
import { SVGRenderer } from '../svg/svg-renderer';
import { VNodePatcher } from '../vnode/patch';
import { CanvasRenderer, type CanvasLike, type CanvasPick } from './canvas-renderer';
import { CanvasStyleResolver, readCssVarOverrides } from './style-resolution';
import { NULL_CONTEXT } from './canvas-context';
import { VNodePainter, type HitRecord } from './vnode-painter';
import { IDENTITY, distanceToPath, pointInPath } from './path-geometry';

export type BackendMode = 'svg' | 'canvas';

export interface RenderBackendOptions {
  /** Initial backend. Default 'svg' — the historical behaviour. */
  mode?: BackendMode;
  theme?: Theme;
  /** Config for the shared VNode producer. */
  producerConfig?: SVGRendererConfig;
  devicePixelRatio?: number;
  enableHitDetection?: boolean;
  enableDirtyRegions?: boolean;
}

/**
 * One diagram, two backends, one VNode tree.
 *
 * The host owns a container element; the backend owns whatever goes inside it
 * (`<svg>` or `<canvas>`) and swaps that out on `setMode`.
 */
export class DiagramRenderBackend {
  private mode: BackendMode;
  private readonly engine: DiagramEngine;
  private readonly container: Element;
  private readonly options: RenderBackendOptions;

  /** THE producer. Shared by both backends; never rebuilt on a mode switch. */
  private readonly producer: SVGRenderer;

  private theme: Theme;

  // svg mode
  private svgElement: Element | null = null;
  private patcher: VNodePatcher | null = null;

  // canvas mode
  private canvasElement: CanvasLike | null = null;
  private canvasRenderer: CanvasRenderer | null = null;

  // shared hit index (built lazily off the last tree)
  private readonly resolver: CanvasStyleResolver;
  private readonly painter: VNodePainter;
  private lastTree: VNode | null = null;
  private hitRecords: HitRecord[] | null = null;

  private lastViewport: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private lastZoom = 1;
  private disposed = false;

  constructor(engine: DiagramEngine, container: Element, options: RenderBackendOptions = {}) {
    this.engine = engine;
    this.container = container;
    this.options = options;
    this.mode = options.mode ?? 'svg';
    this.theme = options.theme ?? LIGHT_THEME;

    this.producer = new SVGRenderer(engine, options.producerConfig, this.theme);

    this.resolver = new CanvasStyleResolver({
      theme: this.theme,
      varOverrides: readCssVarOverrides(container),
    });
    this.painter = new VNodePainter(this.resolver);

    this.mount();
  }

  getMode(): BackendMode {
    return this.mode;
  }

  /** The renderer currently driving the picture. */
  getRenderer(): SVGRenderer | CanvasRenderer {
    return this.mode === 'canvas' && this.canvasRenderer ? this.canvasRenderer : this.producer;
  }

  /** The shared VNode producer (identical object in both modes). */
  getProducer(): SVGRenderer {
    return this.producer;
  }

  /**
   * Switch backend on a LIVE diagram. The producer, the engine, the theme and
   * the camera all survive; only the paint target changes. The next `render()`
   * repaints from scratch into the new target.
   */
  setMode(mode: BackendMode): void {
    if (mode === this.mode || this.disposed) return;

    this.unmount();
    this.mode = mode;
    this.mount();

    // Re-render immediately so the switch is visible without waiting for the
    // host's next frame (a mode toggle that leaves a blank canvas until the user
    // pans is not a switch, it is a bug).
    if (this.lastViewport.width > 0) {
      this.render(this.lastViewport, this.lastZoom);
    }
  }

  render(viewport: Rectangle, zoom: number): VNode {
    this.lastViewport = { ...viewport };
    this.lastZoom = zoom;
    this.hitRecords = null;

    if (this.mode === 'canvas' && this.canvasRenderer) {
      const tree = this.canvasRenderer.render(viewport, zoom);
      this.lastTree = tree;
      return tree;
    }

    const tree = this.producer.render(viewport, zoom);
    this.lastTree = tree;
    if (this.patcher && this.svgElement) {
      this.patcher.reconcile(this.svgElement, tree);
    }
    return tree;
  }

  /**
   * The entity at a WORLD coordinate — the same answer in both modes.
   *
   * Canvas mode uses the colour-keyed hit canvas when it has one (O(1)); both
   * modes otherwise walk the shared hit records geometrically.
   */
  hitTest(worldX: number, worldY: number): CanvasPick | null {
    if (this.mode === 'canvas' && this.canvasRenderer) {
      return this.canvasRenderer.pick(worldX, worldY);
    }

    const record = this.geometricPick(worldX, worldY);
    return record ? { kind: record.kind, id: record.id, vnode: record.vnode } : null;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.resolver.setTheme(theme, readCssVarOverrides(this.container));
    this.hitRecords = null;

    if (this.canvasRenderer) {
      this.canvasRenderer.setTheme(theme);
    } else {
      this.producer.setTheme(theme);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unmount();
    this.producer.dispose();
    this.lastTree = null;
    this.hitRecords = null;
  }

  // -------------------------------------------------------------------------

  private mount(): void {
    const doc = this.container.ownerDocument;
    if (!doc) return;

    if (this.mode === 'svg') {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      this.container.appendChild(svg);
      this.svgElement = svg;
      this.patcher = new VNodePatcher({ document: doc });
      return;
    }

    const canvas = doc.createElement('canvas') as unknown as CanvasLike;
    if (canvas.style) {
      canvas.style['display'] = 'block';
    }
    this.container.appendChild(canvas as unknown as Node);
    this.canvasElement = canvas;

    this.canvasRenderer = new CanvasRenderer(this.engine, {
      canvas,
      theme: this.theme,
      // THE point of the shared producer: no second scene, no second style
      // pipeline, no re-layout — the switch is a change of paint target only.
      producer: this.producer,
      devicePixelRatio: this.options.devicePixelRatio,
      enableHitDetection: this.options.enableHitDetection,
      enableDirtyRegions: this.options.enableDirtyRegions,
      styleHost: this.container,
    });
  }

  private unmount(): void {
    if (this.svgElement) {
      this.patcher?.unmount(this.svgElement);
      this.svgElement.remove();
      this.svgElement = null;
      this.patcher = null;
    }

    if (this.canvasRenderer) {
      // Does NOT dispose the shared producer (CanvasRenderer only owns a
      // producer it created itself).
      this.canvasRenderer.dispose();
      this.canvasRenderer = null;
    }

    if (this.canvasElement) {
      (this.canvasElement as unknown as Element).remove?.();
      this.canvasElement = null;
    }
  }

  /** Build the hit records from the last tree, lazily, and pick from them. */
  private geometricPick(x: number, y: number): HitRecord | null {
    if (!this.lastTree) return null;

    if (!this.hitRecords) {
      this.hitRecords = this.painter.paint(NULL_CONTEXT, this.lastTree, {
        worldToDevice: IDENTITY,
        measureOnly: true,
      }).hitRecords;
    }

    const query = { x, y };
    for (let i = this.hitRecords.length - 1; i >= 0; i--) {
      const record = this.hitRecords[i];
      if (record.filled) {
        if (pointInPath(record.cmds, query)) return record;
      } else if (distanceToPath(record.cmds, query) <= record.tolerance) {
        return record;
      }
    }
    return null;
  }
}
