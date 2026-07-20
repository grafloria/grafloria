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

import { createDiagram } from '../instance/create-diagram';
import type { DiagramInstance } from '../instance/create-diagram';
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
