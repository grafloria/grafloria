// ASYNC CUSTOM-NODE PAINTERS — the last documented limit of widget export.
//
// THE GAP
// -------
// `exportSvgString()` is synchronous by contract, so a first mount is painted and read
// in the same tick. A `renderCustomNode` that DEFERS its drawing — to a rAF, a fetch, a
// framework's async render, a web font — has not drawn when the capture reads it, so the
// widget came out as a marked box. Honest, but still blank in the customer's PDF.
//
// THE MECHANISM UNDER TEST
// ------------------------
// `renderCustomNode` may RETURN a promise. That is a signal the painter's author owns
// and can be typed, and it is exact: the capture waits for that promise and for nothing
// else — no polling, no fixed sleep. `export()` already returns `Promise<string>`, so it
// is the async path and there is no new entry point.
//
// WHAT EVERY TEST HERE HAS TO SURVIVE
// -----------------------------------
// "the file contains widget text" is a weak tooth: it is green whenever ANY widget
// contributed the string. So each assertion is scoped to a per-node SENTINEL only that
// node's painter can produce, and — where it matters — paired with the same export taken
// SYNCHRONOUSLY at the same moment, which must NOT contain it. A test that passes with
// the await deleted is not a test.

import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeModel } from '@grafloria/engine';
import { HTML_LAYER_CLASS } from './layers';

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

/**
 * A laid-out box — but ONLY while the element is in the document.
 *
 * Load-bearing, not decoration: a real browser gives a detached subtree no layout box at
 * all, so every rect reads zero. jsdom has no layout engine either way, so a fake that
 * reported 200x120 unconditionally would let a DETACHED host capture perfectly — and the
 * tests below for "the host survived a frame that tried to cull it" would pass with the
 * bug fully present. That exact weak tooth has already been caught once in this subsystem.
 */
const box = (el: { isConnected: boolean }, w: number, h: number) => () =>
  (el.isConnected
    ? { left: 0, top: 0, width: w, height: h, right: w, bottom: h }
    : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) as DOMRect;

const W = (id: string, x: number, y: number) => ({
  id,
  position: { x, y },
  size: { width: 200, height: 120 },
  custom: true,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('custom-node export — an ASYNC renderCustomNode', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  /** Every `renderCustomNode` call, in order — the mount ledger. */
  let painted: string[];

  /** The sentinel a node's widget paints. Unique per node, by construction. */
  const sentinel = (id: string) => `SENTINEL~${id}`;

  const hostOf = (id: string) =>
    container.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
  const mountedHosts = () =>
    container.querySelectorAll(`.${HTML_LAYER_CLASS} > .grafloria-node-host`).length;

  /**
   * Put the node's sentinel in the host and state its geometry — jsdom measures nothing,
   * so without the stated rects `capture-host` transcribes no `<text>` and "did the
   * content reach the file?" would be unanswerable, which is the only question here.
   */
  const draw = (id: string, el: HTMLElement): void => {
    const inner = el.ownerDocument.createElement('div');
    inner.textContent = sentinel(id);
    el.appendChild(inner);
    el.getBoundingClientRect = box(el, 200, 120);
    inner.getBoundingClientRect = box(inner, 200, 40);
  };

  /** Paints inline, returns nothing. The painter every existing test uses. */
  const syncPainter = (node: NodeModel, el: HTMLElement): void => {
    painted.push(node.id);
    draw(node.id, el);
  };

  /** Paints only after `ms`, and SAYS SO by returning the promise. The subject. */
  const timerPainter =
    (ms: number) =>
    (node: NodeModel, el: HTMLElement): Promise<void> => {
      painted.push(node.id);
      return sleep(ms).then(() => draw(node.id, el));
    };

  /** Returns a promise that never settles, and never draws. The bound's subject. */
  const neverPainter = (node: NodeModel, _el: HTMLElement): Promise<void> => {
    painted.push(node.id);
    return new Promise<void>(() => undefined);
  };

  beforeEach(() => {
    container = makeContainer();
    painted = [];
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  // =========================================================================
  // THE BUG
  // =========================================================================

  it('exports the content of a widget that draws on a later tick', async () => {
    diagram = createDiagram(container, {
      nodes: [W('slow', 0, 0)],
      renderCustomNode: timerPainter(20),
    });

    // THE PRECONDITION, and the whole point. Taken right now, synchronously, the host is
    // still blank — so an `export()` that did not wait would produce exactly this.
    expect(diagram.exportSvgString().svg).not.toContain(sentinel('slow'));

    const svg = await diagram.export('svg');

    expect(svg).toContain(sentinel('slow'));
    expect(svg).toContain('<g class="grafloria-custom-node" data-node-id="slow"');
    // Naming the group matters: "no placeholder" alone is green when the widget
    // produced NOTHING AT ALL, which is precisely the bug.
    expect(svg).not.toContain('grafloria-custom-node-placeholder');
  });

  it('reports NO custom-node warning once the painter has been waited for', async () => {
    diagram = createDiagram(container, {
      nodes: [W('slow', 0, 0)],
      renderCustomNode: timerPainter(20),
    });

    const seen: string[] = [];
    await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(seen.filter((w) => w.includes('custom node'))).toEqual([]);
  });

  it('a widget that had not drawn is still real geometry — the box reaches it', async () => {
    diagram = createDiagram(container, {
      nodes: [W('slow', 0, 0), W('later', 4000, 0)],
      renderCustomNode: timerPainter(20),
    });

    const svg = await diagram.export('svg', { padding: 0 });
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1].split(' ').map(Number) ?? [];

    // 4200 is `later`'s right edge. A placeholder box would reach it too — so the
    // sentinel is asserted alongside, which a blank capture could never produce.
    expect(viewBox[2]).toBeCloseTo(4200, 0);
    expect(svg).toContain(sentinel('later'));
  }, 10000);

  // The two halves of the feature meet here: a host culling never mounted, whose painter
  // is ALSO async. The painter's very first run happens inside the export.
  it('waits for a widget the camera has NEVER visited, mounted by the export itself', async () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: timerPainter(20),
      cullCustomNodes: true,
    });
    diagram.renderNow();

    expect(painted).toEqual(['near']); // its painter has never run
    expect(hostOf('far')).toBeNull(); // and it has no host at all

    const svg = await diagram.export('svg');

    expect(svg).toContain(sentinel('far'));
    expect(painted).toEqual(['near', 'far']);
  });

  // =========================================================================
  // THE SYNCHRONOUS PATH IS UNCHANGED — and now says why it is blank
  // =========================================================================

  it('an all-sync board exports IDENTICALLY through exportSvgString() and export()', async () => {
    diagram = createDiagram(container, {
      nodes: [W('a', 0, 0), W('b', 300, 0)],
      renderCustomNode: syncPainter,
    });

    const sync = diagram.exportSvgString().svg;
    const asynchronous = await diagram.export('svg');

    expect(asynchronous).toBe(sync);
    expect(sync).toContain(sentinel('a'));
  });

  it('exportSvgString() stays synchronous and names the async painter as the reason', () => {
    diagram = createDiagram(container, {
      nodes: [W('never', 0, 0)],
      renderCustomNode: neverPainter,
    });

    const { svg, warnings } = diagram.exportSvgString();

    expect(svg).toContain('grafloria-custom-node-placeholder');
    // The generic "empty box" warning already names the node, so THAT would be green with
    // this feature deleted. The async-specific sentence is what has teeth.
    expect(warnings.some((w) => w.includes('"never"') && /still painting/i.test(w))).toBe(true);
  });

  it('exportPdf() stays synchronous and reports the same reason', () => {
    diagram = createDiagram(container, {
      nodes: [W('never', 0, 0)],
      renderCustomNode: neverPainter,
    });

    const { warnings } = diagram.exportPdf();

    expect(warnings.some((w) => w.includes('"never"') && /still painting/i.test(w))).toBe(true);
  });

  // =========================================================================
  // THE BOUND — a painter that never settles must not hang an export
  // =========================================================================

  it('a painter that never settles cannot hang an export, and is reported', async () => {
    diagram = createDiagram(container, {
      nodes: [W('never', 0, 0)],
      renderCustomNode: neverPainter,
    });

    const seen: string[] = [];
    const started = Date.now();
    const svg = await diagram.export('svg', {
      customNodeTimeout: 25,
      onWarnings: (w) => seen.push(...w),
    });

    expect(Date.now() - started).toBeLessThan(2000);
    expect(svg).toContain('grafloria-custom-node-placeholder');
    expect(seen.some((w) => w.includes('"never"') && w.includes('did not finish painting'))).toBe(
      true
    );
    expect(seen.some((w) => w.includes('25ms'))).toBe(true);
  }, 5000);

  // The deadline BOUNDS the wait; it never decides that the painter is done. If it did,
  // this export would take the full 5s default rather than the painter's 20ms.
  it('returns as soon as the painter settles, not when the deadline expires', async () => {
    diagram = createDiagram(container, {
      nodes: [W('slow', 0, 0)],
      renderCustomNode: timerPainter(20),
    });

    const started = Date.now();
    const svg = await diagram.export('svg', { customNodeTimeout: 5000 });

    expect(svg).toContain(sentinel('slow'));
    expect(Date.now() - started).toBeLessThan(1000);
  }, 10000);

  it('a painter that misses the deadline still contributes what it HAD drawn, with a warning', async () => {
    diagram = createDiagram(container, {
      nodes: [W('partial', 0, 0)],
      renderCustomNode: (node: NodeModel, el: HTMLElement) => {
        painted.push(node.id);
        draw(node.id, el); // the first half lands inline…
        return new Promise<void>(() => undefined); // …the rest never arrives
      },
    });

    const seen: string[] = [];
    const svg = await diagram.export('svg', {
      customNodeTimeout: 25,
      onWarnings: (w) => seen.push(...w),
    });

    expect(svg).toContain(sentinel('partial')); // not dropped
    expect(seen.some((w) => w.includes('"partial"') && w.includes('did not finish painting'))).toBe(
      true
    );
  }, 5000);

  it("a caller's own customNodes short-circuits the wait entirely", async () => {
    diagram = createDiagram(container, {
      nodes: [W('never', 0, 0)],
      renderCustomNode: neverPainter,
    });

    const started = Date.now();
    const svg = await diagram.export('svg', { customNodes: [] });

    // With no short-circuit this would sit out the full default deadline.
    expect(Date.now() - started).toBeLessThan(1000);
    expect(svg).not.toContain('grafloria-custom-node');
  }, 10000);

  // =========================================================================
  // A PAINTER THAT REJECTS
  // =========================================================================

  it('a painter whose promise REJECTS does not abort the export, and is reported', async () => {
    diagram = createDiagram(container, {
      nodes: [W('good', 0, 0), W('boom', 300, 0)],
      renderCustomNode: (node: NodeModel, el: HTMLElement) => {
        painted.push(node.id);
        if (node.id === 'boom') return sleep(5).then(() => Promise.reject(new Error('fetch died')));
        return sleep(5).then(() => draw(node.id, el));
      },
    });

    const before = mountedHosts();
    const seen: string[] = [];
    const svg = await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(svg).toContain(sentinel('good')); // the export completed past the rejection
    expect(seen.some((w) => w.includes('"boom"') && /rejected/i.test(w))).toBe(true);
    expect(seen.some((w) => w.includes('fetch died'))).toBe(true);
    expect(mountedHosts()).toBe(before); // nothing stranded
  }, 10000);

  it('a painter that THROWS synchronously still lets the async export finish', async () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('bad', 40000, 0), W('good', 40400, 0)],
      renderCustomNode: (node: NodeModel, el: HTMLElement) => {
        if (node.id === 'bad') throw new Error('widget blew up on mount');
        return timerPainter(10)(node, el);
      },
      cullCustomNodes: true,
    });
    diagram.renderNow();
    const before = mountedHosts();

    const seen: string[] = [];
    const svg = await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(svg).toContain(sentinel('good'));
    expect(seen.some((w) => w.includes('"bad"'))).toBe(true);
    expect(mountedHosts()).toBe(before);
  }, 10000);

  // =========================================================================
  // THE STANDING GUARANTEES — they must survive an await
  // =========================================================================

  it('is non-destructive: the document is the size it was, on a culled board', async () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: timerPainter(15),
      cullCustomNodes: true,
    });
    diagram.renderNow();
    const before = mountedHosts();

    const svg = await diagram.export('svg');

    // Both halves in one test on purpose: "nothing changed" is trivially true of an
    // export that did nothing, so it only means something beside the proof that the
    // export DID materialize and wait for the far widget.
    expect(svg).toContain(sentinel('far'));
    expect(mountedHosts()).toBe(before);
    expect(hostOf('far')).toBeNull();
  }, 10000);

  it('keeps mount-once: three exports, one paint per widget', async () => {
    diagram = createDiagram(container, {
      nodes: [W('slow', 0, 0)],
      renderCustomNode: timerPainter(10),
    });

    diagram.exportSvgString();
    await diagram.export('svg');
    await diagram.export('svg');

    expect(painted).toEqual(['slow']);
  }, 10000);

  // A rAF-driven painter means real frames run WHILE we wait. Culling must not remove the
  // host the capture is holding open — without that, an animated pan during an export
  // silently empties the widget it was exporting.
  it('a frame during the wait must not cull the host out from under the capture', async () => {
    diagram = createDiagram(container, {
      nodes: [W('here', 0, 0)],
      renderCustomNode: timerPainter(40),
      cullCustomNodes: true,
    });
    diagram.renderNow();
    expect(painted).toEqual(['here']);

    const pending = diagram.export('svg');
    await sleep(5); // the capture has started and is waiting

    diagram.viewport.pan(40000, 0); // the camera leaves — exactly what an animated pan does
    diagram.renderNow();

    const svg = await pending;

    expect(svg).toContain(sentinel('here'));
  }, 10000);

  it("mode 'destroy': a frame during the wait must not tear the host down twice", async () => {
    const removeCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [W('far', 40000, 0)],
      renderCustomNode: timerPainter(40),
      removeCustomNode,
      cullCustomNodes: { mode: 'destroy' },
    });
    diagram.renderNow();
    expect(painted).toEqual([]);

    const pending = diagram.export('svg');
    await sleep(5);
    diagram.renderNow(); // a frame while we wait

    const svg = await pending;

    expect(svg).toContain(sentinel('far'));
    // Exactly once: the export tears down exactly what it built, and the frame in the
    // middle must not have got there first (which would ALSO have emptied the file).
    expect(removeCustomNode).toHaveBeenCalledTimes(1);
    expect(hostOf('far')).toBeNull();
  }, 10000);

  // The one thing a pin must NOT block: a widget that genuinely left the board. The frame's
  // teardown loop is right to fire, and the export's own undo must then keep its hands off
  // — firing again would dispose an embedder's component (a React root, a chart instance) a
  // second time, on an element it has already been told is dead.
  it("mode 'destroy': a widget deleted mid-wait is torn down once, by the frame", async () => {
    const removeCustomNode = jest.fn();
    diagram = createDiagram(container, {
      nodes: [W('far', 40000, 0)],
      renderCustomNode: timerPainter(40),
      removeCustomNode,
      cullCustomNodes: { mode: 'destroy' },
    });
    diagram.renderNow();
    expect(painted).toEqual([]);

    const pending = diagram.export('svg');
    await sleep(5); // the export has mounted 'far' and is waiting for its painter
    diagram.setNodes([]); // …and the widget leaves the board while it waits
    diagram.renderNow();
    await pending;

    expect(removeCustomNode).toHaveBeenCalledTimes(1);
  }, 10000);

  it('honours an explicit customNodes opt-out even mid-flight, and never mounts', async () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: timerPainter(10),
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const svg = await diagram.export('svg', { customNodes: [] });

    expect(svg).not.toContain('grafloria-custom-node');
    expect(painted).toEqual(['near']);
  }, 10000);

  it('mounts only what a SCOPED export will contain, and waits only for those', async () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('wanted', 40000, 0), W('unwanted', 80000, 0)],
      renderCustomNode: timerPainter(10),
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const svg = await diagram.export('svg', { includeIds: ['near', 'wanted'] });

    expect(svg).toContain(sentinel('wanted'));
    expect(painted).toEqual(['near', 'wanted']);
  }, 10000);

  it('two exports in flight at once both come back complete', async () => {
    diagram = createDiagram(container, {
      nodes: [W('near', 0, 0), W('far', 40000, 0)],
      renderCustomNode: timerPainter(15),
      cullCustomNodes: true,
    });
    diagram.renderNow();
    const before = mountedHosts();

    const [a, b] = await Promise.all([diagram.export('svg'), diagram.export('svg')]);

    expect(a).toContain(sentinel('far'));
    expect(b).toContain(sentinel('far'));
    expect(mountedHosts()).toBe(before);
    expect(painted).toEqual(['near', 'far']); // and still painted once
  }, 10000);

  it('reaches the raster and pdf targets on the same path', async () => {
    diagram = createDiagram(container, {
      nodes: [W('slow', 0, 0)],
      renderCustomNode: timerPainter(15),
      cullCustomNodes: true,
    });
    diagram.renderNow();

    const seen: string[] = [];
    const url = await diagram.export('pdf', { onWarnings: (w) => seen.push(...w) });

    expect(url.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(seen.filter((w) => w.includes('custom node'))).toEqual([]);
  }, 10000);
});
