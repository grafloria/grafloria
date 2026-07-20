// Viewport culling for CUSTOM (HTML-layer) node hosts.
//
// The properties that matter, in the order they matter:
//   1. MOUNT-ONCE SURVIVES. Re-entry re-appends the same element; `renderCustomNode`
//      is not called twice and `removeCustomNode` is not called on a cull.
//   2. Culling is HYSTERETIC. The same geometry gives a different answer depending on
//      whether the host is already mounted — that is what stops a tile on the boundary
//      from flapping every frame.
//   3. A node under a live gesture is NEVER culled.
//   4. OFF unless asked for. An embedder who never opted in sees byte-identical DOM.
//   5. Teardown still fires exactly once for a host that was culled when it died.
//   6. CULLING IS INVISIBLE TO AN EXPORT. Whatever the camera has or has not visited,
//      the file contains the same widgets — and the document is the same size after the
//      export as it was before it. (Bottom of this file.)

import { createDiagram } from '../instance/create-diagram';
import type { DiagramInstance } from '../instance/create-diagram';
import type { NodeModel } from '@grafloria/engine';
import { HTML_LAYER_CLASS } from '../instance/layers';
import { HtmlHostCuller } from './host-culling';
import { ViewLifecycle } from './view-lifecycle';

const WIDTH = 800;
const HEIGHT = 600;

/** jsdom lays nothing out — give the container a real rect. */
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** The camera at rest: world (0,0)-(800,600). */
const VIEW = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
const rect = (x: number, y: number, width = 100, height = 100) => ({ x, y, width, height });
const NO_GESTURE: ReadonlySet<string> = new Set<string>();

describe('HtmlHostCuller — the cull decision', () => {
  it('admits a host inside the viewport and culls one far outside it', () => {
    const culler = new HtmlHostCuller();
    culler.beginFrame(VIEW, 1, NO_GESTURE);

    expect(culler.admits('on', rect(100, 100), false)).toBe(true);
    // 6000px away in world units — nowhere near the 200px margin.
    expect(culler.admits('off', rect(6000, 0), true)).toBe(false);
  });

  it('keeps a host that is off screen but inside the margin', () => {
    const culler = new HtmlHostCuller({ margin: 200, hysteresis: 0 });
    culler.beginFrame(VIEW, 1, NO_GESTURE);

    // Right edge of the viewport is x=800. A tile at x=850 is invisible but within 200px.
    expect(culler.admits('near', rect(850, 100), false)).toBe(true);
    // …and one at x=1050 is 250px out, past the margin.
    expect(culler.admits('far', rect(1050, 100), false)).toBe(false);
  });

  // THE ANTI-THRASH PROPERTY. Same node, same rect, same frame — the answer depends on
  // whether it is currently mounted. Between the two thresholds NOTHING changes state,
  // so a pixel of camera jitter cannot flip anything.
  it('is hysteretic: the band between margin and margin+hysteresis holds current state', () => {
    const culler = new HtmlHostCuller({ margin: 200, hysteresis: 100 });
    culler.beginFrame(VIEW, 1, NO_GESTURE);

    // The viewport's right edge is x=800, so the attach rect ends at 1000 and the detach
    // rect at 1100. A tile spanning 1050..1150 is outside the first and inside the second.
    const band = rect(1050, 100, 100, 100);

    expect(culler.admits('n', band, true)).toBe(true); // mounted → stays mounted
    expect(culler.admits('n', band, false)).toBe(false); // culled → stays culled
  });

  it('measures the margin in SCREEN pixels, so the band is the same physical distance at any zoom', () => {
    const culler = new HtmlHostCuller({ margin: 200, hysteresis: 0 });

    // Zoomed out 4x: the same 200 screen px is 800 WORLD px, so a tile 500 world units
    // past the edge is still only 125 screen px away and must stay mounted.
    culler.beginFrame(VIEW, 0.25, NO_GESTURE);
    expect(culler.admits('n', rect(1300, 100), false)).toBe(true);

    // Zoomed in 4x: 200 screen px is 50 world px, and the same tile is far gone.
    culler.beginFrame(VIEW, 4, NO_GESTURE);
    expect(culler.admits('n', rect(1300, 100), false)).toBe(false);
  });

  it('never culls a node a live gesture owns, however far off screen it is', () => {
    const culler = new HtmlHostCuller();
    culler.beginFrame(VIEW, 1, new Set(['dragged']));

    expect(culler.admits('dragged', rect(90000, 90000), true)).toBe(true);
    expect(culler.admits('idle', rect(90000, 90000), true)).toBe(false);
  });

  // The wire into the lazy subsystem that already exists: one notion of "this entity has
  // no view", not two that can disagree.
  it('honours an explicit ViewLifecycle freeze, which outranks both geometry and gestures', () => {
    const lifecycle = new ViewLifecycle();
    const culler = new HtmlHostCuller({}, lifecycle);
    culler.beginFrame(VIEW, 1, new Set(['n']));

    expect(culler.admits('n', rect(100, 100), true)).toBe(true);

    lifecycle.freeze('node', 'n');
    expect(culler.admits('n', rect(100, 100), true)).toBe(false);

    lifecycle.unfreeze('node', 'n');
    expect(culler.admits('n', rect(100, 100), true)).toBe(true);
  });

  // …but NOT autoFreeze, which is an exact-rect per-frame diff. Routing custom hosts
  // through it would replace the hysteresis band with a zero-width one.
  it('ignores autoFreeze — the widget layer keeps its own hysteresis', () => {
    const lifecycle = new ViewLifecycle({ autoFreeze: true });
    const culler = new HtmlHostCuller({}, lifecycle);

    // The renderer saw nothing this frame, so autoFreeze marks 'n' as having left.
    lifecycle.retainVisible([['node', 'n']]);
    lifecycle.retainVisible([]);
    expect(lifecycle.isFrozen('node', 'n')).toBe(true);
    expect(lifecycle.isExplicitlyFrozen('node', 'n')).toBe(false);

    culler.beginFrame(VIEW, 1, NO_GESTURE);
    expect(culler.admits('n', rect(100, 100), true)).toBe(true);
  });

  it('defaults to the mode that cannot re-run the painter', () => {
    expect(new HtmlHostCuller().getMode()).toBe('detach');
    expect(new HtmlHostCuller({ mode: 'destroy' }).getMode()).toBe('destroy');
  });

  it('takes margin: 0 literally rather than treating it as absent', () => {
    const culler = new HtmlHostCuller({ margin: 0, hysteresis: 0 });
    culler.beginFrame(VIEW, 1, NO_GESTURE);

    expect(culler.admits('n', rect(799, 100, 10, 10), false)).toBe(true); // touching
    expect(culler.admits('n', rect(801, 100, 10, 10), false)).toBe(false); // one px out
  });

  it('survives a non-finite or zero zoom instead of latching on NaN', () => {
    const culler = new HtmlHostCuller({ margin: 200, hysteresis: 0 });

    for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      culler.beginFrame(VIEW, zoom, NO_GESTURE);
      expect(culler.admits('in', rect(100, 100), false)).toBe(true);
      expect(culler.admits('out', rect(9000, 9000), false)).toBe(false);
    }
  });
});

// ===========================================================================
// Wired into a real instance. A policy object nothing calls is this repository's
// signature bug; these drive the public factory.
// ===========================================================================

describe('createDiagram — custom-node host culling', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  const CUSTOM = (id: string, x: number, y: number) => ({
    id,
    position: { x, y },
    size: { width: 200, height: 120 },
    custom: true,
  });

  const hostOf = (id: string) =>
    container.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;

  const mountedHosts = () =>
    container.querySelectorAll(`.${HTML_LAYER_CLASS} > .grafloria-node-host`).length;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  // ---- the default -------------------------------------------------------

  it('is OFF by default: an existing embedder still finds every host in the DOM', () => {
    diagram = createDiagram(container, {
      nodes: [CUSTOM('near', 0, 0), CUSTOM('far', 40000, 0)],
      renderCustomNode: () => undefined,
    });
    diagram.renderNow();

    expect(mountedHosts()).toBe(2);
    expect(hostOf('far')).not.toBeNull();
  });

  // ---- the cull ----------------------------------------------------------

  it('culls an off-screen host out of the document once switched on', () => {
    diagram = createDiagram(container, {
      nodes: [CUSTOM('near', 0, 0), CUSTOM('far', 40000, 0)],
      renderCustomNode: () => undefined,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    expect(hostOf('near')).not.toBeNull();
    expect(hostOf('far')).toBeNull();
    expect(mountedHosts()).toBe(1);
  });

  it('mounts a host that was never on screen when the camera reaches it', () => {
    const renderCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [CUSTOM('far', 40000, 0)],
      renderCustomNode,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    // Never mounted, so the painter has never run — this is the lazy half of the win.
    expect(renderCustomNode).not.toHaveBeenCalled();

    diagram.viewport.pan(40000, 0);
    diagram.renderNow();

    expect(hostOf('far')).not.toBeNull();
    expect(renderCustomNode).toHaveBeenCalledTimes(1);
    // Positioned correctly on arrival, even though no frame styled it while culled.
    expect(hostOf('far')!.getAttribute('style')).toContain('left:40000px');
  });

  // ---- THE hard property -------------------------------------------------

  it('re-entry re-attaches the SAME element and does NOT re-run renderCustomNode', () => {
    const renderCustomNode = jest.fn((_node: unknown, el: HTMLElement) => {
      el.innerHTML = '<canvas data-chart="1"></canvas>';
    });
    diagram = createDiagram(container, {
      nodes: [CUSTOM('widget', 0, 0)],
      renderCustomNode: renderCustomNode as never,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const first = hostOf('widget')!;
    // Widget-owned state the painter did NOT put there — the thing a destroy would lose.
    (first.firstElementChild as HTMLElement).setAttribute('data-frames', '42');
    expect(renderCustomNode).toHaveBeenCalledTimes(1);

    diagram.viewport.pan(40000, 0); // away
    diagram.renderNow();
    expect(hostOf('widget')).toBeNull();

    diagram.viewport.pan(-40000, 0); // back
    diagram.renderNow();

    const second = hostOf('widget')!;
    expect(second).toBe(first); // the identical element, not a replacement
    expect(renderCustomNode).toHaveBeenCalledTimes(1); // NOT re-run
    expect(second.querySelector('[data-chart]')?.getAttribute('data-frames')).toBe('42');
  });

  it('does NOT fire removeCustomNode on a cull — the component was parked, not unmounted', () => {
    const removeCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [CUSTOM('widget', 0, 0)],
      renderCustomNode: () => undefined,
      removeCustomNode,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    diagram.viewport.pan(40000, 0);
    diagram.renderNow();

    expect(hostOf('widget')).toBeNull();
    expect(removeCustomNode).not.toHaveBeenCalled();
  });

  // ---- teardown of a host that was culled when it died --------------------

  it('still fires removeCustomNode exactly once when a CULLED node leaves the model', () => {
    const removeCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [CUSTOM('widget', 0, 0)],
      renderCustomNode: () => undefined,
      removeCustomNode,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    diagram.viewport.pan(40000, 0);
    diagram.renderNow();
    expect(removeCustomNode).not.toHaveBeenCalled();

    diagram.setNodes([]);
    diagram.renderNow();

    expect(removeCustomNode).toHaveBeenCalledTimes(1);
    expect(removeCustomNode).toHaveBeenCalledWith('widget', expect.any(HTMLElement));
  });

  it('still fires removeCustomNode for a CULLED host on dispose', () => {
    const removeCustomNode = jest.fn();
    const d = createDiagram(container, {
      nodes: [CUSTOM('widget', 0, 0)],
      renderCustomNode: () => undefined,
      removeCustomNode,
      cullCustomNodes: true,
    });
    d.renderNow();
    d.viewport.pan(40000, 0);
    d.renderNow();

    d.dispose();

    expect(removeCustomNode).toHaveBeenCalledTimes(1);
  });

  // ---- hysteresis, end to end --------------------------------------------

  it('does not thrash: jitter inside the hysteresis band mutates nothing', () => {
    // margin 200 / hysteresis 100. The tile's left edge sits at x=1000, i.e. 200px past
    // the viewport's right edge — exactly ON the attach threshold.
    diagram = createDiagram(container, {
      nodes: [CUSTOM('edge', 1000, 0)],
      renderCustomNode: () => undefined,
      cullCustomNodes: { margin: 200, hysteresis: 100 },
    });
    diagram.renderNow();

    const layer = container.querySelector(`.${HTML_LAYER_CLASS}`) as HTMLElement;
    expect(hostOf('edge')).not.toBeNull(); // attached at the threshold

    // Watch the layer for structural churn while the camera jitters across the boundary.
    let mutations = 0;
    const observer = new MutationObserver((records) => {
      for (const r of records) mutations += r.addedNodes.length + r.removedNodes.length;
    });
    observer.observe(layer, { childList: true });

    for (let i = 0; i < 20; i++) {
      diagram.viewport.pan(i % 2 === 0 ? -1 : 1, 0);
      diagram.renderNow();
    }
    // MutationObserver delivers on a microtask; force the queue out synchronously.
    for (const r of observer.takeRecords()) mutations += r.addedNodes.length + r.removedNodes.length;
    observer.disconnect();

    expect(mutations).toBe(0);
    expect(hostOf('edge')).not.toBeNull();
  });

  it('needs real movement past the band to cull, and real movement back to restore', () => {
    diagram = createDiagram(container, {
      nodes: [CUSTOM('edge', 1000, 0)],
      renderCustomNode: () => undefined,
      cullCustomNodes: { margin: 200, hysteresis: 100 },
    });
    diagram.renderNow();
    expect(hostOf('edge')).not.toBeNull();

    // 99px is not enough — still inside the 300px detach band.
    diagram.viewport.pan(-99, 0);
    diagram.renderNow();
    expect(hostOf('edge')).not.toBeNull();

    // Two more and it is out.
    diagram.viewport.pan(-2, 0);
    diagram.renderNow();
    expect(hostOf('edge')).toBeNull();

    // Coming back it must re-cross the ATTACH threshold, not merely the detach one.
    diagram.viewport.pan(50, 0);
    diagram.renderNow();
    expect(hostOf('edge')).toBeNull();

    diagram.viewport.pan(51, 0);
    diagram.renderNow();
    expect(hostOf('edge')).not.toBeNull();
  });

  // The instance must hand the culler the LIVE zoom, not a constant. Culling against the
  // viewBox alone is not enough: the viewBox already accounts for zoom, but the margin is
  // a SCREEN distance and has to be divided by the same zoom, or a zoomed-out board culls
  // a band four times too narrow and tiles pop in visibly late.
  it('keeps the margin a screen distance when the camera is zoomed out', () => {
    // At zoom 0.25 the 800x600 canvas shows world (-1200,-900)-(2000,1500), and the 200px
    // margin is 800 world units — so a tile at x=2400 is 400 world units out and 100
    // SCREEN px out, comfortably inside the band.
    diagram = createDiagram(container, {
      nodes: [CUSTOM('wide', 2400, 0)],
      renderCustomNode: () => undefined,
      cullCustomNodes: { margin: 200, hysteresis: 0 },
      zoom: 0.25,
    });
    diagram.renderNow();

    expect(diagram.viewport.getViewBox().width).toBeCloseTo(3200, 0);
    expect(hostOf('wide')).not.toBeNull();
  });

  // ---- gestures ----------------------------------------------------------

  it('never culls a node that is being dragged, even when the camera leaves it behind', () => {
    diagram = createDiagram(container, {
      nodes: [CUSTOM('tile', 100, 100)],
      renderCustomNode: () => undefined,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const mouse = (type: string, x: number, y: number) =>
      container.dispatchEvent(
        new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
      );

    // Press on the tile (centre ~200,160) and move past the commit threshold.
    mouse('mousedown', 200, 160);
    mouse('mousemove', 260, 160);
    mouse('mousemove', 320, 160);
    expect(diagram.getDraggingNodeIds()).toContain('tile');

    // The camera runs away while the gesture is still live.
    diagram.viewport.pan(40000, 0);
    diagram.renderNow();

    expect(hostOf('tile')).not.toBeNull();

    // Once the gesture ends the exemption lapses and the ordinary rule applies.
    mouse('mouseup', 320, 160);
    diagram.renderNow();
    expect(hostOf('tile')).toBeNull();
  });

  // ---- the other model ---------------------------------------------------

  it("mode: 'destroy' unmounts for real — removeCustomNode fires and the painter re-runs", () => {
    const renderCustomNode = jest.fn();
    const removeCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [CUSTOM('widget', 0, 0)],
      renderCustomNode,
      removeCustomNode,
      cullCustomNodes: { mode: 'destroy' },
    });
    diagram.renderNow();
    const first = hostOf('widget');

    diagram.viewport.pan(40000, 0);
    diagram.renderNow();
    expect(removeCustomNode).toHaveBeenCalledTimes(1);

    diagram.viewport.pan(-40000, 0);
    diagram.renderNow();

    expect(renderCustomNode).toHaveBeenCalledTimes(2); // re-initialised, by request
    expect(hostOf('widget')).not.toBe(first); // a NEW element
    // …and the teardown hook is not double-fired when the node later dies.
    diagram.setNodes([]);
    diagram.renderNow();
    expect(removeCustomNode).toHaveBeenCalledTimes(2);
  });

  // ---- the ViewLifecycle wire, through the front door ---------------------

  it('releases the host of a node the host explicitly froze', () => {
    const lifecycle = new ViewLifecycle();
    diagram = createDiagram(container, {
      nodes: [CUSTOM('widget', 0, 0)],
      renderCustomNode: () => undefined,
      cullCustomNodes: true,
      viewLifecycle: lifecycle,
    });
    diagram.renderNow();
    expect(hostOf('widget')).not.toBeNull();

    lifecycle.freeze('node', 'widget');
    diagram.renderNow();
    expect(hostOf('widget')).toBeNull();

    lifecycle.unfreeze('node', 'widget');
    diagram.renderNow();
    expect(hostOf('widget')).not.toBeNull();
  });

  // ---- the saving, measured ----------------------------------------------

  it('holds the mounted set to what is near the camera on a large board', () => {
    const nodes = [];
    for (let i = 0; i < 200; i++) {
      nodes.push(CUSTOM(`w${i}`, (i % 10) * 400, Math.floor(i / 10) * 300));
    }
    diagram = createDiagram(container, {
      nodes,
      renderCustomNode: () => undefined,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const mounted = mountedHosts();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(20); // 200 tiles, a handful near the camera
  });
});

// ===========================================================================
// CULLING IS INVISIBLE TO AN EXPORT.
//
// The gap this closes: a widget the camera has never reached has never been painted,
// so there was nothing in the document to capture and it exported as an empty box —
// or, when it had no host at all, as literally nothing. The old documentation told the
// caller to "pan or fitView() first", which is not a workaround anybody can apply from
// inside a headless print job.
//
// WHAT THESE TESTS HAVE TO BE CAREFUL ABOUT, because the obvious assertion is a weak
// tooth: "the export contains widget text" is green whenever ANY widget contributed
// that text, including the one already on screen. So every content assertion below is
// scoped to a per-node SENTINEL that only that node's painter can ever produce, and is
// paired with a precondition proving that node was NOT mounted beforehand.
// ===========================================================================

describe('createDiagram — an export force-materializes the hosts it needs', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  /** Every `renderCustomNode` call, in order — the mount ledger these tests read. */
  let painted: string[];
  /** The element each node's painter was handed, so identity can be checked later. */
  let elements: Map<string, HTMLElement>;

  const W = (id: string, x: number, y: number) => ({
    id,
    position: { x, y },
    size: { width: 200, height: 120 },
    custom: true,
  });

  const hostOf = (id: string) =>
    container.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
  const mountedHosts = () =>
    container.querySelectorAll(`.${HTML_LAYER_CLASS} > .grafloria-node-host`).length;

  /** The sentinel a node's widget paints. Unique per node, by construction. */
  const sentinel = (id: string) => `SENTINEL~${id}`;

  /**
   * A laid-out box — but ONLY while the element is in the document.
   *
   * That conditional is load-bearing, not decoration. A real browser gives a detached
   * subtree no layout box at all: every rect comes back zero, which is exactly why a
   * culled-away widget captured as `empty`. jsdom has no layout engine either way, so
   * a fake that always reported 200x120 would let a DETACHED host capture perfectly —
   * and the test for re-attachment would pass with the bug still in place. It did,
   * before this was written.
   */
  const box = (el: { isConnected: boolean }, w: number, h: number) =>
    () =>
      (el.isConnected
        ? { left: 0, top: 0, width: w, height: h, right: w, bottom: h }
        : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) as DOMRect;

  /**
   * A painter that writes a per-node sentinel AND states its own geometry.
   *
   * jsdom has no layout engine, so every `getBoundingClientRect()` is zeros and a
   * capture of a real host would come back `empty` — which would make "did the content
   * reach the file?" unanswerable here, and that is the only question these tests ask.
   * Stating the rects is what lets `capture-host` transcribe a `<text>` run.
   */
  const painter = (node: NodeModel, el: HTMLElement): void => {
    painted.push(node.id);
    elements.set(node.id, el);
    const inner = el.ownerDocument.createElement('div');
    inner.textContent = sentinel(node.id);
    el.appendChild(inner);
    el.getBoundingClientRect = box(el, 200, 120);
    inner.getBoundingClientRect = box(inner, 200, 40);
  };

  beforeEach(() => {
    container = makeContainer();
    painted = [];
    elements = new Map();
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  // ---- THE BUG -----------------------------------------------------------

  it('exports the content of a widget the camera has NEVER visited', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    // PRECONDITIONS. Without these the assertion below could be green because the
    // widget had been mounted all along — the exact weak tooth this suite guards.
    expect(painted).toEqual(['near']);
    expect(hostOf('far')).toBeNull();

    const { svg } = diagram.exportSvgString();

    expect(svg).toContain(sentinel('far')); // ← the never-visited widget's OWN content
    expect(painted).toEqual(['near', 'far']); // its painter ran, for the first time
  });

  it('gives a never-visited widget a REAL group, not a placeholder box and not a warning', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const { svg, warnings } = diagram.exportSvgString();

    // Naming the group is what makes this a test. "No placeholder" alone is green when
    // the widget produced NOTHING AT ALL, which is precisely the bug.
    expect(svg).toContain('<g class="grafloria-custom-node" data-node-id="far"');
    expect(svg).not.toContain('grafloria-custom-node-placeholder');
    expect(warnings.some((w) => w.includes('far'))).toBe(false);
  });

  it('fits the exported box to a widget the camera never reached', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const { viewBox } = diagram.exportSvgString({ padding: 0 });

    // Without the capture the far widget contributes no geometry and the box stops
    // short of it: 40200 is `far`'s right edge.
    expect(viewBox.width).toBeCloseTo(40200, 0);
  });

  // ---- the second shape of the same bug ----------------------------------

  it('re-attaches a host culling DETACHED, reads it, and does not re-run the painter', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    // Visit it, then leave: now it exists but is parked off-document.
    diagram.viewport.pan(40000, 0);
    diagram.renderNow();
    diagram.viewport.pan(-40000, 0);
    diagram.renderNow();
    expect(hostOf('far')).toBeNull();
    expect(painted).toEqual(['near', 'far']);

    const { svg } = diagram.exportSvgString();

    expect(svg).toContain(sentinel('far'));
    expect(painted).toEqual(['near', 'far']); // mount-once: NOT painted a second time
  });

  // ---- non-destructiveness ------------------------------------------------

  it('leaves the document exactly as it found it', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const before = mountedHosts();
    const { svg } = diagram.exportSvgString();

    // Both halves in one test on purpose: "nothing changed" is trivially true of an
    // export that did nothing, so it only means something next to the proof that the
    // export DID materialize the far widget.
    expect(svg).toContain(sentinel('far'));
    expect(mountedHosts()).toBe(before);
    expect(hostOf('far')).toBeNull(); // re-culled, not left inflating the DOM
  });

  it('does not inflate a 200-widget board — the count is the same after as before', () => {
    const nodes = [];
    for (let i = 0; i < 200; i++) {
      nodes.push(W(`w${i}`, (i % 10) * 400, Math.floor(i / 10) * 300));
    }
    diagram = createDiagram(container, {
      nodes,
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const before = mountedHosts();
    expect(before).toBeLessThan(20);

    const { svg } = diagram.exportSvgString();

    // Every one of the 200 is in the file…
    expect((svg.match(/SENTINEL~/g) || []).length).toBe(200);
    // …and the document is the size it was. This is the difference between a fix and
    // a second bug: an export must not permanently mount a board.
    expect(mountedHosts()).toBe(before);
  });

  it('keeps mount-once across the export: the camera later finds the SAME element', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();
    diagram.exportSvgString();

    const materialized = elements.get('far')!;
    diagram.viewport.pan(40000, 0);
    diagram.renderNow();

    expect(hostOf('far')).toBe(materialized); // parked, then handed back
    expect(painted).toEqual(['near', 'far']); // and never painted twice
  });

  // ---- the governing invariant -------------------------------------------
  //
  // `cullCustomNodes` is a PERFORMANCE knob. If turning it on changes what comes out of
  // export(), it is not a performance knob, it is a data-loss switch. This is the
  // strongest statement of the fix available, and nothing partial can fake it.

  it('produces the IDENTICAL file whether culling is on or off', () => {
    const boardOf = (cull: boolean): string => {
      const host = makeContainer();
      const d = createDiagram(host, {
        nodes: [W('a', 0, 0), W('b', 4000, 0), W('c', 40000, 900)],
        renderCustomNode: painter,
        cullCustomNodes: cull,
      });
      d.renderNow();
      const { svg } = d.exportSvgString();
      d.dispose();
      host.remove();
      // The instance id is a mount-time CSS scope, not content: two mounts of the same
      // board legitimately differ there and nowhere else.
      return svg.replace(/grafloria-\d+/g, 'grafloria-N');
    };

    expect(boardOf(true)).toBe(boardOf(false));
  });

  // ---- the default path is untouched -------------------------------------

  it('captures a widget whose first frame has not run yet, and leaves it mounted', () => {
    diagram = createDiagram(container, { nodes: [], renderCustomNode: painter });
    diagram.setNodes([W('fresh', 0, 0)]); // schedules a frame; does not run one
    expect(painted).toEqual([]);
    expect(mountedHosts()).toBe(0);

    const { svg } = diagram.exportSvgString();

    expect(svg).toContain(sentinel('fresh'));
    expect(painted).toEqual(['fresh']);
    // LEFT MOUNTED, deliberately. With no culler there is no culled state to put it back
    // into, and the documented default is that every custom host lives permanently in the
    // document — so this is exactly the state the pending frame would have produced.
    // Detaching it instead would make an export DELETE a widget from an uncculled board.
    expect(mountedHosts()).toBe(1);
  });

  it('mounts nothing and paints nothing extra when culling is off', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
    });
    diagram.renderNow();

    const before = mountedHosts();
    const calls = painted.length;
    diagram.exportSvgString();

    expect(mountedHosts()).toBe(before);
    expect(painted.length).toBe(calls);
  });

  // ---- the other cull mode -----------------------------------------------
  //
  // `'destroy'` exists to BOUND THE HEAP, so an export that left its materialized hosts
  // retained would defeat the mode outright. It therefore tears down exactly what it
  // built — the same balanced mount/unmount a pan across the board produces, which is a
  // lifecycle a `'destroy'` embedder has already accepted (its painter re-runs by
  // design). Hosts that were already mounted are not touched.

  it("mode 'destroy': captures a never-visited widget, then destroys what it built", () => {
    const removeCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      removeCustomNode,
      cullCustomNodes: { mode: 'destroy' },
    });
    diagram.renderNow();
    expect(painted).toEqual(['near']);

    const before = mountedHosts();
    const { svg } = diagram.exportSvgString();

    expect(svg).toContain(sentinel('far'));
    expect(removeCustomNode).toHaveBeenCalledTimes(1);
    expect(removeCustomNode).toHaveBeenCalledWith('far', expect.any(HTMLElement));
    expect(mountedHosts()).toBe(before);
    expect(hostOf('far')).toBeNull();
  });

  it("mode 'destroy': the heap is restored too — a later visit re-creates the host", () => {
    diagram = createDiagram(container, {
      nodes: [W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: { mode: 'destroy' },
    });
    diagram.renderNow();
    diagram.exportSvgString();
    expect(painted).toEqual(['far']);
    // Grab it now: the next paint overwrites the ledger entry with its replacement.
    const materialized = elements.get('far')!;

    diagram.viewport.pan(40000, 0);
    diagram.renderNow();

    // Re-initialised, which is what this mode already documents as its cost.
    expect(painted).toEqual(['far', 'far']);
    expect(hostOf('far')).not.toBe(materialized);
  });

  // ---- what it must NOT overrule -----------------------------------------

  it('honours an explicit ViewLifecycle freeze — a frozen node has no view anywhere', () => {
    const lifecycle = new ViewLifecycle();
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
      viewLifecycle: lifecycle,
    });
    diagram.renderNow();
    lifecycle.freeze('node', 'far');

    const { svg } = diagram.exportSvgString();

    // The render pass drops a frozen entity (ViewLifecycle.admits), so capturing its
    // widget would put content in the file with no node under it — and stretch the
    // viewBox to reach a node the very same export does not draw.
    expect(svg).not.toContain(sentinel('far'));
    expect(painted).toEqual(['near']);
  });

  // ---- a painter that throws on its FIRST mount --------------------------
  //
  // The export path is the one place a widget's painter can be invoked by something
  // other than a frame, so it is the one place a painter that throws could take an
  // export down — and strand every host mounted before it. It degrades the way every
  // unreadable host already does: a marked box and a warning.

  it('survives a widget painter that throws, and still restores the document', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('bad', 40000, 0), W('good', 40400, 0)],
      renderCustomNode: (node, el) => {
        if (node.id === 'bad') throw new Error('widget blew up on mount');
        painter(node, el);
      },
      cullCustomNodes: true,
    });
    diagram.renderNow();
    const before = mountedHosts();

    const { svg, warnings } = diagram.exportSvgString();

    expect(svg).toContain(sentinel('good')); // the export completed past the thrower
    expect(warnings.some((w) => w.includes('bad'))).toBe(true); // and said so
    expect(svg).toContain('grafloria-custom-node-placeholder');
    expect(mountedHosts()).toBe(before); // nothing stranded
  });

  it("a caller's own customNodes still opts out completely — nothing is mounted", () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const { svg } = diagram.exportSvgString({ customNodes: [] });

    expect(svg).not.toContain('grafloria-custom-node');
    expect(painted).toEqual(['near']);
  });

  // ---- proportionality ----------------------------------------------------

  it('mounts only what a SCOPED export will actually contain', () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('wanted', 40000, 0), W('unwanted', 80000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const { svg } = diagram.exportSvgString({ includeIds: ['near', 'wanted'] });

    expect(svg).toContain(sentinel('wanted'));
    // Exporting three widgets out of a board must not mount the board.
    expect(painted).toEqual(['near', 'wanted']);
  });

  it("scope 'selection' mounts only the selected widgets", () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('picked', 40000, 0), W('other', 80000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();
    diagram.getModel().getNodes().find((n) => n.id === 'picked')!.setSelected(true);

    const { svg } = diagram.exportSvgString({ scope: 'selection' });

    expect(svg).toContain(sentinel('picked'));
    expect(painted).toEqual(['near', 'picked']);
  });

  // ---- every export target, not just the SVG string -----------------------

  it('reaches exportPdf on the same path', () => {
    diagram = createDiagram(container, {
      nodes: [W('far', 40000, 0)],
      renderCustomNode: painter,
      cullCustomNodes: true,
    });
    diagram.renderNow();
    expect(painted).toEqual([]);

    const { warnings } = diagram.exportPdf();

    expect(painted).toEqual(['far']);
    expect(warnings.some((w) => w.includes('far'))).toBe(false);
    expect(hostOf('far')).toBeNull();
  });
});
